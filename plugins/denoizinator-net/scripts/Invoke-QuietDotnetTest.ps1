<#
.SYNOPSIS
    Wrapper invoked by the hook in place of a bare 'dotnet test'.

.DESCRIPTION
    Invoked as: pwsh -NoProfile -File Invoke-QuietDotnetTest.ps1 -- dotnet test <args>

    Detects the test runner (VSTest vs Microsoft.Testing.Platform, and which
    framework: MSTest/NUnit/xunit.v3), picks the flags that are actually safe
    for that runner+TFM (see docs/dotnet-test-runner-findings.md §12 -- a
    flag safe on one runner+TFM can cost 2-4x the verbose baseline on
    another), and emits a normalised TEST PASS|FAIL|NONE|RAW|UNKNOWN summary
    instead of the raw runner output. See docs/denoizinator-net-spec.md §6
    Phase 4 for the full design, including the exit-code and passthrough
    contracts this script implements:

      0 = TEST PASS, 1 = TEST FAIL, 2 = TEST NONE, 3 = TEST UNKNOWN.
      Passthrough (TEST RAW) is the one exception: exit code mirrors the raw
      runner's, since the wrapper isn't claiming to have normalised anything.

    Never writes global.json -- runner detection is read-only, which is what
    lets a repo with mixed VSTest/MTP test projects keep working.

    No declared param() block, deliberately: 'pwsh -File script.ps1 -- dotnet
    test -- --report-trx' has TWO bare '--' tokens, and a declared
    [Parameter(ValueFromRemainingArguments)] positional aborts PowerShell's
    own parameter binder entirely the instant it sees ANY bare '--' anywhere
    in the arg list ("A positional parameter cannot be found that accepts
    argument ..."), regardless of position -- confirmed by hand, this is a
    host-level parsing failure that happens before the script body even
    runs, not something a try/catch inside the script can rescue. With no
    param() block at all, unbound arguments fall back to the automatic
    $args variable instead, which passes every token -- including bare '--'
    ones -- through untouched.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Import-Module (Join-Path $PSScriptRoot 'vendor/DotnetTestRunner.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'vendor/Denoizinator.Core.psm1') -Force

function Write-DnzDebugLog {
    param([string] $Message)
    if (-not $env:DNZ_DEBUG) { return }
    try {
        $line = '[{0}] [{1}] {2}' -f (Get-Date).ToString('o'), $PID, $Message
        Add-Content -LiteralPath (Join-Path ([IO.Path]::GetTempPath()) 'dnz-debug.log') `
                    -Value $line -Encoding utf8 -ErrorAction Stop
    } catch { }   # logging must never itself throw
}

function Invoke-CapturedProcess {
    <#
    .SYNOPSIS
        Runs a process with stdout and stderr captured to SEPARATE strings --
        never merged (2>&1 wraps native stderr into a NativeCommandError and
        contaminates the capture; this exact bug is documented in
        docs/dotnet-test-runner-findings.md §5/§12 and is why that doc's
        measurements were redone with streams kept apart).
    #>
    param(
        [Parameter(Mandatory)][string]   $Exe,
        [Parameter(Mandatory)][string[]] $ProcArgs,
        [Parameter(Mandatory)][string]   $WorkingDirectory
    )

    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName               = $Exe
    $psi.WorkingDirectory        = $WorkingDirectory
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $psi.UseShellExecute        = $false
    foreach ($a in $ProcArgs) { $psi.ArgumentList.Add($a) }

    $sw   = [Diagnostics.Stopwatch]::StartNew()
    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
    $stderrTask = $proc.StandardError.ReadToEndAsync()
    $proc.WaitForExit()
    $sw.Stop()

    [pscustomobject]@{
        ExitCode = $proc.ExitCode
        Stdout   = $stdoutTask.Result
        Stderr   = $stderrTask.Result
        Seconds  = $sw.Elapsed.TotalSeconds
    }
}

function Get-MtpInlineFailures {
    <#
    .SYNOPSIS
        MTP's console output carries failure detail inline (no TRX involved
        for MTP at all -- see docs/dotnet-test-runner-findings.md §5).
        Extracts test name + first message line from each 'failed <Name>'
        block, up to the next 'failed ' line or the summary footer.
    #>
    param([Parameter(Mandatory)][string] $Stdout, [int] $MaxFailures = 5)

    $lines = $Stdout -split "`r?`n"
    $all = [System.Collections.Generic.List[object]]::new()
    $i = 0
    while ($i -lt $lines.Count) {
        if ($lines[$i] -match '^failed (\S+)') {
            $name = $Matches[1]
            $i++
            $msgLines = @()
            while ($i -lt $lines.Count -and $lines[$i] -notmatch '^failed \S' -and $lines[$i] -notmatch '^Test run summary:') {
                if ($lines[$i].Trim()) { $msgLines += $lines[$i].Trim() }
                $i++
            }
            $message = if ($msgLines.Count -gt 0) { $msgLines[0] } else { '(no failure message)' }
            $all.Add([pscustomobject]@{ TestName = $name; Message = $message })
        } else {
            $i++
        }
    }

    $shown = @($all | Select-Object -First $MaxFailures)
    [pscustomobject]@{ Failures = $shown; OmittedFailureCount = [Math]::Max(0, $all.Count - $shown.Count) }
}

try {
    $parts = @($args)

    # A literal '--' from the hook's dispatch template ('pwsh ... --') is not
    # special to PowerShell's own parameter binding (that's a POSIX/getopt
    # convention, not one pwsh -File applies itself), so it arrives as a real
    # array element. Strip exactly one leading occurrence.
    if ($parts.Count -gt 0 -and $parts[0] -eq '--') { $parts = @($parts[1..($parts.Count - 1)]) }

    if ($parts.Count -eq 0) { exit 0 }

    if ($parts.Count -lt 2 -or $parts[0] -ne 'dotnet' -or $parts[1] -ne 'test') {
        # Defensive-only -- shouldn't happen given how the hook constructs
        # this dispatch. Run whatever we were actually given, verbatim, and
        # get out of the way rather than guess. ("Clamp, never deny",
        # extended to the wrapper: confusion never crashes.)
        $exe  = $parts[0]
        # NOTE: not '$rest = if (...) { @(...) } else { @() }' -- PowerShell
        # unrolls an array 'output' by an if/else expression branch, so an
        # empty-array branch collapses the assignment to $null instead of an
        # empty array, and $null.Count throws under Set-StrictMode. Plain
        # sequential assignment avoids the expression-capture unroll.
        $rest = @()
        if ($parts.Count -gt 1) { $rest = @($parts[1..($parts.Count - 1)]) }
        $r = Invoke-CapturedProcess -Exe $exe -ProcArgs $rest -WorkingDirectory (Get-Location).Path
        if ($r.Stdout) { Write-Output $r.Stdout }
        if ($r.Stderr) { [Console]::Error.Write($r.Stderr) }
        exit $r.ExitCode
    }

    # See the $rest comment above: sequential assignment, not an if/else
    # expression capture, so an empty result stays @() rather than $null.
    $testArgs = @()
    if ($parts.Count -gt 2) { $testArgs = @($parts[2..($parts.Count - 1)]) }
    $cwd = (Get-Location).Path

    $mode   = $null
    $reason = $null

    $trigger = Get-DotnetTestPassthroughTrigger -TestArgs $testArgs
    if ($trigger) { $mode = 'Passthrough'; $reason = "user-specified test-host flag ($trigger)" }

    $projectPath = $null
    $runnerInfo  = $null
    if (-not $mode) {
        $projectPath = Resolve-DotnetTestProject -TestArgs $testArgs -WorkingDirectory $cwd
        if (-not $projectPath) { $mode = 'Passthrough'; $reason = 'could not resolve target project' }
    }

    if (-not $mode) {
        $runnerInfo = Get-DotnetTestRunnerInfo -ProjectPath $projectPath
        if ($runnerInfo.Runner -eq 'Unknown') {
            $mode = 'Passthrough'; $reason = 'unrecognized project type'
        } elseif ($runnerInfo.Runner -eq 'MTP' -and $runnerInfo.Framework -eq 'xunit.v3') {
            $mode = 'Passthrough'; $reason = 'xunit.v3-MTP not yet supported'
        } else {
            $mode = 'Normalize'
        }
    }

    if ($mode -eq 'Passthrough') {
        if ($trigger -eq '--report-trx') {
            # Best-effort: warn only when we can confidently tell the runner
            # will reject it (NUnit-MTP/xunit.v3-MTP -- exit 5, zero tests
            # run, per docs/dotnet-test-runner-findings.md §7). Detection
            # failure here must never block the passthrough itself.
            try {
                $p = if ($projectPath) { $projectPath } else { Resolve-DotnetTestProject -TestArgs $testArgs -WorkingDirectory $cwd }
                if ($p) {
                    $info = Get-DotnetTestRunnerInfo -ProjectPath $p
                    if ($info.Runner -eq 'MTP' -and $info.Framework -in @('NUnit', 'xunit.v3')) {
                        [Console]::Error.WriteLine("dnz: --report-trx is rejected by $($info.Framework)-MTP (exit 5, zero tests run) -- passing through unmodified.")
                    }
                }
            } catch { }
        }

        $r = Invoke-CapturedProcess -Exe 'dotnet' -ProcArgs (@('test') + $testArgs) -WorkingDirectory $cwd
        if ($r.Stdout) { Write-Output $r.Stdout }
        if ($r.Stderr) { [Console]::Error.Write($r.Stderr) }
        foreach ($line in (Format-DnzTestSummary -Status Raw -Reason $reason -RawExitCode $r.ExitCode)) {
            Write-Output $line
        }
        exit $r.ExitCode   # the one exception to the 0/1/2/3 contract below
    }

    # --- Normalize ---
    $dnzDir = Get-DnzOutputDirectory -RepoRoot $cwd
    $plan   = Get-DotnetTestInvocationPlan -Runner $runnerInfo.Runner -Framework $runnerInfo.Framework `
                                            -Tfm $runnerInfo.Tfm -DnzDir $dnzDir

    if ($plan.InvokeVia -eq 'Executable') {
        # Genuine (non-bridged) MTP: plain 'dotnet test' routes to the legacy
        # VSTest MSBuild target and fails outright without a global.json the
        # wrapper must never write (docs/dotnet-test-runner-findings.md §6,
        # §9) -- confirmed by hand for both MSTest-MTP net8.0/net10.0 and
        # NUnit-MTP. The project's own built executable must be invoked
        # directly instead, per findings §9's wrapper recipe.
        $exePath = Resolve-DotnetTestExecutable -ProjectPath $projectPath -Tfm $runnerInfo.Tfm
        if (-not $exePath) {
            $build = Invoke-CapturedProcess -Exe 'dotnet' -ProcArgs @('build', $projectPath, '--nologo', '-v:q') -WorkingDirectory $cwd
            if ($build.ExitCode -eq 0) {
                $exePath = Resolve-DotnetTestExecutable -ProjectPath $projectPath -Tfm $runnerInfo.Tfm
            }
        }

        if (-not $exePath) {
            $r = Invoke-CapturedProcess -Exe 'dotnet' -ProcArgs (@('test') + $testArgs) -WorkingDirectory $cwd
            if ($r.Stdout) { Write-Output $r.Stdout }
            if ($r.Stderr) { [Console]::Error.Write($r.Stderr) }
            foreach ($line in (Format-DnzTestSummary -Status Raw -Reason 'could not build/resolve the MTP test executable' -RawExitCode $r.ExitCode)) {
                Write-Output $line
            }
            exit $r.ExitCode
        }

        $r = Invoke-CapturedProcess -Exe $exePath -ProcArgs ($testArgs + $plan.AdditionalArgs) -WorkingDirectory $cwd
    } else {
        $finalArgs = @('test') + $testArgs + $plan.AdditionalArgs
        $r = Invoke-CapturedProcess -Exe 'dotnet' -ProcArgs $finalArgs -WorkingDirectory $cwd
    }

    $outcome  = $null   # Pass | Fail | None | Unknown
    $counts   = @{ Passed = 0; Failed = 0; Skipped = 0 }
    $failures = @()
    $omitted  = 0
    $trxPathForOutput = $null

    if ($plan.OutputShape -eq 'VSTest') {
        $hasSummary = $r.Stdout -match '(Passed!|Failed!)'
        if ($r.ExitCode -eq 0 -and -not $hasSummary) {
            $outcome = 'None'
        } elseif ($r.Stdout -match 'Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+),\s*Total:\s*(\d+)') {
            $counts.Failed  = [int]$Matches[1]
            $counts.Passed  = [int]$Matches[2]
            $counts.Skipped = [int]$Matches[3]
            if ($counts.Failed -gt 0) {
                $outcome = 'Fail'
                if ($plan.UsesTrx -and $plan.TrxPath -and (Test-Path -LiteralPath $plan.TrxPath)) {
                    $trx = ConvertFrom-VSTestTrx -TrxPath $plan.TrxPath -MaxFailures 5
                    $failures = $trx.Failures
                    $omitted  = $trx.OmittedFailureCount
                    $trxPathForOutput = $plan.TrxPath
                }
            } else {
                $outcome = 'Pass'
            }
        } else {
            $outcome = 'Unknown'
        }
    } else {
        # MTP-shaped output (MSTest-MTP net8.0/net10.0, NUnit-MTP)
        if ($r.Stdout -match '(?s)total:\s*(\d+).*?failed:\s*(\d+).*?succeeded:\s*(\d+).*?skipped:\s*(\d+)') {
            $counts.Passed  = [int]$Matches[3]
            $counts.Failed  = [int]$Matches[2]
            $counts.Skipped = [int]$Matches[4]
        }
        switch ($r.ExitCode) {
            0 { $outcome = 'Pass' }
            2 {
                $outcome = 'Fail'
                $inline = Get-MtpInlineFailures -Stdout $r.Stdout -MaxFailures 5
                $failures = $inline.Failures
                $omitted  = $inline.OmittedFailureCount
            }
            8 { $outcome = 'None' }
            default { $outcome = 'Unknown' }
        }
    }

    switch ($outcome) {
        'Pass' {
            foreach ($line in (Format-DnzTestSummary -Status Pass -Passed $counts.Passed -Skipped $counts.Skipped -DurationSeconds $r.Seconds)) {
                Write-Output $line
            }
            exit 0
        }
        'Fail' {
            foreach ($line in (Format-DnzTestSummary -Status Fail -Passed $counts.Passed -Failed $counts.Failed `
                                                       -DurationSeconds $r.Seconds -TrxPath $trxPathForOutput `
                                                       -Failures $failures -OmittedFailureCount $omitted)) {
                Write-Output $line
            }
            exit 1
        }
        'None' {
            foreach ($line in (Format-DnzTestSummary -Status None)) { Write-Output $line }
            exit 2
        }
        default {
            foreach ($line in (Format-DnzTestSummary -Status Unknown -RawExitCode $r.ExitCode)) { Write-Output $line }
            exit 3
        }
    }
}
catch {
    Write-DnzDebugLog -Message ("{0}`n{1}" -f $_.Exception.Message, $_.ScriptStackTrace)
    # A wrapper crash must never present as a silent pass -- surface as
    # undetermined per the exit-code contract (never guess, never return 0).
    try { Write-Output 'TEST UNKNOWN | wrapper error | runner exit unknown' } catch { }
    exit 3
}
