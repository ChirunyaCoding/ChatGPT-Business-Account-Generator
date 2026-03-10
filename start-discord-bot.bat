@echo off
chcp 65001 >nul
echo ==========================================
echo   Discord Bot 起動スクリプト
echo ==========================================
echo.

REM Node.js がインストールされているか確認
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js がインストールされていません。
    echo [INFO] https://nodejs.org/ からインストールしてください。
    pause
    exit /b 1
)

REM 依存関係のインストール（初回のみ）
if not exist "node_modules" (
    echo [INFO] 依存関係をインストール中...
    npm install
)

echo.
echo [INFO] Discord Botを起動中...
echo.

REM Botを起動
node src/discord-bot.js

echo.
echo [INFO] Botが終了しました。
pause
