<#
.SYNOPSIS
    Turns the alternation probe's per-invocation records into a verdict on
    whether the 'if' field accepts alternation.

.DESCRIPTION
    Answers, from evidence rather than documentation:

      1. Does "Bash(dotnet *)|Bash(msbuild:*)" match every dotnet/msbuild
         invocation that the unfiltered 'all-bash' control also sees?
      2. Does a three-way alternation ("Bash(dotnet build:*)|Bash(dotnet
         test:*)|Bash(msbuild:*)") behave the same way, ruling out that
         alternation only works for a single wildcard clause?
      3. Do the negative controls (git status, pwsh -c "dotnet build") stay
         out of both alternation labels?

    Reads one JSON file per invocation from .dnz-hookprobe/, same layout as
    probes/hook-behavior/Analyze-HookProbe.ps1.

.EXAMPLE
    ./Analyze-AlternationProbe.ps1
#>

[CmdletBinding()]
param(
    [string] $ProbeDir = (Join-Path $PSScriptRoot '../../.dnz-hookprobe'),
    [string] $OutJson  = (Join-Path $PSScriptRoot 'alternation-coverage.json')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ProbeDir)) {
    throw "No probe directory at $ProbeDir. Did the hooks fire? Check .claude/settings.json and that pwsh resolves from Claude Code."
}

$files = Get-ChildItem -LiteralPath $ProbeDir -Filter '*.json' -File | Sort-Object Name
if (-not $files) { throw "No records in $ProbeDir." }

$records = foreach ($f in $files) {
    try { Get-Content -LiteralPath $f.FullName -Raw | ConvertFrom-Json }
    catch { Write-Warning "unreadable: $($f.Name)" }
}

Write-Host "records: $($records.Count) from $($files.Count) files"

$errDir = Join-Path $ProbeDir 'errors'
if (Test-Path -LiteralPath $errDir) {
    $errs = Get-ChildItem -LiteralPath $errDir -File
    if ($errs) {
        Write-Warning "$($errs.Count) logger error(s) recorded -- the probe faulted, results may be incomplete:"
        $errs | Select-Object -First 3 | ForEach-Object { Write-Host "    $($_.Name)" -ForegroundColor Yellow }
    }
}

$byCall = @{}
foreach ($r in $records) {
    $cmd = try { $r.payload.tool_input.command } catch { $null }
    $id  = try { $r.payload.tool_use_id }        catch { $null }
    if (-not $cmd) { continue }
    $key = if ($id) { $id } else { "nocall::$cmd" }
    if (-not $byCall.ContainsKey($key)) {
        $byCall[$key] = [pscustomobject]@{
            Command  = $cmd
            Handlers = [System.Collections.Generic.HashSet[string]]::new()
        }
    }
    [void]$byCall[$key].Handlers.Add($r.handler)
}

$labels = $records | ForEach-Object { $_.handler } | Sort-Object -Unique

Write-Host "`n=== COVERAGE MATRIX (one row per tool call) ===" -ForegroundColor Cyan
Write-Host ("  {0,-40} {1}" -f 'command', ($labels -join '  '))
foreach ($k in ($byCall.Keys | Sort-Object { $byCall[$_].Command })) {
    $e = $byCall[$k]
    $marks = foreach ($l in $labels) { if ($e.Handlers.Contains($l)) { 'X' } else { '.' } }
    $short = if ($e.Command.Length -gt 38) { $e.Command.Substring(0,35) + '...' } else { $e.Command }
    Write-Host ("  {0,-40} {1}" -f $short, ($marks -join '  '))
}

$hasAll = $byCall.Values | Where-Object { $_.Handlers.Contains('all-bash') }
if ($hasAll.Count -eq 0) {
    Write-Warning "'all-bash' never fired. Without a working control, nothing below can be trusted."
}

