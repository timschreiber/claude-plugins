bats_require_minimum_version 1.5.0

setup() {
  load test_helper
  SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/run-report"
  REPO="$BATS_TEST_TMPDIR/fixture repo"
  make_fixture_repo "$REPO"
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  PLAN="$REPO/plans/demo plan"
  REPORT="$PLAN/notes/run-report.md"
  mkdir -p "$PLAN/notes"
  write_plan

  LOG6=(
    "start 2026-09-20T10:00:00Z plans/demo plan"
    "end 2026-09-20T10:45:30Z PAUSE GATE"
    "start 2026-09-21T09:00:00Z plans/demo plan"
    "end 2026-09-21T11:30:59Z STOP GAP"
    "start 2026-09-22T08:00:00Z plans/demo plan"
    "end 2026-09-22T08:10:00Z PAUSE GATE"
  )

  LOG15=(
    "start 2026-09-20T10:00:00Z plans/demo plan"
    "usage 2026-09-20T10:05:00Z M01-T01 worker 1000 60000"
    "usage 2026-09-20T10:10:00Z M01-T01 reviewer 500 30000"
    "merge-resolved 2026-09-20T10:20:00Z M01-T02"
    "containment-fallback 2026-09-20T10:25:00Z M01 wave 2"
    "background-warning 2026-09-20T10:26:00Z worker M01-T03 \"1 background task still running\""
    "end 2026-09-20T10:45:30Z PAUSE GATE"
    "model-notice 2026-09-21T08:59:00Z claude-sonnet-4-5"
    "start 2026-09-21T09:00:00Z plans/demo plan"
    "usage 2026-09-21T09:30:00Z M02 planner 3000 120000"
    "merge-rerun 2026-09-21T09:40:00Z M02-T01"
    "already-integrated 2026-09-21T09:41:00Z M02-T02"
    "auto-decided 2026-09-21T09:50:00Z M02-T03-q1 D02"
    "auto-decided 2026-09-21T09:55:00Z M02-T04-q1 D09"
    "end 2026-09-21T11:30:59Z STOP GAP"
  )
}

# run_script <args...>: runs run-report with the stub cygpath first on PATH,
# keeping stderr apart from stdout.
run_script() {
  run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
}

# write_plan: writes $PLAN/plan.md and $PLAN/M01-first.md.
write_plan() {
  printf '%s\n' \
    '# Plan: Demo' \
    '' \
    '- Branch: main' \
    '- Status: in-progress' \
    '' \
    '## Milestones' \
    '' \
    '| ID | Title | Status | File |' \
    '|---|---|---|---|' \
    '| M01 | First | in-progress | M01-first.md |' \
    '' \
    '## Decisions' \
    '' \
    '- D01: First decision.' \
    '- D02: Use the second option. (source: decider)' \
    '' \
    '## Open questions' \
    '' \
    'None.' \
    > "$PLAN/plan.md"
  printf '%s\n' \
    '# M01: First' \
    '' \
    '- Status: in-progress' \
    '' \
    '## Tasks' \
    > "$PLAN/M01-first.md"
}

# write_log <line>...: writes each argument as one line of
# $PLAN/notes/run-log.md, replacing the file.
write_log() {
  printf '%s\n' "$@" > "$PLAN/notes/run-log.md"
}

