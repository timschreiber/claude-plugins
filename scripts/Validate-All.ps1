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

Write-Host '== tierminator tests'
# node --test takes file paths, and pwsh does not expand globs, so list the files here.
$tierminatorTests = Get-ChildItem -Path (Join-Path $repoRoot 'tests/tierminator') -Filter '*.test.js' |
    ForEach-Object { $_.FullName }
node --test @tierminatorTests
if ($LASTEXITCODE -ne 0) { $failed = $true }

Write-Host '== decidinator tests'
$decidinatorTests = Get-ChildItem -Path (Join-Path $repoRoot 'tests/decidinator') -Filter '*.test.js' |
    ForEach-Object { $_.FullName }
node --test @decidinatorTests
if ($LASTEXITCODE -ne 0) { $failed = $true }

Write-Host '== grindinator tests'
$grindinatorTests = Get-ChildItem -Path (Join-Path $repoRoot 'tests/grindinator') -Filter '*.test.js' |
    ForEach-Object { $_.FullName }
node --test @grindinatorTests
if ($LASTEXITCODE -ne 0) { $failed = $true }

Write-Host '== orcastrat portability'
$orcastrat  = Join-Path $repoRoot 'plugins/orcastrat'
$violations = @()
$violations += @(Get-ChildItem -LiteralPath $orcastrat -Recurse -File |
    Where-Object { $_.Extension -ceq '.ps1' } |
    ForEach-Object { $_.FullName })
foreach ($sub in 'scripts', 'hooks') {
    $dir = Join-Path $orcastrat $sub
    if (Test-Path -LiteralPath $dir -PathType Container) {
        $violations += @(Get-ChildItem -LiteralPath $dir -Recurse -File |
            Select-String -Pattern 'pwsh|powershell' |
            ForEach-Object { "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" })
    }
}
if ($violations.Count -gt 0) {
    $violations | ForEach-Object { Write-Host $_ }
    $failed = $true
}

if ($failed) { exit 1 }

Write-Host 'all checks passed'
exit 0
