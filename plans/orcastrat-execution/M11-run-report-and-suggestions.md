# M11: Run report and rule suggestions (Changes 11, 18)

- Status: in-progress
- Format: 2
- Goal: `run-report` builds `plans/<slug>/notes/run-report.md` from recorded files and history, with bats tests. `run` runs it at every Pause, Stop and completion, and commits the report. When a finding category appears in the reviews of two or more milestones, `run`'s milestone-end step appends a suggested CLAUDE.md rule or hook to `notes/instruction-suggestions.md`, and the run report lists it. Suggestions are never applied.
- Depends on: M10
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §12 (Change 11), §19 (Change 18), §1.5, §25 item 4, §25a item 5; Decisions D04, D05, D42, D43, D55, D81, D84, D87, D88, D89, D182, D186, D192 and D204–D213. `plans/orcastrat-execution/notes/M11-decisions.md` holds the full text behind D207 (report invocations, counts and layout) and D209 (the suggestion step).

- D62: no task in this milestone is `worker-light`; `worker` is the floor.
- Tier adjustment: test-first bats tasks → worker (worker-light escalated 2 times in M02)
- The run report's sources: `notes/run-log.md` (`start`, `end`, `usage`, `merge-resolved`, `merge-rerun`, `already-integrated`, `containment-fallback`, `auto-decided`, `background-warning` and `model-notice` lines), plan.md's Milestones table and `- D<nn>:` lines, the task blocks of the milestone files, `notes/<task ID>-failures.md`, the trailer commits on the plan's Branch, the review notes, and `notes/instruction-suggestions.md`. Every run-log line is `<key> <UTC> ...`, `<UTC>` being `YYYY-MM-DDTHH:MM:SSZ`. The `containment-fallback` (D186, M16) and `auto-decided` (D206, M12) lines are written by later milestones; M11's tests write them into fixtures.
- New scripts follow the existing ones (`plugins/orcastrat/scripts/task-brief` is the pattern): bash 3.2 (no associative arrays, `mapfile` or `${var,,}`), only `git` and standard utilities, no `pwsh` or `powershell` anywhere in the file (`tests/orcastrat/no-powershell.bats`), `. "$(dirname "${BASH_SOURCE[0]}")/lib/common"` with `# shellcheck source=/dev/null` above it, the same `fail()` function, `# shellcheck disable=SC2016` above each single-quoted awk program, carriage returns stripped from every file read, and D55 errors. `.gitattributes` already gives them LF endings.
- Bats files start with `bats_require_minimum_version 1.5.0`, `load test_helper` in `setup()`, and run the script through `run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"` after `make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"`, as `tests/orcastrat/task-brief.bats` does. So a printed path `<p>` shows up as `cygpath-stub [-m] [<p>]`.
- `plugins/orcastrat/README.md` and `CHANGELOG.md` are M15's: no task here edits them.
- The run executing this plan is the installed, pre-rename plugin (D37). Editing the repository's skills changes nothing in that run. No task runs `run` or `plan`, installs the plugin or starts Claude Code, and no test runs Claude Code.
- The bats files run slowly on Windows. Give a Verify command that runs bats a Bash timeout of 600000 ms. On this machine git prints `LF will be replaced by CRLF` warnings while tests build fixtures; they are expected.
- Every block a Step gives in a fence is its literal final content: the fenced block in that Step, with the three-space list indentation removed from each line. Blank lines stay empty. Copy a block exactly; don't reformat, reorder or "improve" it. A block fenced with four backticks may hold three-backtick fences of its own: they are part of the content.
- **Replacing text.** "Replace A with B" means: find A, which occurs exactly once in the file unless the Step gives another count (as a whole line, or as the part of a line quoted), and put B in its place, changing nothing around it. If A isn't found that many times, stop and report `BLOCKED` / `GAP` quoting A.
- **Inserting lines.** "Directly below the line L, insert X" means: put X on its own lines right after L, with no empty line between them.
- Skill and reference text contains no `$(`: `tests/orcastrat/skill-files.bats` checks it.

Waves: 5 (widths 3, 2, 2, 2, 1)

## Coverage

- `docs/orcastrat-execution-spec.md` preamble: numbers for tuning time and usage, gathered by scripts rather than by the Opus orchestrator → M11-T01, M11-T02, M11-T03, M11-T04, M11-T05, M11-T06
- `docs/orcastrat-execution-spec.md` §1.1: known mechanisms only: recorded plan files, the run log and git history → M11-T01, M11-T03, M11-T04, M11-T06
- `docs/orcastrat-execution-spec.md` §1.2: the plan format names `run-report.md` and `instruction-suggestions.md` among the notes files → M11-T10
- `docs/orcastrat-execution-spec.md` §1.5: usage is display only; nothing waits, pauses or stops on it → M11-T02, M11-T07
- `docs/orcastrat-execution-spec.md` §1.6: `run-report` and `suggest-check` use bash 3.2, git and standard utilities, with D55 errors, `print_path` and bats tests → M11-T01, M11-T06
- `docs/orcastrat-execution-spec.md` §7: the `run-report <plan-dir>` script, and `suggest-check` for Change 18's mechanical counting (D209) → M11-T01, M11-T06
- `docs/orcastrat-execution-spec.md` §12: builds `notes/run-report.md` from task statuses, trailers, failure logs, escalation lines, merge and containment notes, review notes, and Pause or Stop records → M11-T01, M11-T02, M11-T03, M11-T04
- `docs/orcastrat-execution-spec.md` §12: per run invocation and for the plan so far (D207) → M11-T01
- `docs/orcastrat-execution-spec.md` §12: tasks done; attempts, resumes and escalations per tier; tasks that ended STUCK → M11-T03
- `docs/orcastrat-execution-spec.md` §12: merges resolved and reruns after failed merges (D205) → M11-T02, M11-T07
- `docs/orcastrat-execution-spec.md` §12: containment downgrades; auto-decided questions, each with its Decision (D206); leftover-background-work warnings (D49) → M11-T02
- `docs/orcastrat-execution-spec.md` §12: advisory findings per milestone, and blocking candidates confirmed or downgraded by the validator → M11-T04
- `docs/orcastrat-execution-spec.md` §12: stops and pauses by reason; wall-clock time → M11-T01
- `docs/orcastrat-execution-spec.md` §12: usage only where Claude Code reports it, otherwise `not available` (D204) → M11-T02, M11-T07
- `docs/orcastrat-execution-spec.md` §12: `run` runs it at every Pause, Stop and completion and commits it with that commit (D208, D212) → M11-T08
- `docs/orcastrat-execution-spec.md` §12 Acceptance: the script with tests; `run` calls it at each end state → M11-T01, M11-T02, M11-T03, M11-T04, M11-T05, M11-T08
- `docs/orcastrat-execution-spec.md` §19 item 1: a finding category in the reviews of two or more milestones makes the milestone-end step add a suggestion, a CLAUDE.md rule with draft wording or a hook (D209, D213) → M11-T06, M11-T09
- `docs/orcastrat-execution-spec.md` §19 item 2: suggestions are appended to `notes/instruction-suggestions.md`, listed in the run report, and never applied → M11-T05, M11-T09
- `docs/orcastrat-execution-spec.md` §19 item 3: a suggestion for an instruction file flagged for leanness says so and prefers a hook or skill → M11-T09
- `docs/orcastrat-execution-spec.md` §19 Acceptance: the same category in two milestone reviews produces one suggestion with draft wording → M11-T06, M11-T09
- `docs/orcastrat-execution-spec.md` §21 item 2: under `--yes`, the model notice goes into the run report (D42) → M11-T02
- `docs/orcastrat-execution-spec.md` §25 item 4: `run-report` accepts both `Orcastrat-Task:` and `Orchestratinator-Task:` → M11-T03
- `docs/orcastrat-execution-spec.md` §25a item 5: tokens per run invocation from the usage lines (D79, D204) → M11-T02, M11-T07
- `docs/orcastrat-execution-spec.md` §29 item 8: Changes 11 and 18 are built serially, after Change 10 → M11-T01, M11-T06, M11-T08, M11-T09
- `docs/orcastrat-execution-spec.md` §31: kebab-case script names, bats tests in `tests/orcastrat/`, LF line endings → M11-T01, M11-T06
- `docs/orcastrat-execution-spec.md` §32 items 15, 34 and 66: the run report is generated by script at every Pause, Stop and completion, with display-only usage; suggestions are written, never applied; the report counts background-work warnings → M11-T02, M11-T08, M11-T09

## Review Focus

- A review note in a shape other than D182's, such as this plan's own M01–M10 reviews → its lines are not counted (source: D207). Test: `review lines in other shapes are not counted` in M11-T04.
- A noted line appended below the `end` line but timed inside that invocation → counts in that invocation, and a line timed between two invocations counts only for the plan (source: D207; D212). Test: `a line appended after the end line counts in the invocation its time falls in` in M11-T02.
- An invocation with no `end` line, followed by another `start` → it runs to that `start`, its wall-clock time is `unknown`, and the plan's sum leaves it out (source: D207). Test: `an invocation without an end line runs to the next start` in M11-T01.
- `run-report` run again with no new records, as when a Pause is resumed from git → it writes the same bytes, so the tree stays clean (source: spec §25a item 3; D211). Test: `a second run with no new records writes the same report` in M11-T01.
- A category found in one milestone's review and in another milestone's plan review → no suggestion (source: D209). Test: `plan reviews don't count toward a recurring category` in M11-T06.

## Tasks

### M11-T01: Add run-report with invocations, stops and wall-clock time

