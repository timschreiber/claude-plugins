# Denoizinator for .NET — build specification

Status: ready to build. All architectural questions are resolved by measurement.

This spec is written for agentic execution. Each phase states its goal, its
acceptance criteria, and a prompt to hand to Claude Code. Decisions already made
are recorded with their rationale so an execution session does not re-litigate
them.

**Reading order for an execution session:** this file, then
`hook-behavior-findings.md`, then `dotnet-test-runner-findings.md`. Do not read
the probe scripts unless a phase says to.

---

## 1. Problem

Verbose .NET build and test output consumes Claude's context window. A two-failure
`dotnet build` emits 1,251 characters; the same build with quiet flags emits 306.
Across a working session with repeated build-test cycles, the difference decides
how much of the window remains for actual work.

TypeScript and Node projects do not have this problem to the same degree, which
is why the same workflow yields a longer effective context there.

## 2. Scope

**In scope.** Reducing the volume of build and test output that reaches Claude's
context, without changing what a developer or a CI pipeline sees.

**Out of scope, permanently.** Builds invoked through another interpreter —
`pwsh -c "dotnet build"`, `npm run build`, Makefiles, `nx`, `cake`. These reach
only an unfiltered hook and cannot be identified as builds without executing
them. Measured: `hook-behavior-findings.md` §5. Document, do not engineer around.

**Out of scope, this version.** Roslyn-based analysis, IDE integration, non-Windows
support, and anything requiring a persistent process.

## 3. Constraints

These are not negotiable and are not to be revisited during execution.

**C1. Nothing is written into the consuming repository.** No
`Directory.Build.rsp`, no `global.json`, no committed configuration of any kind.
A committed artifact is read by `msbuild.exe` and `dotnet build` on Azure
Pipelines agents, which would collapse CI logs to errors-only and scatter `.dnz/`
directories through the workspace. Visual Studio is documented not to read `.rsp`
files, so the IDE was never the problem; CI was.

**C2. Clamp, never deny.** A `permissionDecision: "deny"` costs an assistant turn
plus permanent context growth from both the denial and the retry — more than the
output it saved. On any uncertainty, emit nothing and let the command run.

**C3. Never set `permissionDecision: "allow"`.** Measured unnecessary
(`hook-behavior-findings.md` §8). Setting it would bypass the permission prompt
on every build as a side effect.

**C4. Exactly one hook handler per plugin.** When two handlers match one tool
call, the later handler's `updatedInput` silently discards the earlier one's
(§9). Separate handlers for `dotnet build` and `dotnet test` would lose half the
rewrite on `dotnet build && dotnet test`, with no error.

**C5. Nothing reaches outside the plugin directory at runtime.** Installed
plugins are copied to `~/.claude/plugins/cache`. Shared code lives in `shared/`
and is vendored into each plugin by `scripts/Sync-Shared.ps1`, with CI failing on
drift.

**C6. No `version` field in any manifest.** Claude Code then falls back to the
commit SHA, so every push reaches users. `claude plugin validate` warns about
this on every plugin; the warnings are expected.

## 4. Established by measurement

Do not re-derive these. Evidence is in `probes/evidence/`.

| Fact | Source |
|---|---|
| `matcher` filters on tool name; `if` filters on command content | hook §1 |
| All matching handlers run, not first-match-wins | hook §2 |
| `if` decomposes compound commands, pipes, redirects, and subshells | hook §3 |
| Leading `VAR=value` assignments are ignored by `if` | hook §4 |
| Interpreter-wrapped builds are invisible | hook §5 |
| `tool_input.command` is the raw, unnormalised string | hook §7 |
| `updatedInput` is honoured without `permissionDecision` | hook §8 |
| Rewrites do not chain; the last handler wins silently | hook §9 |
| Rewritten commands return output normally | hook §10 |
| Subagent Bash calls inherit hooks | hook §11 |
| Exit 1 means "tests failed" on VSTest, "infrastructure error" on MTP | dotnet §4 |
| MTP exit 9 fires only when nothing failed; failures return 2 | dotnet §4 |
| VSTest returns exit 0 with no summary when zero tests ran | dotnet §5 |
| xunit.v3-MTP under plain `dotnet test`: 0 chars, exit 0, nothing ran | dotnet §5 |
| VSTest quiet emits counts only; detail requires the TRX | dotnet §6 |
| net6.0 bridges MTP to VSTest; net8.0 and net10.0 do not | dotnet §7 |
| NUnit-MTP and xunit.v3-MTP reject `--report-trx` with exit 5, zero tests run | dotnet §7 |

