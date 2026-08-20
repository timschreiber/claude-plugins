<#
.SYNOPSIS
    Unit vectors for the Phase 7 additions to
    shared/denoizinator-core/DotnetTestRunner.psm1 (Get-VSTestOutcome,
    Get-VstestConsolePassthroughTrigger) and acceptance vectors for
    plugins/denoizinator-net/scripts/Invoke-QuietVstestConsole.ps1, driven
    through argv as a child process -- mirrors
    tests/Invoke-QuietDotnetTest.Tests.ps1's structure and conventions.

    The integration Describe block at the bottom is gated on
    probes/Probe-FrameworkBuild.ps1 -KeepArtifacts having already been run
    (its default scratch root is $env:TEMP\dnz-probe-fx) AND vstest.console.exe
    being resolvable via vswhere.exe -- it skips gracefully, not an error,
    when either is missing. Evidence strings used in the unit tests below are
    taken verbatim from probes/evidence/framework-build-results.json, not
    invented (docs/denoizinator-net-spec.md §8: don't add a fact without
    evidence).

.EXAMPLE
    Invoke-Pester ./tests/Invoke-QuietVstestConsole.Tests.ps1
#>

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '../shared/denoizinator-core/DotnetTestRunner.psm1') -Force
    $script:WrapperPath = (Resolve-Path (Join-Path $PSScriptRoot '../plugins/denoizinator-net/scripts/Invoke-QuietVstestConsole.ps1')).Path

    function New-DnzTempDir {
        $dir = Join-Path ([IO.Path]::GetTempPath()) ("dnz-test-" + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        return $dir
    }
}

