bats_require_minimum_version 1.5.0

setup() {
  load test_helper
  SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/ensure-exclude"
  REPO="$BATS_TEST_TMPDIR/fixture repo"
  make_fixture_repo "$REPO"
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  EXCLUDE="$REPO/.git/info/exclude"
  cd "$REPO"
}

# run_script <args...>: runs ensure-exclude with the stub cygpath first on
# PATH, keeping stderr apart from stdout.
run_script() {
  run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
}

# count_line <file>: prints 0 when <file> doesn't exist, otherwise the number
# of lines of <file> equal to /.orcastrat/ once carriage returns are removed.
count_line() {
  local file="$1"
  if [ ! -f "$file" ]; then
    printf '0\n'
    return
  fi
  tr -d '\r' < "$file" | grep -cxF -- '/.orcastrat/'
}

@test "adds /.orcastrat/ to the exclude file" {
  run_script
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(count_line "$EXCLUDE")" -eq 1 ]
  [ "$(tail -n 1 "$EXCLUDE")" = '/.orcastrat/' ]
}

@test "a second run adds nothing" {
  run_script
  [ "$status" -eq 0 ]
  local saved
  saved=$(cat "$EXCLUDE")
  run_script
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$EXCLUDE")" = "$saved" ]
}

@test "a file that doesn't end in a newline gets one before the line" {
  printf '*.log' > "$EXCLUDE"
  run_script
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$EXCLUDE")" = "$(printf '*.log\n/.orcastrat/')" ]
}

@test "an existing line with a carriage return counts" {
  printf '/.orcastrat/\r\n' > "$EXCLUDE"
  local saved
  saved=$(od -c "$EXCLUDE")
  run_script
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(od -c "$EXCLUDE")" = "$saved" ]
}

@test "creates the info directory when it is missing" {
  rm -rf "$REPO/.git/info"
  run_script
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(cat "$EXCLUDE")" = '/.orcastrat/' ]
}

@test "works from a subdirectory" {
  mkdir -p "$REPO/sub dir"
  cd "$REPO/sub dir"
  run_script
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(count_line "$EXCLUDE")" -eq 1 ]
}

@test "in a linked worktree it writes the shared exclude file" {
  git worktree add --quiet -b task "$BATS_TEST_TMPDIR/task tree"
  cd "$BATS_TEST_TMPDIR/task tree"
  run_script
  [ "$status" -eq 0 ]
  [ -z "$output" ]
  [ -z "$stderr" ]
  [ "$(count_line "$EXCLUDE")" -eq 1 ]
}

@test "an excluded .orcastrat directory stays out of git status and git clean" {
  run_script
  mkdir -p "$REPO/.orcastrat/wt/M01-T01" "$REPO/.orcastrat/instructions"
  printf 'review\n' > "$REPO/.orcastrat/instructions/review.md"
  [ -z "$(git -C "$REPO" status --porcelain)" ]
  git -C "$REPO" clean -fdq
  [ -f "$REPO/.orcastrat/instructions/review.md" ]
}

@test "exits 2 with an argument" {
  run_script extra
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: usage: ensure-exclude' ]
  [ "$(count_line "$EXCLUDE")" -eq 0 ]
}

@test "exits 2 outside a git work tree" {
  mkdir -p "$BATS_TEST_TMPDIR/plain dir"
  cd "$BATS_TEST_TMPDIR/plain dir"
  run_script
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [[ "$stderr" == 'error: not inside a git work tree: cygpath-stub [-m] ['* ]]
}