## 5. Architecture

A single `PreToolUse` handler on the `Bash` tool, unfiltered. It reads the tool
payload, rewrites matching sub-commands, and returns `updatedInput`. All command
matching happens inside the script, because `if`-based filtering cannot be used
without violating C4.

```
Claude issues Bash("dotnet build && dotnet test")
  → PreToolUse handler (one, unfiltered)
      → fast reject if the raw payload contains no build-ish substring
      → parse into top-level segments, quote-aware
      → for each segment matching a known prefix, insert that prefix's flags
        before any redirect and before a bare `--`
      → emit updatedInput, or emit nothing if unchanged
  → Claude Code executes the rewritten command
  → Claude sees the quieted output
```

### 5.1 Components

| Component | Location | Responsibility |
|---|---|---|
| `CommandSegmentation.psm1` | `shared/denoizinator-core/` | Quote-aware segmentation and flag insertion. Pure functions, no I/O. |
| `Denoizinator.Core.psm1` | `shared/denoizinator-core/` | Toolchain-agnostic helpers: output directory, summary formatting. |
| `Invoke-QuietDotnet.ps1` | `plugins/denoizinator-net/scripts/` | The hook entry point. Payload in, rewrite out. |
| `hooks.json` | `plugins/denoizinator-net/hooks/` | One handler, `matcher: "Bash"`, no `if`. |

### 5.2 The insertion contract

Flags are inserted **before** the first redirect operator and **before** a bare
`--`, and **after** any leading `VAR=value` assignments. Every case below is a
test vector; none is hypothetical.

| Input | Why it is hard |
|---|---|
| `dotnet build && dotnet test` | two segments, different flags each |
| `dotnet build \| Select-String "error"` | flags must precede the pipe |
| `dotnet build > out.txt` | flags must precede the redirect |
| `dotnet test --filter "A && B"` | the `&&` is inside quotes, not a separator |
| `dotnet test -- --report-trx` | flags after `--` go to the test host, not the CLI |
| `(cd src && dotnet build)` | the hook fires on this, so the rewriter must reach it |
| `DOTNET_NOLOGO=1 dotnet build` | the hook fires on this too |
| `pwsh -c "dotnet build"` | must NOT match |

### 5.3 Flags

Per-command, because a single flag string would put `-clp` on a test command,
which is an error rather than a no-op.

```
dotnet build     -nologo -tl:off -clp:ErrorsOnly;Summary;ShowProjectFile=false
dotnet msbuild   (same)
dotnet run       (same)
dotnet test      --nologo -v:q
```

`-tl:off` disables the terminal logger, whose redraws are noise in a
non-interactive capture. `-v:q` is what does the work on the test side; adding a
console logger on top of it measurably changes nothing.

**Bare `msbuild` (Framework `MSBuild.exe`, not the dotnet CLI) and
`vstest.console` are deliberately not in the routing table.** `dotnet build`,
`dotnet msbuild`, and `dotnet run` all shell out through the same SDK MSBuild
engine, so evidence for one covers the others. Framework `MSBuild.exe` and
`vstest.console.exe` are different binaries with no measured evidence behind
them — adding their flags here would be an unverified guess wearing the same
table as everything else. They wait for Phase 5, which exists specifically to
produce that evidence.

---

## 6. Build phases

### Phase 1 — Promote the segmenter to production code

**Goal.** `CommandSegmentation.psm1` moves out of `probes/`, gains per-prefix flag
support, and is vendored into both plugins.

**Deliverables.**
- `shared/denoizinator-core/CommandSegmentation.psm1` with `Add-CommandFlag`
  taking a `-FlagMap` hashtable of prefix → flags instead of a single `-Flags`
  string. Prefixes matched longest-first so `dotnet msbuild` wins over `dotnet`.
