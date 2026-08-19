<#
.SYNOPSIS
    Acceptance vectors for Invoke-QuietDotnet.ps1, driven through stdin as a
    child process (not by importing it), matching how Claude Code invokes it.

.EXAMPLE
    Invoke-Pester ./tests/Invoke-QuietDotnet.Tests.ps1
#>

Describe 'Invoke-QuietDotnet.ps1' {

    BeforeAll {
        function Invoke-QuietDotnetProcess {
            param([Parameter()][AllowNull()][string] $StdinText)

            $scriptPath = (Resolve-Path (Join-Path $PSScriptRoot '../plugins/denoizinator-net/scripts/Invoke-QuietDotnet.ps1')).Path

            $psi = [System.Diagnostics.ProcessStartInfo]::new()
            $psi.FileName               = (Get-Process -Id $PID).Path
            $psi.Arguments               = "-NoProfile -File `"$scriptPath`""
            $psi.RedirectStandardInput  = $true
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError  = $true
            $psi.UseShellExecute        = $false

            $proc = [System.Diagnostics.Process]::Start($psi)

            $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
            $stderrTask = $proc.StandardError.ReadToEndAsync()

            if ($null -ne $StdinText) { $proc.StandardInput.Write($StdinText) }
            $proc.StandardInput.Close()   # signals EOF -- required or ReadToEnd() in the child blocks forever

            $proc.WaitForExit()

            [pscustomobject]@{
                Stdout   = $stdoutTask.Result
                Stderr   = $stderrTask.Result
                ExitCode = $proc.ExitCode
            }
        }
    }

    It 'rewrites dotnet build && dotnet test with per-segment flags' {
        $payload = @{ tool_name = 'Bash'; tool_input = @{ command = 'dotnet build && dotnet test' } } | ConvertTo-Json -Compress
        $r = Invoke-QuietDotnetProcess -StdinText $payload

        $r.ExitCode | Should -Be 0
        $r.Stdout | Should -Not -BeExactly ''

        $parsed = $r.Stdout | ConvertFrom-Json
        $parsed.hookSpecificOutput.hookEventName | Should -Be 'PreToolUse'
        $parsed.hookSpecificOutput.updatedInput.command |
            Should -BeExactly 'dotnet build -nologo -tl:off -clp:"ErrorsOnly;Summary;ShowProjectFile=false" && dotnet test --nologo -v:q'
        $parsed.hookSpecificOutput.PSObject.Properties.Name |
            Should -Not -Contain 'permissionDecision'
    }

    It 'emits nothing for git status' {
        $payload = @{ tool_input = @{ command = 'git status' } } | ConvertTo-Json -Compress
        $r = Invoke-QuietDotnetProcess -StdinText $payload
        $r.ExitCode | Should -Be 0
        $r.Stdout   | Should -BeExactly ''
    }

    It 'emits nothing for an interpreter-wrapped build' {
        $payload = @{ tool_input = @{ command = 'pwsh -c "dotnet build"' } } | ConvertTo-Json -Compress
        $r = Invoke-QuietDotnetProcess -StdinText $payload
        $r.ExitCode | Should -Be 0
        $r.Stdout   | Should -BeExactly ''
    }

    It 'emits nothing for malformed JSON with no build substring' {
        $r = Invoke-QuietDotnetProcess -StdinText '{not valid json'
        $r.ExitCode | Should -Be 0
        $r.Stdout   | Should -BeExactly ''
    }

    It 'emits nothing for malformed JSON that DOES contain a build substring' {
        # Exercises the ConvertFrom-Json catch path itself -- the spec's own
        # malformed-JSON vector has no "dotnet"/"msbuild" substring, so it never
        # reaches ConvertFrom-Json at all (fast-rejected first). This one does.
        $r = Invoke-QuietDotnetProcess -StdinText '{"tool_input":{"command":"dotnet build"'
        $r.ExitCode | Should -Be 0
        $r.Stdout   | Should -BeExactly ''
    }

    It 'emits nothing for empty stdin' {
        $r = Invoke-QuietDotnetProcess -StdinText $null
        $r.ExitCode | Should -Be 0
        $r.Stdout   | Should -BeExactly ''
    }

    It 'emits nothing when tool_name is not Bash' {
        # tool_input.command still carries a build-ish string so this exercises the
        # tool_name gate specifically, not the raw-text fast reject.
        $payload = @{ tool_name = 'Edit'; tool_input = @{ command = 'dotnet build' } } | ConvertTo-Json -Compress
        $r = Invoke-QuietDotnetProcess -StdinText $payload
        $r.ExitCode | Should -Be 0
        $r.Stdout   | Should -BeExactly ''
    }

    It 'does not rewrite bare msbuild -- no evidence backs it yet (spec §5.3)' {
        $payload = @{ tool_input = @{ command = 'msbuild MySolution.sln' } } | ConvertTo-Json -Compress
        $r = Invoke-QuietDotnetProcess -StdinText $payload
        $r.ExitCode | Should -Be 0
        $r.Stdout   | Should -BeExactly ''
    }
}
