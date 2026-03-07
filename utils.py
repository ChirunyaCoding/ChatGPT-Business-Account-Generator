"""
ユーティリティ関数
"""
import asyncio
import logging
import re
from typing import Optional, Any
from functools import wraps

logger = logging.getLogger(__name__)


def retry_async(max_retries: int = 5, delay: float = 3.0):
    """
    非同期関数用リトライデコレータ
    
    Args:
        max_retries: 最大リトライ回数
        delay: リトライ間の遅延（秒）
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            last_exception = None
            
            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    logger.warning(
                        f"{func.__name__} 試行 {attempt + 1}/{max_retries} 失敗: {e}"
                    )
                    
                    if attempt < max_retries - 1:
                        await asyncio.sleep(delay)
            
            logger.error(f"{func.__name__} 最大リトライ回数に達しました")
            raise last_exception
        
        return wrapper
    return decorator


def extract_verification_code(text: str) -> Optional[str]:
    """
    テキストから6桁の検証コードを抽出
    
    Args:
        text: 検索対象のテキスト
        
    Returns:
        6桁のコードまたはNone
    """
    # 6桁の数字を探す
    patterns = [
        r'\b(\d{6})\b',  # 単純な6桁
        r'code[\s:]+(\d{6})',  # "code: 123456"形式
        r'コード[\s:]+(\d{6})',  # 日本語
        r'verification[\s:]+(\d{6})',
        r'confirmation[\s:]+(\d{6})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    
    return None


def mask_sensitive_info(text: str) -> str:
    """
    機密情報をマスク
    
    Args:
        text: 元のテキスト
        
    Returns:
        マスクされたテキスト
    """
    # メールアドレスをマスク
    text = re.sub(
        r'[\w\.-]+@[\w\.-]+\.\w+',
        lambda m: m.group()[0:3] + '***@***.' + m.group().split('.')[-1],
        text
    )
    
    # パスワードをマスク
    text = re.sub(r'password["\']?\s*[:=]\s*["\']?[^\s"\']+', 'password=***', text, flags=re.IGNORECASE)
    
    return text


async def wait_with_timeout(
    condition_func,
    timeout: float = 30.0,
    check_interval: float = 0.5
) -> bool:
    """
    条件が満たされるまで待機（タイムアウト付き）
    
    Args:
        condition_func: 条件をチェックする関数
        timeout: タイムアウト（秒）
        check_interval: チェック間隔（秒）
        
    Returns:
        条件が満たされたかどうか
    """
    import time
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        try:
            if await condition_func():
                return True
        except Exception as e:
            logger.debug(f"条件チェックエラー: {e}")
        
        await asyncio.sleep(check_interval)
    
    return False


class ProgressTracker:
    """進捗追跡クラス"""
    
    def __init__(self, total_steps: int):
        self.total_steps = total_steps
        self.current_step = 0
        self.step_names = []
        
    def add_step(self, name: str):
        """ステップを追加"""
        self.step_names.append(name)
        
    def next_step(self) -> str:
        """次のステップに進む"""
        self.current_step += 1
        if self.current_step <= len(self.step_names):
            return f"[{self.current_step}/{self.total_steps}] {self.step_names[self.current_step - 1]}"
        return f"[{self.current_step}/{self.total_steps}]"
    
    def get_progress(self) -> str:
        """進捗を取得"""
        percentage = (self.current_step / self.total_steps) * 100
        return f"進捗: {self.current_step}/{self.total_steps} ({percentage:.1f}%)"


# セーフログ出力
def safe_log(logger_func, message: str, *args, **kwargs):
    """機密情報をマスクしてログ出力"""
    masked_message = mask_sensitive_info(message)
    logger_func(masked_message, *args, **kwargs)
