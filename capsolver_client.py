"""
CapSolver API クライアント
Cloudflare Turnstile自動解決
"""
import asyncio
import json
import logging
from typing import Optional, Dict, Any
import aiohttp

logger = logging.getLogger(__name__)


class CapSolverClient:
    """CapSolver APIクライアント"""
    
    BASE_URL = "https://api.capsolver.com"
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def solve_turnstile(
        self,
        website_url: str = "https://chatgpt.com",
        website_key: str = "0x4AAAAAAADnPIDROrmt1Wwj",
        max_wait: int = 120
    ) -> Optional[Dict[str, Any]]:
        """
        Cloudflare Turnstileを解決
        
        Args:
            website_url: 対象サイトURL
            website_key: Turnstileのsitekey（ChatGPTのもの）
            max_wait: 最大待機時間（秒）
            
        Returns:
            tokenとuser_agentを含む辞書、失敗時はNone
        """
        if not self.session:
            self.session = aiohttp.ClientSession()
        
        try:
            # タスク作成
            create_payload = {
                "clientKey": self.api_key,
                "task": {
                    "type": "AntiTurnstileTaskProxyLess",
                    "websiteURL": website_url,
                    "websiteKey": website_key
                }
            }
            
            logger.info(f"CapSolver: Turnstile解決タスクを作成 {website_url}")
            
            async with self.session.post(
                f"{self.BASE_URL}/createTask",
                json=create_payload
            ) as response:
                result = await response.json()
                
                if result.get("errorId") != 0:
                    logger.error(f"CapSolverタスク作成エラー: {result}")
                    return None
                
                task_id = result.get("taskId")
                logger.info(f"CapSolverタスクID: {task_id}")
            
            # 結果をポーリング
            return await self._poll_result(task_id, max_wait)
            
        except Exception as e:
            logger.error(f"CapSolverエラー: {e}")
            return None
    
    async def _poll_result(
        self, 
        task_id: str, 
        max_wait: int
    ) -> Optional[Dict[str, Any]]:
        """タスク結果をポーリング"""
        get_payload = {
            "clientKey": self.api_key,
            "taskId": task_id
        }
        
        start_time = asyncio.get_event_loop().time()
        
        while (asyncio.get_event_loop().time() - start_time) < max_wait:
            try:
                async with self.session.post(
                    f"{self.BASE_URL}/getTaskResult",
                    json=get_payload
                ) as response:
                    result = await response.json()
                    
                    if result.get("errorId") != 0:
                        logger.error(f"CapSolver結果取得エラー: {result}")
                        return None
                    
                    status = result.get("status")
                    
                    if status == "ready":
                        # 成功
                        solution = result.get("solution", {})
                        token = solution.get("token")
                        
                        logger.info("✅ CapSolver: Turnstile解決完了")
                        
                        return {
                            "token": token,
                            "user_agent": solution.get("userAgent"),
                            "cf_clearance": self._extract_cf_clearance(token)
                        }
                    
                    elif status == "processing":
                        logger.debug("CapSolver: 処理中...")
                        await asyncio.sleep(3)
                    
                    else:
                        logger.warning(f"CapSolver: 不明なステータス {status}")
                        return None
                        
            except Exception as e:
                logger.error(f"CapSolverポーリングエラー: {e}")
                await asyncio.sleep(3)
        
        logger.error("CapSolver: タイムアウト")
        return None
    
    def _extract_cf_clearance(self, token: str) -> Optional[str]:
        """
        tokenからcf_clearance部分を抽出
        Turnstileトークンは通常 cf_clearance=xxx の形式を含む
        """
        if not token:
            return None
        
        # tokenの中にcf_clearanceが含まれている場合
        if "cf_clearance=" in token:
            import re
            match = re.search(r'cf_clearance=([^&;\s]+)', token)
            if match:
                return match.group(1)
        
        # token自体がcf_clearanceの場合もある
        return token


# 使用例
async def test_capsolver():
    """CapSolverテスト"""
    api_key = "CAP-835D93EA1A9153A0E7200EFAC80E1E059140B11E29937104367D4E54D66445C1"
    
    async with CapSolverClient(api_key) as client:
        result = await client.solve_turnstile()
        
        if result:
            print(f"成功!")
            print(f"Token: {result['token'][:50]}...")
            print(f"cf_clearance: {result['cf_clearance'][:30] if result['cf_clearance'] else 'なし'}...")
        else:
            print("失敗")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(test_capsolver())
