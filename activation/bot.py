"""
Discord Bot - ChatGPT Activation Bot
既存アカウントのサブスクリプション有効化・キャンセル
"""
import asyncio
import logging
import sys
from datetime import datetime
from typing import Optional, Dict

import discord
from discord.ext import commands
from discord import app_commands

# 親ディレクトリのモジュールをインポート
from browser_automation import BrowserAutomation
from activation.mail_tm_extended import MailTMClientExtended
from activation.chatgpt_manager import ChatGPTManager, ActivationResult
from activation import config

# ログ設定
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format=config.LOG_FORMAT,
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("activation_bot.log", encoding="utf-8")
    ]
)
logger = logging.getLogger(__name__)

# Discord Bot設定
intents = discord.Intents.default()
intents.message_content = True
intents.dm_messages = True

bot = commands.Bot(
    command_prefix="!",
    intents=intents,
    help_command=None
)

# グローバル状態
active_sessions: Dict[int, 'UserSession'] = {}


class UserSession:
    """ユーザーセッション"""
    def __init__(self, user_id: int, channel: discord.TextChannel):
        self.user_id = user_id
        self.channel = channel
        self.browser: Optional[BrowserAutomation] = None
        self.mail_client: Optional[MailTMClientExtended] = None
        self.waiting_for_input = False
        self.input_future: Optional[asyncio.Future] = None
        self.input_prompt: Optional[str] = None
        self.paypal_logged_in = False  # PayPalログイン状態を保持
        
    async def start_browser(self) -> bool:
        """ブラウザを起動"""
        try:
            if self.browser is None:
                self.browser = BrowserAutomation()
                await self.browser.start()
                logger.info("新規ブラウザセッションを開始しました")
            return True
        except Exception as e:
            logger.error(f"ブラウザ起動エラー: {e}")
            return False
    
    async def stop_browser(self) -> None:
        """ブラウザを停止"""
        if self.browser:
            await self.browser.stop()
            self.browser = None
            self.paypal_logged_in = False  # ブラウザ停止時にリセット
    
    async def wait_for_user_response(self, prompt: str, timeout: int = 300) -> Optional[str]:
        """ユーザーの応答を待機"""
        self.waiting_for_input = True
        self.input_prompt = prompt
        self.input_future = asyncio.Future()
        
        await self.channel.send(f"⏳ {prompt}\n*タイムアウト: {timeout}秒*")
        
        try:
            result = await asyncio.wait_for(self.input_future, timeout=timeout)
            return result
        except asyncio.TimeoutError:
            await self.channel.send("⏰ タイムアウトしました。")
            return None
        finally:
            self.waiting_for_input = False
            self.input_future = None
            self.input_prompt = None


@bot.event
async def on_ready():
    """Bot準備完了時"""
    logger.info(f"Activation Botがログインしました: {bot.user.name} ({bot.user.id})")
    print(f"✅ Activation Botが起動しました: {bot.user.name}")
    print(f"コマンド: スラッシュコマンド (/activate など)")
    
    # スラッシュコマンドを同期
    try:
        synced = await bot.tree.sync()
        logger.info(f"スラッシュコマンドを同期しました: {len(synced)}個")
        print(f"📝 スラッシュコマンド同期: {len(synced)}個")
    except Exception as e:
        logger.error(f"スラッシュコマンド同期エラー: {e}")
    
    await bot.change_presence(
        activity=discord.Activity(
            type=discord.ActivityType.watching,
            name="/activate"
        )
    )


@bot.event
async def on_message(message: discord.Message):
    """メッセージ受信時"""
    if message.author.bot:
        return
    
    user_id = message.author.id
    
    # アクティブセッションで入力待機中の場合
    if user_id in active_sessions:
        session = active_sessions[user_id]
        if session.waiting_for_input and session.input_future:
            if not session.input_future.done():
                session.input_future.set_result(message.content)
                await message.add_reaction("✅")
                return
    
    await bot.process_commands(message)


