"""
ブラウザ自動化クラス
Playwrightを使用したブラウザ操作
"""
import asyncio
import time
import re
import logging
from typing import Optional, Callable, Any, List
from pathlib import Path

from playwright.async_api import async_playwright, Page, Browser, BrowserContext, Locator

import config

logger = logging.getLogger(__name__)


# ステルス対策用のJavaScript
STEALTH_SCRIPTS = [
    # navigator.webdriver を削除
    """
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
    });
    """,
    # Chrome runtime を完全に偽装
    """
    window.chrome = {
        runtime: {
            OnInstalledReason: {
                CHROME_UPDATE: "chrome_update",
                INSTALL: "install",
                SHARED_MODULE_UPDATE: "shared_module_update",
                UPDATE: "update"
            },
            OnRestartRequiredReason: {
                APP_UPDATE: "app_update",
                OS_UPDATE: "os_update",
                PERIODIC: "periodic"
            },
            PlatformArch: {
                ARM: "arm",
                ARM64: "arm64",
                MIPS: "mips",
                MIPS64: "mips64",
                X86_32: "x86-32",
                X86_64: "x86-64"
            },
            PlatformNaclArch: {
                ARM: "arm",
                MIPS: "mips",
                MIPS64: "mips64",
                MIPS64EL: "mips64el",
                MIPSEL: "mipsel",
                X86_32: "x86-32",
                X86_64: "x86-64"
            },
            PlatformOs: {
                ANDROID: "android",
                CROS: "cros",
                LINUX: "linux",
                MAC: "mac",
                OPENBSD: "openbsd",
                WIN: "win"
            },
            RequestUpdateCheckStatus: {
                NO_UPDATE: "no_update",
                THROTTLED: "throttled",
                UPDATE_AVAILABLE: "update_available"
            }
        }
    };
    """,
    # Permissions API を偽装
    """
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
            Promise.resolve({ state: Notification.permission }) :
            originalQuery(parameters)
    );
    """,
    # Pluginsを偽装（よりリアルに）
    """
    Object.defineProperty(navigator, 'plugins', {
        get: () => {
            return [
                {
                    0: {
                        type: "application/x-google-chrome-pdf",
                        suffixes: "pdf",
                        description: "Portable Document Format",
                        enabledPlugin: Plugin
                    },
                    description: "Portable Document Format",
                    filename: "internal-pdf-viewer",
                    length: 1,
                    name: "Chrome PDF Plugin"
                },
                {
                    0: {
                        type: "application/pdf",
                        suffixes: "pdf",
                        description: "",
                        enabledPlugin: Plugin
                    },
                    description: "Portable Document Format plugin",
                    filename: "internal-pdf-viewer2",
                    length: 1,
                    name: "Chrome PDF Viewer"
                },
                {
                    0: {
                        type: "application/x-nacl",
                        suffixes: "",
                        description: "",
                        enabledPlugin: Plugin
                    },
                    1: {
                        type: "application/x-pnacl",
                        suffixes: "",
                        description: "",
                        enabledPlugin: Plugin
                    },
                    description: "",
                    filename: "internal-nacl-plugin",
                    length: 2,
                    name: "Native Client"
                }
            ];
        }
    });
    """,
    # Languagesを偽装
    """
    Object.defineProperty(navigator, 'languages', {
        get: () => ['ja-JP', 'ja', 'en-US', 'en']
    });
    """,
    # WebGL vendor/renderer を偽装
    """
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
            return 'Intel Inc.';
        }
        if (parameter === 37446) {
            return 'Intel Iris OpenGL Engine';
        }
        return getParameter(parameter);
    };
    """,
    # Notification API を偽装
    """
    if (!window.Notification) {
        window.Notification = {
            permission: "default",
            requestPermission: function(callback) {
                if (callback) callback("default");
                return Promise.resolve("default");
            }
        };
    }
    """,
    # deviceMemory を偽装
    """
    Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8
    });
    """,
    # hardwareConcurrency を偽装
    """
    Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 4
    });
    """,
    # maxTouchPoints を偽装
    """
    Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 0
    });
    """,
    # PDF viewer enabled を偽装
    """
    Object.defineProperty(navigator, 'pdfViewerEnabled', {
        get: () => true
    });
    """,
    # CookieEnabled を偽装
    """
    Object.defineProperty(navigator, 'cookieEnabled', {
        get: () => true
    });
    """,
]