- Kind: change
- Tier: worker-heavy
- Why this tier: fully specified but intricate: date-to-epoch arithmetic, assigning records to time spans, and a report layout four later tasks extend.
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/scripts/run-report`, `tests/orcastrat/run-report.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/run-report.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add run-report with invocations, stops and wall-clock time`

**Objective**

`run-report <plan-dir>` writes `<plan-dir>/notes/run-report.md` with one section per run invocation and a Plan so far section, each giving the stops and pauses by reason and the wall-clock time, and prints the report's path (spec §12; D207, D211).

**Read first**

- `docs/orcastrat-execution-spec.md` §12
- `plans/orcastrat-execution/notes/M11-decisions.md` section `## D207`, and plan.md Decisions D88, D89, D207 and D211
- `plugins/orcastrat/scripts/task-brief` (the pattern: header comment, `fail`, argument checks, the `slug=` line, `.tmp` then `mv`, `print_path`)
- `tests/orcastrat/task-brief.bats` lines 1–20 and 225–277 (setup, `run_script`, the drive-letter and error tests), and `tests/orcastrat/test_helper.bash`

**Interfaces**

- Consumes: `print_path <path>` (existing, `plugins/orcastrat/scripts/lib/common:8`)
- Consumes: `make_fixture_repo <dir>` (existing, `tests/orcastrat/test_helper.bash:9`)
- Consumes: `make_cygpath_stub <dir>` (existing, `tests/orcastrat/test_helper.bash:25`)
- Consumes: `start <UTC> <plan-dir>` and `end <UTC> <PAUSE|STOP|COMPLETE> <reason>` run-log lines (existing, `plugins/orcastrat/scripts/run-state:90`, `:114`)
- Produces: `run-report <plan-dir>`
- Produces: `records lines <kind><TAB><fields>, built by runlog_records (kind L)`
- Produces: `report_awk functions epoch(ts), inv_of(t) and bullets(k)`
- Produces: `run-report.bats helpers run_script, write_plan, write_log <line>... and section <file> <heading>`

**Steps**

1. Create `tests/orcastrat/run-report.bats`. Its first line is `bats_require_minimum_version 1.5.0`. `setup()` loads `test_helper`, sets `SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/run-report"`, `REPO="$BATS_TEST_TMPDIR/fixture repo"`, runs `make_fixture_repo "$REPO"` and `make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"`, sets `PLAN="$REPO/plans/demo plan"` and `REPORT="$PLAN/notes/run-report.md"`, runs `mkdir -p "$PLAN/notes"`, then `write_plan`. Add these helpers:
   - `run_script <args...>`, exactly as in `task-brief.bats`.
   - `write_plan`, which writes `$PLAN/plan.md` and `$PLAN/M01-first.md` with the two blocks below.
   - `write_log <line>...`, which writes each argument as one line of `$PLAN/notes/run-log.md`, replacing the file.
   - `section <file> <heading>`, which prints the non-empty lines from the line equal to `<heading>` through the line before the next line starting `## `.

   `$PLAN/plan.md`:

   ```markdown
   # Plan: Demo

   - Branch: main
   - Status: in-progress

   ## Milestones

   | ID | Title | Status | File |
   |---|---|---|---|
   | M01 | First | in-progress | M01-first.md |

   ## Decisions

   - D01: First decision.

   ## Open questions

   None.
   ```

   `$PLAN/M01-first.md`:

   ```markdown
   # M01: First

   - Status: in-progress

   ## Tasks
   ```

2. Add these tests. `S1`, `S2`, `S3` and `P` stand for `section "$REPORT" '## Invocation 1: <its start UTC>'`, the same for invocations 2 and 3, and `section "$REPORT" '## Plan so far'`; "has L" means `grep -qxF -- 'L'` on that output succeeds. The log `LOG6` is these six lines:

   ```text
   start 2026-09-20T10:00:00Z plans/demo plan
   end 2026-09-20T10:45:30Z PAUSE GATE
   start 2026-09-21T09:00:00Z plans/demo plan
   end 2026-09-21T11:30:59Z STOP GAP
   start 2026-09-22T08:00:00Z plans/demo plan
   end 2026-09-22T08:10:00Z PAUSE GATE
   ```

   - `run-report writes the report and prints its path through print_path`: `write_log` the first two lines of LOG6; status 0, `$stderr` empty, `$output` is `cygpath-stub [-m] [$PLAN/notes/run-report.md]`, line 1 of `$REPORT` is `# Run report: Demo` and line 2 is empty.
   - `each invocation gets its stops, pauses and wall-clock time`: LOG6. S1 has `- Stops and pauses: PAUSE GATE 1` and `- Wall-clock time: 45 min`; S2 has `- Stops and pauses: STOP GAP 1` and `- Wall-clock time: 150 min`; S3 has `- Stops and pauses: PAUSE GATE 1` and `- Wall-clock time: 10 min`; P has `- Stops and pauses: PAUSE GATE 2, STOP GAP 1` and `- Wall-clock time: 205 min`. `grep '^## ' "$REPORT"` prints exactly `## Invocation 1: 2026-09-20T10:00:00Z`, `## Invocation 2: 2026-09-21T09:00:00Z`, `## Invocation 3: 2026-09-22T08:00:00Z`, `## Plan so far`, in that order.
   - `a completed run is neither a stop nor a pause`: log `start 2026-09-23T10:00:00Z plans/demo plan`, `end 2026-09-23T12:00:00Z COMPLETE plan`. S1 and P each have `- Stops and pauses: none` and `- Wall-clock time: 120 min`.
   - `an invocation without an end line runs to the next start`: log `start 2026-09-20T10:00:00Z plans/demo plan`, `start 2026-09-20T12:00:00Z plans/demo plan`, `end 2026-09-20T12:30:00Z STOP STUCK`, `start 2026-09-21T09:00:00Z plans/demo plan`. S1 has `- Stops and pauses: none` and `- Wall-clock time: unknown`; S2 has `- Stops and pauses: STOP STUCK 1` and `- Wall-clock time: 30 min`; S3 has `- Wall-clock time: unknown`; P has `- Stops and pauses: STOP STUCK 1` and `- Wall-clock time: 30 min`.
   - `wall-clock time crosses leap-day and year boundaries`: log `start 2024-02-28T23:30:00Z plans/demo plan`, `end 2024-03-01T00:30:00Z PAUSE LIMIT`, `start 2025-12-31T23:59:00Z plans/demo plan`, `end 2026-01-01T00:01:00Z PAUSE LIMIT`. S1 has `- Wall-clock time: 1500 min`, S2 has `- Wall-clock time: 2 min`, P has `- Wall-clock time: 1502 min` and `- Stops and pauses: PAUSE LIMIT 2`.
   - `with no run log the report has only the plan so far`: no `run-log.md`. Status 0; no line of `$REPORT` starts `## Invocation`; P has `- Stops and pauses: none` and `- Wall-clock time: unknown`.
   - `run-report accepts carriage returns in the run log`: LOG6 written with `printf '%s\r\n'`. S1 (heading `## Invocation 1: 2026-09-20T10:00:00Z`) has `- Stops and pauses: PAUSE GATE 1` and `- Wall-clock time: 45 min`, and `$REPORT` holds no carriage return.
   - `a second run with no new records writes the same report`: LOG6; run, copy `$REPORT` to `$BATS_TEST_TMPDIR/first.md`, run again; `cmp` finds the two files equal.
   - `a plan with no title line is named by its directory`: LOG6; replace plan.md's first line with `# Something else` (`{ printf '# Something else\n'; tail -n +2 "$PLAN/plan.md"; } > "$PLAN/plan.tmp"`, then `mv`). Line 1 of `$REPORT` is `# Run report: demo plan`.
   - `run-report exits 2 with the wrong number of arguments`: with no arguments, and with `"$PLAN" extra`: status 2, `$output` empty, `$stderr` is `error: usage: run-report <plan-dir>`.
   - `run-report exits 2 when <plan-dir> is not a directory`: `$REPO/plans/missing`; status 2, `$output` empty, `$stderr` is `error: not a directory: cygpath-stub [-m] [$REPO/plans/missing]`.
   - `run-report exits 2 outside a git work tree`: `mkdir -p "$BATS_TEST_TMPDIR/plain dir"`; status 2, `$output` empty, `$stderr` is `error: not inside a git work tree: cygpath-stub [-m] [$BATS_TEST_TMPDIR/plain dir]`.
   - `run-report exits 2 when plan.md is missing`: `mkdir -p "$REPO/plans/empty"`; status 2, `$output` empty, `$stderr` is `error: no plan.md in: cygpath-stub [-m] [$REPO/plans/empty]`.
   - `run-report accepts <plan-dir> in both drive-letter forms`: `skip` when `command -v cygpath` fails; LOG6; run with `$(cygpath -m "$PLAN")`, then with `$(cygpath -w "$PLAN")`; each time status 0 and S1 has `- Wall-clock time: 45 min`.
