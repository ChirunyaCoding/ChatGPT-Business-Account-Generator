"""
Activation Bot設定ファイル
"""
import os
import sys
from pathlib import Path

# 親ディレクトリをPYTHONPATHに追加（モジュールインポート用）
PARENT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PARENT_DIR))

# 親のモジュールから必要な設定をインポート（トークン類は除く）
from config import (
    COMMAND_PREFIX,
    HEADLESS,
    SLOW_MO,
    DEFAULT_TIMEOUT,
    MAX_RETRIES,
    LOG_LEVEL,
    LOG_FORMAT,
    MAIL_TM_API_BASE,
    VPN_COUNTRY,
    BILLING_INFO,
)

# activationディレクトリの.envを直接読み込んでトークンを取得（親の設定を上書き）
from dotenv import dotenv_values
BASE_DIR = Path(__file__).resolve().parent
activation_env = dotenv_values(BASE_DIR / ".env")

# Discord Bot設定（activation専用）
DISCORD_TOKEN = activation_env.get("DISCORD_TOKEN", "YOUR_DISCORD_BOT_TOKEN_HERE")

# PayPal設定（activation専用）
PAYPAL_EMAIL = activation_env.get("PAYPAL_EMAIL", "your_paypal_email@example.com")
PAYPAL_PASSWORD = activation_env.get("PAYPAL_PASSWORD", "your_paypal_password")

# Activation Bot固有の設定
ACTIVATION_COMMAND_PREFIX = "!"
ACTIVATION_HEADLESS = False

# ワークスペース選択設定（デフォルトは最初のワークスペースを選択）
SELECT_FIRST_WORKSPACE = True
