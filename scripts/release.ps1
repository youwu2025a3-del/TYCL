#requires -Version 5.1
[CmdletBinding()]
param(
  [string]$Version,
  [switch]$SkipBuild,
  [switch]$GitHub,
  [switch]$Cos
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Read-Json($path) {
  Read-Text $path | ConvertFrom-Json
}

function Read-Text($path) {
  [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
}

function Write-Utf8($path, $text) {
  [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

$package = Read-Json (Join-Path $root 'package.json')
$current = [string]$package.version
if (-not $Version) {
  $parts = $current.Split('.')
  $parts[$parts.Length - 1] = [string]([int]$parts[$parts.Length - 1] + 1)
  $Version = $parts -join '.'
}
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "版本号必须像 1.4.1：$Version" }

Write-Host "==> TYCL release $Version (current $current)" -ForegroundColor Cyan

# 1. 更新版本号
$package.version = $Version
Write-Utf8 (Join-Path $root 'package.json') (($package | ConvertTo-Json -Depth 20) + "`n")

$lockPath = Join-Path $root 'package-lock.json'
$lock = Read-Text $lockPath
$lock = $lock.Replace('"version": "' + $current + '"', '"version": "' + $Version + '"')
Write-Utf8 $lockPath $lock

$issPath = Join-Path $root 'installer\TYCL.iss'
$iss = Read-Text $issPath
$iss = [regex]::Replace($iss, '#define AppVersion "[^"]+"', '#define AppVersion "' + $Version + '"')
Write-Utf8 $issPath $iss

foreach ($relative in @('src\js\pages\settings.js', 'src\js\flows.js', 'src\js\mock.js')) {
  $path = Join-Path $root $relative
  $text = Read-Text $path
  $text = $text.Replace("|| '$current'", "|| '$Version'")
  $text = $text.Replace("appVersion: '$current'", "appVersion: '$Version'")
  $text = $text.Replace("currentVersion: '$current'", "currentVersion: '$Version'")
  $text = $text.Replace("latestVersion: '$current'", "latestVersion: '$Version'")
  Write-Utf8 $path $text
}

$examplePath = Join-Path $root 'update.example.json'
$example = Read-Text $examplePath
$example = $example.Replace($current, $Version)
Write-Utf8 $examplePath $example

# 2. 构建
if (-not $SkipBuild) {
  node scripts/check-syntax.js
  npm run package:win
  if ($LASTEXITCODE -ne 0) { throw 'package:win 失败' }
  npm run installer:pack
  if ($LASTEXITCODE -ne 0) { throw 'installer:pack 失败' }
  npm run update:pack
  if ($LASTEXITCODE -ne 0) { throw 'update:pack 失败' }
  npm run pages:pack
  if ($LASTEXITCODE -ne 0) { throw 'pages:pack 失败' }
}

$installer = Join-Path $root "dist\TYCL-Setup-$Version.exe"
$updateZip = Join-Path $root "dist\TYCL-update-$Version.zip"
$pagesDir = Join-Path $root 'dist\pages-upload'
$serverZip = Join-Path $root "dist\TYCL-Update-Server-$Version.zip"
if (-not (Test-Path $installer)) { throw "安装器不存在：$installer" }
if (-not (Test-Path $updateZip)) { throw "更新包不存在：$updateZip" }

# 3. 服务端包 + SHA-256
Compress-Archive -Path (Join-Path $pagesDir '*') -DestinationPath $serverZip -Force
$hash = (Get-FileHash -LiteralPath $updateZip -Algorithm SHA256).Hash.ToLower()
$size = (Get-Item -LiteralPath $updateZip).Length

# 4. COS 清单
$cosBase = 'https://tycl-1327923012.cos.ap-shanghai.myqcloud.com/tycl'
$manifest = [ordered]@{
  version     = $Version
  notes       = "TYCL $Version 更新。"
  downloadUrl = "$cosBase/TYCL-update-$Version.zip"
  downloadUrls = @(
    "$cosBase/TYCL-update-$Version.zip",
    "https://github.com/youwu2025a3-del/TYCL/releases/download/v$Version/TYCL-update-$Version.zip"
  )
  sha256      = $hash
  publishedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$manifestPath = Join-Path $root "dist\COS-update-$Version.json"
Write-Utf8 $manifestPath (($manifest | ConvertTo-Json -Depth 5) + "`n")

if ($Cos) {
  Write-Host "==> 上传 COS" -ForegroundColor Cyan
  node scripts/upload-cos.js --version $Version --manifest $manifestPath --installer $installer --update $updateZip --server $serverZip
  if ($LASTEXITCODE -ne 0) { throw 'COS 上传失败' }
}

Write-Host ""
Write-Host "==> 完成" -ForegroundColor Green
Write-Host "安装器: $installer"
Write-Host "更新包: $updateZip ($size bytes)"
Write-Host "服务端: $serverZip"
Write-Host "COS 清单: $manifestPath"
Write-Host "SHA-256: $hash"
Write-Host ""
Write-Host "上传到 COS/tycl/：" -ForegroundColor Yellow
Write-Host "  TYCL-Setup-$Version.exe"
Write-Host "  TYCL-update-$Version.zip"
Write-Host "  COS-update-$Version.json  -> 改名 update.json"
Write-Host ""
Write-Host "GitHub Release 命令：" -ForegroundColor Yellow
Write-Host "  gh release create v$Version `"dist/TYCL-Setup-$Version.exe`" `"dist/TYCL-update-$Version.zip`" --title `"TYCL $Version`""
if ($GitHub) {
  gh release create "v$Version" $installer $updateZip --title "TYCL $Version"
  if ($LASTEXITCODE -ne 0) { throw 'GitHub Release 创建失败' }
}
