<#
.SYNOPSIS
    Re-measure MTP exe output with clean stderr handling and --progress off.

.DESCRIPTION
    Probe-DotnetTest.ps1 measured 'exe-quiet' as LARGER than 'exe-direct'
    (1573 vs 1075 chars). That was a measurement artifact, not runner behaviour:
    --no-progress is deprecated and warns on stderr, and PowerShell's 2>&1 wraps
    native stderr in a NativeCommandError record carrying a source excerpt --
    roughly 500 chars of pure instrumentation noise per call.

    This probe captures stdout and stderr to SEPARATE files via Start-Process,
    so neither contaminates the other, and compares:

        (none) | --no-progress --no-ansi | --progress off --no-ansi | --progress off

    Answers: what are the real MTP quiet numbers, and is --progress off the
    correct replacement the deprecation warning claims?

.EXAMPLE
    ./Probe-MtpProgress.ps1 -ProbeRoot $env:TEMP\dnz-probe
#>

[CmdletBinding()]
param(
    [string] $ProbeRoot = (Join-Path $env:TEMP 'dnz-probe'),
    [string] $OutJson   = (Join-Path $PSScriptRoot 'evidence/mtp-progress-results.json')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ProbeRoot)) {
    throw "No probe root at $ProbeRoot. Run Probe-DotnetTest.ps1 -KeepArtifacts first; this probe reuses its built projects."
}

$flagSets = @(
    @{ Name = 'none';            Args = @() }
    @{ Name = 'no-progress';     Args = @('--no-progress','--no-ansi') }
    @{ Name = 'progress-off';    Args = @('--progress','off','--no-ansi') }
    @{ Name = 'progress-off-only'; Args = @('--progress','off') }
    @{ Name = 'minexpect1';      Args = @('--progress','off','--minimum-expected-tests','1') }
)

$results = [System.Collections.Generic.List[object]]::new()
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("dnz-mtp-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

try {
    Get-ChildItem $ProbeRoot -Directory | Where-Object { $_.Name -match '^(mtp|mtppass)_|^x_mtp_' } | ForEach-Object {
        $name = $_.Name
        $exe = Get-ChildItem $_.FullName -Recurse -Filter "$name.exe" -EA SilentlyContinue | Select-Object -First 1
        if (-not $exe) { Write-Warning "no exe for $name -- skipping"; return }

        Write-Host "`n=== $name" -ForegroundColor Cyan

        foreach ($fs in $flagSets) {
            $so = Join-Path $tmp "$name.$($fs.Name).out"
            $se = Join-Path $tmp "$name.$($fs.Name).err"
            $sw = [Diagnostics.Stopwatch]::StartNew()

            $p = if ($fs.Args.Count) {
                Start-Process -FilePath $exe.FullName -ArgumentList $fs.Args -WorkingDirectory $exe.Directory.FullName `
                    -RedirectStandardOutput $so -RedirectStandardError $se -NoNewWindow -PassThru -Wait
            } else {
                Start-Process -FilePath $exe.FullName -WorkingDirectory $exe.Directory.FullName `
                    -RedirectStandardOutput $so -RedirectStandardError $se -NoNewWindow -PassThru -Wait
            }
            $sw.Stop()

            $outTxt = if (Test-Path $so) { Get-Content $so -Raw } else { '' }
            $errTxt = if (Test-Path $se) { Get-Content $se -Raw } else { '' }
            if ($null -eq $outTxt) { $outTxt = '' }
            if ($null -eq $errTxt) { $errTxt = '' }

            $r = [PSCustomObject]@{
                Scenario   = $name
                FlagSet    = $fs.Name
                Args       = ($fs.Args -join ' ')
                ExitCode   = $p.ExitCode
                StdoutChars= $outTxt.Length
                StderrChars= $errTxt.Length
                TotalChars = $outTxt.Length + $errTxt.Length
                Deprecated = [bool]($errTxt -match 'deprecated' -or $outTxt -match 'deprecated')
                Rejected   = [bool]($errTxt -match 'unknown option' -or $outTxt -match 'unknown option')
                Ms         = [int]$sw.Elapsed.TotalMilliseconds
                Stdout     = $outTxt
                Stderr     = $errTxt
            }
            $results.Add($r)

            $flag = ''
            if ($r.Rejected)   { $flag = '  <-- OPTION REJECTED' }
            elseif ($r.Deprecated) { $flag = '  <-- DEPRECATION WARNING' }
            Write-Host ("    {0,-18} exit={1,-4} stdout={2,-7} stderr={3,-6}{4}" -f `
                $fs.Name, $r.ExitCode, $r.StdoutChars, $r.StderrChars, $flag)
        }
    }
}
finally {
    Remove-Item $tmp -Recurse -Force -EA SilentlyContinue
}

Write-Host "`n=== STDOUT ONLY, BY FLAG SET (the number that matters) ===" -ForegroundColor Cyan
$results | Group-Object FlagSet | ForEach-Object {
    $avg = ($_.Group | Measure-Object StdoutChars -Average).Average
    Write-Host ("    {0,-18} mean stdout {1:N0} chars across {2} scenarios" -f $_.Name, $avg, $_.Count)
}

Write-Host "`n=== VERDICT ON --progress off ===" -ForegroundColor Cyan
$dep = $results | Where-Object { $_.FlagSet -eq 'progress-off' -and $_.Deprecated }
$rej = $results | Where-Object { $_.FlagSet -eq 'progress-off' -and $_.Rejected }
if ($rej) { Write-Host "    REJECTED by $($rej.Count) scenario(s) -- not a universal replacement" -ForegroundColor Yellow }
elseif ($dep) { Write-Host "    still warns as deprecated -- investigate" -ForegroundColor Yellow }
else { Write-Host "    accepted cleanly by every MTP scenario measured" -ForegroundColor Green }

$dir = Split-Path -Parent $OutJson
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$results | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutJson -Encoding utf8
Write-Host "`nwrote $OutJson" -ForegroundColor Green
