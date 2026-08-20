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
                  $payload.IndexOf('msbuild', [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
                  $payload.IndexOf('vstest',  [StringComparison]::OrdinalIgnoreCase) -ge 0

    if ($isBuildish) {
        Import-Module (Join-Path $PSScriptRoot 'vendor/CommandSegmentation.psm1') -Force

        $data    = $payload | ConvertFrom-Json
        $command = $data.tool_input.command

        if ($data.tool_name -eq 'Bash' -and $command -is [string] -and $command.Length -gt 0) {
            # -clp's value is quoted (not the whole flag string) because it contains
            # literal ';' -- unquoted, Bash would read it as three separate commands.
            #
            # Bare 'msbuild'/'msbuild.exe' (Framework MSBuild.exe, not the dotnet
            # CLI) are routed since Phase 7 (framework-build-findings.md §2: every
            # candidate quiet flag accepted, zero rejections). An ASP.NET 4.x Web
            # Application Project fails to build regardless of these flags with
            # MSB4019 (missing Microsoft.WebApplication.targets) -- an unrelated
            # VS-workload gap, not a limitation of this rewrite
            # (framework-build-findings.md §3).
            #
            # 'dotnet test' is NOT in this map -- a single quiet-flag string is
            # wrong across runners (docs/dotnet-test-runner-findings.md §12), so
            # it's dispatched to a wrapper that picks safe flags at runtime
            # instead (Phase 4, spec §6). 'vstest.console'/'vstest.console.exe'
            # (Framework's direct test runner) is dispatched the same way, since
            # Phase 7 (framework-build-findings.md §5).
            $flagMap = @{
                'dotnet build'   = '-nologo -tl:off -clp:"ErrorsOnly;Summary;ShowProjectFile=false"'
                'dotnet msbuild' = '-nologo -tl:off -clp:"ErrorsOnly;Summary;ShowProjectFile=false"'
                'dotnet run'     = '-nologo -tl:off -clp:"ErrorsOnly;Summary;ShowProjectFile=false"'
                'msbuild'        = '-nologo -tl:off -v:q -clp:"ErrorsOnly;Summary;ShowProjectFile=false"'
                'msbuild.exe'    = '-nologo -tl:off -v:q -clp:"ErrorsOnly;Summary;ShowProjectFile=false"'
            }

            # Restore is a distinct verb from build, the same way 'dotnet build'
            # and 'dotnet test' already diverge -- but MSBuild expresses it as a
            # flag ('-t:Restore'/'/t:Restore', possibly inside a ';'-delimited
            # target list) rather than as part of the command head, so it can't be
            # a distinct FlagMap key the way 'dotnet build'/'dotnet test' are.
            # SkipMap excludes a matched segment from receiving flags at all when
            # this pattern is present anywhere in it.
            # Quotes are optional around the target list because ';' is itself
            # a top-level command separator (CommandSegmentation.psm1) -- a
            # real multi-target list like '-t:Restore;Build' must be quoted
            # to survive the Bash tool as one token in the first place.
            $restoreRegex = [regex]'(?i)(?:^|\s)[-/]t:["'']?(?:[\w.]+;)*Restore(?:;[\w.]+)*["'']?(?:\s|$)'
            $skipMap = @{
                'msbuild'        = $restoreRegex
                'msbuild.exe'    = $restoreRegex
                'dotnet msbuild' = $restoreRegex
            }

            $wrapperPath       = Join-Path $PSScriptRoot 'Invoke-QuietDotnetTest.ps1'
            $vstestWrapperPath = Join-Path $PSScriptRoot 'Invoke-QuietVstestConsole.ps1'
            $dispatchMap = @{
                'dotnet test'        = "pwsh -NoProfile -File `"$wrapperPath`" --"
                'vstest.console'     = "pwsh -NoProfile -File `"$vstestWrapperPath`" --"
                'vstest.console.exe' = "pwsh -NoProfile -File `"$vstestWrapperPath`" --"
            }

            $rewritten = Add-CommandFlag -Command $command -FlagMap $flagMap -SkipMap $skipMap
            $rewritten = Add-CommandDispatch -Command $rewritten -DispatchMap $dispatchMap

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