@bot.tree.command(name="activation", description="既存のChatGPTアカウントでサブスクリプションを有効化・キャンセルします")
@app_commands.describe(
    email="ChatGPTアカウントのメールアドレス",
    password="mail.tmアカウントのパスワード（検証コード取得用）"
)
async def activation_command(interaction: discord.Interaction, email: str, password: str):
    """
    /activation スラッシュコマンド
    既存アカウントでサブスクリプションを有効化してキャンセル
    """
    user_id = interaction.user.id
    
    # 既存セッションチェック
    if user_id in active_sessions:
        await interaction.response.send_message("⚠️ 既にプロセスが進行中です。", ephemeral=True)
        return
    
    # 応答を遅延
    await interaction.response.defer(thinking=True)
    
    # 新規セッション作成
    session = UserSession(user_id, interaction.channel)
    active_sessions[user_id] = session
    
    # 開始メッセージ
    embed = discord.Embed(
        title="🚀 ChatGPTサブスクリプション有効化・キャンセル",
        description="プロセスを開始します...",
        color=discord.Color.blue(),
        timestamp=datetime.now()
    )
    embed.add_field(
        name="対象アカウント",
        value=f"`{email}`",
        inline=False
    )
    embed.add_field(
        name="ステップ",
        value="1. ブラウザ起動\n2. ChatGPTログイン\n3. 検証コード取得\n4. サブスクリプション有効化\n5. サブスクリプションキャンセル",
        inline=False
    )
    await interaction.followup.send(embed=embed)
    
    try:
        # 1. VPN接続確認（リアクション待機）
        vpn_embed = discord.Embed(
            title="🔌 VPN接続確認",
            description=f"**{config.VPN_COUNTRY}** にVPN接続してください。\n\n接続が完了したら、下の ✅ を押してください。",
            color=discord.Color.orange()
        )
        vpn_message = await interaction.followup.send(embed=vpn_embed)
        await vpn_message.add_reaction("✅")
        
        def check(reaction, user):
            return (
                user.id == user_id 
                and str(reaction.emoji) == "✅" 
                and reaction.message.id == vpn_message.id
            )
        
        try:
            reaction, user = await bot.wait_for(
                "reaction_add", 
                timeout=300.0,
                check=check
            )
            await interaction.followup.send("✅ VPN接続を確認しました。処理を続行します...")
            await asyncio.sleep(2)
        except asyncio.TimeoutError:
            if user_id in active_sessions:
                del active_sessions[user_id]
            await interaction.followup.send("⏰ タイムアウトしました。もう一度 `/activate` からやり直してください。")
            return
        
        # 2. ブラウザ起動
        await interaction.followup.send("🌐 ブラウザを起動中...")
        if not await session.start_browser():
            await interaction.followup.send("❌ ブラウザの起動に失敗しました。")
            return
        
        await interaction.followup.send("✅ ブラウザを起動しました")
        
        # 3. mail.tmクライアント作成
        session.mail_client = MailTMClientExtended()
        
        # 既存アカウントでログイン（検証コード取得用）
        await interaction.followup.send(f"📧 mail.tmにログイン中...")
        try:
            # mail.tmにログインしてアカウントを設定
            login_result = session.mail_client.login_account(email, password)
            if login_result:
                logger.info(f"mail.tmログイン成功: {email}")
                await interaction.followup.send("✅ mail.tmにログインしました")
            else:
                logger.warning(f"mail.tmログイン失敗: {email}")
                await interaction.followup.send("⚠️ mail.tmログインに失敗しました。新規作成を試みます...")
                # ログイン失敗時は新規作成
                account = session.mail_client.create_account()
                await interaction.followup.send(f"⚠️ 新規アカウントを作成しました: `{account['email']}`\n元のアカウントの検証コードは手動で入力してください。")
        except Exception as e:
            logger.warning(f"mail.tmログインエラー: {e}")
        
        # 4. アクティベーション処理
        manager = ChatGPTManager(
            browser=session.browser,
            mail_client=session.mail_client,
            wait_for_user_input=session.wait_for_user_response,
        )
        
        await interaction.followup.send("🔄 サブスクリプション有効化・キャンセルプロセスを開始します...")
        result = await manager.activate_and_cancel_subscription(email, password)
        
        # 結果表示
        if result.success:
            success_embed = discord.Embed(
                title="✅ 処理完了！",
                description=result.message,
                color=discord.Color.green(),
                timestamp=datetime.now()
            )
            await interaction.followup.send(embed=success_embed)
        else:
            error_embed = discord.Embed(
                title="❌ 処理失敗",
                description=f"エラー: {result.error}",
                color=discord.Color.red(),
                timestamp=datetime.now()
            )
            await interaction.followup.send(embed=error_embed)
        
    except Exception as e:
        logger.exception("アクティベーションコマンドでエラー")
        await interaction.followup.send(f"❌ エラーが発生しました: {str(e)}")
    
    finally:
        if 'manager' in locals():
            await interaction.followup.send("🏁 プロセスを終了しました。（ブラウザセッションを維持）")


