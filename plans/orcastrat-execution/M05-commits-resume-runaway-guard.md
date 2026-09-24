# M05: Worker commits, resume, runaway guard (Changes 1, 2, 3)

- Status: in-progress
- Format: 2
- Goal: Workers commit their own work with `<task ID>: ` subjects, and `run` verifies `BASE..HEAD`, makes the status commit with the `Orcastrat-Task:` trailer, and checks for pushes. A failed attempt is resumed once on the same agent before escalating. Escalation resets to `BASE`, and commits the preserved report and failure-log entry without a trailer. The ladder is capped at three rungs, with a worker breaker, a failure log, and escalation context. `Max run time`, `Max tasks` and `Max milestones` pause with `LIMIT`. `run-state` exists with bats tests, and `status` shows a `Failures:` line.
- Depends on: M04
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout-heavy

## Context

Governing sources: spec §2 (Change 1), §3 (Change 2), §4 (Change 3), §1.3, §1.5, §7 (the `recover` bullet), §9 (the marker); Decisions D05, D06, D23, D29, D31, D49, D74, D78, D80–D99.

- Leftover background work (D49, spec §4): after every agent returns (workers, reviewers, scouts, the planner, and every agent later milestones add), `run` checks the agent's completion notice. If it reports background work still running, `run` stops that agent's task with the Stop Task tool. If Stop Task fails, `run` appends `background-warning <UTC> <agent> <task or milestone ID> "<notice text>"` to `plans/<slug>/notes/run-log.md` just before its next commit (D81) and continues. `run` never kills processes by PID. This is a `run` rule, stated once in its operating rules.
- Worker git rules, in all six worker agents: commit when the task is done and Verify passes, subjects `<task ID>: <the task's Commit message>` (D80), only paths in Files (D97); never push, switch branches, rebase, reset, stash, or rewrite history; the precedence rule reworded; the "don't commit" rules and "your work can be lost" removed.
- Only the success commit, `chore(plan): <task ID> done`, carries `Orcastrat-Task: <task ID>`. The failed-attempt commit, `chore(plan): <task ID> attempt <n> failed`, and the interrupted-attempt commit, `chore(plan): <task ID> attempt <n> interrupted`, have no trailer.
- The report file is `plans/<slug>/notes/reports/<task-id>.md` (Change 9). Workers start writing it in M06. The scope check and report preservation handle it from now on, and skip it when the file doesn't exist.
- The failure log is `plans/<slug>/notes/<task ID>-failures.md`, with D87's entry format. The attempt number, the current tier and rung (D84), discarding and keeping attempts (D85, D93) and the limits are defined once, in `run`'s Definitions (M05-T07), and the rest of `run` refers to them by name.
- D82: the parallel wave (3e) keeps today's mechanics until M07: its soft-reset, one commit with the trailer in the worktree, and one retry one tier up with the old `Retry:` lines. M05 adds only the limit check, the reviewer's `Base:` line, and the inlined worktree commit there. `SCOPE` stays a Stop in parallel waves (D83).
- D23: remove only the soft-reset in serial waves. The branch check and `STRAY` stay.
- `run-state` follows D06, D88 and D89 exactly, is built to M02's bash rules (D04 naming), and has bats tests. `run-state start` runs at the end of preflight, after "Proceed?"; `run-state end` runs at every Pause, Stop and completion. Heartbeats (`run-state beat`) are wired into `run` in M08.
- New header fields are optional with defaults (D29). The flags `--max-run-time`, `--max-tasks` and `--max-milestones` beat the header fields. `--max-tasks` already exists and keeps its meaning.
- D31's `- Re-tiered:` lines are written from M14 on, but `run` already reads them as a task's starting tier (D84).
- D62: no task in this milestone is `worker-light`; `worker` is the floor.
- Tier adjustment: test-first tasks whose Steps give the literal test file and the literal code → worker (worker-light escalated 2 times in M02)
- Every block a Step gives is its literal final content: the fenced block in that Step, with the three-space list indentation removed from each line. Blank lines stay empty. Copy it exactly; don't reformat, reorder or "improve" it.
- **Replacing text.** "Replace A with B" means: find A, which occurs exactly once in the file unless the Step gives another count (as a whole line, or as the part of a line quoted), and put B in its place, changing nothing around it. If A isn't found that many times, stop and report `BLOCKED` / `GAP` quoting A.
- **Inserting blocks above a line.** "Insert block X above the line L" means: put X's lines directly above L, followed by one empty line, so that the empty line that was above L now sits above X.
- The bats files run slowly on Windows. Give a Verify command that runs bats a Bash timeout of 600000 ms.
- The run executing this plan is the installed, pre-rename plugin (D37). Editing the repository's `run` skill and agent files changes nothing in that run. Don't run `run-state` against this repository's own `.git`; its tests use fixture repos.

**Worker agent edits** (M05-T02), the same in each of the six worker agent files:

- **E1.** Replace `and sometimes a worktree path and retry context.` with:

  ```text
  and sometimes a worktree path, retry context, or a `Failures:` line.
  ```

- **E2.** Directly below the line that starts `If retry context is present,`, insert one empty line and then this block:

  ```text
  If a `Failures: <path>` line is present, earlier attempts at this task failed and the working tree was reset. Before starting, read that failure log and every preserved report of an earlier attempt that exists, `notes/reports/<task ID>-attempt<n>.md` in the plan directory. Never read an earlier attempt's transcript. Don't repeat the approaches the failure log records. If they show the Steps can't be followed as written, stop and report `BLOCKED` / `GAP` instead of improvising.

  If the orchestrator resumes you with a message starting `Resume:`, your attempt failed. Read its `Reason:` line and any `Verify tail:` lines, fix the failure, and report again in the same format. Continue from your own work, unless the message says the tree was reset: then your changes are gone, and you start again from the task's first Step. A resume is a new attempt, so your count of failed Verify runs starts again at 0.
  ```