- `tests/CommandSegmentation.Tests.ps1`, existing vectors converted to `-FlagMap`
  plus new vectors proving build and test get different flags in one command.
- `scripts/Sync-Shared.ps1` extended to vendor the new module into both plugins.
- Vendored copies committed.

**Acceptance.**
- `Invoke-Pester ./tests/CommandSegmentation.Tests.ps1` — all pass, no vector
  removed.
- `./scripts/Sync-Shared.ps1 -Check` — in sync.
- `git log --follow` shows history for the moved files.

**Prompt.**

> Read `docs/denoizinator-net-spec.md` §5.2 and §6 Phase 1.
>
> Move `probes/CommandSegmentation.psm1` to `shared/denoizinator-core/` and
> `probes/CommandSegmentation.Tests.ps1` to `tests/`, using `git mv` so history
> follows.
>
> Change `Add-CommandFlag` to take `-FlagMap` (a hashtable mapping a command
> prefix to that command's flags) instead of `-Prefixes` and `-Flags`. Match
> prefixes longest-first. `Get-SegmentEdit` must return the matched prefix
> alongside the insertion index.
>
> Convert every existing test vector to the new signature without deleting any of
> them, then add vectors proving that `dotnet build && dotnet test` and
> `(dotnet build && dotnet test)` each receive per-command flags.
>
> Extend `scripts/Sync-Shared.ps1` to vendor the module into both plugins and run
> it. Do not change the segmentation algorithm itself — it is verified against 31
> vectors and any change needs a new vector first.

---

### Phase 2 — The hook entry point

**Goal.** `Invoke-QuietDotnet.ps1` does real work.

**Deliverables.** A script that reads the payload from stdin, rejects
non-matching calls as cheaply as possible, rewrites via `Add-CommandFlag`, and
emits `updatedInput`.

**Requirements.**
- Fast reject before importing any module. The handler is unfiltered and fires on
  every Bash call, so the common case must not pay for the uncommon one.
- Emit nothing when the command is unchanged.
- Never emit `permissionDecision` (C3).
- Never throw. On any error, emit nothing (C2). Errors may be logged to a temp
  file when `DNZ_DEBUG` is set, never otherwise.
- Import the **vendored** module, `scripts/vendor/CommandSegmentation.psm1`, not
  the shared original (C5).

**Acceptance.** Feed payloads on stdin without Claude Code in the loop:

| Payload command | Expected stdout |
|---|---|
| `dotnet build && dotnet test` | JSON with `updatedInput`, build flags on the first segment, test flags on the second |
| `git status` | nothing |
| `pwsh -c "dotnet build"` | nothing |
| malformed JSON | nothing, exit 0 |
| empty stdin | nothing, exit 0 |

**Prompt.**

> Read `docs/denoizinator-net-spec.md` §5 and §6 Phase 2, and
> `docs/hook-behavior-findings.md` §8 and §9.
>
> Implement `plugins/denoizinator-net/scripts/Invoke-QuietDotnet.ps1` against the
> requirements in Phase 2. Write a Pester suite at
> `tests/Invoke-QuietDotnet.Tests.ps1` covering the acceptance table, driving the
> script through stdin rather than by importing it.
>
> Do not set `permissionDecision`. Do not throw on malformed input. Do not import
> from `shared/` at runtime.

---

### Phase 3 — Overhead and filter alternation

**Goal.** Establish what the unfiltered handler costs, and whether it can be
narrowed.

**Two questions.**
1. What does a pwsh launch add to every Bash tool call? Measure the fast-reject
   path specifically — that is what most calls hit.
2. Does `if` accept alternation, e.g. `"Bash(dotnet *)|Bash(msbuild:*)"`? If it
   does, one filtered handler replaces the unfiltered one, C4 is still satisfied,
   and question 1 stops mattering.

**Deliverables.** `probes/Probe-HandlerOverhead.ps1` and a short probe for
alternation following the pattern in `probes/hook-behavior/`. Findings appended
to `docs/hook-behavior-findings.md` with evidence in `probes/evidence/`.

**Decision gate.** If alternation works, change `hooks.json` to a single
alternating `if` and note it. If overhead is under roughly 50 ms and alternation
does not work, keep the unfiltered handler and record the number. If overhead is
material and alternation does not work, escalate — the design needs revisiting.

---

### Phase 4 — Test output normalisation

**Goal.** Replace counts-only test output with a normalised summary carrying
failure detail.

**Blocked on.** `probes/Probe-MtpProgress.ps1` must run first. The current MTP
numbers are contaminated: `--no-progress` is deprecated and warns on stderr, and
PowerShell's `2>&1` wrapped that warning in a `NativeCommandError` record worth
roughly 500 characters per call, which was nearly written up as runner behaviour.
`--progress off` is the documented replacement and is unmeasured.

**Design.** The hook rewrites `dotnet test <args>` to invoke a wrapper script
rather than merely appending flags. The wrapper detects the runner from the
project file, invokes it with the right flags, reads the TRX where one exists,
and emits:

```
TEST PASS | 42 passed | 0 skipped | 0.6s
TEST FAIL | 37 passed | 5 failed | 0.6s | .dnz\test.trx
  ProgramTests.DoCopy_CopiesFiles — FileNotFoundException: Newtonsoft.Json 8.0.0.0
  [+4 more]
TEST NONE | 0 tests ran | filter matched nothing
```

**Non-negotiable behaviours**, each from a measured failure mode:
- Zero-tests-ran must be detected by **absence of a summary line**, not by exit
  code. Every VSTest configuration returns exit 0 in that case (dotnet §5).
- The runner must be identified before the exit code is interpreted. Exit 1 means
  opposite things on VSTest and MTP (dotnet §4).
- `--report-trx` must not be passed to NUnit-MTP or xunit.v3-MTP. It is rejected
  with exit 5 and **zero tests run** — a passing suite becomes a silent no-op
  (dotnet §7).
- The wrapper must never write `global.json`. That is what allows a repo with
  mixed test projects to work at all.

**Acceptance.** Against the probe's scratch projects: correct normalised output
for pass, fail, and zero-tests across VSTest and MTP on net8.0 and net10.0.

---

### Phase 5 — .NET Framework

**Goal.** Produce the evidence that Section 5.3 currently says does not exist,
for the real estate this plugin does not yet cover: ASP.NET 4.x web
applications and legacy non-SDK-style `csproj` projects. Neither builds with
`dotnet build`; both require `MSBuild.exe`, and their test projects require
`vstest.console.exe`. This is in active use, not a hypothetical, and it is the
noisiest tier — Framework MSBuild predates the terminal logger and the modern
`-clp` summary conventions the .NET CLI tier relies on.

**Deliverables.** `probes/Probe-FrameworkBuild.ps1`, not implementation —
mirroring `Probe-DotnetTest.ps1`'s conventions (six passing and two failing
tests per project, so any runner reporting a different failure count is
lying). It scaffolds:

