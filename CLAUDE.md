# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code plugin marketplace (`timschreiber`). It publishes one plugin —
`denoizinator-net` — cataloged in `.claude-plugin/marketplace.json`: a
`PreToolUse` hook that rewrites `dotnet`/`msbuild` commands in-flight to add
quiet flags, so verbose build/test output never enters Claude's context. Java
tooling (`denoizinator-java`) and the `planning` plugin were both removed from
scope; `shared/denoizinator-core/` remains the source of truth for
cross-plugin code even with one consumer, since the vendoring pattern and its
CI drift check are what enforce the no-`../` constraint (C5).

**Read `docs/denoizinator-net-spec.md` before touching `denoizinator-net` or
`shared/`.** It is the execution spec: phases, acceptance criteria, and hard
constraints (below). `docs/README.md` indexes the other findings docs, each
backed by an evidence file in `probes/evidence/`. Do not add a claim to a
findings doc without adding the evidence file behind it.

## Commands

```powershell
# Validate the marketplace catalog + every plugin's manifest (does NOT check
# skill/agent/command frontmatter or hooks.json syntax unless pointed at a
# plugin dir directly -- Validate-All.ps1 does that for you)
./scripts/Validate-All.ps1

# Just the shared-asset drift check (shared/ -> plugins/*/scripts/vendor/)
./scripts/Sync-Shared.ps1 -Check
./scripts/Sync-Shared.ps1          # re-sync after editing shared/

# Run the rewriter's unit tests (pure PowerShell, no .NET needed)
Invoke-Pester ./tests/CommandSegmentation.Tests.ps1

# Scaffold a new plugin
./scripts/New-Plugin.ps1 -Name denoizinator-python `
                         -DisplayName 'Denoizinator for Python' `
                         -Description 'Quiets pytest and pip output.'

# Load a plugin directly for manual testing, without installing
claude --plugin-dir ./plugins/denoizinator-net
# after editing plugin files, reload without restarting:
/reload-plugins
```

CI (`.github/workflows/validate.yml`) runs `claude plugin validate .`, validates
each `plugins/*/` directory, and runs `Sync-Shared.ps1 -Check`. It does not run
Pester — run `CommandSegmentation.Tests.ps1` yourself before pushing changes to
the segmenter.

There is no build step; plugins are PowerShell scripts + JSON/Markdown consumed
directly by Claude Code.

## Architecture

### Plugin distribution model

Installed plugins are copied verbatim into `~/.claude/plugins/cache` — nothing
outside a plugin's own directory is reachable at runtime, and nothing is ever
written into a consuming repository (no `.rsp`, no `global.json`, no committed
config). Consequences that shape everything else here:

- **`shared/denoizinator-core/` is the source of truth** for code used by more
  than one plugin. `scripts/Sync-Shared.ps1` copies it into each plugin's
  `scripts/vendor/`; the vendored copies are committed, and CI fails the build
  on drift. Runtime code imports the vendored copy, never `shared/` directly.
  Edit `shared/`, then run `Sync-Shared.ps1`, then commit both.
- **Do not iterate via local marketplace install** — that only exercises the
  cached copy, not your edits. Use `claude --plugin-dir ./plugins/<name>` plus
  `/reload-plugins` for the inner loop; local marketplace install
  (`claude plugin marketplace add .`) is the integration test.
- **No `version` field** in any `plugin.json` or catalog entry. Claude Code
  falls back to the commit SHA, so every push reaches users immediately.
  Setting it in `plugin.json` would pin installs and silently mask the catalog.
  `claude plugin validate` warns about this on every plugin — expected, ignore it.
- **`name` is permanent** (install identifier + skill namespace); rename only
  via an append-only `renames` map in `marketplace.json`. `displayName` is UI
  text and safe to change freely.
- **Kebab-case names only** — the claude.ai marketplace sync and Claude
  Desktop's managed sync reject or silently drop non-conforming names.

### The Denoizinator hook design (denoizinator-net)

One `PreToolUse` handler per plugin, matched on `matcher: "Bash"` with **no**
`if` filter — filtering happens inside the script instead. This is deliberate,
not incomplete: Claude Code runs *every* matching handler on a tool call (not
first-match-wins), and when two handlers both return `updatedInput` for the
same call, the later one silently discards the earlier one's rewrite. A second
filtered handler for `dotnet test` alongside one for `dotnet build` would lose
half the rewrite on `dotnet build && dotnet test`. So: exactly one handler per
plugin, unfiltered, doing all matching itself.

