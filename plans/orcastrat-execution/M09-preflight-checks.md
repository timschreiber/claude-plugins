# M09: Preflight checks and status delegation (Changes 19.6, 16, 20)

- Status: in-progress
- Format: 2
- Goal: Every `plan` and `run` starts with the toolchain check, then the instruction-file check, then the model check, in that order and before anything else. `run` writes its marker only after all three and "Proceed?". The instruction-file check writes `review.md`, `fix-prompt.md` and `ack` inside `.git`, prompts only when findings are new or changed, and never edits instruction files. No skill pins a model. `status` dispatches a new Haiku `status-reader` agent and relays its report.
- Depends on: M08
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout-heavy

## Context

Governing sources: spec §20 item 6 (toolchain check), §17 (Change 16), §21 (Change 20), §22 items 2 and 3 (`status-reader`), §7 (the four new scripts), §6 item 1 (where task worktrees live); Decisions D12, D13, D29, D30, D40, D42, D55, D62, D68, D147–D176.

- D62: no task in this milestone is `worker-light`; `worker` is the floor.
- Tier adjustment: test-first bash script tasks → worker (worker-light escalated 2 times in M02)
- The Goal's "writes `review.md`, `fix-prompt.md` and `ack` inside `.git`" is narrowed by D152: `review.md` and `fix-prompt.md` go in `.orcastrat/instructions/` at the repository root, written with the Write tool; only `ack` is inside `.git`, written by the `instructions-ack` script.
- Start checks (D172): `plan` and `run` each get a `## Start checks` section directly above `## 1. Re-read the ground truth`, holding `### Toolchain check`, `### Instruction-file check` and `### Model check`, in that order. The toolchain, quick instruction and model checks are written into each skill; the full instruction review is written once, in `plugins/orcastrat/reference/instruction-review.md` (D166). A start check that ends the skill writes and commits nothing (D150).
- No `run` or `plan` step has Claude write inside `.git` (D151). Writes there go through `ensure-exclude`, `instructions-ack`, `hold`, `run-state drop`, or a git command.
- Task worktrees move to `<MAIN>/.orcastrat/wt/<task ID>` (D153), and after a parallel wave `run` removes them before integration (D163, D174).
- New scripts (D04, D05, D55): `plugins/orcastrat/scripts/<name>`, run as `bash "${CLAUDE_PLUGIN_ROOT}/scripts/<name>" ...`. Each starts `#!/usr/bin/env bash` and a header comment in the style of `plugins/orcastrat/scripts/verify` lines 1–13, sources `lib/common` as `verify` does (lines 15–16) for `print_path`, and has verify's `fail()` function (lines 18–21): one `error: <message>` line on stderr, nothing on stdout, exit 2. Paths in error messages go through `print_path`. Tests are `tests/orcastrat/<name>.bats` in the style of `tests/orcastrat/verify.bats` lines 1–17 (D03).
- Shipped bash is 3.2-compatible (spec §20): no associative arrays, `mapfile`, `${var,,}` or other bash-4 features, and only bash, `git` and standard utilities. No `set -e` or `set -u`, as in the existing scripts.
- The bats files run slowly on Windows. Give a Verify command that runs bats a Bash timeout of 600000 ms. On this machine git prints `LF will be replaced by CRLF` warnings while tests build fixtures; they are expected.
- Every block a Step gives in a fence is its literal final content: the fenced block in that Step, with the three-space list indentation removed from each line. Blank lines stay empty. Copy it exactly; don't reformat, reorder or "improve" it. A block fenced with four backticks may hold three-backtick fences of its own: they are part of the content.
- **Replacing text.** "Replace A with B" means: find A, which occurs exactly once in the file unless the Step gives another count (as a whole line, or as the part of a line quoted), and put B in its place, changing nothing around it. If A isn't found that many times, stop and report `BLOCKED` / `GAP` quoting A.
- **Inserting lines.** "Directly below the line L, insert X" means: put X on its own lines right after L, with no empty line between them. "Directly above the line L, insert X" means: put X right before L, followed by one empty line, so that L keeps an empty line above it.
- Skill and reference text contains no `$(`: every command it tells Claude to run is one line (spec §20 item 3). `tests/orcastrat/skill-files.bats` (M09-T06) checks it.
- The run executing this plan is the installed, pre-rename plugin (D37). Editing the repository's skills, agents and scripts changes nothing in that run. No task runs `run` or `plan`, installs the plugin or starts Claude Code, and no test runs Claude Code (spec §20 item 7).
- `plugins/orcastrat/README.md` and `CHANGELOG.md` are M15's (spec §28, D26): no task here edits them, even where they describe the old worktree location.

Waves: 6 (widths 6, 4, 3, 1, 1, 1)

## Coverage

- `docs/orcastrat-execution-spec.md` preamble: fewer Opus tokens and less repeated context: `status` never switches the session's model, and the instruction files every worker loads are checked for cost → M09-T07, M09-T09, M09-T12, M09-T13
- `docs/orcastrat-execution-spec.md` §1.1: known mechanisms only: the documented AskUserQuestion tool, the docs' *CLAUDE.md files* page (D147), and git commands → M09-T08, M09-T12, M09-T13
- `docs/orcastrat-execution-spec.md` §1.2: the new `Instructions max lines` header field is in the plan format, and its one reader, `run`'s full instruction review, reads it → M09-T08, M09-T12
- `docs/orcastrat-execution-spec.md` §1.4: frontmatter is valid YAML, with the `status-reader` description quoted → M09-T07, M09-T09
- `docs/orcastrat-execution-spec.md` §1.6: the new shipped scripts are bash 3.2 with git and standard utilities only, and each has bats tests with fixture repos and Windows-style paths (§20 item 7) → M09-T01, M09-T02, M09-T03, M09-T04, M09-T05
- `docs/orcastrat-execution-spec.md` §1.6: the commands the skills and the instruction review tell Claude to run are one line with no `$(` (§20 item 3) → M09-T06, M09-T08, M09-T10, M09-T11, M09-T12, M09-T13
- `docs/orcastrat-execution-spec.md` §6 item 1: task worktrees live at `.orcastrat/wt/<task ID>` at the repository root, and `next` counts them there (D153) → M09-T05, M09-T15
- `docs/orcastrat-execution-spec.md` §6 item 1: after a wave, `run` removes its task worktrees before the combined re-verify and any Milestone or Final verify, and blocked tasks keep `refs/orcastrat/discarded/` refs (D153, D163, D174) → M09-T16
- `docs/orcastrat-execution-spec.md` §7: `instructions-ack <choice> <file>...` and `instructions-ack --check <file>...` (D161) → M09-T03
- `docs/orcastrat-execution-spec.md` §7: `ensure-exclude` (D160) → M09-T02
- `docs/orcastrat-execution-spec.md` §7: `hold save` and `hold restore` (D162, D173), which `run` uses instead of the hold directory's `mkdir`, `cp` and `rm` → M09-T04, M09-T14, M09-T16
- `docs/orcastrat-execution-spec.md` §7: `run-state drop` (D159), which `run` uses for a stale marker instead of `rm -f` → M09-T01, M09-T10
- `docs/orcastrat-execution-spec.md` §7: nothing `run` or `plan` writes inside `.git` is written by Claude itself (D151) → M09-T08, M09-T10, M09-T14, M09-T16
- `docs/orcastrat-execution-spec.md` §17 item 1: the check runs on every `plan` and `run`, right after the toolchain check, before any survey, question, `Proceed?` or marker (D172) → M09-T12, M09-T13
- `docs/orcastrat-execution-spec.md` §17 item 2: the files checked, confirmed against the docs (D147, D171), with `~/.claude/CLAUDE.md` reported separately → M09-T08, M09-T12, M09-T13
- `docs/orcastrat-execution-spec.md` §17 item 3: leanness findings with the table's actions, and conflicts with their action, each citing `path:line` → M09-T08
- `docs/orcastrat-execution-spec.md` §17 item 4: criteria only by default; the optional `Instructions max lines` field adds a size finding (D29, D165) → M09-T08
- `docs/orcastrat-execution-spec.md` §17 item 5: `review.md` and `fix-prompt.md` in `.orcastrat/instructions/` written with the Write tool, `ack` only through `instructions-ack`; the review's general checks; the fix prompt's standard prompt rules (D152, D175) → M09-T03, M09-T08
- `docs/orcastrat-execution-spec.md` §17 item 6: interactive prompt with a summary of about 10 lines, the review's path, and AskUserQuestion **Stop and fix it** or **Continue**; Stop writes nothing (D150) → M09-T08
- `docs/orcastrat-execution-spec.md` §17 item 7: don't nag: a file set is acknowledged by its file list and per-file hashes, and then only the stored conflicts line shows (D148) → M09-T03, M09-T12, M09-T13
- `docs/orcastrat-execution-spec.md` §17 item 8: under `--yes`, never prompt; write the review and fix prompt, show the one-line summary, and continue (D148, D164) → M09-T08, M09-T12, M09-T13
- `docs/orcastrat-execution-spec.md` §17 item 9: a quick file search and `instructions-ack --check`, so Claude never hashes anything (D161, D171) → M09-T03, M09-T12, M09-T13
- `docs/orcastrat-execution-spec.md` §17 item 10: Orcastrat never edits instruction files → M09-T08
- `docs/orcastrat-execution-spec.md` §17 Acceptance: nothing the check writes appears in `git status` → M09-T02
- `docs/orcastrat-execution-spec.md` §20 item 6: the toolchain check is the first preflight step of every `plan` and `run`, run directly through the session's shell tool, never a script → M09-T10, M09-T11
- `docs/orcastrat-execution-spec.md` §20 item 6: bash 3.2 or later, git 2.17 or later, a git work tree, and a commit identity → M09-T10, M09-T11
- `docs/orcastrat-execution-spec.md` §20 item 6: `run` only: the active-run check, then the clean-tree check, which a live marker skips (D155) → M09-T01, M09-T10
- `docs/orcastrat-execution-spec.md` §20 item 6: the exclude line through `ensure-exclude`, `git worktree prune` with the leftover report, and the Windows `core.longpaths` warning (D154) → M09-T02, M09-T10, M09-T11
- `docs/orcastrat-execution-spec.md` §20 item 6: on failure `run` stops with SETUP and `plan` ends before surveying, a missing bash included (D169); nothing is created (D150); one message lists every failed item with its platform fix → M09-T10, M09-T11
- `docs/orcastrat-execution-spec.md` §21 item 1: `status` drops `model:`, dispatches `status-reader` with the plan path, relays its report verbatim, uses no `context: fork`, and keeps its output format → M09-T06, M09-T09
- `docs/orcastrat-execution-spec.md` §21 item 1: `status-reader` is Haiku, read-only, runs only `git log`, `git status` and `git worktree list` (D156), reads plan.md, milestone and task Status, the failure logs and both trailers (D157), and replies in at most 20 lines with the `Failures:` line (D158, D167) → M09-T07
- `docs/orcastrat-execution-spec.md` §21 item 2: no `model:` pin on `plan`, `run` or `status`; the pin inventory is D168's → M09-T06
- `docs/orcastrat-execution-spec.md` §21 item 2: after the instruction-file check, `plan` and `run` confirm an Opus model; interactively they ask **Stop** or **Continue on this model**; under `--yes` the notice goes to the run log (D42, D170) or the first line of `plan`'s reply (D149) → M09-T12, M09-T13
- `docs/orcastrat-execution-spec.md` §22 item 2: `status-reader` has the search and command bounds section → M09-T07
- `docs/orcastrat-execution-spec.md` §22 item 3: `status-reader`'s allowlist is `Read, Glob, Grep, Bash`, it writes nothing, and it has the no-prototyping section (D68) → M09-T07
- `docs/orcastrat-execution-spec.md` §29 item 7: Changes 16 and 20 and the toolchain check are built in their preflight order (D40) → M09-T10, M09-T11, M09-T12, M09-T13
- `docs/orcastrat-execution-spec.md` §31: kebab-case names (`status-reader`, `ensure-exclude`, `instructions-ack`, `hold`) and valid frontmatter → M09-T02, M09-T03, M09-T04, M09-T07
- `docs/orcastrat-execution-spec.md` §32 items 27–32: the instruction-file check's decisions, with item 31's "inside `.git`" narrowed to `ack` by D152 → M09-T08, M09-T12, M09-T13
- `docs/orcastrat-execution-spec.md` §32 items 39, 41 and 42: the toolchain check's decisions, with item 39's bash exception removed by D169 → M09-T10, M09-T11
- `docs/orcastrat-execution-spec.md` §32 items 43 and 44: no skill pins a model, `status` delegates to `status-reader`, and nothing uses `context: fork` → M09-T06, M09-T07, M09-T09

## Review Focus

- A `.orcastrat/` directory holding task worktrees and instruction-check files, once `ensure-exclude` has run → absent from `git status --porcelain`, and kept by `git clean -fd` (source: spec §17 item 5 and Acceptance, "nothing appears in `git status`"; D154). Test: `an excluded .orcastrat directory stays out of git status and git clean` in M09-T02.
- An imported file the last acknowledgement recorded, deleted since → `instructions-ack --check` prints `REVIEW`, even though the caller never names it (source: D148, "a file changed, was added or was removed"; D161). Test: `--check adds the files the ack records, and a removed one means REVIEW` in M09-T03.
- A task's report and failure log held across `git reset --hard` and `git clean -fd` → written back with their content (source: D93; D162). Test: `held files survive git reset --hard and git clean -fd` in M09-T04.
- `run-state drop` in a linked worktree while the main checkout has its own marker → only the worktree's marker is deleted (source: spec §9 Limit, runs in other worktrees have their own markers; D06). Test: `drop in a linked worktree leaves the main checkout's marker` in M09-T01.
- A skill or reference file that tells Claude to run a `$(...)` command → the check fails (source: spec §20 item 3). Test: `no skill or reference file has a command substitution` in M09-T06.

## Tasks

### M09-T01: run-state drop deletes a stale marker without logging

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: M05-T01, M08-T01
- Files: `plugins/orcastrat/scripts/run-state`, `tests/orcastrat/run-state.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/run-state.bats`
- Fails first: yes
- Commit: `feat(orcastrat): run-state drop deletes a stale marker without logging`

**Objective**

`run-state drop` deletes this checkout's active-run marker without writing to the run log, printing nothing and exiting 0 also when there is no marker (D159).

**Read first**

- `docs/orcastrat-execution-spec.md` §7, the `run-state drop` bullet
- plan.md Decisions D89, D151 and D159
- `plugins/orcastrat/scripts/run-state` (whole file, 112 lines)
- `tests/orcastrat/run-state.bats` (whole file)

**Interfaces**

- Consumes: `run-state exit status: 0 on success; 2 with one stderr line error: <message>` (M05-T01)
- Consumes: `<session-id>, the second argument of run-state start, stored as the sixth marker line session=<session-id>` (M08-T01)
- Produces: `run-state drop`
- Produces: `error: usage: run-state drop`
- Produces: `error: usage: run-state start <plan-dir> <session-id> | beat | elapsed | end <PAUSE|STOP|COMPLETE> <reason> | drop`

**Steps**

1. In `tests/orcastrat/run-state.bats`, change three existing tests:
   - `run-state exits 2 with no arguments`: expect stderr `error: usage: run-state start <plan-dir> <session-id> | beat | elapsed | end <PAUSE|STOP|COMPLETE> <reason> | drop`.
   - `run-state exits 2 when a subcommand has the wrong number of arguments`: after its last check (the stderr of `run_script end STOP`), add `run_script start "plans/my plan" S-1`, then `run_script drop extra`, expecting status 2, empty `$output`, stderr `error: usage: run-state drop`, and `$MARKER` still a file.
   - `run-state exits 2 outside a git work tree`: at its end, add `run_script drop`, expecting status 2 and empty `$output`.
2. Add these tests:
   - `drop deletes the marker without writing to the run log`: `run_script start "plans/my plan" S-1`; `run_script drop`; expect status 0, empty `$output` and `$stderr`, no file at `$MARKER`, and `line_count "$LOG"` equal to `1`.
   - `drop with no marker exits 0 and prints nothing`: `run_script drop`; expect status 0, empty `$output` and `$stderr`, and no file at `$LOG`.
   - `drop in a linked worktree leaves the main checkout's marker`: `write_marker 1000 1000 0 ''`; `git worktree add --quiet -b task "$BATS_TEST_TMPDIR/task tree"`; `mkdir -p "$BATS_TEST_TMPDIR/task tree/plans/my plan"`; `cd "$BATS_TEST_TMPDIR/task tree"`; `run_script start "plans/my plan" S-2`; `run_script drop`; expect status 0, no file at `"$(git rev-parse --absolute-git-dir)/orcastrat/active-run"`, and `$MARKER` still a file.
