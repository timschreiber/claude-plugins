bats_require_minimum_version 1.5.0

setup() {
  load test_helper
  SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/scope-check"
  REPO="$BATS_TEST_TMPDIR/fixture repo"
  make_fixture_repo "$REPO"
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  BASE="$(git -C "$REPO" rev-parse HEAD)"
}

# run_script <args...>: runs scope-check with the stub cygpath first on PATH,
# keeping stderr apart from stdout.
run_script() {
  run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
}

# write_file <path> <content>: writes <content> to <path> inside the fixture repo.
write_file() {
  mkdir -p "$(dirname "$REPO/$1")"
  printf '%s\n' "$2" > "$REPO/$1"
}

# commit_file <path> <content>: writes <path> and commits it.
commit_file() {
  write_file "$1" "$2"
  git -C "$REPO" add -- "$1"
  git -C "$REPO" commit --quiet -m "add $1"
}

@test "scope-check prints OK when every changed path is in the files" {
  commit_file "src/a.txt" "a"
  write_file "src/b.txt" "b"
  run_script "$REPO" "$BASE" "src/a.txt" "src/b.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
  [ -z "$stderr" ]
}

@test "scope-check prints committed and uncommitted paths outside the files through print_path" {
  commit_file "src/a.txt" "a"
  commit_file "extra.txt" "x"
  write_file "notes/x.md" "n"
  run_script "$REPO" "$BASE" "src/a.txt"
  [ "$status" -eq 0 ]
  [ "${#lines[@]}" -eq 2 ]
  [ "${lines[0]}" = "cygpath-stub [-m] [extra.txt]" ]
  [ "${lines[1]}" = "cygpath-stub [-m] [notes/x.md]" ]
}

@test "scope-check lists a modified tracked file" {
  write_file "README.md" "changed"
  run_script "$REPO" "$BASE" "src/a.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "cygpath-stub [-m] [README.md]" ]
}

@test "scope-check lists both paths of a staged rename" {
  mkdir -p "$REPO/docs"
  git -C "$REPO" mv README.md docs/README.md
  run_script "$REPO" "$BASE" "docs/README.md"
  [ "$status" -eq 0 ]
  [ "$output" = "cygpath-stub [-m] [README.md]" ]
}

@test "scope-check matches names with spaces and non-ASCII characters exactly" {
  write_file "src/a b.txt" "a"
  write_file "café.txt" "c"
  run_script "$REPO" "$BASE" "src/a b.txt" "café.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
}

@test "scope-check prints names with spaces and non-ASCII characters unquoted" {
  write_file "src/a b.txt" "a"
  write_file "café.txt" "c"
  run_script "$REPO" "$BASE" "other.txt"
  [ "$status" -eq 0 ]
  [ "${#lines[@]}" -eq 2 ]
  [ "${lines[0]}" = "cygpath-stub [-m] [café.txt]" ]
  [ "${lines[1]}" = "cygpath-stub [-m] [src/a b.txt]" ]
}

@test "scope-check lists an untracked file in a new directory by its full path" {
  write_file "newdir/sub/file.txt" "f"
  run_script "$REPO" "$BASE" "newdir/sub/file.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
  run_script "$REPO" "$BASE" "other.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "cygpath-stub [-m] [newdir/sub/file.txt]" ]
}

@test "scope-check prints a path that is both committed and modified once" {
  commit_file "extra.txt" "x"
  write_file "extra.txt" "y"
  run_script "$REPO" "$BASE" "src/a.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "cygpath-stub [-m] [extra.txt]" ]
}

@test "scope-check accepts <dir> in both drive-letter forms" {
  command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
  commit_file "extra.txt" "x"
  win_m="$(cygpath -m "$REPO")"
  win_w="$(cygpath -w "$REPO")"
  run_script "$win_m" "$BASE" "src/a.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "cygpath-stub [-m] [extra.txt]" ]
  run_script "$win_w" "$BASE" "extra.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
}

@test "scope-check lists a deleted tracked file" {
  rm "$REPO/README.md"
  run_script "$REPO" "$BASE" "src/a.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "cygpath-stub [-m] [README.md]" ]
}

@test "scope-check checks a linked worktree against its own HEAD" {
  git -C "$REPO" worktree add --quiet -b task "$BATS_TEST_TMPDIR/task tree"
  printf 'w\n' > "$BATS_TEST_TMPDIR/task tree/in-tree.txt"
  printf 'm\n' > "$REPO/main-only.txt"
  run_script "$BATS_TEST_TMPDIR/task tree" "$BASE" "other.txt"
  [ "$status" -eq 0 ]
  [ "$output" = "cygpath-stub [-m] [in-tree.txt]" ]
}

@test "scope-check exits 2 with fewer than three arguments" {
  run_script "$REPO" "$BASE"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: usage: scope-check <dir> <base> <files...>" ]
}

@test "scope-check exits 2 when <dir> is not a directory" {
  run_script "$BATS_TEST_TMPDIR/missing" "$BASE" "a.txt"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [[ "$stderr" == "error: not a directory: "* ]]
}

@test "scope-check exits 2 when <dir> is outside a git work tree" {
  mkdir -p "$BATS_TEST_TMPDIR/plain dir"
  run_script "$BATS_TEST_TMPDIR/plain dir" "$BASE" "a.txt"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [[ "$stderr" == "error: not inside a git work tree: "* ]]
}

@test "scope-check exits 2 when <base> is not a commit" {
  run_script "$REPO" "no-such-commit" "a.txt"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not a commit: no-such-commit" ]
}
