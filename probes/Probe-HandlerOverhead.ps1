<#
.SYNOPSIS
  Measures the pwsh launch cost the unfiltered denoizinator-net handler pays
  on every Bash tool call, isolating the fast-reject path from raw pwsh
  startup and from the full match+rewrite path.

.DESCRIPTION
  Three scenarios, each timed end-to-end (process launch through exit):

    baseline      pwsh -NoProfile -Command exit -- no script, floor cost
    fast-reject   Invoke-QuietDotnet.ps1 fed a non-matching payload (git
                  status) -- the path in question, since most Bash calls hit it
    match-rewrite same script fed a matching payload (dotnet build) -- full
                  path, for context only

  Each invocation is fed a realistic PreToolUse payload on stdin, piped in
  exactly as Claude Code invokes the real hook per hooks.json. stderr is
  redirected to a file, never merged with 2>&1 -- Probe-DotnetTest.ps1 nearly
  mis-recorded a stderr NativeCommandError wrapper as runner behaviour, and
  probes/README.md calls out separating the streams for exactly this reason.

.EXAMPLE
  .\Probe-HandlerOverhead.ps1
  .\Probe-HandlerOverhead.ps1 -Iterations 100 -WarmupIterations 10
#>
[CmdletBinding()]
param(
    [string] $ScriptPath = (Join-Path $PSScriptRoot '../plugins/denoizinator-net/scripts/Invoke-QuietDotnet.ps1'),
    [int]    $Iterations = 50,
    [int]    $WarmupIterations = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ScriptPath = (Resolve-Path -LiteralPath $ScriptPath).Path

function Write-Head($t) { Write-Host "`n=== $t" -ForegroundColor Cyan }
function Write-Note($t) { Write-Host "    $t" -ForegroundColor DarkGray }

function New-Payload {
    param([string] $Command)
    @{
        session_id      = 'probe'
        transcript_path = 'probe'
        cwd              = 'probe'
        hook_event_name  = 'PreToolUse'
        tool_name        = 'Bash'
        tool_input       = @{ command = $Command; description = $Command }
        tool_use_id      = 'toolu_probe'
    } | ConvertTo-Json -Depth 6 -Compress
}

$stderrFile = Join-Path ([IO.Path]::GetTempPath()) ('dnz-overhead-stderr-{0}.txt' -f [guid]::NewGuid().ToString('N'))

function Measure-Launch {
    param(
        [string]   $Exe,
        [string[]] $ExeArgs,
        [string]   $StdinPayload
    )
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $stdinFile = [IO.Path]::GetTempFileName()
    try {
        Set-Content -LiteralPath $stdinFile -Value $StdinPayload -Encoding utf8 -NoNewline
        $p = Start-Process -FilePath $Exe -ArgumentList $ExeArgs `
                            -RedirectStandardInput $stdinFile `
                            -RedirectStandardOutput ([IO.Path]::GetTempFileName()) `
                            -RedirectStandardError $stderrFile `
                            -NoNewWindow -PassThru -Wait
    } finally {
        Remove-Item -LiteralPath $stdinFile -ErrorAction SilentlyContinue
        $sw.Stop()
    }
    return $sw.Elapsed.TotalMilliseconds
}

$scenarios = [ordered]@{
    'baseline'      = @{ Exe = 'pwsh'; ExeArgs = @('-NoProfile', '-Command', 'exit'); Payload = '' }
    'fast-reject'   = @{ Exe = 'pwsh'; ExeArgs = @('-NoProfile', '-File', $ScriptPath); Payload = (New-Payload 'git status') }
    'match-rewrite' = @{ Exe = 'pwsh'; ExeArgs = @('-NoProfile', '-File', $ScriptPath); Payload = (New-Payload 'dotnet build') }
}

$results = [ordered]@{}

foreach ($name in $scenarios.Keys) {
    $s = $scenarios[$name]
    Write-Head "warming up: $name"
    for ($i = 0; $i -lt $WarmupIterations; $i++) {
        Measure-Launch -Exe $s.Exe -ExeArgs $s.ExeArgs -StdinPayload $s.Payload | Out-Null
    }

    Write-Head "measuring: $name ($Iterations iterations)"
    $samples = [System.Collections.Generic.List[double]]::new()
    for ($i = 0; $i -lt $Iterations; $i++) {
        $samples.Add((Measure-Launch -Exe $s.Exe -ExeArgs $s.ExeArgs -StdinPayload $s.Payload))
    }

    $sorted = $samples | Sort-Object
    $p95Index = [Math]::Min($sorted.Count - 1, [Math]::Ceiling(0.95 * $sorted.Count) - 1)
    $stats = [ordered]@{
        scenario   = $name
        iterations = $sorted.Count
        minMs      = [Math]::Round(($sorted | Select-Object -First 1), 2)
        medianMs   = [Math]::Round(($sorted[[Math]::Floor($sorted.Count / 2)]), 2)
        meanMs     = [Math]::Round((($sorted | Measure-Object -Average).Average), 2)
        p95Ms      = [Math]::Round($sorted[$p95Index], 2)
        maxMs      = [Math]::Round(($sorted | Select-Object -Last 1), 2)
    }
    $results[$name] = $stats
    Write-Note ("min={0}  median={1}  mean={2}  p95={3}  max={4}" -f `
        $stats.minMs, $stats.medianMs, $stats.meanMs, $stats.p95Ms, $stats.maxMs)
}

Remove-Item -LiteralPath $stderrFile -ErrorAction SilentlyContinue

$isolatedOverhead = [Math]::Round($results['fast-reject'].medianMs - $results['baseline'].medianMs, 2)

Write-Head "HEADLINE"
Write-Host ("  fast-reject median minus baseline median: {0} ms" -f $isolatedOverhead) -ForegroundColor Yellow
Write-Note "This is the isolated Invoke-QuietDotnet.ps1 fast-reject cost, per the decision gate in docs/denoizinator-net-spec.md Phase 3."

$summary = [ordered]@{
    generated                 = (Get-Date).ToString('o')
    scriptPath                = $ScriptPath
    iterations                = $Iterations
    warmupIterations           = $WarmupIterations
    scenarios                 = $results
    isolatedFastRejectMs      = $isolatedOverhead
}

$outFile = Join-Path (Get-Location) 'handler-overhead.json'
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outFile -Encoding utf8
Write-Host "`nwrote $outFile" -ForegroundColor Green
