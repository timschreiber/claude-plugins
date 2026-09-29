<#
.SYNOPSIS
    End to end: does denoizinator-net quiet a `dotnet build` issued through
    Claude Code's PowerShell tool? Writes probes/evidence/powershell-tool-e2e.json.

.DESCRIPTION
    1. Creates a throwaway directory under $env:TEMP, runs `dotnet new console
       -o app` there, and pre-builds once so restore noise is equal across runs.
    2. From that directory, starts two FRESH headless sessions (hooks are loaded
       at session start), the same way Run-PowerShellToolProbe.ps1 does:
         (A) baseline, no plugin
         (B) --plugin-dir <abs path to plugins/denoizinator-net>, DNZ_DEBUG=1
       Each: claude -p "<prompt>" --allowedTools PowerShell --output-format json
       stdout and stderr are captured separately.
    3. Reads each run's PowerShell tool_use input and its tool_result from the
       session transcript JSONL under ~/.claude/projects/ (not from Claude's
       relayed reply).
    4. Validity check: the tool_use command must be exactly 'dotnet build app'
       and the build must have run (no MSBuild command-line error, tool_result
       not an error). An invalid run is re-run, up to -MaxAttempts times.
    5. Collects dnz-debug.log lines written during run B, and writes the
       evidence file.

    The child sessions get this process's environment minus the variables that
    mark it as a child of a running Claude Code session.
#>

[CmdletBinding()]
param(
    [string] $OutJson        = (Join-Path $PSScriptRoot '../evidence/powershell-tool-e2e.json'),
    [int]    $TimeoutSeconds = 600,
    [int]    $MaxAttempts    = 3
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$expectedCommand = 'dotnet build app'
$prompt = 'Use the PowerShell tool (not Bash) to run exactly this command: `dotnet build app` Then reply with the complete tool output verbatim, nothing else.'
$pluginDir = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../plugins/denoizinator-net')).Path

# --- throwaway project ---------------------------------------------------
$work = Join-Path $env:TEMP ("dnz-pstool-e2e-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $work -Force | Out-Null
Push-Location -LiteralPath $work
try {
    & dotnet new console -o app 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "dotnet new console failed in $work" }
    & dotnet build app 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "pre-build failed in $work" }
} finally { Pop-Location }

$claudeExe = (Get-Command claude -CommandType Application | Select-Object -First 1).Source
$projectsRoot = Join-Path $HOME '.claude/projects'

function Invoke-Session {
    param([string[]] $ExtraArgs, [hashtable] $ExtraEnv)

    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = $claudeExe
    foreach ($a in @('-p', $prompt, '--allowedTools', 'PowerShell', '--output-format', 'json') + $ExtraArgs) {
        $psi.ArgumentList.Add($a)
    }
    $psi.WorkingDirectory       = $work
    $psi.UseShellExecute        = $false
    $psi.RedirectStandardInput  = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    foreach ($name in @('CLAUDECODE','CLAUDE_CODE_CHILD_SESSION','CLAUDE_CODE_SESSION_ID','CLAUDE_CODE_MESSAGING_SOCKET',
                        'CLAUDE_CODE_MESSAGING_TOKEN','CLAUDE_CODE_SESSION_ATTENDED','CLAUDE_CODE_ENTRYPOINT',
                        'CLAUDE_PID','CLAUDE_JOB_DIR','CLAUDE_PROJECT_DIR','DNZ_DEBUG')) {
        [void]$psi.Environment.Remove($name)
    }
    foreach ($k in $ExtraEnv.Keys) { $psi.Environment[$k] = [string]$ExtraEnv[$k] }

    $proc = [System.Diagnostics.Process]::Start($psi)
    $proc.StandardInput.Close()
    $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
    $stderrTask = $proc.StandardError.ReadToEndAsync()
    if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
        try { $proc.Kill($true) } catch { }
        throw "claude -p did not finish within $TimeoutSeconds s"
    }
    $stdout = $stdoutTask.GetAwaiter().GetResult()
    $stderr = $stderrTask.GetAwaiter().GetResult()

    $sessionId = $null
    try { $sessionId = ($stdout | ConvertFrom-Json).session_id } catch { }

    $command = $null; $output = $null; $isError = $null; $powershellCalls = 0
    if ($sessionId) {
        $transcript = Get-ChildItem -LiteralPath $projectsRoot -Recurse -File -Filter "$sessionId.jsonl" -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($transcript) {
            $uses = @{}; $useOrder = [System.Collections.Generic.List[string]]::new(); $results = @{}
            foreach ($line in Get-Content -LiteralPath $transcript.FullName) {
                if (-not $line.Trim()) { continue }
                $rec = $null
                try { $rec = $line | ConvertFrom-Json } catch { continue }
                if (-not ($rec.PSObject.Properties.Name -contains 'message')) { continue }
                $msg = $rec.message
                if ($null -eq $msg -or -not ($msg.PSObject.Properties.Name -contains 'content')) { continue }
                if ($msg.content -is [string]) { continue }
                foreach ($c in @($msg.content)) {
                    if ($c.type -eq 'tool_use' -and $c.name -eq 'PowerShell') {
                        $uses[$c.id] = [string]$c.input.command
                        $useOrder.Add($c.id)
                    } elseif ($c.type -eq 'tool_result') {
                        $text = if ($c.content -is [string]) { $c.content }
                                else { (@($c.content) | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text }) -join "`n" }
                        $err = ($c.PSObject.Properties.Name -contains 'is_error') -and [bool]$c.is_error
                        $results[$c.tool_use_id] = @{ text = $text; isError = $err }
                    }
                }
            }
            if ($useOrder.Count -gt 0) {
                $id = $useOrder[0]
                $command = $uses[$id]
                if ($results.ContainsKey($id)) { $output = $results[$id].text; $isError = $results[$id].isError }
            }
            $powershellCalls = $useOrder.Count
        }
    }

    [pscustomobject]@{
        sessionId       = $sessionId
        exitCode        = $proc.ExitCode
        stdout          = $stdout
        stderr          = $stderr
        command         = $command
        output          = $output
        isError         = $isError
        powershellCalls = $powershellCalls
    }
}

