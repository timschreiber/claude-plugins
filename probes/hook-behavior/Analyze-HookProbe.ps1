<#
.SYNOPSIS
    Turn the hook probe's per-invocation records into the coverage matrix the
    spec needs.

.DESCRIPTION
    Answers, from evidence rather than documentation:

      1. Does an 'if' filter using permission-rule syntax decompose compound
         commands? (Does "cd src && dotnet build" reach if-dotnet-build?)
      2. Does a handler with NO 'if' fire alongside filtered handlers, or does
         Claude Code stop at the first match?
      3. What exactly is in tool_input.command -- raw, or normalised?
      4. Which invocation styles never reach the hook at all?

    Reads one JSON file per invocation from .dnz-hookprobe/. The earlier
    single-JSONL design lost records to concurrent-append collisions.

.EXAMPLE
    ./Analyze-HookProbe.ps1
#>

[CmdletBinding()]
param(
    [string] $ProbeDir = (Join-Path $PSScriptRoot '../../.dnz-hookprobe'),
    [string] $OutJson  = (Join-Path $PSScriptRoot 'hook-coverage.json')
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

$parseErrors = $records | Where-Object { $_.parseError }
if ($parseErrors) { Write-Warning "$($parseErrors.Count) payload(s) failed to parse as JSON" }

# --- payload shape --------------------------------------------------------
Write-Host "`n=== PAYLOAD SHAPE (first record) ===" -ForegroundColor Cyan
if ($records.Count) { $records[0].payload | ConvertTo-Json -Depth 8 }

# --- group by tool_use_id: one tool call, possibly several handlers -------
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
Write-Host ("  {0,-50} {1}" -f 'command', ($labels -join '  '))
foreach ($k in ($byCall.Keys | Sort-Object { $byCall[$_].Command })) {
    $e = $byCall[$k]
    $marks = foreach ($l in $labels) { if ($e.Handlers.Contains($l)) { 'X' } else { '.' } }
    $short = if ($e.Command.Length -gt 48) { $e.Command.Substring(0,45) + '...' } else { $e.Command }
    Write-Host ("  {0,-50} {1}" -f $short, ($marks -join '  '))
}

# --- Q2: does an unfiltered handler fire alongside filtered ones? ---------
Write-Host "`n=== DO MULTIPLE HANDLERS FIRE PER CALL? ===" -ForegroundColor Cyan
$multi  = $byCall.Values | Where-Object { $_.Handlers.Count -gt 1 }
$hasAll = $byCall.Values | Where-Object { $_.Handlers.Contains('all-bash') }
Write-Host ("  calls with >1 handler:        {0} / {1}" -f $multi.Count, $byCall.Count)
Write-Host ("  calls reaching 'all-bash':    {0} / {1}" -f $hasAll.Count, $byCall.Count)
if ($hasAll.Count -eq 0) {
    Write-Host "  'all-bash' NEVER fired. Either handlers are first-match-wins," -ForegroundColor Yellow
    Write-Host "  or an unfiltered handler is skipped when filtered ones exist." -ForegroundColor Yellow
    Write-Host "  Without a working control, absence from a filtered label is NOT" -ForegroundColor Yellow
    Write-Host "  evidence the command missed the filter. Resolve before concluding." -ForegroundColor Yellow
} elseif ($multi.Count -eq 0) {
    Write-Host "  Exactly one handler per call: first-match-wins." -ForegroundColor Yellow
} else {
    Write-Host "  Multiple handlers fire per call: all matching handlers run." -ForegroundColor Green
}

# --- Q1: the headline -----------------------------------------------------
Write-Host "`n=== DOES 'if' DECOMPOSE COMPOUND COMMANDS? ===" -ForegroundColor Cyan
$compound = $byCall.Values | Where-Object { $_.Command -match '&&|\|\||;' -and $_.Command -match 'dotnet build' }
if (-not $compound) {
    Write-Warning "  no compound 'dotnet build' calls recorded -- was commands.md run in full?"
} else {
    foreach ($c in $compound) {
        $hit = $c.Handlers.Contains('if-dotnet-build') -or $c.Handlers.Contains('if-dotnet-star')
        $verdict = if ($hit) { 'DECOMPOSES' } else { 'DOES NOT decompose' }
        Write-Host ("  {0,-50} {1}" -f $c.Command, $verdict) -ForegroundColor $(if ($hit) {'Green'} else {'Yellow'})
    }
}

Write-Host "`n=== NEVER REACHED THE HOOK ===" -ForegroundColor Cyan
Write-Host "  Compare commands.md against the matrix. Anything absent produced no PreToolUse event."

$summary = [ordered]@{
    generated = (Get-Date).ToString('o')
    probeDir  = (Resolve-Path $ProbeDir).Path
    records   = $records.Count
    calls     = $byCall.Count
    labels    = @($labels)
    coverage  = @($byCall.Values | ForEach-Object {
                    [ordered]@{ command = $_.Command; handlers = @($_.Handlers) } })
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutJson -Encoding utf8
Write-Host "`nwrote $OutJson" -ForegroundColor Green
