bats_require_minimum_version 1.5.0

setup() {
  load test_helper
  SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/push-check"
  REPO="$BATS_TEST_TMPDIR/fixture repo"
  make_fixture_repo "$REPO"
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  BASE="$(git -C "$REPO" rev-parse HEAD)"
}

# run_script <args...>: runs push-check with the stub cygpath first on PATH,
# keeping stderr apart from stdout.
run_script() {
  run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
}

# commit_change <subject>: commits one new file named after the subject.
commit_change() {
  printf '%s\n' "$1" > "$REPO/$1.txt"
  git -C "$REPO" add -- "$1.txt"
  git -C "$REPO" commit --quiet -m "$1"
}

@test "push-check prints OK when no commit is on a remote" {
  commit_change "first change"
  commit_change "second change"
  run_script "$REPO" "$BASE"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
  [ -z "$stderr" ]
}

@test "push-check prints OK when <base> is HEAD" {
  git -C "$REPO" update-ref refs/remotes/origin/main "$BASE"
  run_script "$REPO" "$BASE"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
}

@test "push-check prints each pushed commit, oldest first, as full sha and subject" {
  commit_change "first change"
  first="$(git -C "$REPO" rev-parse HEAD)"
  commit_change "second change"
  second="$(git -C "$REPO" rev-parse HEAD)"
  commit_change "third change"
  git -C "$REPO" update-ref refs/remotes/origin/main "$second"
  run_script "$REPO" "$BASE"
  [ "$status" -eq 0 ]
  [ "${#lines[@]}" -eq 2 ]
  [ "${lines[0]}" = "$first first change" ]
  [ "${lines[1]}" = "$second second change" ]
}

@test "push-check ignores commits at or before <base>" {
  commit_change "first change"
  git -C "$REPO" update-ref refs/remotes/origin/main HEAD
  base2="$(git -C "$REPO" rev-parse HEAD)"
  commit_change "second change"
  run_script "$REPO" "$base2"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
}

@test "push-check accepts <dir> in both drive-letter forms" {
  command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
  commit_change "first change"
  first="$(git -C "$REPO" rev-parse HEAD)"
  git -C "$REPO" update-ref refs/remotes/origin/main "$first"
  win_m="$(cygpath -m "$REPO")"
  win_w="$(cygpath -w "$REPO")"
  run_script "$win_m" "$BASE"
  [ "$status" -eq 0 ]
  [ "$output" = "$first first change" ]
  run_script "$win_w" "$BASE"
  [ "$status" -eq 0 ]
  [ "$output" = "$first first change" ]
}

@test "push-check checks the HEAD of a linked worktree" {
  git -C "$REPO" worktree add --quiet -b task "$BATS_TEST_TMPDIR/task tree"
  printf 'w\n' > "$BATS_TEST_TMPDIR/task tree/w.txt"
  git -C "$BATS_TEST_TMPDIR/task tree" add w.txt
  git -C "$BATS_TEST_TMPDIR/task tree" commit --quiet -m "worktree change"
  sha="$(git -C "$BATS_TEST_TMPDIR/task tree" rev-parse HEAD)"
  git -C "$REPO" update-ref refs/remotes/origin/task "$sha"
  run_script "$BATS_TEST_TMPDIR/task tree" "$BASE"
  [ "$status" -eq 0 ]
  [ "$output" = "$sha worktree change" ]
  run_script "$REPO" "$BASE"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
}

@test "push-check exits 2 with the wrong number of arguments" {
  run_script "$REPO"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: usage: push-check <dir> <base>" ]
}

@test "push-check exits 2 when <dir> is not a directory" {
  run_script "$BATS_TEST_TMPDIR/missing" "$BASE"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [[ "$stderr" == "error: not a directory: "* ]]
}

@test "push-check exits 2 when <dir> is outside a git work tree" {
  mkdir -p "$BATS_TEST_TMPDIR/plain dir"
  run_script "$BATS_TEST_TMPDIR/plain dir" "$BASE"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [[ "$stderr" == "error: not inside a git work tree: "* ]]
}

@test "push-check exits 2 when <base> is not a commit" {
  run_script "$REPO" "no-such-commit"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not a commit: no-such-commit" ]
}