# section <file> <heading>: prints the non-empty lines from the line equal to
# <heading> through the line before the next line starting "## ".
section() {
  local file="$1" heading="$2"
  awk -v heading="$heading" '
    $0 == heading { found = 1 }
    found {
      if ($0 ~ /^## / && $0 != heading) exit
      if ($0 != "") print
    }
  ' "$file"
}

# write_tasks: writes $PLAN/M01-first.md with four tasks (M01-T01..M01-T04)
# exercising tier, re-tiering and escalation/blocked combinations, plus a
# fenced task heading that must not be counted.
write_tasks() {
  printf '%s\n' \
    '# M01: First' \
    '' \
    '- Status: in-progress' \
    '' \
    '## Tasks' \
    '' \
    '### M01-T01: One' \
    '' \
    '- Tier: worker' \
    '- Status: done' \
    '' \
    '### M01-T02: Two' \
    '' \
    '- Tier: worker' \
    '- Status: done' \
    '- Escalated: worker → worker-heavy (Verify failed)' \
    '' \
    '### M01-T03: Three' \
    '' \
    '- Tier: worker' \
    '- Status: blocked' \
    '- Escalated: worker → worker-heavy (Verify failed)' \
    '- Escalated: worker-heavy → specialist (STUCK: no idea)' \
    '- Blocked: STUCK — reviewer FAIL: x' \
    '' \
    '### M01-T04: Four' \
    '' \
    '- Tier: worker-light' \
    '- Status: done' \
    '- Re-tiered: worker-light → worker (batch b1 pilot M01-T01)' \
    '' \
    '**Steps**' \
    '' \
    '1. Write:' \
    '' \
    '   ```markdown' \
    '   ### M01-T09: Not a task' \
    '   - Tier: worker' \
    '   - Status: done' \
    '   ```' \
    > "$PLAN/M01-first.md"
}

# write_failures: writes $PLAN/notes/M01-T02-failures.md and
# $PLAN/notes/M01-T03-failures.md.
write_failures() {
  printf '%s\n' \
    '# M01-T02 failures' \
    '' \
    '## Attempt 1' \
    '' \
    '- Tier: worker' \
    '- Time: 2026-09-20T10:10:00Z' \
    '- Description: Verify failed' \
    '- Then: resumed' \
    '' \
    '## Attempt 2' \
    '' \
    '- Tier: worker' \
    '- Time: 2026-09-20T10:20:00Z' \
    '- Description: Verify failed' \
    '- Then: escalated to worker-heavy' \
    > "$PLAN/notes/M01-T02-failures.md"
  printf '%s\n' \
    '# M01-T03 failures' \
    '' \
    '## Attempt 1' \
    '' \
    '- Tier: worker' \
    '- Time: 2026-09-21T09:10:00Z' \
    '- Description: Verify failed' \
    '- Then: resumed' \
    '' \
    '## Attempt 2' \
    '' \
    '- Tier: worker' \
    '- Time: 2026-09-21T09:20:00Z' \
    '- Description: Verify failed' \
    '- Then: escalated to worker-heavy' \
    '' \
    '## Attempt 3' \
    '' \
    '- Tier: worker-heavy' \
    '- Time: 2026-09-21T09:30:00Z' \
    '- Description: API error' \
    '- Then: resume failed (API error), escalated to specialist' \
    '' \
    '## Attempt 4' \
    '' \
    '- Tier: specialist' \
    '- Time: 2026-09-21T09:40:00Z' \
    '- Description: interrupted attempt' \
    '- Then: resumed' \
    '' \
    '## Attempt 5' \
    '' \
    '- Tier: specialist' \
    '- Time: 2026-09-21T09:50:00Z' \
    '- Description: STUCK: no idea' \
    '- Then: blocked (STUCK)' \
    > "$PLAN/notes/M01-T03-failures.md"
}

# commit_at <date> <subject> <trailer>: makes an empty commit in $REPO at the
# given committer/author date, with the given subject and trailer.
commit_at() {
  GIT_COMMITTER_DATE="$1" GIT_AUTHOR_DATE="$1" git -C "$REPO" commit --quiet --allow-empty -m "$2" -m "$3"
}

@test "run-report writes the report and prints its path through print_path" {
  write_log "start 2026-09-20T10:00:00Z plans/demo plan" "end 2026-09-20T10:45:30Z PAUSE GATE"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$output" = "cygpath-stub [-m] [$REPORT]" ]
  [ "$(sed -n '1p' "$REPORT")" = "# Run report: Demo" ]
  [ -z "$(sed -n '2p' "$REPORT")" ]
}

@test "each invocation gets its stops, pauses and wall-clock time" {
  write_log "${LOG6[@]}"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2026-09-20T10:00:00Z')
  S2=$(section "$REPORT" '## Invocation 2: 2026-09-21T09:00:00Z')
  S3=$(section "$REPORT" '## Invocation 3: 2026-09-22T08:00:00Z')
  P=$(section "$REPORT" '## Plan so far')
  printf '%s\n' "$S1" | grep -qxF -- '- Stops and pauses: PAUSE GATE 1'
  printf '%s\n' "$S1" | grep -qxF -- '- Wall-clock time: 45 min'
  printf '%s\n' "$S2" | grep -qxF -- '- Stops and pauses: STOP GAP 1'
  printf '%s\n' "$S2" | grep -qxF -- '- Wall-clock time: 150 min'
  printf '%s\n' "$S3" | grep -qxF -- '- Stops and pauses: PAUSE GATE 1'
  printf '%s\n' "$S3" | grep -qxF -- '- Wall-clock time: 10 min'
  printf '%s\n' "$P" | grep -qxF -- '- Stops and pauses: PAUSE GATE 2, STOP GAP 1'
  printf '%s\n' "$P" | grep -qxF -- '- Wall-clock time: 205 min'
  run grep '^## ' "$REPORT"
  [ "$status" -eq 0 ]
  [ "${lines[0]}" = "## Invocation 1: 2026-09-20T10:00:00Z" ]
  [ "${lines[1]}" = "## Invocation 2: 2026-09-21T09:00:00Z" ]
  [ "${lines[2]}" = "## Invocation 3: 2026-09-22T08:00:00Z" ]
  [ "${lines[3]}" = "## Plan so far" ]
}

@test "a completed run is neither a stop nor a pause" {
  write_log "start 2026-09-23T10:00:00Z plans/demo plan" "end 2026-09-23T12:00:00Z COMPLETE plan"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2026-09-23T10:00:00Z')
  P=$(section "$REPORT" '## Plan so far')
  printf '%s\n' "$S1" | grep -qxF -- '- Stops and pauses: none'
  printf '%s\n' "$S1" | grep -qxF -- '- Wall-clock time: 120 min'
  printf '%s\n' "$P" | grep -qxF -- '- Stops and pauses: none'
  printf '%s\n' "$P" | grep -qxF -- '- Wall-clock time: 120 min'
}

@test "an invocation without an end line runs to the next start" {
  write_log \
    "start 2026-09-20T10:00:00Z plans/demo plan" \
    "start 2026-09-20T12:00:00Z plans/demo plan" \
    "end 2026-09-20T12:30:00Z STOP STUCK" \
    "start 2026-09-21T09:00:00Z plans/demo plan"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2026-09-20T10:00:00Z')
  S2=$(section "$REPORT" '## Invocation 2: 2026-09-20T12:00:00Z')
  S3=$(section "$REPORT" '## Invocation 3: 2026-09-21T09:00:00Z')
  P=$(section "$REPORT" '## Plan so far')
  printf '%s\n' "$S1" | grep -qxF -- '- Stops and pauses: none'
  printf '%s\n' "$S1" | grep -qxF -- '- Wall-clock time: unknown'
  printf '%s\n' "$S2" | grep -qxF -- '- Stops and pauses: STOP STUCK 1'
  printf '%s\n' "$S2" | grep -qxF -- '- Wall-clock time: 30 min'
  printf '%s\n' "$S3" | grep -qxF -- '- Wall-clock time: unknown'
  printf '%s\n' "$P" | grep -qxF -- '- Stops and pauses: STOP STUCK 1'
  printf '%s\n' "$P" | grep -qxF -- '- Wall-clock time: 30 min'
}

@test "wall-clock time crosses leap-day and year boundaries" {
  write_log \
    "start 2024-02-28T23:30:00Z plans/demo plan" \
    "end 2024-03-01T00:30:00Z PAUSE LIMIT" \
    "start 2025-12-31T23:59:00Z plans/demo plan" \
    "end 2026-01-01T00:01:00Z PAUSE LIMIT"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2024-02-28T23:30:00Z')
  S2=$(section "$REPORT" '## Invocation 2: 2025-12-31T23:59:00Z')
  P=$(section "$REPORT" '## Plan so far')
  printf '%s\n' "$S1" | grep -qxF -- '- Wall-clock time: 1500 min'
  printf '%s\n' "$S2" | grep -qxF -- '- Wall-clock time: 2 min'
  printf '%s\n' "$P" | grep -qxF -- '- Wall-clock time: 1502 min'
  printf '%s\n' "$P" | grep -qxF -- '- Stops and pauses: PAUSE LIMIT 2'
}

@test "with no run log the report has only the plan so far" {
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  run grep '^## Invocation' "$REPORT"
  [ "$status" -eq 1 ]
  P=$(section "$REPORT" '## Plan so far')
  printf '%s\n' "$P" | grep -qxF -- '- Stops and pauses: none'
  printf '%s\n' "$P" | grep -qxF -- '- Wall-clock time: unknown'
}

@test "run-report accepts carriage returns in the run log" {
  printf '%s\r\n' \
    "start 2026-09-20T10:00:00Z plans/demo plan" \
    "end 2026-09-20T10:45:30Z PAUSE GATE" \
    "start 2026-09-21T09:00:00Z plans/demo plan" \
    "end 2026-09-21T11:30:59Z STOP GAP" \
    "start 2026-09-22T08:00:00Z plans/demo plan" \
    "end 2026-09-22T08:10:00Z PAUSE GATE" \
    > "$PLAN/notes/run-log.md"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2026-09-20T10:00:00Z')
  printf '%s\n' "$S1" | grep -qxF -- '- Stops and pauses: PAUSE GATE 1'
  printf '%s\n' "$S1" | grep -qxF -- '- Wall-clock time: 45 min'
  run grep -c $'\r' "$REPORT"
  [ "$output" = "0" ]
}

@test "a second run with no new records writes the same report" {
  write_log "${LOG6[@]}"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  cp "$REPORT" "$BATS_TEST_TMPDIR/first.md"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  cmp "$REPORT" "$BATS_TEST_TMPDIR/first.md"
}

@test "a plan with no title line is named by its directory" {
  write_log "${LOG6[@]}"
  { printf '# Something else\n'; tail -n +2 "$PLAN/plan.md"; } > "$PLAN/plan.tmp"
  mv "$PLAN/plan.tmp" "$PLAN/plan.md"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "$(sed -n '1p' "$REPORT")" = "# Run report: demo plan" ]
}