3. Run Verify and confirm it fails.
4. Create `plugins/orcastrat/scripts/run-report`, starting `#!/usr/bin/env bash`, with a header comment in `task-brief`'s style: the usage `run-report <plan-dir>`; that it writes `<plan-dir>/notes/run-report.md` from `notes/run-log.md` (later tasks add their sources to this comment); that it prints the report's absolute path through `print_path` and nothing else; the D55 exits; and "Bash 3.2 compatible." Then source `lib/common` and define `fail()` exactly as `task-brief` does, and check, in this order, each failing with exit 2: argument count isn't 1 → `usage: run-report <plan-dir>`; `[ -d "$plan_dir" ]` fails → `not a directory: <print_path of plan_dir>`; `git -C "$plan_dir" rev-parse --is-inside-work-tree` doesn't print `true` → `not inside a git work tree: <print_path of plan_dir>`; `$plan_dir/plan.md` isn't a file → `no plan.md in: <print_path of plan_dir>`.
5. Set `title` to the text after `# Plan: ` on plan.md's first line that starts with `# Plan: `, carriage return removed; when there is none, to the plan directory's last path component, computed with `task-brief`'s `slug=` line (`plugins/orcastrat/scripts/task-brief:161`). Define `runlog_records()`, which prints one line `L<TAB><line>` for each line of `$plan_dir/notes/run-log.md`, carriage return removed, in file order, and nothing when the file doesn't exist. Set `records=$(runlog_records)`. Later tasks add one function per record kind to this `records=$(...)` list; every record is one line, a one-letter kind, a tab, then tab-separated fields.
6. Define `report_awk`, a single-quoted awk program run as `printf '%s\n' "$records" | awk -F '\t' -v title="$title" "$report_awk"`, which ignores lines whose kind it doesn't know (including an empty line) and has:
   - `function epoch(ts)`: returns -1 unless `ts` matches `^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z$`. Otherwise it takes y, m, d, h, mi, s from `ts` with `substr`, then `if (m <= 2) { y -= 1; m += 12 }`, `days = 365*y + int(y/4) - int(y/100) + int(y/400) + int((153*(m-3)+2)/5) + d - 719469`, and returns `days*86400 + h*3600 + mi*60 + s` (so `1970-01-01T00:00:00Z` gives 0).
   - For each `L` record, the run-log line is `substr($0, 3)`; its words, split on spaces, give the key (word 1) and the UTC (word 2). Keep every line in order in `log_line[1..log_n]`. A `start` line whose UTC has an epoch of 0 or more opens invocation `n+1`: keep its UTC text, its epoch `inv_s[k]`, and no end. An `end` line with a valid UTC, while invocation `n` exists and has no end, closes it: keep its epoch `inv_e[n]`, its mode (word 3) and its reason (the rest of the line after word 3 and one space). Any other `end` line is ignored.
   - `function inv_of(t)`: returns the first k in 1..n with `inv_s[k] <= t` and, when k has an end, `t <= inv_e[k]`, or, when it has none, `t < inv_s[k+1]` if k < n (no upper bound if k = n). It returns 0 when t < 0 or no invocation holds t.
   - `function bullets(k)`: k is an invocation number, or 0 for the plan so far. It prints `- Stops and pauses: <list>` then `- Wall-clock time: <value>`. For k > 0 the list is `<mode> <reason> 1` when k has an end whose mode is `PAUSE` or `STOP`, else `none`; the value is `<int((inv_e[k] - inv_s[k]) / 60)> min` when k has an end, else `unknown`. For k = 0 the list is each distinct `<mode> <reason>` pair of the invocations' `PAUSE` and `STOP` ends, in order of first appearance, as `<mode> <reason> <count>`, joined by `, `, or `none`; the value is the sum of the per-invocation minute values over the invocations with an end, as `<sum> min`, or `unknown` when none has an end. Print every number with `%.0f`.
   - `END`: print `# Run report: <title>` and an empty line; then for k = 1..n, `## Invocation <k>: <its start UTC text>`, an empty line, `bullets(k)` and an empty line; then `## Plan so far`, an empty line and `bullets(0)`. The output ends with the last bullet's newline. Later tasks add bullets above `- Stops and pauses:` and sections after the plan so far, each section preceded by an empty line.
7. Run `mkdir -p "$plan_dir/notes"` (on failure, `fail "cannot create: <print_path of the notes dir>"`), write the awk output to `$plan_dir/notes/run-report.md.tmp`, `mv -f` it to `$plan_dir/notes/run-report.md` (on failure, `fail "cannot write the report: <print_path of the report>"`), then print `print_path "<the absolute notes dir>/run-report.md"`, the absolute notes dir being `$(cd "$plan_dir/notes" && pwd)`, and `exit 0`. Run Verify and confirm all 14 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/run-report.bats` reports 14 tests and no failure.
- The report has one `## Invocation <k>: <start UTC>` section per `start` line and a `## Plan so far` section, each with the stops and pauses and wall-clock bullets, and no generation time.

### M11-T02: run-report counts run-log events and usage

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M11-T01, M11-T07
- Files: `plugins/orcastrat/scripts/run-report`, `tests/orcastrat/run-report.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/run-report.bats`
- Fails first: yes
- Commit: `feat(orcastrat): run-report counts merges, containment, auto-decisions, warnings and usage`

**Objective**

The run report counts merges, containment downgrades, auto-decided questions and leftover-background-work warnings per invocation and for the plan, and adds `## Usage` and `## Model notices` sections (spec §12, §25a item 5; D42, D49, D186, D204–D206).

**Read first**

- plan.md Decisions D204, D205, D206, D212 and D186
- `plugins/orcastrat/scripts/run-report` (whole file)
- `tests/orcastrat/run-report.bats` (whole file)

**Interfaces**

- Consumes: `records lines <kind><TAB><fields>, built by runlog_records (kind L)` (M11-T01)
- Consumes: `report_awk functions epoch(ts), inv_of(t) and bullets(k)` (M11-T01)
- Consumes: `run-report.bats helpers run_script, write_plan, write_log <line>... and section <file> <heading>` (M11-T01)
- Consumes: `usage <UTC> <task or milestone ID> <agent> <total tokens> <duration ms>` (M11-T07)
- Consumes: `merge-resolved <UTC> <task ID>` (M11-T07)
- Consumes: `merge-rerun <UTC> <task ID>` (M11-T07)
- Consumes: `already-integrated <UTC> <task ID>` (existing, `plugins/orcastrat/skills/run/SKILL.md:354`)
- Consumes: `background-warning <UTC> <agent> <task or milestone ID> "<notice text>"` (existing, `plugins/orcastrat/skills/run/SKILL.md:30`)
- Consumes: `model-notice <UTC> <model ID>` (existing, `plugins/orcastrat/skills/run/SKILL.md:136`)
- Consumes: `containment-fallback <UTC> <milestone ID> wave <n>` (existing, `plans/orcastrat-execution/plan.md:286`)
- Consumes: `auto-decided <UTC> <question-id> D<nn>` (existing, `plans/orcastrat-execution/plan.md:306`)
- Produces: `decision_records (kind D)`
- Produces: `run-report bullets Merges, Containment downgrades, Auto-decided questions and Leftover-background-work warnings, and the ## Usage and ## Model notices sections`

**Steps**

1. In `tests/orcastrat/run-report.bats`, in `write_plan`, add the line `- D02: Use the second option. (source: decider)` directly below `- D01: First decision.`. Then add these tests (`S1`, `S2`, `P` and "has" as in M11-T01). The log `LOG15` is:

   ```text
   start 2026-09-20T10:00:00Z plans/demo plan
   usage 2026-09-20T10:05:00Z M01-T01 worker 1000 60000
   usage 2026-09-20T10:10:00Z M01-T01 reviewer 500 30000
   merge-resolved 2026-09-20T10:20:00Z M01-T02
   containment-fallback 2026-09-20T10:25:00Z M01 wave 2
   background-warning 2026-09-20T10:26:00Z worker M01-T03 "1 background task still running"
   end 2026-09-20T10:45:30Z PAUSE GATE
   model-notice 2026-09-21T08:59:00Z claude-sonnet-4-5
   start 2026-09-21T09:00:00Z plans/demo plan
   usage 2026-09-21T09:30:00Z M02 planner 3000 120000
   merge-rerun 2026-09-21T09:40:00Z M02-T01
   already-integrated 2026-09-21T09:41:00Z M02-T02
   auto-decided 2026-09-21T09:50:00Z M02-T03-q1 D02
   auto-decided 2026-09-21T09:55:00Z M02-T04-q1 D09
   end 2026-09-21T11:30:59Z STOP GAP
   ```

   - `run-log events are counted per invocation and for the plan`: LOG15. S1 has `- Merges: 1 resolved, 0 failed (0 rerun, 0 already integrated)`, `- Containment downgrades: 1`, `- Auto-decided questions: 0`, `- Leftover-background-work warnings: 1` and `  - 2026-09-20T10:26:00Z worker M01-T03 "1 background task still running"`. S2 has `- Merges: 0 resolved, 2 failed (1 rerun, 1 already integrated)`, `- Containment downgrades: 0`, `- Auto-decided questions: 2`, `  - M02-T03-q1: D02: Use the second option. (source: decider)`, `  - M02-T04-q1: D09 (not in plan.md)` and `- Leftover-background-work warnings: 0`. P has `- Merges: 1 resolved, 2 failed (1 rerun, 1 already integrated)`, `- Containment downgrades: 1`, `- Auto-decided questions: 2`, both auto-decided lines, `- Leftover-background-work warnings: 1` and the warning line.
   - `usage is summed per invocation and per agent`: LOG15. `section "$REPORT" '## Usage'` prints exactly these lines, in this order:

     ```text
     ## Usage
     - Invocation 1: 1500 tokens, 1 min of agent time
       - worker: 1000 tokens, 1 min
       - reviewer: 500 tokens, 0 min
     - Invocation 2: 3000 tokens, 2 min of agent time
       - planner: 3000 tokens, 2 min
     - Plan so far: 4500 tokens, 3 min of agent time
       - worker: 1000 tokens, 1 min
       - reviewer: 500 tokens, 0 min
       - planner: 3000 tokens, 2 min
     ```

   - `model notices are listed`: LOG15. `section "$REPORT" '## Model notices'` prints exactly `## Model notices` and `- 2026-09-21T08:59:00Z claude-sonnet-4-5`.
   - `with no usage line the usage section says not available`: log `start 2026-09-20T10:00:00Z plans/demo plan`, `end 2026-09-20T10:45:30Z PAUSE GATE`. `section "$REPORT" '## Usage'` prints exactly `## Usage` and `not available`; `section "$REPORT" '## Model notices'` prints exactly `## Model notices` and `None.`.
   - `an invocation with no usage line says not available`: log `start 2026-09-20T10:00:00Z plans/demo plan`, `usage 2026-09-20T10:05:00Z M01-T01 worker 1000 60000`, `end 2026-09-20T10:45:30Z PAUSE GATE`, `start 2026-09-21T09:00:00Z plans/demo plan`, `end 2026-09-21T09:30:00Z PAUSE GATE`. The Usage section prints exactly `## Usage`, `- Invocation 1: 1000 tokens, 1 min of agent time`, `  - worker: 1000 tokens, 1 min`, `- Invocation 2: not available`, `- Plan so far: 1000 tokens, 1 min of agent time`, `  - worker: 1000 tokens, 1 min`.
   - `a line appended after the end line counts in the invocation its time falls in`: log `start 2026-09-20T10:00:00Z plans/demo plan`, `end 2026-09-20T10:45:30Z PAUSE GATE`, `background-warning 2026-09-20T10:40:00Z worker M01-T03 "still running"`, `usage 2026-09-20T10:44:00Z M01 milestone-reviewer 700 6000`, `merge-resolved 2026-09-20T11:00:00Z M01-T05`, `start 2026-09-21T09:00:00Z plans/demo plan`. S1 has `- Leftover-background-work warnings: 1` and `- Merges: 0 resolved, 0 failed (0 rerun, 0 already integrated)`; S2 has `- Leftover-background-work warnings: 0` and `- Merges: 0 resolved, 0 failed (0 rerun, 0 already integrated)`; P has `- Merges: 1 resolved, 0 failed (0 rerun, 0 already integrated)`. The Usage section has `- Invocation 1: 700 tokens, 0 min of agent time` and `- Invocation 2: not available`.
