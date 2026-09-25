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
# marker for "plans/my plan" by hand, with session=S-1 as the sixth line.
write_marker() {
  mkdir -p "$REPO/.git/orcastrat"
  printf 'plan=plans/my plan\nstarted=%s\nheartbeat=%s\nblocks=%s\nblock_heartbeat=%s\nsession=S-1\n' \
    "$1" "$2" "$3" "$4" > "$MARKER"
}

# line_count <file>: prints the number of lines in <file>.
line_count() {
  wc -l < "$1" | tr -d ' '
}

@test "start writes the marker with plan, started, heartbeat, blocks, block_heartbeat and session" {
  run_script start "plans/my plan" S-1
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(line_count "$MARKER")" = "6" ]
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
  [ "$(sed -n 6p "$MARKER")" = "session=S-1" ]
}

@test "start creates the notes directory and appends a start line to the run log" {
  run_script start "plans/my plan" S-1
  [ "$status" -eq 0 ]
  [ "$(line_count "$LOG")" = "1" ]
  re="^start $UTC_RE plans/my plan\$"
  [[ "$(cat "$LOG")" =~ $re ]] || false
}

@test "start appends to an existing run log" {
  mkdir -p "$REPO/plans/my plan/notes"
  printf 'earlier line\n' > "$LOG"
  run_script start "plans/my plan" S-1
  [ "$status" -eq 0 ]
  [ "$(line_count "$LOG")" = "2" ]
  [ "$(sed -n 1p "$LOG")" = "earlier line" ]
}

@test "start overwrites an existing marker" {
  write_marker 1000 1000 2 900
  run_script start "plans/my plan" S-1
  [ "$status" -eq 0 ]
  [ "$(line_count "$MARKER")" = "6" ]
  [ "$(sed -n 2p "$MARKER")" != "started=1000" ]
  [ "$(sed -n 4p "$MARKER")" = "blocks=0" ]
  [ "$(sed -n 5p "$MARKER")" = "block_heartbeat=" ]
}

@test "start in a linked worktree writes the marker in that worktree's git dir" {
  git worktree add --quiet -b task "$BATS_TEST_TMPDIR/task tree"
  mkdir -p "$BATS_TEST_TMPDIR/task tree/plans/my plan"
  cd "$BATS_TEST_TMPDIR/task tree"
  run_script start "plans/my plan" S-1
  [ "$status" -eq 0 ]
  [ -f "$(git rev-parse --absolute-git-dir)/orcastrat/active-run" ]
  [ ! -e "$MARKER" ]
  [ -f "$BATS_TEST_TMPDIR/task tree/plans/my plan/notes/run-log.md" ]
}

@test "run-state accepts <plan-dir> in both drive-letter forms" {
  command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
  win_m="$(cygpath -m "$REPO/plans/my plan")"
  win_w="$(cygpath -w "$REPO/plans/my plan")"
  run_script start "$win_m" S-1
  [ "$status" -eq 0 ]
  [ "$(sed -n 1p "$MARKER")" = "plan=$win_m" ]
  run_script start "$win_w" S-1
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
  [ "$(line_count "$MARKER")" = "6" ]
  [ "$(sed -n 1p "$MARKER")" = "plan=plans/my plan" ]
  [ "$(sed -n 2p "$MARKER")" = "started=1000" ]
  heartbeat="$(sed -n 's/^heartbeat=//p' "$MARKER")"
  [ "$heartbeat" -gt 1000 ]
  [ "$(sed -n 3p "$MARKER")" = "heartbeat=$heartbeat" ]
  [ "$(sed -n 4p "$MARKER")" = "blocks=2" ]
  [ "$(sed -n 5p "$MARKER")" = "block_heartbeat=900" ]
  [ "$(sed -n 6p "$MARKER")" = "session=S-1" ]
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
  run_script start "plans/my plan" S-1
  run_script elapsed
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

@test "end appends an end line and deletes the marker" {
  run_script start "plans/my plan" S-1
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
  run_script start "plans/my plan" S-1
  run_script end PAUSE LIMIT
  [ "$status" -eq 0 ]
  run_script start "plans/my plan" S-1
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
  [ "$stderr" = "error: usage: run-state start <plan-dir> <session-id> | beat | elapsed | end <PAUSE|STOP|COMPLETE> <reason>" ]
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
  [ "$stderr" = "error: usage: run-state start <plan-dir> <session-id>" ]
  run_script start "plans/my plan"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: usage: run-state start <plan-dir> <session-id>" ]
  [ ! -e "$MARKER" ]
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

@test "start writes the session ID it is given" {
  run_script start "plans/my plan" 0b6f4c8e-7d1a-4c52-9a3e-2f0e5d8c1b7a
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(sed -n 6p "$MARKER")" = "session=0b6f4c8e-7d1a-4c52-9a3e-2f0e5d8c1b7a" ]
  [ "$(line_count "$LOG")" = "1" ]
}

@test "end exits 2 for an unknown mode" {
  run_script start "plans/my plan" S-1
  run_script end DONE plan
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: unknown end mode: DONE" ]
  [ -f "$MARKER" ]
}

@test "start exits 2 when <plan-dir> is not a directory" {
  run_script start "plans/missing" S-1
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not a directory: cygpath-stub [-m] [plans/missing]" ]
  [ ! -e "$MARKER" ]
}

@test "run-state exits 2 outside a git work tree" {
  mkdir -p "$BATS_TEST_TMPDIR/plain dir"
  cd "$BATS_TEST_TMPDIR/plain dir"
  run_script start "$BATS_TEST_TMPDIR/plain dir" S-1
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
