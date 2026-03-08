"""
MailTMClient拡張 - 既存アカウントでのログイン機能を追加
"""
import requests
import logging
from typing import Optional, Dict, Any

import sys
from pathlib import Path
PARENT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PARENT_DIR))

from mail_tm_api import MailTMClient

logger = logging.getLogger(__name__)


class MailTMClientExtended(MailTMClient):
    """MailTMClientを拡張して既存アカウントでのログイン機能を追加"""
    
    def login_account(self, email: str, password: str) -> bool:
        """
        既存のアカウントでログイン
        
        Args:
            email: メールアドレス
            password: パスワード
            
        Returns:
            ログイン成功時True
        """
        try:
            self.email = email
            self.password = password
            
            # 認証してトークンを取得
            payload = {
                "address": email,
                "password": password
            }
            
            response = requests.post(
                f"{self.base_url}/token",
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            self.token = data.get("token")
            
            # アカウントIDを取得
            headers = {"Authorization": f"Bearer {self.token}"}
            me_response = requests.get(
                f"{self.base_url}/me",
                headers=headers,
                timeout=30
            )
            me_response.raise_for_status()
            me_data = me_response.json()
            self.account_id = me_data.get("id")
            
            logger.info(f"mail.tmログイン成功: {email}")
            return True
            
        except requests.exceptions.HTTPError as e:
            logger.error(f"mail.tmログイン失敗: {e}")
            return False
        except Exception as e:
            logger.error(f"mail.tmログインエラー: {e}")
            return False
    
    def get_account_info(self) -> Optional[Dict[str, Any]]:
        """現在のアカウント情報を取得"""
        if not self.token:
            return None
        
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(
                f"{self.base_url}/me",
                headers=headers,
                timeout=30
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"アカウント情報取得エラー: {e}")
            return None