Describe 'Get-VSTestOutcome' {
    <#
    Stdout fixtures below are copied verbatim from
    probes/evidence/framework-build-results.json (Phase 5's Framework probe),
    not invented -- see docs/framework-build-findings.md §5.
    #>

    BeforeAll {
        $script:PassStdout = @"
VSTest version 18.7.0 (x64)

Starting test execution, please wait...
A total of 1 test files matched the specified pattern.

Passed!  - Failed:     0, Passed:     8, Skipped:     0, Total:     8, Duration: 56 ms - proj5_vstest_allpass.dll (net48)
"@

        $script:FailStdout = @"
VSTest version 18.7.0 (x64)

Starting test execution, please wait...
A total of 1 test files matched the specified pattern.

Failed!  - Failed:     2, Passed:     6, Skipped:     0, Total:     8, Duration: 66 ms - proj2_pkgref.dll (net48)
"@

        $script:ZeroMatchStdout = @"
VSTest version 18.7.0 (x64)

Starting test execution, please wait...
A total of 1 test files matched the specified pattern.
No test matches the given testcase filter ``FullyQualifiedName~ZZZNoSuchTest`` in C:\fake\proj2_pkgref.dll
"@

        $script:AdapterMissingQuietStdout = @"
VSTest version 18.7.0 (x64)

Starting test execution, please wait...
A total of 1 test files matched the specified pattern.

Additionally, path to test adapters can be specified using /TestAdapterPath command. Example  /TestAdapterPath:<pathToCustomAdapters>.
"@

        $script:AdapterMissingDefaultStdout = @"
VSTest version 18.7.0 (x64)

Starting test execution, please wait...
A total of 1 test files matched the specified pattern.
No test is available in C:\fake\proj1_pkgconfig.dll. Make sure that test discoverer & executors are registered and platform & framework version settings are appropriate and try again.

Additionally, path to test adapters can be specified using /TestAdapterPath command. Example  /TestAdapterPath:<pathToCustomAdapters>.
"@
    }

    It 'classifies a passing run' {
        $r = Get-VSTestOutcome -Stdout $script:PassStdout -ExitCode 0
        $r.Outcome | Should -Be 'Pass'
        $r.Passed  | Should -Be 8
        $r.Failed  | Should -Be 0
        $r.Skipped | Should -Be 0
    }

    It 'classifies a failing run and reads TRX-derived detail' {
        $trxDir = New-DnzTempDir
        try {
            $trxPath = Join-Path $trxDir 'test.trx'
            @'
<?xml version="1.0" encoding="UTF-8"?>
<TestRun id="a" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">
  <Results>
    <UnitTestResult testId="id-fail" testName="ProgramTests.DoCopy_CopiesFiles" outcome="Failed">
      <Output>
        <ErrorInfo>
          <Message>FileNotFoundException: Newtonsoft.Json 8.0.0.0</Message>
          <StackTrace>   at ProgramTests.DoCopy_CopiesFiles()</StackTrace>
        </ErrorInfo>
      </Output>
    </UnitTestResult>
  </Results>
  <TestDefinitions>
    <UnitTest id="id-fail" name="DoCopy_CopiesFiles">
      <TestMethod className="ProgramTests, ProgramTests, Version=1.0.0.0, Culture=neutral" name="DoCopy_CopiesFiles" />
    </UnitTest>
  </TestDefinitions>
  <ResultSummary outcome="Failed">
    <Counters total="1" executed="1" passed="0" failed="1" />
  </ResultSummary>
</TestRun>
'@ | Set-Content -LiteralPath $trxPath -Encoding utf8

            $r = Get-VSTestOutcome -Stdout $script:FailStdout -ExitCode 1 -TrxPath $trxPath
            $r.Outcome  | Should -Be 'Fail'
            $r.Passed   | Should -Be 6
            $r.Failed   | Should -Be 2
            $r.Failures.Count | Should -BeGreaterThan 0
            $r.TrxPath  | Should -Be $trxPath
        } finally {
            Remove-Item -LiteralPath $trxDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It 'classifies a filter-matched-nothing run as None/filter matched nothing' {
        $r = Get-VSTestOutcome -Stdout $script:ZeroMatchStdout -ExitCode 0
        $r.Outcome    | Should -Be 'None'
        $r.NoneReason | Should -Be 'filter matched nothing'
    }

    It 'classifies the packages.config adapter-missing message (quiet form) as None/test adapter not registered' {
        $r = Get-VSTestOutcome -Stdout $script:AdapterMissingQuietStdout -ExitCode 0
        $r.Outcome    | Should -Be 'None'
        $r.NoneReason | Should -Be 'test adapter not registered'
    }

    It 'classifies the packages.config adapter-missing message (default-verbosity form) as None/test adapter not registered' {
        $r = Get-VSTestOutcome -Stdout $script:AdapterMissingDefaultStdout -ExitCode 0
        $r.Outcome    | Should -Be 'None'
        $r.NoneReason | Should -Be 'test adapter not registered'
    }

    It 'classifies unrecognisable output as Unknown' {
        $r = Get-VSTestOutcome -Stdout 'some unexpected garbage' -ExitCode 17
        $r.Outcome | Should -Be 'Unknown'
    }
}

Describe 'Get-VstestConsolePassthroughTrigger' {

    # NOTE: the TestCases key is deliberately NOT named 'Args' -- that binds
    # to PowerShell's automatic (case-insensitive) $args variable and
    # silently breaks parameter binding, the exact bug documented in
    # docs/dotnet-test-runner-findings.md's probe-bugs section and in
    # tests/Invoke-QuietDotnetTest.Tests.ps1's Invoke-WrapperProcess comment.
    $positive = @(
        @{ Toks=@('/logger:trx;LogFileName=custom.trx') }
        @{ Toks=@('/Logger:console;verbosity=normal') }
        @{ Toks=@('/ResultsDirectory:C:\out') }
    )
    It 'triggers passthrough on <Toks>' -TestCases $positive {
        param($Toks)
        Get-VstestConsolePassthroughTrigger -TestArgs $Toks | Should -Not -BeNullOrEmpty
    }

    $negative = @(
        @{ Toks=@('/TestCaseFilter:FullyQualifiedName~logger') }
        @{ Toks=@('/TestAdapterPath:C:\logger') }
        @{ Toks=@('foo.dll') }
    )
    It 'does NOT trigger passthrough on <Toks> (prefix-safety, not substring)' -TestCases $negative {
        param($Toks)
        Get-VstestConsolePassthroughTrigger -TestArgs $Toks | Should -BeNullOrEmpty
    }

    It 'returns $null for an empty argument list' {
        Get-VstestConsolePassthroughTrigger -TestArgs @() | Should -BeNullOrEmpty
    }
}

Describe 'Invoke-QuietVstestConsole.ps1 (wrapper process)' {

    # Resolved at Discovery-time (Describe-body scope), same reasoning as the
    # Integration block below: a -Skip condition must be known before any
    # BeforeAll runs. Not gating the whole Describe on this -- only the one
    # test that genuinely needs a runnable vstest.console.exe.
    $script:WpVswherePath = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
    $script:WpVstestConsolePath = $null
    $cmd = Get-Command 'vstest.console.exe' -ErrorAction SilentlyContinue
    if ($cmd) { $script:WpVstestConsolePath = $cmd.Source }
    if (-not $script:WpVstestConsolePath -and (Test-Path -LiteralPath $script:WpVswherePath)) {
        $found = & $script:WpVswherePath -latest -products * `
            -find 'Common7\IDE\CommonExtensions\Microsoft\TestWindow\vstest.console.exe' 2>$null |
            Select-Object -First 1
        if ($found -and (Test-Path -LiteralPath $found)) { $script:WpVstestConsolePath = $found }
    }

    BeforeAll {
        # Re-resolved here (Run-time): the Describe-body assignment above
        # only exists for -Skip's sake at Discovery-time and is gone by the
        # time an It body executes -- see the identical note in the
        # Integration Describe below.
        $vswherePath = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
        $script:WpVstestConsolePath = $null
        $cmd = Get-Command 'vstest.console.exe' -ErrorAction SilentlyContinue
        if ($cmd) { $script:WpVstestConsolePath = $cmd.Source }
        if (-not $script:WpVstestConsolePath -and (Test-Path -LiteralPath $vswherePath)) {
            $found = & $vswherePath -latest -products * `
                -find 'Common7\IDE\CommonExtensions\Microsoft\TestWindow\vstest.console.exe' 2>$null |
                Select-Object -First 1
            if ($found -and (Test-Path -LiteralPath $found)) { $script:WpVstestConsolePath = $found }
        }

        function Invoke-WrapperProcess {
            # -PrependPath makes a bare 'vstest.console.exe' head resolve via
            # the CHILD wrapper process's own PATH -- exactly what happens in
            # real use when it's genuinely on PATH -- without changing the
            # wrapper's own head-matching logic to accept a full path (which
            # the hook's DispatchMap never sends it in the first place; see
            # docs/framework-build-findings.md §1 / spec §6 Phase 7's "must
            # not resolve via vswhere" -- only bare-name dispatch is real).
            param([string[]] $ExtraArgs, [string] $WorkingDirectory, [string] $PrependPath)

            $psi = [System.Diagnostics.ProcessStartInfo]::new()
            $psi.FileName               = (Get-Process -Id $PID).Path
            $psi.WorkingDirectory        = $WorkingDirectory
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError  = $true
            $psi.UseShellExecute        = $false
            if ($PrependPath) { $psi.EnvironmentVariables['PATH'] = "$PrependPath;$env:PATH" }
            foreach ($a in @('-NoProfile', '-File', $script:WrapperPath) + $ExtraArgs) { $psi.ArgumentList.Add($a) }

            $proc = [System.Diagnostics.Process]::Start($psi)
            $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
            $stderrTask = $proc.StandardError.ReadToEndAsync()
            $proc.WaitForExit()

            [pscustomobject]@{ Stdout = $stdoutTask.Result; Stderr = $stderrTask.Result; ExitCode = $proc.ExitCode }
        }
    }

    It 'passes through unmodified when the head is not vstest.console(.exe)' {
        $dir = New-DnzTempDir
        try {
            $r = Invoke-WrapperProcess -ExtraArgs @('--', 'echo', 'hello') -WorkingDirectory $dir
            $r.Stdout | Should -Match 'hello'
        } finally {
            Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It 'emits TEST RAW when the original command already specifies /logger:...' -Skip:(-not $script:WpVstestConsolePath) {
        $dir = New-DnzTempDir
        try {
            $vstestDir = Split-Path -Path $script:WpVstestConsolePath -Parent
            $r = Invoke-WrapperProcess -ExtraArgs @('--', 'vstest.console.exe', 'foo.dll', '/logger:trx;LogFileName=custom.trx') `
                -WorkingDirectory $dir -PrependPath $vstestDir
            $r.Stdout | Should -Match 'TEST RAW \| user-specified flag \(/logger\) \| runner exit \d+'
        } finally {
            Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It 'emits TEST UNKNOWN when vstest.console.exe cannot be found on PATH (docs/framework-build-findings.md §1: the expected case on most dev machines)' {
        $dir = New-DnzTempDir
        try {
            $r = Invoke-WrapperProcess -ExtraArgs @('--', 'vstest.console.exe', 'foo.dll') -WorkingDirectory $dir
            if ((Get-Command 'vstest.console.exe' -ErrorAction SilentlyContinue)) {
                Set-ItResult -Skipped -Because 'vstest.console.exe resolves on bare PATH on this machine'
                return
            }
            $r.Stdout | Should -Match 'TEST UNKNOWN \| wrapper error \| runner exit unknown'
            $r.ExitCode | Should -Be 3
        } finally {
            Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Describe 'Full acceptance: real vstest.console.exe against probe scratch projects' -Tag 'Integration' {

    # NOTE: computed here, at Describe-body (Discovery-time) scope, not
    # inside BeforeAll -- see tests/Invoke-QuietDotnetTest.Tests.ps1's
    # identical comment for why: Pester v5 evaluates each It's -Skip during
    # Discovery, which runs before any BeforeAll callback.
    $script:ProbeRoot = Join-Path $env:TEMP 'dnz-probe-fx'
    $script:VswherePath = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
    $script:VstestConsolePath = $null
    if (Test-Path -LiteralPath $script:VswherePath) {
        $found = & $script:VswherePath -latest -products * `
            -find 'Common7\IDE\CommonExtensions\Microsoft\TestWindow\vstest.console.exe' 2>$null |
            Select-Object -First 1
        if ($found -and (Test-Path -LiteralPath $found)) { $script:VstestConsolePath = $found }
    }
    $script:HaveFixtures = (Test-Path -LiteralPath $script:ProbeRoot) -and $script:VstestConsolePath

    BeforeAll {
        # Re-resolved here (Run-time) -- see the identical note in the
        # "wrapper process" Describe above for why. $ProbeRoot is likewise
        # re-set since It bodies read it too.
        $vswherePath = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
        $script:ProbeRoot = Join-Path $env:TEMP 'dnz-probe-fx'
        $script:VstestConsolePath = $null
        if (Test-Path -LiteralPath $vswherePath) {
            $found = & $vswherePath -latest -products * `
                -find 'Common7\IDE\CommonExtensions\Microsoft\TestWindow\vstest.console.exe' 2>$null |
                Select-Object -First 1
            if ($found -and (Test-Path -LiteralPath $found)) { $script:VstestConsolePath = $found }
        }

        function Invoke-WrapperAgainst {
            param([string] $Dll, [string[]] $ExtraArgs = @())

            # Head is the BARE name, resolved via the child process's own
            # PATH (prepended with the vswhere-resolved directory) -- not a
            # full path -- since that's what the hook's DispatchMap actually
            # sends the wrapper in real use (see the identical note on
            # Invoke-WrapperProcess above).
            $vstestDir = Split-Path -Path $script:VstestConsolePath -Parent

            $psi = [System.Diagnostics.ProcessStartInfo]::new()
            $psi.FileName               = (Get-Process -Id $PID).Path
            $psi.WorkingDirectory        = Split-Path -Path $Dll -Parent
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError  = $true
            $psi.UseShellExecute        = $false
            $psi.EnvironmentVariables['PATH'] = "$vstestDir;$env:PATH"
            foreach ($a in (@('-NoProfile', '-File', $script:WrapperPath, '--', 'vstest.console.exe', $Dll) + $ExtraArgs)) {
                $psi.ArgumentList.Add($a)
            }

            $proc = [System.Diagnostics.Process]::Start($psi)
            $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
            $stderrTask = $proc.StandardError.ReadToEndAsync()
            $proc.WaitForExit()

            [pscustomobject]@{ Stdout = $stdoutTask.Result; Stderr = $stderrTask.Result; ExitCode = $proc.ExitCode }
        }
    }

    It 'reports TEST PASS against the all-pass fixture' -Skip:(-not $script:HaveFixtures) {
        $dll = Join-Path $script:ProbeRoot 'proj5_vstest_allpass\bin\Debug\proj5_vstest_allpass.dll'
        $r = Invoke-WrapperAgainst -Dll $dll
        $r.ExitCode | Should -Be 0
        $r.Stdout | Should -Match 'TEST PASS \| 8 passed \| 0 skipped \|'
    }

    It 'reports TEST FAIL against the failing fixture' -Skip:(-not $script:HaveFixtures) {
        $dll = Join-Path $script:ProbeRoot 'proj2_pkgref\bin\Debug\proj2_pkgref.dll'
        $r = Invoke-WrapperAgainst -Dll $dll
        $r.ExitCode | Should -Be 1
        $r.Stdout | Should -Match 'TEST FAIL \| 6 passed \| 2 failed \|'
    }

    It 'reports TEST NONE on a filter matching nothing' -Skip:(-not $script:HaveFixtures) {
        $dll = Join-Path $script:ProbeRoot 'proj2_pkgref\bin\Debug\proj2_pkgref.dll'
        $r = Invoke-WrapperAgainst -Dll $dll -ExtraArgs @('/TestCaseFilter:FullyQualifiedName~ZZZNoSuchTest')
        $r.ExitCode | Should -Be 2
        $r.Stdout | Should -Match 'TEST NONE \| 0 tests ran \| filter matched nothing'
    }

    It 'reports TEST NONE with the adapter-not-registered reason on the packages.config fixture' -Skip:(-not $script:HaveFixtures) {
        $dll = Join-Path $script:ProbeRoot 'proj1_pkgconfig\bin\Debug\proj1_pkgconfig.dll'
        $r = Invoke-WrapperAgainst -Dll $dll
        $r.ExitCode | Should -Be 2
        $r.Stdout | Should -Match 'TEST NONE \| 0 tests ran \| test adapter not registered'
    }
}