3. Run Verify and confirm it fails.
4. In `plugins/orcastrat/scripts/run-state`, change the header comment: line 2 becomes `# run-state start <plan-dir> <session-id> | beat | elapsed | end <PAUSE|STOP|COMPLETE> <reason> | drop`, and below the `end <mode> <reason>` entry add a `drop` entry, aligned like the others, saying it deletes the marker without writing to the run log, for a stale marker a crashed session left, and does nothing when there is no marker (D159). Change the `usage` variable to `usage: run-state start <plan-dir> <session-id> | beat | elapsed | end <PAUSE|STOP|COMPLETE> <reason> | drop`.
5. In the first `case "$cmd"`, directly below the `end)` branch's closing `;;`, add a `drop)` branch: `[ "$#" -eq 0 ] || fail 'usage: run-state drop'`, then `;;`. In the second `case "$cmd"`, directly below the `end)` branch's closing `;;`, add a `drop)` branch running `rm -f "$marker"`, then `;;`. Change nothing else.
6. Run Verify and confirm all 23 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/run-state.bats` reports 23 tests and no failure.
- `run-state drop` deletes only this checkout's marker, writes no run-log line, prints nothing and exits 0, with or without a marker; any argument is a usage error.

### M09-T02: Add the ensure-exclude script

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: M02-T05, M02-T06
- Files: `plugins/orcastrat/scripts/ensure-exclude`, `tests/orcastrat/ensure-exclude.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/ensure-exclude.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the ensure-exclude script`

**Objective**

`ensure-exclude` adds the line `/.orcastrat/` to the repository's `info/exclude` file when no line equals it, so `.orcastrat/` never shows up in `git status` and `git clean -fd` never removes it (D154, D160).

**Read first**

- `docs/orcastrat-execution-spec.md` §20 item 6, the **Exclude line** bullet
- plan.md Decisions D55, D154 and D160
- `plugins/orcastrat/scripts/verify` lines 1–33 (header, `fail`, argument checks)
- `tests/orcastrat/verify.bats` lines 1–17 (setup and the `run_script` helper to copy)
- `tests/orcastrat/test_helper.bash`

**Interfaces**

- Consumes: `tests/orcastrat/test_helper.bash`, loaded with `load test_helper` (M02-T05)
- Consumes: `REPO_ROOT` (M02-T05)
- Consumes: `make_fixture_repo <dir>` (M02-T05)
- Consumes: `make_cygpath_stub <dir>` (M02-T05)
- Consumes: `plugins/orcastrat/scripts/lib/common` (M02-T06)
- Consumes: `print_path <path>` (M02-T06)
- Produces: `plugins/orcastrat/scripts/ensure-exclude`
- Produces: `ensure-exclude, with no arguments: adds the line /.orcastrat/ to the file git rev-parse --git-path info/exclude names, unless a line equals it; prints nothing`
- Produces: `error: usage: ensure-exclude`

**Steps**

1. Create `tests/orcastrat/ensure-exclude.bats`, starting with `bats_require_minimum_version 1.5.0`, with a `setup()` that runs `load test_helper` and sets `SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/ensure-exclude"` and `REPO="$BATS_TEST_TMPDIR/fixture repo"`, runs `make_fixture_repo "$REPO"` and `make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"`, sets `EXCLUDE="$REPO/.git/info/exclude"`, and runs `cd "$REPO"`. Add two helpers, each with a one-line comment: `run_script <args...>`, which is `run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"`, and `count_line <file>`, which prints `0` when `<file>` doesn't exist and otherwise the number of lines of `<file>` equal to `/.orcastrat/` once carriage returns are removed (`tr -d '\r' < "$1" | grep -cxF -- '/.orcastrat/'`, printing its count even when it is 0).
2. Add these tests. "Clean" means status 0, empty `$output` and empty `$stderr`.
   - `adds /.orcastrat/ to the exclude file`: `run_script`; clean; `count_line "$EXCLUDE"` is `1`, and `tail -n 1 "$EXCLUDE"` prints `/.orcastrat/`.
   - `a second run adds nothing`: `run_script`; save `$(cat "$EXCLUDE")`; `run_script`; clean; the file's content equals the saved value.
   - `a file that doesn't end in a newline gets one before the line`: `printf '*.log' > "$EXCLUDE"`; `run_script`; clean; `$(cat "$EXCLUDE")` equals `$(printf '*.log\n/.orcastrat/')`.
   - `an existing line with a carriage return counts`: `printf '/.orcastrat/\r\n' > "$EXCLUDE"`; save its content with `od -c "$EXCLUDE"`; `run_script`; clean; `od -c "$EXCLUDE"` prints the saved value.
   - `creates the info directory when it is missing`: `rm -rf "$REPO/.git/info"`; `run_script`; clean; `$(cat "$EXCLUDE")` equals `/.orcastrat/`.
   - `works from a subdirectory`: `mkdir -p "$REPO/sub dir"`; `cd "$REPO/sub dir"`; `run_script`; clean; `count_line "$EXCLUDE"` is `1`.
   - `in a linked worktree it writes the shared exclude file`: `git worktree add --quiet -b task "$BATS_TEST_TMPDIR/task tree"`; `cd "$BATS_TEST_TMPDIR/task tree"`; `run_script`; clean; `count_line "$EXCLUDE"` is `1`.
   - `an excluded .orcastrat directory stays out of git status and git clean`: `run_script`; `mkdir -p "$REPO/.orcastrat/wt/M01-T01" "$REPO/.orcastrat/instructions"`; `printf 'review\n' > "$REPO/.orcastrat/instructions/review.md"`; `git -C "$REPO" status --porcelain` prints nothing; `git -C "$REPO" clean -fdq`; `$REPO/.orcastrat/instructions/review.md` is still a file.
   - `exits 2 with an argument`: `run_script extra`; status 2, empty `$output`, `$stderr` equal to `error: usage: ensure-exclude`, and `count_line "$EXCLUDE"` is `0`.
   - `exits 2 outside a git work tree`: `mkdir -p "$BATS_TEST_TMPDIR/plain dir"`; `cd "$BATS_TEST_TMPDIR/plain dir"`; `run_script`; status 2, empty `$output`, and `$stderr` starting with `error: not inside a git work tree: cygpath-stub [-m] [`.
3. Run Verify and confirm it fails.
4. Create `plugins/orcastrat/scripts/ensure-exclude` with the first line `#!/usr/bin/env bash` and a header comment saying: `ensure-exclude` takes no arguments; from the top level of the current directory's repository, it appends the line `/.orcastrat/` to the file `git rev-parse --git-path info/exclude` names, which linked worktrees share, unless a line already equals it (carriage returns ignored), adding a newline first when the file doesn't end in one, and creating the file and its directory when missing (D154, D160); it keeps task worktrees and instruction-check files under `.orcastrat/` out of `git status` and out of reach of `git clean -fd`; it prints nothing; errors as D55; bash 3.2 compatible. Then source `lib/common` and define `fail()` as `verify` does.
5. Then: `[ "$#" -eq 0 ] || fail 'usage: ensure-exclude'`; `[ "$(git rev-parse --is-inside-work-tree 2>/dev/null)" = true ] || fail "not inside a git work tree: $(print_path "$PWD")"`; `top=$(git rev-parse --show-toplevel)`; `cd "$top" || fail "cannot enter: $(print_path "$top")"`; `exclude=$(git rev-parse --git-path info/exclude)`; `mkdir -p "$(dirname "$exclude")" || fail "cannot create the directory of: $(print_path "$exclude")"`.
6. Then: `exit 0` when `[ -f "$exclude" ]` and `tr -d '\r' < "$exclude" | grep -qxF -- '/.orcastrat/'`; when `[ -s "$exclude" ]` and `[ -n "$(tail -c 1 "$exclude")" ]`, append a newline with `printf '\n' >> "$exclude"`; append the line with `printf '%s\n' '/.orcastrat/' >> "$exclude" || fail "cannot write: $(print_path "$exclude")"`; end with `exit 0`.
7. Run Verify and confirm all 10 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/ensure-exclude.bats` reports 10 tests and no failure.
- `ensure-exclude` adds `/.orcastrat/` once, from any directory of the repository or a linked worktree, prints nothing on success, and follows D55 on errors.

### M09-T03: Add the instructions-ack script

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: M02-T05, M02-T06
- Files: `plugins/orcastrat/scripts/instructions-ack`, `tests/orcastrat/instructions-ack.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/instructions-ack.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the instructions-ack script`

**Objective**

`instructions-ack <continue|stop> <file>...` records the instruction files' hashes and the user's choice in `<git-common-dir>/orcastrat/instructions/ack`, and `instructions-ack --check <file>...` prints `OK` when the files and the recorded ones are unchanged and acknowledged with `continue`, or `REVIEW` otherwise (D148, D161).

**Read first**

- `docs/orcastrat-execution-spec.md` §17, items 5, 7 and 9
- plan.md Decisions D55, D148, D152 and D161
- `plugins/orcastrat/scripts/verify` lines 1–43 (header, `fail`, argument checks, git common dir)
- `tests/orcastrat/verify.bats` lines 1–17 (setup and the `run_script` helper to copy)
- `tests/orcastrat/test_helper.bash`

**Interfaces**

- Consumes: `tests/orcastrat/test_helper.bash`, loaded with `load test_helper` (M02-T05)
- Consumes: `REPO_ROOT` (M02-T05)
- Consumes: `make_fixture_repo <dir>` (M02-T05)
- Consumes: `make_cygpath_stub <dir>` (M02-T05)
- Consumes: `plugins/orcastrat/scripts/lib/common` (M02-T06)
- Consumes: `print_path <path>` (M02-T06)
- Produces: `plugins/orcastrat/scripts/instructions-ack`
- Produces: `instructions-ack <continue|stop> <file>...`
- Produces: `instructions-ack --check <file>...`
- Produces: `instructions-ack --check stdout: OK or REVIEW`
- Produces: `<git-common-dir>/orcastrat/instructions/ack: the line choice <continue|stop>, then one <hash> <path> line per distinct file, sorted by path`
- Produces: `error: usage: instructions-ack <continue|stop> <file>... | --check <file>...`

**Steps**

1. Create `tests/orcastrat/instructions-ack.bats`, starting with `bats_require_minimum_version 1.5.0`, with a `setup()` that runs `load test_helper`, sets `SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/instructions-ack"` and `REPO="$BATS_TEST_TMPDIR/fixture repo"`, runs `make_fixture_repo "$REPO"` and `make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"`, sets `ACK="$REPO/.git/orcastrat/instructions/ack"`, creates `$REPO/docs` and `$REPO/a b`, writes `root rules` plus a newline to `$REPO/CLAUDE.md`, `docs rules` plus a newline to `$REPO/docs/CLAUDE.md`, and `agent rules` plus `\r\n` to `$REPO/a b/AGENTS.md` (with `printf`), and runs `cd "$REPO"`. Add three helpers, each with a one-line comment: `run_script <args...>` as `run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"`; `hash_of <file>` as `git hash-object --no-filters -- "$1"`; `line_count <file>`, which prints the number of lines in `<file>`, as `wc -l < "$1" | tr -d ' '`.
2. Add these tests. "Clean" means status 0, empty `$output` and empty `$stderr`; "prints OK" or "prints REVIEW" means status 0, `$output` equal to that word, and empty `$stderr`.
   - `continue writes the choice, then one hash line per file, sorted by path`: `run_script continue docs/CLAUDE.md CLAUDE.md "a b/AGENTS.md"`; clean; `$(cat "$ACK")` equals the four lines `choice continue`, `$(hash_of CLAUDE.md) CLAUDE.md`, `$(hash_of "a b/AGENTS.md") a b/AGENTS.md`, `$(hash_of docs/CLAUDE.md) docs/CLAUDE.md`, in that order.
   - `stop writes the stop choice`: `run_script stop CLAUDE.md`; clean; line 1 of `$ACK` is `choice stop`; `line_count "$ACK"` is `2`.
   - `a file given twice is written once`: `run_script continue CLAUDE.md CLAUDE.md`; clean; `line_count "$ACK"` is `2`.
   - `writing again replaces the ack`: `run_script continue CLAUDE.md docs/CLAUDE.md`; `run_script stop CLAUDE.md`; clean; `$(cat "$ACK")` equals the two lines `choice stop` and `$(hash_of CLAUDE.md) CLAUDE.md`.
   - `the hash is of the file's bytes, carriage returns included`: `git config core.autocrlf true`; `run_script continue "a b/AGENTS.md"`; line 2 of `$ACK` is `$(hash_of "a b/AGENTS.md") a b/AGENTS.md`, and `$(hash_of "a b/AGENTS.md")` differs from `$(git hash-object -- "a b/AGENTS.md")`.
   - `--check prints OK for the acknowledged files, in any order`: `run_script continue CLAUDE.md docs/CLAUDE.md`; `run_script --check docs/CLAUDE.md CLAUDE.md` prints OK.
   - `--check prints REVIEW when a file changed`: `run_script continue CLAUDE.md docs/CLAUDE.md`; `printf 'more\n' >> CLAUDE.md`; `run_script --check CLAUDE.md docs/CLAUDE.md` prints REVIEW.
   - `--check prints REVIEW when a file was added`: `run_script continue CLAUDE.md`; `run_script --check CLAUDE.md docs/CLAUDE.md` prints REVIEW.
   - `--check adds the files the ack records, and a removed one means REVIEW`: `run_script continue CLAUDE.md docs/CLAUDE.md`; `run_script --check CLAUDE.md` prints OK; `rm docs/CLAUDE.md`; `run_script --check CLAUDE.md` prints REVIEW.
   - `--check prints REVIEW when the choice was stop`: `run_script stop CLAUDE.md`; `run_script --check CLAUDE.md` prints REVIEW.
   - `--check prints REVIEW when there is no ack, and writes none`: `run_script --check CLAUDE.md` prints REVIEW; no file at `$ACK`.
   - `--check prints REVIEW for a given file that doesn't exist`: `run_script continue CLAUDE.md`; `run_script --check CLAUDE.md missing.md` prints REVIEW.
   - `--check never changes the ack`: `run_script continue CLAUDE.md`; save `$(cat "$ACK")`; `printf 'more\n' >> CLAUDE.md`; `run_script --check CLAUDE.md docs/CLAUDE.md`; `$(cat "$ACK")` equals the saved value.
   - `in a linked worktree the ack goes to the repository's common git dir`: `git worktree add --quiet -b other "$BATS_TEST_TMPDIR/other tree"`; `printf 'tree rules\n' > "$BATS_TEST_TMPDIR/other tree/CLAUDE.md"`; `cd "$BATS_TEST_TMPDIR/other tree"`; `run_script continue CLAUDE.md`; clean; `$ACK` is a file.
   - `file paths in both drive-letter forms are stored as given`: `command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"`; for each of `-m` and `-w`: set `p="$(cygpath <form> "$REPO/CLAUDE.md")"`; `run_script continue "$p"`; clean; line 2 of `$ACK` is `$(hash_of CLAUDE.md) $p`; `run_script --check "$p"` prints OK.
   - `exits 2 with too few arguments`: each of `run_script`, `run_script continue` and `run_script --check` gives status 2, empty `$output`, and `$stderr` equal to `error: usage: instructions-ack <continue|stop> <file>... | --check <file>...`.
   - `exits 2 for an unknown choice`: `run_script maybe CLAUDE.md`; status 2, empty `$output`, `$stderr` equal to `error: unknown choice: maybe`, and no file at `$ACK`.
   - `exits 2 when a file to acknowledge doesn't exist`: `run_script continue CLAUDE.md missing.md`; status 2, empty `$output`, `$stderr` equal to `error: not a file: cygpath-stub [-m] [missing.md]`, and no file at `$ACK`.
   - `exits 2 outside a git work tree`: `mkdir -p "$BATS_TEST_TMPDIR/plain dir"`; `cd "$BATS_TEST_TMPDIR/plain dir"`; `printf 'x\n' > CLAUDE.md`; `run_script continue CLAUDE.md`; status 2, empty `$output`, and `$stderr` starting with `error: not inside a git work tree: cygpath-stub [-m] [`.
