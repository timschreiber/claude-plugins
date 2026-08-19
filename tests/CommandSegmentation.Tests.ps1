<#
.SYNOPSIS
    Vectors for CommandSegmentation.psm1.

.DESCRIPTION
    33 vectors. The original 31 were verified against a reference implementation
    before the PowerShell port was written and are the contract -- none may be
    removed. 2 more were added when Add-CommandFlag moved from a single
    -Prefixes/-Flags pair to a -FlagMap, proving build and test each get their
    own flags in one compound command and inside a subshell.

    The env-assignment and subshell vectors were added after the hook-behaviour
    probe (2026-08-19) measured that Claude Code's 'if' filter reaches both cases.
    A rewriter that skipped them would fire the hook and then silently do nothing.

.EXAMPLE
    Invoke-Pester ./tests/CommandSegmentation.Tests.ps1
#>

BeforeAll {
    Import-Module (Join-Path $PSScriptRoot '../shared/denoizinator-core/CommandSegmentation.psm1') -Force
    $script:FlagMap = @{
        'dotnet build'   = '-nologo -tl:off'
        'dotnet test'    = '-nologo -tl:off'
        'dotnet msbuild' = '-nologo -tl:off'
        'dotnet run'     = '-nologo -tl:off'
        'msbuild'        = '-nologo -tl:off'
    }
}

