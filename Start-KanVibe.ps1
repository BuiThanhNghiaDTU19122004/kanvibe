$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
$logDirectory = Join-Path $projectDirectory 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Start-Transcript -Path (Join-Path $logDirectory 'windows-launcher.log') -Append | Out-Null
trap {
    Write-Error $_ -ErrorAction Continue
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("KanVibe could not start. See $logDirectory\windows-launcher.log", 'KanVibe') | Out-Null
    exit 1
}
$pnpmEntry = Join-Path $projectDirectory '.tooling\pnpm\node_modules\pnpm\bin\pnpm.cjs'
if (-not (Test-Path -LiteralPath $pnpmEntry)) {
    $toolDirectory = Join-Path $projectDirectory '.tooling\pnpm'
    Push-Location -LiteralPath $env:TEMP
    try {
        & npm.cmd install --prefix $toolDirectory pnpm@10.34.5 --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Could not install the project pnpm runtime.' }
    } finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory 'node_modules\electron\dist\electron.exe'))) {
    & node $pnpmEntry install --force
    if ($LASTEXITCODE -ne 0) { throw 'Could not install Windows dependencies.' }
}
& node $pnpmEntry start
if ($LASTEXITCODE -ne 0) { throw 'KanVibe could not start. See logs for details.' }
Stop-Transcript | Out-Null