3. Run Verify and confirm it fails.
4. Create `plugins/orcastrat/scripts/instructions-ack` with the first line `#!/usr/bin/env bash` and a header comment saying: its two forms, `instructions-ack <continue|stop> <file>...` and `instructions-ack --check <file>...`; the ack is `<git-common-dir>/orcastrat/instructions/ack`, holding the line `choice <choice>`, then one `<hash> <path>` line per distinct file, sorted by path in byte order, where `<hash>` is `git hash-object --no-filters` and `<path>` is the path as given, relative to the current directory (D161); writing replaces the ack and prints nothing; `--check` adds every path the ack records to the given files and prints `OK` when every file exists, the paths and hashes equal the ack's and its choice is `continue`, otherwise `REVIEW`, and never writes; errors as D55, plus `not a file:` and `unknown choice:`; bash 3.2 compatible. Then source `lib/common` and define `fail()` as `verify` does.
5. Then the argument checks, in this order: `usage='usage: instructions-ack <continue|stop> <file>... | --check <file>...'`; `[ "$#" -ge 2 ] || fail "$usage"`; `mode=$1`, `shift`; a `case "$mode"` that accepts `continue`, `stop` and `--check` and otherwise runs `fail "unknown choice: $mode"`; `[ "$(git rev-parse --is-inside-work-tree 2>/dev/null)" = true ] || fail "not inside a git work tree: $(print_path "$PWD")"`; `common=$(git rev-parse --git-common-dir)`; `common_abs=$(cd "$common" && pwd) || fail "cannot resolve the git common dir of: $(print_path "$PWD")"`; `ack="$common_abs/orcastrat/instructions/ack"`. Add a function `ack_lines <choice>` with a one-line comment: it reads paths, one per line, on stdin, drops empty lines, sorts them with `LC_ALL=C sort -u`, prints `choice <choice>`, then, for each path, `<hash> <path>` with the hash from `git hash-object --no-filters -- "<path>"`, and returns 1 as soon as a path isn't a regular file or can't be hashed.
6. Then the two modes. For `continue` and `stop`: for each argument, `[ -f "$f" ] || fail "not a file: $(print_path "$f")"`; `mkdir -p "$common_abs/orcastrat/instructions"`; write `printf '%s\n' "$@" | ack_lines "$mode"` to `"$ack.tmp"` (on failure `fail "cannot write: $(print_path "$ack")"`), then `mv -f "$ack.tmp" "$ack"`. For `--check`: when `$ack` isn't a file, print `REVIEW` and `exit 0`; set `recorded` to lines 2 and on of the ack with carriage returns removed and everything up to and including the first space of each line removed (`sed -n '2,$p' "$ack" | tr -d '\r' | sed 's/^[^ ]* //'`); set `expected` to the output of `{ printf '%s\n' "$@"; printf '%s\n' "$recorded"; } | ack_lines continue`, and when that returns 1, print `REVIEW` and `exit 0`; print `OK` when `expected` equals `$(tr -d '\r' < "$ack")`, otherwise `REVIEW`. End the script with `exit 0`.
7. Run Verify and confirm all 19 tests pass (the drive-letter test may be skipped where `cygpath` is absent).

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/instructions-ack.bats` reports 19 tests and no failure.
- The ack holds the choice and one sorted `<hash> <path>` line per distinct file; `--check` prints only `OK` or `REVIEW` and never writes.

### M09-T04: Add the hold script

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: M02-T05, M02-T06
- Files: `plugins/orcastrat/scripts/hold`, `tests/orcastrat/hold.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/hold.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the hold script`

**Objective**

`hold save` copies a task's existing files into `<git-common-dir>/orcastrat/<plan-slug>/hold/<key>/`, where `git reset --hard` and `git clean -fd` don't reach, and `hold restore` copies them back to the destinations given and empties the key (D162, D173).

**Read first**

- `docs/orcastrat-execution-spec.md` §7, the `hold save` and `hold restore` bullet
- plan.md Decisions D55, D93, D162, D173 and D177
- `plugins/orcastrat/scripts/verify` (whole file, 54 lines: argument checks, slug and git common dir)
- `tests/orcastrat/verify.bats` lines 1–17 (setup and the `run_script` helper to copy)
- `tests/orcastrat/test_helper.bash`

**Interfaces**

- Consumes: `tests/orcastrat/test_helper.bash`, loaded with `load test_helper` (M02-T05)
- Consumes: `REPO_ROOT` (M02-T05)
- Consumes: `make_fixture_repo <dir>` (M02-T05)
- Consumes: `make_cygpath_stub <dir>` (M02-T05)
- Consumes: `plugins/orcastrat/scripts/lib/common` (M02-T06)
- Consumes: `print_path <path>` (M02-T06)
- Produces: `plugins/orcastrat/scripts/hold`
- Produces: `hold save <plan-dir> <key> <dir> <path>...`
- Produces: `hold restore <plan-dir> <key> <dir> <held-path> <dest-path> [<held-path> <dest-path>]...`
- Produces: `<git-common-dir>/orcastrat/<plan-slug>/hold/<key>/<path>`
- Produces: `error: nothing held for: <key>`

**Steps**

1. Create `tests/orcastrat/hold.bats`, starting with `bats_require_minimum_version 1.5.0`, with a `setup()` that runs `load test_helper`, sets `SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/hold"` and `REPO="$BATS_TEST_TMPDIR/fixture repo"`, runs `make_fixture_repo "$REPO"` and `make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"`, sets `REPORT='plans/my plan/notes/reports/M01-T01.md'`, `LOG='plans/my plan/notes/M01-T01-failures.md'` and `HOLD="$REPO/.git/orcastrat/my plan/hold"`, writes `# Plan` plus a newline to `$REPO/plans/my plan/plan.md` and commits it with `git -C "$REPO" add "plans/my plan/plan.md"` and `git -C "$REPO" commit --quiet -m 'Add plan'` (a real plan directory is always committed, so it survives `git reset --hard` and `git clean -fd`, D177), creates `$REPO/plans/my plan/notes/reports`, writes `report one` plus a newline to `$REPO/$REPORT` and `## Attempt 1` plus a newline to `$REPO/$LOG`, and runs `cd "$REPO"`. Add the helper `run_script <args...>` with a one-line comment, as `run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"`. Below, `save both` means `run_script save "plans/my plan" M01-T01 "$REPO" "$REPORT" "$LOG"`.
2. Add these tests. "Clean" means status 0, empty `$output` and empty `$stderr`.
   - `save copies each existing path under the key`: save both; clean; `$HOLD/M01-T01/$REPORT` holds `report one` and `$HOLD/M01-T01/$LOG` holds `## Attempt 1`; `$REPO/$REPORT` and `$REPO/$LOG` still exist.
   - `save skips a path that doesn't exist`: `rm "$REPO/$LOG"`; save both; clean; `$HOLD/M01-T01/$REPORT` exists and `$HOLD/M01-T01/$LOG` doesn't.
   - `save empties the key first`: save both; `rm "$REPO/$LOG"`; save both; clean; `$HOLD/M01-T01/$LOG` doesn't exist.
   - `held files survive git reset --hard and git clean -fd`: save both; `git reset --hard --quiet HEAD`; `git clean -fdq`; `$REPO/$REPORT` doesn't exist; `run_script restore "plans/my plan" M01-T01 "$REPO" "$REPORT" "plans/my plan/notes/reports/M01-T01-attempt1.md" "$LOG" "$LOG"`; clean; `$REPO/plans/my plan/notes/reports/M01-T01-attempt1.md` holds `report one` and `$REPO/$LOG` holds `## Attempt 1`.
   - `restore recreates a parent directory that git clean -fd removed`: save both; `git reset --hard --quiet HEAD`; `git clean -fdq`; `$REPO/plans/my plan/plan.md` exists and `$REPO/plans/my plan/notes` doesn't; `run_script restore "plans/my plan" M01-T01 "$REPO" "$REPORT" "$REPORT"`; clean; `$REPO/plans/my plan/notes/reports` is a directory and `$REPO/$REPORT` holds `report one`.
   - `restore copies each held file to its destination, creating directories, and deletes the key`: save both; `rm -rf "$REPO/plans/my plan/notes"`; `run_script restore "plans/my plan" M01-T01 "$REPO" "$REPORT" "$REPORT" "$LOG" "$LOG"`; clean; both files hold their original lines; `$HOLD/M01-T01` doesn't exist.
   - `restore skips a pair whose held file doesn't exist`: `run_script save "plans/my plan" M01-T01 "$REPO" "$REPORT"`; `printf 'newer log\n' > "$REPO/$LOG"`; `run_script restore "plans/my plan" M01-T01 "$REPO" "$REPORT" "$REPORT" "$LOG" "$LOG"`; clean; `$REPO/$LOG` holds `newer log`.
   - `restore after a save that held nothing copies nothing`: `run_script save "plans/my plan" M01-T01 "$REPO" "plans/my plan/notes/none.md"`; clean; `$HOLD/M01-T01` is a directory; `run_script restore "plans/my plan" M01-T01 "$REPO" "plans/my plan/notes/none.md" "plans/my plan/notes/none.md"`; clean; `$REPO/plans/my plan/notes/none.md` and `$HOLD/M01-T01` don't exist.
   - `restore with nothing held exits 2`: `run_script restore "plans/my plan" M01-T02 "$REPO" "$REPORT" "$REPORT"`; status 2, empty `$output`, `$stderr` equal to `error: nothing held for: M01-T02`.
   - `a linked worktree's files are held in the repository's common git dir`: set `TREE="$BATS_TEST_TMPDIR/task tree"`; `git worktree add --quiet -b task "$TREE"`; `mkdir -p "$TREE/plans/my plan/notes/reports"`; `printf 'tree report\n' > "$TREE/$REPORT"`; `run_script save "plans/my plan" M01-T01 "$TREE" "$REPORT"`; clean; `$HOLD/M01-T01/$REPORT` holds `tree report`; `rm "$TREE/$REPORT"`; `run_script restore "plans/my plan" M01-T01 "$TREE" "$REPORT" "$REPORT"`; clean; `$TREE/$REPORT` holds `tree report`.
   - `hold accepts <plan-dir> and <dir> in both drive-letter forms`: `command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"`; for each of `-m` and `-w`: `run_script save "$(cygpath <form> "$REPO/plans/my plan")" M01-T01 "$(cygpath <form> "$REPO")" "$REPORT"`; clean; `$HOLD/M01-T01/$REPORT` exists; `run_script restore` with the same three leading arguments and `"$REPORT" "$REPORT"`; clean.
   - `hold exits 2 with the wrong arguments`: each of these gives status 2 and empty `$output`, with this `$stderr`: `run_script` → `error: usage: hold save <plan-dir> <key> <dir> <path>... | restore <plan-dir> <key> <dir> <held-path> <dest-path> [<held-path> <dest-path>]...`; `run_script keep` → `error: unknown subcommand: keep`; `run_script save "plans/my plan" M01-T01 "$REPO"` → `error: usage: hold save <plan-dir> <key> <dir> <path>...`; `run_script restore "plans/my plan" M01-T01 "$REPO" "$REPORT"` and `run_script restore "plans/my plan" M01-T01 "$REPO" a b c` → `error: usage: hold restore <plan-dir> <key> <dir> <held-path> <dest-path> [<held-path> <dest-path>]...`.
   - `hold exits 2 when <plan-dir> or <dir> is not a directory`: `run_script save "plans/missing" M01-T01 "$REPO" "$REPORT"` gives status 2, empty `$output`, `$stderr` equal to `error: not a directory: cygpath-stub [-m] [plans/missing]`; `run_script save "plans/my plan" M01-T01 "$BATS_TEST_TMPDIR/missing" "$REPORT"` gives status 2 and `$stderr` equal to `error: not a directory: cygpath-stub [-m] [$BATS_TEST_TMPDIR/missing]`.
   - `hold exits 2 when <dir> is outside a git work tree`: `mkdir -p "$BATS_TEST_TMPDIR/plain dir"`; `run_script save "plans/my plan" M01-T01 "$BATS_TEST_TMPDIR/plain dir" "$REPORT"`; status 2, empty `$output`, `$stderr` equal to `error: not inside a git work tree: cygpath-stub [-m] [$BATS_TEST_TMPDIR/plain dir]`.
