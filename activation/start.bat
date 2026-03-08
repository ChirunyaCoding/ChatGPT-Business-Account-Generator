@echo off
chcp 65001 >nul
echo ==========================================
echo ChatGPT Activation Bot 起動
echo ==========================================
echo.

:: 親ディレクトリの.envを読み込む
cd ..

:: PythonでBotを起動
echo Botを起動しています...
python -m activation.bot

pause