@bot.tree.command(name="paypal", description="PayPalにログインします（手動入力後、自動でログイン）")
async def paypal_login_command(interaction: discord.Interaction):
    """
    /paypal スラッシュコマンド
    PayPalログイン（手動入力→自動ログイン）
    """
    user_id = interaction.user.id
    
    # 応答を遅延
    await interaction.response.defer(thinking=True)
    
    # セッション取得または作成
    if user_id not in active_sessions:
        session = UserSession(user_id, interaction.channel)
        active_sessions[user_id] = session
    else:
        session = active_sessions[user_id]
    
    try:
        # ブラウザ起動
        await interaction.followup.send("🌐 ブラウザを起動中...")
        if not await session.start_browser():
            await interaction.followup.send("❌ ブラウザの起動に失敗しました。")
            return
        
        await interaction.followup.send("✅ ブラウザを起動しました")
        
        # PayPalログインページを開く
        await interaction.followup.send("🔌 PayPalログインページを開いています...")
        await session.browser.navigate_to("https://www.paypal.com/signin")
        
        # ユーザーに手動入力を依頼
        embed = discord.Embed(
            title="🔐 PayPalログイン",
            description="**手動で以下の情報を入力してください：**\n\n1. メールアドレス\n2. パスワード（または「Try another way」→パスワード）\n\n入力が完了したら、下の ✅ を押してください。",
            color=discord.Color.blue()
        )
        embed.add_field(
            name="注意",
            value="入力後は必ずこのメッセージの ✅ を押してください。\n自動でログインボタンが押されます。",
            inline=False
        )
        login_msg = await interaction.followup.send(embed=embed)
        await login_msg.add_reaction("✅")
        
        # リアクションを待機
        def check(reaction, user):
            return (
                user.id == user_id 
                and str(reaction.emoji) == "✅" 
                and reaction.message.id == login_msg.id
            )
        
        try:
            reaction, user = await bot.wait_for(
                "reaction_add", 
                timeout=300.0,
                check=check
            )
        except asyncio.TimeoutError:
            await interaction.followup.send("⏰ タイムアウトしました。")
            return
        
        # 自動でログインボタンをクリック
        await interaction.followup.send("🤖 ログインボタンを自動で押します...")
        
        # 複数の可能性のあるセレクタを試す
        login_selectors = [
            'button[id*="btnLogin"]',
            'button[type="submit"]',
            'button:has-text("Log In")',
            'button:has-text("ログイン")',
            '#login',
            'button[name="login"]'
        ]
        
        clicked = False
        for selector in login_selectors:
            try:
                await session.browser.click_element(selector, by="css", wait_until_found=False)
                clicked = True
                logger.info(f"ログインボタンをクリックしました: {selector}")
                break
            except:
                continue
        
        if clicked:
            await interaction.followup.send("✅ ログインボタンを押しました。\nログインが完了するまでお待ちください...")
            await asyncio.sleep(5)
            
            # ログイン状態を保存
            session.paypal_logged_in = True
            if user_id in active_sessions:
                active_sessions[user_id].paypal_logged_in = True
            
            await interaction.followup.send("✅ PayPalログイン処理を完了しました。\n次回の `/activation` ではログインがスキップされます。")
        else:
            await interaction.followup.send("⚠️ ログインボタンが見つかりませんでした。\n手動でログインボタンを押してください。")
        
    except Exception as e:
        logger.exception("PayPalログインでエラー")
        await interaction.followup.send(f"❌ エラーが発生しました: {str(e)}")