@test "run-report exits 2 with the wrong number of arguments" {
  run_script
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: usage: run-report <plan-dir>" ]

  run_script "$PLAN" extra
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: usage: run-report <plan-dir>" ]
}

@test "run-report exits 2 when <plan-dir> is not a directory" {
  run_script "$REPO/plans/missing"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not a directory: cygpath-stub [-m] [$REPO/plans/missing]" ]
}

@test "run-report exits 2 outside a git work tree" {
  mkdir -p "$BATS_TEST_TMPDIR/plain dir"
  run_script "$BATS_TEST_TMPDIR/plain dir"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not inside a git work tree: cygpath-stub [-m] [$BATS_TEST_TMPDIR/plain dir]" ]
}

@test "run-report exits 2 when plan.md is missing" {
  mkdir -p "$REPO/plans/empty"
  run_script "$REPO/plans/empty"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: no plan.md in: cygpath-stub [-m] [$REPO/plans/empty]" ]
}

@test "run-report accepts <plan-dir> in both drive-letter forms" {
  command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
  write_log "${LOG6[@]}"
  win_m=$(cygpath -m "$PLAN")
  win_w=$(cygpath -w "$PLAN")
  run_script "$win_m"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2026-09-20T10:00:00Z')
  printf '%s\n' "$S1" | grep -qxF -- '- Wall-clock time: 45 min'
  run_script "$win_w"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2026-09-20T10:00:00Z')
  printf '%s\n' "$S1" | grep -qxF -- '- Wall-clock time: 45 min'
}

