<#
.SYNOPSIS
    Runs the PowerShell-tool hook probe end to end and writes
    probes/evidence/powershell-tool-rewrite.json.

.DESCRIPTION
    1. Creates a throwaway directory under $env:TEMP and git-inits it.
    2. Writes settings.probe.json's hooks into its .claude/settings.json, with
       the absolute path to Invoke-PowerShellToolProbe.ps1.
    3. From that directory, starts a FRESH headless session (hooks are loaded
       at session start; see hook-behavior-findings.md section 13's caution):
         claude -p "<prompt>" --allowedTools PowerShell
       stdout and stderr are captured separately.
    4. Collects .dnz-pstool/records.jsonl and the EXEC_* marker files.
    5. Writes the evidence file.

    The child session gets this process's environment minus the variables that
    mark it as a child of a running Claude Code session, plus -ExtraEnv.

.PARAMETER ExtraEnv
    Extra environment variables for the child session only (for example, one
    that enables the PowerShell tool). See commands.md.
#>

[CmdletBinding()]
param(
    [hashtable] $ExtraEnv = @{},
    [string]    $OutJson  = (Join-Path $PSScriptRoot '../evidence/powershell-tool-rewrite.json'),
    [int]       $TimeoutSeconds = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$handler = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'Invoke-PowerShellToolProbe.ps1')).Path
$work    = Join-Path $env:TEMP ("dnz-pstool-probe-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $work -Force | Out-Null
& git -C $work init --quiet
if ($LASTEXITCODE -ne 0) { throw "git init failed in $work" }

# --- hooks into the throwaway repo --------------------------------------
$template = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'settings.probe.json') -Raw | ConvertFrom-Json
$handlerJsonPath = $handler -replace '\\', '/'
foreach ($group in $template.hooks.PreToolUse) {
    foreach ($h in $group.hooks) { $h.command = $h.command.Replace('<HANDLER>', $handlerJsonPath) }
}
$settings = [ordered]@{ hooks = $template.hooks }
$claudeDir = Join-Path $work '.claude'
New-Item -ItemType Directory -Path $claudeDir -Force | Out-Null
$settings | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $claudeDir 'settings.json') -Encoding utf8

# --- fresh headless session ---------------------------------------------
$prompt = 'Use the PowerShell tool (not Bash) to run exactly: dotnet --version . Then tell me its output verbatim.'

$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = (Get-Command claude -CommandType Application | Select-Object -First 1).Source
foreach ($a in @('-p', $prompt, '--allowedTools', 'PowerShell')) { $psi.ArgumentList.Add($a) }
$psi.WorkingDirectory       = $work
$psi.UseShellExecute        = $false
$psi.RedirectStandardInput  = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError  = $true
foreach ($name in @('CLAUDECODE','CLAUDE_CODE_CHILD_SESSION','CLAUDE_CODE_SESSION_ID','CLAUDE_CODE_MESSAGING_SOCKET',
                    'CLAUDE_CODE_MESSAGING_TOKEN','CLAUDE_CODE_SESSION_ATTENDED','CLAUDE_CODE_ENTRYPOINT',
                    'CLAUDE_PID','CLAUDE_JOB_DIR','CLAUDE_PROJECT_DIR')) {
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
$exit   = $proc.ExitCode

# --- collect ------------------------------------------------------------
$probeDir = Join-Path $work '.dnz-pstool'
$records = @()
$recFile = Join-Path $probeDir 'records.jsonl'
if (Test-Path -LiteralPath $recFile) {
    $records = @(Get-Content -LiteralPath $recFile | Where-Object { $_.Trim() } | ForEach-Object { $_ | ConvertFrom-Json })
}
$markers = @()
if (Test-Path -LiteralPath $probeDir) {
    $markers = @(Get-ChildItem -LiteralPath $probeDir -Filter 'EXEC_*' -File | ForEach-Object Name)
}
$handlerErrors = @()
$errDir = Join-Path $probeDir 'errors'
if (Test-Path -LiteralPath $errDir) {
    $handlerErrors = @(Get-ChildItem -LiteralPath $errDir -File | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw })
}

$pstool = @($records | Where-Object { $_.tool_name -eq 'PowerShell' })
$honored = $false
foreach ($r in $pstool) {
    if ($markers -contains "EXEC_$($r.token).txt") { $honored = $true }
}

$evidence = [ordered]@{
    measured             = (Get-Date).ToString('o')
    claudeVersion        = ((& claude --version) | Out-String).Trim()
    pwshVersion          = $PSVersionTable.PSVersion.ToString()
    workDir              = $work
    extraEnv             = $ExtraEnv
    prompt               = $prompt
    claudeExitCode       = $exit
    records              = $records
    markersFound         = $markers
    handlerErrors        = $handlerErrors
    claudeOutput         = $stdout
    claudeStderr         = $stderr
    updatedInputHonored  = $honored
}

$outDir = Split-Path -Parent $OutJson
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$evidence | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $OutJson -Encoding utf8

Write-Host "records: $($records.Count) (PowerShell: $($pstool.Count)); markers: $($markers.Count); updatedInputHonored: $honored"
Write-Host "wrote $((Resolve-Path -LiteralPath $OutJson).Path)"
