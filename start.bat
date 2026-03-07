@echo off
chcp 65001 >nul
echo ==========================================
echo   ChatGPT Team Signup Bot 起動スクリプト
echo ==========================================
echo.

REM 仮想環境のチェック
if exist "venv\Scripts\activate.bat" (
    echo [INFO] 仮想環境を有効化中...
    call venv\Scripts\activate.bat
) else (
    echo [WARNING] 仮想環境が見つかりません。
    echo [INFO] 仮想環境を作成します...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo [INFO] 依存関係をインストール中...
    pip install -r requirements.txt
    playwright install chromium
)

echo.
echo [INFO] Botを起動中...
echo.

REM Botを起動
python bot.py

echo.
echo [INFO] Botが終了しました。
pause
