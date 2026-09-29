<#
.SYNOPSIS
    PreToolUse handler for the PowerShell-tool probe: records the payload shape
    and rewrites the command via updatedInput, leaving a marker file as evidence
    of whether the rewrite executed.

.DESCRIPTION
    Modeled on probes/updated-input/Invoke-RewriteProbe.ps1. Claude Code's
    PowerShell tool (tool name 'PowerShell') is distinct from its Bash tool, so
    a hook matched on 'Bash' alone may never see it. This handler answers:

      (a) does a PreToolUse hook with matcher 'PowerShell' fire?
      (b) what is the payload shape (tool_name, tool_input keys)?
      (c) is hookSpecificOutput.updatedInput = { command = <rewritten> }, with
          NO permissionDecision, honored for the PowerShell tool?

    The rewrite is PowerShell syntax and PREPENDS a marker write:

        Set-Content -LiteralPath '.dnz-pstool/EXEC_<token>.txt' -Value executed; <original>

    If EXEC_<token>.txt exists afterwards, the rewritten string is what ran.

    Each invocation appends one JSON line to <project>/.dnz-pstool/records.jsonl:
    { ts, tool_name, tool_input_keys, received, emitted, token, markerPath }.

    Never throws; always exits 0. On any failure it emits nothing.

.PARAMETER Label
    Handler identity ('pstool' or 'bash'), used as the token prefix.
#>

[CmdletBinding()]
param(
    [string] $Label = 'unlabelled'
)

$ErrorActionPreference = 'Continue'

$base = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { (Get-Location).Path }
$dir  = Join-Path $base '.dnz-pstool'

try {
    $raw      = [Console]::In.ReadToEnd()
    $payload  = $raw | ConvertFrom-Json
    $original = [string]$payload.tool_input.command

    if (-not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    $token     = "{0}_{1}" -f $Label, ([guid]::NewGuid().ToString('N').Substring(0,8))
    $marker    = ".dnz-pstool/EXEC_$token.txt"
    $rewritten = "Set-Content -LiteralPath '$marker' -Value executed; $original"

    $out = @{
        hookSpecificOutput = @{
            hookEventName = 'PreToolUse'
            updatedInput  = @{ command = $rewritten }
        }
    }
    $json = $out | ConvertTo-Json -Depth 8 -Compress

    $keys = @()
    if ($payload.tool_input) { $keys = @($payload.tool_input.PSObject.Properties.Name) }

    # Record BEFORE emitting, so a crash after this point is still visible.
    $record = [ordered]@{
        ts              = (Get-Date).ToString('o')
        tool_name       = $payload.tool_name
        tool_input_keys = $keys
        received        = $original
        emitted         = $rewritten
        token           = $token
        markerPath      = $marker
    }
    Add-Content -LiteralPath (Join-Path $dir 'records.jsonl') `
        -Value ($record | ConvertTo-Json -Depth 8 -Compress) -Encoding utf8

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
