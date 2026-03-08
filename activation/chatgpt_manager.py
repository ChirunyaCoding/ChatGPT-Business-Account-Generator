"""
ChatGPTアカウント管理・サブスクリプション有効化・キャンセル
"""
import asyncio
import logging
from typing import Optional, Callable, Any
from dataclasses import dataclass

# 親ディレクトリのモジュールをインポート
from browser_automation import BrowserAutomation
from activation.mail_tm_extended import MailTMClientExtended
from activation import config

logger = logging.getLogger(__name__)


@dataclass
class ActivationResult:
    """アクティベーション結果"""
    success: bool
    email: Optional[str] = None
    workspace_name: Optional[str] = None
    message: str = ""
    error: Optional[str] = None


class ChatGPTManager:
    """ChatGPTアカウント管理クラス（ログイン・有効化・キャンセル）"""
    
    def __init__(
        self, 
        browser: BrowserAutomation,
        mail_client: MailTMClientExtended,
        wait_for_user_input: Callable[[str], Any],
    ):
        self.browser = browser
        self.mail_client = mail_client
        self.wait_for_user_input = wait_for_user_input
        self.email: Optional[str] = None
        
    async def activate_and_cancel_subscription(
        self, 
        email: str, 
        password: str
    ) -> ActivationResult:
        """
        既存アカウントでログインし、サブスクリプションを有効化してキャンセル
        
        Args:
            email: メールアドレス
            password: パスワード
            
        Returns:
            ActivationResult
        """
        self.email = email
        
        try:
            # 1. ChatGPTにアクセス
            logger.info("=== ステップ1: ChatGPTにアクセス ===")
            if not await self.browser.navigate_to("https://chatgpt.com/"):
                return ActivationResult(success=False, error="ページアクセス失敗")
            await asyncio.sleep(3)
            
            # 2. メールアドレス入力
            logger.info("=== ステップ2: メールアドレス入力 ===")
            await self.browser.fill_input(
                'input#email',
                email,
                by="css"
            )
            
            # 3. 「続行」ボタンをクリック
            logger.info("=== ステップ3: 続行ボタンをクリック ===")
            await self.browser.click_element(
                'button[type="submit"]',
                by="css"
            )
            
            # メール送信待機のため10秒待機
            logger.info("=== メール送信待機（10秒） ===")
            await asyncio.sleep(10)
            
            # 4. 検証コードをMail.tmから取得
            logger.info("=== ステップ4: 検証コード取得 ===")
            
            import concurrent.futures
            loop = asyncio.get_event_loop()
            with concurrent.futures.ThreadPoolExecutor() as pool:
                verification_code = await loop.run_in_executor(
                    pool,
                    self.mail_client.wait_for_verification_code,
                    300,  # timeout
                    5     # check_interval
                )
            
            if verification_code:
                logger.info(f"検証コードを自動取得しました: {verification_code}")
                await self.browser.fill_input(
                    'input#_r_5_-code',
                    verification_code,
                    by="css"
                )
            else:
                # 自動取得失敗時はユーザーに尋ねる
                logger.warning("検証コードの自動取得に失敗しました。ユーザー入力を待機します。")
                user_code = await self.wait_for_user_input(
                    f"メール({email})に送信された6桁の検証コードを入力してください"
                )
                
                if user_code:
                    await self.browser.fill_input(
                        'input#_r_5_-code',
                        user_code,
                        by="css"
                    )
                else:
                    return ActivationResult(success=False, error="検証コードが入力されませんでした")
            
            # 5. Continueボタンをクリック
            logger.info("=== ステップ5: Continueボタンをクリック ===")
            await self.browser.click_element(
                'button[data-dd-action-name="Continue"]',
                by="css"
            )
            await asyncio.sleep(3)
            
            # 6. ワークスペースを選択（最初のワークスペースを自動選択）
            logger.info("=== ステップ6: ワークスペースを選択 ===")
            
            # ワークスペースボタンを探してクリック
            workspace_button = await self.browser.find_element_with_retry(
                'button[name="workspace_id"]',
                by="css",
                max_retries=5
            )
            
            if workspace_button:
                # ワークスペース名を取得
                workspace_name_elem = await workspace_button.query_selector('span._primary_dw77f_113')
                workspace_name = await workspace_name_elem.text_content() if workspace_name_elem else "Unknown"
                logger.info(f"ワークスペースを選択: {workspace_name}")
                
                await workspace_button.click()
                await asyncio.sleep(3)
            else:
                logger.warning("ワークスペースボタンが見つかりませんでした")
                workspace_name = "Unknown"
            
            # 7. 無料オファーページへ遷移しTeams作成ボタンをクリック
            logger.info("=== ステップ7: 無料オファー → Teams作成 ===")
            await self.browser.navigate_to("https://chatgpt.com/#pricing")
            await asyncio.sleep(3)
            
            await self.browser.click_element(
                'button[data-testid="select-plan-button-teams-create"]',
                by="css"
            )
            
            # ページ遷移待機
            logger.info("=== 30秒待機 ===")
            await asyncio.sleep(30)
            
            # 8. PayPalタブを選択
            logger.info("=== ステップ8: PayPal選択 ===")
            await self.browser.click_element(
                'button[data-testid="paypal"]',
                by="css"
            )
            
            # 9. 請求先住所入力
            logger.info("=== ステップ9: 請求先住所入力 ===")
            await self.browser.fill_input(
                'input#billingAddress-nameInput',
                config.BILLING_INFO["name"],
                by="css"
            )
            
            # 国選択
            await self.browser.select_option(
                'select#billingAddress-countryInput',
                config.BILLING_INFO["country"],
                by="css"
            )
            await asyncio.sleep(3)
            
            # 郵便番号
            await self.browser.fill_input(
                'input#billingAddress-postalCodeInput',
                config.BILLING_INFO["postal_code"],
                by="css"
            )
            
            # 都道府県
            try:
                await self.browser.select_option(
                    'select#billingAddress-administrativeAreaInput',
                    config.BILLING_INFO["administrative_area"],
                    by="css"
                )
            except Exception as e:
                logger.warning(f"都道府県選択に失敗しました（無視して続行）: {e}")
            
            # 市区町村
            await self.browser.fill_input(
                'input#billingAddress-localityInput',
                config.BILLING_INFO["locality"],
                by="css"
            )
            
            # 番地
            await self.browser.fill_input(
                'input#billingAddress-addressLine1Input',
                config.BILLING_INFO["address_line1"],
                by="css"
            )
            
            # 10. サブスクリプション登録
            logger.info("=== ステップ10: サブスクリプション登録 ===")
            await self.browser.click_element(
                'button[type="submit"]',
                by="css"
            )
            
            # 11. PayPal支払い処理
            logger.info("=== ステップ11: PayPal支払い ===")
            await asyncio.sleep(3)
            
            paypal_email_input = await self.browser.find_element_with_retry(
                'input[name="login_email"], input[id="email"], input[placeholder*="Email"]',
                by="css",
                max_retries=3
            )
            
            if paypal_email_input:
                logger.info("PayPalログイン画面が表示されました。自動入力します。")
                await self.browser.fill_input(
                    'input[name="login_email"], input[id="email"], input[placeholder*="Email"]',
                    config.PAYPAL_EMAIL,
                    by="css"
                )
                
                await self.browser.click_element(
                    'button[id*="btnNext"], button[type="submit"]',
                    by="css"
                )
                
                await asyncio.sleep(2)
                
                await self.browser.fill_input(
                    'input[name="login_password"], input[id="password"], input[type="password"]',
                    config.PAYPAL_PASSWORD,
                    by="css"
                )
                
                await self.browser.click_element(
                    'button[id*="btnLogin"], button[type="submit"]',
                    by="css"
                )
                
                await asyncio.sleep(5)
                logger.info("PayPal自動ログイン完了")
            else:
                logger.info("PayPalログイン画面は表示されていません。既にログイン済みです。")
            
            # 12. PayPal同意
            logger.info("=== ステップ12: PayPal同意 ===")
            consent_clicked = False
            for retry in range(5):
                consent_clicked = await self.browser.click_element(
                    'button#consentButton',
                    by="css",
                    wait_until_found=False
                )
                if consent_clicked:
                    logger.info(f"PayPal同意ボタンが見つかりました（{retry + 1}回目）")
                    break
                else:
                    logger.info(f"PayPal同意ボタンが見つかりません。リトライ {retry + 1}/5...")
                    await asyncio.sleep(5)
            
            if not consent_clicked:
                logger.warning("PayPal同意ボタンが見つかりませんでした。次に進みます。")
            
            # 13. ワークスペース名設定画面をスキップ
            logger.info("=== ステップ13: ワークスペース名設定 ===")
            await self.browser.click_element(
                "続ける",
                by="text"
            )
            
            # ワークスペース名は変更しない（既存の名前を維持）
            await self.browser.click_element(
                "続ける",
                by="text"
            )
            
            # 14. サブスクリプションキャンセル処理
            logger.info("=== ステップ14: サブスクリプションキャンセル処理 ===")
            
            # 請求ページに移動
            await self.browser.navigate_to("https://chatgpt.com/admin/billing")
            await asyncio.sleep(3)
            
            # 「プランの管理」ボタンをクリック
            await self.browser.click_element(
                'button#radix-_r_4b_',
                by="css"
            )
            await asyncio.sleep(2)
            
            # 「サブスクリプションをキャンセルする」をクリック
            await self.browser.click_element(
                "サブスクリプションをキャンセルする",
                by="text"
            )
            await asyncio.sleep(2)
            
            # メールアドレスを入力（確認用）
            await self.browser.fill_input(
                'input#user-email',
                email,
                by="css"
            )
            await asyncio.sleep(1)
            
            # 「サブスクリプションをキャンセルする」ボタンをクリック
            await self.browser.click_element(
                "サブスクリプションをキャンセルする",
                by="text"
            )
            
            # キャンセル完了メッセージを待機
            cancel_success = await self.browser.find_element_with_retry(
                'h3:text("サブスクリプションは正常にキャンセルされました。")',
                by="css",
                max_retries=10,
                retry_interval=2
            )
            
            if cancel_success:
                logger.info("サブスクリプションのキャンセルが完了しました")
                await self.browser.click_element(
                    "完了",
                    by="text"
                )
                await asyncio.sleep(2)
            else:
                logger.warning("キャンセル完了メッセージが検出されませんでした")
            
            # 完了
            logger.info("=== アクティベーション・キャンセル処理完了 ===")
            await self.browser.navigate_to("https://chatgpt.com/")
            await asyncio.sleep(3)
            
            info_message = f"""
🎉 **ChatGPTサブスクリプション有効化・キャンセル完了！**

📧 **メールアドレス:** `{email}`
🏢 **ワークスペース名:** {workspace_name}
✅ **サブスクリプション:** キャンセル済み（請求サイクル終了まで利用可能）
"""
            
            return ActivationResult(
                success=True,
                email=email,
                workspace_name=workspace_name,
                message=info_message
            )
            
        except Exception as e:
            logger.exception("アクティベーション中にエラーが発生しました")
            return ActivationResult(
                success=False,
                email=self.email,
                error=str(e)
            )
