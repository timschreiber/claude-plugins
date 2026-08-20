# .NET test runner findings

Derived from `probes/evidence/probe-results.json` — 207 measured runs across 17
scenarios, produced by `probes/Probe-DotnetTest.ps1`
on a Windows machine with the .NET 10 SDK.

Every failing project has **6 passing and 2 failing tests**. Any runner reporting
a failure count other than 2 is lying. All-pass variants have 8 passing.

TFMs: net6.0, net8.0, net10.0 (suffixes `n60`, `n80`, `n100`). The `x_*` scenarios
cover framework variety and run on net10.0 only. Non-net10 projects carry
`<RollForward>LatestMajor</RollForward>`, so they execute on the .NET 10 runtime —
a probe accommodation, not a claim about any real estate.

---

## 1. Headline

**Exit code alone is never sufficient.** The same code means different things
depending on runner, TFM, and whether the project has failing tests. The wrapper
must know which runner it invoked and must check for a summary line.

**`dotnet test` behavior on an MTP project is not uniform across TFMs.** net6.0
silently routes through the VSTest bridge; net8.0 and net10.0 error out.

---

## 2. Build failures are themselves a finding

Only two scenarios failed to build, both net6.0 VSTest:

```
vstest_n60, vstestpass_n60
  Microsoft.NET.Test.Sdk.targets(4,5): error : Microsoft.NET.Test.Sdk doesn't
  support net6.0 and has not been tested with it. Consider upgrading your
  TargetFramework to net8.0 or later.
```

**This is `Microsoft.NET.Test.Sdk` 17.14.1** — the probe already pins net6.0/net7.0
to `17.*` precisely to avoid the 18.x drop, and 17.14.1 errors anyway. Pinning the
major is not a fix. A net6.0 VSTest project needs either an older 17.x pin or
`<SuppressTfmSupportBuildErrors>true</SuppressTfmSupportBuildErrors>`.

MTP net6.0 (`mtp_n60`, `mtppass_n60`) built without complaint. `MSTest` 3.x does
not carry the TFM guard.

---

## 3. Exit-code vocabulary (observed counts across 207 runs)

| Code | Runs | Meaning |
|---|---|---|
| 0 | 52 | success — **or** VSTest zero-tests-ran, **or** xunit.v3-MTP under plain `dotnet test` |
| 1 | 102 | VSTest: tests failed · MTP-on-net8/net10: wrong-runner error · xunit.v3 exe: tests failed · build-FAILED |
| 2 | 33 | MTP: tests failed |
| 3 | 4 | xunit.v3 exe: unknown option (`--no-progress`) |
| 5 | 3 | MTP: option rejected by host → zero tests ran (`--report-trx`) |
| 8 | 7 | MTP: zero tests ran |
| 9 | 6 | MTP: minimum-expected-tests violation |

### Exit 9 only fires when nothing failed

`--minimum-expected-tests 99` against the **failing** projects returns **2**, not 9:

| Scenario | exe-minexpect99 |
|---|---|
| `mtp_n60` / `n80` / `n100` (2 failures) | exit **2** |
| `mtppass_n60` / `n80` / `n100` (all pass) | exit **9** |

Test failure outranks the min-expected policy. A wrapper treating 9 as "the
zero-test signal" will miss every case where tests also failed.

### xunit.v3 has its own table

| Case | Exit |
|---|---|
| `gj-baseline` (MTP via global.json) | 2 — matches MSTest/NUnit |
| `exe-direct` | **1** — where MSTest and NUnit return 2 |
| `exe-*` with `--no-progress` | 3, `error: unknown option: --no-progress` |

---

## 4. Zero-tests-ran: the silent false pass

**Every VSTest configuration** returns exit 0 with **no summary line** when a
filter matches nothing:

| Scenario | exit | summary | chars |
|---|---|---|---|
| `vstest_n80` | 0 | none | 186 |
| `vstest_n100` | 0 | none | 190 |
| `vstestpass_n80` | 0 | none | 194 |
| `vstestpass_n100` | 0 | none | 198 |
| `x_vstest_xunit` | 0 | none | 196 |
| `x_vstest_nunit` | 0 | none | 196 |
| `x_template_mstest` | 0 | none | 202 |
| `mtp_n60` | 0 | none | 180 |
| `mtppass_n60` | 0 | none | 188 |