3. Run Verify and confirm it fails.
4. Create `plugins/orcastrat/scripts/hold` with the first line `#!/usr/bin/env bash` and a header comment giving the two forms, `hold save <plan-dir> <key> <dir> <path>...` and `hold restore <plan-dir> <key> <dir> <held-path> <dest-path> [<held-path> <dest-path>]...`, and saying: the hold is `<git-common-dir>/orcastrat/<plan-slug>/hold/<key>/`, inside `.git`, where `git reset --hard` and `git clean -fd` don't reach, with `<plan-slug>` the last path component of `<plan-dir>` and the common dir found from `<dir>`; paths are relative to `<dir>`; `save` empties the key, creates its directory, and copies each `<dir>/<path>` that is a file to `<hold>/<key>/<path>`; `restore` copies each `<hold>/<key>/<held-path>` that is a file to `<dir>/<dest-path>`, creating directories, skips a pair whose held file doesn't exist, then deletes the key; both print nothing (D162, D173); errors as D55, plus `nothing held for:` and `cannot copy:`; bash 3.2 compatible. Then source `lib/common` and define `fail()` as `verify` does.
5. Then the argument checks, in this order: `[ "$#" -ge 1 ] || fail 'usage: hold save <plan-dir> <key> <dir> <path>... | restore <plan-dir> <key> <dir> <held-path> <dest-path> [<held-path> <dest-path>]...'`; `cmd=$1`, `shift`; a `case "$cmd"` where `save)` runs `[ "$#" -ge 4 ] || fail 'usage: hold save <plan-dir> <key> <dir> <path>...'`, `restore)` runs `{ [ "$#" -ge 5 ] && [ $(( ($# - 3) % 2 )) -eq 0 ]; } || fail 'usage: hold restore <plan-dir> <key> <dir> <held-path> <dest-path> [<held-path> <dest-path>]...'`, and any other subcommand runs `fail "unknown subcommand: $cmd"`; `plan_dir=$1`, `key=$2`, `dir=$3`, `shift 3`; `[ -d "$plan_dir" ]` and `[ -d "$dir" ]`, each otherwise `fail "not a directory: $(print_path "<that path>")"`; the work-tree check of `verify` lines 32–33 on `"$dir"`; `slug` exactly as `verify` line 37; `common` and `common_abs` exactly as `verify` lines 39–41; `key_dir="$common_abs/orcastrat/$slug/hold/$key"`.
6. Then the two forms. `save`: `rm -rf "$key_dir"`; `mkdir -p "$key_dir" || fail "cannot create: $(print_path "$key_dir")"`; for each remaining argument `p`, skip it unless `[ -f "$dir/$p" ]`, otherwise run `mkdir -p "$(dirname "$key_dir/$p")" && cp -f "$dir/$p" "$key_dir/$p" || fail "cannot copy: $(print_path "$dir/$p")"`. `restore`: `[ -d "$key_dir" ] || fail "nothing held for: $key"`; while two or more arguments remain, set `held="$key_dir/$1"` and `dest="$dir/$2"`, `shift 2`, skip the pair unless `[ -f "$held" ]`, otherwise run `mkdir -p "$(dirname "$dest")" && cp -f "$held" "$dest" || fail "cannot copy: $(print_path "$held")"`; then `rm -rf "$key_dir"`. End the script with `exit 0`.
7. Run Verify and confirm all 14 tests pass (the drive-letter test may be skipped where `cygpath` is absent).

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/hold.bats` reports 14 tests and no failure.
- Files held by `save` survive `git reset --hard` and `git clean -fd`, and `restore` writes them to the destinations given, then empties the key.

### M09-T05: next counts task worktrees in .orcastrat/wt

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: M07-T01
- Files: `plugins/orcastrat/scripts/next`, `tests/orcastrat/next.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/next.bats`
- Fails first: yes
- Commit: `feat(orcastrat): next counts task worktrees in .orcastrat/wt`

**Objective**

`next`'s `worktrees:` line counts the directories directly under `.orcastrat/wt/`, at the top level of the plan's checkout, that hold a `.git` file (D153).

**Read first**

- `docs/orcastrat-execution-spec.md` §6, item 1 (**Worktrees**)
- plan.md Decision D153
- `plugins/orcastrat/scripts/next` lines 1–40 and 225–245
- `tests/orcastrat/next.bats` lines 1–113 and 377–432

**Interfaces**

- Consumes: `next stdout line 8: worktrees: <count of directories directly under <WT_ROOT>/worktrees/ that hold a .git file>` (M07-T01)
- Produces: `.orcastrat/wt/ at the plan checkout's top level (git rev-parse --show-toplevel), the directory whose .git-holding subdirectories next's worktrees: line counts`

**Steps**

1. In `tests/orcastrat/next.bats`, replace the whole test `worktrees counts only task worktrees in the plan's worktrees directory` with a test `worktrees counts only task worktrees in .orcastrat/wt`: `fresh_plan`; `git -C "$REPO" worktree add --quiet -b task-one "$REPO/.orcastrat/wt/M01-T01"`; `git -C "$REPO" worktree add --quiet -b task-two "$REPO/.orcastrat/wt/M01-T02"`; `git -C "$REPO" worktree add --quiet -b task-three "$REPO/.git/orcastrat/demo plan/worktrees/M01-T03"`; `mkdir -p "$REPO/.orcastrat/wt/stray dir" "$REPO/.orcastrat/instructions"`; `git -C "$REPO" worktree add --quiet -b other "$BATS_TEST_TMPDIR/other tree"`; `run_script "$PLAN"`; expect status 0, empty `$stderr`, and `out_line worktrees` equal to `worktrees: 2`.
2. Directly after it, add a test `worktrees is counted at the top level for a relative <plan-dir>`: `fresh_plan`; `git -C "$REPO" worktree add --quiet -b task-one "$REPO/.orcastrat/wt/M01-T01"`; `cd "$REPO"`; `run_script "plans/demo plan"`; expect status 0, empty `$stderr`, and `out_line worktrees` equal to `worktrees: 1`.
3. Run Verify and confirm it fails.
4. In `plugins/orcastrat/scripts/next`, replace the three header-comment lines 27–29, from the line `#   worktrees: <count> of leftover task worktrees in the plan's worktrees` through the line `#     a .git file)`, with these two lines: `#   worktrees: <count> of leftover task worktrees in .orcastrat/wt/ at the` and `#     plan checkout's top level (directories directly under it that hold a .git file)`.
5. Replace the block that starts with the comment line `# worktrees: the number of directories directly under WT_ROOT/worktrees that` and ends with the `fi` that closes its counting loop (the `slug`, `common`, `common_abs`, `wt_root` and `wt_dir` lines and the loop) with: a comment `# worktrees: the number of directories directly under .orcastrat/wt/ at the plan checkout's top level that hold a .git file (D153).`; `top=$(git -C "$plan_dir" rev-parse --show-toplevel) ||` continued on the next line by `  fail "cannot resolve the top level of: $(print_path "$plan_dir")"`; `wt_dir="$top/.orcastrat/wt"`; then the same `worktree_count=0` and counting loop as before, unchanged. Change nothing else.
6. Run Verify and confirm every test passes.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/next.bats` reports no failure.
- `worktrees:` counts only `.git`-holding directories directly under `<top level>/.orcastrat/wt/`, and `next` no longer computes a plan slug or git common dir.

### M09-T06: No skill pins a model

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: M02-T05
- Files: `tests/orcastrat/skill-files.bats`, `plugins/orcastrat/skills/plan/SKILL.md`, `plugins/orcastrat/skills/run/SKILL.md`, `plugins/orcastrat/skills/status/SKILL.md`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats`
- Fails first: yes
- Commit: `feat(orcastrat): no skill pins a model`

**Objective**

A new bats file checks that no skill's frontmatter has a `model:` line and that no skill or reference file contains `$(`, and the `model:` lines of `plan`, `run` and `status` are gone (spec §21 item 2, §20 item 3).

**Read first**

- `docs/orcastrat-execution-spec.md` §21, item 2
- plan.md Decision D168
- `tests/orcastrat/agent-files.bats` lines 1–22 (setup and the `field` helper to copy)
- `plugins/orcastrat/skills/plan/SKILL.md`, `plugins/orcastrat/skills/run/SKILL.md` and `plugins/orcastrat/skills/status/SKILL.md`, lines 1–8 each

**Interfaces**

- Consumes: `tests/orcastrat/test_helper.bash`, loaded with `load test_helper` (M02-T05)
- Consumes: `REPO_ROOT` (M02-T05)
- Consumes: `field <file> <key>` (existing, `tests/orcastrat/agent-files.bats:15`)
- Produces: `tests/orcastrat/skill-files.bats`
- Produces: `skill frontmatter without a model: line in plugins/orcastrat/skills/plan/SKILL.md, plugins/orcastrat/skills/run/SKILL.md and plugins/orcastrat/skills/status/SKILL.md`

**Steps**

