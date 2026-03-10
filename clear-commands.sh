#!/bin/bash

# Discordコマンド削除ツール

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "🗑️ Discordコマンド削除ツール"
echo ""
echo "⚠️ すべてのスラッシュコマンドを削除します"
echo ""
read -p "続行しますか？ (y/N): " confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "キャンセルしました"
    exit 0
fi

echo ""
echo "🔄 コマンド削除中..."
node "$SCRIPT_DIR/src/clear-commands.js"

echo ""
echo "✅ 完了しました"
echo "💡 Botを再起動して新しいコマンドを登録してください"
echo "   node src/discord-bot.js"
echo ""
