# M03: Git bookkeeping scripts (Change 6)

- Status: blocked
- Format: 2
- Goal: `plugins/orcastrat/scripts/` has `scope-check`, `push-check`, `verify`, `integrate` and `recover`, each with bats tests. Each prints the short fixed-format result the spec gives. `run` uses `scope-check`, `push-check`, `verify` and `recover` for today's scope check, push check, Verify runs and interrupted-run recovery, in place of reasoning through the git steps itself.
- Depends on: M02
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §7 (Change 6) for these five scripts, §20 (Change 19) rules and item 7 (tests), §25 item 4 (both trailers); Decisions D04, D05, D18, D23.

- Signatures (D05):
  - `scope-check <dir> <base> <files...>`: prints `OK`, or the out-of-scope paths, one per line. Checks `git diff --name-only <base>..HEAD` plus `git status --porcelain` in `<dir>`.
  - `push-check <dir> <base>`: prints `OK`, or the commits in `<base>..HEAD` that `git branch -r --contains` finds on a remote.
  - `verify <plan-dir> <dir> <command>`: runs `<command>` with `bash -c` in `<dir>`. Writes the full log under `<git-common-dir>/orcastrat/<plan-slug>/logs/`, where the slug is the last path component of `<plan-dir>`. Prints `exit=<n>`, and on failure the log's last 40 lines.
  - `integrate <task-branch> <base>`: cherry-picks `<base>..<task-branch>` onto the current branch. Prints `OK`, or `CONFLICT` plus the conflicted files.
  - `recover <plan-dir>`: lists (a) `todo` tasks whose trailer, `Orcastrat-Task:` or `Orchestratinator-Task:`, is already in history, and (b) tasks with worker commits (subject prefix `<task ID>:`) after the last trailer commit but no trailer of their own.
- Every script sources `lib/common` (M02) and prints each path through `print_path` (D43, D44), for example the verify log path. Tests assert this with the stub `cygpath` from `tests/orcastrat/lib-common.bats`. Script Verify commands run `bash scripts/run-bats.sh tests/orcastrat/<script>.bats` (D02).
- Scripts are extensionless, start with `#!/usr/bin/env bash`, and are invoked as `bash "${CLAUDE_PLUGIN_ROOT}/scripts/<name>" …` (D04). Bash 3.2 only (M02 Context).
- Tests live in `tests/orcastrat/<script>.bats`. They build fixture repos with `tests/orcastrat/test_helper.bash` (M02), cover Windows-style escaped paths where a script takes paths, and assert output, exit code and files written. No test runs Claude Code.
- `integrate` is built and tested here, but `run` starts using it in M07 with the parallel rebuild. `recover`'s interrupted-attempt list (b) is acted on by `run` from M05, once workers commit. Until then, `run` uses only list (a).
- D23: `run` keeps its branch check and the `STRAY` stop reason.

## Outline

- One task per script, test-first (`Fails first: yes`): `scope-check`, `push-check`, `verify`, `integrate`, `recover`, each with its `.bats` file.
- `run`: replace the "Verify a command" definition and both verify-log paths with a call to `verify`, reading only its output.
- `run`: replace the serial and parallel scope checks with `scope-check`, passing the task's Files.
- `run`: replace the push check inside the stray-commit guard with `push-check`, and preflight's interrupted-run recovery grep with `recover`.
- `reference/plan-format.md`: mention the scripts where it describes Verify and recovery.
