<#
.SYNOPSIS
    Find a net6.0 VSTest configuration that actually builds.

.DESCRIPTION
    Probe-DotnetTest.ps1 left a hole: vstest_n60 and vstestpass_n60 never built,
    so net6.0 VSTest has no row anywhere in the findings. The failure:

      Microsoft.NET.Test.Sdk.targets(4,5): error : Microsoft.NET.Test.Sdk doesn't
      support net6.0 ... Consider upgrading your TargetFramework to net8.0 or later.

    That was with Test.Sdk 17.14.1 -- so pinning the major to 17.* is NOT enough.
    This probe walks candidate versions and the suppression switch to find what
    works, because the routing table cannot claim net6.0 coverage without it.

.EXAMPLE
    ./Probe-Net60Vstest.ps1
#>

[CmdletBinding()]
param(
    [string]   $Root     = (Join-Path $env:TEMP 'dnz-n60-probe'),
    [string[]] $SdkVersions = @('17.14.1','17.11.1','17.9.0','17.6.3','17.3.2'),
    [string]   $OutJson  = (Join-Path $PSScriptRoot 'evidence/net60-vstest-results.json'),
    [switch]   $KeepArtifacts
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'

$results = [System.Collections.Generic.List[object]]::new()

function New-N60Project {
    param([string]$Dir,[string]$SdkVersion,[switch]$Suppress)

    if (Test-Path $Dir) { Remove-Item $Dir -Recurse -Force }
    New-Item -ItemType Directory -Path $Dir -Force | Out-Null

    $suppressLine = if ($Suppress) { '    <SuppressTfmSupportBuildErrors>true</SuppressTfmSupportBuildErrors>' } else { '' }
    @"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <LangVersion>latest</LangVersion>
    <IsPackable>false</IsPackable>
    <RollForward>LatestMajor</RollForward>
$suppressLine
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="$SdkVersion" />
    <PackageReference Include="MSTest.TestAdapter" Version="3.*" />
    <PackageReference Include="MSTest.TestFramework" Version="3.*" />
  </ItemGroup>
</Project>
"@ | Set-Content (Join-Path $Dir ((Split-Path $Dir -Leaf) + '.csproj')) -Encoding utf8

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
'@ | Set-Content (Join-Path $Dir 'Tests.cs') -Encoding utf8
}

if (Test-Path $Root) { Remove-Item $Root -Recurse -Force }
New-Item -ItemType Directory -Path $Root -Force | Out-Null

Write-Host "=== net6.0 runtime availability" -ForegroundColor Cyan
$runtimes = & dotnet --list-runtimes 2>&1 | Out-String
$has60 = $runtimes -match 'Microsoft\.NETCore\.App 6\.'
Write-Host ("    real .NET 6 runtime present: {0}" -f $has60)
if (-not $has60) { Write-Warning "    results rely on RollForward=LatestMajor -- note that in any conclusion" }

foreach ($suppress in @($false, $true)) {
    foreach ($v in $SdkVersions) {
        $label = "sdk$($v -replace '\.','')" + $(if ($suppress) { '-suppress' } else { '' })
        $dir = Join-Path $Root $label
        New-N60Project -Dir $dir -SdkVersion $v -Suppress:$suppress

        $proj = Get-ChildItem $dir -Filter *.csproj | Select-Object -First 1
        $log = & dotnet build $proj.FullName -v:q --nologo 2>&1 | Out-String
        $built = ($LASTEXITCODE -eq 0)

        $testOut = ''; $testExit = $null
        if ($built) {
            $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
            $testOut = (& dotnet test $proj.FullName --no-build --nologo -v:q 2>&1 | Out-String)
            $testExit = $LASTEXITCODE
            $ErrorActionPreference = $prev
        }

        $counts = $null
        if ($testOut -match 'Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+),\s*Total:\s*(\d+)') {
            $counts = "P=$($Matches[2]) F=$($Matches[1]) S=$($Matches[3]) T=$($Matches[4])"
        }

        $results.Add([PSCustomObject]@{
            SdkVersion = $v; Suppress = $suppress; Built = $built
            BuildError = if ($built) { $null } else {
                (($log -split "`n" | Where-Object { $_ -match ': error' } | Select-Object -First 1) -replace '\s+',' ').Trim()
            }
            TestExit = $testExit; TestChars = $testOut.Length; Counts = $counts
            CountsCorrect = ($counts -eq 'P=6 F=2 S=0 T=8')
            BuildLog = $log; TestOutput = $testOut
        })

        $mark = if (-not $built) { 'BUILD FAILED' }
                elseif ($counts -eq 'P=6 F=2 S=0 T=8') { 'OK' }
                else { "built, counts=$counts" }
        $color = if ($mark -eq 'OK') { 'Green' } elseif ($built) { 'Yellow' } else { 'Red' }
        Write-Host ("    {0,-24} suppress={1,-6} {2}" -f $v, $suppress, $mark) -ForegroundColor $color
    }
}

Write-Host "`n=== VERDICT ===" -ForegroundColor Cyan
$works = $results | Where-Object { $_.Built -and $_.CountsCorrect }
if ($works) {
    $cleanest = $works | Where-Object { -not $_.Suppress } | Select-Object -First 1
    if ($cleanest) {
        Write-Host ("    Test.Sdk {0} builds net6.0 WITHOUT the suppression switch." -f $cleanest.SdkVersion) -ForegroundColor Green
    } else {
        Write-Host ("    Only works with SuppressTfmSupportBuildErrors=true (best: Test.Sdk {0})." -f $works[0].SdkVersion) -ForegroundColor Yellow
        Write-Host  "    That is a supported-configuration warning being silenced. Document it." -ForegroundColor Yellow
    }
} else {
    Write-Host "    No tested configuration produced a working net6.0 VSTest project." -ForegroundColor Red
    Write-Host "    The routing table must treat net6.0 VSTest as unsupported, or widen -SdkVersions." -ForegroundColor Red
}

$dir = Split-Path -Parent $OutJson
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$results | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutJson -Encoding utf8
Write-Host "`nwrote $OutJson" -ForegroundColor Green

if (-not $KeepArtifacts) { Write-Host "Clean up: Remove-Item '$Root' -Recurse -Force" -ForegroundColor DarkGray }