Pipeline per tool call:

```
Bash("dotnet build && dotnet test")
  -> PreToolUse: Invoke-QuietDotnet.ps1 (unfiltered, fires on every Bash call)
       -> fast-reject if the raw payload has no build-ish substring
          (must be cheap -- this path runs on every Bash call in the session)
       -> quote-aware segmentation of the command into top-level pieces
          (respects &&, |, subshells, redirects; ignores &&/| inside quotes)
       -> per-segment, per-prefix flag insertion (dotnet build gets build
          flags, dotnet test gets test flags -- a shared flag string is wrong,
          e.g. -clp on a test command is an error, not a no-op)
       -> flags land before the first redirect / bare `--`, after any leading
          VAR=value assignments
       -> emit {"hookSpecificOutput": {"updatedInput": ...}}, or emit nothing
          if the command didn't change
  -> Claude Code runs the rewritten command; Claude sees the quiet output
```

Non-negotiable rules for this hook (violate any of these and the whole
mechanism breaks silently, not loudly):

- Never set `permissionDecision` at all — `updatedInput` alone is honored, and
  setting `"allow"` would bypass the permission prompt for every future build
  as an unwanted side effect.
- Never set `permissionDecision: "deny"` on uncertainty — a denial costs a
  full turn plus permanent context growth from both the denial and the retry,
  more expensive than the verbose output it would have saved. On any doubt,
  emit nothing and let the command run unchanged.
- Never throw. Any error -> emit nothing, exit 0. Debug logging only behind
  `DNZ_DEBUG`, to a temp file, never to stdout.
- A build/test invoked through another interpreter (`pwsh -c "dotnet build"`,
  `npm run build`, Makefiles, `nx`, `cake`) is invisible to the hook and stays
  verbose. This is permanent, documented scope, not a bug to fix.

### Test-runner behavior the hook design depends on

From `docs/dotnet-test-runner-findings.md` (207 measured runs) — the runner
must be identified *before* interpreting the exit code, because the same code
means different things per runner:

- Exit 1 means "tests failed" under VSTest but "infrastructure error" under
  MTP (Microsoft.Testing.Platform). MTP's "nothing failed" signal is exit 9;
  MTP failures return exit 2.
- VSTest returns exit 0 with **no summary line** when zero tests ran — so
  zero-tests-ran must be detected by absence of a summary line in the output,
  never by exit code.
- `--report-trx` is rejected by NUnit-MTP and xunit.v3-MTP with exit 5 and
  zero tests run — passing that flag to those runners turns a passing suite
  into a silent no-op.
- net6.0 bridges MTP to VSTest; net8.0 and net10.0 do not.

### Repo layout

```
.claude-plugin/marketplace.json   # the catalog (repo root, not inside plugins/)
.claude/settings.json             # this repo dogfoods its own marketplace
plugins/<name>/
  .claude-plugin/plugin.json
  scripts/vendor/                 # generated from shared/ -- do not hand-edit
  assets/                         # templates shipped TO consuming repos
shared/denoizinator-core/         # source of truth for cross-plugin code
probes/                           # dev-time measurement scripts; nothing here ships.
                                  # every claim in docs/ traces to probes/evidence/
docs/                              # spec + measured findings, see docs/README.md
```

## Working on this repo

- Follow `docs/denoizinator-net-spec.md` §6 phase-by-phase; each phase has its
  own acceptance criteria and a ready-to-use execution prompt. Don't jump
  ahead — later phases are blocked on specific unrun probes (see the spec's
  §7 open questions table).
- **Commit and push after each successful phase.** A phase is successful when
  its code works and its tests pass (its acceptance criteria are met). Don't
  batch multiple phases into one commit, and don't leave a successful phase
  uncommitted while starting the next one.
- Don't change `CommandSegmentation.psm1`'s matching algorithm without adding
  a new test vector first — it's currently verified against a fixed vector
  set and any regression there is a silent no-op in production (a build runs
  unquieted, with no error).
- When a probe or hook change touches build/test *output volume*, capture
  stdout and stderr separately. A prior probe run nearly mis-recorded a
  PowerShell `2>&1`-wrapped stderr warning as runner output.