@bot.tree.command(name="cancel_activation", description="進行中のアクティベーションをキャンセルします")
async def cancel_activation_command(interaction: discord.Interaction):
    """/cancel_activation スラッシュコマンド"""
    user_id = interaction.user.id
    
    if user_id not in active_sessions:
        await interaction.response.send_message("⚠️ 進行中のプロセスはありません。", ephemeral=True)
        return
    
    session = active_sessions[user_id]
    await session.stop_browser()
    del active_sessions[user_id]
    
    await interaction.response.send_message("🛑 プロセスをキャンセルしました。")


@bot.tree.command(name="activation_status", description="Botの状態を確認します")
async def activation_status_command(interaction: discord.Interaction):
    """/activation_status スラッシュコマンド"""
    embed = discord.Embed(
        title="📊 Activation Botステータス",
        color=discord.Color.blue(),
        timestamp=datetime.now()
    )
    
    user_id = interaction.user.id
    
    # PayPalログイン状態を確認
    if user_id in active_sessions:
        paypal_status = "✅ ログイン済み" if active_sessions[user_id].paypal_logged_in else "❌ 未ログイン"
    else:
        paypal_status = "❌ セッションなし"
    
    embed.add_field(
        name="PayPalログイン状態",
        value=paypal_status,
        inline=True
    )
    
    embed.add_field(
        name="アクティブセッション",
        value=str(len(active_sessions)),
        inline=True
    )
    
    embed.add_field(
        name="ヘッドレスモード",
        value="✅ ON" if config.HEADLESS else "❌ OFF（テストモード）",
        inline=True
    )
    
    await interaction.response.send_message(embed=embed)


@bot.tree.command(name="activation_help", description="ヘルプを表示します")
async def activation_help_command(interaction: discord.Interaction):
    """/activation_help スラッシュコマンド"""
    embed = discord.Embed(
        title="📖 Activation Botコマンド一覧",
        description="ChatGPTサブスクリプション有効化・キャンセルBot",
        color=discord.Color.blue(),
        timestamp=datetime.now()
    )
    
    slash_commands = [
        ("/activation", "既存アカウントでサブスクリプションを有効化・キャンセル", "`/activation メールアドレス パスワード`"),
        ("/paypal", "PayPalにログイン（ログイン情報を維持）", "`/paypal`"),
        ("/cancel_activation", "進行中のプロセスをキャンセル", "`/cancel_activation`"),
        ("/activation_status", "Botの状態を確認", "`/activation_status`"),
        ("/activation_help", "このヘルプを表示", "`/activation_help`")
    ]
    
    for cmd, desc, usage in slash_commands:
        embed.add_field(
            name=f"{cmd}",
            value=f"{desc}\n`{usage}`",
            inline=False
        )
    
    embed.add_field(
        name="使用方法",
        value="1. `/paypal` でPayPalにログイン（一度だけ実行）\n2. `/activation メール パスワード` を実行\n3. VPN接続を確認\n4. ブラウザが開くのを待つ\n5. 検証コードが自動取得されない場合は手動入力\n6. 完了後、サブスクリプションが有効化・キャンセルされます",
        inline=False
    )
    
    await interaction.response.send_message(embed=embed)


def main():
    """メイン関数"""
    if config.DISCORD_TOKEN == "YOUR_DISCORD_BOT_TOKEN_HERE":
        print("❌ エラー: DISCORD_TOKENが設定されていません。")
        print("親ディレクトリの .env ファイルに Discord Botトークンを設定してください。")
        sys.exit(1)
    
    print("🚀 Activation Botを起動中...")
    bot.run(config.DISCORD_TOKEN)


if __name__ == "__main__":
    main()
