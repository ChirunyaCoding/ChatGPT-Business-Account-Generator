"""
ChatGPT Team Sign-up 自動化
"""
import asyncio
import logging
from typing import Optional, Callable, Any, List
from dataclasses import dataclass

from browser_automation import BrowserAutomation
from mail_tm_api import MailTMClient
import config

logger = logging.getLogger(__name__)


@dataclass
class SignupResult:
    """サインアップ結果"""
    success: bool
    email: Optional[str] = None
    password: Optional[str] = None
    workspace_name: Optional[str] = None
    message: str = ""
    error: Optional[str] = None


class ChatGPTSignupAutomation:
    """ChatGPT Teamサインアップ自動化クラス"""
    
    def __init__(
        self, 
        browser: BrowserAutomation,
        mail_client: MailTMClient,
        wait_for_user_input: Callable[[str], Any],
        ask_user_choice: Callable[[str, List[str]], Any]
    ):
        self.browser = browser
        self.mail_client = mail_client
        self.wait_for_user_input = wait_for_user_input
        self.ask_user_choice = ask_user_choice
        self.email: Optional[str] = None
        self.password: Optional[str] = None
        
    async def run_full_signup(self) -> SignupResult:
        """
        完全なサインアップフローを実行
        
        Returns:
            SignupResult
        """
        try:
            # 1. mail.tmでアカウント作成
            logger.info("=== ステップ1: mail.tmアカウント作成 ===")
            account = self.mail_client.create_account()
            self.email = account["email"]
            self.password = account["password"]
            logger.info(f"メールアドレス: {self.email}")
            
            # 2. ChatGPTサインアップページにアクセス
            logger.info("=== ステップ2: ChatGPTサインアップページにアクセス ===")
            if not await self.browser.navigate_to(config.CHATGPT_SIGNUP_URL):
                return SignupResult(success=False, error="ページアクセス失敗")
            
            # 3. メールアドレス入力
            logger.info("=== ステップ3: メールアドレス入力 ===")
            if not await self.browser.fill_input(
                'input#email[placeholder*="メール"]',
                self.email,
                by="css"
            ):
                # 別のセレクタを試す
                await self.browser.fill_input(
                    "メールアドレス",
                    self.email,
                    by="placeholder"
                )
            
            # 4. 「Business プランをはじめる」ボタンをクリック
            logger.info("=== ステップ4: Business プランをはじめるボタン ===")
            await self.browser.click_element(
                "Business プランをはじめる",
                by="text"
            )
            
            # 5. パスワード入力
            logger.info("=== ステップ5: パスワード入力 ===")
            await self.browser.fill_input(
                'input#_r_4_-new-password',
                self.password,
                by="css"
            )
            
            # 6. Continueボタン押下とエラーチェック（不明なエラーがなくなるまで繰り返す）
            logger.info("=== ステップ6: Continueボタン押下とエラーチェック ===")
            max_error_retries = 10
            error_retry = 0
            
            while error_retry < max_error_retries:
                # Continueボタンを押す（初回またはリトライ時）
                if error_retry == 0:
                    logger.info("Continueボタンを押します（初回）")
                else:
                    logger.info(f"Continueボタンを押します（リトライ {error_retry}/{max_error_retries}）")
                
                await self.browser.click_element(
                    'button[type="submit"]',
                    by="css"
                )
                
                # エラー表示を待つため最低5秒待機
                logger.info("エラー表示を待機中（5秒）...")
                await asyncio.sleep(5)
                
                # 必ずエラーチェックを実行
                logger.info("エラーチェックを実行中...")
                error_span = await self.browser.find_element_with_retry(
                    'span._root_xeddl_1',
                    by="css",
                    max_retries=3
                )
                
                if error_span:
                    error_text = await error_span.text_content()
                    if error_text and "不明なエラー" in error_text:
                        error_retry += 1
                        logger.warning(f"不明なエラーが検出されました({error_retry}/{max_error_retries})。リトライします。")
                        
                        # 「もう一度試す」ボタンをクリック
                        await self.browser.click_element(
                            'button[data-dd-action-name="Try again"]',
                            by="css"
                        )
                        
                        # パスワード入力に戻る
                        await self.browser.fill_input(
                            'input#_r_4_-new-password',
                            self.password,
                            by="css"
                        )
                        
                        # Continueボタンを押してループ継続（必ずエラーチェックが行われる）
                        continue
                    else:
                        logger.info("エラーメッセージは表示されていますが、'不明なエラー'ではありません。")
                
                # エラーが検出されなければループ終了
                logger.info("エラーは検出されませんでした。次のステップへ進みます。")
                break
            
            if error_retry >= max_error_retries:
                logger.error(f"不明なエラーが{max_error_retries}回連続で発生しました。処理を中止します。")
                return SignupResult(success=False, error="パスワード設定で不明なエラーが繰り返し発生しました")
            
            # メール送信待機のため10秒待機
            logger.info("=== メール送信待機（10秒） ===")
            await asyncio.sleep(10)
            
            # 7. 検証コード待機と入力（非同期自動取得）
            logger.info("=== ステップ7: 検証コード（非同期自動取得） ===")
            
            # 検証コードを非同期で取得
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
                
                # Continueボタン
                await self.browser.click_element(
                    'button[type="submit"]',
                    by="css"
                )
            else:
                # 自動取得失敗時はユーザーに尋ねる
                logger.warning("検証コードの自動取得に失敗しました。ユーザー入力を待機します。")
                user_code = await self.wait_for_user_input(
                    f"メール({self.email})に送信された6桁の検証コードを入力してください"
                )
                
                if user_code:
                    await self.browser.fill_input(
                        'input#_r_5_-code',
                        user_code,
                        by="css"
                    )
                    
                    # Continueボタン
                    await self.browser.click_element(
                        'button[type="submit"]',
                        by="css"
                    )
            
            # 8. 名前入力
            logger.info("=== ステップ8: 名前入力 ===")
            await self.browser.fill_input(
                'input#_r_h_-name',
                "User",
                by="css"
            )
            
            # 9. 生年月日設定（年を2000に）
            logger.info("=== ステップ9: 生年月日設定 ===")
            await self.browser.set_birthday_year("2000")
            
            # 10. アカウントの作成を完了するボタン
            logger.info("=== ステップ10: アカウント作成完了 ===")
            await self.browser.click_element(
                'button[data-dd-action-name="Continue"]',
                by="css"
            )
            
            # 11. キャンセルボタン → 指定URLに遷移
            logger.info("=== ステップ11: キャンセル → 無料オファーページへ遷移 ===")
            await self.browser.click_element(
                "キャンセルする",
                by="text"
            )
            
            # 指定URLに遷移
            await self.browser.navigate_to("https://chatgpt.com/#pricing")
            await asyncio.sleep(3)
            
            # 12. 無料オファーページでボタンを探してクリック
            logger.info("=== ステップ12: 無料オファー ===")
            await self.browser.click_element(
                'button[data-testid="select-plan-button-teams-create"]',
                by="css"
            )
            
            # ページ遷移待機
            logger.info("=== 30秒待機 ===")
            await asyncio.sleep(30)
            
            # 18. PayPalタブ（要素が見つかるまで無限待機）
            logger.info("=== ステップ13: PayPal選択 ===")
            await self.browser.click_element(
                'button[data-testid="paypal"]',
                by="css"
            )
            
            # 19. 請求先住所入力
            logger.info("=== ステップ14: 請求先住所 ===")
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
            
            # 国選択後、都道府県選択肢が更新されるのを待機
            await asyncio.sleep(3)
            
            # 郵便番号
            await self.browser.fill_input(
                'input#billingAddress-postalCodeInput',
                config.BILLING_INFO["postal_code"],
                by="css"
            )
            
            # 都道府県（失敗しても続行）
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
            
            # サブスクリプション登録
            logger.info("=== ステップ15: サブスクリプション登録 ===")
            await self.browser.click_element(
                'button[type="submit"]',
                by="css"
            )
            
            # 20. PayPal支払い処理（ログイン画面が表示された場合は自動入力）
            logger.info("=== ステップ16: PayPal支払い ===")
            
            # PayPalログイン画面が表示されたかチェック
            await asyncio.sleep(3)
            paypal_email_input = await self.browser.find_element_with_retry(
                'input[name="login_email"], input[id="email"], input[placeholder*="Email"]',
                by="css",
                max_retries=3
            )
            
            if paypal_email_input:
                logger.info("PayPalログイン画面が表示されました。自動入力します。")
                # メールアドレス入力
                await self.browser.fill_input(
                    'input[name="login_email"], input[id="email"], input[placeholder*="Email"]',
                    config.PAYPAL_EMAIL,
                    by="css"
                )
                
                # 次へボタン
                await self.browser.click_element(
                    'button[id*="btnNext"], button[type="submit"]',
                    by="css"
                )
                
                await asyncio.sleep(2)
                
                # パスワード入力
                await self.browser.fill_input(
                    'input[name="login_password"], input[id="password"], input[type="password"]',
                    config.PAYPAL_PASSWORD,
                    by="css"
                )
                
                # ログインボタン
                await self.browser.click_element(
                    'button[id*="btnLogin"], button[type="submit"]',
                    by="css"
                )
                
                await asyncio.sleep(5)
                logger.info("PayPal自動ログイン完了")
            else:
                logger.info("PayPalログイン画面は表示されていません。既にログイン済みです。")
            
            # 17. PayPal同意（5秒おきに5回リトライ）
            logger.info("=== ステップ17: PayPal同意 ===")
            consent_clicked = False
            for retry in range(5):
                consent_clicked = await self.browser.click_element(
                    'button#consentButton',
                    by="css",
                    wait_until_found=False
                )
                if consent_clicked:
                    logger.info(f"ステップ17のボタンが見つかりました（{retry + 1}回目）")
                    break
                else:
                    logger.info(f"ステップ17のボタンが見つかりません。リトライ {retry + 1}/5...")
                    await asyncio.sleep(5)
            
            if not consent_clicked:
                logger.warning("ステップ17のボタンが見つかりませんでした。ステップ18に進みます。")
            
            # 18. ワークスペース名
            logger.info("=== ステップ18: ワークスペース名 ===")
            await self.browser.click_element(
                "続ける",
                by="text"
            )
            
            # 19. ワークスペース名
            logger.info("=== ステップ19: ワークスペース名 ===")
            workspace_name = await self.wait_for_user_input(
                "ワークスペースの名前を入力してください"
            )
            
            if workspace_name:
                await self.browser.fill_input(
                    'input[name="workspace-name"]',
                    workspace_name,
                    by="css"
                )
                
                # 続ける
                await self.browser.click_element(
                    "続ける",
                    by="text"
                )
            
            # 20. ChatGPTホームに移動して完了
            logger.info("=== ステップ20: ChatGPTホームに移動 ===")
            await self.browser.navigate_to("https://chatgpt.com/")
            await asyncio.sleep(3)
            
            logger.info("=== サインアップ完了 ===")
            
            # ユーザーに情報を送信
            info_message = f"""
🎉 **ChatGPT Teamサインアップ完了！**

📧 **メールアドレス:** `{self.email}`
🔑 **パスワード:** `{self.password}`
🏢 **ワークスペース名:** {workspace_name or '未設定'}
"""
            
            return SignupResult(
                success=True,
                email=self.email,
                password=self.password,
                workspace_name=workspace_name,
                message=info_message
            )
            
        except Exception as e:
            logger.exception("サインアップ中にエラーが発生しました")
            return SignupResult(
                success=False,
                email=self.email,
                password=self.password,
                error=str(e)
            )
