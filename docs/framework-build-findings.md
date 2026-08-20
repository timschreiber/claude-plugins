# Framework build findings

Derived from `probes/evidence/framework-build-results.json` — 100 records
(3 tool-resolution, 9 restore, 74 build, 14 test), produced by
`probes/Probe-FrameworkBuild.ps1` on a Windows machine with Visual Studio 2026
("18") Community installed (MSBuild 18.7.8, VSTest 18.7.0) and the .NET 10
SDK. Every measured project has **6 passing and 2 failing tests** where a test
body applies; any runner reporting a different failure count is lying, same
convention as `dotnet-test-runner-findings.md`.

All output-volume numbers below were captured with stdout and stderr
redirected to **separate** files via `Start-Process`, never `2>&1`, per
`probes/README.md`'s "Measurement discipline" section — the same discipline
`Probe-MtpProgress.ps1` established after `Probe-DotnetTest.ps1` nearly
mis-recorded a stderr wrapper as runner output.

This phase produces evidence only. **No entry was added to
`Invoke-QuietDotnet.ps1`'s flag map** — routing `msbuild`/`vstest.console`
into the hook is follow-on work, per `denoizinator-net-spec.md` §5.3.

---

## 1. Tool resolution

None of `msbuild.exe`, `vstest.console.exe`, or `nuget.exe` resolve via bare
`Get-Command`/PATH outside a Developer Command Prompt — confirmed in both the
Bash tool's git-bash environment and the PowerShell 7 environment probes
actually run under:

