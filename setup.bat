@echo off
chcp 65001 >nul
echo ==========================================
echo   ChatGPT Team Signup Bot セットアップ
echo ==========================================
echo.

REM Pythonのチェック
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Pythonがインストールされていません。
    echo [INFO] https://www.python.org/downloads/ からPython 3.9以上をインストールしてください。
    pause
    exit /b 1
)

echo [INFO] Pythonバージョン:
python --version
echo.

REM 仮想環境の作成
echo [INFO] 仮想環境を作成中...
python -m venv venv
if errorlevel 1 (
    echo [ERROR] 仮想環境の作成に失敗しました。
    pause
    exit /b 1
)

echo [INFO] 仮想環境を有効化中...
call venv\Scripts\activate.bat

echo.
echo [INFO] 依存関係をインストール中...
pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] 依存関係のインストールに失敗しました。
    pause
    exit /b 1
)

echo.
echo [INFO] Playwrightブラウザをインストール中...
playwright install chromium
if errorlevel 1 (
    echo [ERROR] Playwrightのインストールに失敗しました。
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   セットアップ完了！
echo ==========================================
echo.
echo 次のステップ:
echo 1. config.py を編集して Discord Botトークンを設定
echo 2. Chrome拡張機能のパスを確認
echo 3. start.bat を実行してBotを起動
echo.
echo 詳細は README.md を参照してください。
echo.
pause
