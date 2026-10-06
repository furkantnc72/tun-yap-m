$ErrorActionPreference = 'SilentlyContinue'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$flag = Join-Path $repo '.live-247-running'
$log = Join-Path $repo 'live-watchdog.log'
$bridgeLog = Join-Path $repo 'live-bridge.log'
$health = 'http://127.0.0.1:3000/health'

New-Item -ItemType File -Path $flag -Force | Out-Null

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Awake {
  [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  public static extern uint SetThreadExecutionState(uint esFlags);
}
"@

$ES_CONTINUOUS = 0x80000000
$ES_SYSTEM_REQUIRED = 0x00000001
$ES_DISPLAY_REQUIRED = 0x00000002

function Write-Log([string]$text) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $log -Value "[$stamp] $text"
}

function Bridge-Healthy {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $health -TimeoutSec 3
    return $r.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Start-Bridge {
  Write-Log 'TikTok bridge baslatiliyor.'
  $cmd = "cd /d `"$repo`" && npm start >> `"$bridgeLog`" 2>&1"
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $cmd -WindowStyle Minimized
}

Write-Log '24/7 watchdog basladi.'
$lastStart = [datetime]::MinValue

while (Test-Path $flag) {
  [Awake]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED -bor $ES_DISPLAY_REQUIRED) | Out-Null

  if (-not (Bridge-Healthy)) {
    $now = Get-Date
    if (($now - $lastStart).TotalSeconds -ge 20) {
      Start-Bridge
      $lastStart = $now
    }
  }

  Start-Sleep -Seconds 10
}

[Awake]::SetThreadExecutionState($ES_CONTINUOUS) | Out-Null
Write-Log '24/7 watchdog durdu.'
