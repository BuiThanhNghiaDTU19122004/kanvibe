$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$pnpm = Join-Path (Get-Location) '.tooling\pnpm\node_modules\pnpm\bin\pnpm.cjs'
if (Test-Path -LiteralPath $pnpm) {
  & node $pnpm build
} else {
  & pnpm build
}
if ($LASTEXITCODE -ne 0) { throw 'App build failed.' }
& node -e "require('./build/main/src/lib/sqliteSchema.js').buildSeedDatabase(require('node:path').resolve('resources/database/app.seed.db'))"
if ($LASTEXITCODE -ne 0) { throw 'Seed database build failed.' }
& node node_modules/electron-builder/cli.js --win --x64 --dir --config electron-builder.windows.yml
if ($LASTEXITCODE -ne 0) { throw 'Windows packaging failed.' }
& node scripts/windows/apply-icon.cjs
if ($LASTEXITCODE -ne 0) { throw 'Windows icon update failed.' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:exe '/out:dist\windows\KanVibe-Console.exe' '/win32icon:resources\kanvibe-windows.ico' 'scripts\windows\KanVibeConsole.cs'
if ($LASTEXITCODE -ne 0) { throw 'Console launcher compilation failed.' }
Copy-Item -LiteralPath scripts/windows/Install-KanVibe.ps1 -Destination dist/windows/Install-KanVibe.ps1 -Force
Copy-Item -LiteralPath resources/kanvibe-windows.ico -Destination dist/windows/kanvibe-windows.ico -Force
@'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-KanVibe.ps1"
if errorlevel 1 pause
'@ | Set-Content -LiteralPath dist/windows/Install-KanVibe.cmd -Encoding ascii
Write-Host 'Ready: dist\windows\KanVibe-Console.exe'
Write-Host 'Install to your PC: double-click dist\windows\Install-KanVibe.cmd'
