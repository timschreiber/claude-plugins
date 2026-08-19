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

Re-measure with `--progress off` before drawing any conclusion about MTP quiet flags.

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

MTP        <bin>/<name>.exe --progress off
           211 chars passing, ~1075 with 2 failures. Failure detail inline.
           0 -> PASS · 2 -> FAIL · 8 -> zero tests · 9 -> below minimum
           xunit.v3: 1 -> FAIL, and it rejects --progress-family flags entirely
           Do NOT add --report-trx on NUnit-MTP or xunit.v3-MTP (exit 5, zero tests)
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

1. **`--progress off`** — the documented replacement for `--no-progress`. Not yet
   measured. Re-run the MTP exe cases with it; the current `exe-quiet` numbers are
   contaminated by the deprecation warning.
2. **`--minimum-expected-tests 1` as a blanket default** — would fail legitimately
   empty placeholder test projects.
3. **net6.0 against the real 6.0 runtime** — these results used `RollForward`.
   Whether the bridge behavior survives on the genuine runtime is untested.
4. **net6.0 VSTest** — never built, so it has no row anywhere in this document.
   Needs an older `Test.Sdk` pin or `SuppressTfmSupportBuildErrors`.
5. **Framework 4.8 / `vstest.console.exe`** — deliberately out of scope for this
   probe; measured separately.

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
