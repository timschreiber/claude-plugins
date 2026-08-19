# Hook probe command script

Run these **in a Claude Code session**, in the throwaway repo, one per turn, in
order. They must be issued as Bash tool calls by Claude — not typed into a
terminal — because the question is what Claude Code's hook layer sees.

Paste this to Claude:

> Run each of the following as a separate Bash command, in order, exactly as
> written. Do not combine them, do not fix them, do not comment on failures.
> Several are expected to fail; the failure is not the measurement.

```
dotnet build
dotnet build -c Release
cd src && dotnet build
cd src && dotnet build && cd ..
dotnet build && dotnet test
dotnet build | Select-String "error"
dotnet build > build-out.txt
dotnet build 2>&1
dotnet test
dotnet test --filter "FullyQualifiedName~A && Category=B"
dotnet test -- --report-trx
dotnet msbuild /t:Build
dotnet run --project src/App
msbuild MySolution.sln
pwsh -c "dotnet build"
pwsh -NoProfile -Command dotnet build
npm run build
(cd src && dotnet build)
DOTNET_NOLOGO=1 dotnet build
git status
```

`git status` is the negative control. If the `all-bash` control handler works, it
should appear there and under none of the filtered labels. If `all-bash` never
fires at all, the analyzer will say so -- and until that is resolved, absence
from a filtered label proves nothing.

## Also worth capturing

Ask Claude to run `dotnet build` **from inside a subagent** (Task tool). Hook
inheritance for subagents is not documented clearly enough to assume, and a
subagent that bypasses the hook is a silent coverage hole.
