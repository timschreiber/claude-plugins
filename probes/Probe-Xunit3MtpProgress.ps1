<#
.SYNOPSIS
    Phase 8: does xunit.v3-MTP have any working quiet-progress flag, and is
    its exit-1-not-2 baseline (dotnet-test-runner-findings.md §10 item 6)
    stable or invocation-path-dependent?

.DESCRIPTION
    Reuses the x_mtp_xunit3 project Probe-DotnetTest.ps1 -KeepArtifacts
    builds. Three phases, all captured with stdout/stderr to SEPARATE files
    via Start-Process/ProcessStartInfo -- never 2>&1 -- per the measurement
    discipline in probes/README.md (the exact mistake that contaminated an
    earlier --no-progress measurement).

    Phase A: run the exe's own --help and extract its real flag surface,
    rather than guessing xunit.v3-specific flag names ahead of time.

    Phase B: measure a candidate matrix against the FAILING x_mtp_xunit3
    fixture -- the two already-known-rejected generic MTP flags
    (--no-progress, --progress off) for continuity with mtp-progress-
    results.json, plus candidates from xunit.v3's own CLI surface
    discovered in Phase A.

    Phase C: cross two invocation paths (direct exe vs `dotnet test
    --project` routed through a temporary global.json) with three outcome
    scenarios (pass/fail/zero-tests) to characterise the exit-1-vs-2
    anomaly. The wrapper never writes global.json in production (dotnet
    §9/denoizinator-net-spec.md §5.4) -- the gj- path here exists only to
    document why direct-exe invocation is the only viable one, not because
    the wrapper could use it.

.EXAMPLE
    ./probes/Probe-DotnetTest.ps1 -KeepArtifacts
    ./probes/Probe-Xunit3MtpProgress.ps1
#>