1. Create `tests/orcastrat/skill-files.bats`, with no `bats_require_minimum_version` line, as in `agent-files.bats`. Its `setup()` runs `load test_helper` and sets `SKILLS="$REPO_ROOT/plugins/orcastrat/skills"` and `REFERENCE="$REPO_ROOT/plugins/orcastrat/reference"`. Below it, copy the `field` helper, its comment included, from `tests/orcastrat/agent-files.bats` lines 12–22, unchanged.
2. Add these tests:
   - `field reads a frontmatter key and ignores the body`: write `printf -- '---\r\nname: sample\r\nmodel: opus\r\n---\r\n\r\nmodel: haiku\r\n'` to `$BATS_TEST_TMPDIR/SKILL.md`; `field "$BATS_TEST_TMPDIR/SKILL.md" model` prints `opus`, and `field "$BATS_TEST_TMPDIR/SKILL.md" effort` prints nothing.
   - `no skill pins a model`: for each `"$SKILLS"/*/SKILL.md`, count it, and add its directory name to `bad` when `field "$f" model` prints anything; `echo "model pinned in:$bad"`; expect the count to be at least 3 and `bad` empty.
   - `every skill is invoked by name only`: for each `"$SKILLS"/*/SKILL.md`, add its directory name to `bad` unless `field "$f" disable-model-invocation` prints `true`; echo and expect `bad` empty.
   - `no skill or reference file has a command substitution`: for each of `"$SKILLS"/*/SKILL.md` and `"$REFERENCE"/*.md`, add the file's path below `$REPO_ROOT/` to `bad` when `grep -qF '$(' "$f"` succeeds; echo and expect `bad` empty.
3. Run Verify and confirm it fails.
4. Delete the frontmatter line `model: opus` from `plugins/orcastrat/skills/plan/SKILL.md` and from `plugins/orcastrat/skills/run/SKILL.md`, and the frontmatter line `model: haiku` from `plugins/orcastrat/skills/status/SKILL.md`. Change nothing else in the three files.
5. Run Verify and confirm all 4 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats` reports 4 tests and no failure.
- No `SKILL.md` under `plugins/orcastrat/skills/` has a `model:` frontmatter line.

### M09-T07: Add the status-reader agent

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M02-T05
- Files: `plugins/orcastrat/agents/status-reader.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the status-reader agent`

**Objective**

`agents/status-reader.md` exists, a Haiku agent with `tools: Read, Glob, Grep, Bash` that reads a plan's files and git state and replies with `status`'s block in at most 20 lines, and `agent-files.bats` checks it with the other non-worker agents (spec §21 item 1, §22 items 2 and 3).

**Read first**

- `docs/orcastrat-execution-spec.md` §21, item 1, and §22, item 3 (the `status-reader` bullet)
- plan.md Decisions D156, D157, D158 and D167
- `plugins/orcastrat/agents/merger.md` (frontmatter pattern with no `maxTurns` or `effort`)
- `tests/orcastrat/agent-files.bats` (whole file)

**Interfaces**

- Consumes: `NON_WORKER_AGENTS` (existing, `tests/orcastrat/agent-files.bats:9`)
- Consumes: `write_bounds <file>` (existing, `tests/orcastrat/agent-files.bats:55`)
- Consumes: `write_no_prototyping <file>` (existing, `tests/orcastrat/agent-files.bats:68`)
- Consumes: `REPO_ROOT` (M02-T05)
- Produces: `plugins/orcastrat/agents/status-reader.md`
- Produces: `orcastrat:status-reader input: the one line Plan: <plan dir>, or Plan: none`
- Produces: `orcastrat:status-reader reply: the status block, then the open questions, at most 20 lines`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, replace `NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer planner merger'` with `NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer planner merger status-reader'`. In the test `non-worker agents allow exactly the tools of their role`, directly below the line `      merger) expected='Read, Glob, Grep, Edit' ;;`, insert the line `      status-reader) expected='Read, Glob, Grep, Bash' ;;`.
2. In the test `non-worker agents cap their reply at 20 lines`, change the loop body so that for `status-reader` it runs `has_line "$AGENTS/$name.md" 'Your reply is at most 20 lines.' || bad="$bad $name"`, and for every other name it runs the existing `has_line` check, unchanged.
3. At the end of the file, add a test `status-reader has its model, no effort or maxTurns, its input line, its commands and its reply block`: with `f="$AGENTS/status-reader.md"`, `field "$f" name` prints `status-reader`, `field "$f" model` prints `haiku`, `field "$f" effort` and `field "$f" maxTurns` print nothing, and `has_line "$f"` succeeds for each of these lines: `Plan: <plan dir>`; ``- Use the shell only for these read-only commands: `git status --porcelain`, `git worktree list`, and `git log`.``; `<plan title> — <plan status>`; `Worktrees: none | <paths left under .orcastrat/wt/ for inspection>`; `Next: <the exact command or action that comes next>`.
4. Run Verify and confirm it fails.
5. Create `plugins/orcastrat/agents/status-reader.md` with exactly this content:

   ````markdown
   ---
   name: status-reader
   description: "Reads one Orcastrat plan's files and git state and reports its progress, blocks, failures, open questions and next step in at most 20 lines, changing nothing. Dispatched by /orcastrat:status only."
   model: haiku
   tools: Read, Glob, Grep, Bash
   ---

   You report where one Orcastrat plan stands. You change nothing and make no rulings: you read the plan's files and its git state, and reply with the status block below.

   ## No prototyping or duplicate work

   - Don't implement. Never write or run trial code, scripts, tests or fixtures, in the repository, the scratchpad or any temp directory. Never create git worktrees, branches or commits. Write nothing at all: your reply is your only output.
   - Don't redo another agent's work: don't re-survey what the milestone's survey note covers; don't re-run a task's Verify, a Milestone verify or a Final verify; don't re-check facts a Decision or a cited note already records.
   - Settle uncertainty in the plan, not by experiment: a detail only running something would settle becomes an exact Step or Done-when for the worker; an unknown fact becomes an `investigate` task; a design choice is a GAP.
   - Use the shell only for these read-only commands: `git status --porcelain`, `git worktree list`, and `git log`.

   ## Search and command bounds

   - Search only inside the repository, or paths named in your brief or task. Never search from a filesystem root or home directory (`find /`, `find ~`, `find /c`, `find C:\`). Prefer the Glob and Grep tools over `find`.
   - Never start a background command, and never run a command that may not finish within the Bash time limit. If you need information a long command would give, report the question instead of running it.
   - Don't verify environment facts (installed tools, versions) that a task's own Verify or scripts establish. For example, `run-bats.sh` clones bats itself.

   You have no Agent, Task, Skill or Artifact tool, so you can't start subagents, run skills or create artifacts.

   ## Before anything else

   You receive exactly one line:

   ```
   Plan: <plan dir>
   ```

   When it says `Plan: none`, the user named no plan. Find the plan directories with the Glob pattern `plans/*/plan.md`, and reply with only one line per directory found, then the line `Rerun /orcastrat:status <plan dir>, naming one of these.` If there is none, reply only `No plans found under plans/.`

   ## What to read

   Read only these, and nothing else in the plan directory:

   1. `<plan dir>/plan.md`: its title, header fields, Milestones table and Open questions. Never read its Coverage or Decisions: find the line numbers of its `## ` headings with Grep, and read only the parts you need.
   2. The milestone file of every milestone the Milestones table marks `in-progress` or `blocked`: each task heading and its `- Status:`, `- Wave:` and `- Blocked:` lines, found with Grep. Read no other milestone file.
   3. The failure logs: find them with the Glob pattern `<plan dir>/notes/*-failures.md`, and count the lines starting `## Attempt ` in each with Grep's count mode.
   4. `git status --porcelain`, for the Working tree line.
   5. `git worktree list`, for the Worktrees line: the worktrees whose path contains `/.orcastrat/wt/`.
   6. The task trailers on the plan's Branch, named by the `- Branch:` line of plan.md: run `git log <Branch> -E --grep="^(Orcastrat|Orchestratinator)-Task: " --format=%B`, and note the task ID on each line starting `Orcastrat-Task: ` or `Orchestratinator-Task: `. If the branch doesn't exist, there are none.

   ## Report

   Reply in this shape and nothing more:

   ```
   <plan title> — <plan status>
   Milestones: <done>/<total> done  (<n> outline, <n> ready, <n> in-progress, <n> blocked)
   Current: <milestone ID and title>, <done>/<total> tasks done, wave <n> of <count>
   Blocked: <item, reason, one-line detail>        (omit if none)
   Failures: <task ID> (<n> failed attempts), ...   (omit if none)
   Open questions: <count>, listed below            (omit if none)
   Working tree: clean | <n> uncommitted paths
   Worktrees: none | <paths left under .orcastrat/wt/ for inspection>
   Next: <the exact command or action that comes next>
   ```

   Then list the open questions, one per line, with their tags.

   - **Failures:** every task that has a failure log, `<plan dir>/notes/<task ID>-failures.md`, whatever its status, with `<n>` the number of lines starting `## Attempt ` in that log.
   - **Next:** exactly one of these. If the ID of a `todo` task is among the trailers on the Branch, its work is committed but its status isn't: `rerun /orcastrat:run <plan dir>, which records <task IDs> as done`, naming every such task. Otherwise: rerun `/orcastrat:run <plan dir>`; resolve the block (say which); answer the open questions and record them under Decisions; commit or discard uncommitted changes; or nothing, the plan is complete.

   Your reply is at most 20 lines.

   When the open questions don't all fit, list as many as fit and make the last line `... <n> more in <plan dir>/plan.md`.
   ````

6. Run Verify and confirm all 21 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats` reports 21 tests and no failure.
- `status-reader` has `model: haiku`, `tools: Read, Glob, Grep, Bash`, no `effort` or `maxTurns`, the bounds and no-prototyping sections, and the reply block with the `.orcastrat/wt/` Worktrees line.

### M09-T08: Add the full instruction review and the Instructions max lines field

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M09-T03
- Files: `plugins/orcastrat/reference/instruction-review.md`, `plugins/orcastrat/reference/plan-format.md`
- Verify: `r=plugins/orcastrat/reference/instruction-review.md; p=plugins/orcastrat/reference/plan-format.md; grep -A1 -F '| Max milestones |' "$p" | grep -qF '| Instructions max lines | Optional:' && grep -qxF '# Instruction-file review' "$r" && grep -qF 'scripts/instructions-ack" <choice> "<file>" ...' "$r" && grep -qF 'Stop and fix it' "$r" && grep -qF 'No instruction-file findings: nothing to clean up.' "$r" && grep -qF 'Would removing this cause Claude to make mistakes?' "$r" && grep -qF '| Imported content | Content moved into `@` imports |' "$r" && ! grep -qF '$(' "$r"`
- Fails first: no (reference text with no test; the Verify greps fail until both files are written)
- Commit: `feat(orcastrat): add the full instruction review and the Instructions max lines field`

**Objective**

`reference/instruction-review.md` describes the full instruction-file review that `plan` and `run` read only when `instructions-ack --check` prints `REVIEW`, and the plan format documents the optional `Instructions max lines` header field (spec §17, D29, D166).

**Read first**

- `docs/orcastrat-execution-spec.md` §17 (Change 16), whole section
- plan.md Decisions D147, D148, D150, D152, D164, D165, D166, D171 and D175
- `plugins/orcastrat/reference/plan-format.md` lines 66–80 (the header-fields table)

**Interfaces**

- Consumes: `instructions-ack <continue|stop> <file>...` (M09-T03)
- Produces: `plugins/orcastrat/reference/instruction-review.md`
- Produces: `Instructions max lines: <n>, an optional plan.md header field`
- Produces: `<repository root>/.orcastrat/instructions/review.md, with exactly one line starting Conflicts:`
- Produces: `<repository root>/.orcastrat/instructions/fix-prompt.md`

**Steps**

1. In `plugins/orcastrat/reference/plan-format.md`, directly below the header-fields table row that starts `| Max milestones |`, insert this line:

   ```text
   | Instructions max lines | Optional: absent by default, meaning no threshold, or `<n>`. When it is set, `run`'s instruction-file check adds a size finding once the instruction files it loads hold more than `<n>` lines in total. `plan` never uses it: its checks run before plan.md exists. |
   ```

2. Create `plugins/orcastrat/reference/instruction-review.md` with exactly this content:

   ````markdown
   # Instruction-file review

   `plan` and `run` read this file only when `instructions-ack --check` printed `REVIEW`: an instruction file changed, was added or was removed since the user last chose Continue, or the files were never acknowledged. It is the full review. Orcastrat never edits an instruction file: the review reports, and what to change is up to the user.

   You start with:

   - **The files** the instruction-file check found, each relative to the repository root, with `/` between its parts.
   - **The threshold.** For `run`, the value `<n>` of the plan header line `- Instructions max lines: <n>`: Grep `<plan dir>/plan.md` for `^- Instructions max lines:`. With no such line there is no threshold. `plan` never has one: its start checks run before plan.md exists.
   - **`--yes`**, if the user gave it.

   `<repository root>` is the directory `git rev-parse --show-toplevel` prints. Write the review and the fix prompt with the Write tool, in `<repository root>/.orcastrat/instructions/`. The toolchain check's exclude line keeps that directory out of `git status`, and `git clean -fd` never removes it. Never write inside `.git` yourself: the acknowledgement goes through the `instructions-ack` script.

   ## 1. Complete the file set

   1. Read every file in full.
   2. Add the files they import. An import is `@` followed by a path, such as `@docs/rules.md`, `@~/.claude/my-rules.md` or `@/etc/team-rules.md`, outside any backtick code span and outside any fenced code block. A relative path resolves from the directory of the file that holds the import, and `~` is your home directory. Add each imported file that exists to the set, read it in full, and resolve its own imports the same way, at most four hops from a file the check found. Write an imported path relative to the repository root, with `/` between its parts, when it is inside the repository, and otherwise as its absolute path with `/` between its parts.
   3. Read `~/.claude/CLAUDE.md` if it exists. It is information only: it isn't in the set, gets no findings, and isn't acknowledged.

   ## 2. Find the findings

   Every finding cites `path:line`, its file and the first line of the passage, and has a class and an action.

   **Leanness**, content that every session and every worker pays for without needing it:

   | Class | What it is | Action |
   |---|---|---|
   | Derivable content | File trees, file-by-file descriptions, content Claude can derive from the code | Run `/doctor`, which proposes these cuts. |
   | API reference | Detailed API reference | Replace it with a link to the docs. |
   | Sometimes relevant | Knowledge relevant only sometimes | Move it to a skill, which loads on demand. |
   | Always required | A rule that must hold every time | Convert it to a hook. |
   | Self-evident | Standard conventions, self-evident advice | Delete it. |
   | Emphasis | Emphasis (`IMPORTANT`, capitals) on many lines | Keep it on the one rule Claude actually skips. |
   | Imported content | Content moved into `@` imports | Imports load too. Move it to a skill instead. |

   For derivable content, flag the location only: `/doctor` does the analysis, so don't repeat it.

   **Conflicts**, rules that work against an Orcastrat run: pushing, switching branches or rewriting history; running the whole test suite after every change; skipping tests or verification. A rule to commit is not a conflict. Action: `Remove it, or scope it to work outside Orcastrat runs.`

   **Size**, only with a threshold: when the files of the set hold more than `<n>` lines in total, one finding, citing the longest file at line 1: `<total> lines load, over the threshold of <n>.` Action: `Apply the other findings' actions until the total is under <n>.`

   ## 3. Write the review

   Write `.orcastrat/instructions/review.md`, replacing any earlier one, in this shape:

   ```markdown
   # Instruction-file review

   Conflicts: <none, or the count, a colon, and each conflict's path:line>

   Files reviewed: <count>, <total> lines.

   ## Findings

   ### <class> (<count>)

   - `<path:line>`: <what the passage is, in a few words>. Action: <the class's action>

   ## General checks

   - Run `/doctor`: it proposes cuts for file trees, file-by-file descriptions and content Claude can derive from the code.
   - Run `/context` to confirm which instruction files actually loaded.
   - For each line, ask: "Would removing this cause Claude to make mistakes?" If not, cut it.

   ## User-level instructions (information only)

   `~/.claude/CLAUDE.md`: <its line count> lines, loaded in every project. It isn't checked.
   ```

   - The `Conflicts:` line is exactly one line: `Conflicts: none`, or `Conflicts: <count>: ` followed by each conflict's `path:line`, separated by `, `. `plan` and `run` show it on every later start while the files stay acknowledged.
   - Give one `###` section per class that has findings: Conflicts first, then the leanness classes in the table's order, then Size. With no findings, `## Findings` holds the one line `None.`
   - Without `~/.claude/CLAUDE.md`, the last section holds the one line `~/.claude/CLAUDE.md: not present.`

   ## 4. Write the fix prompt

   Write `.orcastrat/instructions/fix-prompt.md`, replacing any earlier one. With findings, it is exactly this text:

   ```markdown
   Clean up this repository's Claude Code instruction files, following the review in `.orcastrat/instructions/review.md`.

   1. Re-read CLAUDE.md, AGENTS.md and `.orcastrat/instructions/review.md` in full, even if you think you know them.
   2. Produce a plan with a detailed task list for the cleanup. Each task needs no new reasoning or design decisions, and is small and mechanical enough for Sonnet: it names the file and the lines it changes, and gives the exact text to remove, move or write.
   3. Then execute the tasks, one at a time, in order.

   Change only what the review lists. Where an action moves content into a skill or a hook, creating that skill or hook is a task of its own. For the file trees and derivable content the review flags, run `/doctor` and apply its cuts instead of repeating its analysis.
   ```

   With no findings, it is the one line `No instruction-file findings: nothing to clean up.`

   ## 5. Acknowledge, report and ask

   The acknowledgement records every file of the set, imports included and `~/.claude/CLAUDE.md` left out. Run it as one line, from the repository root: `cd "<repository root>" && bash "${CLAUDE_PLUGIN_ROOT}/scripts/instructions-ack" <choice> "<file>" ...`, passing each file in double quotes. If it exits 2, end before anything starts, quoting its `error:` line (for `run`, reason SETUP).

   - **No findings:** acknowledge with choice `continue`, with or without `--yes`, and go on to the model check without a word.
   - **Findings, under `--yes`:** don't ask and don't acknowledge, so the next start reviews the files again. Show one line, `Instruction files: <count> findings (<count> <class>, ...). Review: .orcastrat/instructions/review.md`, and go on to the model check.
   - **Findings, otherwise:** show a summary of at most 10 lines. Its first line is `Instruction files: <count> findings (<count> <class>, ...)`. Then one line per finding, `<path:line> <class>: <action>`, conflicts first, at most 8 lines: with more than 8 findings, show 7 and then `... <count> more in .orcastrat/instructions/review.md`. Its last line is `Review: .orcastrat/instructions/review.md`. Then ask with the AskUserQuestion tool: one question, `The instruction files have <count> findings. Stop to fix them, or continue?`, header `Instructions`, single choice, with two options:
     - `Stop and fix it`, description `Exit now. Paste .orcastrat/instructions/fix-prompt.md into Claude Code, or run /doctor, then start again.`
     - `Continue`, description `Go on. You won't be asked again until these files change.`

     On `Continue`, acknowledge with choice `continue` and go on to the model check. On `Stop and fix it`, or any other answer, acknowledge with choice `stop`, then end before anything starts: tell the user `Stopped before anything started. To clean up, paste .orcastrat/instructions/fix-prompt.md into Claude Code, or run /doctor.` Write and commit nothing else: no plan files, no marker, no stop reason.
   ````

3. Run Verify.

**Done when**

- The header-fields table has the `Instructions max lines` row directly below `Max milestones`.
- `reference/instruction-review.md` has the five sections above, word for word, and no `$(`.

### M09-T09: status dispatches status-reader and relays its report

- Kind: change
- Tier: worker
- Status: done
- Wave: 3
- Depends on: M09-T06, M09-T07
- Files: `plugins/orcastrat/skills/status/SKILL.md`
- Verify: `f=plugins/orcastrat/skills/status/SKILL.md; grep -qF 'Invoke the agent `orcastrat:status-reader`' "$f" && grep -qF '`Plan: none`' "$f" && grep -qF 'Relay its reply to the user verbatim' "$f" && grep -qxF 'disable-model-invocation: true' "$f" && ! grep -q '^model:' "$f" && ! grep -qF 'context: fork' "$f" && ! grep -qF 'git log --oneline' "$f" && ! grep -qF '$(' "$f"`
- Fails first: no (skill text with no test; the Verify greps fail until the file is rewritten)
- Commit: `feat(orcastrat): status dispatches status-reader and relays its report`

**Objective**

The `status` skill only dispatches `orcastrat:status-reader` with `Plan: <plan dir>` or `Plan: none` and relays its reply verbatim, with no `model:` pin and no `context: fork` (spec §21 item 1, D167).

**Read first**

- `docs/orcastrat-execution-spec.md` §21, item 1
- plan.md Decision D167
- `plugins/orcastrat/skills/status/SKILL.md` (whole file)

**Interfaces**

- Consumes: `orcastrat:status-reader input: the one line Plan: <plan dir>, or Plan: none` (M09-T07)
- Consumes: `orcastrat:status-reader reply: the status block, then the open questions, at most 20 lines` (M09-T07)
- Consumes: `skill frontmatter without a model: line in plugins/orcastrat/skills/plan/SKILL.md, plugins/orcastrat/skills/run/SKILL.md and plugins/orcastrat/skills/status/SKILL.md` (M09-T06)
- Produces: `plugins/orcastrat/skills/status/SKILL.md dispatching orcastrat:status-reader`

**Steps**

1. Replace the whole content of `plugins/orcastrat/skills/status/SKILL.md` with exactly this:

   ```markdown
   ---
   name: status
   description: Summarize an Orcastrat plan's progress, blocks, open questions, and next step, without changing anything. Only run when the user explicitly invokes it.
   disable-model-invocation: true
   argument-hint: "<plan dir>"
   ---

   # Status

   Argument: `$ARGUMENTS` (the plan directory, optional).

   This is read-only, and you do none of the reading yourself: a Haiku subagent does it, so this skill never switches your session's model.

   1. Invoke the agent `orcastrat:status-reader` with exactly one line: `Plan: <plan dir>`, with the directory the argument names, or `Plan: none` when there is no argument.
   2. Relay its reply to the user verbatim, as your whole reply: add nothing, drop nothing, and don't reformat it.

   Read no file and run no command yourself.
   ```

2. Run Verify.

**Done when**

- `status/SKILL.md` has the content above, with no `model:` line and no `context: fork`.

### M09-T10: run starts with the toolchain check

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M06-T03, M09-T01, M09-T02, M09-T06
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `f=plugins/orcastrat/skills/run/SKILL.md; awk '/^## Start checks$/{s=NR} /^### Toolchain check$/{t=NR} /^## 1\. Re-read the ground truth$/{r=NR} END{exit !(s && t && r && s<t && t<r)}' "$f" && grep -qF 'scripts/run-state" drop' "$f" && grep -qF 'scripts/ensure-exclude"' "$f" && grep -qF "Orcastrat can't start: the toolchain check failed." "$f" && grep -qF 'git config core.longpaths true' "$f" && grep -cF '**Working tree is clean.**' "$f" | grep -qx 1 && grep -cF '**Active run.**' "$f" | grep -qx 1 && grep -oF "the toolchain check's item 7" "$f" | grep -c . | grep -qx 3 && grep -qF 'from 2a item 5:' "$f" && grep -qF '1. **Plan status.**' "$f" && grep -qF '6. **Pre-rename leftovers.**' "$f" && grep -qF '(the one write in these checks)' "$f" && ! grep -qF '2a item 2' "$f" && ! grep -qF '2a item 7' "$f" && ! grep -qF 'rm -f' "$f" && ! grep -qF '$(' "$f"`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run starts with the toolchain check`

**Objective**

`run` opens with a `## Start checks` section whose `### Toolchain check` checks bash, git, the work tree and the commit identity, then runs `next`, the active-run check (removing a stale marker with `run-state drop`), the clean-tree check, `ensure-exclude`, the worktree-leftover report and the Windows long-paths warning; section 2a keeps its other six checks (spec §20 item 6, D150, D151, D154, D155, D169, D172).

**Read first**

- `docs/orcastrat-execution-spec.md` §20, item 6
- plan.md Decisions D150, D154, D155, D159, D169 and D172
- `plugins/orcastrat/skills/run/SKILL.md` sections `## Definitions` (the **MAIN**, **Scripts** and **Next** bullets), `## 1. Re-read the ground truth`, `### 2a. Checks`, `### 2b. Ask for approval` and `### 2c. Prepare`

**Interfaces**

- Consumes: `run-state drop` (M09-T01)
- Consumes: `ensure-exclude, with no arguments: adds the line /.orcastrat/ to the file git rev-parse --git-path info/exclude names, unless a line equals it; prints nothing` (M09-T02)
- Consumes: `next stdout lines 7-9: recover: <recover lines joined by "; ">, worktrees: <count>, marker: none, marker: active <n>m or marker: stale` (M06-T03)
- Produces: `## Start checks section with ### Toolchain check, directly above ## 1. Re-read the ground truth in plugins/orcastrat/skills/run/SKILL.md`
- Produces: `the toolchain check's item 7, run's clean-tree check`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `## 1. Re-read the ground truth`, replace the whole line of item 4, which starts `4. Where the run stands: run **next**`, with this line:

   ```text
   4. Where the run stands: the nine lines of **next** from item 5 of the toolchain check (see **Start checks**). Keep them for the preflight.
   ```

2. In section `### 2a. Checks`, delete item 1 and item 2: the line that starts `1. **Active run.**` with the three indented lines below it (they start ``   - `marker: none` ``, ``   - `marker: stale` `` and ``   - `marker: active <n>m` ``), and the line that starts `2. **Working tree is clean.**`.
3. Renumber the six remaining items of 2a, changing only each item's leading number: `3. **Plan status.**` becomes `1.`, `4. **Open blocks.**` becomes `2.`, `5. **Leftover worktrees.**` becomes `3.`, `6. **Branch.**` becomes `4.`, `7. **Interrupted-run recovery.**` becomes `5.`, and `8. **Pre-rename leftovers.**` becomes `6.`. In the **Pre-rename leftovers** item, replace `(the other write in these checks, besides item 1's)` with `(the one write in these checks)`.
4. Replace all 3 occurrences of `2a item 2` (one in section 2b, two in 2c item 2) with `the toolchain check's item 7`. In 2c item 3, replace `from 2a item 7:` with `from 2a item 5:`.
5. Directly above the line `## 1. Re-read the ground truth`, insert these lines:

   ```markdown
   ## Start checks

   Run these three checks first, in this order, before anything else in this skill: before step 1's reads, before any survey or question, before `Proceed?`, and before 2c item 6 writes the marker. When a check ends the run here, including a script that exits 2 (see Definitions, **Scripts**), report the reason and stop there: skip the **Stop** section's steps, and write and commit nothing, so there is no marker, no `run-state end`, no plan-file change and no commit.

   ### Toolchain check

   Run items 1 to 4 directly with whatever shell tool the platform gives you (on Windows without Git Bash, the PowerShell tool), never through a script: bash may be missing.

   1. **bash.** Run `bash --version`. It passes when the command runs and its first line reports version 3.2 or later.
   2. **git.** Run `git --version`. It passes when the command runs and reports version 2.17 or later, the oldest with `git worktree remove`.
   3. **Repository.** Run `git rev-parse --is-inside-work-tree`. It passes when it prints `true`: the current directory is inside a git work tree, not a bare repository.
   4. **Commit identity.** Run `git config user.name` and `git config user.email`. It passes when each prints a value. Workers commit, so a missing identity would fail every task.

   If any of items 1 to 4 fails, end the run with reason SETUP. Tell the user, in one message, `Orcastrat can't start: the toolchain check failed.`, then one line for each failed item, all of them at once: `- <item>: <what the command printed, or that it didn't run>. Fix: <the fix>`. Take the fix from this list, for the platform your environment reports (`win32` is native Windows):

   - bash or git, on native Windows: `Install Git for Windows (https://git-scm.com/download/win), which provides both bash and git, then restart Claude Code.`
   - bash, elsewhere: `Install bash 3.2 or later with your system package manager. Minimal containers, such as Alpine-based ones, ship sh without bash.`
   - git, elsewhere: `Install git 2.17 or later with your system package manager.`
   - Repository: `Run git init to make this directory a repository, or start Claude Code inside a git work tree.`
   - Commit identity: `Run git config --global user.name "Your Name" and git config --global user.email "you@example.com".`

   Once items 1 to 4 pass:

   5. **Where the run stands.** Run **next** (see Definitions).
   6. **Active run.** Read the `marker:` line of **next**, this checkout's active-run marker. A run writes it in 2c item 6 and removes it at its **Pause**, **Stop** or completion.
      - `marker: none`: go on.
      - `marker: stale`: its heartbeat is more than an hour old, or unreadable, so a crashed session left it. Remove it, which is a write: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" drop`. It deletes the marker without adding an `end` line to the crashed run's run log. Tell the user in one line: `Removed a stale run marker left by a crashed session.` Then go on.
      - `marker: active <n>m`: another run is active in this checkout, and its last heartbeat was <n> minutes ago. Only one run may be active per checkout. End the run here, before anything changes, and skip the rest of the start checks: item 7's advice to commit or discard would touch the other run's changes. Tell the user in one line that another Orcastrat run is active in this checkout, naming its marker, `<the directory git rev-parse --git-dir prints>/orcastrat/active-run`, and saying that a later run removes it once its heartbeat is more than an hour old. Runs in other worktrees of this repository have their own markers and never stop this one.
   7. **Working tree is clean.** `git status --porcelain` prints nothing: no uncommitted changes, and no untracked files outside `.gitignore`. It may print one other thing, a **detailed but uncommitted milestone**: the `milestone:` line of **next** says `ready`, and every path printed is `<plan dir>/plan.md`, that milestone's file, one of its survey notes `<plan dir>/notes/<ID>-survey*.md`, or its plan-review report `<plan dir>/notes/<ID>-plan-review.md`; 2c item 2 finishes that milestone. If it prints anything else, end the run with reason SETUP and list the paths it printed: the user must commit or discard them first. Uncommitted changes in a task's Files are never treated as an interrupted attempt: they may be the user's own edits, which a reset and clean would destroy. A failed attempt is cleaned with `git clean -fd`, which would otherwise delete the user's untracked files.
   8. **Exclude line.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/ensure-exclude"`. It adds the line `/.orcastrat/` to `.git/info/exclude` when it's missing, so the task worktrees under `.orcastrat/wt/` and the instruction-check files under `.orcastrat/instructions/` never show up in `git status`, and `git clean -fd` never removes them.
   9. **Worktree leftovers.** Run `git worktree prune`, then `git worktree list --porcelain`, then `ls "<MAIN>/.orcastrat/wt"`. A directory `<name>` that `ls` prints is left over when no `worktree ` line of `git worktree list` ends with `/.orcastrat/wt/<name>`. If there are any, tell the user in one line: `Left over under .orcastrat/wt/, no longer a git worktree: <names>. Delete them yourself once you don't need them.` Never delete them yourself. If `ls` fails because `<MAIN>/.orcastrat/wt` doesn't exist, there is nothing to report. This item never ends the run.
   10. **Long paths.** Only on native Windows (`win32`): run `git config core.longpaths`. If it doesn't print `true`, warn the user once, in one line, without stopping: `Warning: git's core.longpaths isn't true, so paths longer than 260 characters in nested worktrees can fail. To allow them, run: git config core.longpaths true`. Never change git config yourself.
   ```

6. Run Verify.

**Done when**

- `## Start checks` with `### Toolchain check` sits directly above `## 1. Re-read the ground truth`, with the ten items above.
- Section 2a has six items (Plan status, Open blocks, Leftover worktrees, Branch, Interrupted-run recovery, Pre-rename leftovers), and 2b and 2c name `the toolchain check's item 7` and `2a item 5`.
- The skill has no `rm -f` and no `$(`, and nothing else in it changed.

### M09-T11: plan starts with the toolchain check

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M09-T02, M09-T06
- Files: `plugins/orcastrat/skills/plan/SKILL.md`
- Verify: `f=plugins/orcastrat/skills/plan/SKILL.md; awk '/^## No prototyping or duplicate work$/{n=NR} /^## Start checks$/{s=NR} /^### Toolchain check$/{t=NR} /^## 1\. Re-read the ground truth$/{r=NR} END{exit !(n && s && t && r && n<s && s<t && t<r)}' "$f" && grep -qF 'scripts/ensure-exclude"' "$f" && grep -qF "Orcastrat can't start: the toolchain check failed." "$f" && grep -qF 'A missing bash, or one older than 3.2, ends `plan` too' "$f" && grep -qF 'There are two exceptions: the **Start checks**' "$f" && grep -qF 'git config core.longpaths true' "$f" && ! grep -qF 'The one exception is a small job' "$f" && ! grep -qF '$(' "$f"`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): plan starts with the toolchain check`

**Objective**

`plan` opens with a `## Start checks` section whose `### Toolchain check` checks bash, git, the work tree and the commit identity, ending the skill before surveying on any failure, a missing bash included, then runs `ensure-exclude`, the worktree-leftover report and the Windows long-paths warning (spec §20 item 6, D150, D169, D172, D176).

**Read first**

- `docs/orcastrat-execution-spec.md` §20, item 6
- plan.md Decisions D150, D154, D169, D172 and D176
- `plugins/orcastrat/skills/plan/SKILL.md` lines 1–38 (options, `## No prototyping or duplicate work`, `## 1. Re-read the ground truth`)

**Interfaces**

- Consumes: `ensure-exclude, with no arguments: adds the line /.orcastrat/ to the file git rev-parse --git-path info/exclude names, unless a line equals it; prints nothing` (M09-T02)
- Produces: `## Start checks section with ### Toolchain check, directly above ## 1. Re-read the ground truth in plugins/orcastrat/skills/plan/SKILL.md`

**Steps**

1. In `plugins/orcastrat/skills/plan/SKILL.md`, section `## No prototyping or duplicate work`, replace `These rules hold while you plan. The one exception is a small job you do directly in step 10: there you implement, verify and commit its tasks as that step says.` with `These rules hold while you plan. There are two exceptions: the **Start checks**, which run only the commands and write only the files they name, and a small job you do directly in step 10, where you implement, verify and commit its tasks as that step says.`
2. Directly above the line `## 1. Re-read the ground truth`, insert these lines:

   ```markdown
   ## Start checks

   Run these three checks first, in this order, before anything else in this skill: before step 1's reads, and before any survey or question. When a check ends this skill here, including a script that exits 2 with an `error:` line, tell the user why, quoting that line, and end your reply: write nothing else, so there is no plan directory and no commit. `<repository root>` below is the directory `git rev-parse --show-toplevel` prints.

   ### Toolchain check

   Run items 1 to 4 directly with whatever shell tool the platform gives you (on Windows without Git Bash, the PowerShell tool), never through a script: bash may be missing.

   1. **bash.** Run `bash --version`. It passes when the command runs and its first line reports version 3.2 or later.
   2. **git.** Run `git --version`. It passes when the command runs and reports version 2.17 or later, the oldest with `git worktree remove`.
   3. **Repository.** Run `git rev-parse --is-inside-work-tree`. It passes when it prints `true`: the current directory is inside a git work tree, not a bare repository.
   4. **Commit identity.** Run `git config user.name` and `git config user.email`. It passes when each prints a value. Workers commit, so a missing identity would fail every task.

   If any of items 1 to 4 fails, end here, before surveying. Tell the user, in one message, `Orcastrat can't start: the toolchain check failed.`, then one line for each failed item, all of them at once: `- <item>: <what the command printed, or that it didn't run>. Fix: <the fix>`. Take the fix from this list, for the platform your environment reports (`win32` is native Windows). A missing bash, or one older than 3.2, ends `plan` too: the instruction-file check runs shipped scripts.

   - bash or git, on native Windows: `Install Git for Windows (https://git-scm.com/download/win), which provides both bash and git, then restart Claude Code.`
   - bash, elsewhere: `Install bash 3.2 or later with your system package manager. Minimal containers, such as Alpine-based ones, ship sh without bash.`
   - git, elsewhere: `Install git 2.17 or later with your system package manager.`
   - Repository: `Run git init to make this directory a repository, or start Claude Code inside a git work tree.`
   - Commit identity: `Run git config --global user.name "Your Name" and git config --global user.email "you@example.com".`

   Once items 1 to 4 pass:

   5. **Exclude line.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/ensure-exclude"`. It adds the line `/.orcastrat/` to `.git/info/exclude` when it's missing, so the task worktrees under `.orcastrat/wt/` and the instruction-check files under `.orcastrat/instructions/` never show up in `git status`, and `git clean -fd` never removes them.
   6. **Worktree leftovers.** Run `git worktree prune`, then `git worktree list --porcelain`, then `ls "<repository root>/.orcastrat/wt"`. A directory `<name>` that `ls` prints is left over when no `worktree ` line of `git worktree list` ends with `/.orcastrat/wt/<name>`. If there are any, tell the user in one line: `Left over under .orcastrat/wt/, no longer a git worktree: <names>. Delete them yourself once you don't need them.` Never delete them yourself. If `ls` fails because `<repository root>/.orcastrat/wt` doesn't exist, there is nothing to report. This item never ends the skill.
   7. **Long paths.** Only on native Windows (`win32`): run `git config core.longpaths`. If it doesn't print `true`, warn the user once, in one line, without stopping: `Warning: git's core.longpaths isn't true, so paths longer than 260 characters in nested worktrees can fail. To allow them, run: git config core.longpaths true`. Never change git config yourself.
   ```

3. Run Verify.

**Done when**

- `## Start checks` with `### Toolchain check` sits between `## No prototyping or duplicate work` and `## 1. Re-read the ground truth`, with the seven items above.
- The no-prototyping section names the Start checks and step 10 as its two exceptions, and nothing else in the file changed.

### M09-T12: run's instruction-file and model checks

- Kind: change
- Tier: worker
- Status: done
- Wave: 3
- Depends on: M09-T03, M09-T08, M09-T10
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `f=plugins/orcastrat/skills/run/SKILL.md; awk '/^### Toolchain check$/{t=NR} /^### Instruction-file check$/{i=NR} /^### Model check$/{m=NR} /^## 1\. Re-read the ground truth$/{r=NR} END{exit !(t && i && m && r && t<i && i<m && m<r)}' "$f" && grep -qF 'scripts/instructions-ack" --check "<file>" ...' "$f" && grep -qF 'reference/instruction-review.md' "$f" && grep -qF 'model-notice <UTC> <model ID>' "$f" && grep -qF 'If the model check noted a `model-notice` line' "$f" && grep -qF 'the instruction-file check and the model check never ask either' "$f" && grep -qF '`.orcastrat/instructions/review.md` and `fix-prompt.md`' "$f" && grep -qF '`Continue on this model`' "$f" && ! grep -qF '$(' "$f"`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run checks the instruction files and the session model at start`

**Objective**

`run`'s start checks go on with the quick instruction-file check, which compares the files with the acknowledgement through `instructions-ack --check` and reads the full review only on `REVIEW`, and the model check, which asks **Stop** or **Continue on this model** off Opus, or under `--yes` logs a `model-notice` line in 2c item 6 (spec §17, §21 item 2, D148, D149, D170, D171).

**Read first**

- `docs/orcastrat-execution-spec.md` §17, items 1, 7, 8 and 9, and §21, item 2
- plan.md Decisions D148, D149, D170 and D171
- `plugins/orcastrat/reference/instruction-review.md` section `## 5. Acknowledge, report and ask` (how the review ends)
- `plugins/orcastrat/skills/run/SKILL.md` lines 11–22 (arguments and the opening paragraph), section `## Start checks`, and section `### 2c. Prepare` item 6

**Interfaces**

- Consumes: `instructions-ack --check <file>...` (M09-T03)
- Consumes: `instructions-ack --check stdout: OK or REVIEW` (M09-T03)
- Consumes: `plugins/orcastrat/reference/instruction-review.md` (M09-T08)
- Consumes: `<repository root>/.orcastrat/instructions/review.md, with exactly one line starting Conflicts:` (M09-T08)
- Consumes: `## Start checks section with ### Toolchain check, directly above ## 1. Re-read the ground truth in plugins/orcastrat/skills/run/SKILL.md` (M09-T10)
- Produces: `### Instruction-file check and ### Model check in run's Start checks`
- Produces: `model-notice <UTC> <model ID>, a line in <plan dir>/notes/run-log.md`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, replace the whole line ``- `--yes`: approval given in advance, for unattended or non-interactive runs. Without it, you ask before executing anything (2b).`` with the line ``- `--yes`: approval given in advance, for unattended or non-interactive runs. Without it, you ask before executing anything (2b). Under it, the instruction-file check and the model check never ask either (see **Start checks**).``
2. In the opening paragraph, replace ``The only files you edit are plan.md, milestone files, and the notes files this skill names (a task's failure log and `notes/run-log.md`), and only the fields and lines this skill names.`` with ``The only files you edit are plan.md, milestone files, the notes files this skill names (a task's failure log and `notes/run-log.md`), and the instruction-check files `.orcastrat/instructions/review.md` and `fix-prompt.md` (see **Start checks**), and only the fields and lines this skill names.``
3. Directly above the line `## 1. Re-read the ground truth`, insert these lines:

   ```markdown
   ### Instruction-file check

   Claude Code loads the project's instruction files into this session and into every worker, so every task pays for every line. This check looks for content that costs more than it helps, and for rules that work against a run. It never edits an instruction file.

   1. **Find the files.** With the Glob tool, searching `<MAIN>`, find `**/CLAUDE.md`, `**/CLAUDE.local.md`, `**/AGENTS.md`, `**/.claude/CLAUDE.md`, `**/.claude/AGENTS.md` and `.claude/rules/**/*.md`. Drop every path inside a `.git` or `.orcastrat` directory, and every duplicate. Write each path relative to `<MAIN>`, with `/` between its parts, for example `CLAUDE.md`, `.claude/rules/style.md` or `src/api/CLAUDE.md`. If no file is found, skip the rest of this check.
   2. **Compare them with the acknowledgement.** Run `cd "<MAIN>" && bash "${CLAUDE_PLUGIN_ROOT}/scripts/instructions-ack" --check "<file>" ...`, passing every path from item 1 in double quotes. It adds the imported files the last review recorded, hashes every file, and prints `OK` when the file set and each file are unchanged since the user last chose Continue, or `REVIEW` otherwise. Never hash a file or read the acknowledgement yourself.
   3. **`OK`.** Grep `<MAIN>/.orcastrat/instructions/review.md` for `^Conflicts:`, passing that file's path, since Grep skips excluded directories unless it is given the path. If it finds a line other than `Conflicts: none`, show the user that line. Then go on to the model check.
   4. **`REVIEW`.** Read `${CLAUDE_PLUGIN_ROOT}/reference/instruction-review.md` and do the full review it describes for `run`, with the files from item 1 and `<MAIN>` as the repository root. The review either goes on to the model check or ends the run.

   ### Model check

   Planning and orchestration are designed for Opus. Your system prompt names the model you run on.

   - If its name or ID contains `opus`, in any case, go on.
   - Otherwise, without `--yes`, show the user one line: `This session runs on <model>. Planning and orchestration are designed for Opus.` Then ask with the AskUserQuestion tool: one question, `Stop, or continue on this model?`, header `Model`, single choice, with the options `Stop` (description `End now, so you can restart the session on Opus.`) and `Continue on this model` (description `Go on with <model>.`). On `Continue on this model`, go on. On `Stop`, or any other answer, end the run: tell the user it stopped before anything started, and write and commit nothing.
   - Otherwise, under `--yes`, don't ask. Note the line `model-notice <UTC> <model ID>`, with the current UTC time from `date -u +%Y-%m-%dT%H:%M:%SZ` and the model ID your system prompt gives, and go on. 2c item 6 appends it to the run log.
   ```

