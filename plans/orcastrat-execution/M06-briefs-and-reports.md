# M06: Task briefs and report files (Changes 7, 9)

- Status: in-progress
- Format: 2
- Goal: `task-brief` writes each task's brief inside `.git`, with bats tests. `run` generates a brief before every dispatch, names it with `Brief:`, and regenerates it when Decisions changed. Workers and the per-task reviewer read the brief instead of plan files. Workers write report files with RED and GREEN evidence and reply in at most 10 lines. `DONE_WITH_CONCERNS` triggers a review. `RED: CONFIRMED` without RED evidence fails the attempt. Other agents write long output to notes files and reply in at most 20 lines. Notes are committed before the next dispatch, and the "after" dispatch sizes are recorded. A `next` script, with bats tests, tells `run` where the run is, so it never re-reads plan.md or the milestone file to find its place, and every bookkeeping step resumes from git (Change 25).
- Depends on: M05
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout-heavy

## Context

Governing sources: spec §8 (Change 7), §10 (Change 9), §25a (Change 25), §22 item 2, §7 (the `task-brief` bullet); Decisions D05, D14, D43, D44, D55, D59, D69, D79, D100–D117.

- D62: no task in this milestone is `worker-light`; `worker` is the floor.
- Tier adjustment: test-first tasks whose Steps give the literal test file and the literal code → worker (worker-light escalated 2 times in M02)
- **Scripts** (`task-brief`, `next`) follow the M03 scripts: extensionless, first line `#!/usr/bin/env bash`, then a header comment giving usage, output and errors; they source `lib/common` with `. "$(dirname "${BASH_SOURCE[0]}")/lib/common"` (with the `# shellcheck source=/dev/null` line above it); a `fail()` function prints `error: <message>` on stderr and exits 2, and nothing goes to stdout on an error; every printed path goes through `print_path`; no executable bit. Bash 3.2 only: no associative arrays, `mapfile` or `${var,,}`. awk programs use POSIX awk only, as `recover`'s do. Code fences are recognized with `recover`'s `fence_of` rule (`plugins/orcastrat/scripts/recover:55-96`), and a carriage return at the end of a line is stripped before a line is used.
- **Tests** live in `tests/orcastrat/<script>.bats`, start with `bats_require_minimum_version 1.5.0`, build fixture repos with `make_fixture_repo` in directories whose names contain a space, and run the script with `run --separate-stderr` and the stub `cygpath` first on `PATH`, as `tests/orcastrat/recover.bats` does, so every printed path reads `cygpath-stub [-m] [<path>]`. Drive-letter tests call bats `skip` where `cygpath` is absent (D59). On this machine git prints `LF will be replaced by CRLF` warnings while tests build fixtures; they are expected.
- The bats files run slowly on Windows. Give a Verify command that runs bats a Bash timeout of 600000 ms.
- Every block a Step gives in a fence is its literal final content: the fenced block in that Step, with the three-space list indentation removed from each line. Blank lines stay empty. Copy it exactly; don't reformat, reorder or "improve" it.
- **Replacing text.** "Replace A with B" means: find A, which occurs exactly once in the file unless the Step gives another count (as a whole line, or as the part of a line quoted), and put B in its place, changing nothing around it. If A isn't found that many times, stop and report `BLOCKED` / `GAP` quoting A.
- **Inserting blocks above a line.** "Insert block X above the line L" means: put X's lines directly above L, followed by one empty line, so that the empty line that was above L now sits above X.
- Skill and agent text contains no `$(`: every command they tell Claude to run is one line (spec §20 item 3).
- The run executing this plan is the installed, pre-rename plugin (D37). Editing the repository's `run` skill and agent files changes nothing in that run. The only task that runs a new script against this repository is M06-T14, and it runs only `task-brief`, on `plans/orchestratinator-robustness`.

**Worker agent edits** (M06-T04), the same in each of the six worker agent files:

- **W1.** Replace the line `The orchestrator sends you a plan directory, a milestone ID, a task ID, and sometimes a worktree path, retry context, or a `Failures:` line. Re-read these now, in this order, even if you think you know them:` with this line:

  ```text
  The orchestrator sends you a `Brief:` path and a `Report:` path, and sometimes a `Worktree:` path, retry context, or a `Failures:` line. Re-read these now, in this order, even if you think you know them:
  ```

- **W2.** Replace these five lines:

  ```text
  2. `plan.md` in the plan directory: the Decisions section.
  3. The milestone file: its Context section.
  4. Your task block in the milestone file, in full. It is your prompt.
  5. Everything in the task's Read first list: the exact source sections, pattern files, and notes it names.
  6. Every file in the task's Files that already exists.
  ```

  with these three lines:

  ```text
  2. The brief at the `Brief:` path, in full. It holds plan.md's Decisions, the milestone's Context, and your task block, which is your prompt. Don't open plan.md or the milestone file: where Read first names their Decisions or Context, read them in the brief.
  3. Everything in the task's Read first list: the exact source sections, pattern files, and notes it names.
  4. Every file in the task's Files that already exists.
  ```

- **W3.** Replace ``every preserved report of an earlier attempt that exists, `notes/reports/<task ID>-attempt<n>.md` in the plan directory.`` with:

  ```text
  every preserved report of an earlier attempt that exists, `<task ID>-attempt<n>.md` in the directory of your report file.
  ```

- **W4.** Replace the line `- Use absolute paths under the worktree for every file you read, edit, or create, including the plan files, CLAUDE.md, and AGENTS.md.` with this line:

  ```text
  - Use absolute paths under the worktree for every file you read, edit, or create, including your report file, CLAUDE.md, and AGENTS.md. The one exception is the brief: read it at the path the `Brief:` line gives.
  ```

- **W5.** Replace ``quoting the first failing line of Verify's output. If Verify passes`` with:

  ```text
  quoting the first failing line of Verify's output, and write the RED evidence in your report file: `RED: CONFIRMED` without it fails the attempt. If Verify passes
  ```

- **W6.** Directly below the line that starts ``- If the task's Verify includes a command, run it before reporting `DONE`.``, insert this line:

  ```text
  - If the task is done and its Verify passes, but you doubt that the work is correct or stays within the task's scope, report `DONE_WITH_CONCERNS` instead of `DONE`, and write each doubt under `## Concerns` in your report file. The orchestrator then has the reviewer check them before it accepts the task. Commit your work as for `DONE`.
  ```

- **W7.** Insert this block above the line `## Report`:

  ```text
  ## Report file

  Before you reply, whatever your status, write your report file at the path the `Report:` line gives, creating its directory if needed. It has these six sections, in this order:

  - `## Implemented`: what you did, in a few lines.
  - `## Files changed`: each path you created or changed, one per line.
  - `## RED evidence`: for a task with `- Fails first: yes`, the line `Command: <the Verify command>`, then the relevant failing output of the run before implementation inside a `text` code fence. Otherwise the line `N/A`.
  - `## GREEN evidence`: the line `Command: <the Verify command>`, then its passing output inside a `text` code fence. For a task whose Verify is `review` alone, or when you stop before Verify passes, the line `N/A`.
  - `## Self-review`: for each Done-when criterion, one line on how the work meets it.
  - `## Concerns`: each doubt about correctness or scope, one per line, or `None.`

  Quote only the relevant lines of long output, never a whole build log. When the orchestrator resumes you and the file already exists, keep what is in it and append a section `## Resume after attempt <n>`, with `<n>` from the `Resume:` line, saying what you changed, with the new GREEN evidence and any new concerns. The report file is always in your task's scope, but don't commit it: it isn't in Files, and the orchestrator commits it with the task.
  ```

- **W8.** In the `## Report` section, replace `Reply with exactly this block and nothing else:` with `Reply with exactly this block and nothing else, at most 10 lines:`; replace the line `STATUS: DONE | BLOCKED` with the line `STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED`; and replace the line `NOTE: <one line. For GAP, the exact question.>` with these two lines:

  ```text
  NOTE: <one line. For GAP, the exact question. For DONE_WITH_CONCERNS, your main concern.>
  REPORT: <the path the Report: line gave>
  ```

Waves: 8 (widths 4, 3, 2, 2, 1, 1, 1, 1)

## Coverage

- `docs/orcastrat-execution-spec.md` §8: `task-brief <plan-dir> <task-id>` writes plan.md's Decisions, the milestone's Context and the task block to `<git-common-dir>/orcastrat/<plan-slug>/briefs/<task-id>.md`, inside `.git` and readable from any worktree, and prints its path (D05, D43, D112) → M06-T01
- `docs/orcastrat-execution-spec.md` §8: `run` generates the brief before each dispatch and names it with `Brief:`; resumes reuse it, and every fresh dispatch regenerates it, so changed Decisions reach a retry (D100, D101) → M06-T12
- `docs/orcastrat-execution-spec.md` §8: workers and the per-task reviewer read the brief instead of `plan.md` and the milestone file, and still read CLAUDE.md, AGENTS.md and everything in Read first → M06-T04, M06-T06, M06-T08
- `docs/orcastrat-execution-spec.md` §8: the orchestrator reads only the header fields and the current task's block from plan files, finds its place with `next`, and never reads plan.md's Decisions (D105, D115) → M06-T09, M06-T10, M06-T11
- `docs/orcastrat-execution-spec.md` §10: every worker writes `notes/reports/<task-id>.md` with what was implemented, files changed, RED evidence, GREEN evidence, a self-review and concerns; resumes append to it (D111) → M06-T04
- `docs/orcastrat-execution-spec.md` §10: the report path is always in scope, and `run` includes it in the task's commit, in parallel waves too (D108) → M06-T12
- `docs/orcastrat-execution-spec.md` §10: the worker reply is the status block plus the report path, at most 10 lines → M06-T04
- `docs/orcastrat-execution-spec.md` §10: `DONE_WITH_CONCERNS` is treated like `DONE`, plus a `reviewer` dispatch with the concerns even when Verify is only a command; a reviewer FAIL is a failed attempt → M06-T04, M06-T06, M06-T13
- `docs/orcastrat-execution-spec.md` §10: `RED: CONFIRMED` is accepted only when the report file has the RED evidence; otherwise the attempt fails with `RED not confirmed` (D111) → M06-T04, M06-T13
- `docs/orcastrat-execution-spec.md` §10: the failure log and resume messages point to the report file (D107) → M06-T13
- `docs/orcastrat-execution-spec.md` §10: scouts, the planner and reviewers write anything long to a file under `notes/` and reply with a status block and the path, at most 20 lines (D106, D110) → M06-T05, M06-T07
- `docs/orcastrat-execution-spec.md` §10: notes files are committed in `run`'s next bookkeeping commit, before the next dispatch (D114) → M06-T09
- `docs/orcastrat-execution-spec.md` §25a item 1: `next <plan-dir>` prints `plan:`, `milestone:`, `next:`, `wave:`, `blocked:`, `open-questions:`, `recover:`, `worktrees:` and `marker:`, in that order, reading only plan.md's header, Milestones table and Open questions and the status, Wave and Tier lines; paths go through `print_path` (D102, D103, D113) → M06-T02, M06-T03
- `docs/orcastrat-execution-spec.md` §25a item 2: `run` reads `next` at start, before each wave, after compaction and when the Stop hook sends it back; it reads plan.md's header fields, never its Decisions, and a task's block only for fields `next` doesn't print (D115) → M06-T09, M06-T11
- `docs/orcastrat-execution-spec.md` §25a item 3: a committed survey, review or re-review note skips its agent, and a committed review's result is read from its `## Blocking` section (D104) → M06-T11
- `docs/orcastrat-execution-spec.md` §25a item 3: a detailed but uncommitted milestone is plan-reviewed unless its report is uncommitted, validated and committed without the planner; it is the only dirty tree the clean-tree check accepts, and uncommitted changes in a task's Files stop with `SETUP` (D109, D116) → M06-T10
- `docs/orcastrat-execution-spec.md` §25a item 3: `recover`'s `done` and `interrupted` lines, read from `next`, are applied → M06-T10
- `docs/orcastrat-execution-spec.md` §25a item 5: bats tests for `next` with fixture plans in each state: fresh, survey committed, detailed but uncommitted, mid-wave, interrupted attempt, blocked with open questions, milestone done awaiting review, plan complete → M06-T02, M06-T03
- `docs/orcastrat-execution-spec.md` §7: `task-brief` is a Change 6 script that `run` calls through `${CLAUDE_PLUGIN_ROOT}/scripts/`, with bash tests → M06-T01, M06-T12
- `docs/orcastrat-execution-spec.md` §22 item 2: a worker's dispatch carries only task-unique lines, `Brief:`, the report path, `Failures:` when retrying and `Worktree:` in parallel waves (D100, D117) → M06-T12
- `docs/orcastrat-execution-spec.md` §22 item 2: the "after" dispatch sizes are recorded for the tasks M04 measured (D14, D69) → M06-T14
- `docs/orcastrat-execution-spec.md` §1.2: the plan format says workers and the reviewer read a brief, and names the report files → M06-T08
- `docs/orcastrat-execution-spec.md` §1.1: known mechanisms only (git, bats-core, the Grep and Read tools) → M06-T01, M06-T02, M06-T03
- `docs/orcastrat-execution-spec.md` §1.6 and §31: shipped scripts are bash 3.2 plus `git` and standard utilities, with kebab-case names, and `Validate-All.ps1` passes → M06-T01, M06-T02, M06-T03
- `docs/orcastrat-execution-spec.md` §29 items 5 and 10a: Changes 7 and 9, and `next` with the task briefs, are built in this step (D28) → M06-T01, M06-T02, M06-T04, M06-T09, M06-T12, M06-T13
- `docs/orcastrat-execution-spec.md` §32 items 11, 13, 52, 56 and 73: briefs inside `.git` replace plan files for workers and the reviewer; report files and `DONE_WITH_CONCERNS`; notes committed before the next dispatch; briefs regenerated before a retry; cheap resume with `next` → M06-T01, M06-T02, M06-T04, M06-T09, M06-T12, M06-T13
- `docs/orcastrat-execution-spec.md` preamble: less repeated context and fewer Opus tokens spent on bookkeeping → M06-T01, M06-T02, M06-T09
- D110: `plan` gives every scout brief an `Output:` line, and a scout replies inline when its answers fit in 20 lines → M06-T07