| Tool | Resolved via PATH | Resolved via vswhere | Path |
|---|---|---|---|
| `msbuild.exe` | No | Yes | `...\Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe` |
| `vstest.console.exe` | No | Yes | `...\Visual Studio\18\Community\Common7\IDE\CommonExtensions\Microsoft\TestWindow\vstest.console.exe` |
| `nuget.exe` | No | N/A (vswhere doesn't index it) | downloaded to `probes/.tools/nuget.exe` |

**`vswhere.exe`, not PATH, is the only reliable resolution path for
`msbuild.exe`/`vstest.console.exe`.** `vswhere.exe` itself lives at a fixed,
undiscoverable-any-other-way location
(`C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe`) that
any future routing code must hardcode or documented as a prerequisite.

**`nuget.exe` has no discoverable install anywhere on this machine** — no VS
workload bundles it, `vswhere.exe` doesn't index it, and no dotnet SDK path
carries a copy. The probe downloads it on first use from
`https://dist.nuget.org/win-x86-commandline/latest/nuget.exe` into a
gitignored `probes/.tools/nuget.exe` cache and reuses that cache on later
runs (confirmed: `Downloaded=true` on the first run, `Downloaded=false` and
`ResolvedViaPath=false` on the second, reading from cache).

The MSBuild resolved here (18.7.8, "for .NET Framework") is a **modern**
Framework MSBuild shipped with VS 2026, not an archaic one — relevant to
§2 below, since the spec speculated it might predate terminal-logger-era
flags.

---

## 2. MSBuild flag accept/reject matrix

Evidence: `framework-build-results.json`, `Phase='build'` records,
`Case` matching `build-*`, 6 buildable scenarios × 12 flag sets = 72 records.

**Every candidate flag was accepted — 0 rejections across all 72
(scenario × flag-set) combinations, both `-` and `/` forms:**

| Flag set | Rejected in |
|---|---|
| `-nologo` / `/nologo` | 0/6 |
| `-tl:off` / `/tl:off` | 0/6 |
| `-v:q` / `/v:q` / `-verbosity:quiet` | 0/6 |
| `-clp:ErrorsOnly;Summary;ShowProjectFile=false` (both forms) | 0/6 |
| combined `full-quiet` (both forms) | 0/6 |

**`-tl:off` is accepted.** The spec's speculation that Framework MSBuild
"predates the terminal logger" does not hold for this toolchain — VS
2026-era `MSBuild.exe` supports it cleanly. This is worth re-verifying
against an older MSBuild (VS2019/2022-era) before generalizing, since only
one MSBuild version was available to measure here (see §7).

**Output volume drops sharply and is dominated by `-v:q`/`-verbosity:quiet`,
not `-nologo` or `-tl:off` alone** — representative numbers (`proj2_pkgref`,
a clean PackageReference-based build):

| Case | Chars |
|---|---|
| baseline | 71,923 |
| `-nologo` | 973 |
| `-tl:off` | 1,026 |
| `-v:q` | 53 |
| `-clp:ErrorsOnly;Summary;ShowProjectFile=false` | 82 |
| full-quiet (`-nologo -tl:off -v:q -clp:...`) | 66 |

The same shape repeats across every buildable project (`proj1_pkgconfig`,
`proj3_sdk`, `proj5_vstest`, `proj5_vstest_allpass`): baseline in the tens of
thousands of characters (dominated by `csc.exe`'s full response-file dump at
default verbosity — see the raw evidence for the `CoreCompile` target's
argument list), `-v:q` alone collapses it to ~53 chars, and the combined
`full-quiet` set lands at 66 — 2 characters more than `-clp` alone, because
`-clp`'s `Summary` still prints a couple of characters `-v:q` alone omits.
**`-v:q`/`-verbosity:quiet` does essentially all of the work; `-clp` adds a
negligible amount on top.**

`proj4_web` (the web application, which never builds — see §3) shows a flat
~1500→~550 character reduction across flag sets, but every one of those runs
is the same `MSB4019` failure dump, not a real build; not representative of
quiet-flag behavior on a successful build.

---

## 3. Build output volume, baseline vs quiet, per project

Evidence: same `Phase='build'` records as §2, `Case='build-baseline'` vs
`Case='build-full-quiet-dash'`.

| Scenario | Baseline chars | Full-quiet chars | Exit |
|---|---|---|---|
| `proj1_pkgconfig` (packages.config) | 11,014 | 66 | 0 |
| `proj2_pkgref` (PackageReference, legacy) | 71,923 | 66 | 0 |
| `proj3_sdk` (SDK-style net48) | 74,427 | 66 | 0 |
| `proj4_web` (ASP.NET 4.x web app) | 1,571 | 591 | **1 — MSB4019** |
| `proj5_vstest` (legacy vstest test project) | 72,681 | 66 | 0 |
| `proj5_vstest_allpass` | 73,889 | 66 | 0 |

**`proj4_web` fails to build with every flag set**, always with the same
error:

```
error MSB4019: The imported project ".../MSBuild/Current/Bin/Microsoft.WebApplication.targets"
was not found. Confirm that the expression in the Import declaration
"$(MSBuildBinPath)\Microsoft.WebApplication.targets" ... is correct, and
that the file exists on disk.
```

`Microsoft.WebApplication.targets` ships with Visual Studio's **ASP.NET and
web development workload**, not with the base MSBuild binaries — this VS
install has MSBuild and the Test Platform components but not that workload.
This is itself the finding: **a bare `MSBuild.exe` resolution (via vswhere,
as in §1) is not sufficient to build ASP.NET 4.x Web Application Projects**;
routing code that assumes "MSBuild resolved" implies "web apps build" would
be wrong. Confirming `Microsoft.WebApplication.targets` exists (or handling
its absence) is a prerequisite check of its own, separate from resolving
`MSBuild.exe` itself.

**`proj1_pkgconfig`'s baseline (11,014 chars) is much smaller than the other
three successful builds (~72–74K chars)** — because by the time its baseline
build measurement runs, its packages.config restore has already primed
`obj\` state that the PackageReference-based projects' first build still
pays for cold (NuGet asset-file generation, `AssemblyInfo` generation, etc.,
all logged at default verbosity). Not a quiet-flag effect; a build-ordering
artifact of the probe's own sequencing, noted here so it isn't mistaken for
a packages.config-specific noise reduction.

---

## 4. Restore output volume, separate from build

Evidence: `Phase='restore'` records, 9 total — `nuget.exe restore` against
`proj1_pkgconfig` (packages.config), `msbuild -t:Restore` against
`proj2_pkgref`, `proj3_sdk`, `proj5_vstest`, `proj5_vstest_allpass`.

| Scenario | Restore path | Baseline chars | Quiet chars | Exit |
|---|---|---|---|---|
| `proj1_pkgconfig` | `nuget.exe restore -PackagesDirectory ...` | 1,534 | 0 | 0 |
| `proj2_pkgref` | `msbuild -t:Restore` | 2,011 | 0 | 0 |
| `proj3_sdk` | `msbuild -t:Restore` | 2,017 | 0 | 0 |
| `proj5_vstest` | `msbuild -t:Restore` | 2,011 | 0 | 0 |
| `proj5_vstest_allpass` | `msbuild -t:Restore` | 2,115 | (not separately measured) | 0 |

Mean restore `TotalChars` across all 9 records: **1,076**. Mean build
`TotalChars` across all 74 build records (baseline and quiet mixed): 4,668 —
**restore volume and build volume are genuinely different populations, as
the spec requires measuring separately**; restore's mean is lower here
specifically because it's dominated by the already-quiet `restore-quiet`
records (0 chars each), while build's mean mixes in the very large baseline
builds. Comparing baseline-to-baseline instead: `nuget.exe restore`
baseline (1,534 chars) and `msbuild -t:Restore` baseline (~2,011–2,115
chars) are both **far smaller than a baseline build** (11K–74K chars) on
every project measured — restore noise is a minor contributor next to build
noise for these projects, the opposite of the spec's "restore noise may
exceed build noise on a cold cache" hypothesis. This was measured on a warm
NuGet HTTP cache (the `CACHE https://api.nuget.org/...` lines in the raw
restore output confirm cache hits); a genuinely cold cache (first restore
ever on a machine, no `~/.nuget/packages` or HTTP cache) was not measured
and could look different — see §7.

