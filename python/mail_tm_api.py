"""
mail.tm API ラッパー
"""
import requests
import random
import string
import time
from typing import Optional, Dict, Any, List
import logging

logger = logging.getLogger(__name__)


class MailTMClient:
    """mail.tm APIクライアント"""
    
    def __init__(self, base_url: str = "https://api.mail.tm"):
        self.base_url = base_url
        self.token: Optional[str] = None
        self.account_id: Optional[str] = None
        self.email: Optional[str] = None
        self.password: Optional[str] = None
        
    def _generate_random_string(self, length: int = 10) -> str:
        """ランダムな文字列を生成"""
        return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))
    
    def _generate_password(self, length: int = 16) -> str:
        """ランダムなパスワードを生成"""
        characters = string.ascii_letters + string.digits + "!@#$%^&*"
        return ''.join(random.choices(characters, k=length))
    
    def get_domains(self) -> List[str]:
        """利用可能なドメイン一覧を取得"""
        try:
            response = requests.get(f"{self.base_url}/domains", timeout=30)
            response.raise_for_status()
            domains = response.json().get("hydra:member", [])
            return [d["domain"] for d in domains]
        except Exception as e:
            logger.error(f"ドメイン取得エラー: {e}")
            return ["mail.tm", "mailbox.in.ua"]  # フォールバック
    
    def create_account(self) -> Dict[str, str]:
        """
        新しいメールアカウントを作成
        
        Returns:
            Dict with 'email' and 'password'
        """
        domains = self.get_domains()
        if not domains:
            raise Exception("利用可能なドメインが見つかりません")
        
        domain = random.choice(domains)
        username = self._generate_random_string(12)
        self.email = f"{username}@{domain}"
        self.password = self._generate_password(16)
        
        payload = {
            "address": self.email,
            "password": self.password
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/accounts",
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            self.account_id = data.get("id")
            
            logger.info(f"アカウント作成成功: {self.email}")
            
            # トークンを取得
            self._authenticate()
            
            return {
                "email": self.email,
                "password": self.password
            }
            
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 422:
                # アドレスが既に存在する場合は再試行
                logger.warning("アドレスが既に存在します。再試行します。")
                return self.create_account()
            raise
    
    def _authenticate(self) -> None:
        """認証してトークンを取得"""
        payload = {
            "address": self.email,
            "password": self.password
        }
        
        response = requests.post(
            f"{self.base_url}/token",
            json=payload,
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        self.token = data.get("token")
    
    def get_messages(self, page: int = 1) -> List[Dict[str, Any]]:
        """メッセージ一覧を取得"""
        if not self.token:
            raise Exception("認証が必要です")
        
        headers = {"Authorization": f"Bearer {self.token}"}
        response = requests.get(
            f"{self.base_url}/messages?page={page}",
            headers=headers,
            timeout=30
        )
        response.raise_for_status()
        return response.json().get("hydra:member", [])
    
    def get_message(self, message_id: str) -> Dict[str, Any]:
        """特定のメッセージを取得"""
        if not self.token:
            raise Exception("認証が必要です")
        
        headers = {"Authorization": f"Bearer {self.token}"}
        response = requests.get(
            f"{self.base_url}/messages/{message_id}",
            headers=headers,
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    
    def wait_for_verification_code(self, timeout: int = 300, check_interval: int = 5) -> Optional[str]:
        """
        検証コードを待機して取得
        
        Args:
            timeout: 最大待機時間（秒）
            check_interval: チェック間隔（秒）
            
        Returns:
            検証コードまたはNone
        """
        logger.info(f"検証コードを待機中... (最大{timeout}秒)")
        start_time = time.time()
        seen_messages = set()
        
        while time.time() - start_time < timeout:
            try:
                messages = self.get_messages()
                
                for msg in messages:
                    msg_id = msg.get("id")
                    if msg_id in seen_messages:
                        continue
                    seen_messages.add(msg_id)
                    
                    # メッセージ詳細を取得
                    full_msg = self.get_message(msg_id)
                    subject = full_msg.get("subject", "")
                    text = full_msg.get("text", "") or full_msg.get("html", [])
                    
                    # ChatGPT/OpenAIからの検証コードを探す
                    if "OpenAI" in subject or "ChatGPT" in subject or "verification" in subject.lower():
                        import re
                        # 6桁の数字を探す
                        code_match = re.search(r'\b\d{6}\b', str(text))
                        if code_match:
                            code = code_match.group()
                            logger.info(f"検証コードを発見: {code}")
                            return code
                        
                        # 別のパターンも試す
                        code_match = re.search(r'code[\s:]+(\d{6})', str(text), re.IGNORECASE)
                        if code_match:
                            code = code_match.group(1)
                            logger.info(f"検証コードを発見: {code}")
                            return code
                
                time.sleep(check_interval)
                
            except Exception as e:
                logger.error(f"メッセージ取得エラー: {e}")
                time.sleep(check_interval)
        
        logger.warning("検証コードが見つかりませんでした")
        return None
    
    def delete_account(self) -> None:
        """アカウントを削除"""
        if not self.token or not self.account_id:
            return
        
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            requests.delete(
                f"{self.base_url}/accounts/{self.account_id}",
                headers=headers,
                timeout=30
            )
            logger.info("アカウントを削除しました")
        except Exception as e:
            logger.error(f"アカウント削除エラー: {e}")


# テスト用
if __name__ == "__main__":
    client = MailTMClient()
    account = client.create_account()
    print(f"Email: {account['email']}")
    print(f"Password: {account['password']}")
