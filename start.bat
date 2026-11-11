@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title SQL MASTERY LAB
set PORT=8080
if not "%~1"=="" set PORT=%~1
set URL=http://localhost:%PORT%/

echo ============================================
echo   SQL MASTERY LAB を起動します
echo   %URL%
echo   終了するときは、この画面で Ctrl+C を押すか、ウィンドウを閉じてください
echo ============================================
echo.

rem --- Node.js があれば優先して使う ---
where node >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  set "PORT=%PORT%"
  node tools\server.mjs
  goto end
)

rem --- Python（py ランチャー） ---
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 --version >nul 2>nul
  if not errorlevel 1 (
    start "" "%URL%"
    py -3 -m http.server %PORT% --bind 127.0.0.1
    goto end
  )
)

rem --- Python（python コマンド） ---
python --version >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  python -m http.server %PORT% --bind 127.0.0.1
  goto end
)

echo [エラー] Node.js も Python も見つかりませんでした。
echo どちらか一方をインストールしてから、もう一度このファイルを実行してください。
echo   Node.js: https://nodejs.org/ja  （LTS版）
echo   Python : https://www.python.org/downloads/
echo.
pause
exit /b 1

:end
echo.
echo サーバーが終了しました。ポート %PORT% が使用中の場合は、「start.bat 8081」のように別の番号を指定してください。
pause
