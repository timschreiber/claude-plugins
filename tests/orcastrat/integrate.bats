bats_require_minimum_version 1.5.0

setup() {
  load test_helper
  SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/integrate"
  REPO="$BATS_TEST_TMPDIR/fixture repo"
  make_fixture_repo "$REPO"
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  BASE="$(git -C "$REPO" rev-parse HEAD)"
  git -C "$REPO" branch task
  cd "$REPO"
}

# run_script <args...>: runs integrate in the current directory with the stub
# cygpath first on PATH, keeping stderr apart from stdout.
run_script() {
  run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
}

# commit_on <branch> <path> <content> <message>: checks out <branch>, writes
# <content> to <path>, commits it with <message>, and checks out main again.
commit_on() {
  git -C "$REPO" checkout --quiet "$1"
  printf '%s\n' "$3" > "$REPO/$2"
  git -C "$REPO" add -- "$2"
  git -C "$REPO" commit --quiet -m "$4"
  git -C "$REPO" checkout --quiet main
}

@test "integrate cherry-picks every commit of the range onto the current branch and prints OK" {
  commit_on task "a.txt" "a" "M01-T01: add a"
  commit_on task "b.txt" "b" "$(printf 'M01-T01: add b\n\nOrcastrat-Task: M01-T01')"
  commit_on main "c.txt" "c" "main moves on"
  run_script task "$BASE"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
  [ -z "$stderr" ]
  run git -C "$REPO" log --format=%s -3
  [ "${lines[0]}" = "M01-T01: add b" ]
  [ "${lines[1]}" = "M01-T01: add a" ]
  [ "${lines[2]}" = "main moves on" ]
  run git -C "$REPO" log -1 --format=%b
  [ "$output" = "Orcastrat-Task: M01-T01" ]
}

@test "integrate prints OK and changes nothing for an empty range" {
  head_before="$(git -C "$REPO" rev-parse HEAD)"
  run_script task "$BASE"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
  [ "$(git -C "$REPO" rev-parse HEAD)" = "$head_before" ]
}

@test "integrate leaves a conflicting cherry-pick in progress and prints CONFLICT and the conflicted files" {
  commit_on task "shared file.txt" "task version" "M01-T01: task edit"
  commit_on main "shared file.txt" "main version" "main edit"
  run_script task "$BASE"
  [ "$status" -eq 0 ]
  [ "${#lines[@]}" -eq 2 ]
  [ "${lines[0]}" = "CONFLICT" ]
  [ "${lines[1]}" = "cygpath-stub [-m] [shared file.txt]" ]
  git -C "$REPO" rev-parse --verify --quiet CHERRY_PICK_HEAD
}

@test "integrate aborts and exits 2 when a commit becomes empty" {
  commit_on task "same.txt" "same" "M01-T01: add same"
  commit_on main "same.txt" "same" "main adds the same file"
  head_before="$(git -C "$REPO" rev-parse HEAD)"
  run_script task "$BASE"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [[ "$stderr" == "error: cherry-pick of "*" failed; nothing was applied" ]]
  [ "$(git -C "$REPO" rev-parse HEAD)" = "$head_before" ]
  ! git -C "$REPO" rev-parse --verify --quiet CHERRY_PICK_HEAD
  [ ! -d "$REPO/.git/sequencer" ]
}

@test "integrate aborts and exits 2 when local changes are in the way" {
  commit_on task "a.txt" "a" "M01-T01: add a"
  commit_on task "README.md" "task readme" "M01-T01: edit readme"
  printf 'local edit\n' > "$REPO/README.md"
  head_before="$(git -C "$REPO" rev-parse HEAD)"
  run_script task "$BASE"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [[ "$stderr" == "error: cherry-pick of "*" failed; nothing was applied" ]]
  [ "$(git -C "$REPO" rev-parse HEAD)" = "$head_before" ]
  [ "$(cat "$REPO/README.md")" = "local edit" ]
  ! git -C "$REPO" rev-parse --verify --quiet CHERRY_PICK_HEAD
  [ ! -d "$REPO/.git/sequencer" ]
}

@test "integrate exits 2 with the wrong number of arguments" {
  run_script task
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: usage: integrate <task-branch> <base>" ]
}

@test "integrate exits 2 when <task-branch> is not a commit" {
  run_script no-such-branch "$BASE"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not a commit: no-such-branch" ]
}

@test "integrate exits 2 when <base> is not a commit" {
  run_script task no-such-commit
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not a commit: no-such-commit" ]
}

@test "integrate exits 2 outside a git work tree" {
  mkdir -p "$BATS_TEST_TMPDIR/plain dir"
  cd "$BATS_TEST_TMPDIR/plain dir"
  run_script task "$BASE"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [[ "$stderr" == "error: not inside a git work tree: "* ]]
}