4. In section `### 2c. Prepare`, item 6, directly after the sentence `Keep the heartbeat from here on (see Operating rules).` at the end of that line, on the same line and after one space, add: ``If the model check noted a `model-notice` line, append it now to `<plan dir>/notes/run-log.md`, below the `start` line, so item 7's commit carries it.``
5. Run Verify.

**Done when**

- `## Start checks` holds `### Toolchain check`, `### Instruction-file check` and `### Model check`, in that order, above `## 1. Re-read the ground truth`.
- The `--yes` bullet, the opening paragraph and 2c item 6 read as above, and nothing else in the file changed.

### M09-T13: plan's instruction-file and model checks

- Kind: change
- Tier: worker
- Status: done
- Wave: 3
- Depends on: M09-T03, M09-T08, M09-T11
- Files: `plugins/orcastrat/skills/plan/SKILL.md`
- Verify: `f=plugins/orcastrat/skills/plan/SKILL.md; awk '/^### Toolchain check$/{t=NR} /^### Instruction-file check$/{i=NR} /^### Model check$/{m=NR} /^## 1\. Re-read the ground truth$/{r=NR} END{exit !(t && i && m && r && t<i && i<m && m<r)}' "$f" && grep -qF 'scripts/instructions-ack" --check "<file>" ...' "$f" && grep -qF 'reference/instruction-review.md' "$f" && grep -qF 'Model notice: this session runs on <model>, and planning is designed for Opus.' "$f" && grep -qF 'the instruction-file check and the model check never ask under it' "$f" && grep -qF -- "- The model check's notice, as the first line" "$f" && grep -qF 'it is the first line of that reply' "$f" && grep -qF '`Continue on this model`' "$f" && ! grep -qF '$(' "$f"`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): plan checks the instruction files and the session model at start`

**Objective**

`plan`'s start checks go on with the quick instruction-file check and the model check, which off Opus asks **Stop** or **Continue on this model**, or under `--yes` puts its notice on the first line of `plan`'s final reply (spec §17, §21 item 2, D148, D149, D165, D171).

**Read first**

- `docs/orcastrat-execution-spec.md` §17, items 1, 7, 8 and 9, and §21, item 2
- plan.md Decisions D148, D149, D165 and D171
- `plugins/orcastrat/reference/instruction-review.md` section `## 5. Acknowledge, report and ask`
- `plugins/orcastrat/skills/plan/SKILL.md` lines 15–20 (options), section `## Start checks`, step 10 item 6, and the reply list at the end of step 11

