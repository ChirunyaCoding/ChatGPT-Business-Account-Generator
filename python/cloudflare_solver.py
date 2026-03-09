"""
Cloudflare Turnstile対策 - cf_clearanceクッキー取得
参考: https://note.com/akkey1729/n/n9f08a2b441f9
"""
import json
import asyncio
import logging
from typing import Optional, Dict
from pathlib import Path

logger = logging.getLogger(__name__)


class CloudflareSolver:
    """
    cf_clearanceクッキーを取得するクラス
    
    方法1: paicha API（無料）を使用
    方法2: Playwrightで手動取得
    """
    
    def __init__(self):
        self.cf_clearance: Optional[str] = None
        self.user_agent: Optional[str] = None
        self.storage_state_path = Path(__file__).parent / ".browser_storage_state.json"
    
    async def solve_with_paicha_api(
        self, 
        url: str = "https://chatgpt.com",
        proxy: Optional[str] = None
    ) -> Optional[Dict]:
        """
        paicha API（無料）を使ってcf_clearanceを取得
        
        APIエンドポイント: https://api.paicha.dev/solve
        """
        import aiohttp
        
        api_url = "https://api.paicha.dev/solve"
        
        payload = {
            "url": url,
            "proxy": proxy or "",  # プロキシ設定（オプション）
        }
        
        try:
            logger.info(f"paicha APIでCloudflareをSolve中... URL: {url}")
            
            async with aiohttp.ClientSession() as session:
                async with session.post(api_url, json=payload, timeout=300) as response:
                    if response.status == 200:
                        result = await response.json()
                        
                        if result.get("success"):
                            self.cf_clearance = result.get("cf_clearance")
                            self.user_agent = result.get("user_agent")
                            
                            logger.info("cf_clearanceを取得しました")
                            logger.debug(f"User-Agent: {self.user_agent}")
                            
                            return {
                                "cf_clearance": self.cf_clearance,
                                "user_agent": self.user_agent,
                            }
                        else:
                            logger.error(f"APIエラー: {result.get('error')}")
                    else:
                        logger.error(f"HTTPエラー: {response.status}")
                        
        except asyncio.TimeoutError:
            logger.error("paicha APIタイムアウト")
        except Exception as e:
            logger.error(f"paicha APIエラー: {e}")
        
        return None
    
    async def solve_with_browser(self, browser_automation) -> Optional[Dict]:
        """
        Playwrightブラウザを使ってcf_clearanceを手動取得
        
        手順:
        1. ブラウザでCloudflareページを開く
        2. Turnstileを手動または自動で突破
        3. cf_clearanceクッキーを取得
        """
        try:
            logger.info("ブラウザでcf_clearanceを取得中...")
            
            # ChatGPTページにアクセス
            await browser_automation.navigate_to("https://chatgpt.com", check_turnstile=False)
            
            # Turnstile検出
            if await browser_automation.detect_cloudflare_turnstile():
                logger.info("Turnstileを検出しました。自動突破を試みます...")
                
                # 自動クリックで突破
                success = await browser_automation.handle_cloudflare_challenge(
                    auto_click=True,
                    wait_for_manual=True
                )
                
                if success:
                    logger.info("Turnstileを突破しました")
                    # 少し待機してクッキーが設定されるのを待つ
                    await asyncio.sleep(3)
                else:
                    logger.warning("自動突破に失敗しました")
                    return None
            
            # クッキーを取得
            cookies = await browser_automation.context.cookies()
            
            for cookie in cookies:
                if cookie.get("name") == "cf_clearance":
                    self.cf_clearance = cookie.get("value")
                    logger.info(f"cf_clearanceを取得: {self.cf_clearance[:20]}...")
                    break
            
            # storage_stateを保存
            await browser_automation.save_storage_state()
            
            return {
                "cf_clearance": self.cf_clearance,
                "user_agent": browser_automation.page.evaluate("() => navigator.userAgent")
            }
            
        except Exception as e:
            logger.error(f"ブラウザでのcf_clearance取得エラー: {e}")
            return None
    
    def load_existing_clearance(self) -> bool:
        """
        保存されているstorage_stateからcf_clearanceを読み込み
        """
        if not self.storage_state_path.exists():
            return False
        
        try:
            with open(self.storage_state_path, 'r', encoding='utf-8') as f:
                state = json.load(f)
            
            cookies = state.get("cookies", [])
            for cookie in cookies:
                if cookie.get("name") == "cf_clearance":
                    self.cf_clearance = cookie.get("value")
                    logger.info("保存されたcf_clearanceを読み込みました")
                    return True
                    
        except Exception as e:
            logger.error(f"storage_state読み込みエラー: {e}")
        
        return False
    
    def is_clearance_valid(self) -> bool:
        """
        cf_clearanceが有効かどうか簡易チェック
        （厳密なチェックはできないが、存在するかだけ確認）
        """
        return self.cf_clearance is not None and len(self.cf_clearance) > 10
    
    async def ensure_clearance(self, browser_automation = None) -> bool:
        """
        cf_clearanceを確保（取得または読み込み）
        
        優先順位:
        1. 既存の保存済みクッキーを確認
        2. paicha APIで取得（ブラウザ不要）
        3. ブラウザで手動取得
        """
        # 1. 既存のクッキーを確認
        if self.load_existing_clearance():
            logger.info("保存されたcf_clearanceを使用します")
            return True
        
        # 2. paicha APIで取得（ブラウザ不要）
        result = await self.solve_with_paicha_api()
        if result:
            return True
        
        # 3. ブラウザで取得（fallback）
        if browser_automation:
            result = await self.solve_with_browser(browser_automation)
            return result is not None
        
        return False


# 使用例
async def example_usage():
    """使用例"""
    from browser_automation import BrowserAutomation
    
    solver = CloudflareSolver()
    
    # 方法1: paicha API（推奨）
    result = await solver.solve_with_paicha_api()
    if result:
        print(f"取得成功: {result}")
    
    # 方法2: ブラウザで取得
    # browser = BrowserAutomation()
    # await browser.start()
    # result = await solver.solve_with_browser(browser)
    # await browser.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(example_usage())
