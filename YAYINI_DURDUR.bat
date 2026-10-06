@echo off
setlocal
cd /d "%~dp0"
title LIVE Kingdom Battle - Durdur

if exist ".live-247-running" del /f /q ".live-247-running" >nul 2>nul

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$pids=@(); try{$c=Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop; $pids=$c.OwningProcess|Sort-Object -Unique}catch{}; foreach($pid in $pids){try{Stop-Process -Id $pid -Force}catch{}}"

echo 24/7 mod durduruldu.
echo Chrome penceresini istersen kendin kapatabilirsin.
timeout /t 3 >nul
endlocal
