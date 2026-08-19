<#
.SYNOPSIS
    Determine exactly who reads Directory.Build.rsp, and whether it can be
    scoped safely enough to commit.

.DESCRIPTION
    Microsoft documents that the Visual Studio IDE does NOT apply .rsp files,
    and that -noAutoResponse disables them for a single invocation. This probe
    verifies both locally and answers the questions the docs do not:

      1. Which CLI entry points pick it up: dotnet build / dotnet msbuild /
         dotnet run / dotnet test / msbuild.exe
      2. Does it apply when the build is launched from a SUBDIRECTORY?
      3. Do relative file-logger paths resolve against the CWD or the .rsp
         location? (If CWD, .dnz folders scatter through the tree.)
      4. Does %MSBuildThisFileDirectory% fix that?
      5. Does -noAutoResponse fully suppress it? (The CI escape hatch.)

    What this probe CANNOT answer: whether your Azure Pipelines agents behave
    the same. It builds the exact command lines the VSBuild@1, MSBuild@1, and
    DotNetCoreCLI@2 tasks issue, so local agreement is strong evidence -- but
    confirm on a real agent before trusting CI.

.EXAMPLE
    ./Probe-RspScope.ps1
#>

[CmdletBinding()]
param(
    [string] $Root    = (Join-Path $env:TEMP 'dnz-rsp-probe'),
    [string] $OutJson = (Join-Path $PSScriptRoot 'evidence/rsp-scope-results.json'),
    [switch] $KeepArtifacts
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'

$results = [System.Collections.Generic.List[object]]::new()

function Invoke-Measured {
    param([string]$Case,[string]$Exe,[string[]]$CmdArgs,[string]$WorkDir,[string]$Note)
    $out = ''; $exit = -999
    $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try {
        Push-Location $WorkDir
        $out = (& $Exe @CmdArgs 2>&1 | Out-String)
        $exit = $LASTEXITCODE
    } catch { $out = "PROBE-EXCEPTION: $_" }
    finally { Pop-Location; $ErrorActionPreference = $prev }

    $r = [PSCustomObject]@{
        Case = $Case; Command = "$(Split-Path $Exe -Leaf) $($CmdArgs -join ' ')"
        WorkDir = $WorkDir; Chars = $out.Length; ExitCode = $exit
        RspApplied = $null; Note = $Note; Output = $out
    }
    $results.Add($r)
    return $r
}

# ---------------------------------------------------------------- scaffold
if (Test-Path $Root) { Remove-Item $Root -Recurse -Force }
New-Item -ItemType Directory -Path "$Root/src/App" -Force | Out-Null

@'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
'@ | Set-Content "$Root/src/App/App.csproj" -Encoding utf8

'System.Console.WriteLine("hello");' | Set-Content "$Root/src/App/Program.cs" -Encoding utf8

# A deliberate warning gives us a signal that -clp:ErrorsOnly is actually suppressing something.
@'
class Unused { private int _neverUsed; }
'@ | Set-Content "$Root/src/App/Unused.cs" -Encoding utf8

# ---------------------------------------------------------------- baseline (no rsp)
Write-Host "`n=== BASELINE (no Directory.Build.rsp)" -ForegroundColor Cyan
$base = Invoke-Measured 'baseline-root' 'dotnet' @('build','src/App/App.csproj') $Root 'no rsp present'
Write-Host ("    chars={0} exit={1}" -f $base.Chars, $base.ExitCode)
$baselineChars = $base.Chars

# ---------------------------------------------------------------- with rsp (CWD-relative logs)
$rsp = @(
  '# probe response file'
  '-nologo'
  '-tl:off'
  '-clp:ErrorsOnly;Summary;ShowProjectFile=false'
  '-flp1:LogFile=.dnz\build.err;ErrorsOnly;Verbosity=quiet'
  '-flp3:LogFile=.dnz\build.log;Verbosity=normal'
) -join "`r`n"
Set-Content "$Root/Directory.Build.rsp" -Value $rsp -Encoding ascii -NoNewline

Write-Host "`n=== WITH Directory.Build.rsp (relative log paths)" -ForegroundColor Cyan
$cases = @(
    @{ Case='dotnet-build-root';   Exe='dotnet'; Args=@('build','src/App/App.csproj');   Dir=$Root;             Note='CLI, repo root' }
    @{ Case='dotnet-build-subdir'; Exe='dotnet'; Args=@('build','App.csproj');            Dir="$Root/src/App";   Note='CLI, subdirectory' }
    @{ Case='dotnet-msbuild';      Exe='dotnet'; Args=@('msbuild','src/App/App.csproj');  Dir=$Root;             Note='dotnet msbuild' }
    @{ Case='dotnet-run';          Exe='dotnet'; Args=@('run','--project','src/App/App.csproj'); Dir=$Root;      Note='dotnet run (builds first)' }
    @{ Case='dotnet-test';         Exe='dotnet'; Args=@('test','src/App/App.csproj');     Dir=$Root;             Note='dotnet test on a non-test project' }
    @{ Case='noAutoResponse';      Exe='dotnet'; Args=@('build','src/App/App.csproj','-noAutoResponse'); Dir=$Root; Note='THE CI ESCAPE HATCH' }
)
foreach ($c in $cases) {
    $r = Invoke-Measured $c.Case $c.Exe $c.Args $c.Dir $c.Note
    $r.RspApplied = ($r.Chars -lt ($baselineChars * 0.75))
    Write-Host ("    {0,-22} chars={1,-7} exit={2,-5} rspApplied={3}  {4}" -f `
        $c.Case, $r.Chars, $r.ExitCode, $r.RspApplied, $c.Note)
}

# msbuild.exe, if present -- this is what VSBuild@1 / MSBuild@1 invoke
$msbuild = Get-Command msbuild.exe -EA SilentlyContinue
if ($msbuild) {
    $r = Invoke-Measured 'msbuild-exe' $msbuild.Source @("$Root\src\App\App.csproj") $Root 'msbuild.exe -- the VSBuild@1 path'
    $r.RspApplied = ($r.Chars -lt ($baselineChars * 0.75))
    Write-Host ("    {0,-22} chars={1,-7} exit={2,-5} rspApplied={3}" -f 'msbuild-exe', $r.Chars, $r.ExitCode, $r.RspApplied)
} else {
    Write-Warning "    msbuild.exe not on PATH -- run from a Developer PowerShell to cover the VSBuild@1 path"
}

# ---------------------------------------------------------------- where did the logs land?
Write-Host "`n=== WHERE DID .dnz LAND? (relative paths resolve against...?)" -ForegroundColor Cyan
$dnzDirs = Get-ChildItem $Root -Recurse -Directory -Filter '.dnz' -EA SilentlyContinue
if ($dnzDirs) {
    foreach ($d in $dnzDirs) { Write-Host ("    {0}" -f $d.FullName.Replace($Root,'<root>')) -ForegroundColor Yellow }
    if ($dnzDirs.Count -gt 1) { Write-Host "    >1 location == relative paths follow the CWD, not the .rsp" -ForegroundColor Yellow }
} else { Write-Host "    none created" }

# ---------------------------------------------------------------- %MSBuildThisFileDirectory%
Write-Host "`n=== WITH %MSBuildThisFileDirectory% IN LOG PATHS" -ForegroundColor Cyan
Get-ChildItem $Root -Recurse -Directory -Filter '.dnz' -EA SilentlyContinue | Remove-Item -Recurse -Force -EA SilentlyContinue
$rsp2 = @(
  '-nologo'
  '-tl:off'
  '-clp:ErrorsOnly;Summary;ShowProjectFile=false'
  '-flp1:LogFile=%MSBuildThisFileDirectory%.dnz\build.err;ErrorsOnly;Verbosity=quiet'
  '-flp3:LogFile=%MSBuildThisFileDirectory%.dnz\build.log;Verbosity=normal'
) -join "`r`n"
Set-Content "$Root/Directory.Build.rsp" -Value $rsp2 -Encoding ascii -NoNewline

$r = Invoke-Measured 'thisfiledir-subdir' 'dotnet' @('build','App.csproj') "$Root/src/App" 'built from subdir; logs should still land at root'
Write-Host ("    chars={0} exit={1}" -f $r.Chars, $r.ExitCode)
$dnzDirs2 = Get-ChildItem $Root -Recurse -Directory -Filter '.dnz' -EA SilentlyContinue
foreach ($d in $dnzDirs2) { Write-Host ("    {0}" -f $d.FullName.Replace($Root,'<root>')) -ForegroundColor Green }
$anchored = ($dnzDirs2.Count -eq 1 -and $dnzDirs2[0].FullName -eq (Join-Path $Root '.dnz'))
Write-Host ("    anchored to .rsp location: {0}" -f $anchored) -ForegroundColor $(if($anchored){'Green'}else{'Yellow'})

# ---------------------------------------------------------------- report
Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
$results | Select-Object Case,Chars,ExitCode,RspApplied,Note | Format-Table -AutoSize | Out-String -Width 200 | Write-Host

Write-Host "REMINDER: Visual Studio is documented NOT to apply .rsp files." -ForegroundColor DarkGray
Write-Host "  Confirm by hand: open the solution, Build, and check no .dnz appears." -ForegroundColor DarkGray
Write-Host "  Then confirm on a real Azure agent before trusting any CI conclusion." -ForegroundColor DarkGray

$dir = Split-Path -Parent $OutJson
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$results | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutJson -Encoding utf8
Write-Host "`nwrote $OutJson" -ForegroundColor Green

if (-not $KeepArtifacts) { Write-Host "Clean up: Remove-Item '$Root' -Recurse -Force" -ForegroundColor DarkGray }
