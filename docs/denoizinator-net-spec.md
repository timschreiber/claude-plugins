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

**Out of scope, permanently: the hook's own wall-clock latency.** This plugin
optimizes token/context volume (§1), not speed. A `pwsh` launch on a
non-matching Bash call is real time on the clock, but a non-matching hook
invocation emits nothing, and an empty `PreToolUse` response costs zero
tokens — nothing reaches Claude's context either way (`hook-behavior-findings.md`
§10). Measured overhead is worth recording for the historical record, but it
is never, by itself, a reason to change the design.

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
dotnet build          -nologo -tl:off -clp:"ErrorsOnly;Summary;ShowProjectFile=false"
dotnet msbuild        (same)
dotnet run            (same)
dotnet test           dispatched to a wrapper (see §5.4) -- a single flag string is
                      wrong across runners (dotnet-test-runner-findings.md §12)
msbuild(.exe)         -nologo -tl:off -v:q -clp:"ErrorsOnly;Summary;ShowProjectFile=false"
                      (Framework MSBuild.exe; skipped entirely when the segment
                      carries a -t:Restore/-t:"...;Restore;..." target -- see
                      the SkipMap paragraph below)
vstest.console(.exe)  dispatched to Invoke-QuietVstestConsole.ps1 (see §5.4;
                      Framework's direct test runner)
```

`-tl:off` disables the terminal logger, whose redraws are noise in a
non-interactive capture.

**The `-clp` value is quoted because it contains literal `;`, and the emitted
rewrite is executed by a shell** — see §8's rule on quoting flag values
containing shell metacharacters. The Phase 4 wrapper (§5.4) hits the same rule
again internally: `--logger "trx;LogFileName=test.trx"` carries an unescaped
`;` and must stay quoted wherever it's constructed, for the identical reason.

**`msbuild`/`msbuild.exe` and `vstest.console`/`vstest.console.exe` are
routed as of Phase 7**, using the evidence `framework-build-findings.md`
produced: Framework MSBuild accepted every quiet-flag candidate tested with
zero rejections, in both `-` and `/` forms (`framework-build-findings.md`
§2) — the emitted rewrite standardises on the `-` form regardless of which
form the caller used. `vstest.console.exe` run directly matches the same
exit-code/zero-tests-ran contract §5.4 already implements for `dotnet test`'s
VSTest path (`framework-build-findings.md` §5).

An ASP.NET 4.x Web Application Project (`proj4_web`) fails to build
regardless of these flags with `MSB4019` — the resolved MSBuild lacks the web
workload's targets (`framework-build-findings.md` §3), an unrelated
VS-workload gap, not a limitation of this rewrite.

**Restore is a distinct verb from build, the same way `dotnet build` and
`dotnet test` already diverge — but MSBuild expresses it as a flag
(`-t:Restore`/`/t:Restore`, possibly inside a `;`-delimited target list)
rather than as part of the command head**, so it can't be a distinct FlagMap
key the way `dotnet build`/`dotnet test` are. `Add-CommandFlag` gained an
optional `-SkipMap` parameter for this: a prefix → `[regex]` map, tested
against a matched segment's **full text** (not just the head); a match means
no edit for that segment, identical to a non-matching prefix. `msbuild`,
`msbuild.exe`, and `dotnet msbuild` all carry the same skip regex.

**Do not resolve `msbuild.exe`/`vstest.console.exe` via `vswhere.exe` inside
the hook.** The rewrite only edits the command string the user's shell will
run; if `msbuild`/`vstest.console` doesn't resolve on the user's `PATH`,
that's equally true with or without the rewrite (`framework-build-findings.md`
§1).

**Caveat:** `-tl:off` acceptance was confirmed only against MSBuild 18.7.8
(VS 2026) — `framework-build-findings.md`'s "still open" section notes this
should not be generalised to older Framework MSBuild (VS2019/2022-era)
without separate evidence.

### 5.4 `dotnet test` dispatch: exit-code and passthrough contracts

Since Phase 4, `dotnet test <args>` is not given flags directly — it's
dispatched to `Invoke-QuietDotnetTest.ps1` (`Add-CommandDispatch`, the sibling
of `Add-CommandFlag` that prepends a replacement command head rather than
inserting flags), which picks the runner+TFM-safe flags at runtime and emits a
normalised `TEST PASS|FAIL|NONE|RAW|UNKNOWN` summary. Two contracts govern its
behaviour, decided during Phase 4 and binding on any future change to it:

**Exit-code contract.** The wrapper never mirrors the raw runner's exit code
in its normal (non-passthrough) path — VSTest-fail=1 and MTP-fail=2 already
diverge from each other, and absorbing that divergence is the point of the
wrapper. It normalises to a fixed vocabulary instead:

| Code | Meaning |
|---|---|
| 0 | `TEST PASS` — tests ran, none failed |
| 1 | `TEST FAIL` — tests ran, at least one failed |
| 2 | `TEST NONE` — no tests ran (the zero-tests-ran silent-false-pass case, dotnet §5) |
| 3 | `TEST UNKNOWN` — the wrapper could not establish the outcome (unparsable TRX, no recognisable summary, unrecognised runner state) — never guessed, never 0 |

The raw runner exit code is still included in the `TEST UNKNOWN`/`TEST RAW`
output lines for recoverability; it is not load-bearing there.

**Passthrough contract.** If the original command already carries test-host
flags the wrapper would otherwise choose itself (`--logger`,
`--results-directory`, `--report-trx`, or a bare `--`), or the runner can't be
confidently normalised (an unresolvable project, or xunit.v3-MTP when the
user supplies any test args of its own — its CLI is a different surface
entirely from the generic dotnet-test/MTP syntax those args would be written
in, dotnet §14), the wrapper runs the original invocation **unmodified**
rather than layering its own flags on top of the user's — never risking a
self-inflicted version of the `--report-trx`-on-NUnit-MTP silent-no-op trap
(dotnet §7). This check is made against the
**already-tokenized argument array** the wrapper receives, not the raw
command string, so `--filter "Name~logger"` and `--filter "A -- B"` are each
one array element and never false-positively trigger passthrough via
substring matching. Passthrough is not silent: it emits one line,
`TEST RAW | <reason> | runner exit <N>`, and — the one documented exception to
the exit-code contract above — the wrapper's own exit code mirrors the raw
runner's in this case, since it isn't claiming to have normalised anything. If
`--report-trx` is present and the detected runner is NUnit-MTP or xunit.v3-MTP,
the wrapper additionally writes one stderr line warning that the runner
rejects that flag and no tests will run.

The wrapper never writes `global.json`; runner detection is read-only
(`global.json` walked up from the project directory, `.csproj` text regex —
the same static approach as `probes/Probe-DotnetTest.ps1`'s
`Get-DetectedRunner`), which is what lets a repo with mixed VSTest/MTP test
projects keep working.

**Since Phase 7**, the VSTest-output classification logic (`Get-VSTestOutcome`
in `DotnetTestRunner.psm1`) is shared between this wrapper's VSTest path and
`Invoke-QuietVstestConsole.ps1` — both invoke the same underlying VSTest
engine and produce byte-identical summary-line shapes under their respective
quiet flags (confirmed against `probes/evidence/framework-build-results.json`).
`TEST NONE`'s reason text is now one of two values, not always the Phase-4
default: `filter matched nothing`, or `test adapter not registered` (a
`packages.config` project whose restore never wired the test adapter —
`framework-build-findings.md` §5).

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

**Status: resolved. Keep the unfiltered handler.**

**Goal.** Establish what the unfiltered handler costs, and whether it can be
narrowed.

**Two questions, both measured** (`hook-behavior-findings.md` §12, §13):
1. What does a `pwsh` launch add to every Bash tool call? **~290–350 ms
   median**, dominated by `pwsh` process-launch cost, not the script's own
   fast-reject logic (~62 ms of that total). Real, and recorded for the
   historical record — but see §2: this plugin optimizes tokens, not
   wall-clock time, and a non-matching hook invocation costs zero tokens
   regardless of how long it takes. This number does not gate the decision.
2. Does `if` accept alternation, e.g. `"Bash(dotnet *)|Bash(msbuild:*)"`? **No.**
   Confirmed with a confound control (a plain, non-alternated clause fired
   correctly in the same session; the identical clause joined with `|` did
   not fire at all) — this isn't "filtering is broken here," specifically the
   `|` syntax doesn't decompose into independent clauses.

**Decision.** Alternation isn't available, so it can't replace the unfiltered
handler. That would ordinarily leave latency as the tiebreaker, but latency
isn't a goal here (§2) — a `pwsh` launch on a non-matching call is real
clock time and zero tokens, so there is nothing left to weigh. **The
unfiltered handler stays, permanently, independent of any future overhead
number.** No code change resulted from this phase.

**Deliverables (done).** `probes/Probe-HandlerOverhead.ps1` and
`probes/hook-alternation/`, following the pattern in `probes/hook-behavior/`.
Findings in `docs/hook-behavior-findings.md` §12–13, evidence in
`probes/evidence/handler-overhead.json` and
`probes/evidence/alternation-coverage.json`.

---

### Phase 4 — Test output normalisation

**Goal.** Replace counts-only test output with a normalised summary carrying
failure detail.

**Unblocked.** `probes/Probe-MtpProgress.ps1` has run
(`dotnet-test-runner-findings.md` §12). The clean re-measurement (stdout and
stderr captured separately, not `2>&1`) found `--progress off` is **not** a
universal replacement for the deprecated `--no-progress`: it works on
MSTest-MTP net8.0/net10.0 only, is rejected outright by MSTest-MTP net6.0 and
NUnit-MTP (exit 5, a ~4× usage-dump cost — worse than doing nothing), and
rejected differently by xunit.v3-MTP (exit 3), which also rejects
`--no-progress`. The wrapper below must pick the MTP progress flag per
runner+TFM, per §9's updated wrapper design — never one flag for all of MTP.

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
- `--progress off` must not be passed to MSTest-MTP on net6.0, NUnit-MTP, or
  xunit.v3-MTP. Each rejects it, and rejection costs roughly 2–4× the verbose
  baseline in a usage-dump, not a no-op (dotnet §12). Only MSTest-MTP on
  net8.0/net10.0 gets `--progress off`; others fall back to `--no-progress`
  (deprecated but functional) or, for xunit.v3-MTP, neither yet — no known
  quiet-progress flag exists for it (dotnet §10 item 6).
- The wrapper must never write `global.json`. That is what allows a repo with
  mixed test projects to work at all.

**Acceptance.** Against the probe's scratch projects: correct normalised output
for pass, fail, and zero-tests across VSTest and MTP (MSTest, NUnit) on net8.0
and net10.0. **xunit.v3-MTP is out of scope for this phase** — every
progress-suppression flag tried so far is rejected (dotnet §12), so there is no
evidence-backed flag to route it to. It passes through unrewritten, the same
way `msbuild`/`vstest.console` currently do in §5.3, until a follow-up probe
(dotnet §10 item 6) resolves it. **Resolved in Phase 8 — dotnet §14.**

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
lying). It scaffolds five projects, because both restore paths are in real use
and are architecturally distinct, not just a config-file variant of each other:

- a legacy non-SDK-style `csproj` targeting net48, using `packages.config`,
  restored via `nuget.exe restore`
- the same legacy non-SDK-style `csproj` migrated to `PackageReference`,
  restored via `msbuild -t:Restore`
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
- **Restore output volume, measured separately from build output volume, for
  both restore paths** (`nuget.exe restore` against `packages.config`, and
  `msbuild -t:Restore` against `PackageReference`) — not folded into the build
  number. Restore noise may exceed build noise on a cold cache, and it is a
  distinct stream the build quiet-flags above do not touch. If so, that is its
  own finding, and possibly its own rewrite target, not a footnote on the build
  numbers.
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

**Acceptance.** The probe runs cleanly against its five scaffolded projects,
and every one of the six measurement questions above has a corresponding
evidence file and a findings section that cites it — including restore volume
reported separately from build volume for both restore paths.

**Prompt.**

> Read `docs/denoizinator-net-spec.md` §5.3 and §6 Phase 5, and
> `docs/dotnet-test-runner-findings.md` §5.
>
> Write `probes/Probe-FrameworkBuild.ps1`, modelled on `Probe-DotnetTest.ps1`'s
> conventions but scaffolding five net48 projects instead: a legacy non-SDK-style
> `csproj` using `packages.config` (restored via `nuget.exe restore`), the same
> project migrated to `PackageReference` (restored via `msbuild -t:Restore`),
> an SDK-style `csproj`, an ASP.NET 4.x web application, and a legacy-format
> test project driven through `vstest.console.exe` directly — each with a
> deliberate build warning and six passing / two failing tests.
>
> Measure the six items listed under Phase 5's "Must measure," with stdout and
> stderr captured separately via `Start-Process`, never `2>&1`. Report restore
> output volume separately from build output volume for both restore paths —
> do not fold restore into the build number. Do not assume the VSTest
> zero-tests-ran finding from `dotnet-test-runner-findings.md` §5 carries over
> to `vstest.console.exe` run directly — retest it.
>
> Write findings to `docs/framework-build-findings.md` and evidence to
> `probes/evidence/`. Do not add `msbuild` or `vstest.console` to
> `Invoke-QuietDotnet.ps1`'s flag map in this phase — routing them in is
> follow-on work, blocked on this phase's evidence existing first.

---

### Phase 6 — Publication

**Status: done.** The `planning` plugin was removed from the catalog (it
shipped one skill file and never grew beyond that). `Probe-Net60Vstest.ps1`
has run — `Microsoft.NET.Test.Sdk` 17.11.1 or older builds and runs net6.0
VSTest correctly without `SuppressTfmSupportBuildErrors`; 17.14.1 fails to
build outright, and the suppression switch just moves that failure to
test-execution time instead of fixing it
(`dotnet-test-runner-findings.md` §13). The supported TFM range is now
stated in the top-level `README.md`: net8.0/net10.0 fully covered, net6.0
conditional on the `Test.Sdk` pin, net7.0/net9.0 unverified, Framework 4.x
measured (Phase 5) but not yet routed into the hook — that gap is Phase 7.

---

### Phase 7 — Route the Framework tier into the routing table

**Status: done.**

**Goal.** Give `msbuild.exe` and `vstest.console.exe` invocations the same
quiet treatment `dotnet build`/`dotnet test` already get, using the evidence
Phase 5 produced. Framework MSBuild accepted every quiet-flag candidate
tested with zero rejections, both `-` and `/` forms
(`framework-build-findings.md` §2), so the build-side rewrite is a
straightforward flag-map entry. `vstest.console.exe` needs a wrapper
mirroring the Phase 4 `dotnet test` dispatch, because its exit-code and
zero-tests-ran behaviour — confirmed directly against `vstest.console.exe`,
not inferred from the CLI tier (§5) — matches the contract §5.4 already
implements, except for one new wrinkle: a packages.config project can
silently fail to wire up its test adapter and still exit 0.

**Design.**
- `msbuild`/`msbuild.exe` join `CommandSegmentation`'s flag map with
  `-nologo -tl:off -v:q -clp:"ErrorsOnly;Summary;ShowProjectFile=false"`
  (quoted per §8). These are bare command names, not `dotnet <verb>`
  subcommands — confirm the segmenter's prefix matching handles a top-level
  command correctly before assuming it does. Standardise on the `-` flag
  form in the emitted rewrite; do not attempt to detect and preserve the
  caller's `-`/`/` style, even though Phase 5 confirmed MSBuild accepts both.
- `vstest.console`/`vstest.console.exe` dispatch (via `Add-CommandDispatch`,
  the same mechanism Phase 4 used for `dotnet test`) to a new
  `Invoke-QuietVstestConsole.ps1`, reusing §5.4's `TEST PASS|FAIL|NONE|UNKNOWN`
  exit-code contract unchanged.
- **The wrapper's zero-tests-ran detection must catch a third signal.**
  Beyond "exit 0 with no summary line" (the standard case), a
  packages.config test project can return exit 0 with `No test is
  available ... Make sure that test discoverer & executors are registered`
  (`framework-build-findings.md` §5) — restore fetched the packages but
  never wired the MSTest adapter the way `PackageReference` restore does.
  Both signatures mean zero tests ran despite exit 0 and must both
  normalise to `TEST NONE`.
- **Do not resolve `msbuild.exe`/`vstest.console.exe` via `vswhere.exe`
  inside the hook.** That is how this repo's own probes locate the binaries
  to measure them; the rewrite only edits the command string the user's
  shell will run. If `msbuild`/`vstest.console` doesn't resolve on the
  user's `PATH`, that is equally true with or without the rewrite
  (`framework-build-findings.md` §1) — not something the hook can or should
  fix.
- Do not pass `-PackagesDirectory` or any other restore-specific flag into
  the build/test rewrite. Restore is a separate invocation the hook does
  not orchestrate; §4's restore-volume findings inform documentation, not
  the rewrite contract.

**Must not do:**
- Must not claim ASP.NET 4.x Web Application Projects build cleanly —
  `proj4_web` failed with `MSB4019` in every scenario Phase 5 measured
  (`framework-build-findings.md` §3), because the resolved MSBuild lacks the
  web workload's targets. Adding quiet flags to a command that already
  fails for an unrelated reason is not a bug, but the flag-map entry should
  carry a one-line comment saying so, so a future reader doesn't mistake it
  for this plugin's own limitation.

**Acceptance.**
- New `CommandSegmentation.Tests.ps1` vectors: bare `msbuild foo.sln`,
  `msbuild.exe foo.sln -t:Restore` (must **not** receive build flags — restore
  is a distinct verb, the same way `dotnet build` and `dotnet test` already
  diverge), `vstest.console.exe foo.dll` dispatching to the new wrapper, and
  at least one compound command mixing a `dotnet build` segment with a bare
  `msbuild` segment.
- A new (or extended) Pester suite for the vstest.console wrapper covering
  pass, fail, zero-match-by-filter, and the packages.config
  no-adapter-registered case, each asserting the correct normalised
  `TEST *` line.
- §5.3's flag table gains `msbuild`/`vstest.console` rows; the "deliberately
  not in the routing table" paragraph is removed or rewritten to say they
  are now routed.
- `./scripts/Sync-Shared.ps1 -Check` — in sync.

**Prompt.**

> Read `docs/denoizinator-net-spec.md` §5.3, §5.4, and §6 Phase 7, and
> `docs/framework-build-findings.md` in full.
>
> Add `msbuild`/`msbuild.exe` to `CommandSegmentation`'s flag map with
> `-nologo -tl:off -v:q -clp:"ErrorsOnly;Summary;ShowProjectFile=false"`
> (quoted per spec §8). Add `vstest.console`/`vstest.console.exe` as a
> dispatch entry (`Add-CommandDispatch`, same mechanism Phase 4 used for
> `dotnet test`) pointing at a new `Invoke-QuietVstestConsole.ps1`, reusing
> §5.4's `TEST PASS|FAIL|NONE|UNKNOWN` exit-code contract.
>
> The wrapper's zero-tests-ran detection must catch two distinct signals,
> not just one: absence of a `Total tests:` summary line (the standard
> case), and the packages.config "No test is available ... discoverer &
> executors are registered" message (`framework-build-findings.md` §5) —
> both mean zero tests ran despite exit 0, and both must normalise to
> `TEST NONE`.
>
> Write new test vectors in `tests/CommandSegmentation.Tests.ps1` for bare
> `msbuild`/`msbuild.exe` invocations, and a new or extended Pester suite for
> the vstest.console wrapper covering pass, fail, zero-match, and the
> packages.config adapter-missing case. Update §5.3 to reflect that
> `msbuild`/`vstest.console` are now routed, and run `Sync-Shared.ps1`.
>
> Do not attempt to resolve `msbuild.exe`/`vstest.console.exe` via
> `vswhere.exe` inside the hook — that's a probe-only concern, not the
> rewrite's job (`framework-build-findings.md` §1).

---

### Phase 8 — xunit.v3-MTP quiet-progress investigation

**Status: done.** `-reporter silent -noLogo -result-trx <path>` (xunit.v3's
own CLI, not the generic MTP flags) works; wired into `Invoke-QuietDotnetTest.ps1`
and `DotnetTestRunner.psm1`. See `dotnet-test-runner-findings.md` §14.

**Goal.** `dotnet test` on xunit.v3-MTP currently passes through unrewritten
(§5.4's passthrough contract, an explicit scope cut from Phase 4) because
every progress-suppression flag measured so far is rejected (`--no-progress`,
`--progress off` — `dotnet-test-runner-findings.md` §12) and its own baseline
exit code (1) doesn't match the other MTP runners' convention (2 for
failures) — both unexplained. This phase either finds a flag that works or
documents definitively that none currently exists, so the gap stops being an
open question and becomes a recorded limitation.

**Deliverables.** `probes/Probe-Xunit3MtpProgress.ps1`, scaffolding (or
reusing, via `Probe-DotnetTest.ps1 -KeepArtifacts`) an `x_mtp_xunit3`
project, testing a wider candidate set than the two MTP-wide flags already
known to fail: xunit.v3's own CLI surface, environment variables its console
runner documents, `.runsettings`-based suppression, and MSBuild `-p:`
properties. Every candidate measured with stdout/stderr captured separately
via `Start-Process`, per the measurement-discipline rule.

**Must measure:**
- Whether any candidate flag suppresses xunit.v3-MTP's progress output
  without being rejected (its known rejection signature is exit 3, "unknown
  option").
- The exit-code mismatch itself: confirm whether xunit.v3-MTP's exit-1
  baseline (instead of the other MTP runners' exit-2) holds across pass,
  fail, and zero-tests scenarios, or was specific to the one case measured
  in Phase 4 — and if stable, document the mapping the wrapper needs.

**Acceptance.**
- If a working flag is found: `docs/dotnet-test-runner-findings.md` gains a
  section documenting it, `Invoke-QuietDotnetTest.ps1` picks it for
  xunit.v3-MTP instead of falling through to passthrough, and §5.4's
  xunit.v3-MTP passthrough carve-out is removed.
- If no working flag exists: the findings section documents every candidate
  tried and why each failed, §5.4's passthrough carve-out stays but its
  comment is updated to cite this phase's evidence instead of leaving the
  gap unexplained, and the exit-code mismatch is at least characterised even
  if not resolved.
- Evidence to `probes/evidence/`, following the existing discipline.

**Prompt.**

> Read `docs/denoizinator-net-spec.md` §5.4 and §6 Phase 8, and
> `docs/dotnet-test-runner-findings.md` §10 item 6 and §12.
>
> Write `probes/Probe-Xunit3MtpProgress.ps1`. Reuse `x_mtp_xunit3` from
> `Probe-DotnetTest.ps1 -KeepArtifacts` if present, scaffold it fresh
> otherwise. Try a wider candidate set than `--no-progress`/`--progress off`
> (both already confirmed rejected) — xunit.v3's own CLI flags, environment
> variables, `.runsettings`, and MSBuild `-p:` properties. Also re-measure
> baseline pass/fail/zero-tests exit codes to confirm or correct the
> exit-1-not-2 anomaly noted in §10 item 6.
>
> Capture stdout/stderr separately via `Start-Process`, never `2>&1`.
>
> If a working quiet flag is found, wire it into
> `Invoke-QuietDotnetTest.ps1`'s runner+TFM flag selection and remove
> xunit.v3-MTP's passthrough carve-out in §5.4. If none is found, document
> every candidate and its failure mode, and update §5.4's comment to cite
> this phase instead of leaving it as an open unknown.

---

## 7. Open questions

| Question | Blocks | Where |
|---|---|---|
| Does xunit.v3-MTP have any working quiet-progress flag at all? | Phase 8 | `Probe-Xunit3MtpProgress.ps1` |
| Behaviour on macOS and Linux | non-Windows support (out of scope this version, §2) | unscheduled |

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
- **Any flag value containing `;`, `|`, `&`, or `<`/`>` must be quoted in the
  emitted rewrite**, because the rewritten string is executed by a shell —
  confirmed by hand: `-clp:ErrorsOnly;Summary;ShowProjectFile=false` emitted
  unquoted gets split by Bash at the first `;`, truncating the flag and
  spawning `Summary` as a separate, failing command. `.rsp` files and
  PowerShell argument arrays do **not** need this — each line or array element
  is one token by construction, with no shell re-parsing the string — which is
  why a measurement taken through those paths does not transfer to a rewrite
  emitted here. See `tests/Invoke-QuietDotnet.Tests.ps1`'s Bash round-trip
  test, which drives the real emitted string through a real shell rather than
  asserting against the segmenter's own understanding of itself.
