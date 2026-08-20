<#
.SYNOPSIS
    Wrapper invoked by the hook in place of a bare 'vstest.console'/
    'vstest.console.exe' (Framework's direct test runner).

.DESCRIPTION
    Invoked as: pwsh -NoProfile -File Invoke-QuietVstestConsole.ps1 -- vstest.console.exe <args>

    Simpler than Invoke-QuietDotnetTest.ps1: vstest.console.exe only ever
    runs the VSTest engine (no MTP ambiguity, no runner detection needed),
    and its target DLL is already built and given positionally (no
    build-then-resolve-executable step). Reuses the same normalised
    TEST PASS|FAIL|NONE|RAW|UNKNOWN contract and 0/1/2/3 exit codes as
    Invoke-QuietDotnetTest.ps1 -- see docs/denoizinator-net-spec.md §5.4 and
    §6 Phase 7.

    Zero-tests-ran (TEST NONE) covers two distinct signatures
    (docs/framework-build-findings.md §5), both exit 0 with no summary line:
      - a filter matching nothing ("No test matches the given testcase filter")
      - a packages.config project whose restore never wired the test adapter
        ("No test is available in ... / Additionally, path to test adapters
        can be specified ..." -- this trailer survives the quiet logger even
        though the message's own leading sentence is suppressed by it)
    Get-VSTestOutcome (shared/denoizinator-core/DotnetTestRunner.psm1)
    classifies both into the correct NoneReason text.

    No declared param() block, deliberately -- same reason as
    Invoke-QuietDotnetTest.ps1: a bare '--' anywhere in argv aborts
    PowerShell's own parameter binder when a ValueFromRemainingArguments
    positional is declared, regardless of position. Unbound arguments fall
    back to the automatic $args variable instead, which passes every token
    -- including bare '--' ones -- through untouched.
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
        contaminates the capture; see
        docs/dotnet-test-runner-findings.md §5/§12).
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

try {
    $parts = @($args)

    if ($parts.Count -gt 0 -and $parts[0] -eq '--') { $parts = @($parts[1..($parts.Count - 1)]) }

    if ($parts.Count -eq 0) { exit 0 }

    $head = $parts[0]
    if ($head -notin @('vstest.console', 'vstest.console.exe')) {
        # Defensive-only -- shouldn't happen given how the hook constructs
        # this dispatch. Run whatever we were actually given, verbatim.
        $rest = @()
        if ($parts.Count -gt 1) { $rest = @($parts[1..($parts.Count - 1)]) }
        $r = Invoke-CapturedProcess -Exe $head -ProcArgs $rest -WorkingDirectory (Get-Location).Path
        if ($r.Stdout) { Write-Output $r.Stdout }
        if ($r.Stderr) { [Console]::Error.Write($r.Stderr) }
        exit $r.ExitCode
    }

    $testArgs = @()
    if ($parts.Count -gt 1) { $testArgs = @($parts[1..($parts.Count - 1)]) }
    $cwd = (Get-Location).Path

    $trigger = Get-VstestConsolePassthroughTrigger -TestArgs $testArgs
    if ($trigger) {
        $r = Invoke-CapturedProcess -Exe $head -ProcArgs $testArgs -WorkingDirectory $cwd
        if ($r.Stdout) { Write-Output $r.Stdout }
        if ($r.Stderr) { [Console]::Error.Write($r.Stderr) }
        foreach ($line in (Format-DnzTestSummary -Status Raw -Reason "user-specified flag ($trigger)" -RawExitCode $r.ExitCode)) {
            Write-Output $line
        }
        exit $r.ExitCode   # the one exception to the 0/1/2/3 contract, per spec §5.4
    }

    # --- Normalize ---
    # Values are unquoted -- these are .NET ProcessStartInfo.ArgumentList
    # elements, passed to the child process atomically; no shell re-parses
    # this string, so embedded ';' needs no quoting here (unlike the outer
    # hook's own emitted rewrite string, which IS re-parsed by a shell).
    $dnzDir  = Get-DnzOutputDirectory -RepoRoot $cwd
    $trxPath = Join-Path $dnzDir 'test.trx'
    $finalArgs = $testArgs + @(
        '/logger:console;verbosity=quiet'
        '/logger:trx;LogFileName=test.trx'
        "/ResultsDirectory:$dnzDir"
    )

    $r = $null
    try {
        $r = Invoke-CapturedProcess -Exe $head -ProcArgs $finalArgs -WorkingDirectory $cwd
    } catch [System.ComponentModel.Win32Exception] {
        # vstest.console.exe never resolves on bare PATH outside a Developer
        # Command Prompt (framework-build-findings.md §1) -- this is the
        # EXPECTED common case on a typical dev machine, not a rare edge
        # case. The hook never resolves it via vswhere.exe either (spec §6
        # Phase 7's "must not do"), so a Win32 "file not found" here is
        # normal and must degrade to TEST UNKNOWN, not crash the wrapper.
        Write-DnzDebugLog -Message ("vstest.console.exe not found on PATH: {0}" -f $_.Exception.Message)
        Write-Output 'TEST UNKNOWN | wrapper error | runner exit unknown'
        exit 3
    }

    $vout = Get-VSTestOutcome -Stdout $r.Stdout -ExitCode $r.ExitCode -TrxPath $trxPath -MaxFailures 5

    switch ($vout.Outcome) {
        'Pass' {
            foreach ($line in (Format-DnzTestSummary -Status Pass -Passed $vout.Passed -Skipped $vout.Skipped -DurationSeconds $r.Seconds)) {
                Write-Output $line
            }
            exit 0
        }
        'Fail' {
            foreach ($line in (Format-DnzTestSummary -Status Fail -Passed $vout.Passed -Failed $vout.Failed `
                                                       -DurationSeconds $r.Seconds -TrxPath $vout.TrxPath `
                                                       -Failures $vout.Failures -OmittedFailureCount $vout.OmittedFailureCount)) {
                Write-Output $line
            }
            exit 1
        }
        'None' {
            foreach ($line in (Format-DnzTestSummary -Status None -Reason $vout.NoneReason)) { Write-Output $line }
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
