# One-time local bootstrap for the DomA MCP Native Messaging manager.
# Run this file from the fork's mcp-bridge directory, with the extension ID shown in the connector panel.
param(
    [string]$ExtensionId = [string]$env:DOMA_EXTENSION_ID,
    [switch]$VerifyOnly
)
$ErrorActionPreference = 'Stop'

if ($ExtensionId -notmatch '^[a-p]{32}$') {
    throw 'Pass the 32-character Chrome/Edge extension ID with -ExtensionId.'
}

$sourceDir = Split-Path -Parent $PSCommandPath
$managerSource = Join-Path $sourceDir 'doma_mcp_manager.py'
$releaseSource = Join-Path $sourceDir 'doma_mcp_release.json'
if (-not (Test-Path -LiteralPath $managerSource -PathType Leaf) -or -not (Test-Path -LiteralPath $releaseSource -PathType Leaf)) {
    throw 'The manager and release manifest must be beside this installer in mcp-bridge.'
}
$release = Get-Content -LiteralPath $releaseSource -Raw | ConvertFrom-Json
$actualHash = (Get-FileHash -LiteralPath $managerSource -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne [string]$release.managerSha256) { throw 'Bundled manager checksum mismatch.' }

$pythonPath = $null
foreach ($name in @('python', 'python3')) {
    $candidate = Get-Command $name -ErrorAction SilentlyContinue
    if (-not $candidate) { continue }
    try {
        & $candidate.Source -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)'
        if ($LASTEXITCODE -eq 0) { $pythonPath = $candidate.Source; break }
    } catch { }
}
if (-not $pythonPath) { throw 'Install Python 3.9 or later before running this installer.' }
& $pythonPath -c 'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_bytes().decode())' $managerSource
if ($LASTEXITCODE -ne 0) { throw 'The bundled manager is not valid Python.' }
if ($VerifyOnly) {
    Write-Host 'Local MCP manager verification passed; no files or registry entries were changed.'
    return
}

$managerHome = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.doma\manager'
$managerTarget = Join-Path $managerHome 'doma_mcp_manager.py'
New-Item -ItemType Directory -Path $managerHome -Force | Out-Null
if ((Test-Path -LiteralPath $managerTarget) -and (Get-Item -LiteralPath $managerTarget -Force).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
    throw 'Refusing to overwrite a manager link or reparse point.'
}
Copy-Item -LiteralPath $managerSource -Destination $managerTarget -Force
& $pythonPath $managerTarget --register $ExtensionId
if ($LASTEXITCODE -ne 0) { throw 'Native Messaging host registration failed.' }
Write-Host 'Local MCP manager registered. Return to the connector panel, click Refresh, then Install companion.'