@test "run-log events are counted per invocation and for the plan" {
  write_log "${LOG15[@]}"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2026-09-20T10:00:00Z')
  S2=$(section "$REPORT" '## Invocation 2: 2026-09-21T09:00:00Z')
  P=$(section "$REPORT" '## Plan so far')
  printf '%s\n' "$S1" | grep -qxF -- '- Merges: 1 resolved, 0 failed (0 rerun, 0 already integrated)'
  printf '%s\n' "$S1" | grep -qxF -- '- Containment downgrades: 1'
  printf '%s\n' "$S1" | grep -qxF -- '- Auto-decided questions: 0'
  printf '%s\n' "$S1" | grep -qxF -- '- Leftover-background-work warnings: 1'
  printf '%s\n' "$S1" | grep -qxF -- '  - 2026-09-20T10:26:00Z worker M01-T03 "1 background task still running"'
  ! printf '%s\n' "$S1" | grep -q '^  - M02:'

  printf '%s\n' "$S2" | grep -qxF -- '- Merges: 0 resolved, 2 failed (1 rerun, 1 already integrated)'
  printf '%s\n' "$S2" | grep -qxF -- '- Containment downgrades: 0'
  printf '%s\n' "$S2" | grep -qxF -- '- Auto-decided questions: 2'
  printf '%s\n' "$S2" | grep -qxF -- '  - M02-T03-q1: D02: Use the second option. (source: decider)'
  printf '%s\n' "$S2" | grep -qxF -- '  - M02-T04-q1: D09 (not in plan.md)'
  printf '%s\n' "$S2" | grep -qxF -- '- Leftover-background-work warnings: 0'

  printf '%s\n' "$P" | grep -qxF -- '- Merges: 1 resolved, 2 failed (1 rerun, 1 already integrated)'
  printf '%s\n' "$P" | grep -qxF -- '- Containment downgrades: 1'
  printf '%s\n' "$P" | grep -qxF -- '- Auto-decided questions: 2'
  printf '%s\n' "$P" | grep -qxF -- '  - M02-T03-q1: D02: Use the second option. (source: decider)'
  printf '%s\n' "$P" | grep -qxF -- '  - M02-T04-q1: D09 (not in plan.md)'
  printf '%s\n' "$P" | grep -qxF -- '- Leftover-background-work warnings: 1'
  printf '%s\n' "$P" | grep -qxF -- '  - 2026-09-20T10:26:00Z worker M01-T03 "1 background task still running"'
}

