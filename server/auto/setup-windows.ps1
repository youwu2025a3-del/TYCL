# TYCL update server one-click setup for Windows
# Run from the extracted TYCL-Server-Auto folder.

$ErrorActionPreference = 'Stop'

function Fail([string]$message) {
  Write-Host ''
  Write-Host 'ERROR: ' + $message -ForegroundColor Red
  Write-Host ''
  Read-Host 'Press Enter to exit'
  exit 1
}

try {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host 'Requesting administrator permission...'
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
    exit 0
  }

  Write-Host ''
  Write-Host '==============================================' -ForegroundColor Cyan
  Write-Host '  TYCL Update Server Setup for Windows' -ForegroundColor Cyan
  Write-Host '==============================================' -ForegroundColor Cyan
  Write-Host ''

  $detectedIp = ''
  try {
    $detectedIp = (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 10).Trim()
  } catch {
    $detectedIp = ''
  }

  if ($detectedIp) {
    $answer = Read-Host ('Public IP or domain [' + $detectedIp + ']')
  } else {
    $answer = Read-Host 'Public IP or domain (for example 1.2.3.4 or tycl.example.com)'
  }
  if ([string]::IsNullOrWhiteSpace($answer)) { $answer = $detectedIp }
  if ([string]::IsNullOrWhiteSpace($answer)) { Fail 'A public IP or domain is required.' }
  $publicHost = ($answer.Trim() -replace '^https?://', '' -replace '/.*$', '')

  $portAnswer = Read-Host 'Local HTTP port [8080]'
  if ([string]::IsNullOrWhiteSpace($portAnswer)) { $portAnswer = '8080' }
  $port = 0
  if (-not [int]::TryParse($portAnswer, [ref]$port) -or $port -lt 1 -or $port -gt 65535) {
    Fail 'Invalid local port.'
  }

  $publicPortAnswer = Read-Host ('Public port [' + $port + '] (use NAT mapped port if different)')
  if ([string]::IsNullOrWhiteSpace($publicPortAnswer)) { $publicPortAnswer = [string]$port }
  $publicPort = 0
  if (-not [int]::TryParse($publicPortAnswer, [ref]$publicPort) -or $publicPort -lt 1 -or $publicPort -gt 65535) {
    Fail 'Invalid public port.'
  }

  $installDir = 'C:\TYCL-Server'
  $publicDir = Join-Path $installDir 'public'
  New-Item -ItemType Directory -Force -Path $publicDir | Out-Null

  $sourceZip = Get-ChildItem -Path (Join-Path $PSScriptRoot 'public') -Filter 'TYCL-update-*.zip' -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $sourceZip) {
    Fail 'No TYCL-update-*.zip found in the public folder. Please extract the full deployment kit.'
  }
  Copy-Item -LiteralPath $sourceZip.FullName -Destination (Join-Path $publicDir $sourceZip.Name) -Force
  Write-Host ('Copied update package: ' + $sourceZip.Name)

  $zipName = $sourceZip.BaseName
  $version = ($zipName -replace '^TYCL-update-', '')
  if ([string]::IsNullOrWhiteSpace($version)) { $version = '1.1.0' }

  $caddyPath = Join-Path $installDir 'caddy.exe'
  if (-not (Test-Path -LiteralPath $caddyPath)) {
    Write-Host 'Downloading Caddy...'
    $caddyZip = Join-Path $env:TEMP ('tycl-caddy-' + [guid]::NewGuid().ToString('N') + '.zip')
    Invoke-WebRequest -Uri 'https://caddyserver.com/api/download?os=windows&arch=amd64' -OutFile $caddyZip -UseBasicParsing
    $extractDir = Join-Path $env:TEMP ('tycl-caddy-' + [guid]::NewGuid().ToString('N'))
    Expand-Archive -LiteralPath $caddyZip -DestinationPath $extractDir -Force
    $foundCaddy = Get-ChildItem -Path $extractDir -Filter 'caddy.exe' -Recurse -File | Select-Object -First 1
    if (-not $foundCaddy) { Fail 'caddy.exe was not found in the downloaded archive.' }
    Copy-Item -LiteralPath $foundCaddy.FullName -Destination $caddyPath -Force
    Remove-Item -LiteralPath $caddyZip -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'Caddy installed.'
  } else {
    Write-Host 'Caddy already installed.'
  }

  $caddyRoot = $publicDir.Replace('\', '/')
  $caddyLog = (Join-Path $installDir 'access.log').Replace('\', '/')
  $caddyfile = @"
:$port {
    root * $caddyRoot
    file_server
    encode gzip
    log {
        output file $caddyLog
    }
}
"@
  [System.IO.File]::WriteAllText((Join-Path $installDir 'Caddyfile'), $caddyfile, (New-Object System.Text.UTF8Encoding($false)))

  $fallbackBat = @"
@echo off
cd /d "%~dp0"
caddy.exe run --config Caddyfile
pause
"@
  [System.IO.File]::WriteAllText((Join-Path $installDir 'start-server.bat'), $fallbackBat, (New-Object System.Text.UTF8Encoding($false)))

  $existingRule = Get-NetFirewallRule -DisplayName 'TYCL Update Server' -ErrorAction SilentlyContinue
  if (-not $existingRule) {
    New-NetFirewallRule -DisplayName 'TYCL Update Server' -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow | Out-Null
    Write-Host ('Firewall rule added for TCP ' + $port)
  } else {
    Write-Host 'Firewall rule already exists.'
  }

  $zipFullPath = Join-Path $publicDir $sourceZip.Name
  $sha256 = (Get-FileHash -LiteralPath $zipFullPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $portSuffix = ''
  if ($publicPort -ne 80) { $portSuffix = ':' + $publicPort }
  $downloadUrl = 'http://' + $publicHost + $portSuffix + '/' + $sourceZip.Name
  $manifest = [ordered]@{
    version = $version
    notes = 'TYCL update server is ready.'
    downloadUrl = $downloadUrl
    sha256 = $sha256
    publishedAt = (Get-Date).ToUniversalTime().ToString('o')
    mandatory = $false
  } | ConvertTo-Json -Depth 4
  [System.IO.File]::WriteAllText((Join-Path $publicDir 'update.json'), $manifest, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'update.json generated.'

  Get-Process -Name caddy -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 300
  Start-Process -FilePath $caddyPath -ArgumentList @('run', '--config', (Join-Path $installDir 'Caddyfile')) -WorkingDirectory $installDir -WindowStyle Hidden
  Start-Sleep -Seconds 2

  $taskName = 'TYCL Update Server'
  try {
    $action = New-ScheduledTaskAction -Execute $caddyPath -Argument ('run --config "' + (Join-Path $installDir 'Caddyfile') + '"') -WorkingDirectory $installDir
    $trigger = New-ScheduledTaskTrigger -AtStartup
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
    Write-Host 'Startup task installed. The server will start automatically after reboot.'
  } catch {
    Write-Host ('Warning: could not create startup task: ' + $_.Exception.Message) -ForegroundColor Yellow
  }

  $test = $null
  try {
    $test = Invoke-WebRequest -Uri ('http://127.0.0.1:' + $port + '/update.json') -UseBasicParsing -TimeoutSec 10
  } catch {
    Fail ('Caddy is not responding on local port ' + $port + '. Check Windows Firewall and port availability. ' + $_.Exception.Message)
  }
  if ($test.StatusCode -ne 200) { Fail ('Local test returned HTTP ' + $test.StatusCode) }

  Write-Host ''
  Write-Host '==============================================' -ForegroundColor Green
  Write-Host '  SUCCESS' -ForegroundColor Green
  Write-Host '==============================================' -ForegroundColor Green
  Write-Host ''
  Write-Host 'Put this URL into TYCL -> Settings -> Update & Announcements:' -ForegroundColor White
  Write-Host ('  http://' + $publicHost + $portSuffix + '/update.json') -ForegroundColor Cyan
  Write-Host ''
  Write-Host ('Local files: ' + $publicDir)
  Write-Host ('Server log:  ' + (Join-Path $installDir 'access.log'))
  Write-Host ''
  Write-Host 'If this is a NAT server, make sure the provider forwards the public port to local port ' + $port + '.'
  Write-Host 'Test from another network/mobile data if possible.'
  Write-Host ''
  Read-Host 'Press Enter to close'
} catch {
  Fail $_.Exception.Message
}