class BrowserAutomation:
    """ブラウザ自動化クラス"""
    
    def __init__(self):
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.playwright = None
        self.extension_installed = False
        
    async def start(self, install_extension: bool = True, use_persistent_context: bool = True) -> None:
        """
        ブラウザを起動
        
        Args:
            install_extension: 拡張機能をインストールするかどうか
            use_persistent_context: 永続的コンテキスト（ユーザーデータ保存）を使用するか
        """
        self.playwright = await async_playwright().start()
        
        # Chromeのパスを探す
        chrome_paths = [
            r"C:\Program Files\Google\Chrome Dev\Application\chrome.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ]
        
        chrome_path = None
        for path in chrome_paths:
            if Path(path).exists():
                chrome_path = path
                break
        
        # ブラウザ起動設定
        browser_args = [
            "--disable-blink-features=AutomationControlled",
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-webauthn",  # WebAuthn無効化（パスキー無効化）
            "--disable-features=WebAuthentication",  # Web認証無効化
            # ステルス対策追加
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--disable-setuid-sandbox",
            "--no-sandbox",
            "--disable-accelerated-2d-canvas",
            "--disable-gpu",
            "--window-size=1920,1080",
            "--start-maximized",
            "--disable-infobars",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-features=TranslateUI",
            "--disable-component-extensions-with-background-pages",
        ]
        
        # 拡張機能は無効化（外部VPNアプリケーションを使用）
        logger.info("拡張機能は無効化されています。外部VPNアプリケーションを使用してください。")
        
        # 永続的コンテキストを使用（既存のChromeプロファイルを模倣）
        if use_persistent_context:
            # ユーザーデータディレクトリを設定
            user_data_dir = Path(__file__).parent / ".chrome_user_data"
            user_data_dir.mkdir(exist_ok=True)
            
            logger.info(f"永続的コンテキストを使用します: {user_data_dir}")
            logger.info("注意: 永続的コンテキストではstorage_stateは使用できません（ユーザーデータディレクトリで代替）")
            
            # persistent context を起動
            # launch_persistent_context は storage_state を受け取らない
            context_options = {
                "headless": config.HEADLESS,
                "args": browser_args,
                "slow_mo": config.SLOW_MO,
                "viewport": {"width": 1920, "height": 1080},
                "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            }
            
            if chrome_path:
                context_options["executable_path"] = chrome_path
            
            # persistent context を作成（browserとcontextを同時に作成）
            self.context = await self.playwright.chromium.launch_persistent_context(
                str(user_data_dir),
                **context_options
            )
            self.browser = self.context.browser
            logger.info("永続的ブラウザコンテキストを作成しました")
            
            # 既存のページを取得、または新規作成
            pages = self.context.pages
            if pages:
                self.page = pages[0]
                logger.info("既存のページを再利用します")
            else:
                self.page = await self.context.new_page()
                logger.info("新規ページを作成しました")
            
            self.page.set_default_timeout(config.DEFAULT_TIMEOUT)
            
        else:
            # 従来の方法（非永続的コンテキスト）
            launch_options = {
                "headless": config.HEADLESS,
                "args": browser_args,
                "slow_mo": config.SLOW_MO,
            }
            
            if chrome_path:
                launch_options["executable_path"] = chrome_path
            
            self.browser = await self.playwright.chromium.launch(**launch_options)
            
            # 前回のセッション情報を読み込み（永続化）
            storage_state = None
            if config.STORAGE_STATE_PATH.exists():
                storage_state = str(config.STORAGE_STATE_PATH)
                logger.info(f"前回のブラウザセッションを読み込みます: {storage_state}")
            
            # コンテキスト作成
            context_options = {
                "viewport": {"width": 1920, "height": 1080},
                "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            if storage_state:
                context_options["storage_state"] = storage_state
            
            self.context = await self.browser.new_context(**context_options)
            logger.info("新規ブラウザコンテキストを作成しました")
            
            # ページ作成
            self.page = await self.context.new_page()
            self.page.set_default_timeout(config.DEFAULT_TIMEOUT)
            logger.info("新規ページを作成しました")
        
        # ステルス対策スクリプトを適用
        await self._apply_stealth_scripts()
        
        # 拡張機能インストール後にフラグファイルを作成
        if self.extension_installed:
            config.EXTENSION_INSTALLED_FLAG.touch()
            logger.info("拡張機能インストールフラグを作成しました")
            # 拡張機能の初期化待機
            await asyncio.sleep(5)
        
        logger.info("ブラウザを起動しました")
    
    async def _apply_stealth_scripts(self) -> None:
        """ステルス対策スクリプトを適用"""
        try:
            for script in STEALTH_SCRIPTS:
                await self.page.add_init_script(script)
            logger.info("ステルス対策スクリプトを適用しました")
        except Exception as e:
            logger.warning(f"ステルススクリプト適用に失敗しました: {e}")
    
    async def _apply_page_stealth(self) -> None:
        """ページ読み込み後のステルス対策を適用"""
        try:
            await self.page.evaluate("""
                // window.chrome を再確認
                if (!window.chrome) {
                    window.chrome = { runtime: {} };
                }
                
                // outerWidth/outerHeight を設定
                Object.defineProperty(window, 'outerWidth', {
                    get: () => window.innerWidth
                });
                Object.defineProperty(window, 'outerHeight', {
                    get: () => window.innerHeight
                });
                
                // devicePixelRatio を設定
                Object.defineProperty(window, 'devicePixelRatio', {
                    get: () => 1
                });
                
                // screen プロパティを設定
                Object.defineProperty(screen, 'availWidth', {
                    get: () => 1920
                });
                Object.defineProperty(screen, 'availHeight', {
                    get: () => 1040
                });
                Object.defineProperty(screen, 'width', {
                    get: () => 1920
                });
                Object.defineProperty(screen, 'height', {
                    get: () => 1080
                });
                Object.defineProperty(screen, 'colorDepth', {
                    get: () => 24
                });
                Object.defineProperty(screen, 'pixelDepth', {
                    get: () => 24
                });
                
                // WebDriver 検出をさらに回避
                delete navigator.__proto__.webdriver;
            """)
            logger.info("ページステルス対策を適用しました")
        except Exception as e:
            logger.warning(f"ページステルス対策適用に失敗しました: {e}")
    
    async def stop(self) -> None:
        """ブラウザを停止（セッション情報を保存）"""
        # セッション情報を保存（Cookie・LocalStorageなど）
        if self.context and config.STORAGE_STATE_PATH:
            try:
                await self.context.storage_state(path=str(config.STORAGE_STATE_PATH))
                logger.info(f"ブラウザセッションを保存しました: {config.STORAGE_STATE_PATH}")
            except Exception as e:
                logger.warning(f"ブラウザセッションの保存に失敗しました: {e}")
        
        if self.context:
            await self.context.close()
            self.context = None
        if self.browser:
            await self.browser.close()
            self.browser = None
        if self.playwright:
            await self.playwright.stop()
            self.playwright = None
        logger.info("ブラウザを停止しました")
    
    async def sleep(self, seconds: Optional[int] = None) -> None:
        """指定秒数スリープ"""
        await asyncio.sleep(seconds or config.STEP_DELAY)
    
    async def find_element_until_found(
        self, 
        selector: str, 
        by: str = "css",
        check_interval: int = 1,
        search_in_iframes: bool = True
    ) -> Locator:
        """
        要素が見つかるまで待機（無限リトライ）
        
        Args:
            selector: セレクタ
            by: 検索方法 (css, xpath, text, placeholder, label)
            check_interval: チェック間隔（秒）
            search_in_iframes: iframe内も検索するか
            
        Returns:
            Locatorオブジェクト
        """
        attempt = 0
        while True:
            attempt += 1
            try:
                locator = None
                
                # メインページで検索
                if by == "css":
                    locator = self.page.locator(selector).first
                elif by == "xpath":
                    locator = self.page.locator(f"xpath={selector}").first
                elif by == "text":
                    locator = self.page.get_by_text(selector).first
                elif by == "placeholder":
                    locator = self.page.get_by_placeholder(selector).first
                elif by == "label":
                    locator = self.page.get_by_label(selector).first
                elif by == "testid":
                    locator = self.page.get_by_test_id(selector).first
                elif by == "role":
                    # role=name形式
                    parts = selector.split("=", 1)
                    if len(parts) == 2:
                        locator = self.page.get_by_role(parts[0], name=parts[1]).first
                    else:
                        locator = self.page.get_by_role(selector).first
                
                if locator:
                    # 要素が存在するか確認（表示チェックは行わない）
                    try:
                        await locator.wait_for(state="attached", timeout=3000)
                        logger.info(f"要素が見つかりました: {selector} (by={by}, {attempt}回目)")
                        return locator
                    except:
                        pass
                
                # iframe内も検索
                if search_in_iframes:
                    frames = self.page.frames
                    for frame in frames:
                        try:
                            if by == "css":
                                locator = frame.locator(selector).first
                            elif by == "text":
                                locator = frame.get_by_text(selector).first
                            elif by == "testid":
                                locator = frame.get_by_test_id(selector).first
                            
                            if locator:
                                await locator.wait_for(state="attached", timeout=2000)
                                logger.info(f"iframe内で要素が見つかりました: {selector} (by={by}, {attempt}回目)")
                                return locator
                        except:
                            continue
                
            except Exception as e:
                logger.debug(f"要素検索試行 {attempt} 失敗: {e}")
            
            logger.info(f"要素が見つかりません。待機中... ({attempt}回目): {selector}")
            await asyncio.sleep(check_interval)
    
    async def find_element_with_retry(
        self, 
        selector: str, 
        by: str = "css",
        max_retries: int = config.MAX_RETRIES
    ) -> Optional[Locator]:
        """
        要素を検索（リトライ付き）
        
        Args:
            selector: セレクタ
            by: 検索方法 (css, xpath, text, placeholder, label)
            max_retries: 最大リトライ回数
            
        Returns:
            LocatorオブジェクトまたはNone
        """
        for attempt in range(max_retries):
            try:
                locator = None
                
                if by == "css":
                    locator = self.page.locator(selector).first
                elif by == "xpath":
                    locator = self.page.locator(f"xpath={selector}").first
                elif by == "text":
                    locator = self.page.get_by_text(selector).first
                elif by == "placeholder":
                    locator = self.page.get_by_placeholder(selector).first
                elif by == "label":
                    locator = self.page.get_by_label(selector).first
                elif by == "testid":
                    locator = self.page.get_by_test_id(selector).first
                elif by == "role":
                    # role=name形式
                    parts = selector.split("=", 1)
                    if len(parts) == 2:
                        locator = self.page.get_by_role(parts[0], name=parts[1]).first
                    else:
                        locator = self.page.get_by_role(selector).first
                
                if locator:
                    # 要素が表示されているか確認
                    if await locator.is_visible(timeout=5000):
                        return locator
                
            except Exception as e:
                logger.debug(f"要素検索試行 {attempt + 1}/{max_retries} 失敗: {e}")
            
            if attempt < max_retries - 1:
                logger.info(f"要素が見つかりません。リトライ {attempt + 2}/{max_retries}...")
                await asyncio.sleep(3)
        
        logger.error(f"要素が見つかりませんでした: {selector} (by={by})")
        return None
    
    async def click_element(
        self, 
        selector: str, 
        by: str = "css",
        wait_after: Optional[int] = None,
        wait_until_found: bool = True
    ) -> bool:
        """
        要素をクリック
        
        Args:
            selector: セレクタ
            by: 検索方法
            wait_after: クリック後の待機時間
            wait_until_found: 要素が見つかるまで待機するか
            
        Returns:
            成功したかどうか
        """
        try:
            if wait_until_found:
                element = await self.find_element_until_found(selector, by)
            else:
                element = await self.find_element_with_retry(selector, by)
                if not element:
                    return False
            
            # iframe内の要素の場合、親フレームを取得してクリック
            try:
                await element.click()
            except Exception as click_error:
                # 通常のクリックが失敗した場合、JavaScriptでクリックを試みる
                try:
                    await element.evaluate("el => el.click()")
                except:
                    raise click_error
            
            logger.info(f"クリック成功: {selector}")
            if wait_after:
                await self.sleep(wait_after)
            else:
                await self.sleep()
            return True
        except Exception as e:
            logger.error(f"クリック失敗: {e}")
            return False
    
    async def fill_input(
        self, 
        selector: str, 
        value: str, 
        by: str = "css",
        clear_first: bool = True,
        wait_until_found: bool = True
    ) -> bool:
        """
        入力欄に値を入力
        
        Args:
            selector: セレクタ
            value: 入力値
            by: 検索方法
            clear_first: 先にクリアするか
            wait_until_found: 要素が見つかるまで待機するか
            
        Returns:
            成功したかどうか
        """
        try:
            if wait_until_found:
                element = await self.find_element_until_found(selector, by)
            else:
                element = await self.find_element_with_retry(selector, by)
                if not element:
                    return False
            if clear_first:
                await element.clear()
            await element.fill(value)
            logger.info(f"入力成功: {selector} = {value[:20]}...")
            await self.sleep()
            return True
        except Exception as e:
            logger.error(f"入力失敗: {e}")
            return False
    
    async def select_option(
        self, 
        selector: str, 
        value: str, 
        by: str = "css",
        wait_until_found: bool = True
    ) -> bool:
        """
        セレクトボックスでオプションを選択
        
        Args:
            selector: セレクタ
            value: 選択値
            by: 検索方法
            wait_until_found: 要素が見つかるまで待機するか
            
        Returns:
            成功したかどうか
        """
        try:
            if wait_until_found:
                element = await self.find_element_until_found(selector, by)
            else:
                element = await self.find_element_with_retry(selector, by)
                if not element:
                    return False
            
            await element.select_option(value)
            logger.info(f"選択成功: {selector} = {value}")
            await self.sleep()
            return True
        except Exception as e:
            logger.error(f"選択失敗: {e}")
            return False
    
    async def get_element_text(
        self, 
        selector: str, 
        by: str = "css"
    ) -> Optional[str]:
        """
        要素のテキストを取得
        
        Args:
            selector: セレクタ
            by: 検索方法
            
        Returns:
            テキストまたはNone
        """
        element = await self.find_element_with_retry(selector, by)
        if not element:
            return None
        
        try:
            return await element.text_content()
        except Exception as e:
            logger.error(f"テキスト取得失敗: {e}")
            return None
    
    async def wait_for_element(
        self, 
        selector: str, 
        by: str = "css",
        timeout: int = 30
    ) -> bool:
        """
        要素が表示されるまで待機
        
        Args:
            selector: セレクタ
            by: 検索方法
            timeout: タイムアウト（秒）
            
        Returns:
            見つかったかどうか
        """
        start_time = time.time()
        while time.time() - start_time < timeout:
            element = await self.find_element_with_retry(selector, by, max_retries=1)
            if element:
                return True
            await asyncio.sleep(1)
        return False
    
    async def navigate_to(self, url: str) -> bool:
        """
        ページに移動
        
        Args:
            url: URL
            
        Returns:
            成功したかどうか
        """
        try:
            # DOMが読み込まれた時点で進行（networkidleだとタイムアウトしやすい）
            await self.page.goto(url, wait_until="domcontentloaded")
            logger.info(f"ページ移動: {url}")
            
            # ページ読み込み後に追加のステルス対策を適用
            await self._apply_page_stealth()
            
            await self.sleep()
            return True
        except Exception as e:
            logger.error(f"ページ移動失敗: {e}")
            return False
    
    async def take_screenshot(self, path: str) -> bool:
        """
        スクリーンショットを撮影
        
        Args:
            path: 保存パス
            
        Returns:
            成功したかどうか
        """
        try:
            await self.page.screenshot(path=path, full_page=True)
            logger.info(f"スクリーンショット保存: {path}")
            return True
        except Exception as e:
            logger.error(f"スクリーンショット失敗: {e}")
            return False
    
    async def set_birthday_year(self, year: str = "2000") -> bool:
        """
        生年月日の年を設定（特殊な入力欄用）
        
        Args:
            year: 年（デフォルト2000）
            
        Returns:
            成功したかどうか
        """
        try:
            # 年の入力欄を探す（contenteditableなdiv）
            year_selector = '[data-type="year"]'
            year_element = await self.find_element_with_retry(year_selector)
            
            if year_element:
                await year_element.click()
                await year_element.clear()
                await year_element.fill(year)
                logger.info(f"生年月日の年を設定: {year}")
                await self.sleep()
                return True
            
            return False
        except Exception as e:
            logger.error(f"生年月日設定失敗: {e}")
            return False
    
    async def is_element_present(
        self, 
        selector: str, 
        by: str = "css",
        timeout: int = 5
    ) -> bool:
        """
        要素が存在するかチェック
        
        Args:
            selector: セレクタ
            by: 検索方法
            timeout: タイムアウト（秒）
            
        Returns:
            存在するかどうか
        """
        try:
            locator = None
            if by == "css":
                locator = self.page.locator(selector).first
            elif by == "text":
                locator = self.page.get_by_text(selector).first
            
            if locator:
                await locator.wait_for(state="visible", timeout=timeout * 1000)
                return True
            return False
        except:
            return False


# テスト用
if __name__ == "__main__":
    async def test():
        auto = BrowserAutomation()
        await auto.start(install_extension=False)
        await auto.navigate_to("https://example.com")
        await auto.sleep(3)
        await auto.stop()
    
    asyncio.run(test())
