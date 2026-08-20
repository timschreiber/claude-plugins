<#
.SYNOPSIS
    Unit vectors for shared/denoizinator-core/DotnetTestRunner.psm1 (pure
    functions, no dotnet CLI needed) and acceptance vectors for the wrapper
    plugins/denoizinator-net/scripts/Invoke-QuietDotnetTest.ps1, driven
    through argv as a child process, matching how the hook's dispatch
    invokes it.

    The integration Describe block at the bottom is gated on
    probes/Probe-DotnetTest.ps1 -KeepArtifacts having already been run (its
    default scratch root is $env:TEMP\dnz-probe) -- it skips gracefully, not
    an error, when that root doesn't exist. This mirrors this repo's existing
    pattern: CI does not run Pester at all (see CLAUDE.md), so an
    integration suite requiring a real .NET SDK and pre-built fixtures is
    consistent with what's already expected to run locally only.

.EXAMPLE
    Invoke-Pester ./tests/Invoke-QuietDotnetTest.Tests.ps1
#>

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '../shared/denoizinator-core/DotnetTestRunner.psm1') -Force
    $script:WrapperPath = (Resolve-Path (Join-Path $PSScriptRoot '../plugins/denoizinator-net/scripts/Invoke-QuietDotnetTest.ps1')).Path

    function New-DnzTempDir {
        $dir = Join-Path ([IO.Path]::GetTempPath()) ("dnz-test-" + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        return $dir
    }
}