Describe 'Add-CommandFlag' {

    $cases = @(
        # --- basic
        @{ Cmd='dotnet build';                     Segs=1; Want='dotnet build -nologo -tl:off' }
        @{ Cmd='dotnet build -c Release';           Segs=1; Want='dotnet build -c Release -nologo -tl:off' }
        @{ Cmd='msbuild MySolution.sln';            Segs=1; Want='msbuild MySolution.sln -nologo -tl:off' }
        @{ Cmd='  dotnet build  ';                  Segs=1; Want='  dotnet build -nologo -tl:off  ' }

        # --- compound: flags must land on the build segment, not the tail
        @{ Cmd='cd src && dotnet build';            Segs=2; Want='cd src && dotnet build -nologo -tl:off' }
        @{ Cmd='cd "my dir" && dotnet build';       Segs=2; Want='cd "my dir" && dotnet build -nologo -tl:off' }
        @{ Cmd='dotnet build; dotnet test';         Segs=2; Want='dotnet build -nologo -tl:off; dotnet test -nologo -tl:off' }

        # --- BOTH segments match: each gets its own flags
        @{ Cmd='dotnet build && dotnet test';       Segs=2; Want='dotnet build -nologo -tl:off && dotnet test -nologo -tl:off' }

        # --- pipes and redirects: flags go BEFORE the operator
        @{ Cmd='dotnet build | Select-String "error"'; Segs=2; Want='dotnet build -nologo -tl:off | Select-String "error"' }
        @{ Cmd='dotnet build > out.txt';            Segs=1; Want='dotnet build -nologo -tl:off > out.txt' }
        @{ Cmd='dotnet build 2>&1';                 Segs=1; Want='dotnet build -nologo -tl:off 2>&1' }
        @{ Cmd='dotnet build >> log.txt 2>&1';      Segs=1; Want='dotnet build -nologo -tl:off >> log.txt 2>&1' }
        @{ Cmd='dotnet build &';                    Segs=1; Want='dotnet build -nologo -tl:off &' }

        # --- quoting: separators inside quotes must NOT split
        @{ Cmd='dotnet test --filter "Name~A && Cat=B"';            Segs=1; Want='dotnet test --filter "Name~A && Cat=B" -nologo -tl:off' }
        @{ Cmd="dotnet test --filter 'A|B'";                        Segs=1; Want="dotnet test --filter 'A|B' -nologo -tl:off" }
        @{ Cmd="dotnet test --logger 'trx;LogFileName=a|b.trx'";    Segs=1; Want="dotnet test --logger 'trx;LogFileName=a|b.trx' -nologo -tl:off" }
        @{ Cmd='echo "a || b" && dotnet build';                     Segs=2; Want='echo "a || b" && dotnet build -nologo -tl:off' }

        # --- bare '--' hands the rest to the inner host: flags must go BEFORE it
        @{ Cmd='dotnet test -- --report-trx';               Segs=1; Want='dotnet test -nologo -tl:off -- --report-trx' }
        @{ Cmd='dotnet test --filter X -- --progress off';  Segs=1; Want='dotnet test --filter X -nologo -tl:off -- --progress off' }
        @{ Cmd='dotnet build --no-restore -- extra';        Segs=1; Want='dotnet build --no-restore -nologo -tl:off -- extra' }

        # --- leading env assignments: MEASURED to reach the 'if' filter,
        #     so the rewriter must reach them too (hook-behaviour probe, 2026-08-19)
        @{ Cmd='DOTNET_NOLOGO=1 dotnet build';      Segs=1; Want='DOTNET_NOLOGO=1 dotnet build -nologo -tl:off' }
        @{ Cmd='A=1 B=2 dotnet build';              Segs=1; Want='A=1 B=2 dotnet build -nologo -tl:off' }
        @{ Cmd='CFG="my cfg" dotnet build';         Segs=1; Want='CFG="my cfg" dotnet build -nologo -tl:off' }

        # --- subshells: MEASURED to reach the 'if' filter
        @{ Cmd='(cd src && dotnet build)';          Segs=1; Want='(cd src && dotnet build -nologo -tl:off)' }
        @{ Cmd='(dotnet build && dotnet test)';     Segs=1; Want='(dotnet build -nologo -tl:off && dotnet test -nologo -tl:off)' }
        @{ Cmd='cd x && (cd src && dotnet build)';  Segs=2; Want='cd x && (cd src && dotnet build -nologo -tl:off)' }

        # --- must NOT match
        @{ Cmd='pwsh -c "dotnet build"';            Segs=1; Want='pwsh -c "dotnet build"' }
        @{ Cmd='PATH=/x npm run build';             Segs=1; Want='PATH=/x npm run build' }
        @{ Cmd='npm run build';                     Segs=1; Want='npm run build' }
        @{ Cmd='dotnet buildx';                     Segs=1; Want='dotnet buildx' }
        @{ Cmd='mydotnet build';                    Segs=1; Want='mydotnet build' }
    )

    It 'segments and rewrites <Cmd>' -TestCases $cases {
        param($Cmd, $Segs, $Want)
        (Split-CommandSegment -Command $Cmd).Count | Should -Be $Segs
        Add-CommandFlag -Command $Cmd -FlagMap $script:FlagMap | Should -BeExactly $Want
    }
}

Describe 'Add-CommandFlag per-command flags' {

    BeforeAll {
        $script:DiffFlagMap = @{
            'dotnet build' = '-nologo -tl:off'
            'dotnet test'  = '--nologo -v:q'
        }
    }

    It 'gives build and test their own flags in one compound command' {
        Add-CommandFlag -Command 'dotnet build && dotnet test' -FlagMap $script:DiffFlagMap |
            Should -BeExactly 'dotnet build -nologo -tl:off && dotnet test --nologo -v:q'
    }

    It 'gives build and test their own flags inside a subshell' {
        Add-CommandFlag -Command '(dotnet build && dotnet test)' -FlagMap $script:DiffFlagMap |
            Should -BeExactly '(dotnet build -nologo -tl:off && dotnet test --nologo -v:q)'
    }
}

Describe 'Known limitations (documented, not bugs)' {

    It 'does not reach a build wrapped by another interpreter' {
        $c = 'pwsh -NoProfile -Command dotnet build'
        Add-CommandFlag -Command $c -FlagMap $script:FlagMap |
            Should -BeExactly $c
    }
}