**Interfaces**

- Consumes: `instructions-ack --check <file>...` (M09-T03)
- Consumes: `instructions-ack --check stdout: OK or REVIEW` (M09-T03)
- Consumes: `plugins/orcastrat/reference/instruction-review.md` (M09-T08)
- Consumes: `<repository root>/.orcastrat/instructions/review.md, with exactly one line starting Conflicts:` (M09-T08)
- Consumes: `## Start checks section with ### Toolchain check, directly above ## 1. Re-read the ground truth in plugins/orcastrat/skills/plan/SKILL.md` (M09-T11)
- Produces: `### Instruction-file check and ### Model check in plan's Start checks`
- Produces: `Model notice: this session runs on <model>, and planning is designed for Opus.`

**Steps**

1. In `plugins/orcastrat/skills/plan/SKILL.md`, replace the whole line ``- `--yes`: approval given in advance for doing a small job directly (step 10). Without it, you always ask first.`` with the line ``- `--yes`: approval given in advance for doing a small job directly (step 10), and for unattended starts: the instruction-file check and the model check never ask under it (see **Start checks**). Without it, you always ask first.``
2. Directly above the line `## 1. Re-read the ground truth`, insert these lines:

   ```markdown
   ### Instruction-file check

   Claude Code loads the project's instruction files into every session and into every worker a run starts, so every task pays for every line. This check looks for content that costs more than it helps, and for rules that work against a run. It never edits an instruction file.

   1. **Find the files.** With the Glob tool, searching `<repository root>`, find `**/CLAUDE.md`, `**/CLAUDE.local.md`, `**/AGENTS.md`, `**/.claude/CLAUDE.md`, `**/.claude/AGENTS.md` and `.claude/rules/**/*.md`. Drop every path inside a `.git` or `.orcastrat` directory, and every duplicate. Write each path relative to `<repository root>`, with `/` between its parts, for example `CLAUDE.md`, `.claude/rules/style.md` or `src/api/CLAUDE.md`. If no file is found, skip the rest of this check.
   2. **Compare them with the acknowledgement.** Run `cd "<repository root>" && bash "${CLAUDE_PLUGIN_ROOT}/scripts/instructions-ack" --check "<file>" ...`, passing every path from item 1 in double quotes. It adds the imported files the last review recorded, hashes every file, and prints `OK` when the file set and each file are unchanged since the user last chose Continue, or `REVIEW` otherwise. Never hash a file or read the acknowledgement yourself.
   3. **`OK`.** Grep `<repository root>/.orcastrat/instructions/review.md` for `^Conflicts:`, passing that file's path, since Grep skips excluded directories unless it is given the path. If it finds a line other than `Conflicts: none`, show the user that line. Then go on to the model check.
   4. **`REVIEW`.** Read `${CLAUDE_PLUGIN_ROOT}/reference/instruction-review.md` and do the full review it describes for `plan`, with the files from item 1 and no threshold. The review either goes on to the model check or ends this skill.

   ### Model check

   Planning and orchestration are designed for Opus. Your system prompt names the model you run on.

   - If its name or ID contains `opus`, in any case, go on.
   - Otherwise, without `--yes`, show the user one line: `This session runs on <model>. Planning and orchestration are designed for Opus.` Then ask with the AskUserQuestion tool: one question, `Stop, or continue on this model?`, header `Model`, single choice, with the options `Stop` (description `End now, so you can restart the session on Opus.`) and `Continue on this model` (description `Go on with <model>.`). On `Continue on this model`, go on. On `Stop`, or any other answer, end this skill: tell the user it stopped before anything started, and write nothing.
   - Otherwise, under `--yes`, don't ask. Note the line `Model notice: this session runs on <model>, and planning is designed for Opus.`, and go on. The reply that ends this skill, in step 10 or step 11, starts with that line.
   ```

3. In step 10 (`## 10. Size check: do small jobs directly`), at the end of item 6, which starts `6. Don't write a plan directory. Reply with only:`, after one space on the same line, add: ``If the model check noted a notice under `--yes`, it is the first line of that reply.``
4. In step 11 (`## 11. Write and hand off`), directly below the line `Reply to the user with only:` and its following empty line, insert as the list's new first item the line ``- The model check's notice, as the first line, if it noted one under `--yes`.``, so the existing `- The plan directory.` item comes right after it.
5. Run Verify.

