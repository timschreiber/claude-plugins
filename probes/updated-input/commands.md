# updatedInput probe command script

Paste to Claude Code, in the repo, as one message:

> Run each of the following as a separate Bash command, in order, exactly as
> written. Do not combine them. After each one, tell me the exact output you
> received, verbatim, with no summarising.

```
dotnet --version
dotnet --list-sdks
dotnet --list-runtimes
```

Three commands, three tests. Ask for verbatim output because a second signal
matters here: whether **Claude** sees the rewritten command's output or the
original's. The marker files prove what executed; Claude's report shows what
came back up the wire.

Watch the session for a permission prompt. `dotnet --list-sdks` is the handler
returning `permissionDecision: allow`; the other two are not. If only that one
runs without prompting, `allow` is doing work beyond the rewrite — and that is a
side effect to accept deliberately, not inherit.

Then:

```powershell
./probes/updated-input/Analyze-RewriteProbe.ps1
```