VSTest has **no `--minimum-expected-tests` equivalent**. Detection must be
*absence of a summary line*.

Note `mtp_n60` and `mtppass_n60` in that table — MTP projects on net6.0 false-pass
too, because they route through the bridge. `mtp_n80` and `mtp_n100` do not; they
return exit 1 with the wrong-runner error before any filter is applied.

### The worst case

`x_mtp_xunit3` under plain `dotnet test` — **0 characters, exit 0**, on `baseline`
and `nologo-vq` alike. No output at all, success exit code, nothing ran. It does
not even emit the wrong-runner error the other MTP projects produce. An agent
seeing this concludes the suite passed.

### MTP handles it properly when actually invoked as MTP

`exe-zerofilter` returns exit **8** with a summary on every MTP scenario
(205–718 chars). `gj-minexpect99` on an all-pass project returns **9**.

---

## 5. Output volume

### VSTest (`vstest_n100` = 2 failures, `vstestpass_n100` = 0 failures)

| Case | 2 failures | 0 failures |
|---|---|---|
| `baseline` | 1251 | 318 |
| `nologo-vq` | **306** | 318 |
| `logger-quiet` | 306 | 318 |
| `logger-minimal` | 1252 | 318 |
| `trx` | 392 | 408 |

**306 chars with 2 failures vs 318 with none.** Quiet output does not grow with
failure count — VSTest quiet emits **counts only**, no failure detail. Detail must
come from the TRX.

`--logger console;verbosity=minimal` is no better than baseline. `-v:q` is what
matters; the console logger adds nothing on top.

`showfail-prop` (`-p:TestingPlatformShowTestsFailure=true`) measured identical to
`nologo-vq` on every scenario — it does nothing through the VSTest path.

### MTP exe (`mtp_n100` = 2 failures, `mtppass_n100` = 0 failures)

| Case | 2 failures | 0 failures |
|---|---|---|
| `exe-direct` | 1075 | **211** |
| `exe-quiet` | 1573 | 712 |

MTP exe-direct carries real failure detail inline — 1075 chars vs VSTest's 306
counts-only. That is a feature, not noise: no TRX round-trip needed.

**`exe-quiet` measuring larger is a probe artifact, not a runner behavior.**
`--no-progress` is deprecated and emits a warning on stderr; PowerShell's `2>&1`
wraps native stderr in a `NativeCommandError` record with a source excerpt and
stack trace, adding ~500 chars per invocation. The warning names its own
replacement:

```
warning: --no-progress is deprecated; use --progress off instead.
```

> **Superseded by §12.** `--progress off` has now been measured with stdout and
> stderr captured separately. It is not a universal replacement — half the MTP
> variants reject it outright, and rejection is far more expensive than either
> flag's warning ever was.

---

## 6. Cross-TFM: the bridge

| Scenario | `baseline` chars | exit | summary | counts |
|---|---|---|---|---|
| `mtp_n60` | 1182 | 1 | yes | `P=6 F=2 S=0 T=8` |
| `mtp_n80` | 467 | 1 | no | — |
| `mtp_n100` | 469 | 1 | no | — |

`mtp_n60` ran. The **`S=0`** is the tell — that is a VSTest-shaped count tuple,
meaning it went through the **VSTest bridge**, not MTP. `n80` and `n100` both
produce the wrong-runner error instead:

```
MTP project + plain dotnet test  → "Testing with VSTest target is no longer
                                    supported ... on .NET 10 SDK and later"
VSTest project + MTP global.json → "All projects must use that test runner"
```

Both exit 1, no tests run. The mutual exclusion is real on net8.0 and net10.0 and
**does not hold on net6.0**.

`mtppass_n60` is worse: exit **0**, 303 chars, summary present, `P=8 F=0 S=0 T=8` —
indistinguishable from a healthy VSTest pass.

---

## 7. TRX

| Runner | TRX | How |
|---|---|---|
| VSTest (any TFM) | yes | `--logger "trx;LogFileName=..."` |
| MSTest-MTP | yes | built in — **no TrxReport package needed** |
| NUnit-MTP | no | `Unknown option '--report-trx'`, exit 5 |
| xunit.v3-MTP | no | exit 5 via `gj-trx`; exit 3 via exe (`--no-progress` rejected first) |