- a legacy non-SDK-style `csproj` targeting net48
- an SDK-style `csproj` targeting net48
- an ASP.NET 4.x web application
- a legacy-format test project, run through `vstest.console.exe`

each with a deliberate build warning, so quiet-flag behaviour toward warnings
is measured, not assumed.

**Must measure:**
- Which of `-nologo`, `-tl:off`, and the `-clp`/`/clp` forms Framework
  `MSBuild.exe` accepts versus rejects. It predates the terminal logger; `-tl:off`
  may not exist there at all.
- Output character counts, baseline versus quiet, with stdout and stderr
  captured **separately** via `Start-Process` redirection — not `2>&1`, per the
  measurement-discipline rule in `probes/README.md`.
- `nuget.exe restore` volume for `packages.config` projects — the SDK-style
  `dotnet restore` path does not apply here.
- `vstest.console.exe` exit codes for pass, fail, and zero-tests-matched.
  **Treat the silent-false-pass finding in `dotnet-test-runner-findings.md` §5
  as a hypothesis to retest, not an established fact** — that finding was
  measured against VSTest under the `dotnet test` CLI, a different invocation
  path than `vstest.console.exe` run directly.
- Solution-level versus per-project invocation, to see whether banners
  multiply per project.
- Whether `MSBuild.exe` resolves on `PATH` outside a Developer Command Prompt
  at all, including what Claude Code's own Bash tool environment actually
  provides — if it doesn't resolve, nothing else in this phase matters.

