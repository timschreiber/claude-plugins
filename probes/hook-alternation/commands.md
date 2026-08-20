# Hook alternation probe command script

Run these **in a fresh Claude Code session that starts after the settings file
is in place** — not an already-running session where you edit
`.claude/settings.json` or `settings.local.json` mid-session. Confirmed by
direct test: mid-session settings edits do eventually get picked up, but with
`if` filtering broken (every handler fires on every call, filtered or not),
which would masquerade as "alternation works" or produce noise either way. A
`claude -p "<prompt>" --allowedTools "Bash"` headless invocation, started after
the probe settings are merged in, is a clean way to get a genuinely fresh
session without leaving an interactive one running.

They must be issued as Bash tool calls by Claude — not typed into a
terminal — because the question is what Claude Code's `if`-alternation
matching does.

Paste this to Claude:

> Run each of the following as a separate Bash command, in order, exactly as
> written. Do not combine them, do not fix them, do not comment on failures.
> Several are expected to fail; the failure is not the measurement.

```
dotnet build
dotnet test
dotnet --version
dotnet msbuild /t:Build
msbuild MySolution.sln
git status
pwsh -c "dotnet build"
```

`git status` and `pwsh -c "dotnet build"` are negative controls. Both must
reach `all-bash` only — if either also fires `if-alt-broad` or
`if-alt-narrow`, alternation is over-matching, not just under-matching.