2. Run Verify and confirm it fails.
3. In `plugins/orcastrat/scripts/run-report`, add `decision_records()`, which prints `D<TAB><line without its leading "- ">` for each line of plan.md, carriage return removed, that matches `^- D[0-9]+:`. Add it to the `records=$(...)` list after `runlog_records`, and add `plan.md`'s `- D<nn>:` lines to the header comment's sources. In `report_awk`, keep each `D` record's text by its ID, the text before its first `:`.
4. In `bullets(k)`, directly above the `- Stops and pauses:` bullet, print these, counting a run-log line for k > 0 when `inv_of(epoch(<its UTC>)) == k`, and every such line for k = 0:
   - `- Merges: <r> resolved, <f> failed (<m> rerun, <a> already integrated)`: r counts `merge-resolved` lines, m `merge-rerun` lines, a `already-integrated` lines, and f is m + a.
   - `- Containment downgrades: <n>`: n counts `containment-fallback` lines.
   - `- Auto-decided questions: <n>`, then, for each counted `auto-decided` line in log order, `  - <question-id>: <the D record text for its D ID>`, or `  - <question-id>: <D ID> (not in plan.md)` when there is no such D record. The question ID is word 3 and the D ID word 4.
   - `- Leftover-background-work warnings: <n>`, then, for each counted `background-warning` line in log order, `  - <the line without its leading "background-warning ">`.
5. In `END`, after `bullets(0)`, print an empty line, `## Usage` and an empty line. A `usage` line counts only when its word 5 matches `^[0-9]+$`; words 3 to 6 are the ID, the agent, the tokens and the milliseconds, and milliseconds that aren't a whole number count 0. With no counted `usage` line, print `not available`. Otherwise, for k = 1..n, print `- Invocation <k>: <tokens> tokens, <int(ms / 60000)> min of agent time` over k's counted lines (by `inv_of`), then one line `  - <agent>: <tokens> tokens, <int(ms / 60000)> min` per agent, in order of first appearance among those lines; or `- Invocation <k>: not available` when k has none. Then print the same two kinds of line for all counted lines, starting `- Plan so far: `. Print sums with `%.0f`.
6. After the Usage section, print an empty line, `## Model notices`, an empty line, then `- <the line without its leading "model-notice ">` for each `model-notice` line in log order, or `None.` when there is none.
7. Run Verify and confirm all 20 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/run-report.bats` reports 20 tests and no failure.
- The four new bullets sit directly above `- Stops and pauses:`, and the report ends with the `## Usage` and `## Model notices` sections.

### M11-T03: run-report counts tasks, attempts, resumes, escalations and STUCK tasks

- Kind: change
- Tier: worker-heavy
- Why this tier: fully specified but intricate: a fence-aware task parser applying D84's tier rule, trailer parsing from `git log`, and per-tier counts in two orders.
- Status: done
- Wave: 3
- Depends on: M11-T02
- Files: `plugins/orcastrat/scripts/run-report`, `tests/orcastrat/run-report.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/run-report.bats`
- Fails first: yes
- Commit: `feat(orcastrat): run-report counts tasks, attempts, resumes, escalations and STUCK tasks`

**Objective**

The run report gives tasks done, attempts, resumes and escalations per tier, and the tasks that ended STUCK, per invocation and for the plan, from task blocks, failure logs and trailer commits (spec §12, §25 item 4; D84, D87, D207, D211).

**Read first**