Both exit-5 cases report `P=0 F=0 T=0` — the option is rejected by the host and
**zero tests run**. A wrapper that adds `--report-trx` unconditionally converts a
passing suite into a silent no-op.

---

## 8. Quietest configurations still reporting correct counts

Filtered to runs reporting `P=6 F=2`:

| Scenario | Case | chars | exit |
|---|---|---|---|
| `mtp_n60` | `nologo-vq` | 291 | 1 |
| `vstest_n80` | `nologo-vq` | 300 | 1 |
| `vstest_n100` | `nologo-vq` | 306 | 1 |
| `x_vstest_nunit` | `nologo-vq` | 315 | 1 |
| `x_template_mstest` | `nologo-vq` | 324 | 1 |
| `mtp_n60` | `trx` | 373 | 1 |
| `vstest_n100` | `trx` | 392 | 1 |

`nologo-vq`, `logger-quiet`, and `showfail-prop` are byte-identical throughout.

---

## 9. Wrapper design

```
detect(csproj):
    global.json contains Microsoft.Testing.Platform          -> MTP
    EnableMSTestRunner | EnableNUnitRunner | EnableXunitRunner -> MTP
    PackageReference xunit.v3                                 -> MTP
    PackageReference MSTest (no runner prop)                  -> VSTest
    PackageReference Microsoft.NET.Test.Sdk                   -> VSTest
    non-SDK-style                                             -> Framework
```

```
VSTest     dotnet test <proj> --nologo -v:q \
             --logger "trx;LogFileName=test.trx" --results-directory .dnz
           ~306 chars, counts only.
           exit 0 + NO summary -> TEST NONE      (mandatory check)
           exit 1              -> read TRX for failing names
           exit 0 + summary    -> TEST PASS

MTP        <bin>/<name>.exe <progress-flag, chosen per §12 -- NOT one flag for all>
           net8.0/net10.0 MSTest-MTP: --progress off (211 chars passing, ~1075
             with 2 failures). Failure detail inline.
           net6.0 MSTest-MTP, NUnit-MTP: --progress off is REJECTED (exit 5,
             ~4200 chars of usage dump -- 3-8x worse than doing nothing). Use
             --no-progress instead (deprecated but functional, small stderr
             warning only).
           xunit.v3-MTP: rejects BOTH flags (exit 3, "unknown option") -- its own
             CLI is a different surface entirely. Use -reporter silent -noLogo
             -result-trx <path> instead (0 chars, counts/detail from the TRX) -- §14.
           0 -> PASS · 2 -> FAIL · 8 -> zero tests · 9 -> below minimum
           xunit.v3 (direct-exe invocation only): 0 -> PASS/zero-tests, 1 -> FAIL
             (not 2 -- stable per-invocation-path property, not an anomaly -- §14)
           Do NOT add the GENERIC --report-trx on NUnit-MTP or xunit.v3-MTP (exit 5,
             zero tests); xunit.v3's OWN -result-trx is a different flag and is fine
           Cap inline failure detail at N.

Framework  vstest.console.exe <dll> /logger:"console;verbosity=quiet" \
             /logger:"trx;LogFileName=test.trx" /ResultsDirectory:.dnz
           Counts only. Same zero-test detection as VSTest.
```

Normalised output, identical across all three:

```
TEST PASS | 42 passed | 0 skipped | 0.6s
TEST FAIL | 37 passed | 5 failed | 0.6s | .dnz\test.trx
  ProgramTests.DoCopy_CopiesFiles — FileNotFoundException: Newtonsoft.Json 8.0.0.0
  [+4 more]
TEST NONE | 0 tests ran | filter matched nothing
```

**The wrapper never writes `global.json`.** That is what makes mixed repos work.

Build side is already solved by `Directory.Build.rsp`, covering `msbuild.exe`,
`dotnet build`, `dotnet msbuild`, and `dotnet run`.

> **Superseded.** The `.rsp` approach was dropped: it is a committed repository
> artifact, so it also changes Azure Pipelines output and writes `.dnz/` on build
> agents. Build quieting moved to `PreToolUse` hook injection. See
> `hook-behavior-findings.md`.

---

## 10. Still open

1. ~~`--progress off` — the documented replacement for `--no-progress`.~~
   **Resolved, §12: it is not a universal replacement.**
2. **`--minimum-expected-tests 1` as a blanket default** — would fail legitimately
   empty placeholder test projects.
