<#
.SYNOPSIS
    PreToolUse hook entry point for .NET build and test commands.

.DESCRIPTION
    Reads the Bash tool-call payload from stdin, fast-rejects on the raw text
    before importing any module or parsing JSON, and rewrites matching
    dotnet/msbuild commands via the vendored CommandSegmentation module.
    Emits hookSpecificOutput.updatedInput only when the command actually
    changed; emits nothing otherwise. Never throws and never sets
    permissionDecision -- see docs/denoizinator-net-spec.md C2/C3.
#>

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Write-DnzDebugLog {
    param([string] $Message)
    if (-not $env:DNZ_DEBUG) { return }
    try {
        $line = '[{0}] [{1}] {2}' -f (Get-Date).ToString('o'), $PID, $Message
        Add-Content -LiteralPath (Join-Path ([IO.Path]::GetTempPath()) 'dnz-debug.log') `
                    -Value $line -Encoding utf8 -ErrorAction Stop
    } catch { }   # logging must never itself throw
}

try {
    $payload = [Console]::In.ReadToEnd()

    # Fast reject on the RAW text, before any JSON parse or module import --
    # this runs on every Bash call, so the common non-matching case must be cheap.
    $isBuildish = $payload.IndexOf('dotnet',  [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
                  $payload.IndexOf('msbuild', [StringComparison]::OrdinalIgnoreCase) -ge 0

    if ($isBuildish) {
        Import-Module (Join-Path $PSScriptRoot 'vendor/CommandSegmentation.psm1') -Force

        $data    = $payload | ConvertFrom-Json
        $command = $data.tool_input.command

        if ($command -is [string] -and $command.Length -gt 0) {
            # -clp's value is quoted (not the whole flag string) because it contains
            # literal ';' -- unquoted, Bash would read it as three separate commands.
            $flagMap = @{
                'dotnet build'   = '-nologo -tl:off -clp:"ErrorsOnly;Summary;ShowProjectFile=false"'
                'dotnet msbuild' = '-nologo -tl:off -clp:"ErrorsOnly;Summary;ShowProjectFile=false"'
                'dotnet run'     = '-nologo -tl:off -clp:"ErrorsOnly;Summary;ShowProjectFile=false"'
                'msbuild'        = '-nologo -tl:off -clp:"ErrorsOnly;Summary;ShowProjectFile=false"'
                'dotnet test'    = '--nologo -v:q'
            }

            $rewritten = Add-CommandFlag -Command $command -FlagMap $flagMap

            if (-not [string]::Equals($rewritten, $command, [StringComparison]::Ordinal)) {
                $out = @{
                    hookSpecificOutput = @{
                        hookEventName = 'PreToolUse'
                        updatedInput  = @{ command = $rewritten }
                    }
                }
                Write-Output ($out | ConvertTo-Json -Depth 8 -Compress)
            }
        }
    }
}
catch {
    Write-DnzDebugLog -Message ("{0}`n{1}" -f $_.Exception.Message, $_.ScriptStackTrace)
}

exit 0