@test "usage is summed per invocation and per agent" {
  write_log "${LOG15[@]}"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  run section "$REPORT" '## Usage'
  [ "$status" -eq 0 ]
  expected=$'## Usage\n- Invocation 1: 1500 tokens, 1 min of agent time\n  - worker: 1000 tokens, 1 min\n  - reviewer: 500 tokens, 0 min\n- Invocation 2: 3000 tokens, 2 min of agent time\n  - planner: 3000 tokens, 2 min\n- Plan so far: 4500 tokens, 3 min of agent time\n  - worker: 1000 tokens, 1 min\n  - reviewer: 500 tokens, 0 min\n  - planner: 3000 tokens, 2 min'
  [ "$output" = "$expected" ]
}

@test "model notices are listed" {
  write_log "${LOG15[@]}"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  run section "$REPORT" '## Model notices'
  [ "$status" -eq 0 ]
  expected=$'## Model notices\n- 2026-09-21T08:59:00Z claude-sonnet-4-5'
  [ "$output" = "$expected" ]
}

@test "with no usage line the usage section says not available" {
  write_log "start 2026-09-20T10:00:00Z plans/demo plan" "end 2026-09-20T10:45:30Z PAUSE GATE"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  run section "$REPORT" '## Usage'
  [ "$output" = $'## Usage\nnot available' ]
  run section "$REPORT" '## Model notices'
  [ "$output" = $'## Model notices\nNone.' ]
}

@test "an invocation with no usage line says not available" {
  write_log \
    "start 2026-09-20T10:00:00Z plans/demo plan" \
    "usage 2026-09-20T10:05:00Z M01-T01 worker 1000 60000" \
    "end 2026-09-20T10:45:30Z PAUSE GATE" \
    "start 2026-09-21T09:00:00Z plans/demo plan" \
    "end 2026-09-21T09:30:00Z PAUSE GATE"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  run section "$REPORT" '## Usage'
  expected=$'## Usage\n- Invocation 1: 1000 tokens, 1 min of agent time\n  - worker: 1000 tokens, 1 min\n- Invocation 2: not available\n- Plan so far: 1000 tokens, 1 min of agent time\n  - worker: 1000 tokens, 1 min'
  [ "$output" = "$expected" ]
}

@test "a line appended after the end line counts in the invocation its time falls in" {
  write_log \
    "start 2026-09-20T10:00:00Z plans/demo plan" \
    "end 2026-09-20T10:45:30Z PAUSE GATE" \
    "background-warning 2026-09-20T10:40:00Z worker M01-T03 \"still running\"" \
    "usage 2026-09-20T10:44:00Z M01 milestone-reviewer 700 6000" \
    "merge-resolved 2026-09-20T11:00:00Z M01-T05" \
    "start 2026-09-21T09:00:00Z plans/demo plan"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2026-09-20T10:00:00Z')
  S2=$(section "$REPORT" '## Invocation 2: 2026-09-21T09:00:00Z')
  P=$(section "$REPORT" '## Plan so far')
  printf '%s\n' "$S1" | grep -qxF -- '- Leftover-background-work warnings: 1'
  printf '%s\n' "$S1" | grep -qxF -- '- Merges: 0 resolved, 0 failed (0 rerun, 0 already integrated)'
  printf '%s\n' "$S2" | grep -qxF -- '- Leftover-background-work warnings: 0'
  printf '%s\n' "$S2" | grep -qxF -- '- Merges: 0 resolved, 0 failed (0 rerun, 0 already integrated)'
  printf '%s\n' "$P" | grep -qxF -- '- Merges: 1 resolved, 0 failed (0 rerun, 0 already integrated)'
  run section "$REPORT" '## Usage'
  printf '%s\n' "$output" | grep -qxF -- '- Invocation 1: 700 tokens, 0 min of agent time'
  printf '%s\n' "$output" | grep -qxF -- '- Invocation 2: not available'
}