function Get-LineCount([string] $Text) {
    if ([string]::IsNullOrEmpty($Text)) { return 0 }
    return @($Text.TrimEnd("`r", "`n") -split "`r?`n").Count
}

function Test-RunValid($Run) {
    if ($Run.command -ne $expectedCommand) { return "command was '$($Run.command)'" }
    if ($null -eq $Run.output) { return 'no tool_result in transcript' }
    if ($Run.isError) { return 'tool_result is_error' }
    if ($Run.output -match 'MSBUILD : error|error MSB1\d{3}') { return 'MSBuild command-line error' }
    return $null
}

function Invoke-ValidRun {
    param([string] $Label, [string[]] $ExtraArgs, [hashtable] $ExtraEnv, [scriptblock] $Before, [scriptblock] $After)
    $attempts = @()
    for ($i = 1; $i -le $MaxAttempts; $i++) {
        if ($Before) { & $Before }
        $run = Invoke-Session -ExtraArgs $ExtraArgs -ExtraEnv $ExtraEnv
        if ($After) { & $After $run }
        $why = Test-RunValid $run
        $attempts += [ordered]@{ attempt = $i; sessionId = $run.sessionId; command = $run.command; invalidReason = $why }
        Write-Host "[$Label] attempt $i : command='$($run.command)' valid=$(-not $why) $why"
        if (-not $why) { return @{ run = $run; attempts = $attempts } }
    }
    throw "[$Label] no valid run in $MaxAttempts attempts"
}

# --- (A) baseline ----------------------------------------------------------
$a = Invoke-ValidRun -Label 'baseline' -ExtraArgs @() -ExtraEnv @{}

# --- (B) plugin ----------------------------------------------------------
$debugLogPath = Join-Path ([IO.Path]::GetTempPath()) 'dnz-debug.log'
$script:debugLines = @()
$before = {
    $script:debugStart = if (Test-Path -LiteralPath $debugLogPath) { @(Get-Content -LiteralPath $debugLogPath).Count } else { 0 }
}
$after = {
    param($run)
    $all = if (Test-Path -LiteralPath $debugLogPath) { @(Get-Content -LiteralPath $debugLogPath) } else { @() }
    $script:debugLines = @($all | Select-Object -Skip $script:debugStart)
}
$b = Invoke-ValidRun -Label 'plugin' -ExtraArgs @('--plugin-dir', $pluginDir) -ExtraEnv @{ DNZ_DEBUG = '1' } -Before $before -After $after

$baseline = $a.run; $plugin = $b.run
$baseLines   = Get-LineCount $baseline.output
$pluginLines = Get-LineCount $plugin.output
$baseArrow   = @(($baseline.output -split "`r?`n") | Where-Object { $_ -match 'app ->' })
$pluginArrow = @(($plugin.output   -split "`r?`n") | Where-Object { $_ -match 'app ->' })
$quieted = ($pluginLines -lt $baseLines) -and ($baseArrow.Count -gt 0) -and ($pluginArrow.Count -eq 0)

$difference = "The baseline tool output was $baseLines lines including the '$(($baseArrow | Select-Object -First 1).Trim())' line; with the plugin it was $pluginLines lines" +
    $(if ($pluginArrow.Count -eq 0) { " and had no 'app ->' line." } else { " and still had an 'app ->' line." })

$evidence = [ordered]@{
    measured          = (Get-Date).ToString('o')
    claudeVersion     = ((& claude --version) | Out-String).Trim()
    dotnetVersion     = ((& dotnet --version) | Out-String).Trim()
    workDir           = $work
    pluginDir         = $pluginDir
    prompt            = $prompt
    baseline          = [ordered]@{
        command   = $baseline.command
        output    = $baseline.output
        lineCount = $baseLines
        sessionId = $baseline.sessionId
        attempts  = $a.attempts
        stderr    = $baseline.stderr
    }
    plugin            = [ordered]@{
        command   = $plugin.command
        output    = $plugin.output
        lineCount = $pluginLines
        sessionId = $plugin.sessionId
        attempts  = $b.attempts
        stderr    = $plugin.stderr
    }
    debugLogLineCount = $script:debugLines.Count
    debugLog          = $script:debugLines
    difference        = $difference
    quieted           = $quieted
}

$outDir = Split-Path -Parent $OutJson
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$evidence | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $OutJson -Encoding utf8

Write-Host "baseline lines: $baseLines; plugin lines: $pluginLines; debug lines: $($script:debugLines.Count); quieted: $quieted"
Write-Host "wrote $((Resolve-Path -LiteralPath $OutJson).Path)"
