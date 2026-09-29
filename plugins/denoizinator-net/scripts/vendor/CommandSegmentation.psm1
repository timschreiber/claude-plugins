<#
.SYNOPSIS
    Quote-aware segmentation of a shell command, so flags can be appended to the
    correct sub-command without corrupting the rest.

.DESCRIPTION
    Claude Code hands the Bash tool and the PowerShell tool a single command
    string that may contain compound operators, pipes, redirects, quoted
    arguments, and a `--` separator. A naive append breaks several of those.
    This module finds top-level segments and the correct insertion point within
    each. -Shell Bash (the default) segments with Bash syntax; -Shell PowerShell
    segments with PowerShell syntax.

    Bash mode rules: the escape char is the backslash (unquoted and inside
    double quotes; a backslash before LF or CR LF is a line continuation and
    skips all of it); inside single quotes nothing escapes; ( and ) are tracked
    for depth; a newline at depth 0 outside quotes separates segments like ';';
    a '#' at word start (index 0, or after whitespace or one of ; & | ( ))
    starts a comment running to the next newline, while '$#', '${#x}' and 'a#b'
    are not comments; a heredoc ('<<' or '<<-' then a delimiter word, optionally
    quoted, but not '<<<') makes the lines after the opener line, through the
    line equal to the delimiter (leading tabs stripped for '<<-'), part of the
    opener's segment and opaque, or the rest of the command if the delimiter
    never appears; the insertion point stops before a word-initial '#' comment,
    before a redirect, and before a bare '--'. Shell keywords as segment heads
    (then, do, else) still do not match, so 'then dotnet build' is not rewritten.

    PowerShell mode rules: the escape char is the backtick (unquoted and inside
    double quotes; a backtick before CR LF skips all three chars), and a
    backslash is an ordinary char; inside single quotes nothing escapes; a
    here-string (@" or @' followed only by spaces/tabs and a newline, up to the
    line that starts with the matching closer) is skipped whole; { and } are
    tracked like ( and ) for depth and are never recursed into; a newline at
    depth 0 outside quotes separates segments like ';'; a '#' at the start of a
    token (index 0 or after whitespace) starts a comment running to the next
    newline; the insertion point stops before a comment, and before a redirect
    ('>' or '<', optionally preceded at token start by one of 1-6 or '*', as in
    '*>', '2>$null', '3>&1'), and before a bare '--'.

    The algorithm was developed and verified against 24 test vectors before being
    ported here. tests/CommandSegmentation.Tests.ps1 carries the same vectors --
    if the port diverges, the tests fail.

    Two behaviours here exist because the hook-behaviour probe measured them:
    Claude Code's 'if' filter DOES reach inside subshells and DOES ignore leading
    environment assignments. So "(cd src && dotnet build)" and
    "DOTNET_NOLOGO=1 dotnet build" both fire the hook -- and a rewriter that
    skipped them would produce a silent no-op: a launched process, a verbose
    build, and no sign anything went wrong. Both are handled.
#>

Set-StrictMode -Version Latest

# Longest-first ordering matters: '&&' must be tested before '&', '||' before '|'.
$script:Separators = @('&&', '||', ';', '|', '&')
$script:Redirects  = @('2>&1', '>>', '2>', '>', '<')

function Get-EscapeStep {
    <#
    .SYNOPSIS
        How many chars an escape at Index consumes: 2 (the escape char and the
        next), or 3 when the next chars are CR LF (a line continuation).
    #>
    param(
        [string] $Command,
        [int]    $Index,
        [int]    $Limit,
        [string] $Shell
    )

    if (($Index + 2) -lt $Limit -and
        $Command[$Index + 1] -eq "`r" -and $Command[$Index + 2] -eq "`n") { return 3 }
    return 2
}