3. **net6.0 against the real 6.0 runtime** — these results used `RollForward`.
   Whether the bridge behavior survives on the genuine runtime is untested.
4. ~~net6.0 VSTest — never built, so it has no row anywhere in this document.~~
   **Resolved, §13: `Test.Sdk` 17.11.1 or older builds and runs correctly
   without suppression; 17.14.1 fails to build outright, and suppressing that
   failure just moves it to test-execution time instead.**
5. **Framework 4.8 / `vstest.console.exe`** — deliberately out of scope for this
   probe; measured separately (Phase 5).
6. ~~xunit.v3-MTP rejects every progress-suppression flag tried so far
   (`--no-progress`, `--progress off`) and its baseline exit code (1) doesn't
   match the other MTP runners' convention (2 for test failures). Both are
   unexplained — §12. Needs its own targeted probe before this runner gets any
   quiet-flag treatment at all.~~
   **Resolved, §14: `-reporter silent -noLogo -result-trx <path>` (xunit.v3's
   own CLI, unrelated to the rejected generic MTP flags) gives 0 console
   chars in every scenario with full detail from its TRX. The exit-1 baseline
   is a stable property of direct-exe invocation, not an anomaly — routed
   through `dotnet test` via global.json instead, the same fixture returns
   the standard MTP convention (2), but that path was never usable anyway
   since the wrapper never writes global.json.**

---

## 11. Probe bugs found and fixed along the way

- `$Args` collides with a PowerShell automatic variable — every argument array
  arrived empty, producing `Usage: dotnet [path-to-application]`. Renamed `$CmdArgs`.
- `$ErrorActionPreference='Stop'` turns native stderr into a terminating error;
  any command writing to stderr returned the −999 sentinel. `Measure-Run` now sets
  `Continue` for the duration of the call.
- `net48` + file-scoped namespaces → CS8370; needs `<LangVersion>latest</LangVersion>`.
- `EnableNUnitRunner` without `NUnit3TestAdapter` → CS5001, no entry point.
- Latest test packages dropped net6.0, so package versions are pinned per-TFM.
  See §2 — the pin is necessary but not sufficient.
- `Probe-Net60Vstest.ps1`'s `Join-Path $Dir (Split-Path $Dir -Leaf) + '.csproj'`
  — `+` after a command name parses as a literal string argument, not string
  concatenation, so this was really a 4-argument `Join-Path` call producing
  `...\sdk17111\+\.csproj` and a `Could not find a part of the path` error on
  every run. This is why the probe had never successfully executed (§13).
  Fixed by parenthesizing the concatenation:
  `Join-Path $Dir ((Split-Path $Dir -Leaf) + '.csproj')`.

---

## 12. `--progress off` is not a universal MTP replacement

Measured against the same scratch projects `Probe-DotnetTest.ps1` builds, via
`probes/Probe-MtpProgress.ps1`. Evidence: `probes/evidence/mtp-progress-results.json`
— 40 records (8 MTP scenarios × 5 flag sets). stdout and stderr captured to
**separate** files via `Start-Process`, never `2>&1` — this re-measurement exists
specifically because the earlier `exe-quiet` number (§5) was contaminated by
`2>&1` wrapping a stderr deprecation warning into a `NativeCommandError`.

| Scenario | Runner | `none` (baseline) | `--no-progress` | `--progress off` |
|---|---|---|---|---|
| `mtp_n100` | MSTest-MTP, net10.0 | 1530 | 1076 (67-char stderr warning) | **1076** |
| `mtp_n80` | MSTest-MTP, net8.0 | 1524 | 1070 (67-char stderr warning) | **1070** |
| `mtppass_n100` | MSTest-MTP, net10.0, all pass | 665 | 211 (67-char stderr warning) | **211** |
| `mtppass_n80` | MSTest-MTP, net8.0, all pass | 661 | 207 (67-char stderr warning) | **207** |
| `mtp_n60` | MSTest-MTP, net6.0 (RollForward) | 1525 | 1071, no warning | **REJECTED, exit 5, 4225 chars** |
| `mtppass_n60` | MSTest-MTP, net6.0, all pass | 718 | 264, no warning | **REJECTED, exit 5, 4229 chars** |
| `x_mtp_nunit` | NUnit-MTP | 2140 | 1686, no warning | **REJECTED, exit 5, 3492 chars** |
| `x_mtp_xunit3` | xunit.v3-MTP | 1259 (exit 1, not 2 — §10 item 6) | **REJECTED, exit 3, 38 chars** | **REJECTED, exit 3, 35 chars** |