**Done when**

- `## Start checks` holds `### Toolchain check`, `### Instruction-file check` and `### Model check`, in that order, above `## 1. Re-read the ground truth`.
- The `--yes` option, step 10 item 6 and step 11's reply list name the model notice as above, and nothing else in the file changed.

### M09-T14: run holds files with the hold script

- Kind: change
- Tier: worker
- Status: todo
- Wave: 4
- Depends on: M09-T04, M09-T12
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `f=plugins/orcastrat/skills/run/SKILL.md; grep -cF 'scripts/hold" save' "$f" | grep -qx 2 && grep -cF 'scripts/hold" restore' "$f" | grep -qx 2 && grep -qF 'but in its step 3 give the held report the destination' "$f" && ! grep -qF 'Hold directory' "$f" && ! grep -qF '<WT_ROOT>/hold' "$f" && ! grep -qF 'rm -rf' "$f" && ! grep -qF '$(' "$f"`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run holds reports and failure logs with the hold script`

**Objective**

`run` keeps a task's report and failure log across a reset with `hold save` and `hold restore` instead of `mkdir`, `cp` and `rm` inside `.git`, in **Discard an attempt**, the scope-violation resume, and 3e item 5 (D151, D162).

**Read first**

- plan.md Decisions D93, D151, D162 and D173
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions` (the **Hold directory**, **Discard an attempt** and **Report file** bullets), section `## Failed attempt` item 1, and section `### 3e. Parallel wave` item 5

**Interfaces**

- Consumes: `hold save <plan-dir> <key> <dir> <path>...` (M09-T04)
- Consumes: `hold restore <plan-dir> <key> <dir> <held-path> <dest-path> [<held-path> <dest-path>]...` (M09-T04)
- Produces: `**Discard an attempt** through hold save and hold restore in plugins/orcastrat/skills/run/SKILL.md`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `## Definitions`, delete the whole line that starts ``- **Hold directory**: `<WT_ROOT>/hold`.``
2. In the **Discard an attempt** bullet, replace the whole line of sub-item 1, which starts ``1. Run `mkdir -p "<WT_ROOT>/hold"`.`` after two spaces, with the first line below, and the whole line of sub-item 3, which starts ``3. Run `mkdir -p "<plan dir>/notes/reports"`.`` after two spaces, with the second line below:

   ```text
     1. Hold the report file and the failure log: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" save "<plan dir>" <task ID> "<MAIN>" "<report file>" "<failure log>"`. It copies whichever of them exist into this run's hold, inside `.git`, where `git reset --hard` and `git clean -fd` don't reach.
     3. Write them back: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" restore "<plan dir>" <task ID> "<MAIN>" "<report file>" "<plan dir>/notes/reports/<task ID>-attempt<n>.md" "<failure log>" "<failure log>"`. It copies the held report to `<task ID>-attempt<n>.md` and the held failure log back to the failure log, creating their directories, skips a file it didn't hold, and empties the hold.
   ```

3. In section `## Failed attempt`, item 1, replace ``first **discard the attempt** (see Definitions), but copy the held report back to the report file itself instead of `-attempt<n>.md`.`` with ``first **discard the attempt** (see Definitions), but in its step 3 give the held report the destination `"<report file>"` instead of `-attempt<n>.md`, so it goes back to the report file itself.``
4. In section `### 3e. Parallel wave`, item 5, replace the text from ``run `mkdir -p "<WT_ROOT>/hold"`;`` through ``and run `rm -rf "<WT_ROOT>/hold"`.``, which is exactly this:

   ```text
   run `mkdir -p "<WT_ROOT>/hold"`; with `cp`, copy `<worktree>/<report file>` to `"<WT_ROOT>/hold/<task ID>.md"` and `<worktree>/<failure log>` to `"<WT_ROOT>/hold/<task ID>-failures.md"`; run `git -C "<worktree>" reset --hard <BASE>` and `git -C "<worktree>" clean -fd`; run `mkdir -p "<worktree>/<plan dir>/notes/reports"`, copy both held files back to where they came from, and run `rm -rf "<WT_ROOT>/hold"`.
   ```

   with this text:

   ```text
   run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" save "<plan dir>" <task ID> "<worktree>" "<report file>" "<failure log>"`; run `git -C "<worktree>" reset --hard <BASE>` and `git -C "<worktree>" clean -fd`; then run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" restore "<plan dir>" <task ID> "<worktree>" "<report file>" "<report file>" "<failure log>" "<failure log>"`, which copies both back to where they came from.
   ```

5. Run Verify.

**Done when**

- No step of `run` creates, copies into or removes the old hold directory; **Discard an attempt** and 3e item 5 use `hold save` and `hold restore`.
- Nothing else in the file changed.

### M09-T15: run puts task worktrees in .orcastrat/wt

- Kind: change
- Tier: worker
- Status: todo
- Wave: 5
- Depends on: M09-T05, M09-T10, M09-T14
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `f=plugins/orcastrat/skills/run/SKILL.md; ! grep -qF 'WT_ROOT' "$f" && grep -qF -- '- **Task worktree** of a task: `<MAIN>/.orcastrat/wt/<task ID>`' "$f" && grep -qF 'git worktree add -b <task branch> "<MAIN>/.orcastrat/wt/<task ID>" <BASE>' "$f" && grep -qF 'the task worktrees left in `.orcastrat/wt/`' "$f" && grep -qF '`.orcastrat/wt/` holds task worktrees from an earlier run' "$f" && ! grep -qF '$(' "$f"`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run puts task worktrees in .orcastrat/wt`

**Objective**

`run` creates each task worktree at `<MAIN>/.orcastrat/wt/<task ID>`, outside `.git`, and no longer defines or uses WT_ROOT (D153).

**Read first**

- `docs/orcastrat-execution-spec.md` §6, item 1 (**Worktrees**)
- plan.md Decisions D151 and D153
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions` (the **WT_ROOT** and **Next** bullets), section `### 2a. Checks` item 3 (**Leftover worktrees**), and section `### 3e. Parallel wave` item 1

**Interfaces**

- Consumes: `.orcastrat/wt/ at the plan checkout's top level (git rev-parse --show-toplevel), the directory whose .git-holding subdirectories next's worktrees: line counts` (M09-T05)
- Produces: `**Task worktree** of a task: <MAIN>/.orcastrat/wt/<task ID>`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `## Definitions`, replace the whole line that starts `- **WT_ROOT**:` with this line:

   ```text
   - **Task worktree** of a task: `<MAIN>/.orcastrat/wt/<task ID>`, at the repository root rather than inside `.git`, where Claude Code would prompt for every file a worker writes. The toolchain check keeps the line `/.orcastrat/` in `.git/info/exclude`, so task worktrees never show up in the main checkout's status, and `git clean -fd` never removes them.
   ```

2. In the **Next** bullet of Definitions, replace ``the task worktrees left in `<WT_ROOT>/worktrees/`;`` with ``the task worktrees left in `.orcastrat/wt/`;``.
3. In section `### 2a. Checks`, the **Leftover worktrees** item, replace the text `<WT_ROOT>/worktrees/`, which occurs once in that item, with `.orcastrat/wt/`, so that the item says ``isn't `worktrees: 0`, `.orcastrat/wt/` holds task worktrees from an earlier run``.
4. In section `### 3e. Parallel wave`, item 1, replace ``Each task's worktree is `<WT_ROOT>/worktrees/<task ID>`. For each task: `git worktree add -b <task branch> "<WT_ROOT>/worktrees/<task ID>" <BASE>`.`` with ``Each task's worktree is its **task worktree** (see Definitions). For each task: `git worktree add -b <task branch> "<MAIN>/.orcastrat/wt/<task ID>" <BASE>`.``
5. Run Verify.

**Done when**

- The skill defines **Task worktree** as `<MAIN>/.orcastrat/wt/<task ID>`, creates worktrees there, and never mentions WT_ROOT.
- Nothing else in the file changed.

### M09-T16: run removes a parallel wave's worktrees before integration

- Kind: change
- Tier: worker
- Status: todo
- Wave: 6
- Depends on: M09-T04, M09-T15
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `f=plugins/orcastrat/skills/run/SKILL.md; grep -qF 'When every batch is done, first remove the wave' "$f" && grep -cF 'scripts/hold" save' "$f" | grep -qx 3 && grep -cF 'scripts/hold" restore' "$f" | grep -qx 5 && grep -cF 'noted when its worktree was removed' "$f" | grep -qx 2 && grep -qF "VACUOUS — <worker's NOTE>; discarded attempt <sha>" "$f" && ! grep -qF 'mkdir -p' "$f" && ! grep -qF 'with `cp`' "$f" && ! grep -qF 'With `cp`' "$f" && ! grep -qF 'leave its worktree for the user' "$f" && ! grep -qF 'Its worktree stays for the user.' "$f" && ! grep -qF '$(' "$f"`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run removes a parallel wave's worktrees before integration`

**Objective**

Once every batch of a parallel wave is done, `run` holds each task's report and failure log, keeps a blocked task's attempt under `refs/orcastrat/discarded/`, and removes every task worktree before integrating, so no Verify in MAIN sees nested copies; later steps write the held files back and delete each task branch as its task is settled (D153, D163, D174).

**Read first**

- `docs/orcastrat-execution-spec.md` §6, item 1 (**Worktrees**)
- plan.md Decisions D127, D153, D163 and D174
- `plugins/orcastrat/skills/run/SKILL.md` section `### 3e. Parallel wave` from item 5 to the end of item 12, and section `## Block with GAP`

**Interfaces**

- Consumes: `hold save <plan-dir> <key> <dir> <path>...` (M09-T04)
- Consumes: `hold restore <plan-dir> <key> <dir> <held-path> <dest-path> [<held-path> <dest-path>]...` (M09-T04)
- Consumes: `**Task worktree** of a task: <MAIN>/.orcastrat/wt/<task ID>` (M09-T15)
- Produces: `3e's worktree removal once every batch is done, before item 7's integration`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `### 3e. Parallel wave`, replace the line `When every batch is done:` with these lines:

   ```markdown
   When every batch is done, first remove the wave's task worktrees, so that no Verify in MAIN (items 8 and 9, and the Milestone and Final verify) sees nested copies of the source. For each task of the wave, in task ID order:

   - Hold its report file and failure log: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" save "<plan dir>" <task ID> "<worktree>" "<report file>" "<failure log>"`.
   - If it is recorded for **Block with GAP** (item 4), or left the wave with Then `blocked (STUCK)` (item 5), keep its attempt. Its attempt number `<n>` is, for a GAP or VACUOUS task, 1 plus the number of lines starting `## Attempt ` in the failure log inside its worktree, and for a STUCK task, the failed attempt's number, which is that count. Run `git rev-parse <task branch>` and note the sha it prints, then run `git update-ref refs/orcastrat/discarded/<task ID>-<n> <task branch>`. Item 12 names both in the task's `- Blocked:` line.
   - Run `git worktree remove --force "<worktree>"`. If removal fails (on Windows a process can hold a file lock), leave it, mention it in your report, and continue.

   Keep every task branch: the items below delete each one once its task is settled.
   ```

2. In item 9, replace `copy its failure log into MAIN and remove its worktree and branch, as item 11's second bullet says` with `write back its held failure log and delete its branch, as item 11's second bullet says`, and replace `copy its report file and failure log into MAIN and remove its worktree and branch, as item 10 says` with `write back its held report file and failure log and delete its branch, as item 10 says`.
3. Replace the whole line of item 10, which starts `10. **Record** each integrated task, in task ID order.`, with this line:

   ```text
   10. **Record** each integrated task, in task ID order. Write back its held report file and failure log: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" restore "<plan dir>" <task ID> "<MAIN>" "<report file>" "<report file>" "<failure log>" "<failure log>"`. Set the task's Status to `done`. Then `git add -A` and `git commit -m "chore(plan): <task ID> done" -m "Orcastrat-Task: <task ID>"`. Then delete its branch: `git branch -D <task branch>`.
   ```

4. In item 11, first bullet, replace ``run `mkdir -p "<MAIN>/<plan dir>/notes/reports"`; with `cp`, copy `<worktree>/<report file>` to `<MAIN>/<plan dir>/notes/reports/<task ID>-attempt<n>.md`, where `<n>` is the failed attempt's number, and `<worktree>/<failure log>` to `<MAIN>/<failure log>`; then remove its worktree and branch as in item 10.`` with ``write back its held files: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" restore "<plan dir>" <task ID> "<MAIN>" "<report file>" "<plan dir>/notes/reports/<task ID>-attempt<n>.md" "<failure log>" "<failure log>"`, where `<n>` is the failed attempt's number; then delete its branch as in item 10.`` In its second bullet, replace ``with `cp`, copy `<worktree>/<failure log>` to `<MAIN>/<failure log>`, then remove its worktree and branch as in item 10.`` with ``write back its held failure log: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" restore "<plan dir>" <task ID> "<MAIN>" "<failure log>" "<failure log>"`; then delete its branch as in item 10.``
5. In item 12, replace the whole line of its first bullet, which starts `    - A task recorded for **Block with GAP**`, with the first line below, and the whole line of its second bullet, which starts `    - A task that **left the wave** with Then `blocked (STUCK)``, with the second line below:

   ```text
       - A task recorded for **Block with GAP** (item 4, reason `GAP` or `VACUOUS`): write back its held report file and failure log and delete its branch, as item 11's first bullet does, with the attempt number `<n>` noted when its worktree was removed. Then write its block as **Block with GAP** says for parallel mode.
       - A task that **left the wave** with Then `blocked (STUCK)` (item 5): write back its held report file and failure log and delete its branch, as item 11's first bullet does, with the attempt number `<n>` noted when its worktree was removed. Mark the task `blocked` with `- Blocked: STUCK — <the description>; discarded attempt <sha>, kept at refs/orcastrat/discarded/<task ID>-<n>`, with the sha noted then.
   ```

6. In section `## Block with GAP`, replace ``mark the task `blocked` with `- Blocked: GAP — <question>`. Its worktree stays for the user. Then **Stop**.`` with ``mark the task `blocked` with `- Blocked: GAP — <question>; discarded attempt <sha>, kept at refs/orcastrat/discarded/<task ID>-<n>`, with the sha and `<n>` 3e noted when it removed the task's worktree. Then **Stop**.``, and replace ``marks the task `blocked` with `- Blocked: VACUOUS — <worker's NOTE>`.`` with ``marks the task `blocked` with `- Blocked: VACUOUS — <worker's NOTE>; discarded attempt <sha>, kept at refs/orcastrat/discarded/<task ID>-<n>`, as for a GAP.``
7. Run Verify.

**Done when**

- 3e removes every task worktree once all batches are done and before item 7, holding reports and failure logs and creating a `refs/orcastrat/discarded/` ref for each blocked task first.
- Items 9 to 12 and **Block with GAP** write held files back with `hold restore` and delete task branches, and no text leaves a worktree for the user or copies from a worktree with `cp`.
- Nothing else in the file changed.