# Confound control: a single, non-alternated 'if' clause known-good from
# docs/hook-behavior-findings.md section 1. If this doesn't fire correctly,
# 'if' filtering itself is broken in this session (e.g. headless -p mode, or
# a mid-session settings reload) and the alternation verdict below is not
# trustworthy -- re-run in a genuinely fresh session before concluding anything.
$controlHits  = @($byCall.Values | Where-Object { $_.Handlers.Contains('if-single-known-good') })
$controlMiss  = @($controlHits | Where-Object { $_.Command -notmatch '^\s*dotnet build\b' })
$buildCall    = @($byCall.Values | Where-Object { $_.Command -match '^\s*dotnet build\b' -and $_.Handlers.Contains('all-bash') })
$buildCallHit = @($buildCall | Where-Object { $_.Handlers.Contains('if-single-known-good') })
$controlWorks = ($buildCall.Count -gt 0) -and ($buildCallHit.Count -eq $buildCall.Count) -and ($controlMiss.Count -eq 0)

Write-Host "`n=== CONFOUND CONTROL: does a single (non-alternated) 'if' clause work here? ===" -ForegroundColor Cyan
if ($controlWorks) {
    Write-Host "  if-single-known-good fired correctly -- 'if' filtering works in this session." -ForegroundColor Green
} else {
    Write-Warning "  if-single-known-good did NOT behave as expected. 'if' filtering may be broken in this session (not just alternation). Do not trust the alternation verdict from this run."
}

# Commands the control saw that alternation SHOULD reach (dotnet or msbuild, not interpreter-wrapped)
$shouldMatch = @($byCall.Values | Where-Object {
    $_.Handlers.Contains('all-bash') -and
    ($_.Command -match '^\s*(dotnet|msbuild)\b') -and
    ($_.Command -notmatch '^\s*pwsh\b')
})
$shouldNotMatch = @($byCall.Values | Where-Object {
    $_.Handlers.Contains('all-bash') -and
    (($_.Command -match '^\s*git\b') -or ($_.Command -match '^\s*pwsh\b'))
})

function Test-Alternation {
    param([string] $Label)
    $misses = @($shouldMatch | Where-Object { -not $_.Handlers.Contains($Label) })
    $overreach = @($shouldNotMatch | Where-Object { $_.Handlers.Contains($Label) })
    [pscustomobject]@{
        Label     = $Label
        Works     = ($shouldMatch.Count -gt 0) -and ($misses.Count -eq 0) -and ($overreach.Count -eq 0)
        Misses    = @($misses | ForEach-Object { $_.Command })
        Overreach = @($overreach | ForEach-Object { $_.Command })
    }
}

$broad  = Test-Alternation -Label 'if-alt-broad'
$narrow = Test-Alternation -Label 'if-alt-narrow'

Write-Host "`n=== DOES ALTERNATION WORK? ===" -ForegroundColor Cyan
foreach ($v in @($broad, $narrow)) {
    $verdict = if ($v.Works) { 'WORKS' } else { 'DOES NOT WORK' }
    Write-Host ("  {0,-16} {1}" -f $v.Label, $verdict) -ForegroundColor $(if ($v.Works) {'Green'} else {'Yellow'})
    if ($v.Misses.Count)    { Write-Host ("    missed:     {0}" -f ($v.Misses -join ', ')) -ForegroundColor Yellow }
    if ($v.Overreach.Count) { Write-Host ("    overreach:  {0}" -f ($v.Overreach -join ', ')) -ForegroundColor Yellow }
}

$summary = [ordered]@{
    generated = (Get-Date).ToString('o')
    probeDir  = (Resolve-Path $ProbeDir).Path
    records   = $records.Count
    calls     = $byCall.Count
    labels    = @($labels)
    coverage  = @($byCall.Values | ForEach-Object {
                    [ordered]@{ command = $_.Command; handlers = @($_.Handlers) } })
    controlWorks = $controlWorks
    verdicts  = @($broad, $narrow)
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutJson -Encoding utf8
Write-Host "`nwrote $OutJson" -ForegroundColor Green