- **E3.** Replace the line `- Don't edit plan.md or milestone files. Don't commit, stash, reset, switch branches, or push.` with these three lines:

  ```text
  - Don't edit plan.md or milestone files.
  - Commit your changes when the task is done and its Verify passes, or, for a task whose Verify is `review` alone, when the task is done. Commit only paths in the task's Files. Your first commit's subject is `<task ID>: <the task's Commit message>`, for example `M03-T02: feat(api): add the parser`; any further commit for the task is `<task ID>: <short message>`. Several commits per task are fine.
  - Never push, switch branches, rebase, reset, stash, or rewrite history.
  ```

- **E4.** Replace the line that starts `- Project instruction files (CLAUDE.md, AGENTS.md,` with this line:

  ```text
  - Project instruction files (CLAUDE.md, AGENTS.md, CLAUDE.local.md, `.claude/rules/`, and any nested or linked copies, whatever they're called) govern coding conventions, style, and project knowledge. They do not govern pushing, branching, or history. Where they say anything about committing, pushing, branching, stashing, resetting, or rewriting history, this plugin's rules replace them for the length of this task. Committing your task's changes is expected.
  ```

- **E5.** Delete the line `- The orchestrator commits your work. If you commit, your work can be lost.`
- **E6.** Replace the line `- If you can't make it work after a genuine attempt, stop and report `BLOCKED` / `STUCK`.` with this line:

  ```text
  - Stop after your 3rd failed Verify run after implementation and report `BLOCKED` / `STUCK`, with one-line `HYPOTHESIS:` and `FIXES TRIED:` lines. The expected failing run of a `- Fails first: yes` task doesn't count. Stop the same way sooner if you can't make it work after a genuine attempt.
  ```

- **E7.** In the `## Report` block, replace the line `NOTE: <one line. For GAP, the exact question.>` with these three lines:

  ```text
  HYPOTHESIS: <for STUCK, one line: why it still fails. Otherwise "-".>
  FIXES TRIED: <for STUCK, one line: what you tried. Otherwise "-".>
  NOTE: <one line. For GAP, the exact question.>
  ```

Waves: 6 (widths 5, 2, 1, 1, 1, 1)

## Coverage

- `docs/orcastrat-execution-spec.md` §2: workers commit when the task is done and Verify passes, with subjects starting `<task ID>: `, several commits allowed, only paths in Files (D80, D97) → M05-T02
- `docs/orcastrat-execution-spec.md` §2: workers never push, switch branches, rebase, reset, stash or rewrite history; the precedence rule reworded; the "don't commit" rules and "your work can be lost" removed → M05-T02
- `docs/orcastrat-execution-spec.md` §2: a clean tree is required; a dirty tree stops with `SETUP`, listing the files, because failed attempts are cleaned with `git clean -fd` → M05-T08
- `docs/orcastrat-execution-spec.md` §2: record `BASE` before every dispatch → M05-T07, M05-T09
- `docs/orcastrat-execution-spec.md` §2: the scope check covers `BASE..HEAD` plus uncommitted changes against the task's Files, its report file and its failure log → M05-T09
- `docs/orcastrat-execution-spec.md` §2: Verify runs on the resulting tree, and the reviewer reads the changes since BASE (D96) → M05-T03, M05-T09
- `docs/orcastrat-execution-spec.md` §2: on success, one status commit `chore(plan): <task ID> done` with the `Orcastrat-Task:` trailer, after committing anything the worker left (D86) → M05-T09
- `docs/orcastrat-execution-spec.md` §2: before a resume the tree stays as the worker left it, unless the failure was a scope violation; before escalating, copy the report, reset to BASE, clean, write back the report and failure-log entry, commit without a trailer, and set the new BASE (D93) → M05-T07, M05-T09
- `docs/orcastrat-execution-spec.md` §2: the push check runs after every attempt, and a hit stops with `PUSHED` → M05-T09
- `docs/orcastrat-execution-spec.md` §2: the stray-commit soft-reset is removed from serial waves; the branch check and `STRAY` stay (D23, D82) → M05-T09
- `docs/orcastrat-execution-spec.md` §2: `run` resets the plan branch only to discard an attempt (D99) → M05-T06
- `docs/orcastrat-execution-spec.md` §3: a failed attempt first resumes the same worker once, sending the Verify tail, the REASONS, or "turn limit reached" (D94) → M05-T09
- `docs/orcastrat-execution-spec.md` §3: a resume call that errors falls back to a fresh dispatch at the next tier, and the failure log records which happened (D95) → M05-T07, M05-T09
- `docs/orcastrat-execution-spec.md` §3: a resumed worker continues from its own work, or from the reset tree after a scope violation → M05-T02
- `docs/orcastrat-execution-spec.md` §4: the ladder is capped at three rungs from the starting tier, never past `specialist`, and a third failure stops as `Blocked: STUCK` with the replanning note (D84, D85) → M05-T07, M05-T09, M05-T11
- `docs/orcastrat-execution-spec.md` §4: a failed attempt is a Verify failure, a reviewer FAIL, `STUCK` or no report, `RED not confirmed`, or a scope violation (D74, D83) → M05-T09
- `docs/orcastrat-execution-spec.md` §4: the worker breaker stops after the 3rd failed Verify run after implementation, with one-line `HYPOTHESIS:` and `FIXES TRIED:` → M05-T02
- `docs/orcastrat-execution-spec.md` §4: the failure log, one entry per failed attempt (resumes included), appended by `run`, committed with the escalation, success or stop commit, and always in scope (D87) → M05-T04, M05-T07, M05-T09
- `docs/orcastrat-execution-spec.md` §4: escalation context: the fresh worker gets `Failures: <path>`, reads the failure log and preserved reports, never the transcript, and reports a GAP when the Steps can't be followed (D92) → M05-T02, M05-T09
- `docs/orcastrat-execution-spec.md` §4: the limits `Max run time`, `Max tasks`, `Max milestones` and their flags, the flag beating the field; time and task limits checked before each serial task or parallel batch, the milestone limit after each milestone and its review; hitting one is a Pause with `LIMIT` (D29) → M05-T04, M05-T06, M05-T07, M05-T09, M05-T10, M05-T11
- `docs/orcastrat-execution-spec.md` §4: `status` gains a `Failures:` line (D91) → M05-T05
- `docs/orcastrat-execution-spec.md` §4: leftover background work is stopped with the Stop Task tool, or logged as a warning in `notes/run-log.md` (D49, D81) → M05-T06
- `docs/orcastrat-execution-spec.md` §4: resuming an exhausted task is unchanged; a task set back to `todo` restarts at its starting tier (D84) → M05-T07
- `docs/orcastrat-execution-spec.md` §4: parallel waves keep today's retry mechanics until M07, with the limit check before each batch (D82) → M05-T10
- `docs/orcastrat-execution-spec.md` §7, the `recover` bullet: an interrupted attempt is reset and redispatched at the same tier without escalating, and a second interruption is a failed attempt (D90, D98) → M05-T08, M05-T09
- `docs/orcastrat-execution-spec.md` §9: the active-run marker is written at the end of preflight and deleted at every Pause, Stop and completion, through `run-state`, which logs `start` and `end` lines (D06, D88, D89) → M05-T01, M05-T08, M05-T11
- `docs/orcastrat-execution-spec.md` §1.1: known mechanisms only: git, SendMessage, the Stop Task tool → M05-T06, M05-T09
- `docs/orcastrat-execution-spec.md` §1.2: the plan format and its readers are updated together: header fields, the Commit field, the `- Interrupted:` line, the failure log, `status` → M05-T04, M05-T05, M05-T07
- `docs/orcastrat-execution-spec.md` §1.3: GAPs are never retried or escalated; a failure log showing the Steps can't be followed is a GAP → M05-T02, M05-T10
- `docs/orcastrat-execution-spec.md` §1.5: limits exist only for non-progress and opt-in `LIMIT` pauses, never for cost → M05-T07
- `docs/orcastrat-execution-spec.md` preamble: fewer wasted attempts → M05-T02, M05-T09
- `docs/orcastrat-execution-spec.md` §29 item 5: Changes 1, 2 and 3 are built in this step (D28) → M05-T01, M05-T02, M05-T03, M05-T04, M05-T05, M05-T06, M05-T07, M05-T08, M05-T09, M05-T10, M05-T11
- `docs/orcastrat-execution-spec.md` §31: kebab-case script name, shipped runtime bash plus `git` only, `Validate-All.ps1` passes → M05-T01
- `docs/orcastrat-execution-spec.md` §32 items 1, 2, 5, 9, 18, 19, 20, 53 and 66: workers commit and `run` verifies `BASE..HEAD`; one resume per rung; three rungs; runaway guard; cost never gates; `Max milestones`; escalation carries the failure log and reports; interrupted attempts; leftover background work → M05-T02, M05-T06, M05-T07, M05-T08, M05-T09, M05-T11
- D78: `run` finds a milestone's Base only among this plan's commits → M05-T06
- D85: a blocked serial attempt is discarded and kept under `refs/orcastrat/discarded/<task ID>-<n>` → M05-T07, M05-T09, M05-T10

## Review Focus

- A marker whose `block_heartbeat=` line sits beside `heartbeat=` → `beat` rewrites only the `heartbeat=` line and leaves `block_heartbeat=` as it was (source: D06). Test: `beat updates only the heartbeat` in M05-T01.
- `run-state start` run inside a linked worktree → the marker goes in that worktree's own git dir, never the main checkout's (source: D06; spec §9, "The per-checkout git dir (not the common dir) scopes the marker to one checkout"). Test: `start in a linked worktree writes the marker in that worktree's git dir` in M05-T01.
- `run-state end` with no marker, as at a Stop before preflight wrote one → exit 0, nothing printed, nothing logged (source: D89). Test: `end with no marker exits 0, prints nothing and logs nothing` in M05-T01.
- A `<plan-dir>` in the drive-letter forms `C:/…` and `C:\…` → stored as given, and `start` and `end` write the run log under it (source: D59, D89). Test: `run-state accepts <plan-dir> in both drive-letter forms` in M05-T01.
- A worker agent file that keeps "Don't commit" or "The orchestrator commits your work" beside the new commit rule → reported (source: spec §2, "Remove the 'don't commit' rules and the 'your work can be lost' warning"). Test: `worker agents have no don't-commit rule` in M05-T02.

## Tasks

### M05-T01: Add the run-state script

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/scripts/run-state`, `tests/orcastrat/run-state.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/run-state.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the run-state script`

**Objective**

`plugins/orcastrat/scripts/run-state` writes, beats, times and removes this checkout's active-run marker and logs `start` and `end` lines to the plan's run log, as D06, D88 and D89 define, and `tests/orcastrat/run-state.bats` covers it.

**Read first**

- plan.md Decisions D06, D88 and D89
- `plugins/orcastrat/scripts/push-check` (the script pattern: header comment, `lib/common`, `fail`)
- `tests/orcastrat/push-check.bats` lines 1–20 (the test pattern)
- `tests/orcastrat/test_helper.bash` (`REPO_ROOT`, `make_fixture_repo`, `make_cygpath_stub`)

**Interfaces**

- Consumes: `print_path <path>` (existing, `plugins/orcastrat/scripts/lib/common:8`)
- Consumes: `REPO_ROOT` (existing, `tests/orcastrat/test_helper.bash:5`)
- Consumes: `make_fixture_repo <dir>` (existing, `tests/orcastrat/test_helper.bash:9`)
- Consumes: `make_cygpath_stub <dir>` (existing, `tests/orcastrat/test_helper.bash:25`)
- Consumes: `bash scripts/run-bats.sh [<bats arguments>...]` (existing, `scripts/run-bats.sh:21`)
- Produces: `plugins/orcastrat/scripts/run-state`
- Produces: `run-state start <plan-dir>`
- Produces: `run-state beat`
- Produces: `run-state elapsed`
- Produces: `run-state end <PAUSE|STOP|COMPLETE> <reason>`
- Produces: `run-state elapsed stdout: the whole minutes since started, rounded down`
- Produces: `run-state exit status: 0 on success; 2 with one stderr line error: <message>`
- Produces: `<git-dir>/orcastrat/active-run with the lines plan=<plan-dir>, started=<epoch>, heartbeat=<epoch>, blocks=0, block_heartbeat=`
- Produces: `<plan-dir>/notes/run-log.md lines start <UTC> <plan-dir> and end <UTC> <mode> <reason>`

**Steps**

1. Create `tests/orcastrat/run-state.bats` with exactly this content:

   ```bash
   bats_require_minimum_version 1.5.0

   setup() {
     load test_helper
     SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/run-state"
     REPO="$BATS_TEST_TMPDIR/fixture repo"
     make_fixture_repo "$REPO"
     mkdir -p "$REPO/plans/my plan"
     make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
     MARKER="$REPO/.git/orcastrat/active-run"
     LOG="$REPO/plans/my plan/notes/run-log.md"
     UTC_RE='[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z'
     cd "$REPO"
   }

   # run_script <args...>: runs run-state in the current directory with the stub
   # cygpath first on PATH, keeping stderr apart from stdout.
   run_script() {
     run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
   }

   # write_marker <started> <heartbeat> <blocks> <block_heartbeat>: writes a
   # marker for "plans/my plan" by hand.
   write_marker() {
     mkdir -p "$REPO/.git/orcastrat"
     printf 'plan=plans/my plan\nstarted=%s\nheartbeat=%s\nblocks=%s\nblock_heartbeat=%s\n' \
       "$1" "$2" "$3" "$4" > "$MARKER"
   }

   # line_count <file>: prints the number of lines in <file>.
   line_count() {
     wc -l < "$1" | tr -d ' '
   }

   @test "start writes the marker with plan, started, heartbeat, blocks and block_heartbeat" {
     run_script start "plans/my plan"
     [ "$status" -eq 0 ]
     [ -z "$output" ]
     [ -z "$stderr" ]
     [ "$(line_count "$MARKER")" = "5" ]
     [ "$(sed -n 1p "$MARKER")" = "plan=plans/my plan" ]
     started="$(sed -n 's/^started=//p' "$MARKER")"
     [[ "$started" =~ ^[0-9]+$ ]] || false
     now="$(date -u +%s)"
     [ "$((now - started))" -ge 0 ]
     [ "$((now - started))" -le 60 ]
     [ "$(sed -n 2p "$MARKER")" = "started=$started" ]
     [ "$(sed -n 3p "$MARKER")" = "heartbeat=$started" ]
     [ "$(sed -n 4p "$MARKER")" = "blocks=0" ]
     [ "$(sed -n 5p "$MARKER")" = "block_heartbeat=" ]
   }

   @test "start creates the notes directory and appends a start line to the run log" {
     run_script start "plans/my plan"
     [ "$status" -eq 0 ]
     [ "$(line_count "$LOG")" = "1" ]
     re="^start $UTC_RE plans/my plan\$"
     [[ "$(cat "$LOG")" =~ $re ]] || false
   }

   @test "start appends to an existing run log" {
     mkdir -p "$REPO/plans/my plan/notes"
     printf 'earlier line\n' > "$LOG"
     run_script start "plans/my plan"
     [ "$status" -eq 0 ]
     [ "$(line_count "$LOG")" = "2" ]
     [ "$(sed -n 1p "$LOG")" = "earlier line" ]
   }

   @test "start overwrites an existing marker" {
     write_marker 1000 1000 2 900
     run_script start "plans/my plan"
     [ "$status" -eq 0 ]
     [ "$(line_count "$MARKER")" = "5" ]
     [ "$(sed -n 2p "$MARKER")" != "started=1000" ]
     [ "$(sed -n 4p "$MARKER")" = "blocks=0" ]
     [ "$(sed -n 5p "$MARKER")" = "block_heartbeat=" ]
   }

   @test "start in a linked worktree writes the marker in that worktree's git dir" {
     git worktree add --quiet -b task "$BATS_TEST_TMPDIR/task tree"
     mkdir -p "$BATS_TEST_TMPDIR/task tree/plans/my plan"
     cd "$BATS_TEST_TMPDIR/task tree"
     run_script start "plans/my plan"
     [ "$status" -eq 0 ]
     [ -f "$(git rev-parse --absolute-git-dir)/orcastrat/active-run" ]
     [ ! -e "$MARKER" ]
     [ -f "$BATS_TEST_TMPDIR/task tree/plans/my plan/notes/run-log.md" ]
   }

   @test "run-state accepts <plan-dir> in both drive-letter forms" {
     command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
     win_m="$(cygpath -m "$REPO/plans/my plan")"
     win_w="$(cygpath -w "$REPO/plans/my plan")"
     run_script start "$win_m"
     [ "$status" -eq 0 ]
     [ "$(sed -n 1p "$MARKER")" = "plan=$win_m" ]
     run_script start "$win_w"
     [ "$status" -eq 0 ]
     [ "$(sed -n 1p "$MARKER")" = "plan=$win_w" ]
     run_script end STOP GAP
     [ "$status" -eq 0 ]
     [ ! -e "$MARKER" ]
     [ "$(line_count "$LOG")" = "3" ]
   }

   @test "beat updates only the heartbeat" {
     write_marker 1000 1000 2 900
     run_script beat
     [ "$status" -eq 0 ]
     [ -z "$output" ]
     [ -z "$stderr" ]
     [ "$(line_count "$MARKER")" = "5" ]
     [ "$(sed -n 1p "$MARKER")" = "plan=plans/my plan" ]
     [ "$(sed -n 2p "$MARKER")" = "started=1000" ]
     heartbeat="$(sed -n 's/^heartbeat=//p' "$MARKER")"
     [ "$heartbeat" -gt 1000 ]
     [ "$(sed -n 3p "$MARKER")" = "heartbeat=$heartbeat" ]
     [ "$(sed -n 4p "$MARKER")" = "blocks=2" ]
     [ "$(sed -n 5p "$MARKER")" = "block_heartbeat=900" ]
   }

   @test "elapsed prints the whole minutes since started, rounded down" {
     now="$(date -u +%s)"
     write_marker "$((now - 150))" "$now" 0 ''
     run_script elapsed
     [ "$status" -eq 0 ]
     [ "$output" = "2" ]
     [ -z "$stderr" ]
   }

   @test "elapsed prints 0 right after start" {
     run_script start "plans/my plan"
     run_script elapsed
     [ "$status" -eq 0 ]
     [ "$output" = "0" ]
   }

   @test "end appends an end line and deletes the marker" {
     run_script start "plans/my plan"
     run_script end STOP GAP
     [ "$status" -eq 0 ]
     [ -z "$output" ]
     [ -z "$stderr" ]
     [ ! -e "$MARKER" ]
     [ "$(line_count "$LOG")" = "2" ]
     re="^end $UTC_RE STOP GAP\$"
     [[ "$(sed -n 2p "$LOG")" =~ $re ]] || false
   }

   @test "end accepts PAUSE and COMPLETE and writes the reason as one argument" {
     run_script start "plans/my plan"
     run_script end PAUSE LIMIT
     [ "$status" -eq 0 ]
     run_script start "plans/my plan"
     run_script end COMPLETE "whole plan"
     [ "$status" -eq 0 ]
     [ "$(line_count "$LOG")" = "4" ]
     re_pause="^end $UTC_RE PAUSE LIMIT\$"
     re_complete="^end $UTC_RE COMPLETE whole plan\$"
     [[ "$(sed -n 2p "$LOG")" =~ $re_pause ]] || false
     [[ "$(sed -n 4p "$LOG")" =~ $re_complete ]] || false
   }

   @test "end with no marker exits 0, prints nothing and logs nothing" {
     run_script end STOP GAP
     [ "$status" -eq 0 ]
     [ -z "$output" ]
     [ -z "$stderr" ]
     [ ! -e "$LOG" ]
   }

   @test "run-state exits 2 with no arguments" {
     run_script
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: usage: run-state start <plan-dir> | beat | elapsed | end <PAUSE|STOP|COMPLETE> <reason>" ]
   }

   @test "run-state exits 2 for an unknown subcommand" {
     run_script begin
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: unknown subcommand: begin" ]
   }

   @test "run-state exits 2 when a subcommand has the wrong number of arguments" {
     run_script start
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: usage: run-state start <plan-dir>" ]
     run_script beat extra
     [ "$status" -eq 2 ]
     [ "$stderr" = "error: usage: run-state beat" ]
     run_script elapsed extra
     [ "$status" -eq 2 ]
     [ "$stderr" = "error: usage: run-state elapsed" ]
     run_script end STOP
     [ "$status" -eq 2 ]
     [ "$stderr" = "error: usage: run-state end <PAUSE|STOP|COMPLETE> <reason>" ]
   }

   @test "end exits 2 for an unknown mode" {
     run_script start "plans/my plan"
     run_script end DONE plan
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: unknown end mode: DONE" ]
     [ -f "$MARKER" ]
   }

   @test "start exits 2 when <plan-dir> is not a directory" {
     run_script start "plans/missing"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: not a directory: cygpath-stub [-m] [plans/missing]" ]
     [ ! -e "$MARKER" ]
   }

   @test "run-state exits 2 outside a git work tree" {
     mkdir -p "$BATS_TEST_TMPDIR/plain dir"
     cd "$BATS_TEST_TMPDIR/plain dir"
     run_script start "$BATS_TEST_TMPDIR/plain dir"
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [[ "$stderr" == "error: not inside a git work tree: cygpath-stub [-m] ["* ]] || false
     run_script end STOP GAP
     [ "$status" -eq 2 ]
     [ -z "$output" ]
   }

   @test "beat and elapsed exit 2 with no marker" {
     run_script beat
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: no active run" ]
     run_script elapsed
     [ "$status" -eq 2 ]
     [ -z "$output" ]
     [ "$stderr" = "error: no active run" ]
   }
   ```

2. Run Verify and confirm it fails (`run-state` doesn't exist yet).
3. Create `plugins/orcastrat/scripts/run-state` (no file extension) with exactly this content:

   ```bash
   #!/usr/bin/env bash
   # run-state start <plan-dir> | beat | elapsed | end <PAUSE|STOP|COMPLETE> <reason>
   #
   # Manages the active-run marker, <git-dir>/orcastrat/active-run, where
   # <git-dir> is this checkout's `git rev-parse --git-dir` (D06). The marker
   # holds the key=value lines plan=, started=, heartbeat=, blocks= and
   # block_heartbeat=, with times in UTC epoch seconds.
   #
   #   start <plan-dir>     writes a new marker, overwriting any old one, creates
   #                        <plan-dir>/notes/ if needed, and appends
   #                        "start <UTC> <plan-dir>" to <plan-dir>/notes/run-log.md.
   #   beat                 sets heartbeat= to now.
   #   elapsed              prints the whole minutes since started=, rounded down.
   #   end <mode> <reason>  appends "end <UTC> <mode> <reason>" to the run log of
   #                        the marker's plan and deletes the marker. With no
   #                        marker it does nothing (D88, D89).
   #
   # <UTC> is `date -u +%Y-%m-%dT%H:%M:%SZ`. <plan-dir> is stored as given, and
   # the run log is found relative to the current directory. On success only
   # `elapsed` prints anything. On a usage or environment error, prints one
   # `error: <message>` line on stderr, nothing on stdout, and exits 2 (D89).
   # Bash 3.2 compatible.

   # shellcheck source=/dev/null
   . "$(dirname "${BASH_SOURCE[0]}")/lib/common"

   fail() {
     printf 'error: %s\n' "$1" >&2
     exit 2
   }

   usage='usage: run-state start <plan-dir> | beat | elapsed | end <PAUSE|STOP|COMPLETE> <reason>'

   [ "$#" -ge 1 ] || fail "$usage"
   cmd=$1
   shift
   case "$cmd" in
     start)
       [ "$#" -eq 1 ] || fail 'usage: run-state start <plan-dir>'
       [ -d "$1" ] || fail "not a directory: $(print_path "$1")"
       ;;
     beat|elapsed)
       [ "$#" -eq 0 ] || fail "usage: run-state $cmd"
       ;;
     end)
       [ "$#" -eq 2 ] || fail 'usage: run-state end <PAUSE|STOP|COMPLETE> <reason>'
       case "$1" in
         PAUSE|STOP|COMPLETE) ;;
         *) fail "unknown end mode: $1" ;;
       esac
       ;;
     *)
       fail "unknown subcommand: $cmd"
       ;;
   esac

   [ "$(git rev-parse --is-inside-work-tree 2>/dev/null)" = true ] ||
     fail "not inside a git work tree: $(print_path "$PWD")"
   git_dir=$(git rev-parse --git-dir)
   marker="$git_dir/orcastrat/active-run"

   # utc_now: prints the current UTC time as YYYY-MM-DDTHH:MM:SSZ.
   utc_now() {
     date -u +%Y-%m-%dT%H:%M:%SZ
   }

   # marker_value <key>: prints the value of the marker's <key>= line.
   marker_value() {
     sed -n "s/^$1=//p" "$marker"
   }

   case "$cmd" in
     start)
       plan_dir=$1
       now=$(date -u +%s)
       mkdir -p "$git_dir/orcastrat"
       printf 'plan=%s\nstarted=%s\nheartbeat=%s\nblocks=0\nblock_heartbeat=\n' \
         "$plan_dir" "$now" "$now" > "$marker"
       mkdir -p "$plan_dir/notes"
       printf 'start %s %s\n' "$(utc_now)" "$plan_dir" >> "$plan_dir/notes/run-log.md"
       ;;
     beat)
       [ -f "$marker" ] || fail 'no active run'
       now=$(date -u +%s)
       tmp="$marker.tmp"
       while IFS= read -r line || [ -n "$line" ]; do
         case "$line" in
           heartbeat=*) printf 'heartbeat=%s\n' "$now" ;;
           *) printf '%s\n' "$line" ;;
         esac
       done < "$marker" > "$tmp"
       mv -f "$tmp" "$marker"
       ;;
     elapsed)
       [ -f "$marker" ] || fail 'no active run'
       started=$(marker_value started)
       now=$(date -u +%s)
       printf '%s\n' "$(( (now - started) / 60 ))"
       ;;
     end)
       [ -f "$marker" ] || exit 0
       plan_dir=$(marker_value plan)
       mkdir -p "$plan_dir/notes"
       printf 'end %s %s %s\n' "$(utc_now)" "$1" "$2" >> "$plan_dir/notes/run-log.md"
       rm -f "$marker"
       ;;
   esac
   exit 0
   ```

4. Run Verify and confirm all 19 tests pass. Where `cygpath` isn't installed, the drive-letter test reports `skip` instead; on this machine it runs.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/run-state.bats` reports 19 tests and no failure.
- `plugins/orcastrat/scripts/run-state` contains no `pwsh` or `powershell`, in any case.