function Get-HereStringEnd {
    <#
    .SYNOPSIS
        PowerShell mode: if a here-string opens at Index (an '@' then '"' or
        "'", then only spaces/tabs, then a newline), return the index just past
        its closer ("@ or '@ at the start of a line), or Limit if unterminated.
        Return -1 if no here-string opens at Index.
    #>
    param(
        [string] $Command,
        [int]    $Index,
        [int]    $Limit
    )

    if (($Index + 1) -ge $Limit) { return -1 }
    $q = $Command[$Index + 1]
    if ($q -ne '"' -and $q -ne "'") { return -1 }

    $j = $Index + 2
    while ($j -lt $Limit -and ($Command[$j] -eq ' ' -or $Command[$j] -eq "`t")) { $j++ }
    if ($j -lt $Limit -and $Command[$j] -eq "`r") { $j++ }
    if ($j -ge $Limit -or $Command[$j] -ne "`n") { return -1 }

    $k = $j
    while ($k -lt $Limit) {
        if ($Command[$k] -eq "`n" -and ($k + 2) -lt $Limit -and
            $Command[$k + 1] -eq $q -and $Command[$k + 2] -eq '@') {
            return $k + 3
        }
        $k++
    }
    return $Limit
}

function Test-BashCommentStart {
    <#
    .SYNOPSIS
        Bash mode: is the char at Index a '#' that starts a comment? It must be
        at word start: Index is Origin, or the previous char is whitespace or
        one of ; & | ( ). So '$#', '${#x}' and 'a#b' are not comments.
    #>
    param(
        [string] $Command,
        [int]    $Index,
        [int]    $Origin
    )

    if ($Command[$Index] -ne '#') { return $false }
    if ($Index -le $Origin) { return $true }
    $prev = $Command[$Index - 1]
    return ([char]::IsWhiteSpace($prev) -or ';&|()'.IndexOf($prev) -ge 0)
}

function Get-HeredocOpener {
    <#
    .SYNOPSIS
        Bash mode: if a heredoc opens at Index ('<<' not part of '<<<', then an
        optional '-', optional spaces/tabs, then a delimiter word of letters,
        digits and underscores, optionally wrapped in one pair of single or
        double quotes), return an object with End (the index just past the
        delimiter token), Delimiter and Strip (true for '<<-'). Return $null if
        no heredoc opens at Index.
    #>
    param(
        [string] $Command,
        [int]    $Index,
        [int]    $Limit
    )

    if (($Index + 1) -ge $Limit -or $Command[$Index] -ne '<' -or $Command[$Index + 1] -ne '<') { return $null }
    if ($Index -gt 0 -and $Command[$Index - 1] -eq '<') { return $null }
    if (($Index + 2) -lt $Limit -and $Command[$Index + 2] -eq '<') { return $null }

    $j = $Index + 2
    $strip = $false
    if ($j -lt $Limit -and $Command[$j] -eq '-') { $strip = $true; $j++ }
    while ($j -lt $Limit -and ($Command[$j] -eq ' ' -or $Command[$j] -eq "`t")) { $j++ }

    $q = $null
    if ($j -lt $Limit -and ($Command[$j] -eq '"' -or $Command[$j] -eq "'")) { $q = $Command[$j]; $j++ }
    $wordStart = $j
    while ($j -lt $Limit -and ([char]::IsLetterOrDigit($Command[$j]) -or $Command[$j] -eq '_')) { $j++ }
    if ($j -eq $wordStart) { return $null }
    $delim = $Command.Substring($wordStart, $j - $wordStart)
    if ($null -ne $q) {
        if ($j -ge $Limit -or $Command[$j] -ne $q) { return $null }
        $j++
    }
    return [pscustomobject]@{ End = $j; Delimiter = $delim; Strip = $strip }
}

function Get-HeredocEnd {
    <#
    .SYNOPSIS
        Bash mode: given the index where a heredoc body starts (just past the
        LF that ends the opener line), return the index of the end of the line
        whose content equals Delimiter (for '<<-', after stripping leading
        tabs; a trailing CR is ignored), or Limit if it is never found. The
        returned index is at that line's LF, or Limit.
    #>
    param(
        [string] $Command,
        [int]    $Start,
        [int]    $Limit,
        [string] $Delimiter,
        [bool]   $Strip
    )

    $ls = $Start
    while ($ls -lt $Limit) {
        $le = $ls
        while ($le -lt $Limit -and $Command[$le] -ne "`n") { $le++ }
        $line = $Command.Substring($ls, $le - $ls).TrimEnd("`r")
        if ($Strip) { $line = $line.TrimStart("`t") }
        if ($line -ceq $Delimiter) { return $le }
        $ls = $le + 1
    }
    return $Limit
}

function Split-CommandSegment {
    <#
    .SYNOPSIS
        Return top-level segment spans as objects with Start and End (exclusive).
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string] $Command,
        [ValidateSet('Bash','PowerShell')][string] $Shell = 'Bash'
    )

    $ps       = ($Shell -eq 'PowerShell')
    $esc      = if ($ps) { [char]96 } else { [char]'\' }
    $spans    = [System.Collections.Generic.List[object]]::new()
    $segStart = 0
    $i        = 0
    $n        = $Command.Length
    $quote    = $null
    $depth    = 0
    $pending  = [System.Collections.Generic.List[object]]::new()

    while ($i -lt $n) {
        $ch = $Command[$i]

        if ($null -ne $quote) {
            if ($quote -eq '"' -and $ch -eq $esc -and ($i + 1) -lt $n) {
                $i += Get-EscapeStep -Command $Command -Index $i -Limit $n -Shell $Shell; continue
            }
            if ($ch -eq $quote) { $quote = $null }
            $i++; continue
        }

        if ($ps -and $ch -eq '@') {
            $he = Get-HereStringEnd -Command $Command -Index $i -Limit $n
            if ($he -ge 0) { $i = $he; continue }
        }
        if ($ch -eq '"' -or $ch -eq "'") { $quote = $ch; $i++; continue }
        if ($ch -eq $esc -and ($i + 1) -lt $n) {
            $i += Get-EscapeStep -Command $Command -Index $i -Limit $n -Shell $Shell; continue
        }
        if ($ps -and $ch -eq '#' -and ($i -eq 0 -or [char]::IsWhiteSpace($Command[$i - 1]))) {
            while ($i -lt $n -and $Command[$i] -ne "`n") { $i++ }
            continue
        }
        if (-not $ps -and (Test-BashCommentStart -Command $Command -Index $i -Origin 0)) {
            while ($i -lt $n -and $Command[$i] -ne "`n") { $i++ }
            continue
        }
        if (-not $ps -and $ch -eq '<') {
            $op = Get-HeredocOpener -Command $Command -Index $i -Limit $n
            if ($null -ne $op) { $pending.Add($op); $i = $op.End; continue }
        }
        if (-not $ps -and $ch -eq "`n" -and $pending.Count -gt 0) {
            # the LF ending a heredoc opener line: the bodies that follow are opaque
            $end = $i
            foreach ($op in $pending) {
                $end = Get-HeredocEnd -Command $Command -Start ([Math]::Min($end + 1, $n)) -Limit $n -Delimiter $op.Delimiter -Strip $op.Strip
            }
            $pending.Clear()
            # $end is at the LF after the last terminator line (or the end): scanned normally
            $i = $end
            continue
        }
        if ($ch -eq '(' -or ($ps -and $ch -eq '{')) { $depth++;                    $i++; continue }
        if ($ch -eq ')' -or ($ps -and $ch -eq '}')) { $depth = [Math]::Max(0, $depth - 1); $i++; continue }

        if ($depth -eq 0) {
            if ($ch -eq "`n") {
                $spans.Add([pscustomobject]@{ Start = $segStart; End = $i })
                $i++
                $segStart = $i
                continue
            }
            $matched = $null
            foreach ($sep in $script:Separators) {
                if ($i + $sep.Length -le $n -and $Command.Substring($i, $sep.Length) -eq $sep) {
                    # '2>&1' contains '&' -- do not treat that '&' as a separator
                    if ($sep -eq '&' -and $i -gt 0 -and $Command[$i - 1] -eq '>') { break }
                    $matched = $sep; break
                }
            }
            if ($null -ne $matched) {
                $spans.Add([pscustomobject]@{ Start = $segStart; End = $i })
                $i += $matched.Length
                $segStart = $i
                continue
            }
        }

        $i++
    }
    $spans.Add([pscustomobject]@{ Start = $segStart; End = $n })

    $out = [System.Collections.Generic.List[object]]::new()
    foreach ($s in $spans) {
        $a = $s.Start; $b = $s.End
        while ($a -lt $b -and [char]::IsWhiteSpace($Command[$a]))     { $a++ }
        while ($b -gt $a -and [char]::IsWhiteSpace($Command[$b - 1])) { $b-- }
        if ($b -gt $a) { $out.Add([pscustomobject]@{ Start = $a; End = $b }) }
    }
    return $out
}

