<#
.SYNOPSIS
    PreToolUse hook entry point for .NET build and test commands.

.NOTES
    SCAFFOLD. Implement against the verified findings in
    docs/dotnet10-test-runner-findings.md before enabling this plugin.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'vendor/Denoizinator.Core.psm1') -Force

# Claude Code delivers hook input as JSON on stdin.
$payload = [Console]::In.ReadToEnd()

# TODO: parse $payload, rewrite the command via hookSpecificOutput.updatedInput,
# or run the command here and emit only diagnostics. Until then, pass through
# unchanged -- an empty object is a no-op.
Write-Output '{}'
exit 0