**Findings** to `docs/framework-build-findings.md`, evidence to
`probes/evidence/`, following the same evidence-file discipline as every other
findings doc in this repo.

**No flag-map entry for `msbuild` or `vstest.console` until this evidence
exists.** Section 5.3 already states this; this phase is what would earn them
a place there.

**Acceptance.** The probe runs cleanly against its four scaffolded projects,
and every one of the six measurement questions above has a corresponding
evidence file and a findings section that cites it.

**Prompt.**

> Read `docs/denoizinator-net-spec.md` §5.3 and §6 Phase 5, and
> `docs/dotnet-test-runner-findings.md` §5.
>
> Write `probes/Probe-FrameworkBuild.ps1`, modelled on `Probe-DotnetTest.ps1`'s
> conventions but scaffolding net48 projects instead: a legacy non-SDK-style
> `csproj`, an SDK-style `csproj`, an ASP.NET 4.x web application, and a
> legacy-format test project driven through `vstest.console.exe` directly, each
> with a deliberate build warning and six passing / two failing tests.
>
> Measure the six items listed under Phase 5's "Must measure," with stdout and
> stderr captured separately via `Start-Process`, never `2>&1`. Do not assume
> the VSTest zero-tests-ran finding from `dotnet-test-runner-findings.md` §5
> carries over to `vstest.console.exe` run directly — retest it.
>
> Write findings to `docs/framework-build-findings.md` and evidence to
> `probes/evidence/`. Do not add `msbuild` or `vstest.console` to
> `Invoke-QuietDotnet.ps1`'s flag map in this phase — routing them in is
> follow-on work, blocked on this phase's evidence existing first.

---

### Phase 6 — Publication

The `planning` plugin was removed from the catalog (it shipped one skill file
and never grew beyond that). Run `Probe-Net60Vstest.ps1` to determine whether
the routing table can claim net6.0, and state the supported TFM range in the
README.

---

## 7. Open questions

| Question | Blocks | Where |
|---|---|---|
| Handler launch overhead on every Bash call | nothing; informs Phase 3 gate | Phase 3 |
| Does `if` accept alternation? | would simplify `hooks.json` | Phase 3 |
| Real MTP quiet numbers with `--progress off` | Phase 4 | `Probe-MtpProgress.ps1` |
| Which quiet flags Framework `MSBuild.exe` accepts | The Phase 5 routing table | `Probe-FrameworkBuild.ps1` |
| Does the VSTest zero-tests-ran finding hold for `vstest.console.exe` run directly | The Phase 5 routing table | `Probe-FrameworkBuild.ps1` |
| Does `MSBuild.exe` resolve on `PATH` in Claude Code's Bash environment at all | Whether Phase 5 is viable without extra setup | `Probe-FrameworkBuild.ps1` |
| Is there a net6.0 VSTest config that builds? | TFM claims in the README | `Probe-Net60Vstest.ps1` |
| Behaviour on macOS and Linux | non-Windows support | unscheduled |

## 8. Rules for execution sessions

- **Do not add a fact to a findings document without an evidence file.** Every
  number in `docs/` traces to `probes/evidence/`.
- **Measure output with stdout and stderr separated.** The `exe-quiet` anomaly
  was instrumentation, not behaviour, and nearly became a documented finding.
- **When the hook fires but the rewriter does not match, that is a silent
  no-op** — a launched process, a verbose build, and no sign of failure. Two of
  these were found by comparing the hook's coverage against the rewriter's test
  vectors. Any new matching rule needs the comparison run again.
- **Do not change the segmentation algorithm without adding a vector first.**
- **A failing rewrite is worse than no rewrite.** An invalid command costs a
  failed tool call plus a retry.
