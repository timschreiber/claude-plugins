# Grindinator

Grindinator runs a folder of work packages, one after another, through Tierminator. Each package gets its own headless Claude Code session, with Decidinator armed so open decisions are researched and logged, and the run waits out usage limits and resumes by itself.

It is a tool in this repo, not a plugin, and it is not in `marketplace.json`.

## Requirements

- **Node 20 or later.**
- **Git with a commit identity** (`user.name` and `user.email`), because the tasks commit.
- **Claude Code**, with `claude.exe` on the PATH. On Windows an npm `claude.cmd` shim is not found (L-8).
- **The tierminator and decidinator plugins**, installed from the `timschreiber` marketplace and up to date:

  ```bash
  claude plugin marketplace update timschreiber
  claude plugin update tierminator@timschreiber
  claude plugin update decidinator@timschreiber
  ```

- **A clone of this repo.** Grindinator is not standalone: it requires Decidinator's library by relative path (L-7).

## Install

From `tools/grindinator/`:

```bash
npm link
```

Or skip the install and call it by path:

```bash
node tools/grindinator/bin/grindinator <command>
```

## Quick start

1. Write the work packages as files named `WP-NN · Title.md` in one folder.
2. `cd` to the target project's root. The tree must be clean and committed.
3. Run the packages, with a gate that proves each one works:

   ```bash
   grindinator run <packages dir> --gate "<test command>"
   ```

4. Check progress with `grindinator status`, and read `.grindinator/summary.md` when the run ends.

## Commands

- `grindinator run <packages dir> [options]`: check the preconditions, create or resume the run branch, and run the packages that are not done.
- `grindinator status [packages dir]`: show each package and its state.
- `grindinator reset <id>`: clear a package's done marker (for example `WP-02`) so the next run repeats it.
- `grindinator help`: show the help text.

## Options

These apply to `run`. A flag overrides the same setting in the configuration files.

| Flag | Key | Default | Meaning |
| --- | --- | --- | --- |
| `--name <run name>` | none | `<dir>-<UTC timestamp>` | Name a new run. A run name belongs to one run, so it is a flag only. |
| `--permission-mode <mode>` | `permissionMode` | `bypassPermissions` | `acceptEdits`, `bypassPermissions` or `default`, for every session. |
| `--allowed-tools <list>` | `allowedTools` | none | Comma-separated tools allowed in every session. |
| `--model <model>` | `model` | `opus` | The planning model of each session. |
| `--effort <level>` | `effort` | `medium` | The planning effort: `low`, `medium`, `high`, `xhigh` or `max`. |
| `--max-turns <n>` | `maxTurns` | none | Turn cap per session. |
| `--max-session-minutes <n>` | `maxSessionMinutes` | `480` | Wall-clock cap per session, in minutes. |
| `--max-gate-minutes <n>` | `maxGateMinutes` | `60` | Wall-clock cap on the gate, in minutes. |
| `--gate <command>` | `gate` | none | A command that must pass before a package counts as done. With none, the gate is skipped. |
| `--on-failure <stop\|continue>` | `onFailure` | `stop` | After a failed package, stop the run or go on to the next. |
| `--max-limit-waits <n>` | `maxLimitWaits` | `3` | Usage-limit waits in a row one package may take. |
| `--wait-weekly` | `waitWeekly` | `false` | Wait out a reset more than 24 hours away. |
| `--preamble <file>` | `preamble` | none | A file whose text goes before every package prompt. |
| `--no-decidinator` | `decidinator` | `true` | Do not arm Decidinator in the sessions. |
| `--stop-on-open-questions` | `stopOnOpenQuestions` | `false` | Stop after a package that adds open questions. |

Two optional JSON files hold the same keys: the user file `~/.claude/grindinator.json` and the project file `.claude/grindinator.json` at the repository root. Precedence, lowest to highest: the built-in defaults, the user file, the project file, then flags. Each key resolves on its own, and an array value replaces the lower one whole. The loader is strict: an unknown key or an invalid value stops `run` with every problem listed.

```json
{ "effort": "high", "gate": "npm test", "onFailure": "continue" }
```

## What a run does