@test "tasks, attempts, resumes, escalations and STUCK are counted per invocation and for the plan" {
  write_tasks
  write_failures
  commit_at '2026-09-20 10:30:00 +0000' 'chore(plan): M01-T01 done' 'Orcastrat-Task: M01-T01'
  commit_at '2026-09-20 10:40:00 +0000' 'chore(plan): M01-T02 done' 'Orcastrat-Task: M01-T02'
  commit_at '2026-09-21 10:00:00 +0000' 'chore(plan): M01-T04 done' 'Orchestratinator-Task: M01-T04'
  write_log \
    "start 2026-09-20T10:00:00Z plans/demo plan" \
    "end 2026-09-20T10:45:30Z PAUSE GATE" \
    "start 2026-09-21T09:00:00Z plans/demo plan" \
    "end 2026-09-21T11:30:59Z STOP STUCK"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2026-09-20T10:00:00Z')
  S2=$(section "$REPORT" '## Invocation 2: 2026-09-21T09:00:00Z')
  P=$(section "$REPORT" '## Plan so far')
  printf '%s\n' "$S1" | grep -qxF -- '- Tasks done: 2'
  printf '%s\n' "$S1" | grep -qxF -- '- Attempts per tier: worker 3, worker-heavy 1'
  printf '%s\n' "$S1" | grep -qxF -- '- Resumes per tier: worker 1'
  printf '%s\n' "$S1" | grep -qxF -- '- Escalations per tier: worker 1'
  printf '%s\n' "$S1" | grep -qxF -- '- Tasks that ended STUCK: 0'

  printf '%s\n' "$S2" | grep -qxF -- '- Tasks done: 1'
  printf '%s\n' "$S2" | grep -qxF -- '- Attempts per tier: worker 3, worker-heavy 1, specialist 2'
  printf '%s\n' "$S2" | grep -qxF -- '- Resumes per tier: worker 1, specialist 1'
  printf '%s\n' "$S2" | grep -qxF -- '- Escalations per tier: worker 1, worker-heavy 1'
  printf '%s\n' "$S2" | grep -qxF -- '- Tasks that ended STUCK: 1 (M01-T03)'

  printf '%s\n' "$P" | grep -qxF -- '- Tasks done: 3'
  printf '%s\n' "$P" | grep -qxF -- '- Attempts per tier: worker 6, worker-heavy 2, specialist 2'
  printf '%s\n' "$P" | grep -qxF -- '- Resumes per tier: worker 2, specialist 1'
  printf '%s\n' "$P" | grep -qxF -- '- Escalations per tier: worker 2, worker-heavy 1'
  printf '%s\n' "$P" | grep -qxF -- '- Tasks that ended STUCK: 1 (M01-T03)'
}

@test "a done task's tier counts only Escalated lines below its last Blocked line" {
  printf '%s\n' \
    '# M01: First' \
    '' \
    '## Tasks' \
    '' \
    '### M01-T05: Five' \
    '' \
    '- Tier: worker' \
    '- Status: done' \
    '- Escalated: worker → worker-heavy (a)' \
    '- Escalated: worker-heavy → specialist (b)' \
    '- Blocked: STUCK — c' \
    '' \
    '### M01-T06: Six' \
    '' \
    '- Tier: worker' \
    '- Status: done' \
    '- Escalated: worker → worker-heavy (d)' \
    '- Blocked: GAP — e' \
    '- Escalated: worker → worker-heavy (Verify failed)' \
    > "$PLAN/M01-first.md"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  P=$(section "$REPORT" '## Plan so far')
  printf '%s\n' "$P" | grep -qxF -- '- Tasks done: 2'
  printf '%s\n' "$P" | grep -qxF -- '- Attempts per tier: worker 1, worker-heavy 1'
  printf '%s\n' "$P" | grep -qxF -- '- Resumes per tier: none'
  printf '%s\n' "$P" | grep -qxF -- '- Escalations per tier: none'
  printf '%s\n' "$P" | grep -qxF -- '- Tasks that ended STUCK: 0'
}