function Get-InsertionPoint {
    <#
    .SYNOPSIS
        Index within a segment where flags belong: before any redirect, and
        before a bare '--' (which hands everything after it to the inner host).
        It also stops before a word-initial '#' comment (in Bash mode the span
        start counts as a word start), and in PowerShell mode a redirect may
        carry a stream prefix ('*>', '2>$null', '3>&1').
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string] $Command,
        [Parameter(Mandatory)][object] $Span,
        [ValidateSet('Bash','PowerShell')][string] $Shell = 'Bash'
    )

    $ps    = ($Shell -eq 'PowerShell')
    $esc   = if ($ps) { [char]96 } else { [char]'\' }
    $s = $Span.Start; $e = $Span.End
    $i = $s
    $quote = $null
    $stop  = $null

    while ($i -lt $e) {
        $ch = $Command[$i]

        if ($null -ne $quote) {
            if ($quote -eq '"' -and $ch -eq $esc -and ($i + 1) -lt $e) {
                $i += Get-EscapeStep -Command $Command -Index $i -Limit $e -Shell $Shell; continue
            }
            if ($ch -eq $quote) { $quote = $null }
            $i++; continue
        }
        if ($ps -and $ch -eq '@') {
            $he = Get-HereStringEnd -Command $Command -Index $i -Limit $e
            if ($he -ge 0) { $i = $he; continue }
        }
        if ($ch -eq '"' -or $ch -eq "'") { $quote = $ch; $i++; continue }

        if ($ps) {
            if ($ch -eq $esc -and ($i + 1) -lt $e) {
                $i += Get-EscapeStep -Command $Command -Index $i -Limit $e -Shell $Shell; continue
            }
            $tokenStart = ($i -eq $s -or [char]::IsWhiteSpace($Command[$i - 1]))
            if ($ch -eq '#' -and $tokenStart) { $stop = $i; break }
            if ($ch -eq '>' -or $ch -eq '<') { $stop = $i; break }
            if ($tokenStart -and '*123456'.IndexOf($ch) -ge 0 -and
                ($i + 1) -lt $e -and ($Command[$i + 1] -eq '>' -or $Command[$i + 1] -eq '<')) {
                $stop = $i; break
            }
        }
        else {
            if (Test-BashCommentStart -Command $Command -Index $i -Origin $s) { $stop = $i; break }
            $hit = $null
            foreach ($r in $script:Redirects) {
                if ($i + $r.Length -le $e -and $Command.Substring($i, $r.Length) -eq $r) { $hit = $r; break }
            }
            if ($null -ne $hit) { $stop = $i; break }
        }

        if ($i + 2 -le $e -and $Command.Substring($i, 2) -eq '--' -and
            ($i -eq $s -or [char]::IsWhiteSpace($Command[$i - 1]))) {
            $after = $i + 2
            if ($after -ge $e -or [char]::IsWhiteSpace($Command[$after])) { $stop = $i; break }
        }

        $i++
    }

    $idx = if ($null -ne $stop) { $stop } else { $e }
    while ($idx -gt $s -and [char]::IsWhiteSpace($Command[$idx - 1])) { $idx-- }
    return $idx
}