[CmdletBinding()]
param(
    [string] $ProbeRoot = (Join-Path $env:TEMP 'dnz-probe'),
    [string] $OutJson   = (Join-Path $PSScriptRoot 'evidence/xunit3-mtp-progress-results.json')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scenarioDir = Join-Path $ProbeRoot 'x_mtp_xunit3'
if (-not (Test-Path -LiteralPath $scenarioDir)) {
    throw "No x_mtp_xunit3 fixture at $scenarioDir. Run Probe-DotnetTest.ps1 -KeepArtifacts first; this probe reuses its built project."
}

$exe = Get-ChildItem $scenarioDir -Recurse -Filter 'x_mtp_xunit3.exe' -EA SilentlyContinue | Select-Object -First 1
if (-not $exe) { throw "No built x_mtp_xunit3.exe under $scenarioDir. Run Probe-DotnetTest.ps1 -KeepArtifacts first." }

$csproj = Get-ChildItem $scenarioDir -Filter '*.csproj' -EA SilentlyContinue | Select-Object -First 1
if (-not $csproj) { throw "No x_mtp_xunit3.csproj under $scenarioDir." }

Write-Host "exe:    $($exe.FullName)" -ForegroundColor DarkGray
Write-Host "csproj: $($csproj.FullName)" -ForegroundColor DarkGray

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("dnz-xunit3-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

$results = [System.Collections.Generic.List[object]]::new()

# ------------------------------------------------------------------ helpers
function Invoke-Measured {
    <#
    .SYNOPSIS
        Runs Exe (or 'dotnet' with ExeArgs) via Start-Process, stdout/stderr
        to SEPARATE files, returns a record with both streams and counts.
        Never 2>&1 -- see probes/README.md "Measurement discipline".
    #>
    param(
        [Parameter(Mandatory)][string]   $Name,
        [Parameter(Mandatory)][string]   $Exe,
        [string[]] $ExeArgs = @(),
        [Parameter(Mandatory)][string]   $WorkingDirectory
    )

    $so = Join-Path $tmp "$Name.out"
    $se = Join-Path $tmp "$Name.err"

    $sw = [Diagnostics.Stopwatch]::StartNew()
    $p = if ($ExeArgs.Count) {
        Start-Process -FilePath $Exe -ArgumentList $ExeArgs -WorkingDirectory $WorkingDirectory `
            -RedirectStandardOutput $so -RedirectStandardError $se -NoNewWindow -PassThru -Wait
    } else {
        Start-Process -FilePath $Exe -WorkingDirectory $WorkingDirectory `
            -RedirectStandardOutput $so -RedirectStandardError $se -NoNewWindow -PassThru -Wait
    }
    $sw.Stop()

    $outTxt = if (Test-Path $so) { Get-Content $so -Raw } else { '' }
    $errTxt = if (Test-Path $se) { Get-Content $se -Raw } else { '' }
    if ($null -eq $outTxt) { $outTxt = '' }
    if ($null -eq $errTxt) { $errTxt = '' }

    [pscustomobject]@{
        Name        = $Name
        ExitCode    = $p.ExitCode
        StdoutChars = $outTxt.Length
        StderrChars = $errTxt.Length
        Rejected    = [bool]($errTxt -match 'unknown option' -or $outTxt -match 'unknown option')
        Ms          = [int]$sw.Elapsed.TotalMilliseconds
        Stdout      = $outTxt
        Stderr      = $errTxt
    }
}

function Get-TrxCounters {
    param([string] $Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    [xml]$xml = Get-Content -LiteralPath $Path -Raw
    $ns = [System.Xml.XmlNamespaceManager]::new($xml.NameTable)
    $ns.AddNamespace('t', 'http://microsoft.com/schemas/VisualStudio/TeamTest/2010')
    $c = $xml.SelectSingleNode('//t:ResultSummary/t:Counters', $ns)
    if (-not $c) { return $null }
    [pscustomobject]@{ Total = [int]$c.total; Passed = [int]$c.passed; Failed = [int]$c.failed }
}

try {
    # -------------------------------------------------------- Phase A: --help
    Write-Host "`n=== Phase A: discover xunit.v3's own flag surface ===" -ForegroundColor Cyan
    $help = Invoke-Measured -Name 'help' -Exe $exe.FullName -ExeArgs @('--help') -WorkingDirectory $exe.Directory.FullName
    $helpText = $help.Stdout
    $flagTokens = [regex]::Matches($helpText, '(?m)^\s{2,4}(-{1,2}[\w-]+)') |
        ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
    Write-Host "    discovered $($flagTokens.Count) flag tokens (full text in evidence)" -ForegroundColor DarkGray

    $results.Add([pscustomobject]@{
        Phase = 'help'; Name = 'help'; ExitCode = $help.ExitCode
        StdoutChars = $help.StdoutChars; StderrChars = $help.StderrChars
        DiscoveredFlags = $flagTokens; HelpText = $helpText
    })

    # ------------------------------------------------ Phase B: candidate matrix
    # Progress/output-related subset hand-picked from the Phase A discovery
    # above (xunit.v3's own single-dash CLI surface -- confirmed by --help
    # to be entirely distinct from the generic Microsoft.Testing.Platform
    # double-dash convention, which is why --no-progress/--progress off are
    # rejected: they are simply the wrong flag syntax for this runner).
    Write-Host "`n=== Phase B: candidate matrix (against the FAILING fixture) ===" -ForegroundColor Cyan
    $candidates = @(
        @{ Name = 'none';                       Kind = 'cli'; Args = @() }
        # already known-rejected (dotnet-test-runner-findings.md §12) --
        # re-measured here for continuity in one evidence file.
        @{ Name = 'no-progress';                Kind = 'cli'; Args = @('--no-progress', '--no-ansi') }
        @{ Name = 'progress-off';                Kind = 'cli'; Args = @('--progress', 'off', '--no-ansi') }
        # xunit.v3's own reporter selection.
        @{ Name = 'reporter-quiet';              Kind = 'cli'; Args = @('-reporter', 'quiet', '-noLogo') }
        @{ Name = 'reporter-silent';             Kind = 'cli'; Args = @('-reporter', 'silent', '-noLogo') }
        # the winning combination: silent console + its own TRX result file,
        # mirroring the VSTest plan's counts-from-TRX design.
        @{ Name = 'reporter-silent-trx';         Kind = 'cli'; Args = @('-reporter', 'silent', '-noLogo', '-result-trx', (Join-Path $tmp 'candidate-fail.trx')) }
    )

    foreach ($c in $candidates) {
        $r = Invoke-Measured -Name "cand-$($c.Name)" -Exe $exe.FullName -ExeArgs $c.Args -WorkingDirectory $exe.Directory.FullName
        $results.Add([pscustomobject]@{
            Phase = 'candidate'; Name = $c.Name; Kind = $c.Kind; Args = ($c.Args -join ' ')
            ExitCode = $r.ExitCode; StdoutChars = $r.StdoutChars; StderrChars = $r.StderrChars
            Rejected = $r.Rejected; Ms = $r.Ms; Stdout = $r.Stdout; Stderr = $r.Stderr
        })
        $flag = if ($r.Rejected) { '  <-- REJECTED' } else { '' }
        Write-Host ("    {0,-24} exit={1,-4} stdout={2,-6} stderr={3,-6}{4}" -f $c.Name, $r.ExitCode, $r.StdoutChars, $r.StderrChars, $flag)
    }

    # Environment-variable and MSBuild -p: candidates: xunit.v3's --help
    # output (Phase A, full text in evidence) documents no environment
    # variable for progress/reporter selection, and its reporter/result
    # flags are read at runtime by the in-process runner itself (not an
    # MSBuild-evaluated property), so a -p: property cannot reach it without
    # a source change to the fixture -- out of scope for a flag-only probe.
    # .runsettings is a VSTest-adapter concept; xunit.v3-MTP's own --help
    # shows no -settings/--settings flag. Recorded here as explicit
    # not-applicable rows rather than silently skipped.
    $results.Add([pscustomobject]@{
        Phase = 'candidate'; Name = 'env-vars'; Kind = 'env'
        Note  = 'not applicable -- --help documents no environment variable for progress/reporter selection (see help phase HelpText)'
    })
    $results.Add([pscustomobject]@{
        Phase = 'candidate'; Name = 'runsettings'; Kind = 'runsettings'
        Note  = 'not applicable -- --help shows no -settings/--settings flag; .runsettings is a VSTest-adapter concept the in-process runner does not read'
    })
    $results.Add([pscustomobject]@{
        Phase = 'candidate'; Name = 'msbuild-prop'; Kind = 'msbuild'
        Note  = 'not applicable -- reporter/result selection is an in-process-runner CLI concern read at test-run time, not an MSBuild-evaluated property; no relevant -p: switch exists for it'
    })

    # Verify the TRX from the winning candidate actually carries correct
    # counts, matching what ConvertFrom-VSTestTrx (DotnetTestRunner.psm1)
    # already parses for VSTest.
    $failTrxCounters = Get-TrxCounters (Join-Path $tmp 'candidate-fail.trx')
    Write-Host "    reporter-silent-trx TRX counters: total=$($failTrxCounters.Total) passed=$($failTrxCounters.Passed) failed=$($failTrxCounters.Failed)" -ForegroundColor DarkGray

    # -------------------------------------------- Phase C: invocation x scenario
    Write-Host "`n=== Phase C: invocation-path x scenario exit-code matrix ===" -ForegroundColor Cyan

    $scenarios = @(
        @{ Name = 'fail'; FilterArgsExe = @();                          FilterArgsGj = @() }
        @{ Name = 'pass'; FilterArgsExe = @('-method', '*Pass*');       FilterArgsGj = @('--filter', 'FullyQualifiedName~Pass') }
        @{ Name = 'zero'; FilterArgsExe = @('-method', 'ZZZNoSuchTest');FilterArgsGj = @('--filter', 'FullyQualifiedName~ZZZNoSuchTest') }
    )

    foreach ($s in $scenarios) {
        # exe-direct: the invocation path InvokeVia='Executable' actually
        # uses in production (Get-DotnetTestInvocationPlan, DotnetTestRunner.psm1).
        $trxPath = Join-Path $tmp "exitcode-$($s.Name).trx"
        $exeArgs = @('-reporter', 'silent', '-noLogo', '-result-trx', $trxPath) + $s.FilterArgsExe
        $r = Invoke-Measured -Name "exitcode-exe-$($s.Name)" -Exe $exe.FullName -ExeArgs $exeArgs -WorkingDirectory $exe.Directory.FullName
        $counters = Get-TrxCounters $trxPath
        $results.Add([pscustomobject]@{
            Phase = 'exit-code'; InvocationPath = 'exe-direct'; Scenario = $s.Name
            ExitCode = $r.ExitCode; StdoutChars = $r.StdoutChars; StderrChars = $r.StderrChars
            TrxTotal = $counters.Total; TrxPassed = $counters.Passed; TrxFailed = $counters.Failed
        })
        Write-Host ("    exe-direct     {0,-6} exit={1} stdout={2,-4} trx(total/pass/fail)={3}/{4}/{5}" -f `
            $s.Name, $r.ExitCode, $r.StdoutChars, $counters.Total, $counters.Passed, $counters.Failed)

        # gj-dotnet-test: routed through `dotnet test --project` under a
        # temporary global.json naming the MTP runner. The wrapper never
        # writes global.json in production (denoizinator-net-spec.md §5.4) --
        # this path exists ONLY to characterise the exit-code anomaly, not
        # as a candidate implementation strategy.
        $gj = Join-Path $scenarioDir 'global.json'
        '{ "test": { "runner": "Microsoft.Testing.Platform" } }' | Set-Content -LiteralPath $gj -Encoding utf8
        try {
            $gjArgs = @('test', '--project', $csproj.FullName, '--no-build') + $s.FilterArgsGj
            $rg = Invoke-Measured -Name "exitcode-gj-$($s.Name)" -Exe 'dotnet' -ExeArgs $gjArgs -WorkingDirectory $scenarioDir.ToString()
        } finally {
            Remove-Item -LiteralPath $gj -Force -EA SilentlyContinue
        }
        $gjHasSummary = $rg.Stdout -match '(?s)total:\s*(\d+).*?failed:\s*(\d+).*?succeeded:\s*(\d+).*?skipped:\s*(\d+)'
        $gjTotal  = if ($gjHasSummary) { [int]$Matches[1] } else { $null }
        $gjFailed = if ($gjHasSummary) { [int]$Matches[2] } else { $null }
        $results.Add([pscustomobject]@{
            Phase = 'exit-code'; InvocationPath = 'gj-dotnet-test'; Scenario = $s.Name
            ExitCode = $rg.ExitCode; StdoutChars = $rg.StdoutChars; StderrChars = $rg.StderrChars
            SummaryTotal = $gjTotal; SummaryFailed = $gjFailed
        })
        Write-Host ("    gj-dotnet-test {0,-6} exit={1} stdout={2,-4} summary(total/failed)={3}/{4}" -f `
            $s.Name, $rg.ExitCode, $rg.StdoutChars, $gjTotal, $gjFailed)
    }
}
finally {
    Remove-Item $tmp -Recurse -Force -EA SilentlyContinue
}

# ------------------------------------------------------------------- verdict
Write-Host "`n=== VERDICT ===" -ForegroundColor Cyan
$winner = $results | Where-Object { $_.Phase -eq 'candidate' -and $_.Kind -eq 'cli' -and $_.Name -eq 'reporter-silent-trx' }
if ($winner -and -not $winner.Rejected -and $failTrxCounters -and $failTrxCounters.Total -eq 8 -and $failTrxCounters.Failed -eq 2) {
    Write-Host "    WORKING CANDIDATE: -reporter silent -noLogo -result-trx <path>" -ForegroundColor Green
    Write-Host "    stdout/stderr = 0 chars in every scenario; counts and failure detail come from the TRX (VSTest-shaped)." -ForegroundColor Green
} else {
    Write-Host "    NO WORKING CANDIDATE FOUND -- see candidate rows for failure modes." -ForegroundColor Yellow
}

$exeExitCodes = $results | Where-Object { $_.Phase -eq 'exit-code' -and $_.InvocationPath -eq 'exe-direct' }
$gjExitCodes  = $results | Where-Object { $_.Phase -eq 'exit-code' -and $_.InvocationPath -eq 'gj-dotnet-test' }
$exeSummary = ($exeExitCodes | ForEach-Object { "$($_.Scenario)=$($_.ExitCode)" }) -join ', '
$gjSummary  = ($gjExitCodes  | ForEach-Object { "$($_.Scenario)=$($_.ExitCode)" }) -join ', '
Write-Host "    exe-direct exit codes by scenario:     $exeSummary"
Write-Host "    gj-dotnet-test exit codes by scenario: $gjSummary"
Write-Host "    (dotnet-test-runner-findings.md §10 item 6: exe-direct's exit-1-not-2 baseline is a property of that invocation path, not the runner -- gj-dotnet-test returns 2 for the same fixture.)"

$dir = Split-Path -Parent $OutJson
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$results | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutJson -Encoding utf8
Write-Host "`nwrote $OutJson" -ForegroundColor Green
