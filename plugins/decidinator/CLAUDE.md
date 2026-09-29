# CLAUDE.md

Guidance for Claude Code when working in `plugins/decidinator/`. The repo-root
`CLAUDE.md` still applies (distribution model, no `version` field, kebab-case
names, vendoring, commands); this file adds only what is specific to
Decidinator.

## What this plugin is

Decidinator makes Claude research its own questions before asking a person.
Every `AskUserQuestion` call is denied by a `PreToolUse` gate until an oracle
subagent has returned a verdict. Questions the oracle resolves never reach the
user; the rest arrive researched, with options. Each decision is recorded in a
repo-local decision log, and unresolved ones can queue in a sidecar file for
stakeholders (`sidecar` mode) instead of asking (`ask` mode).

It is **unpublished**: it is not in `.claude-plugin/marketplace.json`. Do not add
it to `plugins` (or `_parked`) unless the user asks.

## Read first

The design lives in `docs/decidinator/`; do not restate it here or work from
memory.

- `Decidinator — Specification.md` is the source of truth: lifecycle, ladder,
  file formats, commands, config keys, safety rules.
- `Decidinator — Work Packages.md` indexes WP-01 to WP-10, and each
  `WP-NN · <title>.md` holds one package's scope and acceptance criteria.
- The work packages cite the spec as `docs/decidinator-spec.md`. Until that
  export exists, read the spec from `docs/decidinator/`.
- From WP-02 on, read `docs/verification.md` (WP-01's findings) before
  planning. A failed verification item changes the affected packages.

## Commands

```powershell
# Decidinator's hook and library tests (Node 20+). Pass the files, not the
# directory: on Node 24 the directory form fails.
node --test tests/decidinator/*.test.js

# Load the plugin directly (do not iterate via marketplace install)
claude --plugin-dir ./plugins/decidinator
/reload-plugins

./scripts/Validate-All.ps1
```

Add the tests to `.github/workflows/validate.yml` in the package that first
creates them, as planandtier's are.

## Architecture rules

- Hooks are Node scripts under `scripts/`, as in planandtier. No `pwsh`, no
  Bash-only logic.
- **Unarmed is inert.** Every hook exits with no output unless the session is
  armed by `/decidinator:arm` or `DECIDINATOR_MODE`. The exceptions are command
  handling and `SessionEnd` cleanup. A test must prove it for each hook.
- **Scripts write, the model never does.** Only hook and command scripts touch
  the decision log, sidecar, and session state. Oracles are read-only
  (`disallowedTools: Edit, Write, NotebookEdit, AskUserQuestion, Agent`).
- **Never throw.** A hook error means no output and exit 0, with debug logging
  only behind `DECIDINATOR_DEBUG` to a temp-directory file, never stdout.
- **Deny only where the spec says so.** The gate, dispatch check, and guard
  deny by design; everywhere else, on doubt, emit nothing. The guard steps
  aside after `guardMaxBlocks`, so a wedged session can always recover.
- **Ignore subagent calls.** The gate never acts on `AskUserQuestion` from a
  subagent, which is what prevents recursion.
- **Log and sidecar formats are a public API.** Their `v1` version markers
  matter: a file with a different major version is refused, and hand edits are
  preserved byte for byte. Change a format only by changing the spec first.
- **One implementation.** Hooks and commands share the WP-03 library for
  parsing and writing; do not re-implement a parser in a hook.
- Session state lives in `${CLAUDE_PLUGIN_DATA}/sessions/`. Nothing else is
  written into a consuming repository except the decision log, sidecar, and
  the user's own config file.
- The three `oracle-N.md` agents share one identical prompt body; a test
  enforces it. Edit all three together.
- Deny-reason texts are constants covered by snapshot tests. Change the
  constant and the snapshot together.

## Working on this plugin

- Build one work package at a time, in dependency order, each as its own
  plan-mode session through planandtier. Do not start a package before its
  dependencies are done.
- Each package's plan must make every design decision itself, and split the
  work into tasks small and mechanical enough for Sonnet. Ask open questions
  with `AskUserQuestion` before finishing the plan; do not guess.
- **Commit and push after each successful work package**, meaning its code
  works and its acceptance criteria pass. One package per commit; do not start
  the next with the last one uncommitted.
- Use recorded hook payloads from `docs/verification.md` as test fixtures
  instead of hand-written ones, so tests match what Claude Code sends.
- A bug found in a later package is fixed in the package that owns it, then
  the later package is re-run.
- Every claim in a findings doc needs an evidence file behind it; see
  `docs/README.md`.
- `spikes/` (WP-01) is throwaway: keep it out of the plugin package and remove
  it in WP-10.