$script:EnvAssignment = [regex]'^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|''[^'']*''|[^\s]*)\s+'

function Remove-EnvPrefix {
    <#
    .SYNOPSIS
        Strip leading VAR=value assignments. Measured: the 'if' filter ignores
        them, so "DOTNET_NOLOGO=1 dotnet build" reaches Bash(dotnet build:*).
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][AllowEmptyString()][string] $Text)

    $t = $Text
    while ($true) {
        $m = $script:EnvAssignment.Match($t)
        if (-not $m.Success) { return $t }
        $t = $t.Substring($m.Length)
    }
}

function Test-SegmentPrefix {
    <#
    .SYNOPSIS
        Does this segment invoke one of the target commands at its head?
        Returns the matched prefix, or $null.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]   $Command,
        [Parameter(Mandatory)][object]   $Span,
        [Parameter(Mandatory)][string[]] $Prefixes
    )

    $raw  = $Command.Substring($Span.Start, $Span.End - $Span.Start).TrimStart()
    $text = Remove-EnvPrefix -Text $raw
    foreach ($p in $Prefixes) {
        if ($text -eq $p -or $text.StartsWith("$p ")) { return $p }
    }
    return $null
}

function Get-SegmentEdit {
    <#
    .SYNOPSIS
        Insertion edits for one span, recursing into subshells. Each edit
        carries the insertion Index and the matched Prefix, so the caller can
        look up that command's own flags.
        Measured: the 'if' filter reaches inside "( ... )", so the rewriter must too.

        -SkipMap is an optional prefix -> [regex] map, tested against the
        segment's FULL text (not just the head) once a prefix matches -- this
        is how a verb expressed as a later flag rather than part of the head
        (e.g. MSBuild's '-t:Restore') can still exclude a segment from
        matching. A regex hit means "no edit for this segment", identical to
        a non-matching prefix.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]   $Command,
        [Parameter(Mandatory)][object]   $Span,
        [Parameter(Mandatory)][string[]] $Prefixes,
        [hashtable] $SkipMap = @{},
        [int] $Depth = 0,
        [ValidateSet('Bash','PowerShell')][string] $Shell = 'Bash'
    )

    $text = $Command.Substring($Span.Start, $Span.End - $Span.Start)

    if ($Depth -lt 4 -and $text.StartsWith('(') -and $text.EndsWith(')')) {
        $innerStart = $Span.Start + 1
        $innerEnd   = $Span.End - 1
        $inner      = $Command.Substring($innerStart, $innerEnd - $innerStart)
        $out = [System.Collections.Generic.List[object]]::new()
        foreach ($sub in (Split-CommandSegment -Command $inner -Shell $Shell)) {
            $shifted = [pscustomobject]@{ Start = $innerStart + $sub.Start; End = $innerStart + $sub.End }
            foreach ($edit in (Get-SegmentEdit -Command $Command -Span $shifted -Prefixes $Prefixes -SkipMap $SkipMap -Depth ($Depth + 1) -Shell $Shell)) {
                $out.Add($edit)
            }
        }
        return $out
    }

    $matched = Test-SegmentPrefix -Command $Command -Span $Span -Prefixes $Prefixes
    if ($matched) {
        if ($SkipMap.ContainsKey($matched) -and $SkipMap[$matched].IsMatch($text)) {
            return @()
        }
        $idx = Get-InsertionPoint -Command $Command -Span $Span -Shell $Shell
        return @([pscustomobject]@{ Index = $idx; Prefix = $matched })
    }
    return @()
}

