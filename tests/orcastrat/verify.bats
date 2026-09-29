bats_require_minimum_version 1.5.0

setup() {
  load test_helper
  SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/verify"
  REPO="$BATS_TEST_TMPDIR/fixture repo"
  make_fixture_repo "$REPO"
  PLAN="$REPO/plans/my plan"
  mkdir -p "$PLAN"
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
}

# run_script <args...>: runs verify with the stub cygpath first on PATH,
# keeping stderr apart from stdout.
run_script() {
  run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
}

# log_path_of <log line>: prints the path the stub cygpath received in a
# "log=cygpath-stub [-m] [<path>]" line.
log_path_of() {
  local p="${1#log=cygpath-stub \[-m\] \[}"
  printf '%s\n' "${p%\]}"
}

# log_count <slug>: prints how many .log files the fixture repo holds for <slug>.
log_count() {
  find "$REPO/.git/orcastrat/$1/logs" -type f -name '*.log' | wc -l | tr -d ' '
}

@test "verify runs the command in <dir> and prints exit=0 and the log path through print_path" {
  run_script "$PLAN" "$REPO" 'printf "ran in %s\n" "$(basename "$PWD")"'
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "${#lines[@]}" -eq 2 ]
  [ "${lines[0]}" = "exit=0" ]
  [[ "${lines[1]}" == "log=cygpath-stub [-m] ["*"/.git/orcastrat/my plan/logs/"*".log]" ]]
  log="$(log_path_of "${lines[1]}")"
  [[ "$(basename "$log")" =~ ^[0-9]{8}T[0-9]{6}Z-[0-9]+\.log$ ]]
  grep -qx "ran in fixture repo" "$log"
}

@test "verify on failure prints exit=<n>, the log path and the log's last 40 lines" {
  run_script "$PLAN" "$REPO" 'i=1; while [ $i -le 50 ]; do echo "line $i"; i=$((i + 1)); done; exit 3'
  [ "$status" -eq 0 ]
  [ "${#lines[@]}" -eq 42 ]
  [ "${lines[0]}" = "exit=3" ]
  [[ "${lines[1]}" == "log=cygpath-stub [-m] ["*".log]" ]]
  [ "${lines[2]}" = "line 11" ]
  [ "${lines[41]}" = "line 50" ]
}

@test "verify writes stdout and stderr to the log and gives the command an empty stdin" {
  run --separate-stderr bash -c 'printf "typed\n" | env PATH="$1:$PATH" bash "$2" "$3" "$4" "$5"' _ \
    "$BATS_TEST_TMPDIR/stub-bin" "$SCRIPT" "$PLAN" "$REPO" \
    'echo to-stdout; echo to-stderr >&2; if read -r line; then echo "stdin:$line"; else echo stdin-empty; fi'
  [ "$status" -eq 0 ]
  [ "${#lines[@]}" -eq 2 ]
  log="$(log_path_of "${lines[1]}")"
  grep -qx "to-stdout" "$log"
  grep -qx "to-stderr" "$log"
  grep -qx "stdin-empty" "$log"
}

@test "verify writes a new log on every call and keeps the old ones" {
  run_script "$PLAN" "$REPO" 'true'
  [ "$status" -eq 0 ]
  run_script "$PLAN" "$REPO" 'false'
  [ "$status" -eq 0 ]
  [ "${lines[0]}" = "exit=1" ]
  [ "$(log_count "my plan")" = "2" ]
}

@test "verify leaves the working tree clean" {
  run_script "$PLAN" "$REPO" 'echo hello'
  [ "$status" -eq 0 ]
  run git -C "$REPO" status --porcelain
  [ -z "$output" ]
}

@test "verify writes a worktree's logs under the main repository's git common dir" {
  git -C "$REPO" worktree add --quiet -b task "$BATS_TEST_TMPDIR/task tree"
  run_script "$PLAN" "$BATS_TEST_TMPDIR/task tree" 'echo in-worktree'
  [ "$status" -eq 0 ]
  [ "${lines[0]}" = "exit=0" ]
  [ "$(log_count "my plan")" = "1" ]
  run git -C "$BATS_TEST_TMPDIR/task tree" status --porcelain
  [ -z "$output" ]
}

@test "verify takes the slug from the last component of <plan-dir>, ignoring a trailing slash" {
  mkdir -p "$REPO/plans/demo"
  run_script "$REPO/plans/demo/" "$REPO" 'true'
  [ "$status" -eq 0 ]
  [ "$(log_count demo)" = "1" ]
}

@test "verify accepts <plan-dir> and <dir> in both drive-letter forms" {
  command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
  mkdir -p "$REPO/plans/demo"
  run_script "$(cygpath -m "$REPO/plans/demo")" "$(cygpath -m "$REPO")" 'true'
  [ "$status" -eq 0 ]
  [ "${lines[0]}" = "exit=0" ]
  run_script "$(cygpath -w "$REPO/plans/demo")" "$(cygpath -w "$REPO")" 'true'
  [ "$status" -eq 0 ]
  [ "${lines[0]}" = "exit=0" ]
  [ "$(log_count demo)" = "2" ]
}

@test "verify runs a command containing single and double quotes as one argument" {
  run_script "$PLAN" "$REPO" "printf '%s\n' \"it's quoted\" 'and \"this\" too'"
  [ "$status" -eq 0 ]
  [ "${lines[0]}" = "exit=0" ]
  log="$(log_path_of "${lines[1]}")"
  grep -qxF "it's quoted" "$log"
  grep -qxF 'and "this" too' "$log"
}

@test "verify exits 2 with the wrong number of arguments" {
  run_script "$PLAN" "$REPO"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: usage: verify <plan-dir> <dir> <command>" ]
}

@test "verify exits 2 when <plan-dir> is not a directory" {
  run_script "$BATS_TEST_TMPDIR/missing" "$REPO" 'true'
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [[ "$stderr" == "error: not a directory: "* ]]
}

@test "verify exits 2 when <dir> is not a directory" {
  run_script "$PLAN" "$BATS_TEST_TMPDIR/missing" 'true'
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [[ "$stderr" == "error: not a directory: "* ]]
}

@test "verify exits 2 when <dir> is outside a git work tree" {
  mkdir -p "$BATS_TEST_TMPDIR/plain dir"
  run_script "$PLAN" "$BATS_TEST_TMPDIR/plain dir" 'true'
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [[ "$stderr" == "error: not inside a git work tree: "* ]]
}