**`--progress off` works cleanly on exactly 4 of 8 scenarios** — MSTest-MTP on
net8.0/net10.0 only. It is rejected outright (exit 5) by MSTest-MTP on net6.0
and by NUnit-MTP, and rejected differently (exit 3, `unknown option`) by
xunit.v3-MTP, which rejects `--no-progress` too — the one flag that otherwise
works everywhere else.

**A rejected flag costs far more than doing nothing.** Rejection doesn't just
fail to quiet the output — MSTest-MTP dumps a full CLI usage/help block on an
unrecognized option: 4225 chars for `mtp_n60`, roughly **4× its own 1525-char
baseline**. NUnit-MTP's rejection dump (3492 chars) is smaller relatively but
still nearly double its 2140-char baseline. xunit.v3-MTP is the exception —
its rejection message is a terse one-liner (35–38 chars), cheaper than
anything else in this table; the risk there isn't cost, it's that nothing
quiets its output at all yet.

**Consequence for the wrapper (§9):** the MTP invocation cannot be one flag.
It must select `--progress off` only for MSTest-MTP on net8.0/net10.0,
`--no-progress` for MSTest-MTP on net6.0 and NUnit-MTP, and something not yet
found for xunit.v3-MTP — emitting the wrong one is actively worse than the
verbose baseline it was trying to quiet, not merely a no-op. This is the same
class of failure `--report-trx` already forced onto NUnit-MTP/xunit.v3-MTP
(§7): a flag that's safe on one runner and a silent-cost trap on another.

---

## 13. net6.0 VSTest: which `Test.Sdk` version builds

Measured via `probes/Probe-Net60Vstest.ps1`. Evidence:
`probes/evidence/net60-vstest-results.json` — 10 records (5
`Microsoft.NET.Test.Sdk` versions × with/without
`SuppressTfmSupportBuildErrors`). No real .NET 6 runtime is installed on the
measuring machine; every row below relies on `RollForward=LatestMajor`
rolling forward to the installed 8.0.11/10.0.9 runtimes — a probe
accommodation (§3 item 3), not evidence about the genuine .NET 6 runtime.

| Test.Sdk | Suppress switch | Builds | Test counts |
|---|---|---|---|
| 17.14.1 | no | **FAILED** — `Microsoft.NET.Test.Sdk doesn't support net6.0` | — |
| 17.11.1 | no | yes | `P=6 F=2 S=0 T=8` (correct) |
| 17.9.0 | no | yes | `P=6 F=2 S=0 T=8` (correct) |
| 17.6.3 | no | yes | `P=6 F=2 S=0 T=8` (correct) |
| 17.3.2 | no | yes | `P=6 F=2 S=0 T=8` (correct) |
| 17.14.1 | yes | yes | **test run aborted** (see below) |
| 17.11.1 | yes | yes | `P=6 F=2 S=0 T=8` (correct) |
| 17.9.0 | yes | yes | `P=6 F=2 S=0 T=8` (correct) |
| 17.6.3 | yes | yes | `P=6 F=2 S=0 T=8` (correct) |
| 17.3.2 | yes | yes | `P=6 F=2 S=0 T=8` (correct) |

**`Test.Sdk` 17.11.1 (and every older version tested, down to 17.3.2) builds
and runs correctly on net6.0 without `SuppressTfmSupportBuildErrors`.** Only
the newest version tested, 17.14.1, fails — its own build error names the
ceiling explicitly: `Microsoft.NET.Test.Sdk doesn't support net6.0 and has
not been tested with it.` net6.0 VSTest is buildable and correctly
countable, but **only with an older, explicitly-pinned `Test.Sdk`** — a
project left on the latest major will not build on net6.0 at all.

**The suppression switch is not a safe substitute for pinning.**
`SuppressTfmSupportBuildErrors=true` makes 17.14.1 *build*, but the test run
then aborts at execution time instead:

```
Testhost process for source(s) '...\sdk17141-suppress.dll' exited with error:
You must install or update .NET to run this application.
Framework: 'Microsoft.NETCore.App', version '6.0.0-preview.0' (x64)
```