**`-Verbosity quiet -NonInteractive` on `nuget.exe restore` and `-nologo -v:q`
on `msbuild -t:Restore` both collapse restore output to 0 characters on a
warm cache**, with exit 0 preserved in every case.

**A packages.config project needs `-PackagesDirectory` (or a `.sln`
context) for `nuget.exe restore` to work at all** — restoring a bare
`.csproj` without it fails immediately: `Cannot determine the packages
folder to restore NuGet packages. Specify either -PackagesDirectory or
-SolutionDirectory.` This is a real constraint on any future routing of
`nuget.exe restore`, not a probe artifact.

**A packages.config project does not automatically wire up a `vstest`
adapter reference the way `PackageReference` restore does.** `nuget.exe
restore` fetches the packages but does not run the install-time scripts
Visual Studio's Package Manager would (there is no NuGet-generated
`.nuget.g.props`/`.targets` import for a packages.config project the way
there is for `PackageReference` restore) — see the `MSTest.TestAdapter`
discussion in §5.

---

## 5. `vstest.console.exe` exit codes — retest of the zero-tests-ran finding

**Correction to the spec's citation:** `denoizinator-net-spec.md` cites the
zero-tests-ran / silent-false-pass finding as
`dotnet-test-runner-findings.md` "§5" in three places. That finding is
actually **§4, "Zero-tests-ran: the silent false pass"** — §5 in that
document is "Output volume." This doc cites §4 directly below; the spec's
own citations are off by one and worth fixing there separately.

Evidence: `Phase='test'` records, 14 total, `vstest.console.exe` invoked
directly against built DLLs from `proj1_pkgconfig`, `proj2_pkgref`,
`proj3_sdk`, `proj5_vstest`, and `proj5_vstest_allpass`.

| Scenario | Case | Exit | Summary line present? |
|---|---|---|---|
| `proj2_pkgref` | `fail-default` (6p/2f) | **1** | Yes — `Failed! - Failed: 2, Passed: 6, ...` |
| `proj2_pkgref` | `zero-match` (filter matches nothing) | **0** | **No** — only `No test matches the given testcase filter ...` |
| `proj3_sdk` | `fail-default` | 1 | Yes |
| `proj3_sdk` | `zero-match` | **0** | **No** |
| `proj5_vstest` | `fail-default` | 1 | Yes |
| `proj5_vstest` | `zero-match` | **0** | **No** |
| `proj5_vstest_allpass` | `all-pass` (8/8 pass) | 0 | Yes — `Test Run Successful. Total tests: 8 Passed: 8` |
| `proj1_pkgconfig` | `fail-default` | **0** | **No** — `No test is available in ... proj1_pkgconfig.dll` |

**The §4 finding carries over cleanly to `vstest.console.exe` run
directly: exit 0 does not distinguish "all tests passed" from "no tests
ran."** `zero-match` (a `/TestCaseFilter` matching nothing) returns exit 0
with no `Total tests:`/`Passed:`/`Failed:` summary block, identically to the
CLI-path finding — **absence of a summary line, not exit code, is still the
correct zero-tests-ran signal** when driving `vstest.console.exe` directly.

