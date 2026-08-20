<#
.SYNOPSIS
  Probes every .NET 10 test-runner configuration: output volume, quiet flags,
  exit codes, TRX availability, and the zero-tests-ran case.

.DESCRIPTION
  Scaffolds throwaway net10.0 projects under -Root, builds them, then runs a
  command matrix against each. Also records what STATIC DETECTION concludes for
  each project, so the routing table can be validated against real behaviour.

  Every project has 6 passing and 2 failing tests, so any runner reporting a
  failure count other than 2 is lying.

  Framework 4.8 / vstest.console.exe is out of scope -- already measured.

.EXAMPLE
  .\Probe-DotnetTest.ps1
  .\Probe-DotnetTest.ps1 -Root D:\scratch\probe -KeepArtifacts
#>
[CmdletBinding()]
param(
    [string]   $Root = (Join-Path $env:TEMP "dnz-probe"),
    [string[]] $Tfms = @('net6.0','net8.0','net10.0'),
    [switch]   $KeepArtifacts
)

$ErrorActionPreference = 'Stop'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_NOLOGO = '1'

$script:Results = [System.Collections.Generic.List[object]]::new()

function Write-Head($t) { Write-Host "`n=== $t" -ForegroundColor Cyan }
function Write-Note($t) { Write-Host "    $t" -ForegroundColor DarkGray }

# ---------------------------------------------------------------- run + measure
function Measure-Run {
    param(
        [string]   $Scenario,
        [string]   $Case,
        [string]   $Exe,
        [string[]] $CmdArgs,
        [string]   $WorkDir
    )
    $out = ""; $exit = -999
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $prevEA = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'   # native stderr must not terminate
    try {
        Push-Location $WorkDir
        if ($CmdArgs -and $CmdArgs.Count) { $out = (& $Exe @CmdArgs 2>&1 | Out-String) }
        else                              { $out = (& $Exe          2>&1 | Out-String) }
        $exit = $LASTEXITCODE
    } catch {
        $out = "PROBE-EXCEPTION: $_"
    } finally {
        Pop-Location; $sw.Stop(); $ErrorActionPreference = $prevEA
    }

    $hasSummary = $out -match '(Passed!|Failed!|Test Run Successful|Test Run Failed|total:\s*\d+|Total tests:)'

    $counts = $null
    if ($out -match 'Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+),\s*Total:\s*(\d+)') {
        $counts = "P=$($Matches[2]) F=$($Matches[1]) S=$($Matches[3]) T=$($Matches[4])"
    } elseif ($out -match '(?s)total:\s*(\d+).*?failed:\s*(\d+).*?succeeded:\s*(\d+)') {
        $counts = "P=$($Matches[3]) F=$($Matches[2]) T=$($Matches[1])"
    }

    $r = [PSCustomObject]@{
        Scenario=$Scenario; Case=$Case
        Command="$(Split-Path $Exe -Leaf) $($CmdArgs -join ' ')"
        Chars=$out.Length; ExitCode=$exit; HasSummary=[bool]$hasSummary
        Counts=$counts; Ms=[int]$sw.Elapsed.TotalMilliseconds; Output=$out
    }
    $script:Results.Add($r)

    $isZeroCase = ($Case -like '*zero*' -or $Case -like '*minexpect*')
    $note = ''
    if ($isZeroCase -and $exit -eq 0) { $note = '  <-- SILENT FALSE PASS' }
    elseif ((-not $isZeroCase) -and $counts -and $counts -notlike '*F=2*') { $note = '  <-- WRONG FAILURE COUNT' }
    $cShow = if ($counts) { $counts } else { '' }
    Write-Host ("    {0,-18} chars={1,-7} exit={2,-6} sum={3,-6} {4}{5}" -f $Case,$r.Chars,$exit,$r.HasSummary,$cShow,$note)
}