The 17.14.1 testhost resolves against `Microsoft.NETCore.App` version
`6.0.0-preview.0` specifically, and `RollForward=LatestMajor` does not roll
forward from a *preview* version identifier the way it does from the older
`Test.Sdk` versions' plain `6.0.0` target — those all built and ran with
correct counts under the identical rollforward setup. Suppressing the build
error trades a loud, correct failure for a silent, later one.

**Consequence for the routing table:** net6.0 VSTest can be claimed as
supported, but only conditionally — the project must pin
`Microsoft.NET.Test.Sdk` to 17.11.1 or older. The routing table cannot
assume "net6.0 + VSTest" always works, since the newest `Test.Sdk` major on
that TFM does not build at all, suppression switch or not.

Resolves §10 item 4.

---

## 14. xunit.v3-MTP: `-reporter silent -noLogo -result-trx <path>` works; the exit-1 baseline is invocation-path-dependent

Measured via `probes/Probe-Xunit3MtpProgress.ps1` against the `x_mtp_xunit3`
project `Probe-DotnetTest.ps1` builds (6 passing, 2 failing `[Fact]`s).
Evidence: `probes/evidence/xunit3-mtp-progress-results.json` — 16 records
(1 `--help` capture, 6 candidate rows against the failing fixture, 3
explicit not-applicable rows, 6 invocation-path × scenario rows). stdout and
stderr captured to **separate** streams throughout — the exe via
`Start-Process`, `dotnet test` the same way — never `2>&1`.

### `--no-progress`/`--progress off` are the wrong flag syntax, not merely unsupported

`x_mtp_xunit3.exe --help` (full text in the evidence file) shows xunit.v3's
own "In-Process Runner" has an entirely different CLI surface from the
generic `Microsoft.Testing.Platform` flags every other MTP framework in this
repo (MSTest-MTP, NUnit-MTP) understands: single-dash (`-reporter`, `-noLogo`,
`-filter`, `-method`, ...), not double-dash. `--no-progress`/`--progress off`
were never almost-right — they are simply not this runner's syntax, which is
why they fail with `error: unknown option: ...` (exit 3) rather than being
silently ignored or producing a usage dump the way MSTest-MTP/NUnit-MTP
reject an unsupported flag (§12).

### Candidate matrix (against the failing fixture, direct exe invocation)

| Candidate | Args | Exit | stdout | stderr |
|---|---|---|---|---|
| `none` (baseline) | — | 1 | 1259 | 0 |
| `no-progress` | `--no-progress --no-ansi` | **REJECTED, exit 3** | 38 | 0 |
| `progress-off` | `--progress off --no-ansi` | **REJECTED, exit 3** | 35 | 0 |
| `reporter-quiet` | `-reporter quiet -noLogo` | 1 | 879 | 0 |
| `reporter-silent` | `-reporter silent -noLogo` | 1 | **0** | 0 |
| `reporter-silent-trx` (winner) | `-reporter silent -noLogo -result-trx <path>` | 1 | **0** | 0 |

`-reporter quiet` ("only show failure messages" per `--help`) already cuts
1259→879 chars by dropping the discovery/start/finish progress lines, but
still prints full stack traces per failure **and drops the summary line
entirely** — there is no `Total:`/`Failed:` count left to parse at all in
quiet mode, and `-reporter silent` ("do not show any messages") goes further:
**0 stdout chars in every scenario measured, including the failing one** —
it suppresses even failure detail, so on its own it cannot recover counts or
failure names.

**`-result-trx <path>` (xunit.v3's own result-file flag, unrelated to the
generic `--report-trx` §7 already documents as rejected by this runner)
solves this.** It writes a TRX using the exact same schema and
`<ResultSummary><Counters total=... passed=... failed=.../>` shape VSTest's
own TRX uses (confirmed: `DotnetTestRunner.psm1`'s existing
`ConvertFrom-VSTestTrx` parses it with no changes — each `<UnitTestResult>`
carries a `testName` attribute directly, so the function's `TestDefinitions`
fallback path already handles it). Combined with `-reporter silent`, console
output stays at 0 chars in every scenario while the TRX carries full counts
and per-failure detail:

| Scenario | stdout | TRX total/passed/failed |
|---|---|---|
| fail (2 failing) | 0 | 8 / 6 / 2 |
| pass (filtered to passing only) | 0 | 6 / 6 / 0 |
| zero (filter matches nothing) | 0 | 0 / 0 / 0 |