## Review Focus

- A task's Steps hold a fenced block with the lines `### M01-T02: Not a heading` and `## Context` → `task-brief` keeps both inside the task block, and neither ends a section nor starts one (source: D112; spec §8, "the task block (fields, Objective, Read first, Interfaces, Steps, Done when)"). Test: `task-brief keeps fenced headings inside the task block` in M06-T01.
- `task-brief` run with a plan directory inside a linked worktree → the brief is written under the common git dir, where every worktree can read it (source: spec §8, "inside `.git`, so it never dirties the tree and is readable from any worktree"). Test: `task-brief from a linked worktree writes the brief in the common git dir` in M06-T01.
- plan.md's Decisions hold lines that look like a Milestones row, a `- Status: blocked` line and bullets → `next` ignores them (source: spec §25a item 1, "never Decisions, Context, Steps or notes"). Test: `next never reads Decisions` in M06-T02.
- The current milestone has `todo` tasks in waves 2, 3 and 10 → `wave: 2`, since waves compare as numbers, not text (source: spec §25a item 1, "the lowest wave with `todo` tasks"). Test: `mid-wave: next names the lowest wave with todo tasks` in M06-T02.
- WT_ROOT holds `logs/`, `hold/` and `briefs/` beside one task worktree, and another worktree lives elsewhere → `worktrees: 1` (source: spec §25a item 1, "leftover task worktrees under the plan's worktree root"; D113). Test: `worktrees counts only task worktrees under the plan's worktree root` in M06-T03.

## Tasks

### M06-T01: Add the task-brief script

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/scripts/task-brief`, `tests/orcastrat/task-brief.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/task-brief.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the task-brief script`

**Objective**

`plugins/orcastrat/scripts/task-brief <plan-dir> <task-id>` writes the task's brief, plan.md's Decisions, the milestone's Context and the task block, to `<git-common-dir>/orcastrat/<plan-slug>/briefs/<task-id>.md` and prints its path, and `tests/orcastrat/task-brief.bats` covers it.

**Read first**

- `docs/orcastrat-execution-spec.md` §8
- plan.md Decisions D43, D55 and D112
- `plugins/orcastrat/scripts/recover` (the script pattern: header comment, `lib/common`, `fail`, `milestones_awk`, and `todo_awk`'s `fence_of` rule)
- `plugins/orcastrat/scripts/verify` lines 35–43 (the slug and the common-dir resolution to copy)
- `tests/orcastrat/recover.bats` lines 1–46 (the test pattern)

**Interfaces**

- Consumes: `print_path <path>` (existing, `plugins/orcastrat/scripts/lib/common:8`)
- Consumes: `REPO_ROOT` (existing, `tests/orcastrat/test_helper.bash:5`)
- Consumes: `make_fixture_repo <dir>` (existing, `tests/orcastrat/test_helper.bash:9`)
- Consumes: `make_cygpath_stub <dir>` (existing, `tests/orcastrat/test_helper.bash:25`)
- Consumes: `bash scripts/run-bats.sh [<bats arguments>...]` (existing, `scripts/run-bats.sh:21`)
- Produces: `plugins/orcastrat/scripts/task-brief`
- Produces: `task-brief <plan-dir> <task-id>`
- Produces: `task-brief stdout: the brief's absolute path through print_path, and nothing else`
- Produces: `task-brief exit status: 0 on success; 2 with one stderr line error: <message>`
- Produces: `<git-common-dir>/orcastrat/<plan-slug>/briefs/<task-id>.md`

**Steps**

1. Create `tests/orcastrat/task-brief.bats`. It starts with `bats_require_minimum_version 1.5.0`. Its `setup()` runs `load test_helper`, sets `SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/task-brief"` and `REPO="$BATS_TEST_TMPDIR/fixture repo"`, runs `make_fixture_repo "$REPO"` and `make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"`, sets `PLAN="$REPO/plans/demo plan"` and `BRIEFS="$REPO/.git/orcastrat/demo plan/briefs"`, runs `mkdir -p "$PLAN"`, and calls `write_fixture`. Give it these helpers:
   - `run_script <args...>`: `run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"`, as in `recover.bats`.
   - `write_fixture`: writes `$PLAN/plan.md` and `$PLAN/M01-first.md` with `printf '%s\n'`, one argument per line, holding exactly the two blocks below, in that order.
   - `expected_t01 <file>` and `expected_t02 <file>`: write the expected briefs of `M01-T01` and `M01-T02`, the same way.

   `plan.md`:

   ```text
   # Plan: Demo

   - Branch: main
   - Status: in-progress

   ## Milestones

   | ID | Title | Status | File |
   |---|---|---|---|
   | M01 | First | in-progress | M01-first.md |

   ## Coverage

   - `spec.md` 1: a requirement -> M01

   ## Decisions

   - D01: First decision.
   - D02: Second decision.

   ## Open questions

   None.
   ```

   `M01-first.md`:

   ````text
   # M01: First

   - Status: in-progress
   - Goal: Demo goal.

   ## Context

   Context line one.
   Conventions: none

   Waves: 1 (widths 2)

   ## Coverage

   - `spec.md` 1: a requirement -> M01-T01, M01-T02

   ## Tasks

   ### M01-T01: First task

   - Kind: change
   - Status: todo

   **Steps**

   1. Write this:

      ```markdown
      ### M01-T02: Not a heading
      ## Context
      ```

   2. Run Verify.

   ### M01-T02: Second task

   - Kind: change
   - Status: todo

   **Done when**

   - The last line of the file.
   ````

   The expected brief of `M01-T01` is the `plan.md` lines from `## Decisions` through the empty line after `- D02: Second decision.`, then the `M01-first.md` lines from `## Context` through the empty line after `Waves: 1 (widths 2)`, then the `M01-first.md` lines from `### M01-T01: First task` through the empty line after `2. Run Verify.`. The expected brief of `M01-T02` has the same first two parts, then the lines from `### M01-T02: Second task` through `- The last line of the file.`, the last line of the file. Every line ends in a newline.
2. Add these tests to the same file. Unless a test says otherwise, it expects exit status 0, an empty `$stderr`, and `$output` equal to `cygpath-stub [-m] [<common>/orcastrat/demo plan/briefs/<task-id>.md]`, where `<common>` is what `cd "$REPO/.git" && pwd` prints; each error test expects exit status 2, an empty `$output`, the exact `$stderr` given, and no brief file.
   - `task-brief writes Decisions, Context and the task block, in that order`: `run_script "$PLAN" M01-T01`; `diff` of `$BRIEFS/M01-T01.md` against `expected_t01`'s file finds no difference.
   - `task-brief prints only the brief path, through print_path`: `run_script "$PLAN" M01-T01`; the default expectations above.
   - `task-brief keeps fenced headings inside the task block`: `run_script "$PLAN" M01-T01`; the brief has the line `   ### M01-T02: Not a heading`, has no line `### M01-T02: Second task`, and has exactly one line `## Context`.
   - `the last task block runs to the end of the file`: `run_script "$PLAN" M01-T02`; `diff` against `expected_t02`'s file finds no difference.
   - `task-brief overwrites an existing brief`: write `stale line` to `$BRIEFS/M01-T01.md` first (after `mkdir -p "$BRIEFS"`); `run_script "$PLAN" M01-T01`; the brief equals `expected_t01`'s file.
   - `task-brief strips carriage returns`: rewrite both fixture files with CRLF line ends, `awk '{ printf "%s\r\n", $0 }'` into a temporary file and then `mv`; `run_script "$PLAN" M01-T01`; the brief has no carriage return and equals `expected_t01`'s file.
   - `task-brief from a linked worktree writes the brief in the common git dir`: commit the fixture (`git -C "$REPO" add -A`, `git -C "$REPO" commit --quiet -m fixture`), run `git -C "$REPO" worktree add --quiet -b other "$BATS_TEST_TMPDIR/other tree"`, then `run_script "$BATS_TEST_TMPDIR/other tree/plans/demo plan" M01-T01`; status 0 and `$BRIEFS/M01-T01.md` equals `expected_t01`'s file.
   - `task-brief accepts <plan-dir> in both drive-letter forms`: skip with `command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"`; with `win_m` from `cygpath -m "$PLAN"` and `win_w` from `cygpath -w "$PLAN"`, `run_script "$win_m" M01-T01` and `run_script "$win_w" M01-T01` each exit 0 and leave `$BRIEFS/M01-T01.md` equal to `expected_t01`'s file.
   - `task-brief exits 2 with the wrong number of arguments`: no argument, one argument (`"$PLAN"`) and three (`"$PLAN" M01-T01 extra`), each with `$stderr` `error: usage: task-brief <plan-dir> <task-id>`.
   - `task-brief exits 2 when <plan-dir> is not a directory`: `run_script "$REPO/plans/missing" M01-T01`, with `error: not a directory: cygpath-stub [-m] [$REPO/plans/missing]`.
   - `task-brief exits 2 outside a git work tree`: `mkdir -p "$BATS_TEST_TMPDIR/plain dir"`, copy `$PLAN/plan.md` there, `run_script "$BATS_TEST_TMPDIR/plain dir" M01-T01`, with `error: not inside a git work tree: cygpath-stub [-m] [$BATS_TEST_TMPDIR/plain dir]`.
   - `task-brief exits 2 when plan.md is missing`: `mkdir -p "$REPO/plans/empty"`, `run_script "$REPO/plans/empty" M01-T01`, with `error: no plan.md in: cygpath-stub [-m] [$REPO/plans/empty]`.
   - `task-brief exits 2 for an unknown task`: `run_script "$PLAN" M01-T09` and `run_script "$PLAN" M02-T01` each give `error: task not found: <that task ID>`, and `run_script "$PLAN" T01` gives `error: not a task ID: T01`; `$BRIEFS` holds no file afterwards.