@test "review findings are counted per milestone, per invocation and for the plan" {
  mkdir -p "$PLAN/notes/reviews"
  printf '%s\n' \
    '# M01 review' \
    '' \
    '## Blocking' \
    '' \
    '- [90/85] missing-test: src/a.sh:3 — no test (M01-T01)' \
    '' \
    '## Advisory' \
    '' \
    '- [60] naming: src/a.sh:9 — unclear name (M01-T01)' \
    '- [85/40] style: src/b.sh:2 — long line (M01-T02) — validator: not a rule' \
    '- `src/c.sh:1` — old-style finding (M01-T02)' \
    > "$PLAN/notes/M01-review.md"
  printf '%s\n' \
    '# M01 plan review' \
    '' \
    '## Issues' \
    '' \
    '1. [80/90] coverage: M01 — check 3 — row unmapped' \
    '' \
    '## Advisory' \
    '' \
    '1. [50] wording: M01-T02 — check 8 — vague' \
    > "$PLAN/notes/M01-plan-review.md"
  printf '%s\n' \
    '# M02-T01 review' \
    '' \
    '## Blocking' \
    '' \
    'None.' \
    '' \
    '## Advisory' \
    '' \
    '- [70] error-handling: src/d.sh:4 — unchecked exit (M02-T01)' \
    '- [90/none] security: src/d.sh:8 — unsafe eval (M02-T01) — validator: no score' \
    > "$PLAN/notes/reviews/M02-T01-attempt1.md"
  git -C "$REPO" add -- "plans/demo plan/notes/M01-review.md" "plans/demo plan/notes/M01-plan-review.md"
  GIT_COMMITTER_DATE='2026-09-20 10:35:00 +0000' GIT_AUTHOR_DATE='2026-09-20 10:35:00 +0000' git -C "$REPO" commit --quiet -m 'chore(plan): review M01'
  write_log \
    "start 2026-09-20T10:00:00Z plans/demo plan" \
    "end 2026-09-20T10:45:30Z PAUSE GATE" \
    "start 2026-09-21T09:00:00Z plans/demo plan" \
    "end 2026-09-21T11:30:59Z STOP GAP"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2026-09-20T10:00:00Z')
  S2=$(section "$REPORT" '## Invocation 2: 2026-09-21T09:00:00Z')
  P=$(section "$REPORT" '## Plan so far')
  printf '%s\n' "$S1" | grep -qxF -- '- Review findings:'
  printf '%s\n' "$S1" | grep -qxF -- '  - M01: 3 advisory, 2 confirmed, 1 downgraded'
  [ -z "$(printf '%s\n' "$S1" | grep '^  - M02:')" ]
  printf '%s\n' "$S2" | grep -qxF -- '- Review findings:'
  printf '%s\n' "$S2" | grep -qxF -- '  - M02: 2 advisory, 0 confirmed, 1 downgraded'
  [ -z "$(printf '%s\n' "$S2" | grep '^  - M01:')" ]
  printf '%s\n' "$P" | grep -qxF -- '- Review findings:'
  printf '%s\n' "$P" | grep -qxF -- '  - M01: 3 advisory, 2 confirmed, 1 downgraded'
  printf '%s\n' "$P" | grep -qxF -- '  - M02: 2 advisory, 0 confirmed, 1 downgraded'
  m01_line=$(printf '%s\n' "$P" | grep -n '^  - M0' | sed -n '1p' | cut -d: -f1)
  m02_line=$(printf '%s\n' "$P" | grep -n '^  - M0' | sed -n '2p' | cut -d: -f1)
  [ "$m01_line" -lt "$m02_line" ]
}

@test "review lines in other shapes are not counted" {
  printf '%s\n' \
    '## Blocking' \
    '' \
    '- `src/a.sh:3` — missing test (M03-T01, D12)' \
    '' \
    '## Advisory' \
    '' \
    '- [high] naming: src/b.sh:1 — vague (M03-T01)' \
    > "$PLAN/notes/M03-review.md"
  write_log "start 2026-09-20T10:00:00Z plans/demo plan"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2026-09-20T10:00:00Z')
  P=$(section "$REPORT" '## Plan so far')
  printf '%s\n' "$S1" | grep -qxF -- '- Review findings: none'
  printf '%s\n' "$P" | grep -qxF -- '- Review findings: none'
}

