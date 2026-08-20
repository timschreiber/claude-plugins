# Probes

Development-time investigation. Nothing here ships with the plugin.

Each probe exists to close a specific hole in the spec. The rule: no spec claim
without an evidence file behind it.

| Probe | Question it answers | Spec decision it unblocks | Status |
|---|---|---|---|
| `Probe-DotnetTest.ps1` | Runner behavior, exit codes, TRX, zero-test detection across TFMs | The routing table | **Run.** `evidence/probe-results.json`, 207 records |
| `hook-behavior/` | Does an `if` filter decompose compound commands? What does the hook actually receive? | Whether hook injection can replace the `.rsp` at all | **Run.** `hook-behavior/hook-coverage.json`, 50 records / 20 calls. See `docs/hook-behavior-findings.md` |
| `Probe-MtpProgress.ps1` | Real MTP quiet numbers with stderr separated; is `--progress off` the replacement? | The MTP invocation line | **Run.** `evidence/mtp-progress-results.json`, 40 records. See `docs/dotnet-test-runner-findings.md` §12 |
| `Probe-Xunit3MtpProgress.ps1` | Does xunit.v3-MTP have a working quiet-progress flag; is its exit-1 baseline stable across invocation paths? | xunit.v3-MTP's invocation line (Phase 8) | **Run.** `evidence/xunit3-mtp-progress-results.json`, 16 records. Working flag found. See `docs/dotnet-test-runner-findings.md` §14 |
| `Probe-RspScope.ps1` | Who reads `Directory.Build.rsp`; do relative log paths follow CWD; does `-noAutoResponse` work | Whether the `.rsp` can be committed | Not run |
| `Probe-Net60Vstest.ps1` | Is there a net6.0 VSTest config that builds? | Whether the routing table can claim net6.0 | **Run.** `evidence/net60-vstest-results.json`, 10 records. See `docs/dotnet-test-runner-findings.md` §13 |
| `updated-input/` | Is `updatedInput` honoured? Does it need `permissionDecision: allow`? Do two rewrites chain? | Whether hook injection can work at all | Not run |
| `CommandSegmentation.Tests.ps1` | Does the rewriter corrupt real commands? | The rewriter itself | **Run.** 34/34 passing at 33 vectors. Promoted to production: module now lives at `shared/denoizinator-core/CommandSegmentation.psm1`, tests at `tests/CommandSegmentation.Tests.ps1` |
| `Probe-HandlerOverhead.ps1` | What does a `pwsh` launch cost on the unfiltered handler's fast-reject path? | The Phase 3 decision gate | **Run.** `evidence/handler-overhead.json`, 50 iterations/scenario. See `docs/hook-behavior-findings.md` §12 |
| `hook-alternation/` | Does `if` accept `\|` alternation, e.g. `"Bash(dotnet *)\|Bash(msbuild:*)"`? | Whether one filtered handler can replace the unfiltered one | **Run.** `hook-alternation/alternation-coverage.json`, 12 records/11 calls. See `docs/hook-behavior-findings.md` §13 |
| `Probe-FrameworkBuild.ps1` | MSBuild.exe/vstest.console.exe/nuget.exe tool resolution, quiet-flag acceptance, restore vs build volume, vstest exit codes, solution vs per-project banners | Whether `msbuild`/`vstest.console` can be added to the routing table | **Run.** `evidence/framework-build-results.json`, 100 records. See `docs/framework-build-findings.md` |

## Run order

The hook probe first. If `if` filters turn out not to reach compound commands,
hook injection can't be the sole mechanism and the `.rsp` question becomes
load-bearing — which changes what the other probes need to establish.

```powershell
# 1. Hook behavior -- needs a throwaway repo and a live Claude Code session
#    Merge hook-behavior/settings.probe.json into <repo>/.claude/settings.json,
#    then follow hook-behavior/commands.md.
./probes/hook-behavior/Analyze-HookProbe.ps1

# 2. Rewriter correctness -- pure unit test, no .NET needed
Invoke-Pester ./tests/CommandSegmentation.Tests.ps1

# 3. RSP scope
./probes/Probe-RspScope.ps1

# 4. Reuses the projects Probe-DotnetTest.ps1 builds, so run that first with -KeepArtifacts
./probes/Probe-DotnetTest.ps1 -KeepArtifacts
./probes/Probe-MtpProgress.ps1
./probes/Probe-Xunit3MtpProgress.ps1

# 5. net6.0 gap
./probes/Probe-Net60Vstest.ps1

# 6. Handler overhead -- pure timing, no Claude Code needed
./probes/Probe-HandlerOverhead.ps1

# 7. if alternation -- needs a FRESH Claude Code session (headless `claude -p`
#    or a session restart), started after hook-alternation/settings.probe.json
#    is merged in. Do not edit hooks into an already-running session; see
#    docs/hook-behavior-findings.md section 13's caution.
./probes/hook-alternation/Analyze-AlternationProbe.ps1

# 8. Framework tier -- independent of the others. Needs Visual Studio (or the
#    Build Tools workload including the ASP.NET/web workload for the web-app
#    scenario) installed locally; resolves MSBuild.exe/vstest.console.exe via
#    vswhere.exe and downloads nuget.exe on first run if not already cached.
./probes/Probe-FrameworkBuild.ps1 -KeepArtifacts
```

## What none of these can tell you

- **Azure Pipelines agent behavior.** `Probe-RspScope.ps1` issues the same command
  lines the `VSBuild@1`, `MSBuild@1`, and `DotNetCoreCLI@2` tasks issue, so local
  agreement is strong evidence — but a real agent has a different SDK layout, a
  different working directory, and possibly a `MSBuild.rsp` next to its own
  `msbuild.exe`. Confirm on an agent before trusting any CI conclusion.
- **Visual Studio.** Documented not to apply `.rsp` files. Verify by hand: open
  the solution, build, check that no `.dnz` directory appears.
- **Whether the PowerShell port of the segmenter matches the reference.** The
  algorithm was verified against 24 vectors before porting; the port itself has
  never executed. Run the Pester suite before trusting it with a real command.

## Measurement discipline

`Probe-DotnetTest.ps1` recorded `exe-quiet` as larger than `exe-direct` and the
first draft of the findings nearly wrote that up as runner behavior. It was
instrumentation: `--no-progress` warns on stderr, and PowerShell's `2>&1` wraps
native stderr in a `NativeCommandError` record carrying a source excerpt and
stack trace — roughly 500 chars per call, attributed to the runner.

`Probe-MtpProgress.ps1` redirects stdout and stderr to separate files via
`Start-Process` for exactly this reason. Any new probe that measures output
volume should do the same, and should report the two streams separately.