**This also resolves the zero-tests-ran ambiguity for free.** VSTest's
zero-tests-ran case must be inferred from an *absent* summary line (§4) —
there's nothing else to key off. xunit.v3's `-result-trx` always writes a
TRX with an accurate `total`, including `total="0"`, so zero-tests-ran is a
direct read of the same file that already carries pass/fail counts, not a
separate absence-based heuristic.

### Other candidate kinds: not applicable

- **Environment variables** — `--help`'s full text (in the evidence file)
  documents no environment variable for progress or reporter selection.
- **`.runsettings`** — `--help` shows no `-settings`/`--settings` flag;
  `.runsettings` is a VSTest-adapter concept the in-process runner does not
  read.
- **MSBuild `-p:` properties** — reporter/result-file selection is an
  in-process-runner CLI concern evaluated at test-run time, not an
  MSBuild-evaluated property; no relevant `-p:` switch exists for it.

These are recorded as explicit not-applicable rows in the evidence file
rather than silently skipped, since the CLI surface alone already yields a
complete, correct solution — the wider search was not abandoned, it
terminated because the first candidate kind checked (xunit.v3's own CLI)
fully solved the problem.

### The exit-1-vs-2 anomaly: invocation-path-dependent, not a runner property

| Invocation path | fail | pass | zero |
|---|---|---|---|
| `exe-direct` (direct exe — what the wrapper actually uses) | **1** | 0 | 0 |
| `gj-dotnet-test` (`dotnet test --project` under a temporary `global.json`) | **2** | 0 | 8 |

Direct exe invocation is stable at exit 1 for a failing run across the
scenarios measured — not the anomaly `x_mtp_xunit3`'s single Phase-4
data point looked like; it is simply what this invocation path always
returns. Routed through `dotnet test`'s "new test experience" instead
(global.json naming the MTP runner), the same fixture returns the
standard MTP convention (0/2/8) and switches to the generic
`total:/failed:/succeeded:/skipped:` summary shape (1543 chars for the
failing case) — a completely different code path from the in-process
runner's own reporter, which explains both the exit-code and the
output-shape divergence in one stroke.

This is moot for the wrapper's own design, not merely academic: **the
wrapper never writes `global.json`** (denoizinator-net-spec.md §5.4), so
`gj-dotnet-test` was never a usable implementation path regardless of its
exit codes — direct exe invocation is the only one the "genuine MTP, no
global.json" recipe (§9) permits, and that path's exit code is 1-for-fail,
stable.

### Consequence for the wrapper

`Get-DotnetTestInvocationPlan` (`DotnetTestRunner.psm1`) now returns a
dedicated `OutputShape = 'XunitV3'` plan for xunit.v3-MTP:
`InvokeVia = 'Executable'`, `AdditionalArgs = @('-reporter', 'silent',
'-noLogo', '-result-trx', <DnzDir>/xunit3.trx)`, `UsesTrx = $true`. A new
`Get-XunitV3Outcome` classifies Pass/Fail/None purely from the TRX's
`total`/`failed` counters (never stdout, which is always empty) and is
guarded two ways against a stale TRX at that deterministic path being
mistaken for the current run: `Invoke-QuietDotnetTest.ps1` deletes any
pre-existing file there before invoking, and only trusts the TRX when the
exe's own exit code is 0 or 1 — anything else (e.g. exit 3, "unknown
option", from a testArgs combination this runner's CLI can't accept)
classifies straight to `TEST UNKNOWN` without reading the TRX at all.

**One narrower carve-out replaces the old blanket one.** xunit.v3's own CLI
cannot accept the generic dotnet-test/`Microsoft.Testing.Platform` double-dash
syntax any user-supplied `testArgs` would be written in — confirmed by hand
that even a well-formed `--filter "..."` is rejected outright (exit 3), not
silently ignored, which would otherwise have looked like "0 passed / 0
failed" against a stale or absent TRX. So `Invoke-QuietDotnetTest.ps1` now
normalises xunit.v3-MTP **only when the user supplies no extra test-host
args**; if they do, it falls back to passthrough (`TEST RAW`), the same
"can't confidently normalise" contract §5.4 already applies to `--logger`/
`--results-directory`/`--report-trx`/bare `--`, just scoped to this one
runner instead of applying to it unconditionally.

Resolves §10 item 6.