3. Run Verify and confirm it fails (`task-brief` doesn't exist yet).
4. Create `plugins/orcastrat/scripts/task-brief` (no file extension), with the header comment, `lib/common` and `fail()` from the Context. It takes exactly two arguments, `<plan-dir>` and `<task-id>`, and checks, in this order, failing with the message given: argument count (`usage: task-brief <plan-dir> <task-id>`); `<plan-dir>` is a directory (`not a directory: <print_path of plan-dir>`); `git -C "<plan-dir>" rev-parse --is-inside-work-tree` prints `true` (`not inside a git work tree: <print_path of plan-dir>`); `<plan-dir>/plan.md` is a file (`no plan.md in: <print_path of plan-dir>`); `<task-id>` matches `^M[0-9]+-T[0-9]+$` (`not a task ID: <task-id>`).
5. Find the milestone file: the milestone ID is the part of `<task-id>` before `-T`. Read plan.md's `## Milestones` table as `recover`'s `milestones_awk` does, splitting each row on `|` and trimming each cell; the row whose first cell equals the milestone ID gives the file in its last non-empty cell. If there is no such row, the file doesn't exist, or it has no line starting `### <task-id>:` outside a code fence, fail with `task not found: <task-id>`.
6. Write the brief. Resolve the slug and the absolute common dir exactly as `verify` lines 37–41 do, with `<plan-dir>` in place of `<dir>`; the brief is `<common>/orcastrat/<slug>/briefs/<task-id>.md` (`mkdir -p` its directory). Into `<brief>.tmp`, write, each line followed by a newline and with any carriage return at its end removed: plan.md's section starting at the line `## Decisions`; then the milestone file's section starting at the line `## Context`; then the milestone file's section starting at the first line that starts `### <task-id>:`. A `##` section ends before the next line starting `# ` or `## `, and the task section ends before the next line starting `# `, `## ` or `### `, or at the end of the file. Lines inside a code fence (the `fence_of` rule, on the line with leading blanks removed) never start or end a section, and only the first match of each start line counts. A missing `## Decisions` or `## Context` section adds nothing. Then `mv -f` the temporary file onto the brief and print `print_path` of the brief's path, and nothing else.
7. Run Verify and confirm all 13 tests pass. Where `cygpath` isn't installed, the drive-letter test reports `skip` instead; on this machine it runs.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/task-brief.bats` reports 13 tests and no failure.
- `plugins/orcastrat/scripts/task-brief` contains no `pwsh` or `powershell`, in any case, and uses no associative array, `mapfile` or `${var,,}`.

### M06-T02: Add the next script with the plan position lines

- Kind: change
- Tier: worker-heavy
- Why this tier: A plan parser with fenced blocks, CRLF files, table cells and numeric wave order, plus the first-match rules of the `next:` line.
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/scripts/next`, `tests/orcastrat/next.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/next.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the next script`

**Objective**

`plugins/orcastrat/scripts/next <plan-dir>` prints the `plan:`, `milestone:`, `next:`, `wave:`, `blocked:` and `open-questions:` lines from plan.md's header, Milestones table and Open questions and the milestone files' task Status, Wave and Tier lines alone, and `tests/orcastrat/next.bats` covers each state those lines show.

**Read first**

- `docs/orcastrat-execution-spec.md` §25a items 1 and 5
- plan.md Decisions D102, D103 and D113
- `plugins/orcastrat/scripts/recover` (the script pattern, `milestones_awk`, and `todo_awk` with its `fence_of` rule)
- `tests/orcastrat/recover.bats` lines 1–46 (the test pattern)
- `tests/orcastrat/test_helper.bash`

**Interfaces**

- Consumes: `print_path <path>` (existing, `plugins/orcastrat/scripts/lib/common:8`)
- Consumes: `REPO_ROOT` (existing, `tests/orcastrat/test_helper.bash:5`)
- Consumes: `make_fixture_repo <dir>` (existing, `tests/orcastrat/test_helper.bash:9`)
- Consumes: `make_cygpath_stub <dir>` (existing, `tests/orcastrat/test_helper.bash:25`)
- Produces: `plugins/orcastrat/scripts/next`
- Produces: `next <plan-dir>`
- Produces: `next stdout lines 1-6: plan: <status>, milestone: <ID> <status> <path> or milestone: none, next: <step>, wave: <n> <task ID>:<tier> ... or wave: none, blocked: <IDs> or blocked: none, open-questions: <count>`
- Produces: `next exit status: 0 on success; 2 with one stderr line error: <message>`
- Produces: next.bats helpers `run_script <args...>`, `out_line <key>`, `write_plan <plan status> <M01 status> <M02 status> [<open-question line>...]`, `write_milestone <file> <status> [<task ID>:<status>:<wave>:<tier>...]`, `commit_all <message>`, `fresh_plan`, `mid_wave_plan`

**Steps**

1. Create `tests/orcastrat/next.bats`. It starts with `bats_require_minimum_version 1.5.0`. Its `setup()` runs `load test_helper`, sets `SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/next"` and `REPO="$BATS_TEST_TMPDIR/fixture repo"`, runs `make_fixture_repo "$REPO"`, `make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"` and `git -C "$REPO" checkout --quiet -b demo-branch`, sets `PLAN="$REPO/plans/demo plan"`, and runs `mkdir -p "$PLAN/notes"`. Give it these helpers:
   - `run_script <args...>`: `run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"`.
   - `out_line <key>`: prints the line of `$output` that starts with `<key>: `.
   - `write_plan <plan status> <M01 status> <M02 status> [<open-question line>...]`: writes `$PLAN/plan.md` with `printf '%s\n'`, one line per argument: `# Plan: Demo`, empty, `- Branch: demo-branch`, `- Status: <plan status>`, empty, `## Milestones`, empty, `| ID | Title | Status | File |`, `|---|---|---|---|`, `| M01 | First | <M01 status> | M01-first.md |`, `| M02 | Second | <M02 status> | M02-second.md |`, empty, `## Decisions`, empty, `- D01: A decision next never reads.`, empty, `## Open questions`, empty, then each open-question line given, or `None.` when none is given.
   - `write_milestone <file> <status> [<task>...]`: each `<task>` is `<task ID>:<status>:<wave>:<tier>`, split with `IFS=: read -r`. Writes `$PLAN/<file>`: `# <file up to its first "-">: Demo` (for example `# M01: Demo`), empty, `- Status: <status>`, empty, `## Context`, empty, `Nothing here.`; then, when at least one task is given, an empty line and `## Tasks`; then for each task an empty line, `### <task ID>: Demo task`, an empty line, `- Kind: change`, `- Tier: <tier>`, `- Status: <status>`, `- Wave: <wave>`.
   - `commit_all <message>`: `git -C "$REPO" add -A`, then `git -C "$REPO" commit --quiet -m "<message>"`.
   - `fresh_plan`: `write_plan planned outline outline`, `write_milestone M01-first.md outline`, `write_milestone M02-second.md outline`, `commit_all plan`.
   - `mid_wave_plan`: `write_plan in-progress done in-progress`, `write_milestone M01-first.md done M01-T01:done:1:worker`, `write_milestone M02-second.md in-progress M02-T01:done:1:worker M02-T02:todo:2:worker-heavy M02-T03:todo:2:specialist M02-T04:todo:3:worker M02-T05:todo:10:worker`, `commit_all plan`.
2. Add these tests. Each state test expects exit status 0 and an empty `$stderr`, and checks the lines given with `out_line`; `M1` stands for `cygpath-stub [-m] [$PLAN/M01-first.md]` and `M2` for `cygpath-stub [-m] [$PLAN/M02-second.md]`. Each error test expects exit status 2, an empty `$output`, and the exact `$stderr` given.
   - `fresh plan: next surveys the first outline milestone`: `fresh_plan`; `plan: planned`, `milestone: M01 outline M1`, `next: survey M01`, `wave: none`, `blocked: none`, `open-questions: 0`.
   - `next prints its lines in order`: `fresh_plan`; the text before the first `:` of each output line, joined by spaces, is `plan milestone next wave blocked open-questions`.
   - `survey committed: next details the milestone`: `fresh_plan`, write `survey` to `$PLAN/notes/M01-survey.md`, `commit_all survey`; `next: detail M01`.
   - `an untracked survey note doesn't count as committed`: `fresh_plan`, then write `$PLAN/notes/M01-survey.md` without committing; `next: survey M01`.
   - `detailed but uncommitted: next starts the milestone`: `fresh_plan`, a committed `notes/M01-survey.md`, then, uncommitted, `write_plan planned ready outline`, `write_milestone M01-first.md ready M01-T01:todo:1:worker M01-T02:todo:1:worker-light M01-T03:todo:2:worker` and a `notes/M01-plan-review.md`; `milestone: M01 ready M1`, `next: start M01`, `wave: 1 M01-T01:worker M01-T02:worker-light`.
   - `mid-wave: next names the lowest wave with todo tasks`: `mid_wave_plan`; `plan: in-progress`, `milestone: M02 in-progress M2`, `next: wave 2`, `wave: 2 M02-T02:worker-heavy M02-T03:specialist`, `blocked: none`.
   - `blocked with open questions: next is blocked and counts the questions`: `write_plan blocked blocked outline '- (M01-T02) [ambiguous] First question?' '  Where: somewhere' '- (M01-T02) [assumption] Second question?' '  Where: elsewhere'`, `write_milestone M01-first.md blocked M01-T01:done:1:worker M01-T02:blocked:1:worker`, `write_milestone M02-second.md outline`, `commit_all plan`; `next: blocked`, `blocked: M01 M01-T02`, `open-questions: 2`, `wave: none`.
   - `a blocked task makes next blocked while the plan is in-progress`: `write_plan in-progress in-progress outline`, `write_milestone M01-first.md in-progress M01-T01:blocked:1:worker M01-T02:todo:1:worker`, `write_milestone M02-second.md outline`, `commit_all plan`; `next: blocked`, `blocked: M01-T01`, `wave: 1 M01-T02:worker`.
   - `milestone done awaiting review: next runs the milestone verify`: `write_plan in-progress in-progress outline`, `write_milestone M01-first.md in-progress M01-T01:done:1:worker M01-T02:done:2:worker`, `write_milestone M02-second.md outline`, `commit_all plan`; `next: milestone-verify M01`, `wave: none`.
   - `a committed review note: next goes to the review`: the same plan plus a committed `notes/M01-review.md`; `next: review M01`.
   - `every milestone done: next runs the final verify`: `write_plan in-progress done done`, `write_milestone M01-first.md done M01-T01:done:1:worker`, `write_milestone M02-second.md done M02-T01:done:1:worker`, `commit_all plan`; `milestone: none`, `next: final-verify`, `wave: none`.
   - `plan complete: next is complete`: the same with `write_plan complete done done`; `plan: complete`, `milestone: none`, `next: complete`.
   - `next never reads Decisions`: `mid_wave_plan`, then rewrite `$PLAN/plan.md` through a temporary file with `awk '{ print } $0 == "- D01: A decision next never reads." { print "| M09 | Fake | blocked | M09-fake.md |"; print "- Status: blocked"; print "- D02: - (M02-T02) not a question" }'` and `mv`, which adds those three lines to the `## Decisions` section; same lines as the mid-wave test, plus `open-questions: 0`.
   - `task headings inside code fences are ignored`: `write_plan in-progress in-progress outline`, `write_milestone M01-first.md in-progress M01-T01:done:1:worker`, then append to `$PLAN/M01-first.md` the lines empty, ```` ```markdown ````, `### M01-T09: Not a task`, `- Tier: worker`, `- Status: todo`, `- Wave: 1`, ```` ``` ````, then `write_milestone M02-second.md outline`, `commit_all plan`; `next: milestone-verify M01`, `wave: none`.
   - `next reads CRLF plan files`: `mid_wave_plan`, then rewrite `plan.md`, `M01-first.md` and `M02-second.md` with CRLF line ends (`awk '{ printf "%s\r\n", $0 }'` into a temporary file, then `mv`); `plan: in-progress`, `next: wave 2`, `wave: 2 M02-T02:worker-heavy M02-T03:specialist`, and `$output` has no carriage return.
   - `next accepts <plan-dir> in both drive-letter forms`: skip with `command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"`; `fresh_plan`; `run_script` with `cygpath -m "$PLAN"` and with `cygpath -w "$PLAN"` each give status 0 and `next: survey M01`.
   - `next exits 2 with the wrong number of arguments`: no argument, and two (`"$PLAN" extra`), each with `error: usage: next <plan-dir>`.
   - `next exits 2 when <plan-dir> is not a directory`: `run_script "$REPO/plans/missing"`, with `error: not a directory: cygpath-stub [-m] [$REPO/plans/missing]`.
   - `next exits 2 outside a git work tree`: `mkdir -p "$BATS_TEST_TMPDIR/plain dir"`, write a `plan.md` there with `write_plan`'s content, `run_script "$BATS_TEST_TMPDIR/plain dir"`, with `error: not inside a git work tree: cygpath-stub [-m] [$BATS_TEST_TMPDIR/plain dir]`.
   - `next exits 2 when plan.md is missing`: `mkdir -p "$REPO/plans/empty"`, `run_script "$REPO/plans/empty"`, with `error: no plan.md in: cygpath-stub [-m] [$REPO/plans/empty]`.
3. Run Verify and confirm it fails (`next` doesn't exist yet).
4. Create `plugins/orcastrat/scripts/next` (no file extension), with the header comment, `lib/common` and `fail()` from the Context. It takes exactly one argument, `<plan-dir>`, and checks, in this order: argument count (`usage: next <plan-dir>`); `<plan-dir>` is a directory (`not a directory: <print_path of plan-dir>`); `git -C "<plan-dir>" rev-parse --is-inside-work-tree` prints `true` (`not inside a git work tree: <print_path of plan-dir>`); `<plan-dir>/plan.md` is a file (`no plan.md in: <print_path of plan-dir>`). It computes every line before printing any, so an error prints nothing on stdout.
5. Read the plan, stripping a carriage return from the end of each line, and never looking past these lines:
   - **Plan status**: the value of the first line starting `- Status:` above plan.md's first line starting `## `, trimmed.
   - **Milestone rows**: the lines starting `|` in the `## Milestones` section (up to the next line starting `## `), split on `|` with each cell trimmed; only rows whose first cell matches `^M[0-9]+$` count. The ID is the first cell, the file the last non-empty cell, and the status the cell before the file.
   - **Tasks** of each milestone file that exists, in table order: a task starts at a line matching `^### M[0-9]+-T[0-9]+:` outside a code fence (`recover`'s `todo_awk` rules), and its status, wave and tier are the values of its first `- Status:`, `- Wave:` and `- Tier:` lines, trimmed.
   - **Open questions**: the lines starting `- ` between the line `## Open questions` and the next line starting `## `, or the end of the file.
6. Print these six lines, in this order:
   - `plan: <plan status>`.
   - `milestone: <ID> <status> <print_path of "<plan-dir>/<file>">` for the first row whose status isn't `done`, the current milestone; `milestone: none` when every row is `done`.
   - `next: <step>`, the first of these that applies: plan status `complete` → `complete`; plan status `blocked`, or any row or task with status `blocked` → `blocked`; no current milestone → `final-verify`; current status `outline` → `detail <ID>` when `git -C "<plan-dir>" ls-files --error-unmatch -- "notes/<ID>-survey.md"` succeeds, otherwise `survey <ID>`; current status `ready` → `start <ID>`; the current milestone has a `todo` task → `wave <n>`, with `<n>` from the `wave:` line; otherwise `review <ID>` when `notes/<ID>-review.md` passes the same `ls-files` check, otherwise `milestone-verify <ID>`.
   - `wave: <n> <task ID>:<tier> ...`: among the current milestone's `todo` tasks whose wave is a positive integer, `<n>` is the lowest wave, compared as a number, followed by each `todo` task of that wave, in file order, as `<task ID>:<tier>`, separated by single spaces; `wave: none` when there is no such task or no current milestone.
   - `blocked: <IDs>`: for each row in table order, its ID when its status is `blocked`, then the ID of each task in its file with status `blocked`, in file order, separated by single spaces; `blocked: none` when there are none.
   - `open-questions: <count>`, the number of open-question lines.
7. Run Verify and confirm all 20 tests pass. Where `cygpath` isn't installed, the drive-letter test reports `skip` instead; on this machine it runs.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/next.bats` reports 20 tests and no failure.
- `plugins/orcastrat/scripts/next` contains no `pwsh` or `powershell`, in any case, and never reads plan.md's Decisions or a milestone's Context or Steps.

### M06-T03: Add the recover, worktrees and marker lines to next

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M06-T02, M03-T06, M05-T01
- Files: `plugins/orcastrat/scripts/next`, `tests/orcastrat/next.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/next.bats`
- Fails first: yes
- Commit: `feat(orcastrat): next reports recovery, leftover worktrees and the run marker`

**Objective**

`next` also prints `recover:`, `worktrees:` and `marker:`, completing the nine lines of spec §25a item 1, and `next.bats` covers the interrupted-attempt state, the worktree count and the marker.

**Read first**

- `docs/orcastrat-execution-spec.md` §25a item 1, and §9, the "Preflight" bullet
- plan.md Decisions D06, D113 and D57
- `plugins/orcastrat/scripts/verify` lines 35–43 (the slug and the common-dir resolution)
- `plugins/orcastrat/scripts/run-state` (the marker's lines)
- `tests/orcastrat/next.bats` (the helpers M06-T02 wrote)

**Interfaces**

- Consumes: `recover <plan-dir>` (M03-T06)
- Consumes: `recover stdout: OK, or one line per affected todo task in table order then task order, done <task ID> or interrupted <task ID>` (M03-T06)
- Consumes: `<git-dir>/orcastrat/active-run with the lines plan=<plan-dir>, started=<epoch>, heartbeat=<epoch>, blocks=0, block_heartbeat=` (M05-T01)
- Consumes: `next stdout lines 1-6: plan: <status>, milestone: <ID> <status> <path> or milestone: none, next: <step>, wave: <n> <task ID>:<tier> ... or wave: none, blocked: <IDs> or blocked: none, open-questions: <count>` (M06-T02)
- Consumes: next.bats helpers `run_script <args...>`, `out_line <key>`, `write_plan <plan status> <M01 status> <M02 status> [<open-question line>...]`, `write_milestone <file> <status> [<task ID>:<status>:<wave>:<tier>...]`, `commit_all <message>`, `fresh_plan`, `mid_wave_plan` (M06-T02)
- Produces: `next stdout lines 7-9: recover: <recover lines joined by "; ">, worktrees: <count>, marker: none, marker: active <n>m or marker: stale`

**Steps**

1. In `tests/orcastrat/next.bats`, change the test `next prints its lines in order` so the expected keys are `plan milestone next wave blocked open-questions recover worktrees marker`, and add a helper `write_marker <heartbeat>` that runs `mkdir -p "$REPO/.git/orcastrat"` and writes `$REPO/.git/orcastrat/active-run` with the lines `plan=plans/demo plan`, `started=1000`, `heartbeat=<heartbeat>`, `blocks=0` and `block_heartbeat=`.
2. Add these tests to the same file. Each expects exit status 0 and an empty `$stderr`, and checks the lines given with `out_line`.
   - `fresh plan: next prints all nine lines`: `fresh_plan`; `$output` is exactly the nine lines `plan: planned`, `milestone: M01 outline cygpath-stub [-m] [$PLAN/M01-first.md]`, `next: survey M01`, `wave: none`, `blocked: none`, `open-questions: 0`, `recover: OK`, `worktrees: 0`, `marker: none`.
   - `interrupted attempt: recover's line is printed`: `write_plan in-progress in-progress outline`, `write_milestone M01-first.md in-progress M01-T01:todo:1:worker`, `write_milestone M02-second.md outline`, `commit_all 'chore(plan): start M01'`, then write `work` to `$REPO/work.txt` and `commit_all 'M01-T01: feat: part one'`; `recover: interrupted M01-T01`, `next: wave 1`, `wave: 1 M01-T01:worker`.
   - `recover lines are joined with "; "`: the same plan with `M01-T01:todo:1:worker M01-T02:todo:1:worker`, `commit_all plan`, then `git -C "$REPO" commit --quiet --allow-empty -m 'chore(plan): M01-T01 done' -m 'Orcastrat-Task: M01-T01'`, then write `work` to `$REPO/work.txt` and `commit_all 'M01-T02: feat: part one'`; `recover: done M01-T01; interrupted M01-T02`.
   - `worktrees counts only task worktrees under the plan's worktree root`: `fresh_plan`; `git -C "$REPO" worktree add --quiet -b task-one "$REPO/.git/orcastrat/demo plan/M01-T01"`; `mkdir -p` the directories `logs`, `hold` and `briefs` under `$REPO/.git/orcastrat/demo plan`; `git -C "$REPO" worktree add --quiet -b other "$BATS_TEST_TMPDIR/other tree"`; `worktrees: 1`.
   - `marker is active with its heartbeat age in whole minutes`: `fresh_plan`; `write_marker` with the current `date -u +%s` minus 330; `marker: active 5m`.
   - `marker is stale when its heartbeat is more than an hour old`: `fresh_plan`; `write_marker` with the current `date -u +%s` minus 3700; `marker: stale`.
   - `a marker with no readable heartbeat is stale`: `fresh_plan`; `write_marker ''` gives `marker: stale`, and `write_marker abc` gives `marker: stale`.
   - `marker is read from the plan checkout's own git dir`: `fresh_plan`; `write_marker` with the current `date -u +%s`; `git -C "$REPO" worktree add --quiet -b other "$BATS_TEST_TMPDIR/other tree"`; `run_script "$BATS_TEST_TMPDIR/other tree/plans/demo plan"` gives `marker: none` and `worktrees: 0`; `run_script "$PLAN"` gives `marker: active 0m`.
3. Run Verify and confirm it fails (the new lines aren't printed yet).
4. In `plugins/orcastrat/scripts/next`, before printing anything, run `bash "$(dirname "${BASH_SOURCE[0]}")/recover" "<plan-dir>"` and keep its stdout. If it exits with any status but 0, fail with `recover failed`. The `recover:` value is its output lines joined by `; `.
5. Count the worktrees: resolve the slug and the absolute common dir exactly as `verify` lines 37–41 do, with `<plan-dir>` in place of `<dir>`. WT_ROOT is `<common>/orcastrat/<slug>`. The count is the number of directories directly under WT_ROOT that hold a file named `.git`; 0 when WT_ROOT doesn't exist.
6. Read the marker: the git dir is what `git -C "<plan-dir>" rev-parse --git-dir` prints, made absolute with `cd "<plan-dir>" && cd "<git dir>" && pwd`; the marker is `<git dir>/orcastrat/active-run`. No marker → `none`. Otherwise take the value of its first `heartbeat=` line, with any carriage return removed: empty or not all digits → `stale`; else the age is the current `date -u +%s` minus that value, taken as 0 when negative, and more than 3600 → `stale`, otherwise `active <age / 60, rounded down>m`. Then print, after the `open-questions:` line, `recover: <value>`, `worktrees: <count>` and `marker: <value>`, and add the three lines to the header comment.
7. Run Verify and confirm all 28 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/next.bats` reports 28 tests and no failure.
- `next` prints nine lines, in the order spec §25a item 1 gives.

### M06-T04: Workers read the brief, write a report file and may report DONE_WITH_CONCERNS

- Kind: change
- Tier: worker
- Batch: yes
- Status: done
- Wave: 1
- Depends on: M04-T02, M05-T02
- Files: `tests/orcastrat/agent-files.bats`, `plugins/orcastrat/agents/worker-mini-serial.md`, `plugins/orcastrat/agents/worker-mini-parallel.md`, `plugins/orcastrat/agents/worker-light.md`, `plugins/orcastrat/agents/worker.md`, `plugins/orcastrat/agents/worker-heavy.md`, `plugins/orcastrat/agents/specialist.md`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats`
- Fails first: yes
- Commit: `feat(orcastrat): workers read their brief, write a report file, and may report done with concerns`
- Process: worker committed on its own; reset and recommitted

**Objective**

Every worker agent reads the `Brief:` file instead of plan.md and the milestone file, writes its report file with RED and GREEN evidence, may report `DONE_WITH_CONCERNS`, and replies in at most 10 lines with a `REPORT:` line, and `agent-files.bats` checks all of it.

**Read first**

- `docs/orcastrat-execution-spec.md` §8, the "Workers and the per-task `reviewer`" bullet, and §10
- plan.md Decisions D100, D107 and D111
- `tests/orcastrat/agent-files.bats` lines 1–92 (the lists and helpers)
- `plugins/orcastrat/agents/worker.md` (the text the edits change)

**Interfaces**

- Consumes: `missing_lines <file> <expected-file>` (M04-T02)
- Consumes: `has_line <file> <text>` (M04-T02)
- Consumes: `WORKER_AGENTS`, a space-separated list of agent names (M04-T02)
- Consumes: `write_worker_rules <file>` (M05-T02)
- Produces: `Brief: <path>` and `Report: <path>` worker dispatch lines
- Produces: `STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED`
- Produces: `REPORT: <the path the Report: line gave>`
- Produces: report file sections `## Implemented`, `## Files changed`, `## RED evidence`, `## GREEN evidence`, `## Self-review`, `## Concerns`
- Produces: `## RED evidence` report section with a `Command:` line and a `text` fence
- Produces: `write_worker_report_rules <file>`
- Produces: `@test "worker agents read the brief and write the report file"`
- Produces: `@test "worker agents don't read plan.md or the milestone file"`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, inside `write_worker_rules`, replace the heredoc line that starts `The orchestrator sends you a plan directory` with W1's new line from the Context, and in the heredoc line that starts ``If a `Failures: <path>` line is present`` make W3's replacement.
2. In the same file, directly below the closing `}` of `write_worker_rules`, add one empty line and a function `write_worker_report_rules <file>`, with a comment above it, that writes with `cat > "$1" <<'EOF'` these lines, each exactly as the Context's worker agent edits give it: the three numbered lines from W2; W4's new line; the whole RED rule line as it reads after W5 (the line that starts ``- If the task has `- Fails first: yes`:``); W6's line; every non-empty line of W7's block; and the line `Reply with exactly this block and nothing else, at most 10 lines:`, the line `STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED` and the two lines from W8's block.
3. At the end of the same file, add one empty line and two tests, following the pattern of `worker agents have the commit, breaker, failure-log and resume rules`: `@test "worker agents read the brief and write the report file"` fails, echoing `missing report rules:` and the names, for each agent in `$WORKER_AGENTS` whose file lacks a line from `write_worker_report_rules`; `@test "worker agents don't read plan.md or the milestone file"` fails, echoing `plan-file reads in:` and the names, for each agent in `$WORKER_AGENTS` whose file contains, by `grep -qF`, ``2. `plan.md` in the plan directory: the Decisions section.`` or `4. Your task block in the milestone file, in full. It is your prompt.`.
4. Run Verify and confirm it fails (the updated and new tests fail for all six worker agents).
5. In each of these six files, make edits W1 to W8 from the Context's "Worker agent edits", in that order: `plugins/orcastrat/agents/worker-mini-serial.md`, `plugins/orcastrat/agents/worker-mini-parallel.md`, `plugins/orcastrat/agents/worker-light.md`, `plugins/orcastrat/agents/worker.md`, `plugins/orcastrat/agents/worker-heavy.md`, `plugins/orcastrat/agents/specialist.md`. Leave `specialist.md`'s extra judgment Rule as it is.
6. Run Verify and confirm every test passes.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats` passes, including the two new tests and the updated `write_worker_rules`.
- Each of the six worker agent files has edits W1 to W8, and its frontmatter, `## Search and command bounds` section and the rest of its text are unchanged.

### M06-T05: Cap every non-worker agent's reply at 20 lines

- Kind: change
- Tier: worker
- Batch: yes
- Status: done
- Wave: 2
- Depends on: M04-T02, M06-T04
- Files: `tests/orcastrat/agent-files.bats`, `plugins/orcastrat/agents/scout.md`, `plugins/orcastrat/agents/scout-heavy.md`, `plugins/orcastrat/agents/planner.md`, `plugins/orcastrat/agents/reviewer.md`, `plugins/orcastrat/agents/plan-reviewer.md`, `plugins/orcastrat/agents/milestone-reviewer.md`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats`
- Fails first: yes
- Commit: `feat(orcastrat): non-worker agents reply in at most 20 lines`

**Objective**

`scout`, `scout-heavy`, `planner`, `reviewer`, `plan-reviewer` and `milestone-reviewer` each end with the rule that their reply is at most 20 lines and anything longer goes in a notes file, and `agent-files.bats` checks it.

**Read first**

- `docs/orcastrat-execution-spec.md` §10, the "Other agents follow the same shape" bullet
- plan.md Decision D106
- `tests/orcastrat/agent-files.bats` lines 1–75 (the lists and helpers)

**Interfaces**

- Consumes: `NON_WORKER_AGENTS`, a space-separated list of agent names (M04-T02)
- Consumes: `has_line <file> <text>` (M04-T02)
- Produces: `@test "non-worker agents cap their reply at 20 lines"`
- Produces: the agent line `Your reply is at most 20 lines. Anything longer goes in a file under the plan directory's `notes/`, and your reply gives its path.`

**Steps**

1. At the end of `tests/orcastrat/agent-files.bats`, add one empty line and `@test "non-worker agents cap their reply at 20 lines"`, which fails, echoing `no reply cap in:` and the names, for each agent in `$NON_WORKER_AGENTS` whose file has no line equal to (by `has_line`) the line given in Step 3.
2. Run Verify and confirm it fails (the new test fails for all six agents).
3. At the end of each of these six files, add one empty line and then this line: `plugins/orcastrat/agents/scout.md`, `plugins/orcastrat/agents/scout-heavy.md`, `plugins/orcastrat/agents/planner.md`, `plugins/orcastrat/agents/reviewer.md`, `plugins/orcastrat/agents/plan-reviewer.md`, `plugins/orcastrat/agents/milestone-reviewer.md`.

   ```text
   Your reply is at most 20 lines. Anything longer goes in a file under the plan directory's `notes/`, and your reply gives its path.
   ```

4. Run Verify and confirm every test passes.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats` passes, including the new test.
- Each of the six files ends with the line from Step 3, after one empty line, and nothing else in it changed.

### M06-T06: The reviewer reads the brief and checks a worker's concerns

- Kind: change
- Tier: worker
- Status: done
- Wave: 3
- Depends on: M04-T02, M05-T03, M06-T05
- Files: `plugins/orcastrat/agents/reviewer.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats`
- Fails first: yes
- Commit: `feat(orcastrat): the reviewer reads the brief and checks the worker's concerns`

**Objective**

The per-task `reviewer` reads the `Brief:` file instead of plan.md and the milestone file, and, given a `Report:` line after a `DONE_WITH_CONCERNS`, checks the worker's concerns; `agent-files.bats` checks both.

**Read first**

- `docs/orcastrat-execution-spec.md` §8, the "Workers and the per-task `reviewer`" bullet, and §10, the `DONE_WITH_CONCERNS` bullet
- plan.md Decisions D100 and D106
- `plugins/orcastrat/agents/reviewer.md` lines 27–50 (`## Before anything else` and `## Check`)
- `tests/orcastrat/agent-files.bats` lines 1–75 (the helpers)

**Interfaces**

- Consumes: `Base: <BASE>` reviewer dispatch line (M05-T03)
- Consumes: `missing_lines <file> <expected-file>` (M04-T02)
- Produces: `Brief: <path>`, `Base: <BASE>` and `Report: <path>` reviewer dispatch lines
- Produces: `write_reviewer_rules <file>`
- Produces: `@test "reviewer reads the brief and checks the worker's concerns"`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, directly above the line `@test "field ignores carriage returns" {`, add a function `write_reviewer_rules <file>`, with a comment above it and one empty line after it, that writes with `cat > "$1" <<'EOF'` the lines given in Steps 4 to 6 (Step 4's line `2. The brief ...`, Step 5's two new lines, and Step 6's line), each exactly as given. At the end of the file, add one empty line and `@test "reviewer reads the brief and checks the worker's concerns"`, which fails when `$AGENTS/reviewer.md` lacks a line from `write_reviewer_rules` (use `missing_lines`, and echo what is missing), when it doesn't contain, by `grep -qF`, ``The orchestrator sends you a `Brief:` path and a `Base:` commit``, or when it still contains ``2. `plan.md`: the header and Decisions.``.
2. Run Verify and confirm it fails (the new test fails).
3. In `plugins/orcastrat/agents/reviewer.md`, replace ``The orchestrator sends you a plan directory, a milestone ID, a task ID, a `Base:` commit, and sometimes a `Worktree:` path.`` with:

   ```text
   The orchestrator sends you a `Brief:` path and a `Base:` commit, sometimes a `Worktree:` path, and, when the worker reported `DONE_WITH_CONCERNS`, a `Report:` path.
   ```

4. In the same file, replace these two lines:

   ```text
   2. `plan.md`: the header and Decisions.
   3. The milestone file: its Context, then your task block in full.
   ```

   with this line:

   ```text
   2. The brief at the `Brief:` path, in full: plan.md's Decisions, the milestone's Context, and the task block. Don't open plan.md or the milestone file: where Read first names their Decisions or Context, read them in the brief.
   ```

5. In the same file, replace `4. Everything in the task's Read first list.` with `3. Everything in the task's Read first list.`, then replace ``5. The task's changes since `Base`,`` with ``4. The task's changes since `Base`,``, then insert, directly below the line that now starts `4. The task's changes since`, this line:

   ```text
   5. If a `Report:` line is present: the `## Concerns` section of that report file.
   ```

   The new line `3. Everything in the task's Read first list.` and the line from this Step are the two lines `write_reviewer_rules` takes from it.
6. In the same file, in `## Check`, directly below the line `- Every Done-when criterion holds.`, insert this line, then run Verify and confirm every test passes:

   ```text
   - If a `Report:` line is present, check each concern in the report's `## Concerns` section. A concern that shows the Objective, a Step, a Done-when criterion or an Interfaces entry isn't met is a failure; a concern that doesn't is not.
   ```

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats` passes, including the new test.
- The reviewer's `## Before anything else` lists five items: instruction files, the brief, Read first, the changes since `Base`, and the concerns; nothing else in `reviewer.md` changed.

### M06-T07: Scouts reply inline when their answers fit in 20 lines

- Kind: change
- Tier: worker
- Status: done
- Wave: 4
- Depends on: M06-T05
- Files: `plugins/orcastrat/agents/scout.md`, `plugins/orcastrat/agents/scout-heavy.md`, `plugins/orcastrat/skills/plan/SKILL.md`
- Verify: `grep -qF 'If your answers fit in 20 lines, or the brief has no' plugins/orcastrat/agents/scout.md && grep -qF 'If your answers fit in 20 lines, or the brief has no' plugins/orcastrat/agents/scout-heavy.md && grep -qF 'or a question brief whose answers' plugins/orcastrat/agents/scout.md && grep -qF 'or a question brief whose answers' plugins/orcastrat/agents/scout-heavy.md && ! grep -qF 'If the brief ends with an' plugins/orcastrat/agents/scout.md && ! grep -qF 'If the brief ends with an' plugins/orcastrat/agents/scout-heavy.md && grep -qF 'notes/research-<n>.md' plugins/orcastrat/skills/plan/SKILL.md`
- Fails first: no (agent and skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): scouts reply inline when their answers are short`

**Objective**

`plan` ends every scout brief with an `Output: <plan dir>/notes/research-<n>.md` line, and a scout whose answers fit in 20 lines replies with them and writes no file, while longer answers go to that file (D110).

**Read first**

- plan.md Decision D110
- `plugins/orcastrat/agents/scout.md` section `## Output`
- `plugins/orcastrat/skills/plan/SKILL.md` lines 40–50 (`### Delegate the code reading`)

**Interfaces**

- Consumes: none
- Produces: `Output: <plan dir>/notes/research-<n>.md` scout brief line

**Steps**

1. In `plugins/orcastrat/agents/scout.md`, replace the line that starts `- **For a question brief**,` with this line:

   ```text
   - **For a question brief**, answer under each question's number, then give Unconfirmed and Conflicts if any. If your answers fit in 20 lines, or the brief has no `Output:` line, reply with them and write no file. Otherwise write them to the brief's `Output:` path and reply in the survey format below.
   ```

2. In the same file, replace ``or a brief with an `Output:` line,`` with `or a question brief whose answers don't fit in 20 lines,`.
3. In `plugins/orcastrat/agents/scout-heavy.md`, make the same two replacements as Steps 1 and 2.
4. In `plugins/orcastrat/skills/plan/SKILL.md`, replace `Brief scouts with specific, numbered questions and ask for facts, not summaries; they report exactly that way.` with:

   ```text
   Brief scouts with specific, numbered questions and ask for facts, not summaries; they report exactly that way. End every scout brief with the line `Output: <plan dir>/notes/research-<n>.md`, numbering this plan's scout briefs from 1: a scout whose answers fit in 20 lines replies with them and writes no file, and otherwise writes them to that file and replies with its path.
   ```

5. Run Verify.

**Done when**

- Both scout files' `## Output` sections read as in Steps 1 and 2, and `plan`'s scout-brief paragraph as in Step 4.
- Nothing else in the three files changed.

### M06-T08: Describe briefs and report files in the plan format

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/reference/plan-format.md`
- Verify: `grep -qF 'through a brief that run' plugins/orcastrat/reference/plan-format.md && grep -qF 'worker reports (reports/<task-id>.md)' plugins/orcastrat/reference/plan-format.md && grep -qF 'A worker never opens plan.md or the milestone file.' plugins/orcastrat/reference/plan-format.md && ! grep -qF ', and plan reviews (<milestone-id>-plan-review.md)' plugins/orcastrat/reference/plan-format.md`
- Fails first: no (reference text with no test; the Verify greps fail until the text is added)
- Commit: `docs(orcastrat): describe task briefs and report files in the plan format`

**Objective**

The plan format says workers and the reviewer read their task through a brief, names the report files, failure logs and run log in the plan's `notes/`, and states what a brief holds.

**Read first**

- `docs/orcastrat-execution-spec.md` §8 and §10, the "Report file" bullet
- `plugins/orcastrat/reference/plan-format.md` lines 1–24 and 249–257

**Interfaces**

- Consumes: none
- Produces: none

**Steps**

1. In `plugins/orcastrat/reference/plan-format.md`, replace the line `- **workers** and **reviewer** (agents), which read their task from it.` with:

   ```text
   - **workers** and **reviewer** (agents), which read their task from it, through a brief that run's `task-brief` script copies out of it.
   ```

2. In the same file, replace `, and plan reviews (<milestone-id>-plan-review.md)` with `, plan reviews (<milestone-id>-plan-review.md), worker reports (reports/<task-id>.md), failure logs (<task-id>-failures.md), and the run log (run-log.md)`.
3. In the same file, directly below the line that starts `- **Self-contained.**`, insert one empty line and then this line:

   ```text
   A worker never opens plan.md or the milestone file. Before each dispatch, run's `task-brief` script copies plan.md's Decisions, the milestone's whole Context, and the task block into one brief inside `.git`, and the worker and the per-task reviewer read that brief, CLAUDE.md / AGENTS.md, and the task's Read first list. So anything a worker needs from the plan must be in one of those three places. The worker writes what it did, with its RED and GREEN evidence, to its report file, `notes/reports/<task ID>.md` in the plan directory, and run commits that file with the task.
   ```

4. Run Verify.

**Done when**

- The contract list, the `notes/` line of the directory tree, and `## Tasks are prompts` read as in Steps 1 to 3.
- Nothing else in the file changed.

### M06-T09: run finds its place with next and reads as little of the plan as it can

- Kind: change
- Tier: worker
- Status: done
- Wave: 3
- Depends on: M06-T02, M06-T03
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF -- '- **Next**: run `bash' plugins/orcastrat/skills/run/SKILL.md && grep -qF -- '- **Plan header**:' plugins/orcastrat/skills/run/SKILL.md && grep -qF -- '- **Task block** of a task:' plugins/orcastrat/skills/run/SKILL.md && grep -qF '**Read as little of the plan as you can.**' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'git commit -m "chore(plan): notes"' plugins/orcastrat/skills/run/SKILL.md && grep -qF '4. Where the run stands: run **next**' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'Read these now, in full:' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 're-read plan.md and the current milestone file' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '$(' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run finds its place with next and never reads Decisions`

**Objective**

`run`'s operating rules find its place with `next`, forbid reading plan.md's Decisions, and commit notes before the next dispatch, and its Definitions say how to run `next` and how to read the plan header and a task block.

**Read first**

- `docs/orcastrat-execution-spec.md` §25a items 1 to 3, and §10, the "Notes are committed" bullet
- plan.md Decisions D105, D114 and D115
- `plugins/orcastrat/skills/run/SKILL.md` lines 22–72

**Interfaces**

- Consumes: `next <plan-dir>` (M06-T02)
- Consumes: `next stdout lines 1-6: plan: <status>, milestone: <ID> <status> <path> or milestone: none, next: <step>, wave: <n> <task ID>:<tier> ... or wave: none, blocked: <IDs> or blocked: none, open-questions: <count>` (M06-T02)
- Consumes: `next stdout lines 7-9: recover: <recover lines joined by "; ">, worktrees: <count>, marker: none, marker: active <n>m or marker: stale` (M06-T03)
- Produces: `**Next**`
- Produces: `**Plan header**`
- Produces: `**Task block**`
- Produces: `chore(plan): notes`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, replace the line that starts `- **The files and git history are the truth, not your memory.**` with these three lines:

   ```text
   - **The files and git history are the truth, not your memory.** Find your place with **next** (see Definitions): at start, before each wave, whenever your context may have been compacted or you're unsure of the state, and whenever the Stop hook sends you back. Take the step its `next:` line names. Every bookkeeping step resumes from git: before doing a step, check whether its result is already committed, and skip or finish it instead of redoing it.
   - **Read as little of the plan as you can.** Never read plan.md's Decisions: agents get them through their briefs. Read the **plan header**, and a **task block** when you need one of its fields (see Definitions). Only the validation checklist (3a, 3b, and the fix round in 3f) reads the milestone file whole, and plan.md's sections other than Decisions.
   - **Notes are committed before the next dispatch.** Every file under `<plan dir>/notes/` that an agent or you wrote (surveys, reviews, reports, failure logs, `run-log.md`) goes into your next bookkeeping commit, before the next task is dispatched, so the tree is clean for the next scope check. Before you record BASE for a dispatch, run `git status --porcelain -- "<plan dir>/notes"`; if it prints anything, commit it first: `git add "<plan dir>/notes"`, then `git commit -m "chore(plan): notes"`.
   ```

2. In section `## Definitions`, directly below the line that starts `- **Scripts**:`, insert these three lines:

   ```text
   - **Next**: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/next" "<plan dir>"`. It prints nine `key: value` lines, in this order: `plan: <plan status>`; `milestone: <ID> <status> <file path>` for the first milestone that isn't `done`, or `milestone: none`; `next:` with the step to take, one of `survey <ID>`, `detail <ID>`, `start <ID>`, `wave <n>`, `milestone-verify <ID>`, `review <ID>`, `final-verify`, `complete` or `blocked`; `wave: <n> <task ID>:<tier> ...`, the current milestone's lowest wave with `todo` tasks, each with its planned Tier, or `wave: none`; `blocked:` with the blocked milestone and task IDs, or `blocked: none`; `open-questions: <count>`; `recover:` with the `recover` script's output lines joined by `; `; `worktrees: <count>`, the task worktrees left under WT_ROOT; and `marker: none`, `marker: active <n>m` or `marker: stale`, this checkout's active-run marker. It reads only the plan's status, Wave and Tier lines, never Decisions, Context or Steps.
   - **Plan header**: plan.md's title, header fields and Milestones table, every line above its `## Coverage` heading, or above `## Decisions` when it has no Coverage. To read it, Grep plan.md for `^## (Coverage|Decisions)` with line numbers, then Read plan.md from line 1 up to the line before the first match. Never read further down plan.md, except for the validation checklist.
   - **Task block** of a task: its lines in the milestone file, from its `### <task ID>:` heading to the line before the next line starting `## ` or `### ` outside a code fence. To read it, Grep the milestone file for `^#{2,3} ` with line numbers, then Read only that range, with the Read tool's offset and limit; if the range ends inside an open code fence, read on to the next heading after the fence. It gives you the fields `next` doesn't print (Verify, Files, Commit, Fails first, Depends on) and the task's `- Escalated:`, `- Re-tiered:`, `- Interrupted:` and `- Blocked:` lines, and it lets you edit the task's lines.
   ```

3. In section `## 1. Re-read the ground truth`, replace these five lines:

   ```text
   Read these now, in full:

   1. `CLAUDE.md` and `AGENTS.md` at the repository root. If one is a symlink to the other, or they have identical content, read it once.
   2. The plan format: `${CLAUDE_PLUGIN_ROOT}/reference/plan-format.md`.
   3. The plan's `plan.md`.
   ```

   with exactly:

   ```text
   Read these now:

   1. `CLAUDE.md` and `AGENTS.md` at the repository root, in full. If one is a symlink to the other, or they have identical content, read it once.
   2. The plan format, in full: `${CLAUDE_PLUGIN_ROOT}/reference/plan-format.md`.
   3. The **plan header** (see Definitions). Not the rest of plan.md: never its Decisions.
   4. Where the run stands: run **next** (see Definitions), and keep its nine lines for the preflight.
   ```

4. Run Verify.

**Done when**

- The operating rules have the three bullets from Step 1 in place of the old "truth" bullet, `## Definitions` has the three entries from Step 2 directly after `**Scripts**`, and section 1 reads as in Step 3.
- The skill contains no `$(`, and nothing else in it changed.

### M06-T10: run's preflight reads next and finishes a detailed but uncommitted milestone

- Kind: change
- Tier: worker
- Status: done
- Wave: 4
- Depends on: M06-T09
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'a **detailed but uncommitted milestone**' plugins/orcastrat/skills/run/SKILL.md && grep -qF '2. **Detailed milestone.**' plugins/orcastrat/skills/run/SKILL.md && grep -qF '3. **Interrupted attempt.**' plugins/orcastrat/skills/run/SKILL.md && grep -qF '7. Commit: `git add -A`, then' plugins/orcastrat/skills/run/SKILL.md && grep -qF '2c item 3 resets that attempt' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'second interruption (2c item 3)' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'If the `blocked:` line of **next**' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'Read the `recover:` line of **next**' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '6. Commit: `git add -A`' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '$(' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run's preflight reads next and finishes an uncommitted detail`

**Objective**

`run`'s preflight takes the plan status, blocks, leftover worktrees and recovery lines from `next`, accepts only one dirty tree, a detailed but uncommitted milestone, and finishes that milestone in 2c before the start commit (D109, D116).

**Read first**

- `docs/orcastrat-execution-spec.md` §25a item 3
- plan.md Decisions D109 and D116
- `plugins/orcastrat/skills/run/SKILL.md` section `## 2. Preflight`
- `plugins/orcastrat/skills/run/SKILL.md` section 3a, items 5 to 8

**Interfaces**

- Consumes: `**Next**` (M06-T09)
- Produces: `2. **Detailed milestone.**`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section 2a, replace the line that starts `1. **Working tree is clean.**` with this line:

   ```text
   1. **Working tree is clean.** `git status --porcelain` prints nothing: no uncommitted changes, and no untracked files outside `.gitignore`. It may print one other thing, a **detailed but uncommitted milestone**: the `milestone:` line of **next** says `ready`, and every path printed is `<plan dir>/plan.md`, that milestone's file, one of its survey notes `<plan dir>/notes/<ID>-survey*.md`, or its plan-review report `<plan dir>/notes/<ID>-plan-review.md`; 2c item 2 finishes that milestone. If it prints anything else, stop with reason SETUP and list the paths it printed: the user must commit or discard them first. Uncommitted changes in a task's Files are never treated as an interrupted attempt: they may be the user's own edits, which a reset and clean would destroy. A failed attempt is cleaned with `git clean -fd`, which would otherwise delete the user's untracked files.
   ```

2. In section 2a, make three replacements. Replace ``2. **Plan status.** If `complete`, report that and stop. If `blocked`,`` with ``2. **Plan status.** If the `plan:` line of **next** says `complete`, report that and stop. If it says `blocked`,``. Replace the line ``3. **Open blocks.** If any milestone or task is `blocked`, stop and report it.`` with the line ``3. **Open blocks.** If the `blocked:` line of **next** isn't `blocked: none`, stop and report the IDs it lists.``. Replace `If WT_ROOT contains worktrees from an earlier run, list them to the user and stop.` with ``If the `worktrees:` line of **next** isn't `worktrees: 0`, WT_ROOT holds task worktrees from an earlier run: list them to the user from `git worktree list`, and stop.``
3. In section 2a, item 6, replace ``6. **Interrupted-run recovery.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/recover" "<plan dir>"`. It prints `OK`, or one line per affected `todo` task.`` with ``6. **Interrupted-run recovery.** Read the `recover:` line of **next**: the output of the `recover` script, with its lines joined by `; `. It is `OK`, or one line per affected `todo` task.``, and replace `2c item 2 resets that attempt and redispatches the task.` with `2c item 3 resets that attempt and redispatches the task.`
4. In section 2b, replace the line ``- For the next milestone, if it's detailed: `todo` task count by tier, its waves, and whether they'll run in parallel (and Max parallel) or serially.`` with the line `- For the next milestone, if it's detailed: the wave **next** names, with its tasks and tiers, and whether waves will run in parallel (and Max parallel) or serially.` Then, directly below the line that starts ``- Any tasks you'll mark `done` because of interrupted-run recovery``, insert this line:

   ```text
   - A detailed but uncommitted milestone (2a item 1), which you will plan-review, validate and commit without running the planner again.
   ```

5. In section 2c, replace the line ``2. **Interrupted attempt.** For an `interrupted <task ID>` line from 2a item 6:`` with these two lines:

   ```text
   2. **Detailed milestone.** If 2a item 1 accepted a detailed but uncommitted milestone, finish it before anything else in 2c changes a file, without running the planner again: invoke `orcastrat:plan-reviewer` and handle its result as in 3a item 5, unless `<plan dir>/notes/<ID>-plan-review.md` was among the paths 2a item 1 listed; then run the validation checklist on the milestone, and on any failure mark it `blocked` with the failures and go to **Stop**; then check scope and commit as in 3a items 6 and 7 (`chore(plan): detail <ID>`). If Gates includes `detail`, go to **Pause** with reason `GATE`, telling the user to review the milestone file and rerun.
   3. **Interrupted attempt.** For an `interrupted <task ID>` line from 2a item 6:
   ```

   Then, in 2c, renumber the four items below it: replace `3. **Recovery.**` with `4. **Recovery.**`, `4. **Status.**` with `5. **Status.**`, `5. **Run state.**` with `6. **Run state.**`, and ``6. Commit: `git add -A`, then`` with ``7. Commit: `git add -A`, then``.
6. In section `## Failed attempt`, replace `a second interruption (2c item 2) has` with `a second interruption (2c item 3) has`.
7. Run Verify.

**Done when**

- 2a items 1 to 4 and 6 read from **next**, and item 1 accepts only the detailed but uncommitted milestone as a dirty tree.
- 2b mentions that milestone; 2c has seven items, with **Detailed milestone** as item 2; every reference to the interrupted-attempt item says `2c item 3`.
- Nothing else in the file changed.

### M06-T11: run's milestone loop follows next and skips committed reviews

- Kind: change
- Tier: worker
- Status: done
- Wave: 5
- Depends on: M06-T09, M06-T10
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF -- '- **Committed review result** of a review note:' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'the milestone is an outline:' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'the survey note is already committed' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'the review note is then already committed' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'the review is already committed from an earlier session' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'notes/<ID>-review-2.md"` prints that path' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'Before each wave, run **next**' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'If Status is `outline`:' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'For the current milestone, read its file, then:' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'Take the lowest wave that still has' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run's milestone loop follows next and skips committed reviews`

**Objective**

`run`'s milestone loop takes the current milestone, the outline check and each wave set from `next`, skips a committed survey, review or re-review agent, and reads a committed review's result from its `## Blocking` section (D104).

**Read first**

- `docs/orcastrat-execution-spec.md` §25a items 2 and 3
- plan.md Decisions D103 and D104
- `plugins/orcastrat/skills/run/SKILL.md` section `## 3. Milestone loop`, 3a items 1 to 2, 3c, and 3f items 1 to 6
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions`, the `**Task block**` entry

**Interfaces**

- Consumes: `**Next**` (M06-T09)
- Consumes: `**Task block**` (M06-T09)
- Produces: `**Committed review result**`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `## 3. Milestone loop`, make three replacements. Replace the line `For the current milestone, read its file, then:` with the line ``The current milestone is the one the `milestone:` line of **next** names, with its file path. Read that file only for the validation checklist and for task blocks (see Definitions). Then:``. Replace the line ``If Status is `outline`:`` with the line ``If the `next:` line of **next** says `survey <ID>` or `detail <ID>`, the milestone is an outline:``. Replace `Skip this if that notes file is already committed from an earlier, interrupted attempt.` with ``Skip this when the `next:` line of **next** says `detail <ID>`: the survey note is already committed.``
2. In section 3c, replace ``Repeat until the milestone has no `todo` task. Take the lowest wave that still has `todo` tasks. Its `todo` tasks, in task ID order, are the **wave set**.`` with:

   ```text
   Before each wave, run **next** (see Definitions); repeat until its `wave:` line says `wave: none`. That line names the lowest wave that still has `todo` tasks and lists them, in task ID order, with their planned tiers: they are the **wave set**. Read a task's **task block** (see Definitions) when you need its fields.
   ```

3. In section 3f, replace `1. Verify the Milestone verify command in MAIN (see Definitions), if any. On failure,` with ``1. Verify the Milestone verify command in MAIN (see Definitions), if any, unless the `next:` line of **next** says `review <ID>`: the review note is then already committed, so this ran before it. On failure,``.
4. In section 3f, item 2, replace ``Otherwise invoke the agent `orcastrat:milestone-reviewer` with exactly:`` with ``Otherwise, if the `next:` line of **next** says `review <ID>`, the review is already committed from an earlier session: don't invoke the reviewer again, take its **committed review result** (see Definitions), and go on to item 3. Otherwise invoke the agent `orcastrat:milestone-reviewer` with exactly:``.
5. In section 3f, replace `5. **Re-review.** Verify the Milestone verify command in MAIN again (see Definitions), if any, handling a failure as in item 1.` with:

   ```text
   5. **Re-review.** If `git ls-files "<plan dir>/notes/<ID>-review-2.md"` prints that path, the re-review is already committed from an earlier session: take its **committed review result** (see Definitions) and go on to item 6. Otherwise verify the Milestone verify command in MAIN again (see Definitions), if any, handling a failure as in item 1.
   ```

6. In section `## Definitions`, directly below the line that starts `- **Task block** of a task:`, insert this line:

   ```text
   - **Committed review result** of a review note: Grep the note for `^## Blocking` with `-A 2`. If `None.` follows the heading, the result is `BLOCKING: 0`; any finding there means `BLOCKING` above 0. Read nothing else of the note.
   ```

7. Run Verify.

**Done when**

- Section 3, 3a and 3c take the current milestone, the outline check and the wave set from **next**; 3f items 1, 2 and 5 skip a committed review or re-review and take its **committed review result**.
- Nothing else in the file changed.

### M06-T12: run generates a brief before every dispatch and sends task-unique lines

- Kind: change
- Tier: worker
- Status: done
- Wave: 6
- Depends on: M06-T01, M06-T04, M06-T06, M06-T11
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF -- '- **Brief** of a task:' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'scripts/task-brief" "<plan dir>" <task ID>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'Brief: <the path task-brief printed>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'Report: <MAIN>/<report file>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'Report: <worktree>/<report file>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'report file (see Definitions), each as its own double-quoted argument' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'Milestone: <milestone ID>' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'Each gets the three dispatch lines' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'the same three lines as the dispatch' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'the worker reads it from the plan.' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run sends each worker a brief and its report path`

**Objective**

Before every dispatch `run` generates the task's brief with `task-brief`, and a worker's dispatch carries only `Brief:`, `Report:`, and `Failures:` or `Worktree:` when they apply; the reviewer gets `Brief:` and `Base:`; a parallel scope check allows the report file (D100, D101, D108, D117).

**Read first**

- `docs/orcastrat-execution-spec.md` §8 and §22 item 2, the "dispatch message" bullet
- plan.md Decisions D100, D101, D108 and D117
- `plugins/orcastrat/skills/run/SKILL.md` sections 3d items 1 and 5, and 3e items 2 and 3

**Interfaces**

- Consumes: `task-brief <plan-dir> <task-id>` (M06-T01)
- Consumes: `task-brief stdout: the brief's absolute path through print_path, and nothing else` (M06-T01)
- Consumes: `Brief: <path>` and `Report: <path>` worker dispatch lines (M06-T04)
- Consumes: `Brief: <path>`, `Base: <BASE>` and `Report: <path>` reviewer dispatch lines (M06-T06)
- Produces: `**Brief**`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `## Definitions`, directly below the line that starts `- **Verify a command**`, insert this line:

   ```text
   - **Brief** of a task: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/task-brief" "<plan dir>" <task ID>`. It copies plan.md's Decisions, the milestone's Context and the task block into one file under the directory `git rev-parse --git-common-dir` prints, plus `/orcastrat/<plan-slug>/briefs/`, where every worktree can read it, and prints only that file's path. Generate it before every dispatch of a task, including the fresh dispatch after an escalation and the redispatch of an interrupted attempt, so it always holds the current Decisions and task block. Never generate it for a resume: the resumed agent has already read it.
   ```

2. In section 3d, item 1, make three replacements. Replace ``Record BASE: run `git rev-parse HEAD` in MAIN. Find the task's current tier`` with ``Record BASE: run `git rev-parse HEAD` in MAIN. Generate the task's **brief** (see Definitions). Find the task's current tier``. Replace these three lines:

   ```text
      Plan: <plan dir>
      Milestone: <milestone ID>
      Task: <task ID>
   ```

   with these two lines:

   ```text
      Brief: <the path task-brief printed>
      Report: <MAIN>/<report file>
   ```

   Replace `the worker reads it from the plan.` with `the worker reads it from the brief. The report path is MAIN followed by the task's report file (see Definitions).`
3. In section 3d, item 5, replace ``- `review` → invoke `orcastrat:reviewer` with the same three lines as the dispatch, plus `Base: <BASE>`;`` with ``- `review` → invoke `orcastrat:reviewer` with exactly the two lines `Brief: <the task's brief path>` and `Base: <BASE>`;``.
4. In section 3e, replace these five lines:

   ````text
   2. **Dispatch all of the batch's workers at once**: one call per task to the worker agent for its tier (see Definitions), all in a single message, so they run concurrently. Each gets the three dispatch lines plus:
      ```
      Worktree: <absolute worktree path>
      ```
      plus the retry lines on a retry.
   ````

   with exactly:

   ````text
   2. **Dispatch all of the batch's workers at once**: first generate each task's **brief** (see Definitions), then make one call per task to the worker agent for its tier (see Definitions), all in a single message, so they run concurrently. Each gets exactly:
      ```
      Brief: <the path task-brief printed>
      Report: <worktree>/<report file>
      Worktree: <absolute worktree path>
      ```
      plus the retry lines on a retry. In a parallel wave the report path is under the task's worktree, since the worker never writes in the main checkout.
   ````

5. In section 3e, item 3, replace `passing each path in the task's Files as its own double-quoted argument` with `passing each path in the task's Files, then the task's report file (see Definitions), each as its own double-quoted argument`.
6. Run Verify.

**Done when**

- `## Definitions` has the **Brief** entry; 3d item 1 generates the brief and sends `Brief:` and `Report:`; 3d item 5 sends the reviewer `Brief:` and `Base:`; 3e item 2 generates briefs and sends `Brief:`, `Report:` and `Worktree:`; 3e item 3's scope check passes the report file.
- Nothing else in the file changed.

### M06-T13: run checks RED evidence, reviews DONE_WITH_CONCERNS, and points retries at the report

- Kind: change
- Tier: worker
- Status: done
- Wave: 7
- Depends on: M06-T04, M06-T06, M06-T12, M05-T07
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF -- '- **RED evidence** in a report file:' plugins/orcastrat/skills/run/SKILL.md && grep -qF '  - Report: <notes/reports/<task ID>-attempt<n>.md' plugins/orcastrat/skills/run/SKILL.md && grep -qF '`NOTE`, `REPORT`)' plugins/orcastrat/skills/run/SKILL.md && grep -qF -- '- `DONE_WITH_CONCERNS` → continue as for `DONE`' plugins/orcastrat/skills/run/SKILL.md && grep -qF -- '- `DONE_WITH_CONCERNS` → the reviewer always runs' plugins/orcastrat/skills/run/SKILL.md && grep -qF '     Report: <MAIN>/<report file>' plugins/orcastrat/skills/run/SKILL.md && grep -qF -- '- Any other `DONE` or `DONE_WITH_CONCERNS` →' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'no **RED evidence** in the report file under the worktree' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '`Worktree:` line, and `Base: <BASE>`)' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '$(' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run checks RED evidence and reviews work done with concerns`

**Objective**

`run` accepts `RED: CONFIRMED` only with RED evidence in the report file, treats `DONE_WITH_CONCERNS` like `DONE` plus a review of the concerns in serial and parallel waves, and names the report file in each failure-log entry and resume message (D107, D111).

**Read first**

- `docs/orcastrat-execution-spec.md` §10
- plan.md Decisions D107 and D111
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions`, the `**Failure-log entry**` entry
- `plugins/orcastrat/skills/run/SKILL.md` sections 3d items 3 and 5, 3e item 3, and `## Failed attempt` item 1

**Interfaces**

- Consumes: `STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED` (M06-T04)
- Consumes: `## RED evidence` report section with a `Command:` line and a `text` fence (M06-T04)
- Consumes: `Brief: <path>`, `Base: <BASE>` and `Report: <path>` reviewer dispatch lines (M06-T06)
- Consumes: `**Brief**` (M06-T12)
- Consumes: `**Failure-log entry**` (M05-T07)
- Produces: `**RED evidence**`
- Produces: failure-log entry line `- Report: <path>`
- Produces: resume message line `Report: <report file>`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `## Definitions`, directly below the line that starts `- **Brief** of a task:`, insert this line:

   ```text
   - **RED evidence** in a report file: its `## RED evidence` section has a `Command:` line and a code fence with at least one line of output in it. Check it with Grep on the report file, pattern `^## RED evidence`, output mode content, with `-A 12`, and read nothing else of the report. A report file that doesn't exist has no RED evidence.
   ```

2. In the `**Failure-log entry**` entry's fenced block, directly below the line `  - Fixes tried: <the worker's FIXES TRIED line, or none reported when it gave none or "-">`, insert this line:

   ```text
     - Report: <notes/reports/<task ID>-attempt<n>.md when this attempt's report was preserved under that name, otherwise notes/reports/<task ID>.md>
   ```

3. In section 3d, item 3, make four edits. Replace ``(`STATUS`, `REASON`, `FILES`, `VERIFY`, `RED`, `HYPOTHESIS`, `FIXES TRIED`, `NOTE`).`` with ``(`STATUS`, `REASON`, `FILES`, `VERIFY`, `RED`, `HYPOTHESIS`, `FIXES TRIED`, `NOTE`, `REPORT`).``. Replace the line ``   - `DONE` with the RED line missing or `N/A` → **Failed attempt** with the description `RED not confirmed`.`` with the line ``   - `DONE` or `DONE_WITH_CONCERNS` with the RED line missing or `N/A`, or with `RED: CONFIRMED` but no **RED evidence** in the task's report file (see Definitions) → **Failed attempt** with the description `RED not confirmed`.``. Replace ``(`RED: CONFIRMED <first failing line>`, or a `BLOCKED` report`` with ``(`RED: CONFIRMED <first failing line>` with its RED evidence, or a `BLOCKED` report``. Directly below the line ``   - `DONE` → continue.``, insert the line ``   - `DONE_WITH_CONCERNS` → continue as for `DONE`; item 5 also sends the task to the reviewer with the worker's concerns.``
4. In section 3d, item 5, directly below the line `   - Both → command first, review only if it passes.`, insert this line:

   ```text
      - `DONE_WITH_CONCERNS` → the reviewer always runs, even when Verify is only a command: once the command passes, if there is one, invoke `orcastrat:reviewer` as for `review`, with the extra line `Report: <MAIN>/<report file>`, so it also checks the worker's concerns. A task whose Verify includes `review` gets one review, with that line. `VERDICT: FAIL` → **Failed attempt** with the description `reviewer FAIL: <REASONS>`.
   ```

5. In section 3e, item 3, make three replacements. Replace the line ``   - `DONE` on a task with `- Fails first: yes`, with the RED line missing or `N/A` → queue a retry (item 5), with the reason `RED not confirmed (Fails first: yes)`.`` with the line ``   - `DONE` or `DONE_WITH_CONCERNS` on a task with `- Fails first: yes`, with the RED line missing or `N/A`, or with no **RED evidence** in the report file under the worktree (see Definitions) → queue a retry (item 5), with the reason `RED not confirmed (Fails first: yes)`.``. Replace ``   - Any other `DONE` →`` with ``   - Any other `DONE` or `DONE_WITH_CONCERNS` →``. Replace ``the reviewer also gets the `Worktree:` line, and `Base: <BASE>`)`` with ``the reviewer also gets the `Worktree:` line, and after `DONE_WITH_CONCERNS` its `Report:` line names the report file under the worktree)``.
6. In section `## Failed attempt`, item 1, directly below the line `     Reason: <the description>`, insert the line `     Report: <MAIN>/<report file>`.
7. Run Verify.

**Done when**

- `## Definitions` has the **RED evidence** entry, and the failure-log entry has the `- Report:` line after `- Fixes tried:`.
- 3d items 3 and 5 and 3e item 3 handle `DONE_WITH_CONCERNS` and the RED evidence check as in Steps 3 to 5, and the resume message has the `Report:` line after `Reason:`.
- Nothing else in the file changed.

### M06-T14: Record the after dispatch sizes

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M06-T01, M06-T04
- Files: `plans/orcastrat-execution/notes/dispatch-sizes.md`
- Verify: `awk -F'|' '/^## After \(M06\)/ { after = 1; next } after && /^[|] worker-light [|] M01-T01 [|]/ { a++; if (NF != 7 || $4 + $5 != $6 || $4 < 1 || $5 < 1) bad = 1 } after && /^[|] worker [|] M04-T06 [|]/ { b++; if (NF != 7 || $4 + $5 != $6 || $4 < 1 || $5 < 1) bad = 1 } END { exit (bad || a != 1 || b != 1) }' plans/orcastrat-execution/notes/dispatch-sizes.md && ! grep -q '{' plans/orcastrat-execution/notes/dispatch-sizes.md && grep -qF '| worker-light | M01-T01 | 69 | 6224 | 25155 | 31448 |' plans/orcastrat-execution/notes/dispatch-sizes.md && grep -qF '| worker | M04-T06 | 69 | 24256 | 25155 | 49480 |' plans/orcastrat-execution/notes/dispatch-sizes.md`
- Fails first: no (a notes file with no test; the awk clause fails until the After section has both rows, and the two grep -qF clauses only check that the Before rows are unchanged)
- Commit: `docs(plan): record the after dispatch sizes`

**Objective**

`plans/orcastrat-execution/notes/dispatch-sizes.md` gains an "After (M06)" table with, in characters, the new dispatch message and the brief for the same two tasks M04 measured (D14, D69, D100).

**Read first**

- plan.md Decisions D14, D69 and D100
- `plans/orcastrat-execution/notes/dispatch-sizes.md`

**Interfaces**

- Consumes: `task-brief <plan-dir> <task-id>` (M06-T01)
- Consumes: `task-brief stdout: the brief's absolute path through print_path, and nothing else` (M06-T01)
- Consumes: `Brief: <path>` and `Report: <path>` worker dispatch lines (M06-T04)
- Consumes: `## Before (M04)` section of `plans/orcastrat-execution/notes/dispatch-sizes.md` (existing, `plans/orcastrat-execution/notes/dispatch-sizes.md:5`)
- Produces: `## After (M06)` section with the table header `| Tier | Task | Dispatch message | Brief | Total |`

**Steps**

1. Run `bash plugins/orcastrat/scripts/task-brief plans/orchestratinator-robustness M01-T01`. It prints one line, the brief's path: call it PA.
2. Run `LC_ALL=C.UTF-8 wc -m < "PA"`, with PA's text in place of `PA`. Its number is A2.
3. Run `git rev-parse --show-toplevel`. Its one line is ROOT.
4. Run `printf 'Brief: %s\nReport: %s\n' 'PA' 'ROOT/plans/orchestratinator-robustness/notes/reports/M01-T01.md' | LC_ALL=C.UTF-8 wc -m`, with PA's and ROOT's text in place of `PA` and `ROOT`. Its number is A1.
5. Repeat Steps 1, 2 and 4 for `M04-T06` in place of `M01-T01`, giving the path PB and the numbers B2 and B1.
6. At the end of `plans/orcastrat-execution/notes/dispatch-sizes.md`, add one empty line and then this block, replacing `{A1}`, `{A2}`, `{B1}` and `{B2}` with those numbers (digits only, no spaces), `{A3}` with A1 + A2, and `{B3}` with B1 + B2:

   ```text
   ## After (M06)

   After = dispatch message + brief (D14). The dispatch message is the two lines `run` sends a task's first attempt from M06 on, each ending in a newline: `Brief:` with the path `task-brief` printed, and `Report:` with the report file's absolute path (D100). Both paths are this machine's, so the message's length depends on where the repository is. The brief is the file `task-brief` wrote for the task; the worker reads it instead of the milestone file and `plan.md`. `task-brief` strips carriage returns, so working-tree line endings don't change its size.

   | Tier | Task | Dispatch message | Brief | Total |
   |---|---|---|---|---|
   | worker-light | M01-T01 | {A1} | {A2} | {A3} |
   | worker | M04-T06 | {B1} | {B2} | {B3} |
   ```

7. Run Verify.

**Done when**

- The file keeps its "Before (M04)" section unchanged and ends with the "After (M06)" section, which has exactly one `worker-light | M01-T01` row and one `worker | M04-T06` row, each with five cells: two positive counts computed in Steps 1 to 5 and their sum. No `{` is left in the file.

### M06-T15: Scouts always write a follow-up survey's answers to its file

- Kind: change
- Tier: worker
- Status: todo
- Wave: 8
- Depends on: M06-T07
- Files: `plugins/orcastrat/agents/scout.md`, `plugins/orcastrat/agents/scout-heavy.md`
- Verify: `grep -qF 'file and your answers fit in 20 lines. Otherwise write them' plugins/orcastrat/agents/scout.md && grep -qF 'file and your answers fit in 20 lines. Otherwise write them' plugins/orcastrat/agents/scout-heavy.md && grep -qF 'reaches the planner only as a file, since the planner reads only survey notes.' plugins/orcastrat/agents/scout.md && grep -qF 'reaches the planner only as a file, since the planner reads only survey notes.' plugins/orcastrat/agents/scout-heavy.md && grep -qF 'or a question brief that the rule above sends to the' plugins/orcastrat/agents/scout.md && grep -qF 'or a question brief that the rule above sends to the' plugins/orcastrat/agents/scout-heavy.md && ! grep -qF 'If your answers fit in 20 lines, or the brief has no' plugins/orcastrat/agents/scout.md && ! grep -qF 'If your answers fit in 20 lines, or the brief has no' plugins/orcastrat/agents/scout-heavy.md && ! grep -qF 'question brief whose answers' plugins/orcastrat/agents/scout.md && ! grep -qF 'question brief whose answers' plugins/orcastrat/agents/scout-heavy.md`
- Fails first: no (agent text with no test; the Verify greps fail until the edits are made)
- Commit: `fix(orcastrat): scouts always write a follow-up survey's answers to its file`
- Origin: review

**Objective**

`scout` and `scout-heavy` reply inline only to a question brief with no `Output:` line, or with a `notes/research-<n>.md` `Output:` path and answers that fit in 20 lines, so `run`'s follow-up survey (`notes/<ID>-survey-2.md`) is always written and reaches the planner (D118).

**Read first**

- plan.md Decisions D110 and D118
- `plugins/orcastrat/agents/scout.md` section `## Output`
- `plugins/orcastrat/skills/run/SKILL.md` line 153 (3a item 3, the follow-up scout round)
- `plugins/orcastrat/agents/planner.md` line 37 (the planner reads only survey notes)

**Interfaces**

- Consumes: `Output: <plan dir>/notes/research-<n>.md` scout brief line (M06-T07)
- Consumes: `Output: <plan dir>/notes/<ID>-survey-2.md` follow-up scout brief line (existing, `plugins/orcastrat/skills/run/SKILL.md:153`)
- Produces: none

**Steps**

1. In `plugins/orcastrat/agents/scout.md`, replace the line that starts `- **For a question brief**,` with this line:

   ```text
   - **For a question brief**, answer under each question's number, then give Unconfirmed and Conflicts if any. Reply with them and write no file only when the brief has no `Output:` line, or when its `Output:` path is a `notes/research-<n>.md` file and your answers fit in 20 lines. Otherwise write them to the brief's `Output:` path and reply in the survey format below. Any other `Output:` path is always written, whatever the length: a follow-up survey's `notes/<ID>-survey-2.md` reaches the planner only as a file, since the planner reads only survey notes.
   ```

2. In the same file, replace `or a question brief whose answers don't fit in 20 lines, write the report to the Output path.` with ``or a question brief that the rule above sends to the `Output:` path, write the report there.``
3. In `plugins/orcastrat/agents/scout-heavy.md`, make the same two replacements as Steps 1 and 2.
4. Run Verify.

**Done when**

- Both scout files' `## Output` sections read as in Steps 1 and 2.
- Nothing else in the two files changed.
