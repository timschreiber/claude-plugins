<#
.SYNOPSIS
  Probes Framework-tier tooling: MSBuild.exe quiet-flag acceptance, restore
  noise (nuget.exe restore vs msbuild -t:Restore), vstest.console.exe exit
  codes, and solution- vs per-project banner multiplication.

.DESCRIPTION
  Scaffolds five throwaway net48 projects under -Root: a legacy non-SDK
  csproj using packages.config, the same project migrated to
  PackageReference, an SDK-style net48 csproj, an ASP.NET 4.x web
  application, and a dedicated legacy-format test project driven through
  vstest.console.exe. Each carries one deliberate build warning
  ([Obsolete] call). #1, #2, #3, #5 also carry MSTest's 6-pass/2-fail body
  (verbatim from Probe-DotnetTest.ps1's Set-TestBody) so restore path and
  project style can both be crossed against vstest.console.exe results, not
  just build noise. #4 (the web app) is build-only -- a Web Application
  Project isn't itself a test-carrying project type.

  None of msbuild.exe, vstest.console.exe, or nuget.exe reliably resolve on
  bare PATH outside a Developer Command Prompt, so every tool is resolved
  via vswhere.exe first, PATH only as a secondary check (the check itself
  is a measured finding, not an assumption). nuget.exe additionally has no
  vswhere-discoverable home at all -- it is downloaded on demand into a
  gitignored probes/.tools/ cache if not already present.

  Every output-volume measurement uses Start-Process with stdout/stderr
  redirected to SEPARATE files, never 2>&1 -- see probes/README.md's
  "Measurement discipline" section. Restore output is recorded as its own
  Phase, never folded into build numbers.

.EXAMPLE
  ./Probe-FrameworkBuild.ps1
  ./Probe-FrameworkBuild.ps1 -Root D:\scratch\probe-fx -KeepArtifacts
#>
[CmdletBinding()]
param(
    [string] $Root      = (Join-Path $env:TEMP 'dnz-probe-fx'),
    [switch] $KeepArtifacts,
    [string] $OutJson   = (Join-Path $PSScriptRoot 'evidence/framework-build-results.json')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_NOLOGO = '1'

$script:Results = [System.Collections.Generic.List[object]]::new()

function Write-Head($t) { Write-Host "`n=== $t" -ForegroundColor Cyan }
function Write-Note($t) { Write-Host "    $t" -ForegroundColor DarkGray }

# ---------------------------------------------------------------- tool resolution
function Resolve-FrameworkTools {
    $vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
    $records = [System.Collections.Generic.List[object]]::new()

    # --- MSBuild.exe --------------------------------------------------
    $msbuildPath = $null; $msbuildViaPath = $false; $msbuildViaVswhere = $false
    $cmd = Get-Command msbuild.exe -ErrorAction SilentlyContinue
    if ($cmd) { $msbuildPath = $cmd.Source; $msbuildViaPath = $true }
    if (-not $msbuildPath -and (Test-Path -LiteralPath $vswhere)) {
        $found = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild `
            -find 'MSBuild\**\Bin\MSBuild.exe' 2>$null | Select-Object -First 1
        if ($found -and (Test-Path -LiteralPath $found)) { $msbuildPath = $found; $msbuildViaVswhere = $true }
    }
    $msbuildVer = if ($msbuildPath) { (Get-Item -LiteralPath $msbuildPath).VersionInfo.ProductVersion } else { $null }
    $records.Add([PSCustomObject]@{
        Phase='resolve'; Tool='msbuild.exe'; ResolvedViaPath=$msbuildViaPath
        ResolvedViaVswhere=$msbuildViaVswhere; Path=$msbuildPath; Version=$msbuildVer; Downloaded=$false
    })

    # --- vstest.console.exe --------------------------------------------
    $vstestPath = $null; $vstestViaPath = $false; $vstestViaVswhere = $false
    $cmd = Get-Command vstest.console.exe -ErrorAction SilentlyContinue
    if ($cmd) { $vstestPath = $cmd.Source; $vstestViaPath = $true }
    if (-not $vstestPath -and (Test-Path -LiteralPath $vswhere)) {
        $found = & $vswhere -latest -products * `
            -find 'Common7\IDE\CommonExtensions\Microsoft\TestWindow\vstest.console.exe' 2>$null |
            Select-Object -First 1
        if ($found -and (Test-Path -LiteralPath $found)) { $vstestPath = $found; $vstestViaVswhere = $true }
    }
    $vstestVer = if ($vstestPath) { (Get-Item -LiteralPath $vstestPath).VersionInfo.ProductVersion } else { $null }
    $records.Add([PSCustomObject]@{
        Phase='resolve'; Tool='vstest.console.exe'; ResolvedViaPath=$vstestViaPath
        ResolvedViaVswhere=$vstestViaVswhere; Path=$vstestPath; Version=$vstestVer; Downloaded=$false
    })

    # --- nuget.exe -------------------------------------------------------
    $nugetPath = $null; $nugetViaPath = $false; $nugetDownloaded = $false
    $cmd = Get-Command nuget.exe -ErrorAction SilentlyContinue
    if ($cmd) { $nugetPath = $cmd.Source; $nugetViaPath = $true }
    if (-not $nugetPath) {
        $toolCache = Join-Path $PSScriptRoot '.tools'
        $cached = Join-Path $toolCache 'nuget.exe'
        if (Test-Path -LiteralPath $cached) { $nugetPath = $cached }
        else {
            try {
                New-Item -ItemType Directory -Force -Path $toolCache | Out-Null
                Write-Note "downloading nuget.exe -> $cached"
                Invoke-WebRequest -Uri 'https://dist.nuget.org/win-x86-commandline/latest/nuget.exe' `
                    -OutFile $cached -UseBasicParsing
                $nugetPath = $cached; $nugetDownloaded = $true
            } catch {
                Write-Note "nuget.exe download FAILED: $_"
                $nugetPath = $null
            }
        }
    }
    $nugetVer = if ($nugetPath -and (Test-Path -LiteralPath $nugetPath)) { (Get-Item -LiteralPath $nugetPath).VersionInfo.ProductVersion } else { $null }
    $records.Add([PSCustomObject]@{
        Phase='resolve'; Tool='nuget.exe'; ResolvedViaPath=$nugetViaPath
        ResolvedViaVswhere=$false; Path=$nugetPath; Version=$nugetVer; Downloaded=$nugetDownloaded
    })

    foreach ($r in $records) { $script:Results.Add($r) }
    foreach ($r in $records) {
        Write-Note ("{0,-20} path={1,-6} vswhere={2,-6} downloaded={3,-6} -> {4}" -f `
            $r.Tool, $r.ResolvedViaPath, $r.ResolvedViaVswhere, $r.Downloaded, ($r.Path ?? '(not found)'))
    }

    return @{ MSBuild = $msbuildPath; Vstest = $vstestPath; Nuget = $nugetPath }
}

# ---------------------------------------------------------------- measurement
function Measure-FxRun {
    param(
        [string]   $Scenario,
        [string]   $Case,
        [string]   $Phase,
        [string]   $Exe,
        [string[]] $CmdArgs,
        [string]   $WorkDir
    )
    if (-not $Exe -or -not (Test-Path -LiteralPath $Exe)) {
        Write-Note "  $Case -- SKIPPED, tool not resolved"
        return
    }

    $tmp = Join-Path ([IO.Path]::GetTempPath()) ('dnz-fx-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    $so = Join-Path $tmp 'stdout.txt'
    $se = Join-Path $tmp 'stderr.txt'
    $si = Join-Path $tmp 'stdin.txt'
    Set-Content -LiteralPath $si -Value '' -NoNewline
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $exitCode = -999
    $timedOut = $false
    try {
        $p = if ($CmdArgs -and $CmdArgs.Count) {
            Start-Process -FilePath $Exe -ArgumentList $CmdArgs -WorkingDirectory $WorkDir `
                -RedirectStandardOutput $so -RedirectStandardError $se -RedirectStandardInput $si -NoNewWindow -PassThru
        } else {
            Start-Process -FilePath $Exe -WorkingDirectory $WorkDir `
                -RedirectStandardOutput $so -RedirectStandardError $se -RedirectStandardInput $si -NoNewWindow -PassThru
        }
        # A hard per-call timeout: one hung invocation (e.g. a credential
        # prompt with no attached console) must not stall every remaining
        # measurement in the matrix.
        if (-not $p.WaitForExit(120000)) {
            $timedOut = $true
            $p | Stop-Process -Force -EA SilentlyContinue
        }
        $exitCode = if ($timedOut) { -998 } else { $p.ExitCode }
    } catch {
        Write-Note "  $Case -- PROBE EXCEPTION: $_"
    } finally {
        $sw.Stop()
    }

    $outTxt = if (Test-Path -LiteralPath $so) { Get-Content -LiteralPath $so -Raw } else { '' }
    $errTxt = if (Test-Path -LiteralPath $se) { Get-Content -LiteralPath $se -Raw } else { '' }
    if ($null -eq $outTxt) { $outTxt = '' }
    if ($null -eq $errTxt) { $errTxt = '' }
    Remove-Item -LiteralPath $tmp -Recurse -Force -EA SilentlyContinue

    # MSBuild's own rejection phrasing differs from the dotnet CLI's ("unknown
    # option"): MSB1001 / "Unrecognized option" is how Framework MSBuild.exe
    # reports an unrecognized switch.
    $rejected = [bool]($errTxt -match 'unknown option|MSB1001|Unrecognized option' -or $outTxt -match 'unknown option|MSB1001|Unrecognized option')

    $r = [PSCustomObject]@{
        Phase=$Phase; Scenario=$Scenario; Case=$Case
        Command="$(Split-Path $Exe -Leaf) $($CmdArgs -join ' ')"
        ExitCode=$exitCode
        StdoutChars=$outTxt.Length; StderrChars=$errTxt.Length; TotalChars=$outTxt.Length+$errTxt.Length
        Rejected=$rejected; TimedOut=$timedOut
        Ms=[int]$sw.Elapsed.TotalMilliseconds
        Stdout=$outTxt; Stderr=$errTxt
    }
    $script:Results.Add($r)

    $flag = if ($r.TimedOut) { '  <-- TIMED OUT, KILLED' } elseif ($r.Rejected) { '  <-- REJECTED' } else { '' }
    Write-Host ("    {0,-24} exit={1,-5} stdout={2,-7} stderr={3,-6} ms={4,-6}{5}" -f `
        $Case, $r.ExitCode, $r.StdoutChars, $r.StderrChars, $r.Ms, $flag)
    return $r
}

# ---------------------------------------------------------------- scaffolding
function Set-FxTestBody {
    param([string]$Dir, [switch]$AllPass)
    $body = @'
using Microsoft.VisualStudio.TestTools.UnitTesting;
namespace ProbeFx
{
  static class Warn { [System.Obsolete("probe warning")] public static void Go(){} }
  [TestClass] public class T {
    static T(){ Warn.Go(); }
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
'@
    if ($AllPass) {
        $body = $body -replace 'Assert\.AreEqual\(1,2,"probe failure A"\)','Assert.AreEqual(1,1)'
        $body = $body -replace 'throw new System\.InvalidOperationException\("probe failure B"\);',''
    }
    $body | Set-Content (Join-Path $Dir 'Lib.cs') -Encoding UTF8
}

$mstestPkgVersion = '3.6.4'
$testSdkVersion   = '17.11.1'

function New-LegacyCsproj {
    param(
        [string]   $Dir,
        [string]   $Name,
        [string]   $Guid,
        [switch]   $UsePackagesConfig,
        [string[]] $PackageRefs   # "Id|Version"
    )
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null

    $pkgRefLines = ''
    if (-not $UsePackagesConfig -and $PackageRefs) {
        $pkgRefLines = ($PackageRefs | ForEach-Object {
            $parts = $_ -split '\|'
            "    <PackageReference Include=`"$($parts[0])`" Version=`"$($parts[1])`" />" }) -join "`n"
    }

    $refItems = if ($UsePackagesConfig) {
        # packages.config restore does not wire up assembly references the way
        # SDK-style/PackageReference restore does (that machinery lives in
        # generated .nuget.g.props/.targets files restore writes for you) --
        # legacy packages.config projects need explicit Reference+HintPath
        # entries pointing at the restored package's lib folder, exactly as
        # Visual Studio's Package Manager would add them on nuget install.
@"
  <ItemGroup>
    <Reference Include="System" />
    <Reference Include="Microsoft.VisualStudio.TestPlatform.TestFramework, Version=14.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a">
      <HintPath>packages\MSTest.TestFramework.$mstestPkgVersion\lib\net462\Microsoft.VisualStudio.TestPlatform.TestFramework.dll</HintPath>
    </Reference>
    <Reference Include="Microsoft.VisualStudio.TestPlatform.TestFramework.Extensions, Version=14.0.0.0, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a">
      <HintPath>packages\MSTest.TestFramework.$mstestPkgVersion\lib\net462\Microsoft.VisualStudio.TestPlatform.TestFramework.Extensions.dll</HintPath>
    </Reference>
  </ItemGroup>
  <ItemGroup>
    <None Include="packages.config" />
  </ItemGroup>
"@
    } else {
@"
  <ItemGroup>
    <PackageReference Include="MSTest.TestAdapter" Version="$mstestPkgVersion" />
    <PackageReference Include="MSTest.TestFramework" Version="$mstestPkgVersion" />
$pkgRefLines
  </ItemGroup>
"@
    }

@"
<Project ToolsVersion="15.0" DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <Import Project="`$(MSBuildExtensionsPath)\`$(MSBuildToolsVersion)\Microsoft.Common.props" Condition="Exists('`$(MSBuildExtensionsPath)\`$(MSBuildToolsVersion)\Microsoft.Common.props')" />
  <PropertyGroup>
    <Configuration Condition=" '`$(Configuration)' == '' ">Debug</Configuration>
    <Platform Condition=" '`$(Platform)' == '' ">AnyCPU</Platform>
    <ProjectGuid>{$Guid}</ProjectGuid>
    <OutputType>Library</OutputType>
    <RootNamespace>ProbeFx</RootNamespace>
    <AssemblyName>$Name</AssemblyName>
    <TargetFrameworkVersion>v4.8</TargetFrameworkVersion>
    <OutputPath>bin\Debug\</OutputPath>
  </PropertyGroup>
$refItems
  <ItemGroup>
    <Compile Include="Lib.cs" />
  </ItemGroup>
  <Import Project="`$(MSBuildToolsPath)\Microsoft.CSharp.targets" />
</Project>
"@ | Set-Content (Join-Path $Dir "$Name.csproj") -Encoding UTF8

    if ($UsePackagesConfig) {
@"
<?xml version="1.0" encoding="utf-8"?>
<packages>
  <package id="MSTest.TestAdapter" version="$mstestPkgVersion" targetFramework="net48" />
  <package id="MSTest.TestFramework" version="$mstestPkgVersion" targetFramework="net48" />
</packages>
"@ | Set-Content (Join-Path $Dir 'packages.config') -Encoding UTF8
    }
}

function New-SdkCsproj {
    param([string]$Dir, [string]$Name)
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
@"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net48</TargetFramework>
    <IsPackable>false</IsPackable>
    <AssemblyName>$Name</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="MSTest.TestAdapter" Version="$mstestPkgVersion" />
    <PackageReference Include="MSTest.TestFramework" Version="$mstestPkgVersion" />
  </ItemGroup>
</Project>
"@ | Set-Content (Join-Path $Dir "$Name.csproj") -Encoding UTF8
}

function New-WebAppProject {
    param([string]$Dir, [string]$Name, [string]$Guid)
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
@"
<Project ToolsVersion="15.0" DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <Import Project="`$(MSBuildExtensionsPath)\`$(MSBuildToolsVersion)\Microsoft.Common.props" Condition="Exists('`$(MSBuildExtensionsPath)\`$(MSBuildToolsVersion)\Microsoft.Common.props')" />
  <PropertyGroup>
    <Configuration Condition=" '`$(Configuration)' == '' ">Debug</Configuration>
    <Platform Condition=" '`$(Platform)' == '' ">AnyCPU</Platform>
    <ProjectGuid>{$Guid}</ProjectGuid>
    <ProjectTypeGuids>{349c5851-65df-11da-9384-00065b846f21};{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}</ProjectTypeGuids>
    <OutputType>Library</OutputType>
    <AssemblyName>$Name</AssemblyName>
    <TargetFrameworkVersion>v4.8</TargetFrameworkVersion>
    <UseIISExpress>false</UseIISExpress>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="System.Web" />
    <Reference Include="System" />
  </ItemGroup>
  <ItemGroup>
    <Compile Include="Global.asax.cs" />
  </ItemGroup>
  <ItemGroup>
    <Content Include="Web.config" />
    <Content Include="Global.asax" />
  </ItemGroup>
  <Import Project="`$(MSBuildBinPath)\Microsoft.CSharp.targets" />
  <Import Project="`$(MSBuildBinPath)\Microsoft.WebApplication.targets" />
</Project>
"@ | Set-Content (Join-Path $Dir "$Name.csproj") -Encoding UTF8

    '<%@ Application Codebehind="Global.asax.cs" Inherits="ProbeFx.Web.Global" %>' |
        Set-Content (Join-Path $Dir 'Global.asax') -Encoding UTF8

@'
namespace ProbeFx.Web {
  static class Warn { [System.Obsolete("probe warning")] public static void Go(){} }
  public class Global : System.Web.HttpApplication {
    protected void Application_Start(object sender, System.EventArgs e) { Warn.Go(); }
  }
}
'@ | Set-Content (Join-Path $Dir 'Global.asax.cs') -Encoding UTF8

    '<configuration><system.web><compilation targetFramework="4.8" debug="true" /></system.web></configuration>' |
        Set-Content (Join-Path $Dir 'Web.config') -Encoding UTF8
}

function New-Solution {
    param([string]$Path, [hashtable[]]$Projects)
    # $Projects: @{ Name=...; RelPath=...; Guid=... }
    $lines = @('Microsoft Visual Studio Solution File, Format Version 12.00','# Visual Studio Version 17')
    foreach ($p in $Projects) {
        $lines += "Project(`"{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}`") = `"$($p.Name)`", `"$($p.RelPath)`", `"{$($p.Guid)}`""
        $lines += 'EndProject'
    }
    $lines += 'Global'
    $lines += "`tGlobalSection(SolutionConfigurationPlatforms) = preSolution"
    $lines += "`t`tDebug|Any CPU = Debug|Any CPU"
    $lines += "`tEndGlobalSection"
    $lines += "`tGlobalSection(ProjectConfigurationPlatforms) = postSolution"
    foreach ($p in $Projects) {
        $lines += "`t`t{$($p.Guid)}.Debug|Any CPU.ActiveCfg = Debug|Any CPU"
        $lines += "`t`t{$($p.Guid)}.Debug|Any CPU.Build.0 = Debug|Any CPU"
    }
    $lines += "`tEndGlobalSection"
    $lines += 'EndGlobal'
    $lines -join "`r`n" | Set-Content -LiteralPath $Path -Encoding UTF8
}

# ---------------------------------------------------------------- run
Write-Head 'Tool resolution'
$tools = Resolve-FrameworkTools
$msbuild = $tools.MSBuild
$vstest  = $tools.Vstest
$nuget   = $tools.Nuget

if (-not $msbuild) {
    Write-Host "`nMSBuild.exe could not be resolved -- aborting; nothing else in this probe can run." -ForegroundColor Red
    $dir = Split-Path -Parent $OutJson
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $script:Results | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutJson -Encoding utf8
    return
}

if (Test-Path -LiteralPath $Root) { Remove-Item -LiteralPath $Root -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Root | Out-Null
Write-Note "scratch: $Root"

Write-Head 'Scaffolding'
$g1='11111111-1111-1111-1111-111111111111'
$g2='22222222-2222-2222-2222-222222222222'
$g3='33333333-3333-3333-3333-333333333333'
$g4='44444444-4444-4444-4444-444444444444'
$g5='55555555-5555-5555-5555-555555555555'
$g5p='55555555-5555-5555-5555-555555555556'   # all-pass sibling

$d1 = Join-Path $Root 'proj1_pkgconfig'
$d2 = Join-Path $Root 'proj2_pkgref'
$d3 = Join-Path $Root 'proj3_sdk'
$d4 = Join-Path $Root 'proj4_web'
$d5 = Join-Path $Root 'proj5_vstest'
$d5p = Join-Path $Root 'proj5_vstest_allpass'

New-LegacyCsproj -Dir $d1 -Name 'proj1_pkgconfig' -Guid $g1 -UsePackagesConfig
Set-FxTestBody -Dir $d1
Write-Note 'proj1_pkgconfig   legacy csproj, packages.config, MSTest 6p/2f'

New-LegacyCsproj -Dir $d2 -Name 'proj2_pkgref' -Guid $g2
Set-FxTestBody -Dir $d2
Write-Note 'proj2_pkgref      legacy csproj, PackageReference, MSTest 6p/2f'

New-SdkCsproj -Dir $d3 -Name 'proj3_sdk'
Set-FxTestBody -Dir $d3
Write-Note 'proj3_sdk         SDK-style net48 csproj, MSTest 6p/2f'

New-WebAppProject -Dir $d4 -Name 'proj4_web' -Guid $g4
Write-Note 'proj4_web         ASP.NET 4.x web application, build-only'

New-LegacyCsproj -Dir $d5 -Name 'proj5_vstest' -Guid $g5 -PackageRefs @("Microsoft.NET.Test.Sdk|$testSdkVersion")
Set-FxTestBody -Dir $d5
New-LegacyCsproj -Dir $d5p -Name 'proj5_vstest_allpass' -Guid $g5p -PackageRefs @("Microsoft.NET.Test.Sdk|$testSdkVersion")
Set-FxTestBody -Dir $d5p -AllPass
Write-Note 'proj5_vstest[_allpass]  legacy MSTest test project, driven via vstest.console.exe'

$slnPath = Join-Path $Root 'FrameworkProbe.sln'
New-Solution -Path $slnPath -Projects @(
    @{ Name='proj1_pkgconfig'; RelPath='proj1_pkgconfig\proj1_pkgconfig.csproj'; Guid=$g1 }
    @{ Name='proj2_pkgref';    RelPath='proj2_pkgref\proj2_pkgref.csproj';       Guid=$g2 }
    @{ Name='proj3_sdk';       RelPath='proj3_sdk\proj3_sdk.csproj';            Guid=$g3 }
    @{ Name='proj5_vstest';    RelPath='proj5_vstest\proj5_vstest.csproj';      Guid=$g5 }
)
Write-Note "FrameworkProbe.sln  bundles #1/#2/#3/#5 (web app #4 excluded -- see plan)"

# ---------------------------------------------------------------- restore
Write-Head 'Restore (Phase=restore, separate from build)'
if ($nuget) {
    # nuget.exe restore against a bare .csproj (not a .sln) cannot infer a
    # packages folder on its own and errors "Cannot determine the packages
    # folder" -- -PackagesDirectory makes the target explicit. Restoring into
    # the project's own packages\ subfolder matches the HintPath layout
    # New-LegacyCsproj's packages.config branch expects.
    Measure-FxRun -Scenario 'proj1_pkgconfig' -Case 'restore-baseline' -Phase 'restore' `
        -Exe $nuget -CmdArgs @('restore', "$d1\proj1_pkgconfig.csproj", '-PackagesDirectory', "$d1\packages") -WorkDir $d1
    Measure-FxRun -Scenario 'proj1_pkgconfig' -Case 'restore-quiet' -Phase 'restore' `
        -Exe $nuget -CmdArgs @('restore', "$d1\proj1_pkgconfig.csproj", '-PackagesDirectory', "$d1\packages", '-Verbosity', 'quiet', '-NonInteractive') -WorkDir $d1
} else {
    Write-Note 'nuget.exe unresolved -- skipping packages.config restore measurement'
}

foreach ($proj in @(
    @{ Name='proj2_pkgref'; Dir=$d2 }
    @{ Name='proj3_sdk';    Dir=$d3 }
    @{ Name='proj5_vstest'; Dir=$d5 }
)) {
    $csproj = "$($proj.Dir)\$($proj.Name).csproj"
    Measure-FxRun -Scenario $proj.Name -Case 'restore-baseline' -Phase 'restore' `
        -Exe $msbuild -CmdArgs @('-t:Restore', $csproj) -WorkDir $proj.Dir
    Measure-FxRun -Scenario $proj.Name -Case 'restore-quiet' -Phase 'restore' `
        -Exe $msbuild -CmdArgs @('-t:Restore', $csproj, '-nologo', '-v:q') -WorkDir $proj.Dir
}
# proj5_vstest_allpass shares proj5_vstest's obj/ once restored into the same
# package folder structure isn't guaranteed -- restore it independently.
Measure-FxRun -Scenario 'proj5_vstest_allpass' -Case 'restore-baseline' -Phase 'restore' `
    -Exe $msbuild -CmdArgs @('-t:Restore', "$d5p\proj5_vstest_allpass.csproj") -WorkDir $d5p

# ---------------------------------------------------------------- MSBuild flag matrix
Write-Head 'MSBuild flag accept/reject matrix (build, Phase=build)'
$msbuildFlagSets = @(
    @{ Name='baseline';             Args=@() }
    @{ Name='nologo-dash';          Args=@('-nologo') }
    @{ Name='nologo-slash';         Args=@('/nologo') }
    @{ Name='tl-off-dash';          Args=@('-tl:off') }
    @{ Name='tl-off-slash';         Args=@('/tl:off') }
    @{ Name='verbosity-q-dash';     Args=@('-v:q') }
    @{ Name='verbosity-q-slash';    Args=@('/v:q') }
    @{ Name='verbosity-quiet-dash'; Args=@('-verbosity:quiet') }
    @{ Name='clp-dash';             Args=@('-nologo','-clp:ErrorsOnly;Summary;ShowProjectFile=false') }
    @{ Name='clp-slash';            Args=@('/nologo','/clp:ErrorsOnly;Summary;ShowProjectFile=false') }
    @{ Name='full-quiet-dash';      Args=@('-nologo','-tl:off','-v:q','-clp:ErrorsOnly;Summary;ShowProjectFile=false') }
    @{ Name='full-quiet-slash';     Args=@('/nologo','/tl:off','/v:q','/clp:ErrorsOnly;Summary;ShowProjectFile=false') }
)
# Args are passed to Start-Process -ArgumentList as array elements, one token
# each -- no shell re-parses this string, so the repo's Add-CommandFlag
# shell-quoting rule for `;` in -clp values (spec Section 8) does not apply
# here; this probe never emits a rewrite string for a shell to execute.

foreach ($proj in @(
    @{ Name='proj1_pkgconfig'; Dir=$d1 }
    @{ Name='proj2_pkgref';    Dir=$d2 }
    @{ Name='proj3_sdk';       Dir=$d3 }
    @{ Name='proj4_web';       Dir=$d4 }
    @{ Name='proj5_vstest';    Dir=$d5 }
    @{ Name='proj5_vstest_allpass'; Dir=$d5p }
)) {
    $csproj = "$($proj.Dir)\$($proj.Name).csproj"
    Write-Host "  $($proj.Name)" -ForegroundColor Cyan
    $anyOk = $false
    foreach ($fs in $msbuildFlagSets) {
        $r = Measure-FxRun -Scenario $proj.Name -Case "build-$($fs.Name)" -Phase 'build' `
            -Exe $msbuild -CmdArgs (@($csproj) + $fs.Args) -WorkDir $proj.Dir
        if ($r -and $r.ExitCode -eq 0) { $anyOk = $true }
    }
    if (-not $anyOk) { Write-Note "  $($proj.Name) -- every flag set failed to build; treated as a build-FAILED finding, not skipped silently" }
}

# ---------------------------------------------------------------- solution vs per-project
Write-Head 'Solution-level vs per-project (Phase=build)'
Measure-FxRun -Scenario 'solution' -Case 'sln-baseline' -Phase 'build' `
    -Exe $msbuild -CmdArgs @($slnPath) -WorkDir $Root
Measure-FxRun -Scenario 'solution' -Case 'sln-quiet' -Phase 'build' `
    -Exe $msbuild -CmdArgs @($slnPath, '-nologo', '-tl:off', '-v:q') -WorkDir $Root

# ---------------------------------------------------------------- vstest.console.exe
Write-Head 'vstest.console.exe (Phase=test)'
if ($vstest) {
    function Find-BuiltDll {
        param([string]$Dir, [string]$Name)
        Get-ChildItem -LiteralPath $Dir -Recurse -Filter "$Name.dll" -EA SilentlyContinue | Select-Object -First 1
    }

    $vstestTargets = @(
        @{ Name='proj1_pkgconfig'; Dir=$d1;  Asm='proj1_pkgconfig' }
        @{ Name='proj2_pkgref';    Dir=$d2;  Asm='proj2_pkgref' }
        @{ Name='proj3_sdk';       Dir=$d3;  Asm='proj3_sdk' }
        @{ Name='proj5_vstest';    Dir=$d5;  Asm='proj5_vstest' }
    )
    foreach ($t in $vstestTargets) {
        $dll = Find-BuiltDll -Dir $t.Dir -Name $t.Asm
        if (-not $dll) { Write-Note "  $($t.Name) -- no built DLL found, skipping vstest scenarios"; continue }
        Measure-FxRun -Scenario $t.Name -Case 'fail-default' -Phase 'test' `
            -Exe $vstest -CmdArgs @($dll.FullName) -WorkDir $dll.Directory.FullName
        Measure-FxRun -Scenario $t.Name -Case 'fail-default-quiet' -Phase 'test' `
            -Exe $vstest -CmdArgs @($dll.FullName, '/logger:console;verbosity=quiet') -WorkDir $dll.Directory.FullName
        Measure-FxRun -Scenario $t.Name -Case 'zero-match' -Phase 'test' `
            -Exe $vstest -CmdArgs @($dll.FullName, '/TestCaseFilter:FullyQualifiedName~ZZZNoSuchTest') -WorkDir $dll.Directory.FullName
    }

    $allPassDll = Find-BuiltDll -Dir $d5p -Name 'proj5_vstest_allpass'
    if ($allPassDll) {
        Measure-FxRun -Scenario 'proj5_vstest_allpass' -Case 'all-pass' -Phase 'test' `
            -Exe $vstest -CmdArgs @($allPassDll.FullName) -WorkDir $allPassDll.Directory.FullName
        Measure-FxRun -Scenario 'proj5_vstest_allpass' -Case 'all-pass-quiet' -Phase 'test' `
            -Exe $vstest -CmdArgs @($allPassDll.FullName, '/logger:console;verbosity=quiet') -WorkDir $allPassDll.Directory.FullName
    } else {
        Write-Note '  proj5_vstest_allpass -- no built DLL found, skipping all-pass scenario'
    }
} else {
    Write-Note 'vstest.console.exe unresolved -- skipping all test scenarios'
}

# ---------------------------------------------------------------- evidence
# Written BEFORE the console report below: a report-formatting bug must never
# cost the measurements it would have summarised.
$dir = Split-Path -Parent $OutJson
if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$script:Results | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutJson -Encoding utf8
Write-Host "`nwrote $OutJson ($($script:Results.Count) records)" -ForegroundColor Green

# ---------------------------------------------------------------- report
try {

Write-Head 'FULL MATRIX'
$script:Results | Where-Object { $_.Phase -ne 'resolve' } |
    Select-Object Phase,Scenario,Case,ExitCode,StdoutChars,StderrChars,TotalChars,Rejected,Ms |
    Format-Table -AutoSize | Out-String -Width 220 | Write-Host

Write-Head 'RESTORE VS BUILD VOLUME (mean TotalChars by Phase)'
$script:Results | Where-Object { $_.Phase -in @('restore','build') } | Group-Object Phase | ForEach-Object {
    $avg = ($_.Group | Measure-Object TotalChars -Average).Average
    Write-Note ("{0,-10} mean TotalChars {1:N0} across {2} records" -f $_.Name, $avg, $_.Count)
}

Write-Head 'MSBUILD FLAG ACCEPT/REJECT (build phase only)'
$script:Results | Where-Object { $_.Phase -eq 'build' -and $_.Case -like 'build-*' } | Group-Object Case | ForEach-Object {
    $rej = @($_.Group | Where-Object { $_.Rejected }).Count
    Write-Note ("{0,-24} rejected in {1}/{2} scenarios" -f $_.Name, $rej, $_.Group.Count)
}

Write-Head 'VSTEST EXIT CODES (pass/fail/zero-match)'
$script:Results | Where-Object { $_.Phase -eq 'test' } |
    Select-Object Scenario,Case,ExitCode,StdoutChars,StderrChars |
    Format-Table -AutoSize | Out-String -Width 220 | Write-Host

Write-Head 'SOLUTION VS PER-PROJECT'
# Phase must be checked before Scenario/Case: resolve-phase records carry
# neither property, and Set-StrictMode throws on a missing property rather
# than treating it as $null -- checking Phase first lets -and short-circuit
# past those records instead of touching the missing property at all.
$buildRecords = $script:Results | Where-Object { $_.Phase -eq 'build' }
$slnRec = $buildRecords | Where-Object { $_.Scenario -eq 'solution' -and $_.Case -eq 'sln-quiet' }
$perProjSum = (@($buildRecords | Where-Object { $_.Case -eq 'build-full-quiet-dash' -and $_.Scenario -in @('proj1_pkgconfig','proj2_pkgref','proj3_sdk','proj5_vstest') }) |
    Measure-Object TotalChars -Sum).Sum
if ($slnRec) {
    Write-Note ("sln-quiet TotalChars: {0}   sum of 4 per-project quiet builds: {1}" -f $slnRec.TotalChars, $perProjSum)
}

} catch {
    Write-Host "`nconsole report section hit an error (evidence was already saved above, unaffected): $_" -ForegroundColor Yellow
}

if (-not $KeepArtifacts) { Write-Host "Clean up: Remove-Item '$Root' -Recurse -Force" -ForegroundColor DarkGray }
