# Probes

Development-time investigation. Nothing here ships with the plugin.

Each probe exists to close a specific hole in the spec. The rule: no spec claim
without an evidence file behind it.

| Probe | Question it answers | Spec decision it unblocks | Status |
|---|---|---|---|
| `Probe-DotnetTest.ps1` | Runner behavior, exit codes, TRX, zero-test detection across TFMs | The routing table | **Run.** `evidence/probe-results.json`, 207 records |
| `hook-behavior/` | Does an `if` filter decompose compound commands? What does the hook actually receive? | Whether hook injection can replace the `.rsp` at all | **Run.** `hook-behavior/hook-coverage.json`, 50 records / 20 calls. See `docs/hook-behavior-findings.md` |
| `Probe-MtpProgress.ps1` | Real MTP quiet numbers with stderr separated; is `--progress off` the replacement? | The MTP invocation line | Not run |
| `Probe-RspScope.ps1` | Who reads `Directory.Build.rsp`; do relative log paths follow CWD; does `-noAutoResponse` work | Whether the `.rsp` can be committed | Not run |
| `Probe-Net60Vstest.ps1` | Is there a net6.0 VSTest config that builds? | Whether the routing table can claim net6.0 | Not run |
| `updated-input/` | Is `updatedInput` honoured? Does it need `permissionDecision: allow`? Do two rewrites chain? | Whether hook injection can work at all | Not run |
| `CommandSegmentation.Tests.ps1` | Does the rewriter corrupt real commands? | The rewriter itself | **Run.** 26/26 passing at 24 vectors; 7 vectors added after the hook probe |

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
Invoke-Pester ./probes/CommandSegmentation.Tests.ps1

# 3. RSP scope
./probes/Probe-RspScope.ps1

# 4. Reuses the projects Probe-DotnetTest.ps1 builds, so run that first with -KeepArtifacts
./probes/Probe-DotnetTest.ps1 -KeepArtifacts
./probes/Probe-MtpProgress.ps1

# 5. net6.0 gap
./probes/Probe-Net60Vstest.ps1
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
