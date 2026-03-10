@echo off
chcp 65001 >nul
echo.
echo 🗑️ Discordコマンド削除ツール
echo.
echo ⚠️ すべてのスラッシュコマンドを削除します
echo.
pause

echo.
echo 🔄 コマンド削除中...
node src\clear-commands.js

echo.
echo ✅ 完了しました
echo 💡 Botを再起動して新しいコマンドを登録してください
echo    node src\discord-bot.js
echo.
pause
