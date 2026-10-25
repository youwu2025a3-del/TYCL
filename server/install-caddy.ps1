$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$zip = Join-Path $root 'caddy.zip'
$url = 'https://caddyserver.com/api/download?os=windows&arch=amd64'
Write-Host 'Downloading Caddy for Windows amd64...'
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
Expand-Archive -LiteralPath $zip -DestinationPath $root -Force
Remove-Item -LiteralPath $zip -Force
Write-Host 'Done: ' (Join-Path $root 'caddy.exe')
