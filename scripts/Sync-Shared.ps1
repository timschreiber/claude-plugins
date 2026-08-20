<#
.SYNOPSIS
    Copy shared assets from shared/ into each plugin that consumes them.

.DESCRIPTION
    Installed plugins are copied into ~/.claude/plugins/cache, so a plugin
    cannot reference files outside its own directory with "../". Anything
    shared between plugins must physically exist inside each one.

    shared/ is the source of truth. The vendored copies are committed so that
    a clone works without running anything. CI runs this script with -Check
    and fails the build if the copies have drifted.

.PARAMETER Check
    Verify only. Exit 1 if any vendored copy differs from its source.
#>

[CmdletBinding()]
param(
    [switch] $Check
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot

# source (relative to shared/) -> destinations (relative to repo root)
$map = @{
    'denoizinator-core/Denoizinator.Core.psm1' = @(
        'plugins/denoizinator-net/scripts/vendor/Denoizinator.Core.psm1'
    )
    'denoizinator-core/CommandSegmentation.psm1' = @(
        'plugins/denoizinator-net/scripts/vendor/CommandSegmentation.psm1'
    )
    'denoizinator-core/DotnetTestRunner.psm1' = @(
        'plugins/denoizinator-net/scripts/vendor/DotnetTestRunner.psm1'
    )
}

$drift = @()

foreach ($relSource in $map.Keys) {
    $source = Join-Path $repoRoot (Join-Path 'shared' $relSource)

    if (-not (Test-Path -LiteralPath $source)) {
        throw "Missing shared source: $source"
    }

    foreach ($relDest in $map[$relSource]) {
        $dest    = Join-Path $repoRoot $relDest
        $destDir = Split-Path -Parent $dest

        if (-not (Test-Path -LiteralPath $destDir)) {
            if ($Check) {
                $drift += $relDest
                continue
            }
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }

        $same = (Test-Path -LiteralPath $dest) -and
                ((Get-FileHash -LiteralPath $source).Hash -eq (Get-FileHash -LiteralPath $dest).Hash)

        if ($same) { continue }

        if ($Check) {
            $drift += $relDest
        }
        else {
            Copy-Item -LiteralPath $source -Destination $dest -Force
            Write-Host "synced $relDest"
        }
    }
}

if ($Check) {
    if ($drift.Count -gt 0) {
        Write-Error ("Vendored copies are stale. Run scripts/Sync-Shared.ps1 and commit:`n  " +
                     ($drift -join "`n  "))
        exit 1
    }
    Write-Host 'shared assets in sync'
}

exit 0
