bats_require_minimum_version 1.5.0

setup() {
  load test_helper
  SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/hold"
  REPO="$BATS_TEST_TMPDIR/fixture repo"
  make_fixture_repo "$REPO"
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  REPORT='plans/my plan/notes/reports/M01-T01.md'
  LOG='plans/my plan/notes/M01-T01-failures.md'
  HOLD="$REPO/.git/orcastrat/my plan/hold"
  mkdir -p "$REPO/plans/my plan"
  printf '# Plan\n' > "$REPO/plans/my plan/plan.md"
  git -C "$REPO" add "plans/my plan/plan.md"
  git -C "$REPO" commit --quiet -m 'Add plan'
  mkdir -p "$REPO/plans/my plan/notes/reports"
  printf 'report one\n' > "$REPO/$REPORT"
  printf '## Attempt 1\n' > "$REPO/$LOG"
  cd "$REPO"
}

# run_script <args...>: runs hold with the stub cygpath first on PATH,
# keeping stderr apart from stdout.
run_script() {
  run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
}

# save both: holds both the report and the failure log for M01-T01.
save_both() {
  run_script save "plans/my plan" M01-T01 "$REPO" "$REPORT" "$LOG"
}

@test "save copies each existing path under the key" {
  save_both
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$HOLD/M01-T01/$REPORT")" = 'report one' ]
  [ "$(cat "$HOLD/M01-T01/$LOG")" = '## Attempt 1' ]
  [ -f "$REPO/$REPORT" ]
  [ -f "$REPO/$LOG" ]
}

@test "save skips a path that doesn't exist" {
  rm "$REPO/$LOG"
  save_both
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ -f "$HOLD/M01-T01/$REPORT" ]
  [ ! -e "$HOLD/M01-T01/$LOG" ]
}

@test "save empties the key first" {
  save_both
  rm "$REPO/$LOG"
  save_both
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ ! -e "$HOLD/M01-T01/$LOG" ]
}

@test "held files survive git reset --hard and git clean -fd" {
  save_both
  git reset --hard --quiet HEAD
  git clean -fdq
  [ ! -e "$REPO/$REPORT" ]
  run_script restore "plans/my plan" M01-T01 "$REPO" "$REPORT" "plans/my plan/notes/reports/M01-T01-attempt1.md" "$LOG" "$LOG"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$REPO/plans/my plan/notes/reports/M01-T01-attempt1.md")" = 'report one' ]
  [ "$(cat "$REPO/$LOG")" = '## Attempt 1' ]
}

@test "restore recreates a parent directory that git clean -fd removed" {
  save_both
  git reset --hard --quiet HEAD
  git clean -fdq
  [ -f "$REPO/plans/my plan/plan.md" ]
  [ ! -e "$REPO/plans/my plan/notes" ]
  run_script restore "plans/my plan" M01-T01 "$REPO" "$REPORT" "$REPORT"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ -d "$REPO/plans/my plan/notes/reports" ]
  [ "$(cat "$REPO/$REPORT")" = 'report one' ]
}

@test "restore copies each held file to its destination, creating directories, and deletes the key" {
  save_both
  rm -rf "$REPO/plans/my plan/notes"
  run_script restore "plans/my plan" M01-T01 "$REPO" "$REPORT" "$REPORT" "$LOG" "$LOG"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$REPO/$REPORT")" = 'report one' ]
  [ "$(cat "$REPO/$LOG")" = '## Attempt 1' ]
  [ ! -e "$HOLD/M01-T01" ]
}

@test "restore skips a pair whose held file doesn't exist" {
  run_script save "plans/my plan" M01-T01 "$REPO" "$REPORT"
  printf 'newer log\n' > "$REPO/$LOG"
  run_script restore "plans/my plan" M01-T01 "$REPO" "$REPORT" "$REPORT" "$LOG" "$LOG"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$REPO/$LOG")" = 'newer log' ]
}

@test "restore after a save that held nothing copies nothing" {
  run_script save "plans/my plan" M01-T01 "$REPO" "plans/my plan/notes/none.md"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ -d "$HOLD/M01-T01" ]
  run_script restore "plans/my plan" M01-T01 "$REPO" "plans/my plan/notes/none.md" "plans/my plan/notes/none.md"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ ! -e "$REPO/plans/my plan/notes/none.md" ]
  [ ! -e "$HOLD/M01-T01" ]
}

@test "restore with nothing held exits 2" {
  run_script restore "plans/my plan" M01-T02 "$REPO" "$REPORT" "$REPORT"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: nothing held for: M01-T02' ]
}

@test "a linked worktree's files are held in the repository's common git dir" {
  TREE="$BATS_TEST_TMPDIR/task tree"
  git worktree add --quiet -b task "$TREE"
  mkdir -p "$TREE/plans/my plan/notes/reports"
  printf 'tree report\n' > "$TREE/$REPORT"
  run_script save "plans/my plan" M01-T01 "$TREE" "$REPORT"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$HOLD/M01-T01/$REPORT")" = 'tree report' ]
  rm "$TREE/$REPORT"
  run_script restore "plans/my plan" M01-T01 "$TREE" "$REPORT" "$REPORT"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$TREE/$REPORT")" = 'tree report' ]
}

@test "hold accepts <plan-dir> and <dir> in both drive-letter forms" {
  command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
  for form in -m -w; do
    run_script save "$(cygpath "$form" "$REPO/plans/my plan")" M01-T01 "$(cygpath "$form" "$REPO")" "$REPORT"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
    [ -z "$stderr" ]
    [ -f "$HOLD/M01-T01/$REPORT" ]
    run_script restore "$(cygpath "$form" "$REPO/plans/my plan")" M01-T01 "$(cygpath "$form" "$REPO")" "$REPORT" "$REPORT"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
    [ -z "$stderr" ]
  done
}

@test "hold exits 2 with the wrong arguments" {
  run_script
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: usage: hold save <plan-dir> <key> <dir> <path>... | restore <plan-dir> <key> <dir> <held-path> <dest-path> [<held-path> <dest-path>]...' ]

  run_script keep
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: unknown subcommand: keep' ]

  run_script save "plans/my plan" M01-T01 "$REPO"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: usage: hold save <plan-dir> <key> <dir> <path>...' ]

  run_script restore "plans/my plan" M01-T01 "$REPO" "$REPORT"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: usage: hold restore <plan-dir> <key> <dir> <held-path> <dest-path> [<held-path> <dest-path>]...' ]

  run_script restore "plans/my plan" M01-T01 "$REPO" a b c
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: usage: hold restore <plan-dir> <key> <dir> <held-path> <dest-path> [<held-path> <dest-path>]...' ]
}

@test "hold exits 2 when <plan-dir> or <dir> is not a directory" {
  run_script save "plans/missing" M01-T01 "$REPO" "$REPORT"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: not a directory: cygpath-stub [-m] [plans/missing]' ]

  run_script save "plans/my plan" M01-T01 "$BATS_TEST_TMPDIR/missing" "$REPORT"
  [ "$status" -eq 2 ]
  [ "$stderr" = "error: not a directory: cygpath-stub [-m] [$BATS_TEST_TMPDIR/missing]" ]
}

@test "hold exits 2 when <dir> is outside a git work tree" {
  mkdir -p "$BATS_TEST_TMPDIR/plain dir"
  run_script save "plans/my plan" M01-T01 "$BATS_TEST_TMPDIR/plain dir" "$REPORT"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not inside a git work tree: cygpath-stub [-m] [$BATS_TEST_TMPDIR/plain dir]" ]
}
