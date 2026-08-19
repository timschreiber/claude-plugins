<#
.SYNOPSIS
    PreToolUse hook entry point for Maven and Gradle build and test commands.

.NOTES
    SCAFFOLD. Probe Maven (-q, -B, --no-transfer-progress) and Gradle
    (-q, --console=plain) behavior and record findings in docs/ before
    enabling this plugin.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'vendor/Denoizinator.Core.psm1') -Force

$payload = [Console]::In.ReadToEnd()

Write-Output '{}'
exit 0
