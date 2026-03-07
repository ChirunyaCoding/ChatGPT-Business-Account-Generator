"""
Discord Bot設定ファイル
"""
import os
from pathlib import Path

from env_loader import load_project_env


BASE_DIR = Path(__file__).resolve().parent
load_project_env(BASE_DIR)

# Discord Bot設定
DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", "YOUR_DISCORD_BOT_TOKEN_HERE")
COMMAND_PREFIX = "!"

# Chrome拡張機能設定（現在は無効）
EXTENSION_PATH = r"C:\Users\sakip\AppData\Local\Google\Chrome Dev\User Data\Default\Extensions\lneaocagcijjdpkcabeanfpdbmapcjjg\2.2.0_0"
EXTENSION_ID = "lneaocagcijjdpkcabeanfpdbmapcjjg"
USE_EXISTING_PROFILE = False

# 外部VPNアプリケーション設定
VPN_APP_PATH = r"C:\Program Files (x86)\VPNLY\VPNLY.exe"
VPN_COUNTRY = "フランス"

# 拡張機能インストール済みフラグファイル
EXTENSION_INSTALLED_FLAG = Path(__file__).parent / ".extension_installed"

# ブラウザセッション永続化ファイル（Cookie・LocalStorageなど）
STORAGE_STATE_PATH = Path(__file__).parent / ".browser_storage_state.json"

# mail.tm API設定
MAIL_TM_API_BASE = "https://api.mail.tm"

# ブラウザ設定
HEADLESS = False  # テスト段階ではヘッドレスモードOFF
SLOW_MO = 1500  # 各操作の遅延（ミリ秒）
DEFAULT_TIMEOUT = 100000  # デフォルトタイムアウト（ミリ秒）
STEP_DELAY = 5  # 各ステップ間のスリープ（秒）
MAX_RETRIES = 5  # 要素検索の最大リトライ回数

# ChatGPT設定
CHATGPT_SIGNUP_URL = "https://chatgpt.com/team-sign-up?promo_campaign=team1dollar"

# VPN設定
VPN_COUNTRY = "France"  # フランスに接続

# PayPal設定
PAYPAL_EMAIL = os.getenv("PAYPAL_EMAIL", "your_paypal_email@example.com")
PAYPAL_PASSWORD = os.getenv("PAYPAL_PASSWORD", "your_paypal_password")

# 請求先住所設定
BILLING_INFO = {
    "name": "User",
    "country": "JP",  # 日本
    "postal_code": "282-0001",
    "administrative_area": "千葉県",  # Stripeフォームでは日本語表記が必要な場合がある
    "locality": "成田市天浪",
    "address_line1": "3-2-2"
}

# ログ設定
LOG_LEVEL = "INFO"
LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
