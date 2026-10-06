@echo off
setlocal
cd /d "%~dp0"
title LIVE Kingdom Battle - 24/7 Baslat

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [HATA] Node.js bulunamadi.
  echo Once Node.js LTS kurman gerekiyor.
  pause
  exit /b 1
)

echo ==============================================
echo   LIVE KINGDOM BATTLE - TEK TIK 24/7 MODU
echo ==============================================
echo.
echo [1/3] Koruma sistemi baslatiliyor...
start "LIVE 24-7 WATCHDOG" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File "%~dp0LIVE_WATCHDOG.ps1"

echo [2/3] Oyun sunucusu bekleniyor...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 30;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/health' -TimeoutSec 2;if($r.StatusCode -eq 200){$ok=$true;break}}catch{};Start-Sleep -Seconds 2};if($ok){exit 0}else{exit 1}"
if errorlevel 1 (
  echo [UYARI] Sunucu henuz cevap vermedi. Watchdog yeniden denemeye devam edecek.
) else (
  echo [OK] Oyun sunucusu acik.
)

echo [3/3] Chrome tam ekran aciliyor...
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

if defined CHROME (
  start "" "%CHROME%" --new-window --start-fullscreen "http://127.0.0.1:3000"
) else (
  start "" "http://127.0.0.1:3000"
)

echo.
echo HAZIR.
echo - Oyun ve TikTok bridge kendi kendine ayakta tutulur.
echo - Bilgisayar uykuya gecmez, ekran kapanmaz.
echo - Baglanti/server kapanirsa otomatik yeniden baslatilir.
echo - TikTok LIVE Studio'da yayini yine sen baslatmalisin.
echo.
echo Durdurmak icin YAYINI_DURDUR.bat dosyasini calistir.
timeout /t 8 >nul
endlocal