@test "the bullets come in spec order" {
  write_log "start 2026-09-20T10:00:00Z plans/demo plan" "end 2026-09-20T10:45:30Z PAUSE GATE"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2026-09-20T10:00:00Z')
  P=$(section "$REPORT" '## Plan so far')
  expected=$'- Tasks done\n- Attempts per tier\n- Resumes per tier\n- Escalations per tier\n- Tasks that ended STUCK\n- Merges\n- Containment downgrades\n- Auto-decided questions\n- Review findings\n- Leftover-background-work warnings\n- Stops and pauses\n- Wall-clock time'
  [ "$(printf '%s\n' "$S1" | grep -o '^- [^:]*')" = "$expected" ]
  [ "$(printf '%s\n' "$P" | grep -o '^- [^:]*')" = "$expected" ]
}

@test "a plan whose Branch doesn't exist has no tasks done per invocation" {
  write_tasks
  write_failures
  commit_at '2026-09-20 10:30:00 +0000' 'chore(plan): M01-T01 done' 'Orcastrat-Task: M01-T01'
  commit_at '2026-09-20 10:40:00 +0000' 'chore(plan): M01-T02 done' 'Orcastrat-Task: M01-T02'
  commit_at '2026-09-21 10:00:00 +0000' 'chore(plan): M01-T04 done' 'Orchestratinator-Task: M01-T04'
  write_log \
    "start 2026-09-20T10:00:00Z plans/demo plan" \
    "end 2026-09-20T10:45:30Z PAUSE GATE" \
    "start 2026-09-21T09:00:00Z plans/demo plan" \
    "end 2026-09-21T11:30:59Z STOP STUCK"
  sed 's/^- Branch: main$/- Branch: nope/' "$PLAN/plan.md" > "$PLAN/plan.tmp"
  mv "$PLAN/plan.tmp" "$PLAN/plan.md"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  S1=$(section "$REPORT" '## Invocation 1: 2026-09-20T10:00:00Z')
  P=$(section "$REPORT" '## Plan so far')
  printf '%s\n' "$S1" | grep -qxF -- '- Tasks done: 0'
  printf '%s\n' "$P" | grep -qxF -- '- Tasks done: 3'
}

@test "suggestions are listed with their kind and target" {
  cat > "$PLAN/notes/instruction-suggestions.md" << 'EOF'
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
EOF
  write_log "start 2026-09-20T10:00:00Z plans/demo plan" "end 2026-09-20T10:45:30Z PAUSE GATE"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  section "$REPORT" '## Suggestions' > "$BATS_TEST_TMPDIR/suggestions.txt"
  expected=$'## Suggestions\n- missing-test: hook, target CLAUDE.md\n- naming: rule, target CLAUDE.md'
  [ "$(cat "$BATS_TEST_TMPDIR/suggestions.txt")" = "$expected" ]
}

@test "with no suggestions file the section says None." {
  write_log "start 2026-09-20T10:00:00Z plans/demo plan" "end 2026-09-20T10:45:30Z PAUSE GATE"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  expected=$'## Suggestions\nNone.'
  [ "$(section "$REPORT" '## Suggestions')" = "$expected" ]
}

@test "the report's sections come in order" {
  write_log "start 2026-09-20T10:00:00Z plans/demo plan" "end 2026-09-20T10:45:30Z PAUSE GATE"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  expected=$'## Invocation 1: 2026-09-20T10:00:00Z\n## Plan so far\n## Usage\n## Model notices\n## Suggestions'
  [ "$(grep '^## ' "$REPORT")" = "$expected" ]
}

@test "an auto-decided Decision with a milestone tag is listed with its text" {
  local tagged='- D10 [M02]: Use a lock file. (→ plans/demo plan/notes/decisions/M02-T05-q1.md; source: auto-decided (M02-T05-q1))'
  awk -v line="$tagged" '{ print } $0 == "- D02: Use the second option. (source: decider)" { print line }' "$PLAN/plan.md" > "$PLAN/plan.new"
  mv "$PLAN/plan.new" "$PLAN/plan.md"
  write_log "start 2026-09-21T09:00:00Z plans/demo plan" "auto-decided 2026-09-21T09:50:00Z M02-T05-q1 D10" "end 2026-09-21T11:30:59Z STOP GAP"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  P=$(section "$REPORT" '## Plan so far')
  printf '%s\n' "$P" | grep -qxF -- '- Auto-decided questions: 1'
  printf '%s\n' "$P" | grep -qxF -- "  - M02-T05-q1: ${tagged#- }"
}