function Add-CommandFlag {
    <#
    .SYNOPSIS
        Append each command's own flags to every top-level segment invoking it.

    .EXAMPLE
        Add-CommandFlag -Command 'cd src && dotnet build' `
                        -FlagMap @{ 'dotnet build' = '-nologo -tl:off' }
        # -> 'cd src && dotnet build -nologo -tl:off'

    .EXAMPLE
        Add-CommandFlag -Command 'msbuild foo.sln -t:Restore' `
                        -FlagMap @{ 'msbuild' = '-nologo -tl:off' } `
                        -SkipMap @{ 'msbuild' = [regex]'(?i)(?:^|\s)[-/]t:["'']?(?:[\w.]+;)*Restore(?:;[\w.]+)*["'']?(?:\s|$)' }
        # -> 'msbuild foo.sln -t:Restore'   (unchanged -- restore is a distinct verb)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string] $Command,
        [Parameter(Mandatory)][hashtable] $FlagMap,
        [hashtable] $SkipMap = @{},
        [ValidateSet('Bash','PowerShell')][string] $Shell = 'Bash'
    )

    # Longest-first: 'dotnet msbuild' must be tested before 'dotnet'.
    $prefixes = @($FlagMap.Keys | Sort-Object -Property Length -Descending)

    $edits = [System.Collections.Generic.List[object]]::new()
    foreach ($span in (Split-CommandSegment -Command $Command -Shell $Shell)) {
        foreach ($edit in (Get-SegmentEdit -Command $Command -Span $span -Prefixes $prefixes -SkipMap $SkipMap -Depth 0 -Shell $Shell)) {
            $edits.Add($edit)
        }
    }

    $result = $Command
    foreach ($edit in ($edits | Sort-Object -Property Index -Descending)) {
        $flags  = $FlagMap[$edit.Prefix]
        $result = $result.Substring(0, $edit.Index) + ' ' + $flags + $result.Substring($edit.Index)
    }
    return $result
}

function Get-DispatchEdit {
    <#
    .SYNOPSIS
        Dispatch edits for one span, recursing into subshells like
        Get-SegmentEdit does. Instead of an insertion point before a redirect,
        this returns the index where the segment's own command HEAD begins --
        i.e. after any leading whitespace and any VAR=value assignments -- so
        a caller can prepend a replacement head there and leave the matched
        command, its args, and any trailing redirect untouched as the tail.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]   $Command,
        [Parameter(Mandatory)][object]   $Span,
        [Parameter(Mandatory)][string[]] $Prefixes,
        [int] $Depth = 0,
        [ValidateSet('Bash','PowerShell')][string] $Shell = 'Bash'
    )

    $text = $Command.Substring($Span.Start, $Span.End - $Span.Start)

    if ($Depth -lt 4 -and $text.StartsWith('(') -and $text.EndsWith(')')) {
        $innerStart = $Span.Start + 1
        $innerEnd   = $Span.End - 1
        $inner      = $Command.Substring($innerStart, $innerEnd - $innerStart)
        $out = [System.Collections.Generic.List[object]]::new()
        foreach ($sub in (Split-CommandSegment -Command $inner -Shell $Shell)) {
            $shifted = [pscustomobject]@{ Start = $innerStart + $sub.Start; End = $innerStart + $sub.End }
            foreach ($edit in (Get-DispatchEdit -Command $Command -Span $shifted -Prefixes $Prefixes -Depth ($Depth + 1) -Shell $Shell)) {
                $out.Add($edit)
            }
        }
        return $out
    }

    $matched = Test-SegmentPrefix -Command $Command -Span $Span -Prefixes $Prefixes
    if ($matched) {
        $raw        = $Command.Substring($Span.Start, $Span.End - $Span.Start)
        $leadingWs  = $raw.Length - $raw.TrimStart().Length
        $trimmed    = $raw.TrimStart()
        $withoutEnv = Remove-EnvPrefix -Text $trimmed
        $envLen     = $trimmed.Length - $withoutEnv.Length
        $idx        = $Span.Start + $leadingWs + $envLen
        return @([pscustomobject]@{ Index = $idx; Prefix = $matched })
    }
    return @()
}

function Add-CommandDispatch {
    <#
    .SYNOPSIS
        Prepend a replacement command HEAD before every top-level segment
        invoking one of -DispatchMap's keys. Unlike Add-CommandFlag (which
        inserts a flag string before a redirect), this leaves the matched
        segment's original text -- the command, its args, any redirect, a
        trailing bare '--' -- completely untouched; it becomes the tail of
        the new head by construction.

    .EXAMPLE
        Add-CommandDispatch -Command 'dotnet build && dotnet test' `
                            -DispatchMap @{ 'dotnet test' = 'pwsh -File wrapper.ps1 --' }
        # -> 'dotnet build && pwsh -File wrapper.ps1 -- dotnet test'
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string] $Command,
        [Parameter(Mandatory)][hashtable] $DispatchMap,
        [ValidateSet('Bash','PowerShell')][string] $Shell = 'Bash'
    )

    # Longest-first: a more specific prefix must be tested before a shorter one.
    $prefixes = @($DispatchMap.Keys | Sort-Object -Property Length -Descending)

    $edits = [System.Collections.Generic.List[object]]::new()
    foreach ($span in (Split-CommandSegment -Command $Command -Shell $Shell)) {
        foreach ($edit in (Get-DispatchEdit -Command $Command -Span $span -Prefixes $prefixes -Depth 0 -Shell $Shell)) {
            $edits.Add($edit)
        }
    }

    $result = $Command
    foreach ($edit in ($edits | Sort-Object -Property Index -Descending)) {
        $head   = $DispatchMap[$edit.Prefix]
        $result = $result.Substring(0, $edit.Index) + $head + ' ' + $result.Substring($edit.Index)
    }
    return $result
}

Export-ModuleMember -Function Split-CommandSegment, Get-InsertionPoint,
                              Test-SegmentPrefix, Remove-EnvPrefix,
                              Get-SegmentEdit, Add-CommandFlag,
                              Get-DispatchEdit, Add-CommandDispatch
