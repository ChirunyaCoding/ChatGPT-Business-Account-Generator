#!/bin/bash

# PayPalログイン管理ツール

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_SCRIPT="$SCRIPT_DIR/src/puppeteer_paypal_persistent.js"

show_help() {
    cat << EOF
💳 PayPalログイン管理ツール

使い方: ./paypal.sh [command] [options]

コマンド:
  status       ログイン状態を確認
  launch       ログイン済み状態でPayPalを開く
  login        ログインページを開く
  clear        セッションをクリア
  help         このヘルプを表示

オプション:
  launch --force   ログインを強制（既存セッションを無視）

例:
  ./paypal.sh status          状態確認
  ./paypal.sh launch          ログイン済み状態で開く
  ./paypal.sh launch --force  ログインを強制
  ./paypal.sh login           ログインページを開く
  ./paypal.sh clear           セッションクリア
EOF
}

case "${1:-}" in
    status)
        echo "🔍 セッション状態を確認します..."
        node "$NODE_SCRIPT" --status
        ;;
    launch)
        echo "🚀 PayPalを起動します..."
        if [ "${2:-}" = "--force" ]; then
            node "$NODE_SCRIPT" --force-login
        else
            node "$NODE_SCRIPT"
        fi
        ;;
    login)
        echo "🔑 PayPalログインページを開きます..."
        node "$NODE_SCRIPT"
        ;;
    clear)
        echo "🗑️ セッションをクリアします..."
        node "$NODE_SCRIPT" --clear
        ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        echo "❌ 不明なコマンド: $1"
        show_help
        exit 1
        ;;
esac
