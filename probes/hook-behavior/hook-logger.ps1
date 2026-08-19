<#
.SYNOPSIS
    PreToolUse observer. Records the payload Claude Code actually delivers,
    then gets out of the way.

.DESCRIPTION
    Emits no permission decision, so the normal flow is untouched. The point is
    to learn what the hook SEES, not to change anything.

    WRITES ONE FILE PER INVOCATION. An earlier version appended every record to
    a single JSONL file; when several handlers matched the same command they ran
    concurrently, collided on the file lock, and records were lost silently.
    A unique filename per invocation removes the contention entirely.

    Failures are recorded under <dir>/errors/ rather than swallowed. A probe that
    hides its own faults produces conclusions you cannot trust.
#>

[CmdletBinding()]
param(
    [string] $Label = 'unlabelled'
)

$ErrorActionPreference = 'Continue'

$base = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { (Get-Location).Path }
$dir  = if ($env:DNZ_HOOK_DIR)       { $env:DNZ_HOOK_DIR }       else { Join-Path $base '.dnz-hookprobe' }

try {
    $raw = [Console]::In.ReadToEnd()

    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $record = [ordered]@{
        ts         = (Get-Date).ToString('o')
        handler    = $Label
        procId     = $PID
        cwd        = (Get-Location).Path
        rawLength  = $raw.Length
        payload    = $null
        parseError = $null
    }

    try   { $record.payload = $raw | ConvertFrom-Json }
    catch { $record.parseError = "$_"; $record.payload = $raw }

    # Unique per invocation: sortable timestamp + label + pid + guid fragment.
    $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss-fffffff')
    $file  = Join-Path $dir ("{0}_{1}_{2}_{3}.json" -f $stamp, $Label, $PID, [guid]::NewGuid().ToString('N').Substring(0,8))

    ($record | ConvertTo-Json -Depth 12 -Compress) |
        Set-Content -LiteralPath $file -Encoding utf8
}
catch {
    # An observer must never break the session -- but it must not hide faults either.
    try {
        $errDir = Join-Path $dir 'errors'
        if (-not (Test-Path -LiteralPath $errDir)) { New-Item -ItemType Directory -Path $errDir -Force | Out-Null }
        $errFile = Join-Path $errDir ("{0}_{1}_{2}.txt" -f (Get-Date).ToString('yyyyMMdd-HHmmss-fffffff'), $Label, $PID)
        "$_`n$($_.ScriptStackTrace)" | Set-Content -LiteralPath $errFile -Encoding utf8
    } catch { }
}

# No output == no decision == normal permission flow.
exit 0