- `plans/orcastrat-execution/notes/M11-decisions.md` section `## D207`, and plan.md Decisions D84, D87 and D211
- `plugins/orcastrat/scripts/next` lines 78–151 (the Milestones-table awk, and the task awk with recover's fence rule)
- `plugins/orcastrat/scripts/recover` lines 98–107 (the Branch ref and the trailer pattern)
- `plugins/orcastrat/scripts/run-report` (whole file)
- `tests/orcastrat/run-report.bats` (whole file)

**Interfaces**

- Consumes: `records lines <kind><TAB><fields>, built by runlog_records (kind L)` (M11-T01)
- Consumes: `report_awk functions epoch(ts), inv_of(t) and bullets(k)` (M11-T01)
- Consumes: `run-report.bats helpers run_script, write_plan, write_log <line>... and section <file> <heading>` (M11-T01)
- Consumes: `run-report bullets Merges, Containment downgrades, Auto-decided questions and Leftover-background-work warnings, and the ## Usage and ## Model notices sections` (M11-T02)
- Consumes: failure-log entry lines `## Attempt <n>`, `- Tier: <tier>`, `- Time: <UTC>`, `- Then: <outcome>` (existing, `plans/orcastrat-execution/plan.md:186`)
- Produces: `task_records (kind T), commit_records (kind C) and failure_records (kind F)`
- Produces: `run-report variables ref and has_ref`
- Produces: `run-report bullets Tasks done, Attempts per tier, Resumes per tier, Escalations per tier and Tasks that ended STUCK`

**Steps**

1. In `tests/orcastrat/run-report.bats`, add three helpers: `write_tasks`, which writes `$PLAN/M01-first.md` with the first block below; `write_failures`, which writes `$PLAN/notes/M01-T02-failures.md` and `$PLAN/notes/M01-T03-failures.md` with the second and third blocks; and `commit_at <date> <subject> <trailer>`, which runs `GIT_COMMITTER_DATE="$1" GIT_AUTHOR_DATE="$1" git -C "$REPO" commit --quiet --allow-empty -m "$2" -m "$3"`.

   ````markdown
   # M01: First

   - Status: in-progress

   ## Tasks

   ### M01-T01: One

   - Tier: worker
   - Status: done

   ### M01-T02: Two

   - Tier: worker
   - Status: done
   - Escalated: worker → worker-heavy (Verify failed)

   ### M01-T03: Three

   - Tier: worker
   - Status: blocked
   - Escalated: worker → worker-heavy (Verify failed)
   - Escalated: worker-heavy → specialist (STUCK: no idea)
   - Blocked: STUCK — reviewer FAIL: x

   ### M01-T04: Four

   - Tier: worker-light
   - Status: done
   - Re-tiered: worker-light → worker (batch b1 pilot M01-T01)

   **Steps**

   1. Write:

      ```markdown
      ### M01-T09: Not a task
      - Tier: worker
      - Status: done
      ```
   ````

   `M01-T02-failures.md`:

   ```markdown
   # M01-T02 failures

   ## Attempt 1

   - Tier: worker
   - Time: 2026-09-20T10:10:00Z
   - Description: Verify failed
   - Then: resumed

   ## Attempt 2

   - Tier: worker
   - Time: 2026-09-20T10:20:00Z
   - Description: Verify failed
   - Then: escalated to worker-heavy
   ```

   `M01-T03-failures.md` has the heading `# M01-T03 failures` and five entries in the same shape, with Tier, Time and Then: `worker`, `2026-09-21T09:10:00Z`, `resumed`; `worker`, `2026-09-21T09:20:00Z`, `escalated to worker-heavy`; `worker-heavy`, `2026-09-21T09:30:00Z`, `resume failed (API error), escalated to specialist`; `specialist`, `2026-09-21T09:40:00Z`, `resumed`; `specialist`, `2026-09-21T09:50:00Z`, `blocked (STUCK)`.

2. Add these tests (`S1`, `S2`, `P` and "has" as in M11-T01). The fixture `F3` is: `write_tasks`, `write_failures`, `commit_at '2026-09-20 10:30:00 +0000' 'chore(plan): M01-T01 done' 'Orcastrat-Task: M01-T01'`, `commit_at '2026-09-20 10:40:00 +0000' 'chore(plan): M01-T02 done' 'Orcastrat-Task: M01-T02'`, `commit_at '2026-09-21 10:00:00 +0000' 'chore(plan): M01-T04 done' 'Orchestratinator-Task: M01-T04'`, and the log `start 2026-09-20T10:00:00Z plans/demo plan`, `end 2026-09-20T10:45:30Z PAUSE GATE`, `start 2026-09-21T09:00:00Z plans/demo plan`, `end 2026-09-21T11:30:59Z STOP STUCK`.
   - `tasks, attempts, resumes, escalations and STUCK are counted per invocation and for the plan`: F3. S1 has `- Tasks done: 2`, `- Attempts per tier: worker 3, worker-heavy 1`, `- Resumes per tier: worker 1`, `- Escalations per tier: worker 1` and `- Tasks that ended STUCK: 0`. S2 has `- Tasks done: 1`, `- Attempts per tier: worker 3, worker-heavy 1, specialist 2`, `- Resumes per tier: worker 1, specialist 1`, `- Escalations per tier: worker 1, worker-heavy 1` and `- Tasks that ended STUCK: 1 (M01-T03)`. P has `- Tasks done: 3`, `- Attempts per tier: worker 6, worker-heavy 2, specialist 2`, `- Resumes per tier: worker 2, specialist 1`, `- Escalations per tier: worker 2, worker-heavy 1` and `- Tasks that ended STUCK: 1 (M01-T03)`.
   - `a done task's tier counts only Escalated lines below its last Blocked line`: no run log and no failure logs; `$PLAN/M01-first.md` has the lines `# M01: First`, empty, `## Tasks`, empty, then task `### M01-T05: Five` with `- Tier: worker`, `- Status: done`, `- Escalated: worker → worker-heavy (a)`, `- Escalated: worker-heavy → specialist (b)`, `- Blocked: STUCK — c`, and task `### M01-T06: Six` with `- Tier: worker`, `- Status: done`, `- Escalated: worker → worker-heavy (d)`, `- Blocked: GAP — e`, `- Escalated: worker → worker-heavy (Verify failed)`. P has `- Tasks done: 2`, `- Attempts per tier: worker 1, worker-heavy 1`, `- Resumes per tier: none`, `- Escalations per tier: none` and `- Tasks that ended STUCK: 0`.
   - `a plan whose Branch doesn't exist has no tasks done per invocation`: F3, then change plan.md's line `- Branch: main` to `- Branch: nope` (`sed` to a temporary file, then `mv`). S1 has `- Tasks done: 0`; P has `- Tasks done: 3`.
3. Run Verify and confirm it fails.
4. In `plugins/orcastrat/scripts/run-report`, add `task_records()`. For each Milestones-table row of plan.md whose ID matches `^M[0-9]+$`, in table order, it takes the file named in the row's last non-empty cell (as `next`'s `milestones_awk` does) and, when that file exists, runs an awk over it that copies `fence_of` and the fence handling from `next`'s `tasks_awk` (`plugins/orcastrat/scripts/next:104-126`), with a comment saying it mirrors recover's fence rule (`plugins/orcastrat/scripts/recover:55-96`), as the copies in `task-brief` and `next` do (D211). For each line `### M<digits>-T<digits>:` outside a fence it prints, at the task's end (the next heading outside a fence, or the end of the file), `T<TAB><task ID><TAB><status><TAB><current tier>`. Only lines outside fences, starting at column 0, count. The status is the value of the task's first `- Status:` line. The current tier follows D84: the starting tier is the word after `→ ` in its first `- Re-tiered:` line, or else the value of its first `- Tier:` line; the counted `- Escalated:` lines are those after its last `- Blocked:` line, or all of them when it has none; the current tier is the word after `→ ` in the last counted `- Escalated:` line, or else the starting tier. "The word after `→ `" is the text after the first `→ ` up to the next space or the end of the line. Values are trimmed and carriage returns removed.
5. Near the top of the script, after the checks, set `branch` and `ref` as `recover` does (`recover:98-99`) and set `has_ref=1` when `git -C "$plan_dir" rev-parse --verify --quiet "$ref^{commit}"` succeeds, else `has_ref=0`. Add `commit_records()`: when `has_ref` is 1, run `git -C "$plan_dir" log "$ref" -E --grep='^(Orcastrat|Orchestratinator)-Task: ' --format='%x01%ct%n%B'` and, through awk, print `C<TAB><committer epoch><TAB><task ID>` for each message line, carriage return removed, that matches `^(Orcastrat|Orchestratinator)-Task: `, the task ID being the rest of the line, trimmed, and the epoch the number on the last line before it that starts with the byte `\001`. Add `failure_records()`: for each existing file `"$plan_dir"/notes/M*-failures.md`, in glob order, the task ID is its base name without `-failures.md`; for each line starting `## Attempt ` it prints, at the entry's end (the next line starting `## `, or the end of the file), `F<TAB><Time><TAB><task ID><TAB><Tier><TAB><Then>`, the three values taken from the entry's first `- Time: `, `- Tier: ` and `- Then: ` lines, trimmed, carriage returns removed, empty when missing. Make the list `records=$(runlog_records; decision_records; task_records; commit_records; failure_records)`, and add the milestone files, the failure logs and the trailer commits on the plan's Branch to the header comment's sources.
6. In `report_awk`, keep the T, C and F records. In `bullets(k)`, directly above the `- Merges:` bullet, print, where for k > 0 a C record counts when `inv_of(<its epoch>) == k` and an F record when `inv_of(epoch(<its Time>)) == k`, and for k = 0 every F record counts:
   - `- Tasks done: <n>`: for k > 0, the number of distinct task IDs among the counted C records; for k = 0, the number of T records whose status is `done`.
   - `- Attempts per tier: <list>`: one per counted F record at its Tier, plus one per task done at the current tier of its T record (for k > 0, each of those distinct task IDs that has a T record with a tier; for k = 0, each T record whose status is `done`).
   - `- Resumes per tier: <list>`: one per counted F record whose Then is exactly `resumed`, at its Tier.
   - `- Escalations per tier: <list>`: one per counted F record whose Then contains `escalated to`, at its Tier.
   - `- Tasks that ended STUCK: <n>`, followed by ` (<task IDs in record order, joined by ", ">)` when n > 0: the counted F records whose Then ends with `blocked (STUCK)`.

   A `<list>` is `<tier> <count>` items joined by `, `: first `worker-mini`, `worker-light`, `worker`, `worker-heavy` and `specialist`, in that order, then any other tier in the order it was first counted, leaving out tiers with no count and F records with an empty Tier; it is `none` when empty.
7. Run Verify and confirm all 23 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/run-report.bats` reports 23 tests and no failure.
- A fenced task heading is never counted, both trailers count, and a missing Branch gives no tasks done per invocation without an error.

### M11-T04: run-report counts review findings per milestone

- Kind: change
- Tier: worker
- Status: todo
- Wave: 4
- Depends on: M11-T03
- Files: `plugins/orcastrat/scripts/run-report`, `tests/orcastrat/run-report.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/run-report.bats`
- Fails first: yes
- Commit: `feat(orcastrat): run-report counts review findings per milestone`

**Objective**

The run report gives, per milestone, the advisory findings and the blocking candidates the validator confirmed or downgraded, per invocation and for the plan, counting only D182-shaped finding lines (spec §12; D182, D207).

**Read first**

- `plans/orcastrat-execution/notes/M11-decisions.md` section `## D207`, and plan.md Decision D182
- `plugins/orcastrat/scripts/run-report` (whole file)
- `tests/orcastrat/run-report.bats` (whole file)

**Interfaces**

- Consumes: `records lines <kind><TAB><fields>, built by runlog_records (kind L)` (M11-T01)
- Consumes: `report_awk functions epoch(ts), inv_of(t) and bullets(k)` (M11-T01)
- Consumes: `run-report.bats helpers run_script, write_plan, write_log <line>... and section <file> <heading>` (M11-T01)
- Consumes: `run-report bullets Merges, Containment downgrades, Auto-decided questions and Leftover-background-work warnings, and the ## Usage and ## Model notices sections` (M11-T02)
- Consumes: `run-report variables ref and has_ref` (M11-T03)
- Consumes: `run-report bullets Tasks done, Attempts per tier, Resumes per tier, Escalations per tier and Tasks that ended STUCK` (M11-T03)
- Produces: `review_records (kind R)`
- Produces: `run-report bullet Review findings`

**Steps**