**`proj1_pkgconfig` (the packages.config project) demonstrates an even more
dangerous variant of the same failure mode, with a *different root cause*.**
`fail-default` should show the standard 6-pass/2-fail summary like every
other scenario — instead it returns **exit 0** with:

```
No test is available in ...\proj1_pkgconfig.dll. Make sure that test
discoverer & executors are registered and platform & framework version
settings are appropriate and try again.
```

This is the packages.config adapter-wiring gap from §4 manifesting as a
silent false pass: because `nuget.exe restore` never wired up the
`MSTest.TestAdapter` the way `PackageReference` restore does, `vstest`
cannot discover the tests at all — and still exits 0. An agent or CI script
checking only the exit code would conclude the packages.config-based test
project's suite passed, when in fact **zero tests ran and the adapter isn't
even registered**. This is a distinct trap from the standard zero-match
case (different message, different cause — a broken environment rather than
an over-narrow filter) but an identical exit-code signature, reinforcing
that exit code alone is never sufficient for this tier either.

---

## 6. Solution-level vs per-project invocation

Evidence: `Phase='build'`, `Scenario='solution'` records (`sln-baseline`,
`sln-quiet`), built via a hand-written `FrameworkProbe.sln` bundling
`proj1_pkgconfig`, `proj2_pkgref`, `proj3_sdk`, `proj5_vstest` (`proj4_web`
excluded — its `Microsoft.WebApplication.targets` dependency, absent per
§3, would add nothing but another guaranteed failure to this comparison).

| Case | Chars |
|---|---|
| `sln-baseline` | 4,593 |
| `sln-quiet` (`-nologo -tl:off -v:q`) | **0** |
| sum of the 4 projects' individual `build-full-quiet-dash` runs | 264 |

**Caveat this comparison is not fully apples-to-apples**: because the probe
builds every project individually through the full flag matrix (§2) *before*
building the solution, every project is already in an up-to-date, fully
restored, previously-compiled state by the time the solution build runs.
`sln-baseline`'s 4,593 chars is therefore mostly MSBuild's
"Skipping target ... because all output files are up-to-date" incremental
messages, not a fresh multi-project compile — it is **not** comparable to
the 11K–74K character *first* builds in §3. The `sln-quiet` (0 chars) vs.
per-project-quiet-sum (264 chars) comparison is more apples-to-apples, since
both sides are already-warm incremental rebuilds by that point in the
script, and it shows **no evidence of banner multiplication at solution
scope** — if anything, the solution-level invocation produced *less* total
output than the sum of separately-invoked quiet builds. A genuinely
cold-vs-solution comparison (fresh clone, first build only) was not
measured — see §7.

---

## Still open

- **Only one MSBuild version (18.7.8, VS 2026) was available to measure.**
  The `-tl:off` acceptance finding in §2 should not be generalized to older
  Framework MSBuild (VS2019/2022-era, or genuinely pre-terminal-logger
  toolsets) without separate evidence.
- **Restore was measured on a warm NuGet cache only** (confirmed via the
  `CACHE https://api.nuget.org/...` lines in the raw output). A cold-cache
  restore — the scenario the spec's "restore noise may exceed build noise
  on a cold cache" hypothesis is actually about — was not measured here and
  may show substantially higher restore volume.
- **The solution-vs-per-project comparison in §6 is confounded by build
  order** (see the caveat there) and should be re-run with a genuinely fresh
  scratch tree, building the `.sln` *first*, if a clean cold-build
  comparison is wanted.
- **No entry was added to `Invoke-QuietDotnet.ps1`'s flag map.** Per
  `denoizinator-net-spec.md` §5.3, routing `msbuild`/`vstest.console`
  through the hook — including resolving them via `vswhere.exe` at
  hook-invocation time, which has its own cost/complexity the unfiltered
  fast-reject path (`hook-behavior-findings.md` §12) doesn't currently pay —
  is follow-on work this phase's evidence unblocks but does not itself
  perform.
- **`packages.config` restore's missing adapter wiring (§4, §5) has no
  measured workaround** in this probe (e.g. explicitly importing the
  adapter package's own `.props`/`.targets`, or running `nuget.exe restore`
  against a `.sln` instead of a bare `.csproj`). Worth its own follow-up if
  packages.config test projects are ever brought into scope.
