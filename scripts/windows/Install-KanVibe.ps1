param([switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'win-unpacked'
if (-not (Test-Path -LiteralPath (Join-Path $source 'KanVibe.exe'))) {
    throw 'Keep this installer next to the win-unpacked folder.'
}
$destination = Join-Path $env:LOCALAPPDATA 'Programs\KanVibe'
if (Get-Process -Name KanVibe -ErrorAction SilentlyContinue) {
    throw 'Close KanVibe before installing or updating.'
}
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$installedApp = Join-Path $destination 'win-unpacked'
New-Item -ItemType Directory -Path $installedApp -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $installedApp -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'KanVibe-Console.exe') -Destination $destination -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'kanvibe-windows.ico') -Destination $destination -Force
$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$programs = Join-Path ([Environment]::GetFolderPath('Programs')) 'KanVibe'
New-Item -ItemType Directory -Path $programs -Force | Out-Null
foreach ($shortcutPath in @((Join-Path $desktop 'KanVibe.lnk'), (Join-Path $programs 'KanVibe.lnk'))) {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $installedApp 'KanVibe.exe'
    $shortcut.WorkingDirectory = $installedApp
    $shortcut.IconLocation = (Join-Path $destination 'kanvibe-windows.ico') + ',0'
    $shortcut.Description = 'KanVibe - AI coding workspace'
    $shortcut.Save()
}
$consoleShortcut = $shell.CreateShortcut((Join-Path $programs 'KanVibe Console.lnk'))
$consoleShortcut.TargetPath = Join-Path $destination 'KanVibe-Console.exe'
$consoleShortcut.WorkingDirectory = $destination
$consoleShortcut.IconLocation = (Join-Path $destination 'kanvibe-windows.ico') + ',0'
$consoleShortcut.Save()
Write-Host "Installed: $destination"
Write-Host 'Desktop and Start Menu shortcuts created.'
if (-not $NoLaunch) { Start-Process -FilePath (Join-Path $installedApp 'KanVibe.exe') }