1. In `tests/orcastrat/run-report.bats`, add these tests (`S1`, `S2`, `P` and "has" as in M11-T01). The fixture `F4` writes the three files below, then runs `git -C "$REPO" add -- "plans/demo plan/notes/M01-review.md" "plans/demo plan/notes/M01-plan-review.md"` and `GIT_COMMITTER_DATE='2026-09-20 10:35:00 +0000' GIT_AUTHOR_DATE='2026-09-20 10:35:00 +0000' git -C "$REPO" commit --quiet -m 'chore(plan): review M01'`, leaving `notes/reviews/M02-T01-attempt1.md` uncommitted, and writes the log `start 2026-09-20T10:00:00Z plans/demo plan`, `end 2026-09-20T10:45:30Z PAUSE GATE`, `start 2026-09-21T09:00:00Z plans/demo plan`, `end 2026-09-21T11:30:59Z STOP GAP`.

   `$PLAN/notes/M01-review.md`:

   ```markdown
   # M01 review

   ## Blocking

   - [90/85] missing-test: src/a.sh:3 — no test (M01-T01)

   ## Advisory

   - [60] naming: src/a.sh:9 — unclear name (M01-T01)
   - [85/40] style: src/b.sh:2 — long line (M01-T02) — validator: not a rule
   - `src/c.sh:1` — old-style finding (M01-T02)
   ```

   `$PLAN/notes/M01-plan-review.md`:

   ```markdown
   # M01 plan review

   ## Issues

   1. [80/90] coverage: M01 — check 3 — row unmapped

   ## Advisory

   1. [50] wording: M01-T02 — check 8 — vague
   ```

   `$PLAN/notes/reviews/M02-T01-attempt1.md`:

   ```markdown
   # M02-T01 review

   ## Blocking

   None.

   ## Advisory

   - [70] error-handling: src/d.sh:4 — unchecked exit (M02-T01)
   - [90/none] security: src/d.sh:8 — unsafe eval (M02-T01) — validator: no score
   ```

   - `review findings are counted per milestone, per invocation and for the plan`: F4. S1 has `- Review findings:` and `  - M01: 3 advisory, 2 confirmed, 1 downgraded`, and no line starting `  - M02:`. S2 has `- Review findings:` and `  - M02: 2 advisory, 0 confirmed, 1 downgraded`, and no line starting `  - M01:`. P has both milestone lines, the M01 line before the M02 line.
   - `review lines in other shapes are not counted`: log `start 2026-09-20T10:00:00Z plans/demo plan`; the only review note is an uncommitted `$PLAN/notes/M03-review.md` with the lines `## Blocking`, empty, ``- `src/a.sh:3` — missing test (M03-T01, D12)``, empty, `## Advisory`, empty, `- [high] naming: src/b.sh:1 — vague (M03-T01)`. S1 and P each have `- Review findings: none`.
   - `the bullets come in spec order`: log `start 2026-09-20T10:00:00Z plans/demo plan`, `end 2026-09-20T10:45:30Z PAUSE GATE`. For both S1 and P, piping the section through `grep -o '^- [^:]*'` prints exactly these lines, in this order: `- Tasks done`, `- Attempts per tier`, `- Resumes per tier`, `- Escalations per tier`, `- Tasks that ended STUCK`, `- Merges`, `- Containment downgrades`, `- Auto-decided questions`, `- Review findings`, `- Leftover-background-work warnings`, `- Stops and pauses`, `- Wall-clock time`.
2. Run Verify and confirm it fails.
3. In `plugins/orcastrat/scripts/run-report`, add `review_records()`. When `has_ref` is 1, first set `added` to the output of `git -C "$plan_dir" log "$ref" --diff-filter=A --relative --name-only --format=%x01%ct -- notes` piped through an awk that keeps, for each path line (a non-empty line not starting with the byte `\001`, relative to the plan directory, such as `notes/M01-review.md`), the epoch of the last `\001<epoch>` line above it, overwriting earlier values so the oldest adding commit wins, and prints `<path><TAB><epoch>` per path; when `has_ref` is 0, `added` is empty.
4. Still in `review_records()`, run one awk from inside the plan directory (`cd "$plan_dir"` in a subshell) over each existing file `notes/M*-review*.md` and `notes/reviews/M*.md`, in that glob order, passing `added` with `-v` and splitting it into a lookup in `BEGIN`. For each file, with carriage returns removed: its milestone is the `M` and digits at the start of its base name; a line `## Blocking` or `## Issues` starts the blocking section, `## Advisory` the advisory section, and any other line starting `## ` ends both. A **finding line** matches the ERE `^(- |[0-9]+\. )\[[0-9]+(/([0-9]+|none))?\] [a-z0-9][a-z0-9-]*: `. Count advisory = finding lines in the advisory section; confirmed = finding lines in the blocking section that also match `^(- |[0-9]+\. )\[[0-9]+/[0-9]+\] `; downgraded = finding lines in the advisory section containing ` — validator: `. At the file's end, print `R<TAB><its added epoch, or empty><TAB><milestone><TAB><advisory><TAB><confirmed><TAB><downgraded>`. Append `review_records` to the `records=$(...)` list and add the review notes to the header comment's sources.
5. In `report_awk`, keep the R records. An R record with an empty epoch belongs to invocation n (to none when n is 0); any other to `inv_of(<its epoch>)`. For k = 0 every R record counts. In `bullets(k)`, directly below the auto-decided lines and above the `- Leftover-background-work warnings:` bullet, sum the counted R records per milestone and print `- Review findings:` followed by `  - <milestone>: <advisory> advisory, <confirmed> confirmed, <downgraded> downgraded` for each milestone whose three sums aren't all 0, in ascending order of the number after its `M`; print `- Review findings: none` when no milestone qualifies.
6. Run Verify and confirm all 26 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/run-report.bats` reports 26 tests and no failure.
- Only D182-shaped lines are counted, and an uncommitted review note counts in the last invocation.

### M11-T05: run-report lists instruction suggestions

- Kind: change
- Tier: worker
- Status: todo
- Wave: 5
- Depends on: M11-T04
- Files: `plugins/orcastrat/scripts/run-report`, `tests/orcastrat/run-report.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/run-report.bats`
- Fails first: yes
- Commit: `feat(orcastrat): run-report lists instruction suggestions`

**Objective**

The run report ends with a `## Suggestions` section listing each suggestion in `notes/instruction-suggestions.md` with its kind and target (spec §19 item 2; D209).

**Read first**

- `plans/orcastrat-execution/notes/M11-decisions.md` section `## D209`
- `plugins/orcastrat/scripts/run-report` (whole file)
- `tests/orcastrat/run-report.bats` (whole file)

**Interfaces**

- Consumes: `records lines <kind><TAB><fields>, built by runlog_records (kind L)` (M11-T01)
- Consumes: `run-report.bats helpers run_script, write_plan, write_log <line>... and section <file> <heading>` (M11-T01)
- Consumes: `run-report bullets Merges, Containment downgrades, Auto-decided questions and Leftover-background-work warnings, and the ## Usage and ## Model notices sections` (M11-T02)
- Produces: `suggestion_records (kind S)`
- Produces: `run-report section ## Suggestions`

**Steps**

1. In `tests/orcastrat/run-report.bats`, add these tests, each with the log `start 2026-09-20T10:00:00Z plans/demo plan`, `end 2026-09-20T10:45:30Z PAUSE GATE`:
   - `suggestions are listed with their kind and target`: write `$PLAN/notes/instruction-suggestions.md` as below. `section "$REPORT" '## Suggestions'` prints exactly `## Suggestions`, `- missing-test: hook, target CLAUDE.md`, `- naming: rule, target CLAUDE.md`.

     ````markdown
     # Instruction suggestions

     ## missing-test

     - Milestones: M01 M02
     - Kind: hook
     - Target: CLAUDE.md
     - Leanness: not flagged
     - Draft:

     ```text
     ## not-a-heading
     A PreToolUse hook that runs the tests.
     ```

     ## naming

     - Milestones: M02 M03
     - Kind: rule
     - Target: CLAUDE.md
     - Leanness: flagged; a hook or skill is preferred
     - Draft:

     ```text
     Name shell variables in lower_snake_case.
     ```
     ````

   - `with no suggestions file the section says None.`: no `instruction-suggestions.md`. `section "$REPORT" '## Suggestions'` prints exactly `## Suggestions` and `None.`.
   - `the report's sections come in order`: `grep '^## ' "$REPORT"` prints exactly `## Invocation 1: 2026-09-20T10:00:00Z`, `## Plan so far`, `## Usage`, `## Model notices`, `## Suggestions`.
2. Run Verify and confirm it fails.
3. In `plugins/orcastrat/scripts/run-report`, add `suggestion_records()`: when `$plan_dir/notes/instruction-suggestions.md` exists, an awk over it, carriage returns removed, that treats a line whose text after leading spaces and tabs starts with three backticks as opening or closing a fence, and outside fences starts a suggestion at each line `## <category>`; the suggestion's kind and target are the values after the first `- Kind: ` and `- Target: ` lines inside it, trimmed, empty when missing. At the suggestion's end (the next `## ` line outside a fence, or the end of the file) it prints `S<TAB><category><TAB><kind><TAB><target>`. Append it to the `records=$(...)` list and add the suggestions file to the header comment's sources.
4. In `report_awk`'s `END`, after the Model notices section, print an empty line, `## Suggestions`, an empty line, then `- <category>: <kind>, target <target>` for each S record in order, or `None.` when there is none.
5. Run Verify and confirm all 29 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/run-report.bats` reports 29 tests and no failure.
- A `## ` line inside a fenced draft is never taken for a suggestion.

### M11-T06: Add suggest-check for recurring finding categories

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/scripts/suggest-check`, `tests/orcastrat/suggest-check.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/suggest-check.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add suggest-check for recurring finding categories`

**Objective**

`suggest-check <plan-dir>` prints one line `<category> <milestone IDs>` for each finding category used in the milestone reviews or per-task reviews of two or more milestones that `notes/instruction-suggestions.md` doesn't suggest yet, or `OK` (spec §19; D209, D213).

**Read first**

- `docs/orcastrat-execution-spec.md` §19
- `plans/orcastrat-execution/notes/M11-decisions.md` section `## D209`, and plan.md Decisions D55, D182, D209 and D213
- `plugins/orcastrat/scripts/task-brief` lines 1–38 (the pattern: header comment, `fail`, argument checks)
- `tests/orcastrat/task-brief.bats` lines 1–20 and 225–277 (setup, `run_script`, the drive-letter and error tests), and `tests/orcastrat/test_helper.bash`

