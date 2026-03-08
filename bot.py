"""
Discord Bot メインファイル
ChatGPT Teamサインアップ自動化Bot
"""
import asyncio
import logging
import subprocess
import sys
from pathlib import Path
from typing import Optional, List
from datetime import datetime

import discord
from discord.ext import commands
from discord import app_commands

from browser_automation import BrowserAutomation
from mail_tm_api import MailTMClient
from chatgpt_signup import ChatGPTSignupAutomation, SignupResult
import config

# ログ設定
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format=config.LOG_FORMAT,
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("bot.log", encoding="utf-8")
    ]
)
logger = logging.getLogger(__name__)

# Discord Bot設定
intents = discord.Intents.default()
intents.message_content = True
intents.dm_messages = True

bot = commands.Bot(
    command_prefix=config.COMMAND_PREFIX,
    intents=intents,
    help_command=None
)

# グローバル状態
active_sessions = {}  # ユーザーID -> セッション情報


class UserSession:
    """ユーザーセッション"""
    def __init__(self, user_id: int, channel: discord.TextChannel):
        self.user_id = user_id
        self.channel = channel
        self.browser: Optional[BrowserAutomation] = None
        self.mail_client: Optional[MailTMClient] = None
        self.waiting_for_input = False
        self.input_future: Optional[asyncio.Future] = None
        self.input_prompt: Optional[str] = None
        self.paypal_logged_in = False  # PayPalログイン状態を保持
        
    async def start_browser(self) -> bool:
        """ブラウザを起動（既存のセッションがあれば再利用）"""
        try:
            if self.browser is None:
                self.browser = BrowserAutomation()
                await self.browser.start()
                logger.info("新規ブラウザセッションを開始しました")
            else:
                logger.info("既存のブラウザセッションを再利用します")
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
        """
        ユーザーの応答を待機
        
        Args:
            prompt: プロンプトメッセージ
            timeout: タイムアウト（秒）
            
        Returns:
            ユーザーの入力またはNone
        """
        self.waiting_for_input = True
        self.input_prompt = prompt
        self.input_future = asyncio.Future()
        
        # プロンプトを送信
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
    
    async def ask_user_choice(self, question: str, choices: List[str]) -> Optional[str]:
        """
        ユーザーに選択肢を提示
        
        Args:
            question: 質問
            choices: 選択肢リスト
            
        Returns:
            選択された値またはNone
        """
        # 選択肢を番号付きで表示
        choice_text = "\n".join([f"{i+1}. {c}" for i, c in enumerate(choices)])
        prompt = f"{question}\n\n{choice_text}\n\n番号を入力してください:"
        
        response = await self.wait_for_user_response(prompt)
        
        if response:
            try:
                choice_idx = int(response.strip()) - 1
                if 0 <= choice_idx < len(choices):
                    return choices[choice_idx]
            except ValueError:
                pass
        
        return None


@bot.event
async def on_ready():
    """Bot準備完了時"""
    logger.info(f"Botがログインしました: {bot.user.name} ({bot.user.id})")
    print(f"✅ Botが起動しました: {bot.user.name}")
    print(f"コマンド: スラッシュコマンド (/generate 1, /generate 2, /paypal など)")
    
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
            name="/generate 1 | /generate 2"
        )
    )


@bot.event
async def on_message(message: discord.Message):
    """メッセージ受信時"""
    # Bot自身のメッセージは無視
    if message.author.bot:
        return
    
    # DMまたは guild メッセージを処理
    user_id = message.author.id
    
    # アクティブセッションで入力待機中の場合
    if user_id in active_sessions:
        session = active_sessions[user_id]
        if session.waiting_for_input and session.input_future:
            if not session.input_future.done():
                session.input_future.set_result(message.content)
                await message.add_reaction("✅")
                return
    
    # コマンド処理
    await bot.process_commands(message)


