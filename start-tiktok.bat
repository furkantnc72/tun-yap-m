@echo off
cd /d %~dp0
title LIVE Kingdom Battle - TikTok Bridge

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. Once https://nodejs.org adresinden Node.js LTS kur.
  pause
  exit /b 1
)

echo TikTok baglanti kutuphanesi kontrol ediliyor...
call npm install
if errorlevel 1 (
  echo npm install basarisiz oldu.
  pause
  exit /b 1
)

set TIKTOK_USERNAME=tncfurkan72
echo TikTok LIVE baglantisi baslatiliyor: @%TIKTOK_USERNAME%
echo Oyun: http://127.0.0.1:3000
echo.
call npm start
pause
