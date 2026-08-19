<#
.SYNOPSIS
    Did Claude Code honour updatedInput?

.DESCRIPTION
    Correlates what each handler emitted against whether its marker file exists.
    A marker present means the rewritten command string is the one that ran.

    Answers:
      1. Is updatedInput honoured at all?
      2. Does it require permissionDecision "allow"?
      3. When two handlers rewrite the same call, do the rewrites chain, does one
         win, or does the whole thing break?

.EXAMPLE
    ./Analyze-RewriteProbe.ps1
#>

[CmdletBinding()]
param(
    [string] $ProbeDir = (Join-Path $PSScriptRoot '../../.dnz-updatedinput'),
    [string] $OutJson  = (Join-Path $PSScriptRoot 'rewrite-results.json')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ProbeDir)) {
    throw "No probe directory at $ProbeDir. Did the handlers fire? Check .claude/settings.json."
}

$errDir = Join-Path $ProbeDir 'errors'
if (Test-Path -LiteralPath $errDir) {
    $errs = Get-ChildItem -LiteralPath $errDir -File
    if ($errs) {
        Write-Warning "$($errs.Count) handler error(s) -- the probe faulted, results are unreliable:"
        $errs | Select-Object -First 3 | ForEach-Object {
            Write-Host "    $($_.Name)" -ForegroundColor Yellow
            Get-Content $_.FullName -TotalCount 3 | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkYellow }
        }
    }
}

$records = Get-ChildItem -LiteralPath $ProbeDir -Filter 'REC_*.json' -File |
    Sort-Object Name |
    ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json }

if (-not $records) { throw "No handler records in $ProbeDir." }

Write-Host "handler invocations: $($records.Count)"

$rows = foreach ($r in $records) {
    $markerFull = Join-Path (Split-Path $ProbeDir -Parent) $r.markerPath
    [pscustomobject]@{
        Handler   = $r.handler
        Mode      = $r.mode
        Received  = $r.received
        Executed  = (Test-Path -LiteralPath $markerFull)
        ToolUseId = $r.toolUseId
        Token     = $r.token
        Emitted   = $r.emitted
    }
}

Write-Host "`n=== DID THE REWRITE EXECUTE? ===" -ForegroundColor Cyan
Write-Host ("  {0,-9} {1,-6} {2,-9} {3}" -f 'handler','mode','executed','received')
foreach ($row in $rows) {
    $color = if ($row.Executed) { 'Green' } else { 'Yellow' }
    Write-Host ("  {0,-9} {1,-6} {2,-9} {3}" -f $row.Handler, $row.Mode, $row.Executed, $row.Received) -ForegroundColor $color
}

# --- Q1/Q2 ---------------------------------------------------------------
Write-Host "`n=== IS updatedInput HONOURED? ===" -ForegroundColor Cyan
$plain = $rows | Where-Object { $_.Handler -eq 'plain' }
$allow = $rows | Where-Object { $_.Handler -eq 'allow' }

if (-not $plain) { Write-Warning "  no 'plain' record -- was 'dotnet --version' run?" }
else {
    if ($plain.Executed) { Write-Host "  plain (no permissionDecision): HONOURED" -ForegroundColor Green }
    else                 { Write-Host "  plain (no permissionDecision): IGNORED"  -ForegroundColor Yellow }
}
if (-not $allow) { Write-Warning "  no 'allow' record -- was 'dotnet --list-sdks' run?" }
else {
    if ($allow.Executed) { Write-Host "  allow (permissionDecision=allow): HONOURED" -ForegroundColor Green }
    else                 { Write-Host "  allow (permissionDecision=allow): IGNORED"  -ForegroundColor Yellow }
}

if ($plain -and $allow) {
    if     ($plain.Executed -and $allow.Executed)      { Write-Host "  => updatedInput works WITHOUT 'allow'. Do not suppress the prompt needlessly." -ForegroundColor Green }
    elseif (-not $plain.Executed -and $allow.Executed) { Write-Host "  => 'allow' is REQUIRED. The plugin bypasses the permission prompt as a side effect -- document it." -ForegroundColor Yellow }
    elseif (-not $plain.Executed -and -not $allow.Executed) { Write-Host "  => updatedInput NOT honoured in this build. The whole injection design is dead; fall back to a gitignored local .rsp." -ForegroundColor Red }
}

# --- Q3 composition ------------------------------------------------------
Write-Host "`n=== TWO HANDLERS REWRITING ONE CALL ===" -ForegroundColor Cyan
$chain = $rows | Where-Object { $_.Handler -in 'chain1','chain2' }
if ($chain.Count -lt 2) {
    Write-Warning "  fewer than 2 chain records -- was 'dotnet --list-runtimes' run?"
} else {
    foreach ($c in $chain) {
        Write-Host ("  {0}: received {1}" -f $c.Handler, $c.Received)
        Write-Host ("  {0}: executed {1}" -f $c.Handler, $c.Executed) -ForegroundColor $(if ($c.Executed) {'Green'} else {'Yellow'})
    }
    $secondSawFirst = $chain | Where-Object { $_.Received -like 'echo executed*' }
    $bothRan = ($chain | Where-Object { $_.Executed }).Count -eq 2

    if ($secondSawFirst) {
        Write-Host "  => rewrites CHAIN: a later handler receives the earlier rewrite." -ForegroundColor Green
        Write-Host "     Overlapping handlers would double-apply flags. Each must be idempotent." -ForegroundColor Yellow
    } elseif ($bothRan) {
        Write-Host "  => both rewrites applied, but each saw the ORIGINAL. Merge order is undefined." -ForegroundColor Yellow
    } else {
        Write-Host "  => exactly one rewrite survived. Handlers must not overlap on one command." -ForegroundColor Yellow
        $winner = $chain | Where-Object { $_.Executed }
        if ($winner) { Write-Host ("     winner: {0}" -f $winner.Handler) }
    }
}

Write-Host "`n=== ALSO CHECK BY HAND ===" -ForegroundColor Cyan
Write-Host "  - Did Claude report output from the rewritten command or the original?"
Write-Host "  - Did 'dotnet --list-sdks' skip the permission prompt while the others did not?"

$rows | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutJson -Encoding utf8
Write-Host "`nwrote $OutJson" -ForegroundColor Green
