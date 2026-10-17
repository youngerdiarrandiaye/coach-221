$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$version = '24.15.0'
$archiveName = "node-v$version-win-x64.zip"
$toolsDir = Join-Path $workspace '.tools'
New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
$archivePath = Join-Path $toolsDir $archiveName
$nodeDir = Join-Path $toolsDir "node-v$version-win-x64"
if (Test-Path -LiteralPath (Join-Path $nodeDir 'node.exe')) {
  & (Join-Path $nodeDir 'node.exe') --version
  exit $LASTEXITCODE
}
Invoke-WebRequest -Uri "https://nodejs.org/dist/v$version/$archiveName" -OutFile $archivePath -UseBasicParsing
$checksums = (Invoke-WebRequest -Uri "https://nodejs.org/dist/v$version/SHASUMS256.txt" -UseBasicParsing).Content
$expected = (($checksums -split "`n" | Where-Object { $_.Trim() -match ([regex]::Escape($archiveName) + '$') }) -split '\s+')[0]
$actual = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash
if (-not $expected -or $actual -ine $expected) { throw 'Somme SHA-256 Node.js invalide' }
Expand-Archive -LiteralPath $archivePath -DestinationPath $toolsDir -Force
& (Join-Path $nodeDir 'node.exe') --version
exit $LASTEXITCODE