1. It checks the preconditions, then creates the branch `grindinator/<run name>` from the current commit. It adds `.grindinator/` to `.git/info/exclude`, so the run's own files never dirty the tree.
2. For each package that is not done, in order, it starts one headless `claude -p "/tierminator:plan ..."` session. Tierminator plans, runs the tasks and commits them.
3. Decidinator runs in sidecar mode in each session. Open decisions go to a read-only oracle and are logged in `docs/` of the target project, with the open questions waiting for you.
4. When a session completes, Grindinator verifies that HEAD is on the run branch, has moved on and the tree is clean. It commits the decision files as `chore(grindinator): decisions for <id>`.
5. It then runs the gate. A failing gate makes the attempt `gate-failed`.
6. A package that passes everything gets a done marker, `.grindinator/done/<id>.done`.
7. A failed package stops the run, or with `--on-failure continue` the run goes on and reports it at the end.

To resume after a stop, a failure or Ctrl+C, run the same command again. Done packages are skipped. Use `grindinator reset <id>` to repeat one that is done.

## Usage limits

A usage limit is never counted as a failure. Grindinator discards the uncommitted leftovers, waits until the reset plus five minutes, and relaunches by phase: from planning when there is no plan, or with `/tierminator:execute` from the first task not run, so committed tasks are not repeated. With no reset time reported, it waits five hours.

`--max-limit-waits` caps the waits in a row for one package; past it the run stops with exit 3. A reset more than 24 hours away also stops the run unless `--wait-weekly` is set. Run again after the reset.

## Exit codes

- `0`: every package is done, or the command succeeded.
- `1`: a package failed or halted, or an unexpected error.
- `2`: a precondition failed, a bad configuration or a bad command line; fix it and run again.
- `3`: stopped on a usage limit.
- `4`: interrupted (Ctrl+C). The state is saved and the next run resumes.
- `5`: stopped on open questions (`--stop-on-open-questions`).

## Safety and permissions

The default `--permission-mode bypassPermissions` lets a worker run anything it writes. Workers need it: under `acceptEdits` they could not read the tasks file outside the repository, and the run halted at the first task. So run Grindinator only on the runner branch, in a sandbox or a dedicated clone.

Grindinator never pushes. It discards uncommitted changes only on its own run branch. A smaller permission set, `acceptEdits` plus `--add-dir` for the plan directory, is untested, and there is no flag for `--add-dir` (L-3).

## Setups

The first-party claude.ai login is verified. Pro and Bedrock are untested (L-2, L-5). To try them, follow [Other setups](../../docs/grindinator/grindinator-e2e-run.md#other-setups) in the end-to-end runbook.

## Known limitations

The numbers are the reference's; see [Known limitations](../../docs/grindinator/grindinator-reference.md#known-limitations).

- **L-1:** a real usage limit is unverified; the tests used a mock 429.
- **L-2:** Pro and Bedrock are untested.
- **L-3:** workers need `bypassPermissions`; there is no `--add-dir` flag.
- **L-4:** the live confirmation of the headless consult path is pending.
- **L-5:** there is no web-search substitute where `WebSearch` is missing, so oracles research the repository only.
- **L-6:** it drives the plugins installed from the marketplace, not this repo's `plugins/`; update the installs after pushing.
- **L-7:** it runs only from a clone of this repo.
- **L-8:** on Windows, `claude` must resolve to `claude.exe`.
- **L-9:** Ctrl+C (exit 4) is tested on POSIX only.
- **L-10:** nothing enforces the consult rule; a planner that decides silently shows only in the decision log and the plans.
- **L-11:** parallel packages, pushing to a remote and Interviewinator are out of scope.

## Debugging and testing

Set `GRINDINATOR_DEBUG=1` for a debug log, `grindinator-debug.log` in the temp directory. Each attempt's stream, session logs and gate output are in `.grindinator/runs/<id>/attempt-<n>/`.

Run the tests from the repo root (they need `git`):

```bash
node --test tests/grindinator/*.test.js
```

The end-to-end scenarios need a real Claude Code session, so they run by hand from the [runbook](../../docs/grindinator/grindinator-e2e-run.md).

## More

- [Reference](../../docs/grindinator/grindinator-reference.md): every command, file, key and variable.
- [End-to-end runbook](../../docs/grindinator/grindinator-e2e-run.md): the manual scenarios and the other setups.
- [Specification](../../docs/grindinator/Grindinator%20%E2%80%94%20Specification.md): the design.