### M05-T02: Give the worker agents the commit, resume and breaker rules

- Kind: change
- Tier: worker
- Batch: yes
- Status: done
- Wave: 1
- Depends on: M04-T02
- Files: `tests/orcastrat/agent-files.bats`, `plugins/orcastrat/agents/worker-mini-serial.md`, `plugins/orcastrat/agents/worker-mini-parallel.md`, `plugins/orcastrat/agents/worker-light.md`, `plugins/orcastrat/agents/worker.md`, `plugins/orcastrat/agents/worker-heavy.md`, `plugins/orcastrat/agents/specialist.md`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats`
- Fails first: yes
- Commit: `feat(orcastrat): workers commit their own work, resume, and stop after three failed Verify runs`
- Process: worker committed on its own; reset and recommitted

**Objective**

Every worker agent commits its own work with `<task ID>: ` subjects, never pushes or rewrites history, reads a `Failures:` log and handles a `Resume:` message, stops after its 3rd failed Verify run with `HYPOTHESIS:` and `FIXES TRIED:`, and `agent-files.bats` checks all of it.

**Read first**

- `docs/orcastrat-execution-spec.md` §2, the "Workers" bullets, §3, and §4, the "Worker breaker" and "Escalation context" bullets
- plan.md Decisions D80, D92, D94 and D97
- `tests/orcastrat/agent-files.bats` lines 1–75 (the lists and helpers)
- `plugins/orcastrat/agents/worker.md` (the text the edits change)

**Interfaces**

- Consumes: `missing_lines <file> <expected-file>` (M04-T02)
- Consumes: `WORKER_AGENTS`, a space-separated list of agent names (M04-T02)
- Produces: `write_worker_rules <file>`
- Produces: `@test "worker agents have the commit, breaker, failure-log and resume rules"`
- Produces: `@test "worker agents have no don't-commit rule"`
- Produces: `Failures: <path>` dispatch line
- Produces: `Resume:` message with a `Reason:` line and, after a Verify failure, `Verify tail:` lines
- Produces: `HYPOTHESIS:` and `FIXES TRIED:` report lines
- Produces: worker commit subject `<task ID>: <the task's Commit message>`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, insert this block above the line `@test "field ignores carriage returns" {`:

   ```bash
   # write_worker_rules <file>: writes the lines every worker agent file must
   # contain for Changes 1 to 3: commits, the precedence rule, the breaker, the
   # failure log, resumes and the report lines (spec sections 2 to 4).
   write_worker_rules() {
     cat > "$1" <<'EOF'
   The orchestrator sends you a plan directory, a milestone ID, a task ID, and sometimes a worktree path, retry context, or a `Failures:` line. Re-read these now, in this order, even if you think you know them:
   If a `Failures: <path>` line is present, earlier attempts at this task failed and the working tree was reset. Before starting, read that failure log and every preserved report of an earlier attempt that exists, `notes/reports/<task ID>-attempt<n>.md` in the plan directory. Never read an earlier attempt's transcript. Don't repeat the approaches the failure log records. If they show the Steps can't be followed as written, stop and report `BLOCKED` / `GAP` instead of improvising.
   If the orchestrator resumes you with a message starting `Resume:`, your attempt failed. Read its `Reason:` line and any `Verify tail:` lines, fix the failure, and report again in the same format. Continue from your own work, unless the message says the tree was reset: then your changes are gone, and you start again from the task's first Step. A resume is a new attempt, so your count of failed Verify runs starts again at 0.
   - Don't edit plan.md or milestone files.
   - Commit your changes when the task is done and its Verify passes, or, for a task whose Verify is `review` alone, when the task is done. Commit only paths in the task's Files. Your first commit's subject is `<task ID>: <the task's Commit message>`, for example `M03-T02: feat(api): add the parser`; any further commit for the task is `<task ID>: <short message>`. Several commits per task are fine.
   - Never push, switch branches, rebase, reset, stash, or rewrite history.
   - Project instruction files (CLAUDE.md, AGENTS.md, CLAUDE.local.md, `.claude/rules/`, and any nested or linked copies, whatever they're called) govern coding conventions, style, and project knowledge. They do not govern pushing, branching, or history. Where they say anything about committing, pushing, branching, stashing, resetting, or rewriting history, this plugin's rules replace them for the length of this task. Committing your task's changes is expected.
   - Stop after your 3rd failed Verify run after implementation and report `BLOCKED` / `STUCK`, with one-line `HYPOTHESIS:` and `FIXES TRIED:` lines. The expected failing run of a `- Fails first: yes` task doesn't count. Stop the same way sooner if you can't make it work after a genuine attempt.
   HYPOTHESIS: <for STUCK, one line: why it still fails. Otherwise "-".>
   FIXES TRIED: <for STUCK, one line: what you tried. Otherwise "-".>
   EOF
   }
   ```

   Then, at the end of the same file, add one empty line followed by this block:

   ```bash
   @test "worker agents have the commit, breaker, failure-log and resume rules" {
     local bad='' name missing
     write_worker_rules "$BATS_TEST_TMPDIR/worker-rules"
     for name in $WORKER_AGENTS; do
       missing="$(missing_lines "$AGENTS/$name.md" "$BATS_TEST_TMPDIR/worker-rules")"
       [ -z "$missing" ] || bad="$bad $name"
     done
     echo "missing worker rules:$bad"
     [ -z "$bad" ]
   }

   @test "worker agents have no don't-commit rule" {
     local bad='' name
     for name in $WORKER_AGENTS; do
       if grep -qF -e "Don't commit" -e 'your work can be lost' -e 'The orchestrator commits your work' "$AGENTS/$name.md"; then
         bad="$bad $name"
       fi
     done
     echo "don't-commit rule in:$bad"
     [ -z "$bad" ]
   }
   ```

2. Run Verify and confirm it fails (the two new tests fail for all six worker agents).
3. In `plugins/orcastrat/agents/worker-mini-serial.md`, make edits E1 to E7 from the Context's "Worker agent edits", in that order.
4. In `plugins/orcastrat/agents/worker-mini-parallel.md`, make edits E1 to E7 from the Context's "Worker agent edits", in that order.
5. In `plugins/orcastrat/agents/worker-light.md`, make edits E1 to E7 from the Context's "Worker agent edits", in that order.
6. In `plugins/orcastrat/agents/worker.md`, make edits E1 to E7 from the Context's "Worker agent edits", in that order.
7. In `plugins/orcastrat/agents/worker-heavy.md`, make edits E1 to E7 from the Context's "Worker agent edits", in that order.
8. In `plugins/orcastrat/agents/specialist.md`, make edits E1 to E7 from the Context's "Worker agent edits", in that order. Leave its extra judgment Rule as it is.
9. Run Verify and confirm every test passes.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats` passes, including the two new tests.
- Each of the six worker agent files has edits E1 to E7, and its frontmatter, `## Search and command bounds` section and `## If you were given a Worktree` section are unchanged.

