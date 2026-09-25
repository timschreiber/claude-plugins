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