# ---------------------------------------------------------------- static detection
function Get-DetectedRunner {
    param([string]$ProjPath)
    $c = Get-Content $ProjPath -Raw
    $gj = $null; $d = (Get-Item $ProjPath).Directory
    while ($d -and -not $gj) {
        $p = Join-Path $d.FullName 'global.json'
        if (Test-Path $p) { $gj = Get-Content $p -Raw }
        $d = $d.Parent
    }
    if ($gj -match 'Microsoft\.Testing\.Platform') { return 'MTP (global.json)' }
    if ($c -match 'EnableMSTestRunner|UseMicrosoftTestingPlatform|EnableNUnitRunner|EnableXunitRunner') { return 'MTP (property)' }
    if ($c -match 'Include="xunit\.v3"')           { return 'MTP (xunit.v3)' }
    if ($c -match 'Include="Microsoft\.Testing\.') { return 'MTP (pkg)' }
    if ($c -match 'Include="MSTest"')              { return 'VSTest (MSTest meta, no runner prop)' }
    if ($c -match 'Include="Microsoft\.NET\.Test\.Sdk"') { return 'VSTest' }
    return 'unknown'
}

# ---------------------------------------------------------------- scaffolding
function Set-TestBody {
    param([string]$Dir,[string]$Kind,[switch]$AllPass)
    $body = switch ($Kind) {
        'mstest' {
@'
using Microsoft.VisualStudio.TestTools.UnitTesting;
namespace ProbeTests
{
  [TestClass] public class T {
    [TestMethod] public void Pass1(){ Assert.AreEqual(1,1); }
    [TestMethod] public void Pass2(){ Assert.AreEqual(2,2); }
    [TestMethod] public void Pass3(){ Assert.AreEqual(3,3); }
    [TestMethod] public void Pass4(){ Assert.AreEqual(4,4); }
    [TestMethod] public void Pass5(){ Assert.AreEqual(5,5); }
    [TestMethod] public void Pass6(){ Assert.AreEqual(6,6); }
    [TestMethod] public void FailA(){ Assert.AreEqual(1,2,"probe failure A"); }
    [TestMethod] public void FailB(){ throw new System.InvalidOperationException("probe failure B"); }
  }
}
'@ }
        'xunit' {
@'
using Xunit;
namespace ProbeTests
{
  public class T {
    [Fact] public void Pass1(){ Assert.Equal(1,1); }
    [Fact] public void Pass2(){ Assert.Equal(2,2); }
    [Fact] public void Pass3(){ Assert.Equal(3,3); }
    [Fact] public void Pass4(){ Assert.Equal(4,4); }
    [Fact] public void Pass5(){ Assert.Equal(5,5); }
    [Fact] public void Pass6(){ Assert.Equal(6,6); }
    [Fact] public void FailA(){ Assert.Equal(1,2); }
    [Fact] public void FailB(){ throw new System.InvalidOperationException("probe failure B"); }
  }
}
'@ }
        'nunit' {
@'
using NUnit.Framework;
namespace ProbeTests
{
  public class T {
    [Test] public void Pass1(){ Assert.That(1,Is.EqualTo(1)); }
    [Test] public void Pass2(){ Assert.That(2,Is.EqualTo(2)); }
    [Test] public void Pass3(){ Assert.That(3,Is.EqualTo(3)); }
    [Test] public void Pass4(){ Assert.That(4,Is.EqualTo(4)); }
    [Test] public void Pass5(){ Assert.That(5,Is.EqualTo(5)); }
    [Test] public void Pass6(){ Assert.That(6,Is.EqualTo(6)); }
    [Test] public void FailA(){ Assert.That(1,Is.EqualTo(2)); }
    [Test] public void FailB(){ throw new System.InvalidOperationException("probe failure B"); }
  }
}
'@ }
    }
    if ($AllPass) {
        # neutralise the two deliberate failures -> 8 passing tests
        $body = $body -replace 'Assert\.AreEqual\(1,2,"probe failure A"\)','Assert.AreEqual(1,1)'
        $body = $body -replace 'Assert\.Equal\(1,2\)','Assert.Equal(1,1)'
        $body = $body -replace 'Assert\.That\(1,Is\.EqualTo\(2\)\)','Assert.That(1,Is.EqualTo(1))'
        $body = $body -replace 'throw new System\.InvalidOperationException\("probe failure B"\);',''
    }
    $body | Set-Content (Join-Path $Dir 'ProbeTests.cs') -Encoding UTF8
}

function New-TestProject {
    param([string]$Dir,[string]$Kind,[string]$Tfm='net10.0',[hashtable]$Props=@{},[string[]]$Packages,[switch]$AllPass)
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
    $name = Split-Path $Dir -Leaf
    $propLines = ($Props.GetEnumerator() | ForEach-Object { "    <$($_.Key)>$($_.Value)</$($_.Key)>" }) -join "`n"
    $pkgLines  = ($Packages | ForEach-Object {
        $parts = $_ -split '\|'
        "    <PackageReference Include=`"$($parts[0])`" Version=`"$($parts[1])`" />" }) -join "`n"
    # Older TFMs need RollForward when their exact runtime isn't installed
    $roll = if ($Tfm -ne 'net10.0') { "`n    <RollForward>LatestMajor</RollForward>" } else { '' }
    @"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>$Tfm</TargetFramework>
    <LangVersion>latest</LangVersion>$roll
    <Nullable>disable</Nullable>
    <IsPackable>false</IsPackable>
    <NoWarn>NETSDK1138;NU1701</NoWarn>
$propLines
  </PropertyGroup>
  <ItemGroup>
$pkgLines
  </ItemGroup>
</Project>
"@ | Set-Content (Join-Path $Dir "$name.csproj") -Encoding UTF8
    Set-TestBody -Dir $Dir -Kind $Kind -AllPass:$AllPass
}

# ---------------------------------------------------------------- environment
Write-Head "Environment"
$sdks = (dotnet --list-sdks | ForEach-Object { ($_ -split ' ')[0] })
Write-Note "dotnet SDKs: $($sdks -join ', ')"
if (-not ($sdks | Where-Object { $_ -like '10.*' })) {
    Write-Host "    No .NET 10 SDK found. Aborting." -ForegroundColor Red; return }

if (Test-Path $Root) { Remove-Item $Root -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Root | Out-Null
Write-Note "scratch: $Root   (all projects net10.0)"

# ---------------------------------------------------------------- projects
Write-Head "Runtimes installed (old TFMs need these, or RollForward)"
$runtimes = dotnet --list-runtimes | Where-Object { $_ -like 'Microsoft.NETCore.App*' } |
            ForEach-Object { ($_ -split ' ')[1] }
Write-Note "Microsoft.NETCore.App: $(($runtimes | Sort-Object -Unique) -join ', ')"
foreach ($t in $Tfms) {
    $maj = ($t -replace '^net','' -replace '\..*$','')
    $have = $runtimes | Where-Object { $_ -like "$maj.*" }
    if ($have) { Write-Note "  $t -> runtime $maj present" }
    else       { Write-Note "  $t -> runtime $maj MISSING; relying on RollForward=LatestMajor" }
}

Write-Head "Scaffolding (TFMs: $($Tfms -join ', '))"

# Core matrix, repeated per TFM. Short names keep the report readable.
foreach ($t in $Tfms) {
    $sfx = $t -replace '\.','' -replace 'net','n'      # net8.0 -> n80

    # Latest test packages dropped net6.0: Test.Sdk 18.x errors, MSTest 4.x
    # falls back to .NETFramework assets. Pin to the last supporting majors.
    if ($t -eq 'net6.0' -or $t -eq 'net7.0') { $sdkV='17.*'; $msV='3.*' }
    else                                     { $sdkV='*';    $msV='*'   }

    New-TestProject "$Root\vstest_$sfx" mstest -Tfm $t -Packages @(
        "Microsoft.NET.Test.Sdk|$sdkV","MSTest.TestAdapter|$msV","MSTest.TestFramework|$msV")
    Write-Note "vstest_$sfx           VSTest MSTest, 2 failing        [$t]"

    New-TestProject "$Root\mtp_$sfx" mstest -Tfm $t -Packages @("MSTest|$msV") `
        -Props @{ EnableMSTestRunner='true'; OutputType='Exe' }
    Write-Note "mtp_$sfx              MTP MSTest, 2 failing           [$t]"

    New-TestProject "$Root\vstestpass_$sfx" mstest -Tfm $t -AllPass -Packages @(
        "Microsoft.NET.Test.Sdk|$sdkV","MSTest.TestAdapter|$msV","MSTest.TestFramework|$msV")
    Write-Note "vstestpass_$sfx       VSTest MSTest, all passing      [$t]"

    New-TestProject "$Root\mtppass_$sfx" mstest -Tfm $t -AllPass -Packages @("MSTest|$msV") `
        -Props @{ EnableMSTestRunner='true'; OutputType='Exe' }
    Write-Note "mtppass_$sfx          MTP MSTest, all passing         [$t]"
}

# Framework-variety scenarios: only on the newest TFM, already characterised there
$newest = $Tfms[-1]
New-TestProject "$Root\x_vstest_xunit" xunit -Tfm $newest -Packages @(
    'Microsoft.NET.Test.Sdk|*','xunit|2.*','xunit.runner.visualstudio|*')
New-TestProject "$Root\x_vstest_nunit" nunit -Tfm $newest -Packages @(
    'Microsoft.NET.Test.Sdk|*','NUnit|4.*','NUnit3TestAdapter|*')
New-TestProject "$Root\x_mtp_nunit" nunit -Tfm $newest -Packages @('NUnit|4.*','NUnit3TestAdapter|*') `
    -Props @{ EnableNUnitRunner='true'; OutputType='Exe' }
New-TestProject "$Root\x_mtp_xunit3" xunit -Tfm $newest -Packages @('xunit.v3|*') -Props @{ OutputType='Exe' }
Write-Note "x_* (xunit/nunit, VSTest + MTP)                          [$newest]"

# denoizinator-net Phase 4 acceptance needs NUnit-MTP on net8.0 too, not just
# the newest TFM -- see docs/denoizinator-net-spec.md §6 Phase 4.
if ($Tfms -contains 'net8.0' -and $newest -ne 'net8.0') {
    New-TestProject "$Root\x_mtp_nunit_n80" nunit -Tfm 'net8.0' -Packages @('NUnit|4.*','NUnit3TestAdapter|*') `
        -Props @{ EnableNUnitRunner='true'; OutputType='Exe' }
    Write-Note "x_mtp_nunit_n80       MTP NUnit, 2 failing            [net8.0]"
}

$tdir = "$Root\x_template_mstest"
& dotnet new mstest -o $tdir 2>&1 | Out-Null
if (Test-Path $tdir) {
    Get-ChildItem $tdir -Filter *.cs | Remove-Item -Force -EA SilentlyContinue
    Set-TestBody -Dir $tdir -Kind mstest
    Write-Note "x_template_mstest     'dotnet new mstest' SDK default"
}

# ---------------------------------------------------------------- detection
Write-Head "Static detection (what the routing table concludes)"
Get-ChildItem $Root -Directory | Sort-Object Name | ForEach-Object {
    $p = Get-ChildItem $_.FullName -Filter *.csproj | Select-Object -First 1
    if ($p) { Write-Host ("    {0,-22} -> {1}" -f $_.Name,(Get-DetectedRunner $p.FullName)) }
}

# ---------------------------------------------------------------- build
Write-Head "Restore + build"
$built = @{}
Get-ChildItem $Root -Directory | Sort-Object Name | ForEach-Object {
    $name = $_.Name
    $proj = Get-ChildItem $_.FullName -Filter *.csproj | Select-Object -First 1
    if (-not $proj) { return }
    Write-Host "    $name ..." -NoNewline
    $log = & dotnet build $proj.FullName -v:q --nologo 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0) { Write-Host " ok" -ForegroundColor Green; $built[$name] = $proj.FullName }
    else {
        Write-Host " FAILED" -ForegroundColor Red
        $errLines = $log -split "`n" | Where-Object { $_ -match ': error|error [A-Z]+\d+' } | Select-Object -First 6
        if (-not $errLines) { $errLines = $log -split "`n" | Where-Object { $_.Trim() } | Select-Object -First 8 }
        $errLines | ForEach-Object { Write-Note $_.Trim() }
        $script:Results.Add([PSCustomObject]@{
            Scenario=$name; Case='build-FAILED'; Command='dotnet build'; Chars=$log.Length
            ExitCode=1; HasSummary=$false; Counts=$null; Ms=0; Output=$log })
    }
}

# ---------------------------------------------------------------- matrix
foreach ($name in ($built.Keys | Sort-Object)) {
    $proj = $built[$name]; $dir = Split-Path $proj -Parent
    Write-Head $name

    Measure-Run $name 'baseline'       'dotnet' @('test',$proj,'--no-build') $dir
    Measure-Run $name 'nologo-vq'      'dotnet' @('test',$proj,'--no-build','--nologo','-v:q') $dir
    Measure-Run $name 'logger-quiet'   'dotnet' @('test',$proj,'--no-build','--nologo','-v:q','--logger','console;verbosity=quiet') $dir
    Measure-Run $name 'logger-minimal' 'dotnet' @('test',$proj,'--no-build','--nologo','-v:q','--logger','console;verbosity=minimal') $dir
    Measure-Run $name 'trx'            'dotnet' @('test',$proj,'--no-build','--nologo','-v:q','--logger','console;verbosity=quiet','--logger','trx;LogFileName=probe.trx','--results-directory','.dnz') $dir
    Measure-Run $name 'zero-filter'    'dotnet' @('test',$proj,'--no-build','--nologo','-v:q','--filter','FullyQualifiedName~ZZZNoSuchTest') $dir
    Measure-Run $name 'showfail-prop'  'dotnet' @('test',$proj,'--no-build','--nologo','-v:q','-p:TestingPlatformShowTestsFailure=true') $dir

    $gj = Join-Path $dir 'global.json'
    '{ "test": { "runner": "Microsoft.Testing.Platform" } }' | Set-Content $gj -Encoding UTF8
    Measure-Run $name 'gj-baseline'    'dotnet' @('test','--project',$proj,'--no-build') $dir
    Measure-Run $name 'gj-quiet'       'dotnet' @('test','--project',$proj,'--no-build','--no-progress','--no-ansi') $dir
    Measure-Run $name 'gj-minexpect99' 'dotnet' @('test','--project',$proj,'--no-build','--no-progress','--no-ansi','--minimum-expected-tests','99') $dir
    Measure-Run $name 'gj-trx'         'dotnet' @('test','--project',$proj,'--no-build','--no-progress','--no-ansi','--results-directory','.dnz','--','--report-trx') $dir
    Remove-Item $gj -Force -EA SilentlyContinue

    $exe = Get-ChildItem "$dir\bin\Debug" -Recurse -Filter "$name.exe" -EA SilentlyContinue | Select-Object -First 1
    if ($exe) {
        $ed = Split-Path $exe.FullName -Parent
        Measure-Run $name 'exe-direct'      $exe.FullName @() $ed
        Measure-Run $name 'exe-quiet'       $exe.FullName @('--no-progress','--no-ansi') $ed
        Measure-Run $name 'exe-minexpect99' $exe.FullName @('--no-progress','--no-ansi','--minimum-expected-tests','99') $ed
        Measure-Run $name 'exe-zerofilter'  $exe.FullName @('--no-progress','--no-ansi','--filter','ZZZNoSuchTest') $ed
        Measure-Run $name 'exe-trx'         $exe.FullName @('--no-progress','--no-ansi','--report-trx','--results-directory','.dnz') $ed
    }
}

# ---------------------------------------------------------------- report
Write-Head "FULL MATRIX"
$script:Results | Select-Object Scenario,Case,Chars,ExitCode,HasSummary,Counts |
    Format-Table -AutoSize | Out-String -Width 220 | Write-Host

Write-Head "QUIETEST CONFIGS STILL REPORTING CORRECT COUNTS (P=6 F=2)"
$script:Results | Where-Object { $_.Counts -like 'P=6 F=2*' } | Sort-Object Chars |
    Select-Object -First 20 Scenario,Case,Chars,ExitCode,Counts |
    Format-Table -AutoSize | Out-String -Width 220 | Write-Host

Write-Head "ZERO-TEST / MIN-EXPECTED  (exit 0 == silent false pass)"
$script:Results | Where-Object { $_.Case -like '*zero*' -or $_.Case -like '*minexpect*' } |
    Select-Object Scenario,Case,ExitCode,HasSummary,Chars |
    Format-Table -AutoSize | Out-String -Width 220 | Write-Host

Write-Head "WRONG FAILURE COUNTS (must always be F=2)"
$bad = $script:Results | Where-Object { $_.Counts -and $_.Counts -notlike '*F=2*' -and $_.Case -notlike '*zero*' -and $_.Case -notlike '*minexpect*' }
if ($bad) { $bad | Select-Object Scenario,Case,Counts,ExitCode | Format-Table -AutoSize | Out-String -Width 220 | Write-Host }
else { Write-Note "none -- every runner reported 2 failures correctly" }

Write-Head "EXIT CODE VOCABULARY"
$script:Results | Group-Object ExitCode | Sort-Object { [int]$_.Name } |
    ForEach-Object { Write-Host ("    exit {0,-8} x{1,-4} e.g. {2}" -f $_.Name,$_.Count,($_.Group[0].Scenario+'/'+$_.Group[0].Case)) }

Write-Head "TRX / REPORT FILES PRODUCED"
$trx = Get-ChildItem $Root -Recurse -Include *.trx -EA SilentlyContinue
if ($trx) { $trx | Select-Object @{n='Path';e={$_.FullName.Replace($Root,'')}},Length | Format-Table -AutoSize | Out-String -Width 220 | Write-Host }
else { Write-Note "none produced" }

Write-Head "BUILD FAILURES (a TFM/package incompatibility is itself a finding)"
$bf = $script:Results | Where-Object { $_.Case -eq 'build-FAILED' }
if ($bf) {
    foreach ($b in $bf) {
        Write-Host "`n  --- $($b.Scenario)" -ForegroundColor Yellow
        ($b.Output -split "`n" | Where-Object { $_ -match ': error' } | Select-Object -First 3) |
            ForEach-Object { Write-Host "      $($_.Trim())" -ForegroundColor DarkYellow }
    }
} else { Write-Note "none -- every scenario built" }

Write-Head "CROSS-TFM COMPARISON (does behaviour change by target framework?)"
$core = $script:Results | Where-Object { $_.Scenario -match '^(vstest|mtp|vstestpass|mtppass)_n' }
foreach ($c in @('baseline','nologo-vq','zero-filter','exe-direct','exe-minexpect99','exe-zerofilter')) {
    $rows = $core | Where-Object { $_.Case -eq $c }
    if (-not $rows) { continue }
    Write-Host "`n  case: $c" -ForegroundColor Yellow
    $rows | Sort-Object Scenario | ForEach-Object {
        Write-Host ("      {0,-20} chars={1,-7} exit={2,-5} sum={3,-6} {4}" -f `
            $_.Scenario,$_.Chars,$_.ExitCode,$_.HasSummary,$(if($_.Counts){$_.Counts}else{''}))
    }
}

Write-Head "ANOMALY OUTPUT (unusual exit codes / no summary / empty)"
$anom = $script:Results | Where-Object {
    ($_.ExitCode -notin 0,1,2) -or
    ((-not $_.HasSummary) -and $_.Case -notlike '*zero*' -and $_.Case -notlike '*minexpect*') -or
    ($_.Chars -eq 0)
}
$shown = @{}
foreach ($a in $anom) {
    $key = "$($a.Scenario)|$($a.ExitCode)|$([math]::Min($a.Chars,1))"
    if ($shown.ContainsKey($key)) { continue }
    $shown[$key] = $true
    Write-Host ("`n  --- {0} / {1}  exit={2} chars={3}" -f $a.Scenario,$a.Case,$a.ExitCode,$a.Chars) -ForegroundColor Yellow
    $txt = if ($a.Output) { $a.Output.Trim() } else { '<empty>' }
    if ($txt.Length -gt 500) { $txt = $txt.Substring(0,500) + ' ...[truncated]' }
    ($txt -split "`n") | ForEach-Object { Write-Host "      $($_.TrimEnd())" -ForegroundColor DarkYellow }
}

$outFile = Join-Path (Get-Location) 'probe-results.json'
$script:Results | ConvertTo-Json -Depth 6 | Set-Content $outFile -Encoding UTF8
Write-Host "`nFull results incl. every stdout: $outFile" -ForegroundColor Green
if (-not $KeepArtifacts) { Write-Host "Clean up: Remove-Item '$Root' -Recurse -Force" -ForegroundColor DarkGray }