**Interfaces**

- Consumes: `print_path <path>` (existing, `plugins/orcastrat/scripts/lib/common:8`)
- Consumes: `make_fixture_repo <dir>` (existing, `tests/orcastrat/test_helper.bash:9`)
- Consumes: `make_cygpath_stub <dir>` (existing, `tests/orcastrat/test_helper.bash:25`)
- Produces: `suggest-check <plan-dir>`
- Produces: `suggest-check output: one line <category> <milestone IDs> per new recurring category, or OK`

**Steps**

1. Create `tests/orcastrat/suggest-check.bats`, first line `bats_require_minimum_version 1.5.0`. `setup()` loads `test_helper`, sets `SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/suggest-check"`, `REPO="$BATS_TEST_TMPDIR/fixture repo"`, runs `make_fixture_repo "$REPO"` and `make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"`, sets `PLAN="$REPO/plans/demo plan"`, and runs `mkdir -p "$PLAN/notes/reviews"`. Add `run_script` exactly as in `task-brief.bats`, and a helper `write_reviews` that writes these six files (each block below is one file, under `$PLAN/notes/`):

   `M01-review.md`:

   ```markdown
   # M01 review

   ## Blocking

   - [85/90] missing-test: src/a.sh:3 — no test for the error path (M01-T01)

   ## Advisory

   - [40] naming: src/a.sh:9 — unclear name (M01-T01)
   - [90/30] security: src/a.sh:12 — eval of input (M01-T02) — validator: not reachable
   ```

   `reviews/M01-T02-attempt1.md`:

   ```markdown
   ## Blocking

   None.

   ## Advisory

   - [50] security: src/b.sh:4 — unquoted variable (M01-T02)
   ```

   `M02-review-2.md`:

   ```markdown
   ## Blocking

   None.

   ## Advisory

   - [60] missing-test: src/c.sh:2 — no test (M02-T01)
   ```

   `reviews/M03-T01-attempt2.md`:

   ```markdown
   ## Advisory

   - [70/none] naming: src/d.sh:1 — vague (M03-T01) — validator: no score
   ```

   `M04-plan-review.md`:

   ```markdown
   ## Issues

   1. [80] missing-test: M04-T01 — check 6 — no failing test
   ```

   `M05-review.md`:

   ```markdown
   ## Advisory

   - `src/e.sh:5` — security: old-style finding (M05-T01)
   ```

2. Add these tests, each checking status 0 and an empty `$stderr` unless it says otherwise:
   - `recurring categories are printed with their milestones`: `write_reviews`; `$output` is exactly the two lines `missing-test M01 M02` and `naming M01 M03`.
   - `plan reviews don't count toward a recurring category`: only two files: `M01-review.md` with the lines `## Blocking`, empty, `- [90/85] security: src/a.sh:1 — eval (M01-T01)`, and `M02-plan-review.md` with the lines `## Issues`, empty, `1. [80] security: M02-T01 — check 2 — unsourced`, empty, `## Advisory`, empty, `- [80] security: M02-T02 — check 4 — unsourced`. `$output` is `OK`.
   - `a category already suggested is not printed again`: `write_reviews`, and `$PLAN/notes/instruction-suggestions.md` with the lines `# Instruction suggestions`, empty, `## naming`, empty, `- Kind: rule`, empty, then a line of three backticks followed by `text`, the line `## missing-test`, and a line of three backticks. `$output` is `missing-test M01 M02`.
   - `every recurring category already suggested prints OK`: `write_reviews`, and the suggestions file with the lines `## missing-test` and `## naming`. `$output` is `OK`.
   - `no review notes prints OK`: nothing in `$PLAN/notes`; `$output` is `OK`.
   - `suggest-check accepts carriage returns`: `write_reviews`, then rewrite every file under `$PLAN/notes` with `\r\n` line endings (`awk '{ printf "%s\r\n", $0 }'` to a temporary file, then `mv`); `$output` is the same two lines as the first test.
   - `suggest-check exits 2 with the wrong number of arguments`: with no arguments and with `"$PLAN" extra`: status 2, `$output` empty, `$stderr` is `error: usage: suggest-check <plan-dir>`.
   - `suggest-check exits 2 when <plan-dir> is not a directory`: `$REPO/plans/missing`; status 2, `$output` empty, `$stderr` is `error: not a directory: cygpath-stub [-m] [$REPO/plans/missing]`.
   - `suggest-check exits 2 outside a git work tree`: `mkdir -p "$BATS_TEST_TMPDIR/plain dir"`; status 2, `$output` empty, `$stderr` is `error: not inside a git work tree: cygpath-stub [-m] [$BATS_TEST_TMPDIR/plain dir]`.
   - `suggest-check accepts <plan-dir> in both drive-letter forms`: `skip` when `command -v cygpath` fails; `write_reviews`; with `$(cygpath -m "$PLAN")` and with `$(cygpath -w "$PLAN")`, `$output` is the same two lines as the first test.
3. Run Verify and confirm it fails.
4. Create `plugins/orcastrat/scripts/suggest-check`, starting `#!/usr/bin/env bash`, with a header comment in `task-brief`'s style (usage `suggest-check <plan-dir>`, what it reads and prints, the D55 exits, "Bash 3.2 compatible."). Source `lib/common` and define `fail()` exactly as `task-brief` does, then check, in this order, each failing with exit 2: argument count isn't 1 → `usage: suggest-check <plan-dir>`; not a directory → `not a directory: <print_path of plan_dir>`; `git -C "$plan_dir" rev-parse --is-inside-work-tree` doesn't print `true` → `not inside a git work tree: <print_path of plan_dir>`.
5. Collect `<category> <milestone>` pairs from the review files: each existing file `"$plan_dir"/notes/M*-review*.md` whose base name matches the ERE `^M[0-9]+-review(-[0-9]+)?\.md$` (so plan reviews are left out), its milestone being the base name up to its first `-`; and each existing file `"$plan_dir"/notes/reviews/M*-T*.md`, its milestone being the base name up to `-T`, skipped unless that matches `^M[0-9]+$`. For each such file, an awk prints `<category> <milestone>` for each line, carriage return removed, that matches the ERE `^- \[[0-9]+(/([0-9]+|none))?\] [a-z0-9][a-z0-9-]*: `, the category being the text between the first `] ` and the next `: `.
6. Collect the categories already suggested: when `"$plan_dir"/notes/instruction-suggestions.md` exists, the text after `## ` of each line starting `## `, carriage return removed, outside fences, a line whose text after leading spaces and tabs starts with three backticks opening or closing a fence. Then pipe the pairs through `LC_ALL=C sort -u` into an awk that, for each category with two or more milestones that isn't already suggested, prints `<category> <milestone> <milestone> ...`, in that sorted order; print `OK` when it prints no line. Exit 0.
7. Run Verify and confirm all 10 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/suggest-check.bats` reports 10 tests and no failure.
- Plan reviews, old-shape lines and fenced headings in the suggestions file never count.

### M11-T07: run logs usage lines and merge outcomes

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats && f=plugins/orcastrat/skills/run/SKILL.md && grep -qF 'usage <UTC> <task or milestone ID> <agent> <total tokens> <duration ms>' "$f" && grep -qF 'merge-resolved <UTC> <task ID>' "$f" && grep -qF 'merge-rerun <UTC> <task ID>' "$f" && grep -qF 'Usage is display only' "$f"`
- Fails first: no (skill text with no test of its own; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run logs usage lines and merge outcomes`

**Objective**

`run` notes a `usage` line for every agent whose completion notice reports a token count, and `merge-resolved` and `merge-rerun` lines in a parallel wave, and appends them to the run log as it does `background-warning` lines (spec §12, §1.5, §25a item 5; D81, D204, D205).

**Read first**

- plan.md Decisions D81, D204 and D205
- `plugins/orcastrat/skills/run/SKILL.md` section `## Operating rules for long runs`, the bullet starting `- **After every agent returns**`
- `plugins/orcastrat/skills/run/SKILL.md` section `### 3e. Parallel wave`, items 8 and 11

**Interfaces**

- Consumes: `background-warning <UTC> <agent> <task or milestone ID> "<notice text>"` (existing, `plugins/orcastrat/skills/run/SKILL.md:30`)
- Produces: `usage <UTC> <task or milestone ID> <agent> <total tokens> <duration ms>`
- Produces: `merge-resolved <UTC> <task ID>`
- Produces: `merge-rerun <UTC> <task ID>`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, replace the whole line that starts `- **After every agent returns**` with this line:

   ```text
   - **After every agent returns** (a worker, the reviewer, a scout, the planner, the plan-reviewer, the milestone-reviewer, or any other agent), read its completion notice. If the notice reports background work still running, stop that agent's task with the Stop Task tool. If Stop Task fails, note the line `background-warning <UTC> <agent> <task or milestone ID> "<notice text>"`, and continue. If the notice reports a token count, note the line `usage <UTC> <task or milestone ID> <agent> <total tokens> <duration ms>`, with the agent's name without `orcastrat:`, the notice's total token count, and its duration in milliseconds; the ID is the task ID for a worker, the per-task reviewer, the merger and a validator of a task's review, and the milestone ID for any other agent. A notice with no token count gets no `usage` line. Usage is display only: nothing you do waits, pauses or stops on it. In every line you note, `<UTC>` is the current UTC time from `date -u +%Y-%m-%dT%H:%M:%SZ`. Append each noted line (these two, and the `merge-resolved` and `merge-rerun` lines of 3e) to `<plan dir>/notes/run-log.md` just before your next commit, after any scope check or reset that comes before that commit, and include it in that commit. Never kill a process by PID.
   ```

2. In section `### 3e. Parallel wave`, item 8, replace `Otherwise the task is integrated.` with ``Otherwise the task is integrated: note the line `merge-resolved <UTC> <task ID>` (see **After every agent returns**).``
3. In item 11, second bullet, replace `Otherwise rerun it through the serial wave (**3d**) from item 1,` with ``Otherwise note the line `merge-rerun <UTC> <task ID>` (see **After every agent returns**), and rerun it through the serial wave (**3d**) from item 1,``
4. Run Verify.

**Done when**

- The Verify command exits 0.
- Nothing else in the file changed.

### M11-T08: run writes the run report at every Pause, Stop and completion

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M11-T01, M11-T07
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats && f=plugins/orcastrat/skills/run/SKILL.md && grep -qF 'scripts/run-report" "<plan dir>"' "$f" && grep -cF 'and write the **run report** (see Definitions)' "$f" | grep -qx 3 && grep -qF 'that line and the run report included' "$f"`
- Fails first: no (skill text with no test of its own; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run writes the run report at every Pause, Stop and completion`

**Objective**

`run` appends its noted run-log lines and runs `run-report` just after `run-state end` in Pause, Stop and completion, commits the report with that commit, and never lets a failed report start another Stop (spec §12; D142, D208, D212).

**Read first**

- plan.md Decisions D142, D208 and D212
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions`, the **Scripts** bullet and the bullet starting `- **Brief** of a task:`
- `plugins/orcastrat/skills/run/SKILL.md` sections `## 4. Finish the plan`, `## Pause` and `## Stop`

**Interfaces**

- Consumes: `run-report <plan-dir>` (M11-T01)
- Produces: `**Run report** in plugins/orcastrat/skills/run/SKILL.md`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `## Definitions`, directly below the line that starts `- **Brief** of a task:`, insert:

   ```text
   - **Run report**: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-report" "<plan dir>"`. It writes `<plan dir>/notes/run-report.md` from the plan files, `notes/run-log.md` and git history, and prints only that file's path. Don't read the report. Write it only just after `run-state end` has run, in **Pause**, **Stop** or section 4. Unlike the other scripts, an exit 2 here never goes to **Stop**: quote its `error:` line in the report you give the user, and go on. The report file goes into the same commit as the other plan files; in a serial **Stop** that leaves the plan files uncommitted, it stays uncommitted with them.
   ```

2. In three places, directly after the sentence that ends ``appends an `end` line to `<plan dir>/notes/run-log.md`.``, add one space and the sentence ``Then append the run-log lines you have noted (see **After every agent returns**), and write the **run report** (see Definitions).``: in `## 4. Finish the plan` item 2 (where that sentence starts `it deletes the active-run marker`), in `## Pause` item 1, and in `## Stop` item 1.
3. In `## Pause` item 2, replace `Commit the pending plan-file changes, that line included:` with `Commit the pending plan-file changes, that line and the run report included:`.
4. In `## Stop` item 2, replace ``a blocked task's report and failure log, and that `end` line)`` with ``a blocked task's report and failure log, that `end` line, and the run report)``.
5. In `## 4. Finish the plan` item 3, replace `, and the commit range for this run.` with ``, the commit range for this run, and the path `run-report` printed.``
6. Run Verify.