async def run_generate_process(interaction: discord.Interaction, mode: str = "1"):
    """
    ChatGPT Teamアカウント生成の共通処理
    
    Args:
        mode: "1" = 無料オファーあり, "2" = 無料オファーなし
    """
    user_id = interaction.user.id
    
    # 既存セッションをチェック
    if user_id in active_sessions:
        await interaction.response.send_message("⚠️ 既にサインアッププロセスが進行中です。", ephemeral=True)
        return
    
    # 応答を遅延（処理に時間がかかるため）
    await interaction.response.defer(thinking=True)
    
    # 新規セッション作成
    session = UserSession(user_id, interaction.channel)
    active_sessions[user_id] = session
    
    # 開始メッセージ
    embed = discord.Embed(
        title="🚀 ChatGPT Teamサインアップ自動化",
        description="自動化プロセスを開始します...",
        color=discord.Color.blue(),
        timestamp=datetime.now()
    )
    embed.add_field(
        name="ステップ",
        value="1. ブラウザ起動\n2. VPN接続（フランス）\n3. メールアドレス生成\n4. ChatGPTサインアップ",
        inline=False
    )
    embed.add_field(
        name="注意",
        value="このプロセスには数分かかります。\nプロンプトが表示されたら、指示に従って入力してください。",
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
        
        # チェックマークリアクションを追加
        await vpn_message.add_reaction("✅")
        
        # リアクションを待機
        def check(reaction, user):
            return (
                user.id == user_id 
                and str(reaction.emoji) == "✅" 
                and reaction.message.id == vpn_message.id
            )
        
        try:
            reaction, user = await bot.wait_for(
                "reaction_add", 
                timeout=300.0,  # 5分タイムアウト
                check=check
            )
            await interaction.followup.send("✅ VPN接続を確認しました。処理を続行します...")
            await asyncio.sleep(2)
        except asyncio.TimeoutError:
            # セッション削除
            if user_id in active_sessions:
                del active_sessions[user_id]
            await interaction.followup.send("⏰ タイムアウトしました。もう一度 `/generate 1` または `/generate 2` からやり直してください。")
            return
        
        # 2. ブラウザ起動
        await interaction.followup.send("🌐 ブラウザを起動中...")
        if not await session.start_browser():
            await interaction.followup.send("❌ ブラウザの起動に失敗しました。")
            return
        
        await interaction.followup.send("✅ ブラウザを起動しました")
        
        # 3. mail.tmクライアント作成
        session.mail_client = MailTMClient()
        
        # 3. サインアップ自動化
        signup = ChatGPTSignupAutomation(
            browser=session.browser,
            mail_client=session.mail_client,
            wait_for_user_input=session.wait_for_user_response,
            ask_user_choice=session.ask_user_choice
        )
        
        mode_text = "無料オファーあり" if mode == "1" else "無料オファーなし"
        await interaction.followup.send(f"🔄 サインアッププロセスを開始します...（モード: {mode_text}）")
        result = await signup.run_full_signup(mode=mode)
        
        # 結果表示
        if result.success:
            success_embed = discord.Embed(
                title="✅ サインアップ完了！",
                description=result.message,
                color=discord.Color.green(),
                timestamp=datetime.now()
            )
            success_embed.add_field(
                name="メールアドレス",
                value=f"`{result.email}`",
                inline=False
            )
            success_embed.add_field(
                name="パスワード",
                value=f"`{result.password}`",
                inline=False
            )
            await interaction.followup.send(embed=success_embed)
        else:
            error_embed = discord.Embed(
                title="❌ サインアップ失敗",
                description=f"エラー: {result.error}",
                color=discord.Color.red(),
                timestamp=datetime.now()
            )
            await interaction.followup.send(embed=error_embed)
        
    except Exception as e:
        logger.exception("サインアップコマンドでエラー")
        await interaction.followup.send(f"❌ エラーが発生しました: {str(e)}")
    
    finally:
        # ブラウザは停止しない（PayPalログインを維持するため）
        # セッションは保持（次回の/generateで再利用）
        
        # 処理が開始された場合のみ終了メッセージを表示
        if 'signup' in locals():
            await interaction.followup.send("🏁 プロセスを終了しました。（ブラウザセッションを維持）")


# スラッシュコマンド: /paypal
# スラッシュコマンド: /generate
@bot.tree.command(name="generate", description="ChatGPT Teamアカウントを生成します")
@app_commands.choices(mode=[
    app_commands.Choice(name="1 - 無料オファーを受け取る（従来の動作）", value="1"),
    app_commands.Choice(name="2 - 無料オファーなし（ステップ11で終了）", value="2"),
])
@app_commands.describe(mode="生成モードを選択")
async def generate_command(interaction: discord.Interaction, mode: app_commands.Choice[str]):
    """
    /generate スラッシュコマンド
    ChatGPT Teamアカウントを生成
    """
    await run_generate_process(interaction, mode.value)


# スラッシュコマンド: /paypal
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
            
            await interaction.followup.send("✅ PayPalログイン処理を完了しました。\n次回の `/generate` ではログインがスキップされます。")
        else:
            await interaction.followup.send("⚠️ ログインボタンが見つかりませんでした。\n手動でログインボタンを押してください。")
        
    except Exception as e:
        logger.exception("PayPalログインでエラー")
        await interaction.followup.send(f"❌ エラーが発生しました: {str(e)}")


# スラッシュコマンド: /generate
@bot.tree.command(name="cancel", description="進行中のサインアップをキャンセルします")
async def slash_cancel_command(interaction: discord.Interaction):
    """
    /cancel スラッシュコマンド
    """
    user_id = interaction.user.id
    
    if user_id not in active_sessions:
        await interaction.response.send_message("⚠️ 進行中のプロセスはありません。", ephemeral=True)
        return
    
    session = active_sessions[user_id]
    
    # ブラウザ停止
    await session.stop_browser()
    
    # セッション削除
    del active_sessions[user_id]
    
    await interaction.response.send_message("🛑 プロセスをキャンセルしました。")


# スラッシュコマンド: ステータス
@bot.tree.command(name="status", description="Botの状態を確認します")
async def slash_status_command(interaction: discord.Interaction):
    """
    /status スラッシュコマンド
    """
    embed = discord.Embed(
        title="📊 Botステータス",
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


# スラッシュコマンド: ヘルプ
@bot.tree.command(name="help", description="ヘルプを表示します")
async def slash_help_command(interaction: discord.Interaction):
    """
    /help スラッシュコマンド
    """
    embed = discord.Embed(
        title="📖 コマンド一覧",
        description="ChatGPT Teamサインアップ自動化Bot",
        color=discord.Color.blue(),
        timestamp=datetime.now()
    )
    
    # スラッシュコマンド
    slash_commands = [
        ("/generate 1", "ChatGPT Teamアカウントを生成（無料オファーあり）"),
        ("/generate 2", "ChatGPT Teamアカウントを生成（無料オファーなし）"),
        ("/paypal", "PayPalにログイン（ログイン情報を維持）"),
        ("/cancel", "進行中のサインアップをキャンセル"),
        ("/status", "Botの状態を確認"),
        ("/help", "このヘルプを表示")
    ]
    
    for cmd, desc in slash_commands:
        embed.add_field(
            name=cmd,
            value=desc,
            inline=False
        )
    
    embed.add_field(
        name="使用方法",
        value="1. `/generate 1` （無料オファーあり）または `/generate 2` （無料オファーなし）を実行\n2. ブラウザが開くのを待つ\n3. プロンプトが表示されたら、指示に従って入力\n4. 完了後、メールアドレスとパスワードが表示されます",
        inline=False
    )
    
    await interaction.response.send_message(embed=embed)


# エラーハンドリング
@bot.event
async def on_command_error(ctx: commands.Context, error: commands.CommandError):
    """コマンドエラーハンドリング"""
    if isinstance(error, commands.CommandNotFound):
        return
    
    if isinstance(error, commands.MissingRequiredArgument):
        await ctx.send(f"⚠️ 引数が不足しています。`!help` で使用方法を確認してください。")
        return
    
    logger.error(f"コマンドエラー: {error}")
    await ctx.send(f"❌ エラーが発生しました: {str(error)}")


def main():
    """メイン関数"""
    # トークンチェック
    if config.DISCORD_TOKEN == "YOUR_DISCORD_BOT_TOKEN_HERE":
        print("❌ エラー: DISCORD_TOKENが設定されていません。")
        print(".env ファイル、または環境変数 DISCORD_TOKEN に Discord Botトークンを設定してください。")
        sys.exit(1)
    
    print("🚀 Botを起動中...")
    print(f"拡張機能パス: {config.EXTENSION_PATH}")
    print(f"拡張機能インストール済み: {config.EXTENSION_INSTALLED_FLAG.exists()}")
    
    # Bot起動
    bot.run(config.DISCORD_TOKEN)


if __name__ == "__main__":
    main()
