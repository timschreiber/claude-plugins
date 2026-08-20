# claude-plugins

Claude Code plugins by Tim Schreiber.

## denoizinator-net

![denoizinator-net](docs/images/denoizinator-doof.webp)

Strip the noise. Keep the signal. `denoizinator-net` keeps low-value MSBuild
and test output out of Claude's context, so more of the context window stays
available for actual work.

### Install

```bash
claude plugin marketplace add timschreiber/claude-plugins
claude plugin install denoizinator-net@timschreiber
```

For a large checkout, limit it to the directories that carry plugin content:

```bash
claude plugin marketplace add timschreiber/claude-plugins --sparse .claude-plugin plugins
```

Nothing further to configure — once installed, it runs automatically on
every matching command in every session.

### What it does

A single hook watches every command Claude is about to run and rewrites
`dotnet`/`msbuild` invocations in place before they execute, so the rewrite
is invisible to you, to CI, and to Visual Studio (nothing is ever written
into your repository — no `.rsp` file, no `global.json`, no config).

**Build commands get quiet flags appended:**

- `dotnet build`, `dotnet msbuild`, `dotnet run`
- bare `msbuild` / `msbuild.exe` (.NET Framework's own MSBuild, not the
  `dotnet` CLI)

`-t:Restore`/`/t:Restore` invocations are left alone — restore output isn't
the noisy part.

**Test commands are dispatched to a wrapper that normalizes the output**
instead of just quieting it, because a single quiet flag is wrong across
test runners — VSTest and Microsoft.Testing.Platform (MSTest/NUnit/xunit.v3)
disagree on flags, exit codes, and output shape. The wrapper picks
runner-safe flags at runtime and always prints the same shape regardless of
what actually ran underneath:

```
TEST PASS | 42 passed | 0 skipped | 0.6s
TEST FAIL | 37 passed | 5 failed | 0.6s | .dnz\test.trx
  ProgramTests.DoCopy_CopiesFiles — FileNotFoundException: Newtonsoft.Json 8.0.0.0
  [+4 more]
TEST NONE | 0 tests ran | filter matched nothing
```

Covered: `dotnet test`, and `vstest.console`/`vstest.console.exe` (.NET
Framework's direct test runner).

### Supported frameworks and runners

Measured, not assumed — every claim below traces to a probe and an evidence
file in `probes/evidence/`; see `docs/dotnet-test-runner-findings.md` and
`docs/framework-build-findings.md`.

- **net8.0 and net10.0** — both VSTest and Microsoft.Testing.Platform
  (MSTest, NUnit, xunit.v3), fully covered.
- **net6.0** — VSTest works, but only with `Microsoft.NET.Test.Sdk` pinned to
  17.11.1 or older; the latest Test.Sdk major does not build on net6.0 at
  all. MTP projects on net6.0 silently bridge to VSTest rather than running
  as MTP.
- **net7.0 and net9.0** were not separately measured (both out of support,
  excluded from the probe matrix) — behavior there is unverified.
- **.NET Framework (net48)** — `MSBuild.exe` and `vstest.console.exe` are
  routed and quieted. An ASP.NET 4.x Web Application Project fails to build
  with `MSB4019` regardless of these flags — that's a missing VS workload on
  the build machine, unrelated to this plugin.

### What it does not do

- **Builds run through another interpreter are invisible to it, and stay
  verbose — permanently, by design.** The hook only ever sees the literal
  Bash command string Claude is about to run; it can't see through a
  wrapping shell or script without executing it first:
  - `pwsh -c "dotnet build"`, `pwsh -NoProfile -Command dotnet build`
  - `npm run build`, or any package-manager script that shells out
  - Makefiles, `nx`, `cake`, and similar wrappers
- **It doesn't make anything build or run faster.** It only reduces how much
  output volume reaches Claude's context — the `pwsh` launch itself adds
  roughly 300ms of overhead to every matching Bash call, which this plugin
  accepts as the cost of quieter output, not something it optimizes away.
- **Windows only, this version.** Everything here is measured on Windows +
  PowerShell 7. Non-Windows behavior is unmeasured and unscheduled.
- No IDE integration, no Roslyn analysis, no persistent background process —
  it's a stateless per-command rewrite.

### Known limitations

- **xunit.v3-MTP is quieted only when you don't pass extra `dotnet test`
  args of your own** (`--filter`, etc.). xunit.v3's own CLI is a different
  syntax entirely from the generic `dotnet test`/MTP flags every other
  runner here understands, so a command with extra args falls back to
  running unmodified rather than risk misinterpreting them.
- **Requires PowerShell 7+ (`pwsh`) on `PATH`.** The hook shells out to it
  directly; if it's missing, the hook silently does nothing and the original
  command runs verbose.
- **`packages.config` projects can fail to wire up their test adapter
  silently** (a NuGet restore quirk, not something this plugin causes). The
  wrapper catches this and reports `TEST NONE` rather than a false pass, but
  there's no fix for the underlying adapter-wiring gap.
- **MSBuild's `-tl:off` flag was verified against MSBuild 18.7.8 (Visual
  Studio 2026)** for the Framework tier; older VS2019/2022-era toolchains
  were not separately confirmed.
- **`claude plugin validate` always warns about a missing `version` field.**
  That's intentional (see `CONTRIBUTING.md`), not a bug.

Found something not listed here? Please open an issue.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for repo layout, the local dev loop,
and the marketplace conventions this repo follows.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Contributions are accepted under the same license, per section 5 of the license.