**Done when**

- The Verify command exits 0.
- Finish item 2, Pause item 1 and Stop item 1 each append the noted lines and write the run report right after `run-state end`, and still say that a Pause or Stop before 2c item 6 skips the step.
- Nothing else in the file changed.

### M11-T09: run suggests a rule or hook for recurring finding categories

- Kind: change
- Tier: worker
- Status: done
- Wave: 3
- Depends on: M11-T06, M11-T08
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats && f=plugins/orcastrat/skills/run/SKILL.md && grep -qF 'scripts/suggest-check" "<plan dir>"' "$f" && grep -cF 'notes/instruction-suggestions.md' "$f" | grep -qx 3 && grep -qF -- '- Target: CLAUDE.md' "$f" && grep -qF 'Never apply a suggestion' "$f"`
- Fails first: no (skill text with no test of its own; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run suggests a rule or hook for recurring finding categories`

**Objective**

At the end of each milestone, before its completion commit, `run` runs `suggest-check` and appends one drafted CLAUDE.md rule or hook suggestion per recurring category to `notes/instruction-suggestions.md`, noting leanness, and never applies it (spec §19; D209, D213).

**Read first**

- `docs/orcastrat-execution-spec.md` §19
- `plans/orcastrat-execution/notes/M11-decisions.md` section `## D209`, and plan.md Decisions D209 and D213
- `plugins/orcastrat/skills/run/SKILL.md`: the paragraph starting `You are the orchestrator.`, and section `### 3f. Finish the milestone` item 7
- `plugins/orcastrat/reference/instruction-review.md` section `## 3. Write the review` (the `## Findings` line format)

**Interfaces**

- Consumes: `suggest-check <plan-dir>` (M11-T06)
- Consumes: `suggest-check output: one line <category> <milestone IDs> per new recurring category, or OK` (M11-T06)
- Produces: `3f item 7's suggestion step in plugins/orcastrat/skills/run/SKILL.md`
- Produces: `instruction-suggestions.md section: ## <category>, - Milestones:, - Kind:, - Target:, - Leanness:, - Draft: and a text fence`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, in the paragraph starting `You are the orchestrator.`, replace ``(a task's failure log, `notes/run-log.md`, and the review reports`` with ``(a task's failure log, `notes/run-log.md`, `notes/instruction-suggestions.md`, and the review reports``.
2. In section `### 3f. Finish the milestone`, replace the whole line ``7. Set the milestone to `done` in its file and in the plan.md table. Commit: `chore(plan): complete <ID>`.`` with these lines:

   ```text
   7. **Suggestions, then completion.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/suggest-check" "<plan dir>"`. It prints `OK`, or one line `<category> <milestone IDs>` for each finding category that the reviews of two or more milestones use and that `<plan dir>/notes/instruction-suggestions.md` has no suggestion for yet. For each such line, in order, add one suggestion:
      - Read that category's findings, and nothing else of the review notes: Grep `<plan dir>/notes` for the pattern `\] <category>: `, output mode content.
      - Find whether `CLAUDE.md` is flagged for leanness. With no `.orcastrat/instructions/review.md`, it isn't. Otherwise Grep that file for `^## ` and for ``^- `CLAUDE\.md:[0-9]`` with line numbers: it is flagged when a match of the second pattern lies below the `## Findings` line and above the next `## ` line.
      - Its kind is `hook` when the rule must hold every time and a script can check it, otherwise `rule`. When `CLAUDE.md` is flagged, its kind is `hook` whenever a script can check the rule.
      - Draft its wording from those findings: for a `rule`, the lines to add to `CLAUDE.md`, as a short instruction; for a `hook`, the event it runs on, what its script checks, and what it does when the check fails.
      - Append it to `<plan dir>/notes/instruction-suggestions.md`, first writing the line `# Instruction suggestions` and an empty line when the file doesn't exist: the heading `## <category>`, an empty line, the lines `- Milestones: <the milestone IDs as suggest-check printed them>`, `- Kind: rule` or `- Kind: hook`, `- Target: CLAUDE.md`, `- Leanness: flagged; a hook or skill is preferred` or `- Leanness: not flagged`, and `- Draft:`, then an empty line, the draft in a code fence whose info string is `text`, and an empty line.

      Never apply a suggestion: don't edit `CLAUDE.md`, any other instruction file, or any hook. Then set the milestone to `done` in its file and in the plan.md table, and commit: `git add -A`, then `git commit -m "chore(plan): complete <ID>"`, so the commit carries any new suggestion.
   ```

3. Run Verify.

**Done when**

- The Verify command exits 0.
- 3f item 7 runs `suggest-check`, appends one section per printed category in D209's shape, and then makes the `complete <ID>` commit; items 8 and 9 keep their numbers.
- Nothing else in the file changed.

### M11-T10: Name the run report and suggestions in the plan format

- Kind: change
- Tier: worker
- Status: todo
- Wave: 4
- Depends on: none
- Files: `plugins/orcastrat/reference/plan-format.md`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats && grep -qF 'the run log (run-log.md), the run report (run-report.md), and instruction suggestions (instruction-suggestions.md)' plugins/orcastrat/reference/plan-format.md`
- Fails first: no (reference text with no test of its own; the Verify grep fails until the edit is made)
- Commit: `docs(orcastrat): name the run report and suggestions in the plan format`

**Objective**

The plan format's directory listing names `notes/run-report.md` and `notes/instruction-suggestions.md` among the notes files (spec §1.2, §12, §19 item 2).

**Read first**

- `plugins/orcastrat/reference/plan-format.md` section `## Directory` (the `notes/` line)

**Interfaces**

- Consumes: none
- Produces: `run-report.md and instruction-suggestions.md in the plan format's notes/ line`

**Steps**

1. In `plugins/orcastrat/reference/plan-format.md`, replace `, and the run log (run-log.md)` with `, the run log (run-log.md), the run report (run-report.md), and instruction suggestions (instruction-suggestions.md)`.
2. Run Verify.

**Done when**

- The Verify command exits 0.
- Nothing else in the file changed.
