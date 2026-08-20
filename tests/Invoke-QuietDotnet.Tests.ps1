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

        function Resolve-GitBashPath {
            # 'bash' on PATH can resolve to the WSL launcher stub in
            # WindowsApps, not Git Bash -- confirmed by hand: it mis-parses -c
            # arguments entirely. Claude Code's Bash tool runs Git Bash
            # specifically, so the round-trip test below must too. Derive it
            # from git.exe's location rather than hard-coding a Program Files
            # path, since that's what's guaranteed present on any machine (or
            # CI runner) that can even run this repo's other git commands.
            #
            # git.exe's depth under the Git install root varies by layout --
            # cmd\git.exe (one level) vs. mingw64\bin\git.exe (two levels), and
            # PATH order picks a different one depending on the process, even
            # on this same machine. Walk up rather than assume a fixed depth.
            $gitExe = (Get-Command git.exe -ErrorAction Stop).Source
            $dir = Split-Path $gitExe -Parent
            for ($i = 0; $i -lt 4; $i++) {
                foreach ($candidate in @('usr\bin\bash.exe', 'bin\bash.exe')) {
                    $path = Join-Path $dir $candidate
                    if (Test-Path -LiteralPath $path) { return $path }
                }
                $parent = Split-Path $dir -Parent
                if (-not $parent -or $parent -eq $dir) { break }
                $dir = $parent
            }
            throw "Could not find Git Bash by walking up from $gitExe"
        }

        function Invoke-BashRoundTrip {
            # Runs $Command through a REAL Git Bash shell -- the same
            # mechanism Claude Code uses to execute a rewritten command -- with
            # 'dotnet' shadowed by a shell function that dumps its argv, one
            # entry per line. This is the only way to prove a flag value
            # survives shell re-parsing; asserting against our own segmenter's
            # output would just test our own understanding of shell quoting,
            # not the shell's.
            param([Parameter(Mandatory)][string] $Command)

            $bashExe = Resolve-GitBashPath
            $shadow  = 'dotnet() { for a in "$@"; do printf "%s\n" "$a"; done; }; '

            $psi = [System.Diagnostics.ProcessStartInfo]::new()
            $psi.FileName = $bashExe
            $psi.ArgumentList.Add('-c')
            $psi.ArgumentList.Add($shadow + $Command)
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError  = $true
            $psi.UseShellExecute        = $false

            $proc = [System.Diagnostics.Process]::Start($psi)
            $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
            $stderrTask = $proc.StandardError.ReadToEndAsync()
            $proc.WaitForExit()

            [pscustomobject]@{
                Argv   = @($stdoutTask.Result -split "`n" | Where-Object { $_ -ne '' })
                Stderr = $stderrTask.Result
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

    It 'the emitted -clp flag survives a real Bash round-trip as one unquoted argv entry' {
        # Regression test for a near-miss: dropping the quotes around -clp's
        # value would let Bash treat the embedded ';' as command separators,
        # truncating the flag and silently spawning two broken extra commands
        # (one "command not found", one no-op assignment). This drives the
        # ACTUAL emitted rewrite through a real Bash shell, not through our own
        # segmenter's understanding of itself -- it must fail the instant the
        # quotes are removed, however that happens.
        $payload = @{ tool_name = 'Bash'; tool_input = @{ command = 'dotnet build' } } | ConvertTo-Json -Compress
        $r = Invoke-QuietDotnetProcess -StdinText $payload
        $rewritten = ($r.Stdout | ConvertFrom-Json).hookSpecificOutput.updatedInput.command

        $result = Invoke-BashRoundTrip -Command $rewritten

        # If the quotes were dropped, Bash would try to run 'Summary' as its
        # own command and fail -- the clearest possible sign of corruption.
        $result.Stderr | Should -Not -Match 'command not found'

        # The whole flag value must arrive as ONE argv entry: quotes stripped
        # by Bash during parsing (never seen by dotnet itself), semicolons
        # intact, not truncated at the first one.
        $result.Argv | Should -Contain '-clp:ErrorsOnly;Summary;ShowProjectFile=false'
        $result.Argv -join '' | Should -Not -Match '"'
    }
}
