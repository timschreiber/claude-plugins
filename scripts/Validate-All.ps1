<#
.SYNOPSIS
    Validate the marketplace catalog and every plugin in it.

.DESCRIPTION
    "claude plugin validate ." against the repo root checks marketplace.json for
    schema errors, duplicate plugin names, and source path traversal, and
    validates each relative-source plugin's plugin.json.

    It does NOT check skill, agent, or command frontmatter, or hooks.json syntax,
    unless it is pointed at a plugin directory. A malformed hooks.json prevents
    the entire plugin from loading and is otherwise silent, so validate each
    plugin directory as well.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$failed   = $false

Write-Host '== marketplace'
claude plugin validate $repoRoot
if ($LASTEXITCODE -ne 0) { $failed = $true }

Get-ChildItem -Path (Join-Path $repoRoot 'plugins') -Directory | ForEach-Object {
    Write-Host "== $($_.Name)"
    claude plugin validate $_.FullName
    if ($LASTEXITCODE -ne 0) { $failed = $true }
}

Write-Host '== shared asset drift'
& (Join-Path $PSScriptRoot 'Sync-Shared.ps1') -Check
if ($LASTEXITCODE -ne 0) { $failed = $true }

if ($failed) { exit 1 }

Write-Host 'all checks passed'
exit 0