Describe 'Get-DotnetTestRunnerInfo' {

    BeforeAll {
        function New-Csproj {
            param([string] $Content)
            $path = Join-Path $script:ProjDir 'Proj.csproj'
            $Content | Set-Content -LiteralPath $path -Encoding UTF8
            return $path
        }
    }

    BeforeEach { $script:ProjDir = New-DnzTempDir }
    AfterEach  { Remove-Item -LiteralPath $script:ProjDir -Recurse -Force -ErrorAction SilentlyContinue }

    It 'detects VSTest MSTest' {
        $p = New-Csproj @'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="*" />
    <PackageReference Include="MSTest.TestAdapter" Version="*" />
    <PackageReference Include="MSTest.TestFramework" Version="*" />
  </ItemGroup>
</Project>
'@
        $info = Get-DotnetTestRunnerInfo -ProjectPath $p
        $info.Runner    | Should -Be 'VSTest'
        $info.Framework | Should -Be 'MSTest'
        $info.Tfm       | Should -Be 'net10.0'
    }

    It 'detects MTP MSTest via EnableMSTestRunner' {
        $p = New-Csproj @'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <EnableMSTestRunner>true</EnableMSTestRunner>
    <OutputType>Exe</OutputType>
  </PropertyGroup>
  <ItemGroup><PackageReference Include="MSTest" Version="*" /></ItemGroup>
</Project>
'@
        $info = Get-DotnetTestRunnerInfo -ProjectPath $p
        $info.Runner    | Should -Be 'MTP'
        $info.Framework | Should -Be 'MSTest'
        $info.Tfm       | Should -Be 'net8.0'
    }

    It 'detects MTP NUnit via EnableNUnitRunner' {
        $p = New-Csproj @'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <EnableNUnitRunner>true</EnableNUnitRunner>
    <OutputType>Exe</OutputType>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="NUnit" Version="*" />
    <PackageReference Include="NUnit3TestAdapter" Version="*" />
  </ItemGroup>
</Project>
'@
        $info = Get-DotnetTestRunnerInfo -ProjectPath $p
        $info.Runner    | Should -Be 'MTP'
        $info.Framework | Should -Be 'NUnit'
    }

    It 'detects MTP xunit.v3 by package reference alone (no Enable*Runner needed)' {
        $p = New-Csproj @'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <OutputType>Exe</OutputType>
  </PropertyGroup>
  <ItemGroup><PackageReference Include="xunit.v3" Version="*" /></ItemGroup>
</Project>
'@
        $info = Get-DotnetTestRunnerInfo -ProjectPath $p
        $info.Runner    | Should -Be 'MTP'
        $info.Framework | Should -Be 'xunit.v3'
    }

    It 'detects VSTest xunit (2.x)' {
        $p = New-Csproj @'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="*" />
    <PackageReference Include="xunit" Version="2.*" />
    <PackageReference Include="xunit.runner.visualstudio" Version="*" />
  </ItemGroup>
</Project>
'@
        $info = Get-DotnetTestRunnerInfo -ProjectPath $p
        $info.Runner    | Should -Be 'VSTest'
        $info.Framework | Should -Be 'xunit'
    }

    It 'detects MTP via a global.json walked up from the project directory' {
        $repoDir = New-DnzTempDir
        try {
            '{ "test": { "runner": "Microsoft.Testing.Platform" } }' |
                Set-Content -LiteralPath (Join-Path $repoDir 'global.json') -Encoding UTF8
            $subDir = Join-Path $repoDir 'src\Proj'
            New-Item -ItemType Directory -Path $subDir -Force | Out-Null
            $p = Join-Path $subDir 'Proj.csproj'
            @'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><TargetFramework>net10.0</TargetFramework></PropertyGroup>
  <ItemGroup><PackageReference Include="MSTest" Version="*" /></ItemGroup>
</Project>
'@ | Set-Content -LiteralPath $p -Encoding UTF8

            (Get-DotnetTestRunnerInfo -ProjectPath $p).Runner | Should -Be 'MTP'
        } finally {
            Remove-Item -LiteralPath $repoDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It 'reports Unknown for a non-SDK-style project' {
        $p = New-Csproj @'
<Project ToolsVersion="15.0">
  <PropertyGroup><TargetFrameworkVersion>v4.8</TargetFrameworkVersion></PropertyGroup>
</Project>
'@
        (Get-DotnetTestRunnerInfo -ProjectPath $p).Runner | Should -Be 'Unknown'
    }
}

Describe 'ConvertFrom-VSTestTrx' {

    BeforeAll {
        $script:TrxPath = Join-Path ([IO.Path]::GetTempPath()) ("dnz-test-" + [Guid]::NewGuid().ToString('N') + '.trx')
        @'
<?xml version="1.0" encoding="UTF-8"?>
<TestRun id="a" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">
  <Results>
    <UnitTestResult testId="id-pass" testName="Pass1" outcome="Passed" />
    <UnitTestResult testId="id-fail" testName="FailA" outcome="Failed">
      <Output>
        <ErrorInfo>
          <Message>Assert.AreEqual failed. Expected:&lt;1&gt;. Actual:&lt;2&gt;. probe failure A</Message>
          <StackTrace>   at ProbeTests.T.FailA()</StackTrace>
        </ErrorInfo>
      </Output>
    </UnitTestResult>
  </Results>
  <TestDefinitions>
    <UnitTest id="id-pass" name="Pass1">
      <TestMethod className="ProbeTests.T, ProbeTests, Version=1.0.0.0, Culture=neutral" name="Pass1" />
    </UnitTest>
    <UnitTest id="id-fail" name="FailA">
      <TestMethod className="ProbeTests.T, ProbeTests, Version=1.0.0.0, Culture=neutral" name="FailA" />
    </UnitTest>
  </TestDefinitions>
  <ResultSummary outcome="Failed">
    <Counters total="2" executed="2" passed="1" failed="1" />
  </ResultSummary>
</TestRun>
'@ | Set-Content -LiteralPath $script:TrxPath -Encoding UTF8
    }

    AfterAll { Remove-Item -LiteralPath $script:TrxPath -Force -ErrorAction SilentlyContinue }

    It 'extracts counts and the fully-qualified failing test name + message' {
        $result = ConvertFrom-VSTestTrx -TrxPath $script:TrxPath -MaxFailures 5

        $result.Total  | Should -Be 2
        $result.Passed | Should -Be 1
        $result.Failed | Should -Be 1

        $result.Failures.Count | Should -Be 1
        $result.Failures[0].TestName | Should -Be 'ProbeTests.T.FailA'
        $result.Failures[0].Message  | Should -Match 'probe failure A'
        $result.OmittedFailureCount  | Should -Be 0
    }

    It 'truncates to MaxFailures and reports the omitted count' {
        $result = ConvertFrom-VSTestTrx -TrxPath $script:TrxPath -MaxFailures 0
        $result.Failures.Count      | Should -Be 0
        $result.OmittedFailureCount | Should -Be 1
    }
}

Describe 'Format-DnzTestSummary' {

    It 'formats TEST PASS per the spec wire format' {
        $lines = Format-DnzTestSummary -Status Pass -Passed 42 -Skipped 0 -DurationSeconds 0.6
        $lines | Should -BeExactly @('TEST PASS | 42 passed | 0 skipped | 0.6s')
    }

    It 'formats TEST FAIL with failure detail and truncation' {
        $failures = 1..6 | ForEach-Object { [pscustomobject]@{ TestName = "T$_"; Message = "boom $_" } } | Select-Object -First 1
        $lines = Format-DnzTestSummary -Status Fail -Passed 37 -Failed 5 -DurationSeconds 0.6 `
            -TrxPath '.dnz\test.trx' -Failures $failures -OmittedFailureCount 4

        $lines[0] | Should -BeExactly 'TEST FAIL | 37 passed | 5 failed | 0.6s | .dnz\test.trx'
        $lines[1] | Should -BeExactly '  T1 — boom 1'
        $lines[2] | Should -BeExactly '  [+4 more]'
    }

    It 'formats TEST NONE per the spec wire format' {
        Format-DnzTestSummary -Status None | Should -BeExactly @('TEST NONE | 0 tests ran | filter matched nothing')
    }

    It 'formats TEST NONE with an overridden reason (Phase 7: packages.config adapter case)' {
        Format-DnzTestSummary -Status None -Reason 'test adapter not registered' |
            Should -BeExactly @('TEST NONE | 0 tests ran | test adapter not registered')
    }

    It 'formats TEST RAW with a reason and the raw runner exit code' {
        $lines = Format-DnzTestSummary -Status Raw -Reason 'user-specified test-host flag (--logger)' -RawExitCode 1
        $lines | Should -BeExactly @('TEST RAW | user-specified test-host flag (--logger) | runner exit 1')
    }

    It 'formats TEST UNKNOWN with the raw runner exit code' {
        $lines = Format-DnzTestSummary -Status Unknown -RawExitCode 5
        $lines | Should -BeExactly @('TEST UNKNOWN | could not determine outcome | runner exit 5')
    }
}

Describe 'Get-DotnetTestInvocationPlan' {

    BeforeAll { $script:DnzDir = New-DnzTempDir }
    AfterAll  { Remove-Item -LiteralPath $script:DnzDir -Recurse -Force -ErrorAction SilentlyContinue }

    $cases = @(
        @{ Runner='VSTest'; Framework='MSTest';   Tfm='net10.0'; ExpectMode='Normalize';   ExpectArgs=@('--nologo','-v:q','--logger','trx;LogFileName=test.trx','--results-directory') }
        @{ Runner='MTP';    Framework='MSTest';   Tfm='net10.0'; ExpectMode='Normalize';   ExpectArgs=@('--progress','off','--no-ansi') }
        @{ Runner='MTP';    Framework='MSTest';   Tfm='net8.0';  ExpectMode='Normalize';   ExpectArgs=@('--progress','off','--no-ansi') }
        # net6.0 MSTest-MTP bridges to the VSTest engine at runtime and does
        # NOT understand MTP-native flags like --no-progress ("Unknown
        # switch", confirmed by hand) -- it needs VSTest's own flags instead.
        @{ Runner='MTP';    Framework='MSTest';   Tfm='net6.0';  ExpectMode='Normalize';   ExpectArgs=@('--nologo','-v:q') }
        @{ Runner='MTP';    Framework='NUnit';    Tfm='net10.0'; ExpectMode='Normalize';   ExpectArgs=@('--no-progress','--no-ansi') }
        @{ Runner='MTP';    Framework='NUnit';    Tfm='net8.0';  ExpectMode='Normalize';   ExpectArgs=@('--no-progress','--no-ansi') }
        @{ Runner='MTP';    Framework='xunit.v3'; Tfm='net10.0'; ExpectMode='Passthrough'; ExpectArgs=@() }
        @{ Runner='Unknown';Framework=$null;      Tfm=$null;     ExpectMode='Passthrough'; ExpectArgs=@() }
    )

    It 'plans <Runner>/<Framework>/<Tfm>' -TestCases $cases {
        param($Runner, $Framework, $Tfm, $ExpectMode, $ExpectArgs)

        $plan = Get-DotnetTestInvocationPlan -Runner $Runner -Framework $Framework -Tfm $Tfm -DnzDir $script:DnzDir
        $plan.Mode | Should -Be $ExpectMode
        foreach ($a in $ExpectArgs) { $plan.AdditionalArgs | Should -Contain $a }
        $plan.AdditionalArgs | Should -Not -Contain '--report-trx'
    }

    It 'never selects --report-trx for any MTP path' {
        foreach ($fw in @('MSTest', 'NUnit', 'xunit.v3')) {
            foreach ($tfm in @('net6.0', 'net8.0', 'net10.0')) {
                $plan = Get-DotnetTestInvocationPlan -Runner 'MTP' -Framework $fw -Tfm $tfm -DnzDir $script:DnzDir
                $plan.AdditionalArgs | Should -Not -Contain '--report-trx'
            }
        }
    }

    It 'requests a TRX only for VSTest' {
        $vstest = Get-DotnetTestInvocationPlan -Runner 'VSTest' -Framework 'MSTest' -Tfm 'net10.0' -DnzDir $script:DnzDir
        $vstest.UsesTrx | Should -Be $true

        $mtp = Get-DotnetTestInvocationPlan -Runner 'MTP' -Framework 'MSTest' -Tfm 'net10.0' -DnzDir $script:DnzDir
        $mtp.UsesTrx | Should -Be $false
    }
}

Describe 'Resolve-DotnetTestProject' {

    BeforeEach { $script:Dir = New-DnzTempDir }
    AfterEach  { Remove-Item -LiteralPath $script:Dir -Recurse -Force -ErrorAction SilentlyContinue }

    It 'resolves the single csproj in the working directory when no project arg is given' {
        $p = Join-Path $script:Dir 'Only.csproj'
        'x' | Set-Content -LiteralPath $p
        Resolve-DotnetTestProject -TestArgs @('--filter', 'X') -WorkingDirectory $script:Dir | Should -Be $p
    }

    It 'resolves an explicit --project value' {
        $p = Join-Path $script:Dir 'Explicit.csproj'
        'x' | Set-Content -LiteralPath $p
        Resolve-DotnetTestProject -TestArgs @('--project', $p, '--filter', 'X') -WorkingDirectory $script:Dir |
            Should -Be (Resolve-Path -LiteralPath $p).Path
    }

    It 'resolves a bare leading project path positional argument' {
        $p = Join-Path $script:Dir 'Bare.csproj'
        'x' | Set-Content -LiteralPath $p
        Resolve-DotnetTestProject -TestArgs @('Bare.csproj') -WorkingDirectory $script:Dir |
            Should -Be (Resolve-Path -LiteralPath $p).Path
    }

    It 'returns $null when multiple csproj files make resolution ambiguous' {
        'x' | Set-Content -LiteralPath (Join-Path $script:Dir 'A.csproj')
        'x' | Set-Content -LiteralPath (Join-Path $script:Dir 'B.csproj')
        Resolve-DotnetTestProject -TestArgs @() -WorkingDirectory $script:Dir | Should -BeNullOrEmpty
    }

    It 'returns $null when no csproj exists' {
        Resolve-DotnetTestProject -TestArgs @() -WorkingDirectory $script:Dir | Should -BeNullOrEmpty
    }
}

Describe 'Get-DotnetTestPassthroughTrigger' {

    $positive = @(
        @{ TestArgs=@('--logger', 'console;verbosity=quiet') }
        @{ TestArgs=@('--results-directory', '.dnz') }
        @{ TestArgs=@('--report-trx') }
        @{ TestArgs=@('--', '--report-trx') }
    )
    It 'triggers passthrough on <TestArgs>' -TestCases $positive {
        param($TestArgs)
        Get-DotnetTestPassthroughTrigger -TestArgs $TestArgs | Should -Not -BeNullOrEmpty
    }

    # Quote-safety: these must NOT trigger passthrough. Each is a single,
    # already-tokenized array element (the shell has already resolved the
    # quoting by the time the wrapper sees it) -- a substring/regex match
    # against raw text would wrongly fire on these; exact per-element match
    # must not.
    $negative = @(
        @{ TestArgs=@('--filter', 'Name~logger') }
        @{ TestArgs=@('--filter', 'A -- B') }
    )
    It 'does NOT trigger passthrough on <TestArgs> (quote-safety)' -TestCases $negative {
        param($TestArgs)
        Get-DotnetTestPassthroughTrigger -TestArgs $TestArgs | Should -BeNullOrEmpty
    }

    It 'returns $null for a plain filter with no trigger flags' {
        Get-DotnetTestPassthroughTrigger -TestArgs @('--filter', 'FullyQualifiedName~Foo') | Should -BeNullOrEmpty
    }
}

Describe 'Invoke-QuietDotnetTest.ps1 (wrapper process)' {

    BeforeAll {
        function Invoke-WrapperProcess {
            # NOTE: the parameter is deliberately NOT named $Args -- that
            # collides with PowerShell's automatic $args variable and
            # produces confusing binding behavior (the exact bug documented
            # in docs/dotnet-test-runner-findings.md's probe-bugs section).
            param([string[]] $ExtraArgs, [string] $WorkingDirectory)

            $psi = [System.Diagnostics.ProcessStartInfo]::new()
            $psi.FileName               = (Get-Process -Id $PID).Path
            $psi.WorkingDirectory        = $WorkingDirectory
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError  = $true
            $psi.UseShellExecute        = $false
            foreach ($a in @('-NoProfile', '-File', $script:WrapperPath) + $ExtraArgs) { $psi.ArgumentList.Add($a) }

            $proc = [System.Diagnostics.Process]::Start($psi)
            $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
            $stderrTask = $proc.StandardError.ReadToEndAsync()
            $proc.WaitForExit()

            [pscustomobject]@{ Stdout = $stdoutTask.Result; Stderr = $stderrTask.Result; ExitCode = $proc.ExitCode }
        }
    }

    It 'passes through unmodified when the project cannot be resolved (no csproj, no filter)' {
        $dir = New-DnzTempDir
        try {
            $r = Invoke-WrapperProcess -ExtraArgs @('--', 'dotnet', 'test', '--filter', 'X') -WorkingDirectory $dir
            $r.Stdout | Should -Match 'TEST RAW \| could not resolve target project \| runner exit \d+'
        } finally {
            Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    It 'passes through unmodified when the original command already specifies --logger' {
        $dir = New-DnzTempDir
        try {
            $r = Invoke-WrapperProcess -ExtraArgs @('--', 'dotnet', 'test', '--logger', 'trx;LogFileName=custom.trx') -WorkingDirectory $dir
            $r.Stdout | Should -Match 'TEST RAW \| user-specified test-host flag \(--logger\) \| runner exit \d+'
        } finally {
            Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Describe 'Full acceptance: real dotnet test against probe scratch projects' -Tag 'Integration' {

    # NOTE: computed here, at Describe-body (Discovery-time) scope, not
    # inside BeforeAll -- Pester v5 evaluates each It's -Skip during
    # Discovery, which runs BEFORE any BeforeAll callback. A Skip condition
    # set inside BeforeAll is always still $null (falsy -not $null = $true)
    # at the point Skip is read, so every It would silently skip regardless
    # of whether the fixtures actually exist.
    #
    # The Describe body itself only executes once, during Discovery -- it
    # does NOT re-run during the Run phase -- so a $script: variable set only
    # here is gone by the time an It body (Run-time) reads it. HaveFixtures
    # is only ever read by -Skip (Discovery-time), so this assignment is
    # sufficient for it; ProbeRoot is also read inside It bodies (Run-time),
    # so it's re-set in BeforeAll below too.
    $script:ProbeRoot    = Join-Path $env:TEMP 'dnz-probe'
    $script:HaveFixtures = Test-Path -LiteralPath $script:ProbeRoot

    BeforeAll {
        $script:ProbeRoot = Join-Path $env:TEMP 'dnz-probe'

        function Invoke-WrapperAgainst {
            param([string] $ProjectDir, [string[]] $ExtraArgs = @())

            $psi = [System.Diagnostics.ProcessStartInfo]::new()
            $psi.FileName               = (Get-Process -Id $PID).Path
            $psi.WorkingDirectory        = $ProjectDir
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError  = $true
            $psi.UseShellExecute        = $false
            foreach ($a in (@('-NoProfile', '-File', $script:WrapperPath, '--', 'dotnet', 'test') + $ExtraArgs)) {
                $psi.ArgumentList.Add($a)
            }

            $proc = [System.Diagnostics.Process]::Start($psi)
            $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
            $stderrTask = $proc.StandardError.ReadToEndAsync()
            $proc.WaitForExit()

            [pscustomobject]@{ Stdout = $stdoutTask.Result; Stderr = $stderrTask.Result; ExitCode = $proc.ExitCode }
        }
    }

    It 'VSTest: reports TEST FAIL with counts and TRX-derived detail' -Skip:(-not $script:HaveFixtures) {
        $r = Invoke-WrapperAgainst -ProjectDir (Join-Path $script:ProbeRoot 'vstest_n100')
        $r.ExitCode | Should -Be 1
        $r.Stdout | Should -Match 'TEST FAIL \| 6 passed \| 2 failed \|'
    }

    It 'VSTest: reports TEST PASS' -Skip:(-not $script:HaveFixtures) {
        $r = Invoke-WrapperAgainst -ProjectDir (Join-Path $script:ProbeRoot 'vstestpass_n100')
        $r.ExitCode | Should -Be 0
        $r.Stdout | Should -Match 'TEST PASS \| 8 passed \| 0 skipped \|'
    }

    It 'VSTest: reports TEST NONE on a filter matching nothing' -Skip:(-not $script:HaveFixtures) {
        $r = Invoke-WrapperAgainst -ProjectDir (Join-Path $script:ProbeRoot 'vstest_n100') `
            -ExtraArgs @('--filter', 'FullyQualifiedName~ZZZNoSuchTest')
        $r.ExitCode | Should -Be 2
        $r.Stdout | Should -Match 'TEST NONE \|'
    }

    It 'MTP MSTest net10.0: reports TEST FAIL with inline detail' -Skip:(-not $script:HaveFixtures) {
        $r = Invoke-WrapperAgainst -ProjectDir (Join-Path $script:ProbeRoot 'mtp_n100')
        $r.ExitCode | Should -Be 1
        $r.Stdout | Should -Match 'TEST FAIL \| 6 passed \| 2 failed \|'
    }

    It 'MTP MSTest net8.0: reports TEST PASS' -Skip:(-not $script:HaveFixtures) {
        $r = Invoke-WrapperAgainst -ProjectDir (Join-Path $script:ProbeRoot 'mtppass_n80')
        $r.ExitCode | Should -Be 0
        $r.Stdout | Should -Match 'TEST PASS \| 8 passed \|'
    }

    It 'MTP MSTest net6.0 (bridge special-case): reports TEST FAIL via the VSTest branch' -Skip:(-not $script:HaveFixtures) {
        $r = Invoke-WrapperAgainst -ProjectDir (Join-Path $script:ProbeRoot 'mtp_n60')
        $r.ExitCode | Should -Be 1
        $r.Stdout | Should -Match 'TEST FAIL \| 6 passed \| 2 failed \|'
    }

    It 'NUnit-MTP net10.0: reports TEST FAIL with inline detail' -Skip:(-not $script:HaveFixtures) {
        $r = Invoke-WrapperAgainst -ProjectDir (Join-Path $script:ProbeRoot 'x_mtp_nunit')
        $r.ExitCode | Should -Be 1
        $r.Stdout | Should -Match 'TEST FAIL \|'
    }

    It 'NUnit-MTP net8.0: reports TEST FAIL with inline detail' -Skip:(-not $script:HaveFixtures) {
        $dir = Join-Path $script:ProbeRoot 'x_mtp_nunit_n80'
        if (-not (Test-Path -LiteralPath $dir)) { Set-ItResult -Skipped -Because 'x_mtp_nunit_n80 fixture not present'; return }
        $r = Invoke-WrapperAgainst -ProjectDir $dir
        $r.ExitCode | Should -Be 1
        $r.Stdout | Should -Match 'TEST FAIL \|'
    }

    It 'xunit.v3-MTP: passes through, out of scope this phase' -Skip:(-not $script:HaveFixtures) {
        $dir = Join-Path $script:ProbeRoot 'x_mtp_xunit3'
        if (-not (Test-Path -LiteralPath $dir)) { Set-ItResult -Skipped -Because 'x_mtp_xunit3 fixture not present'; return }
        $r = Invoke-WrapperAgainst -ProjectDir $dir
        $r.Stdout | Should -Match 'TEST RAW \| xunit\.v3-MTP not yet supported \|'
    }
}