### M05-T03: Have the reviewer read the changes since Base

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: none
- Files: `plugins/orcastrat/agents/reviewer.md`
- Verify: `grep -qE 'a task ID, a .Base:. commit, and sometimes' plugins/orcastrat/agents/reviewer.md && grep -qF 'git diff <Base>' plugins/orcastrat/agents/reviewer.md && grep -qF 'so a plain' plugins/orcastrat/agents/reviewer.md && ! grep -qF '5. The uncommitted changes' plugins/orcastrat/agents/reviewer.md`
- Fails first: no (agent prompt text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): the reviewer reads a task's changes since its Base`

**Objective**

The per-task `reviewer` takes a `Base:` line and reviews every change since that commit, committed or not (D96).

**Read first**

- `docs/orcastrat-execution-spec.md` §2, the "Why" paragraph and the `run` bullets
- plan.md Decision D96
- `plugins/orcastrat/agents/reviewer.md` lines 27–37 (`## Before anything else`)

**Interfaces**

- Consumes: none
- Produces: `Base: <BASE>` reviewer dispatch line

**Steps**

1. In `plugins/orcastrat/agents/reviewer.md`, replace `a task ID, and sometimes a `Worktree:` path.` with:

   ```text
   a task ID, a `Base:` commit, and sometimes a `Worktree:` path.
   ```

2. In the same file, replace the line `5. The uncommitted changes: `git status --porcelain` and `git diff`, plus the full content of any new file.` with this line:

   ```text
   5. The task's changes since `Base`, committed or not: `git diff <Base>` and `git status --porcelain`, plus the full content of any new file. Workers commit their own work, so a plain `git diff` misses it.
   ```

3. Run Verify.

**Done when**

- The reviewer's `## Before anything else` names the `Base:` line and reads `git diff <Base>`, and nothing else in the file changed.

