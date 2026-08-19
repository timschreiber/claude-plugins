<#
.SYNOPSIS
    PreToolUse handler that ACTUALLY REWRITES the command via updatedInput,
    and leaves machine-checkable evidence of whether the rewrite executed.

.DESCRIPTION
    Everything measured so far proves the hook FIRES on the right commands.
    Nothing proves Claude Code accepts a rewritten command and runs it. That
    is the assumption the entire plugin design rests on.

    Evidence design: the rewrite PREPENDS a marker write to the original command.

        echo executed > .dnz-updatedinput/EXEC_<token>.txt && <original>

    The marker goes first deliberately, so it lands even if the original command
    fails. If EXEC_<token>.txt exists afterwards, the rewritten string was the
    one that ran -- no interpretation, no asking Claude what it saw.

    Each invocation also records what it RECEIVED as tool_input.command. When two
    handlers target the same command, comparing what the second received against
    what the first emitted answers whether rewrites chain or overwrite.

.PARAMETER Mode
    plain  -- return updatedInput with NO permissionDecision
    allow  -- return updatedInput together with permissionDecision "allow"

    Worth knowing which is required: "allow" suppresses the permission prompt,
    which is a real side effect to accept knowingly rather than inherit.

.PARAMETER Label
    Handler identity, recorded and used in the marker filename.
#>

[CmdletBinding()]
param(
    [ValidateSet('plain','allow')]
    [string] $Mode  = 'plain',
    [string] $Label = 'unlabelled'
)

$ErrorActionPreference = 'Continue'

$base = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { (Get-Location).Path }
$dir  = Join-Path $base '.dnz-updatedinput'

try {
    $raw     = [Console]::In.ReadToEnd()
    $payload = $raw | ConvertFrom-Json
    $original = $payload.tool_input.command

    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $token   = "{0}_{1}" -f $Label, ([guid]::NewGuid().ToString('N').Substring(0,8))
    $marker  = ".dnz-updatedinput/EXEC_$token.txt"
    $rewritten = "echo executed > $marker && $original"

    $out = @{
        hookSpecificOutput = @{
            hookEventName = 'PreToolUse'
            updatedInput  = @{ command = $rewritten }
        }
    }
    if ($Mode -eq 'allow') {
        $out.hookSpecificOutput.permissionDecision       = 'allow'
        $out.hookSpecificOutput.permissionDecisionReason = 'updatedInput probe'
    }

    $json = $out | ConvertTo-Json -Depth 8 -Compress

    # Record BEFORE emitting, so a crash after this point is still visible.
    $record = [ordered]@{
        ts            = (Get-Date).ToString('o')
        handler       = $Label
        mode          = $Mode
        token         = $token
        markerPath    = $marker
        received      = $original
        emitted       = $rewritten
        emittedJson   = $json
        toolUseId     = $payload.tool_use_id
        sessionId     = $payload.session_id
        procId        = $PID
    }
    $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss-fffffff')
    ($record | ConvertTo-Json -Depth 8 -Compress) |
        Set-Content -LiteralPath (Join-Path $dir "REC_${stamp}_$token.json") -Encoding utf8

    Write-Output $json
}
catch {
    try {
        $errDir = Join-Path $dir 'errors'
        if (-not (Test-Path -LiteralPath $errDir)) { New-Item -ItemType Directory -Path $errDir -Force | Out-Null }
        "$_`n$($_.ScriptStackTrace)" |
            Set-Content -LiteralPath (Join-Path $errDir ("{0}_{1}.txt" -f (Get-Date).ToString('yyyyMMdd-HHmmss-fffffff'), $Label)) -Encoding utf8
    } catch { }
    # Emit nothing on failure: no decision, no rewrite, normal flow.
}

exit 0
