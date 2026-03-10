@echo off
chcp 65001 >nul
echo.
echo 💳 PayPalログイン管理ツール
echo.

if "%~1"=="" goto :help
if /i "%~1"=="status" goto :status
if /i "%~1"=="launch" goto :launch
if /i "%~1"=="login" goto :login
if /i "%~1"=="clear" goto :clear
if /i "%~1"=="help" goto :help
if /i "%~1"=="-h" goto :help
if /i "%~1"=="--help" goto :help
echo ❌ 不明なコマンド: %~1
goto :help

:status
echo 🔍 セッション状態を確認します...
node src\puppeteer_paypal_persistent.js --status
goto :end

:launch
echo 🚀 PayPalを起動します...
if "%~2"=="--force" (
    node src\puppeteer_paypal_persistent.js --force-login
) else (
    node src\puppeteer_paypal_persistent.js
)
goto :end

:login
echo 🔑 PayPalログインページを開きます...
node src\puppeteer_paypal_persistent.js
goto :end

:clear
echo 🗑️ セッションをクリアします...
node src\puppeteer_paypal_persistent.js --clear
goto :end

:help
echo 使い方: paypal [command] [options]
echo.
echo コマンド:
echo   status       ログイン状態を確認
echo   launch       ログイン済み状態でPayPalを開く
echo   login        ログインページを開く
echo   clear        セッションをクリア
echo   help         このヘルプを表示
echo.
echo オプション:
echo   launch --force   ログインを強制（既存セッションを無視）
echo.
echo 例:
echo   paypal status          状態確認
echo   paypal launch          ログイン済み状態で開く
echo   paypal launch --force  ログインを強制
echo   paypal login           ログインページを開く
echo   paypal clear           セッションクリア
echo.

:end