### M05-T04: Describe the limits, worker commits and failure log in the plan format

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/reference/plan-format.md`
- Verify: `grep -qF '| Max run time |' plugins/orcastrat/reference/plan-format.md && grep -qF '| Max tasks |' plugins/orcastrat/reference/plan-format.md && grep -qF '| Max milestones |' plugins/orcastrat/reference/plan-format.md && grep -qF -- '- Interrupted: attempt <n> at <tier>' plugins/orcastrat/reference/plan-format.md && grep -qF 'chore(plan): <task ID> done' plugins/orcastrat/reference/plan-format.md && grep -qF 'notes/<task ID>-failures.md' plugins/orcastrat/reference/plan-format.md && ! grep -qF 'run adds the trailer' plugins/orcastrat/reference/plan-format.md`
- Fails first: no (reference text with no test; the Verify greps fail until the text is added)
- Commit: `docs(orcastrat): describe limits, worker commits and the failure log in the plan format`
- Process: worker committed on its own; reset and recommitted

**Objective**

The plan format documents the optional `Max run time`, `Max tasks` and `Max milestones` header fields, the worker commits and `run`'s status commit, the scope of the report file and failure log, the `- Interrupted:` line, and the failure log.

**Read first**

- `docs/orcastrat-execution-spec.md` §2, the `run` bullets, and §4, the "Ladder", "Failure log" and "Limits" bullets
- plan.md Decisions D29, D80, D84, D87 and D90
- `plugins/orcastrat/reference/plan-format.md` lines 66–77 (header fields) and 215–241 (task fields and appended lines)

**Interfaces**

- Consumes: none
- Produces: `Max run time: none | <n>m | <n>h`
- Produces: `Max tasks: none | <n>`
- Produces: `Max milestones: none | <n>`
- Produces: `- Interrupted: attempt <n> at <tier>`

**Steps**

1. In `plugins/orcastrat/reference/plan-format.md`, directly below the header-field table row that starts `| Worktree setup |` and above the row that starts `| Status |`, insert these three rows:

   ```text
   | Max run time | Optional: `none` (the default, also when the field is missing) or `<n>m` / `<n>h`. Once the run has lasted that long, `run` pauses with reason `LIMIT` before its next serial task or parallel batch. The flag `--max-run-time` beats it. |
   | Max tasks | Optional: `none` (the default, also when the field is missing) or `<n>`. Once `run` has committed that many tasks as `done` in this run, it pauses with reason `LIMIT`. The flag `--max-tasks` beats it. |
   | Max milestones | Optional: `none` (the default, also when the field is missing) or `<n>`. Once that many milestones have completed in this run, milestone reviews included, `run` pauses with reason `LIMIT`. The flag `--max-milestones` beats it. `Max milestones: 1` gives a natural point to `/clear` between milestones. |
   ```

2. In the same file, replace the row `| Files | Every path the task may create or modify, including tests and, for investigate tasks, its note. Nothing else may change. |` with this row:

   ```text
   | Files | Every path the task may create or modify, including tests and, for investigate tasks, its note. Nothing else may change. `run`'s scope check also allows the task's report file, `notes/reports/<task ID>.md`, and its failure log, `notes/<task ID>-failures.md`, both in the plan directory. |
   ```

3. In the same file, replace the whole row that starts `| Commit | Conventional-commit message, used verbatim.` with this row:

   ```text
   | Commit | Conventional-commit message. The worker commits its own work when the task is done and Verify passes: its first commit's subject is `<task ID>: <this message>`, and any further commit for the task is `<task ID>: <short message>`. After verifying, `run` makes the task's one status commit, `chore(plan): <task ID> done`, with the trailer `Orcastrat-Task: <task ID>`, so progress can be recovered from git history. Only that commit carries the trailer: a failed attempt's commit, `chore(plan): <task ID> attempt <n> failed`, has none. Recovery also matches the pre-rename `Orchestratinator-Task:` trailer. `run` finds these commits with its `recover` script when a run starts, and treats worker commits with no status commit after them as an interrupted attempt. |
   ```

4. In the same file, replace these four lines:

   ```text
   run appends these lines under a task when they apply:

   - `- Escalated: <from> → <to> (<one-line reason>)`
   - `- Blocked: GAP | STUCK | SCOPE | VERIFY | REVIEW | VACUOUS — <one line>`
   ```

   with exactly:

   ```text
   run appends these lines under a task when they apply:

   - `- Escalated: <from> → <to> (<one-line reason>)`
   - `- Interrupted: attempt <n> at <tier>`
   - `- Blocked: GAP | STUCK | SCOPE | VERIFY | REVIEW | VACUOUS — <one line>`

   A task climbs the ladder one tier per `- Escalated:` line, at most two tiers above its planned Tier (three rungs), and only the lines below its last `- Blocked:` line count. run also keeps a failure log for each task that has failed an attempt, `notes/<task ID>-failures.md`, with one `## Attempt <n>` entry per failed attempt, resumes included, and keeps each discarded attempt's report as `notes/reports/<task ID>-attempt<n>.md`.
   ```

5. Run Verify.

**Done when**

- The header-field table has the three optional limit rows between Worktree setup and Status.
- The Files and Commit rows and the appended-lines list read as in Steps 2 to 4, and nothing else in the file changed.

### M05-T05: Show a Failures line in status

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/skills/status/SKILL.md`
- Verify: `grep -qF 'Failures: <task ID> (<n> failed attempts), ...' plugins/orcastrat/skills/status/SKILL.md && grep -qF '<plan dir>/notes/*-failures.md' plugins/orcastrat/skills/status/SKILL.md && grep -qF 'whatever its status' plugins/orcastrat/skills/status/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): status shows a Failures line`

**Objective**

`/orcastrat:status` shows `Failures: <task ID> (<n> failed attempts), ...` for every failure log in the plan, after `Blocked:`, and omits the line when there is none (D91).

**Read first**

- `docs/orcastrat-execution-spec.md` §4, the "`status`" bullet
- plan.md Decisions D87 and D91
- `plugins/orcastrat/skills/status/SKILL.md`

**Interfaces**

- Consumes: none
- Produces: `Failures: <task ID> (<n> failed attempts), ...`

**Steps**

