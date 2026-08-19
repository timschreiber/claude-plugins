<#
.SYNOPSIS
    Quote-aware segmentation of a shell command, so flags can be appended to the
    correct sub-command without corrupting the rest.

.DESCRIPTION
    Claude Code hands the Bash tool a single command string that may contain
    compound operators, pipes, redirects, quoted arguments, and a `--` separator.
    A naive append breaks several of those. This module finds top-level segments
    and the correct insertion point within each.

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

function Split-CommandSegment {
    <#
    .SYNOPSIS
        Return top-level segment spans as objects with Start and End (exclusive).
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][AllowEmptyString()][string] $Command)

    $spans    = [System.Collections.Generic.List[object]]::new()
    $segStart = 0
    $i        = 0
    $n        = $Command.Length
    $quote    = $null
    $depth    = 0

    while ($i -lt $n) {
        $ch = $Command[$i]

        if ($null -ne $quote) {
            if ($quote -eq '"' -and $ch -eq '\' -and ($i + 1) -lt $n) { $i += 2; continue }
            if ($ch -eq $quote) { $quote = $null }
            $i++; continue
        }

        if ($ch -eq '"' -or $ch -eq "'") { $quote = $ch; $i++; continue }
        if ($ch -eq '\' -and ($i + 1) -lt $n) { $i += 2; continue }
        if ($ch -eq '(') { $depth++;                    $i++; continue }
        if ($ch -eq ')') { $depth = [Math]::Max(0, $depth - 1); $i++; continue }

        if ($depth -eq 0) {
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
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string] $Command,
        [Parameter(Mandatory)][object] $Span
    )

    $s = $Span.Start; $e = $Span.End
    $i = $s
    $quote = $null
    $stop  = $null

    while ($i -lt $e) {
        $ch = $Command[$i]

        if ($null -ne $quote) {
            if ($quote -eq '"' -and $ch -eq '\' -and ($i + 1) -lt $e) { $i += 2; continue }
            if ($ch -eq $quote) { $quote = $null }
            $i++; continue
        }
        if ($ch -eq '"' -or $ch -eq "'") { $quote = $ch; $i++; continue }

        $hit = $null
        foreach ($r in $script:Redirects) {
            if ($i + $r.Length -le $e -and $Command.Substring($i, $r.Length) -eq $r) { $hit = $r; break }
        }
        if ($null -ne $hit) { $stop = $i; break }

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
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]   $Command,
        [Parameter(Mandatory)][object]   $Span,
        [Parameter(Mandatory)][string[]] $Prefixes,
        [int] $Depth = 0
    )

    $text = $Command.Substring($Span.Start, $Span.End - $Span.Start)

    if ($Depth -lt 4 -and $text.StartsWith('(') -and $text.EndsWith(')')) {
        $innerStart = $Span.Start + 1
        $innerEnd   = $Span.End - 1
        $inner      = $Command.Substring($innerStart, $innerEnd - $innerStart)
        $out = [System.Collections.Generic.List[object]]::new()
        foreach ($sub in (Split-CommandSegment -Command $inner)) {
            $shifted = [pscustomobject]@{ Start = $innerStart + $sub.Start; End = $innerStart + $sub.End }
            foreach ($edit in (Get-SegmentEdit -Command $Command -Span $shifted -Prefixes $Prefixes -Depth ($Depth + 1))) {
                $out.Add($edit)
            }
        }
        return $out
    }

    $matched = Test-SegmentPrefix -Command $Command -Span $Span -Prefixes $Prefixes
    if ($matched) {
        $idx = Get-InsertionPoint -Command $Command -Span $Span
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
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string] $Command,
        [Parameter(Mandatory)][hashtable] $FlagMap
    )

    # Longest-first: 'dotnet msbuild' must be tested before 'dotnet'.
    $prefixes = @($FlagMap.Keys | Sort-Object -Property Length -Descending)

    $edits = [System.Collections.Generic.List[object]]::new()
    foreach ($span in (Split-CommandSegment -Command $Command)) {
        foreach ($edit in (Get-SegmentEdit -Command $Command -Span $span -Prefixes $prefixes -Depth 0)) {
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

Export-ModuleMember -Function Split-CommandSegment, Get-InsertionPoint,
                              Test-SegmentPrefix, Remove-EnvPrefix,
                              Get-SegmentEdit, Add-CommandFlag