1. In `plugins/orcastrat/skills/status/SKILL.md`, replace the line ``Read `plan.md`, then the milestone file of every milestone that is `in-progress` or `blocked`. Do not read the others.`` with this line:

   ```text
   Read `plan.md`, then the milestone file of every milestone that is `in-progress` or `blocked`. Do not read the others. Then find the plan's failure logs with the Glob pattern `<plan dir>/notes/*-failures.md`, and count the lines starting `## Attempt ` in each with Grep's count mode. Read nothing else under `notes/`.
   ```

2. In the same file, directly below the line that starts `Blocked: <item, reason, one-line detail>` inside the reply shape, insert this line:

   ```text
   Failures: <task ID> (<n> failed attempts), ...   (omit if none)
   ```

3. In the same file, directly below the line `Then list open questions, one per line, with their tags.`, insert one empty line and then this line:

   ```text
   For **Failures**, list every task that has a failure log, `<plan dir>/notes/<task ID>-failures.md`, whatever its status, with `<n>` the number of lines starting `## Attempt ` in that log.
   ```

4. Run Verify.

**Done when**

- The reply shape has the `Failures:` line directly after `Blocked:`, and the skill says how to find and count failure logs.
- Nothing else in the file changed.

### M05-T06: Add the limit flags, the background-work rule and the plan-scoped Base to run

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF -- '--max-run-time <n>m' plugins/orcastrat/skills/run/SKILL.md && grep -qF -- '--max-milestones <N>' plugins/orcastrat/skills/run/SKILL.md && grep -qF '[--max-run-time 2h] [--max-milestones 1]' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'background-warning <UTC> <agent>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'git log --diff-filter=A --format=%H -- "<plan dir>/plan.md"' plugins/orcastrat/skills/run/SKILL.md && grep -qF '<that commit>..HEAD' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'the notes files this skill names' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'to BASE that discards a failed or interrupted attempt' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run takes limit flags, stops leftover background work, and scopes the milestone Base to the plan`

**Objective**

`run` accepts `--max-run-time` and `--max-milestones`, stops an agent's leftover background work after it returns (D49), may reset the plan branch only to discard an attempt (D99), and finds a milestone's Base only among this plan's commits (D78).

**Read first**

- `docs/orcastrat-execution-spec.md` §4, the "Limits" and "Leftover background work" bullets
- plan.md Decisions D49, D78, D81 and D99
- `plugins/orcastrat/skills/run/SKILL.md` lines 1–28 and section 3f item 2

**Interfaces**

- Consumes: `--max-tasks <N>` (existing, `plugins/orcastrat/skills/run/SKILL.md:15`)
- Produces: `--max-run-time <n>m` and `--max-run-time <n>h`
- Produces: `--max-milestones <N>`
- Produces: `background-warning <UTC> <agent> <task or milestone ID> "<notice text>"`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, replace the frontmatter line `argument-hint: "<plan dir> [--milestone M03] [--max-tasks 20] [--serial] [--max-parallel 4] [--yes]"` with:

   ```text
   argument-hint: "<plan dir> [--milestone M03] [--max-tasks 20] [--max-run-time 2h] [--max-milestones 1] [--serial] [--max-parallel 4] [--yes]"
   ```

2. Replace the line ``- `--max-tasks <N>`: pause cleanly once N tasks have been committed in this run.`` with these three lines:

   ```text
   - `--max-tasks <N>`: pause cleanly, with reason `LIMIT`, once N tasks have been committed in this run. Beats the plan's `Max tasks` header field.
   - `--max-run-time <n>m` or `--max-run-time <n>h`: pause cleanly, with reason `LIMIT`, once the run has lasted that long. Beats the plan's `Max run time` header field.
   - `--max-milestones <N>`: pause cleanly, with reason `LIMIT`, once N milestones have completed in this run, reviews included. Beats the plan's `Max milestones` header field.
   ```

3. Replace `The only files you edit are plan.md and milestone files, and only the fields this skill names.` with:

   ```text
   The only files you edit are plan.md, milestone files, and the notes files this skill names (a task's failure log and `notes/run-log.md`), and only the fields and lines this skill names.
   ```

4. Replace `Never rewrite history on the plan branch.` with:

   ```text
   Never rewrite history on the plan branch, except the `git reset --hard` to BASE that discards a failed or interrupted attempt (see Definitions).
   ```

5. Directly above the line that starts `- **Never push.**`, with no empty line between, insert this line:

   ```text
   - **After every agent returns** (a worker, the reviewer, a scout, the planner, the plan-reviewer, the milestone-reviewer, or any other agent), read its completion notice. If the notice reports background work still running, stop that agent's task with the Stop Task tool. If Stop Task fails, note the line `background-warning <UTC> <agent> <task or milestone ID> "<notice text>"`, with the current UTC time from `date -u +%Y-%m-%dT%H:%M:%SZ`, and continue. Append each noted line to `<plan dir>/notes/run-log.md` just before your next commit, after any scope check or reset that comes before that commit, and include it in that commit. Never kill a process by PID.
   ```

6. In section 3f, item 2, replace ``Find its **Base**: `git log --format=%H --grep="^chore(plan): start <ID>$"`, taking the oldest match (the last line printed).`` with:

   ```text
   Find its **Base** among this plan's commits only: run `git log --diff-filter=A --format=%H -- "<plan dir>/plan.md"` and take the last line printed, the commit that added plan.md; then run `git log --format=%H --grep="^chore(plan): start <ID>$" <that commit>..HEAD` and take the oldest match (the last line printed).
   ```

7. Run Verify.

**Done when**

- The Arguments list and argument hint have `--max-run-time` and `--max-milestones`, and `--max-tasks` names its header field.
- The operating rules have the background-work bullet and the reset exception, and 3f item 2 finds the Base with the two commands from D78.
- Nothing else in the file changed.

### M05-T07: Define attempts, tiers, discarding and limits in run

- Kind: change
- Tier: worker
- Status: todo
- Wave: 2
- Depends on: M05-T01, M05-T02, M05-T06
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `! grep -qF '**Commit a task**' plugins/orcastrat/skills/run/SKILL.md && grep -qF '**Attempt number**' plugins/orcastrat/skills/run/SKILL.md && grep -qF '**Current tier and rung**' plugins/orcastrat/skills/run/SKILL.md && grep -qF '**Discard an attempt**' plugins/orcastrat/skills/run/SKILL.md && grep -qF '**Keep a blocked attempt**' plugins/orcastrat/skills/run/SKILL.md && grep -qF '**Failure-log entry**' plugins/orcastrat/skills/run/SKILL.md && grep -qF '**Check the limits**' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'refs/orcastrat/discarded/<task ID>-<n>' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): define attempts, tiers, discarded attempts and limits in run`

**Objective**

`run`'s Definitions replace "Commit a task" with BASE, the report file and failure log, the attempt number, the current tier and rung, discarding and keeping an attempt, the failure-log entry, and the limits, so the rest of the skill can refer to them by name.

**Read first**

- `docs/orcastrat-execution-spec.md` §2, the "On a failed attempt" bullets, and §4, the "Ladder", "Failure log" and "Limits" bullets
- plan.md Decisions D84, D85, D87, D93 and D95
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions`

**Interfaces**

- Consumes: `run-state elapsed` (M05-T01)
- Consumes: `run-state elapsed stdout: the whole minutes since started, rounded down` (M05-T01)
- Consumes: `HYPOTHESIS:` and `FIXES TRIED:` report lines (M05-T02)
- Consumes: `--max-run-time <n>m` and `--max-run-time <n>h` (M05-T06)
- Consumes: `--max-milestones <N>` (M05-T06)
- Produces: `**BASE**`
- Produces: `**Report file**` and `**Failure log**`
- Produces: `**Attempt number**`
- Produces: `**Current tier and rung**`
- Produces: `**Discard an attempt**`
- Produces: `**Keep a blocked attempt**`
- Produces: `**Failure-log entry**`
- Produces: `**Limits**`
- Produces: `**Check the limits**`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `## Definitions`, replace these two lines:

   ```text
   - **Commit a task** in a directory D: `git -C "D" add -A`, then
     `git -C "D" commit -m "<task's Commit message>" -m "Orcastrat-Task: <task ID>"`.
   ```

   with exactly these four lines:

   ```text
   - **BASE**: in a serial wave, the commit that `git rev-parse HEAD` prints in MAIN just before a task's dispatch (3d item 1); a resume keeps the same BASE. In a parallel wave, BASE is the wave's starting commit (3e).
   - **Report file** and **Failure log** of a task: `<plan dir>/notes/reports/<task ID>.md` and `<plan dir>/notes/<task ID>-failures.md`, with `<plan dir>` written relative to the repository root, such as `plans/<plan-slug>`, because `scope-check` compares repo-relative paths. Either file may not exist yet: skip any step that copies or reads a file that doesn't exist.
   - **Attempt number** `<n>` of a task's current attempt: 1 plus the number of lines starting `## Attempt ` in its failure log, counted with `grep -c "^## Attempt " "<failure log>"` (1 when the log doesn't exist). Every dispatch and every resume of the task is an attempt, and the count carries across runs.
   - **Current tier and rung** of a task, read from its lines in the milestone file: count only the `- Escalated:` lines below its last `- Blocked:` line, or all of them if it has none. The starting tier is the `<new>` tier of its `- Re-tiered: <old> → <new> (...)` line if it has one, otherwise its Tier. The current tier is the `<to>` tier of the last counted `- Escalated: <from> → <to> (...)` line, or the starting tier when no line counts. The rung is 1 plus the number of counted lines.
   ```

2. Directly below the four lines from Step 1, insert these lines:

   ```text
   - **Hold directory**: `<WT_ROOT>/hold`. It is inside `.git`, so files held there survive `git reset --hard` and `git clean -fd`.
   - **Discard an attempt** of a task, in MAIN, with attempt number `<n>`:
     1. Run `mkdir -p "<WT_ROOT>/hold"`. With `cp`, copy the report file to `"<WT_ROOT>/hold/<task ID>-attempt<n>.md"` and the failure log to `"<WT_ROOT>/hold/<task ID>-failures.md"`.
     2. Run `git reset --hard <BASE>`, then `git clean -fd`.
     3. Run `mkdir -p "<plan dir>/notes/reports"`. With `cp`, copy the held report to `"<plan dir>/notes/reports/<task ID>-attempt<n>.md"` and the held failure log back to the failure log. Then run `rm -rf "<WT_ROOT>/hold"`.
   - **Keep a blocked attempt** of a serial task, with a block reason, a one-line detail and attempt number `<n>`, in MAIN: run `git rev-parse HEAD` and note the sha it prints; run `git update-ref refs/orcastrat/discarded/<task ID>-<n> HEAD`; **discard the attempt**; then mark the task `blocked` with `- Blocked: <reason> — <detail>; discarded attempt <sha>, kept at refs/orcastrat/discarded/<task ID>-<n>`. The Stop commit records the report, the failure log and the `- Blocked:` line. Only a blocked task keeps a ref; an escalation keeps none.
   ```

3. Directly below the lines from Step 2, insert these lines:

   ````text
   - **Failure-log entry** for attempt `<n>`: append these lines to the failure log, creating it if needed, with one empty line before the heading when the log already has an entry:
     ```
     ## Attempt <n>
     - Tier: <the tier the attempt ran at>
     - Time: <the current UTC time, from date -u +%Y-%m-%dT%H:%M:%SZ>
     - Description: <the failure's description (see Failed attempt), or interrupted attempt>
     - Hypothesis: <the worker's HYPOTHESIS line, or none reported when it gave none or "-">
     - Fixes tried: <the worker's FIXES TRIED line, or none reported when it gave none or "-">
     - Then: <resumed | escalated to <tier> | resume failed (<error>), escalated to <tier> | resume failed (<error>), blocked (STUCK) | redispatched at <tier> (interrupted) | blocked (STUCK)>
     - Error: none
     ```
     When Verify failed, the last line is `- Error:` instead, followed by the lines `verify` printed after its `log=` line, inside a `text` code fence.
   ````

4. Directly below the lines from Step 3, insert these lines:

   ```text
   - **Limits**: the run time limit is `--max-run-time`, or else the plan's `Max run time` header field; the task limit is `--max-tasks`, or else `Max tasks`; the milestone limit is `--max-milestones`, or else `Max milestones`. A missing field, or `none`, means no limit. A run time of `<n>m` is n minutes, and `<n>h` is n × 60 minutes.
   - **Check the limits**: if a run time limit is in effect, run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" elapsed`, which prints the whole minutes since this run started; if that is at least the limit, go to **Pause** with reason `LIMIT`. If a task limit is in effect and this run has already committed that many tasks as `done`, go to **Pause** with reason `LIMIT`. Check them before each new serial task (3d) and before each parallel batch (3e). The milestone limit is checked in 3f item 8.
   ```

5. Run Verify.

**Done when**

- `## Definitions` has no "Commit a task" entry, and has the entries from Steps 1 to 4 in that order, directly after the `**Verify a command**` entry.
- Nothing else in the file changed.

### M05-T08: Check for a clean tree, recover interrupted attempts, and start the run state in preflight

- Kind: change
- Tier: worker
- Status: todo
- Wave: 3
- Depends on: M03-T06, M05-T01, M05-T04, M05-T07
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'stop with reason SETUP and list the paths it printed' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'scripts/run-state" start "<plan dir>"' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'chore(plan): <task ID> attempt <n> interrupted' plugins/orcastrat/skills/run/SKILL.md && grep -qF -- '--invert-grep --grep="^<task ID>: "' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'interrupted attempt you will reset and redispatch' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'Take no action on' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'Commit any of these changes' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run requires a clean tree, recovers interrupted attempts, and starts the run state`

**Objective**

`run`'s preflight stops a dirty tree with `SETUP`, resets and redispatches an interrupted attempt at its recorded tier (D90), and writes the active-run marker with `run-state start` before its start commit.

**Read first**

- `docs/orcastrat-execution-spec.md` §2, the "Clean tree required" bullet, and §7, the `recover` bullet
- plan.md Decisions D06, D89, D90 and D98
- `plugins/orcastrat/skills/run/SKILL.md` section `## 2. Preflight`

**Interfaces**

- Consumes: `recover stdout: OK, or one line per affected todo task in table order then task order, done <task ID> or interrupted <task ID>` (M03-T06)
- Consumes: `run-state start <plan-dir>` (M05-T01)
- Consumes: `- Interrupted: attempt <n> at <tier>` (M05-T04)
- Consumes: `**Attempt number**` (M05-T07)
- Consumes: `**Current tier and rung**` (M05-T07)
- Consumes: `**Discard an attempt**` (M05-T07)
- Consumes: `**Failure-log entry**` (M05-T07)
- Produces: `chore(plan): <task ID> attempt <n> interrupted`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section 2a, replace the line that starts `1. **Working tree is clean.**` with this line:

   ```text
   1. **Working tree is clean.** `git status --porcelain` prints nothing: no uncommitted changes, and no untracked files outside `.gitignore`. If it prints anything, stop with reason SETUP and list the paths it printed: the user must commit or discard them first. A failed attempt is cleaned with `git clean -fd`, which would otherwise delete the user's untracked files.
   ```

2. In section 2a, item 6, replace ``Take no action on `interrupted <task ID>` lines.`` with:

   ```text
   An `interrupted <task ID>` line means a worker committed for that task but the run ended before its status commit: 2c item 2 resets that attempt and redispatches the task. If `recover` prints more than one `interrupted` line, or the subject that `git log -1 --format=%s` prints doesn't start with `<task ID>: ` for the interrupted task, stop with reason SETUP and list the lines.
   ```

3. In section 2b, replace the line ``- Where this run will stop on its own: gates, `--milestone`, `--max-tasks`, or the end of the plan.`` with:

   ```text
   - Where this run will stop on its own: gates, `--milestone`, the limits in effect (see Definitions), or the end of the plan.
   ```

4. In section 2b, replace the line ``- Any tasks you'll mark `done` because of interrupted-run recovery.`` with:

   ```text
   - Any tasks you'll mark `done` because of interrupted-run recovery, and any interrupted attempt you will reset and redispatch.
   ```

5. In section 2c, replace these four lines:

   ```text
   1. **Branch.** If the plan's Branch doesn't exist, create it: `git switch -c <branch>`.
   2. **Recovery.** Mark the tasks noted in 2a as `done`.
   3. **Status.** Set the plan's Status to `in-progress`.
   4. Commit any of these changes: `chore(plan): start run`.
   ```

   with exactly:

   ```text
   1. **Branch.** If the plan's Branch doesn't exist, create it: `git switch -c <branch>`.
   2. **Interrupted attempt.** For an `interrupted <task ID>` line from 2a item 6:
      - Find its BASE, the commit just below the task's worker commits at the tip of the Branch: `git log -1 --format=%H --invert-grep --grep="^<task ID>: "`.
      - If the task has an `- Interrupted:` line below its last `- Blocked:` line (or any `- Interrupted:` line, if it has no `- Blocked:` line), this is its second interruption: handle it as a **Failed attempt** with the description `interrupted attempt`.
      - Otherwise, find its attempt number `<n>` and current tier (see Definitions). **Discard the attempt**. Append its **failure-log entry**, with Description `interrupted attempt`, Hypothesis and Fixes tried `none reported`, Then `redispatched at <tier> (interrupted)`, and Error `none`. Add `- Interrupted: attempt <n> at <tier>` under the task. Then `git add -A` and `git commit -m "chore(plan): <task ID> attempt <n> interrupted"`, with no `Orcastrat-Task:` trailer. The wave loop dispatches the task again, at the same tier.
   3. **Recovery.** Mark the tasks noted in 2a as `done`.
   4. **Status.** Set the plan's Status to `in-progress`.
   5. **Run state.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" start "<plan dir>"`. It writes this checkout's active-run marker and appends a `start` line to `<plan dir>/notes/run-log.md`.
   6. Commit: `git add -A`, then `git commit -m "chore(plan): start run"`.
   ```

6. Run Verify.

**Done when**

- 2a item 1 stops a dirty tree with SETUP and gives the `git clean -fd` reason; 2a item 6 checks the `interrupted` lines; 2b mentions the limits and interrupted attempts.
- 2c has the six items from Step 5, and nothing else in the file changed.

### M05-T09: Rewrite the serial wave for worker commits, resume and the three-rung ladder

- Kind: change
- Tier: worker
- Status: todo
- Wave: 4
- Depends on: M03-T02, M03-T03, M05-T02, M05-T03, M05-T07, M05-T08
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF '## Failed attempt' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '## Retry' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'reset --soft <recorded HEAD>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'chore(plan): <task ID> done" -m "Orcastrat-Task: <task ID>"' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'Resume: attempt <n> failed. Fix it and report again.' plugins/orcastrat/skills/run/SKILL.md && grep -qF ':(exclude)<plan dir>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'Failures: <failure log>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'chore(plan): <task ID> attempt <n> failed' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'used up, go to **Pause**.' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): serial waves verify worker commits, resume once, and climb at most three rungs`

**Objective**

In serial waves, `run` checks the limits before each task, dispatches at the task's current tier with `Failures:`, checks pushes after every attempt, scopes `BASE..HEAD` against Files plus the report and failure log, makes the trailer-bearing status commit, and handles every failed attempt by resuming once and then escalating, up to three rungs.

**Read first**

- `docs/orcastrat-execution-spec.md` §2, the `run` bullets, §3, and §4, the "Ladder", "Failed attempt" and "Escalation context" bullets
- plan.md Decisions D83, D86, D92, D94 and D95
- `plugins/orcastrat/skills/run/SKILL.md` sections 3c, 3d and `## Retry`
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions` (the entries M05-T07 added)

**Interfaces**

- Consumes: `scope-check <dir> <base> <files...>` (M03-T02)
- Consumes: `push-check <dir> <base>` (M03-T03)
- Consumes: `Failures: <path>` dispatch line (M05-T02)
- Consumes: `Resume:` message with a `Reason:` line and, after a Verify failure, `Verify tail:` lines (M05-T02)
- Consumes: `HYPOTHESIS:` and `FIXES TRIED:` report lines (M05-T02)
- Consumes: `Base: <BASE>` reviewer dispatch line (M05-T03)
- Consumes: `**BASE**` (M05-T07)
- Consumes: `**Report file**` and `**Failure log**` (M05-T07)
- Consumes: `**Current tier and rung**` (M05-T07)
- Consumes: `**Discard an attempt**` (M05-T07)
- Consumes: `**Keep a blocked attempt**` (M05-T07)
- Consumes: `**Failure-log entry**` (M05-T07)
- Consumes: `**Check the limits**` (M05-T07)
- Produces: `chore(plan): <task ID> done` with the trailer `Orcastrat-Task: <task ID>`
- Produces: `chore(plan): <task ID> attempt <n> failed`
- Produces: `## Failed attempt`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section 3c, replace ``If `--max-tasks` is in effect, trim the wave set to the number of tasks still allowed in this run.`` with:

   ```text
   If a task limit is in effect (see Definitions), trim the wave set to the number of tasks still allowed in this run.
   ```

2. In section 3c, replace the line ``- If `--max-tasks` is now used up, go to **Pause**.`` with:

   ```text
   - If a task limit is in effect and is now used up, go to **Pause** with reason `LIMIT`.
   ```

3. In section 3d, replace everything from the line `For each task in the wave set, in order:` through the line that starts `6. **Record and commit.**`, both included, with exactly:

   ````text
   For each task in the wave set, in order, first **check the limits** (see Definitions), then:

   1. **Dispatch.** Record BASE: run `git rev-parse HEAD` in MAIN. Find the task's current tier (see Definitions) and dispatch to the worker agent for that tier, sending exactly:
      ```
      Plan: <plan dir>
      Milestone: <milestone ID>
      Task: <task ID>
      ```
      plus the line `Failures: <failure log>` when the task's failure log exists (see Definitions). Never paraphrase the task: the worker reads it from the plan. Note the agent ID the dispatch returns, for a resume.
   2. **Check for branch changes and pushes** after every attempt, whether it succeeded or failed, in MAIN, against BASE:
      - Run `git branch --show-current`. If it doesn't print the plan's Branch, go to **Stop** with reason STRAY.
      - Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/push-check" "<MAIN>" <BASE>`. It prints `OK`, or one line per commit since BASE that is on a remote, as `<sha> <subject>`. Anything but `OK` → go to **Stop** with reason PUSHED, listing those lines.
   3. **Read the report** (`STATUS`, `REASON`, `FILES`, `VERIFY`, `RED`, `HYPOTHESIS`, `FIXES TRIED`, `NOTE`). If the worker's reply has no `STATUS:` line, it returned no report (for example, it hit its turn limit): that is a **Failed attempt** with the description `no report (turn limit reached)`. For a task with `- Fails first: yes`, check RED first:
      - `RED: PASSED-EARLY` → **Block with GAP** (see below), with block reason `VACUOUS`.
      - `DONE` with the RED line missing or `N/A` → **Failed attempt** with the description `RED not confirmed`.
      - Otherwise (`RED: CONFIRMED <first failing line>`, or a `BLOCKED` report with RED missing or `N/A`) → go on to STATUS.

      A task without `- Fails first: yes` (Fails first `no`, or no Fails first line, as in format 1 milestones and `investigate` tasks) skips the RED check. Then, for every task, read STATUS:
      - `BLOCKED` / `GAP` → **Block with GAP** (see below).
      - `BLOCKED` / `STUCK` → **Failed attempt** with the description `STUCK: <NOTE>`.
      - `DONE` → continue.
   4. **Check scope.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/scope-check" "<MAIN>" <BASE> "<path>" ...`, passing each path in the task's Files, then the task's report file and failure log (see Definitions), each as its own double-quoted argument. It prints `OK`, or each changed path that isn't in that list, one per line; it checks both commits since BASE and uncommitted changes. Anything but `OK` → **Failed attempt** with the description `scope violation: <the printed paths, comma-separated>`.
   5. **Verify yourself**, in MAIN. Don't trust the worker's VERIFY line.
      - A command → Verify it in MAIN (see Definitions); failure → **Failed attempt** with the description `Verify failed`.
      - `review` → invoke `orcastrat:reviewer` with the same three lines as the dispatch, plus `Base: <BASE>`; `VERDICT: FAIL` → **Failed attempt** with the description `reviewer FAIL: <REASONS>`.
      - Both → command first, review only if it passes.
   6. **Commit what the worker left.** Workers commit their own work. If `git status --porcelain` still lists a path outside the plan directory, commit those paths for the worker (the scope check passed, so they are all in the task's Files): `git add -A -- ":(exclude)<plan dir>"`, then `git commit -m '<task ID>: <the task's Commit message>'`, writing each `'` in the message as `'\''`.
   7. **Record and commit.** Set the task's Status to `done`. Then `git add -A` and `git commit -m "chore(plan): <task ID> done" -m "Orcastrat-Task: <task ID>"`. This status commit also carries the task's report file and failure log. It is the only commit with the trailer.
   ````

4. Replace the whole `## Retry` section, from its heading line through the closing fence of the `Retry:` block it ends with, with exactly:

   ````text
   ## Failed attempt

   An attempt at a serial task failed: its Verify failed, the reviewer returned FAIL, the worker reported STUCK or returned no report, RED wasn't confirmed, or the scope check printed paths. 3d gives each failure its description for the failure log: `Verify failed`, `reviewer FAIL: <REASONS>`, `STUCK: <NOTE>`, `no report (turn limit reached)`, `RED not confirmed`, or `scope violation: <paths>`; a second interruption (2c item 2) has `interrupted attempt`. Parallel tasks follow 3e item 5 instead.

   The ladder is `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist`. Each rung gets one attempt plus one resume of the same agent, and a task climbs at most two tiers above its starting tier: three rungs, never past `specialist`. Find the attempt number `<n>` and the task's current tier and rung (see Definitions), then take the first of these that applies:

   1. **Resume** when this attempt wasn't itself a resume (the failure log's last entry doesn't say `- Then: resumed`) and isn't a second interruption:
      - For a scope violation, first **discard the attempt** (see Definitions), but copy the held report back to the report file itself instead of `-attempt<n>.md`. For every other failure, leave the tree as the worker left it.
      - Append the **failure-log entry**, with Then `resumed`.
      - Resume the same agent with the SendMessage tool, addressed to the agent ID its dispatch returned, sending exactly:
        ```
        Resume: attempt <n> failed. Fix it and report again.
        Reason: <the description>
        Verify tail:
        <the lines verify printed after its log= line>
        ```
        Leave out the two `Verify tail:` lines unless Verify failed. For a scope violation, add the line `The tree was reset to where your attempt started.`
      - If the SendMessage call returns an error, change that entry's Then line to `resume failed (<error>), escalated to <next tier>`, or to `resume failed (<error>), blocked (STUCK)` when item 3 applies, and go on to item 2 or 3 without appending another entry.
      - Otherwise, when the resumed worker replies, go on with the task at 3d item 2, with the same BASE.
   2. **Escalate** when the rung is below 3 and the current tier isn't `specialist`. The next tier is one up the ladder from the current tier.
      - **Discard the attempt** (see Definitions).
      - Append the **failure-log entry**, with Then `escalated to <next tier>`, unless item 1 already wrote it.
      - Add `- Escalated: <current tier> → <next tier> (<the description>)` under the task, below its other lines, leaving its Tier field unchanged.
      - Commit: `git add -A`, then `git commit -m "chore(plan): <task ID> attempt <n> failed"`, with no `Orcastrat-Task:` trailer.
      - Dispatch the task again at 3d item 1, without checking the limits: it records the new HEAD as BASE, dispatches a fresh worker at the next tier, and adds the `Failures:` line. After a second interruption found in 2c, don't dispatch now: the wave loop dispatches the task.
   3. **Block** when the rung is 3 or the current tier is `specialist`. **Keep the blocked attempt** (see Definitions) with reason `STUCK` and the description as its detail. Append the **failure-log entry**, with Then `blocked (STUCK)`, unless item 1 already wrote it. Then go to **Stop** with reason STUCK. The stop report says the task most likely needs replanning, not another run: a task no three consecutive tiers can execute is a planning problem, not an execution problem.
   ````

5. Run Verify.

**Done when**

- Section 3c trims by the task limit and pauses with `LIMIT`; section 3d has the seven items from Step 3, with no soft-reset.
- The `## Retry` section is gone, and `## Failed attempt` stands in its place with the text from Step 4.
- Nothing else in the file changed.

### M05-T10: Keep parallel retries and block serial GAPs with a kept attempt

- Kind: change
- Tier: worker
- Status: todo
- Wave: 5
- Depends on: M05-T03, M05-T07, M05-T09
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'Before each batch, **check the limits**' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'queue a **Retry**' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'git -C "<worktree>" commit -m' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'A parallel task gets at most one retry' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'Run every queued retry as its own batch' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'In serial mode, **keep the blocked attempt**' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'in serial mode, keep the blocked attempt; in parallel mode' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): keep parallel retries as they are and keep blocked serial attempts`

**Objective**

Parallel waves check the limits before each batch, send the reviewer `Base:`, commit in the worktree without the removed "Commit a task" definition, and keep today's one-retry rules in 3e item 5 (D82), while a serial GAP or VACUOUS block keeps its discarded attempt under a ref (D85).

**Read first**

- plan.md Decisions D82, D85 and D96
- `plugins/orcastrat/skills/run/SKILL.md` section 3e and `## Block with GAP`
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions`, the `**Keep a blocked attempt**` and `**Check the limits**` entries

**Interfaces**

- Consumes: `Base: <BASE>` reviewer dispatch line (M05-T03)
- Consumes: `**Keep a blocked attempt**` (M05-T07)
- Consumes: `**Check the limits**` (M05-T07)
- Consumes: `**Current tier and rung**` (M05-T07)
- Consumes: `## Failed attempt` (M05-T09)
- Produces: none

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section 3e, replace ``Process the wave set in batches of at most Max parallel tasks (or `--max-parallel`), in task ID order. For each batch:`` with:

   ```text
   Process the wave set in batches of at most Max parallel tasks (or `--max-parallel`), in task ID order. Before each batch, **check the limits** (see Definitions). For each batch:
   ```

2. In section 3e, item 3, replace each of the four occurrences of `queue a **Retry**` with `queue a retry (item 5)`.
3. In section 3e, item 3, in the bullet that starts ``- Any other `DONE` →``, make two replacements. Replace ``the reviewer also gets the `Worktree:` line)`` with ``the reviewer also gets the `Worktree:` line, and `Base: <BASE>`)``. Then replace `Success → commit the task in the worktree.` with:

   ```text
   Success → commit the task in the worktree: `git -C "<worktree>" add -A`, then `git -C "<worktree>" commit -m '<task's Commit message>' -m "Orcastrat-Task: <task ID>"`, writing each `'` in the message as `'\''`.
   ```

4. In section 3e, replace the line that starts `5. **Retries.** Run every queued retry as its own batch,` with exactly:

   ````text
   5. **Retries.** A parallel task gets at most one retry, one tier up the ladder, in a fresh worktree, with no resume. For each queued retry:
      - If the task has already been retried in this run, or its current tier (see Definitions) is already `specialist`: mark it `blocked` with `- Blocked: STUCK | VERIFY | REVIEW — <one line>`, and leave its worktree for the user to inspect. Finish the wave's other tasks first (item 6, Integrate, onward), then go to **Stop**.
      - Otherwise, remove the attempt's worktree and branch. Add `- Escalated: <from> → <to> (<one-line reason>)` under the task, leaving its Tier field unchanged, plus any `- Process:` line you remembered for this attempt. Commit those lines in MAIN before dispatching again, so the next scope check never sees them: `git add "<milestone file path>"`, then `git commit -m "chore(plan): <task ID> attempt 1 failed"`, with no `Orcastrat-Task:` trailer.

      Then run the retries as their own batch, the same way, in fresh worktrees from BASE, each dispatched to the worker agent for its next tier with these lines appended:
      ```
      Retry: previous attempt by <tier> failed. You are starting from a clean state.
      Reason: <worker's NOTE, reviewer's REASONS, "Verify failed", "RED not confirmed (Fails first: yes)", or "no report">
      Verify tail:
      <the lines verify printed after its log= line, if a command failed>
      ```
   ````

5. In section `## Block with GAP`, replace the paragraph that starts `The plan left a decision open.` with exactly:

   ```text
   The plan left a decision open. **Never retry or escalate a GAP**: a higher tier would just make the decision. Add the question to plan.md's Open questions tagged with the task ID. In serial mode, **keep the blocked attempt** (see Definitions) with reason `GAP` and the question as its detail, then go to **Stop**. In parallel mode, mark the task `blocked` with `- Blocked: GAP — <question>`, finish the wave's other tasks first (item 6 of 3e, Integrate, onward), then **Stop**.
   ```

6. In the same section, in the paragraph that starts ``A `RED: PASSED-EARLY` report``, replace ``Mark the task `blocked` with `- Blocked: VACUOUS — <worker's NOTE>`, add `Verify passed before implementation: <worker's NOTE>` to plan.md's Open questions tagged with the task ID, and stop exactly as for a GAP.`` with:

   ```text
   Add `Verify passed before implementation: <worker's NOTE>` to plan.md's Open questions tagged with the task ID. Then block and stop exactly as for a GAP, with reason `VACUOUS` and the worker's NOTE as the detail: in serial mode, keep the blocked attempt; in parallel mode, mark the task `blocked` with `- Blocked: VACUOUS — <worker's NOTE>`.
   ```

7. Run Verify.

**Done when**

- Section 3e checks the limits before each batch, has no `**Retry**` reference, commits in the worktree with the trailer, and item 5 holds the parallel retry rules from Step 4.
- `## Block with GAP` keeps the blocked attempt in serial mode for both GAP and VACUOUS, and nothing else in the file changed.

### M05-T11: End the run state at every Pause, Stop and completion

- Kind: change
- Tier: worker
- Status: todo
- Wave: 6
- Depends on: M05-T01, M05-T07, M05-T10
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'scripts/run-state" end PAUSE <reason>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'scripts/run-state" end STOP <reason>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'scripts/run-state" end COMPLETE plan' plugins/orcastrat/skills/run/SKILL.md && grep -qE 'Pause\*\* with reason .GATE., telling the user to review the milestone file' plugins/orcastrat/skills/run/SKILL.md && grep -qE 'Pause\*\* with reason .MILESTONE.' plugins/orcastrat/skills/run/SKILL.md && grep -qE 'that many milestones, go to \*\*Pause\*\* with reason .LIMIT.' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '$(' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run ends the run state at every pause, stop and completion`

**Objective**

Every Pause names its reason (`GATE`, `MILESTONE` or `LIMIT`), the milestone limit pauses after a milestone completes, and every Pause, Stop and completion calls `run-state end` before its commit.

**Read first**

- `docs/orcastrat-execution-spec.md` §4, the "Limits" bullet, and §9, the "Marker" bullet
- plan.md Decisions D06, D85 and D88
- `plugins/orcastrat/skills/run/SKILL.md` section 3a item 8, section 3f item 8, section 4, `## Pause` and `## Stop`

**Interfaces**

- Consumes: `run-state end <PAUSE|STOP|COMPLETE> <reason>` (M05-T01)
- Consumes: `**Limits**` (M05-T07)
- Produces: Pause reasons `GATE`, `MILESTONE` and `LIMIT`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section 3a, replace the line ``8. If Gates includes `detail`: go to **Pause**, telling the user to review the milestone file and rerun.`` with:

   ```text
   8. If Gates includes `detail`: go to **Pause** with reason `GATE`, telling the user to review the milestone file and rerun.
   ```

2. In section 3f, replace the line ``8. If `--milestone` was given, go to **Pause**. If Gates includes `milestone`, go to **Pause**, telling the user to review and rerun.`` with:

   ```text
   8. If a milestone limit is in effect (see Definitions) and this run has now completed that many milestones, go to **Pause** with reason `LIMIT`. If `--milestone` was given, go to **Pause** with reason `MILESTONE`. If Gates includes `milestone`, go to **Pause** with reason `GATE`, telling the user to review and rerun.
   ```

3. In section 4, replace the line ``2. Set the plan to `complete` and commit: `chore(plan): complete plan`.`` with:

   ```text
   2. Set the plan to `complete`. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end COMPLETE plan`: it deletes the active-run marker and appends an `end` line to `<plan dir>/notes/run-log.md`. Then `git add "<plan dir>"` and `git commit -m "chore(plan): complete plan"`.
   ```

4. In section `## Pause`, replace these four lines:

   ```text
   A clean, intentional stop: gates, `--milestone`, `--max-tasks`.

   1. Commit any pending plan-file changes: `chore(plan): pause at <where>`. The main checkout must be clean when you finish, and no task worktrees should remain.
   2. Report where the run paused, what happens next, and that rerunning `/orcastrat:run <plan dir>` continues from there.
   ```

   with exactly:

   ```text
   A clean, intentional stop, with one of these reasons: `GATE` (a `detail` or `milestone` gate), `MILESTONE` (`--milestone`), or `LIMIT` (the run time, task or milestone limit; see Definitions).

   1. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end PAUSE <reason>`. It deletes the active-run marker and appends an `end` line to `<plan dir>/notes/run-log.md`.
   2. Commit the pending plan-file changes, that line included: `git add "<plan dir>"`, then `git commit -m "chore(plan): pause at <where>"`. The main checkout must be clean when you finish, and no task worktrees should remain.
   3. Report where the run paused and why, what happens next, and that rerunning `/orcastrat:run <plan dir>` continues from there.
   ```

5. In section `## Stop`, replace these three lines:

   ```text
   1. Plan-file changes (blocked statuses, open questions) are committed on their own: `git add <plan dir>` and `git commit -m "chore(plan): blocked at <where>"`. In serial mode, if task code is in the main working tree, leave all of it uncommitted, plan files included, for the user to inspect.
   2. Report: where, the reason (GAP, STUCK, SCOPE, VERIFY, REVIEW, VACUOUS, MERGE, STRAY, PUSHED, SETUP, VALIDATION), the one-line detail, what the user needs to decide or fix, and the path of every worktree left for inspection. For a GAP or VACUOUS, quote the question exactly.
   3. Stop. Don't continue with anything else.
   ```

   with exactly:

   ```text
   1. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end STOP <reason>`, with the reason you report in item 3. It deletes the active-run marker and appends an `end` line to `<plan dir>/notes/run-log.md`.
   2. Plan-file changes (blocked statuses, open questions, a blocked task's report and failure log, and that `end` line) are committed on their own: `git add <plan dir>` and `git commit -m "chore(plan): blocked at <where>"`. In serial mode, if task code is in the main working tree, leave all of it uncommitted, plan files included, for the user to inspect.
   3. Report: where, the reason (GAP, STUCK, SCOPE, VERIFY, REVIEW, VACUOUS, MERGE, STRAY, PUSHED, SETUP, VALIDATION), the one-line detail, what the user needs to decide or fix, and the path of every worktree left for inspection. For a GAP or VACUOUS, quote the question exactly. For STUCK, say the task most likely needs replanning, not another run. For a blocked attempt kept under `refs/orcastrat/discarded/`, name its ref.
   4. Stop. Don't continue with anything else.
   ```

6. Run Verify.

**Done when**

- 3a item 8 and 3f item 8 name their Pause reasons, and 3f item 8 checks the milestone limit first.
- Section 4, `## Pause` and `## Stop` each run `run-state end` before their commit, and the skill contains no `$(`.
- Nothing else in the file changed.
