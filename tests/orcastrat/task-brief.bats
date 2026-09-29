bats_require_minimum_version 1.5.0

setup() {
  load test_helper
  SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/task-brief"
  REPO="$BATS_TEST_TMPDIR/fixture repo"
  make_fixture_repo "$REPO"
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  PLAN="$REPO/plans/demo plan"
  BRIEFS="$REPO/.git/orcastrat/demo plan/briefs"
  mkdir -p "$PLAN"
  write_fixture
}

# run_script <args...>: runs task-brief with the stub cygpath first on PATH,
# keeping stderr apart from stdout.
run_script() {
  run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
}

# write_fixture: writes $PLAN/plan.md and $PLAN/M01-first.md.
write_fixture() {
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
    '## Coverage' \
    '' \
    '- `spec.md` 1: a requirement -> M01' \
    '' \
    '## Decisions' \
    '' \
    '- D01: First decision.' \
    '- D02: Second decision.' \
    '' \
    '## Open questions' \
    '' \
    'None.' > "$PLAN/plan.md"

  printf '%s\n' \
    '# M01: First' \
    '' \
    '- Status: in-progress' \
    '- Goal: Demo goal.' \
    '' \
    '## Context' \
    '' \
    'Context line one.' \
    'Conventions: none' \
    '' \
    'Waves: 1 (widths 2)' \
    '' \
    '## Coverage' \
    '' \
    '- `spec.md` 1: a requirement -> M01-T01, M01-T02' \
    '' \
    '## Tasks' \
    '' \
    '### M01-T01: First task' \
    '' \
    '- Kind: change' \
    '- Status: todo' \
    '' \
    '**Steps**' \
    '' \
    '1. Write this:' \
    '' \
    '   ```markdown' \
    '   ### M01-T02: Not a heading' \
    '   ## Context' \
    '   ```' \
    '' \
    '2. Run Verify.' \
    '' \
    '### M01-T02: Second task' \
    '' \
    '- Kind: change' \
    '- Status: todo' \
    '' \
    '**Done when**' \
    '' \
    '- The last line of the file.' > "$PLAN/M01-first.md"
}

# expected_t01 <file>: writes the expected brief of M01-T01 to <file>.
expected_t01() {
  printf '%s\n' \
    '## Decisions' \
    '' \
    '- D01: First decision.' \
    '- D02: Second decision.' \
    '' \
    '## Context' \
    '' \
    'Context line one.' \
    'Conventions: none' \
    '' \
    'Waves: 1 (widths 2)' \
    '' \
    '### M01-T01: First task' \
    '' \
    '- Kind: change' \
    '- Status: todo' \
    '' \
    '**Steps**' \
    '' \
    '1. Write this:' \
    '' \
    '   ```markdown' \
    '   ### M01-T02: Not a heading' \
    '   ## Context' \
    '   ```' \
    '' \
    '2. Run Verify.' \
    '' > "$1"
}

# expected_t02 <file>: writes the expected brief of M01-T02 to <file>.
expected_t02() {
  printf '%s\n' \
    '## Decisions' \
    '' \
    '- D01: First decision.' \
    '- D02: Second decision.' \
    '' \
    '## Context' \
    '' \
    'Context line one.' \
    'Conventions: none' \
    '' \
    'Waves: 1 (widths 2)' \
    '' \
    '### M01-T02: Second task' \
    '' \
    '- Kind: change' \
    '- Status: todo' \
    '' \
    '**Done when**' \
    '' \
    '- The last line of the file.' > "$1"
}

default_output_ok() {
  local task_id="$1"
  local common
  common=$(cd "$REPO/.git" && pwd)
  [ -z "$stderr" ]
  [ "$output" = "cygpath-stub [-m] [$common/orcastrat/demo plan/briefs/$task_id.md]" ]
}

@test "task-brief writes Decisions, Context and the task block, in that order" {
  run_script "$PLAN" M01-T01
  [ "$status" -eq 0 ]
  default_output_ok M01-T01
  expected_t01 "$BATS_TEST_TMPDIR/expected.md"
  diff "$BRIEFS/M01-T01.md" "$BATS_TEST_TMPDIR/expected.md"
}

@test "task-brief prints only the brief path, through print_path" {
  run_script "$PLAN" M01-T01
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  common=$(cd "$REPO/.git" && pwd)
  [ "$output" = "cygpath-stub [-m] [$common/orcastrat/demo plan/briefs/M01-T01.md]" ]
}

@test "task-brief keeps fenced headings inside the task block" {
  run_script "$PLAN" M01-T01
  [ "$status" -eq 0 ]
  default_output_ok M01-T01
  grep -qxF '   ### M01-T02: Not a heading' "$BRIEFS/M01-T01.md"
  ! grep -qxF '### M01-T02: Second task' "$BRIEFS/M01-T01.md"
  [ "$(grep -cxF '## Context' "$BRIEFS/M01-T01.md")" -eq 1 ]
}

@test "the last task block runs to the end of the file" {
  run_script "$PLAN" M01-T02
  [ "$status" -eq 0 ]
  default_output_ok M01-T02
  expected_t02 "$BATS_TEST_TMPDIR/expected.md"
  diff "$BRIEFS/M01-T02.md" "$BATS_TEST_TMPDIR/expected.md"
}

@test "task-brief overwrites an existing brief" {
  mkdir -p "$BRIEFS"
  printf 'stale line\n' > "$BRIEFS/M01-T01.md"
  run_script "$PLAN" M01-T01
  [ "$status" -eq 0 ]
  default_output_ok M01-T01
  expected_t01 "$BATS_TEST_TMPDIR/expected.md"
  diff "$BRIEFS/M01-T01.md" "$BATS_TEST_TMPDIR/expected.md"
}

@test "task-brief strips carriage returns" {
  for f in "$PLAN/plan.md" "$PLAN/M01-first.md"; do
    awk '{ printf "%s\r\n", $0 }' "$f" > "$f.crlf"
    mv "$f.crlf" "$f"
  done
  run_script "$PLAN" M01-T01
  [ "$status" -eq 0 ]
  default_output_ok M01-T01
  ! grep -q "$(printf '\r')" "$BRIEFS/M01-T01.md"
  expected_t01 "$BATS_TEST_TMPDIR/expected.md"
  diff "$BRIEFS/M01-T01.md" "$BATS_TEST_TMPDIR/expected.md"
}

@test "task-brief from a linked worktree writes the brief in the common git dir" {
  git -C "$REPO" add -A
  git -C "$REPO" commit --quiet -m fixture
  git -C "$REPO" worktree add --quiet -b other "$BATS_TEST_TMPDIR/other tree"
  run_script "$BATS_TEST_TMPDIR/other tree/plans/demo plan" M01-T01
  [ "$status" -eq 0 ]
  expected_t01 "$BATS_TEST_TMPDIR/expected.md"
  diff "$BRIEFS/M01-T01.md" "$BATS_TEST_TMPDIR/expected.md"
}

@test "task-brief accepts <plan-dir> in both drive-letter forms" {
  command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
  win_m=$(cygpath -m "$PLAN")
  win_w=$(cygpath -w "$PLAN")
  run_script "$win_m" M01-T01
  [ "$status" -eq 0 ]
  expected_t01 "$BATS_TEST_TMPDIR/expected.md"
  diff "$BRIEFS/M01-T01.md" "$BATS_TEST_TMPDIR/expected.md"
  run_script "$win_w" M01-T01
  [ "$status" -eq 0 ]
  diff "$BRIEFS/M01-T01.md" "$BATS_TEST_TMPDIR/expected.md"
}

@test "task-brief exits 2 with the wrong number of arguments" {
  run_script
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: usage: task-brief <plan-dir> <task-id>" ]

  run_script "$PLAN"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: usage: task-brief <plan-dir> <task-id>" ]

  run_script "$PLAN" M01-T01 extra
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: usage: task-brief <plan-dir> <task-id>" ]
}

@test "task-brief exits 2 when <plan-dir> is not a directory" {
  run_script "$REPO/plans/missing" M01-T01
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not a directory: cygpath-stub [-m] [$REPO/plans/missing]" ]
}

@test "task-brief exits 2 outside a git work tree" {
  mkdir -p "$BATS_TEST_TMPDIR/plain dir"
  cp "$PLAN/plan.md" "$BATS_TEST_TMPDIR/plain dir/plan.md"
  run_script "$BATS_TEST_TMPDIR/plain dir" M01-T01
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not inside a git work tree: cygpath-stub [-m] [$BATS_TEST_TMPDIR/plain dir]" ]
}

@test "task-brief exits 2 when plan.md is missing" {
  mkdir -p "$REPO/plans/empty"
  run_script "$REPO/plans/empty" M01-T01
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: no plan.md in: cygpath-stub [-m] [$REPO/plans/empty]" ]
}

@test "task-brief exits 2 for an unknown task" {
  run_script "$PLAN" M01-T09
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: task not found: M01-T09" ]
  [ ! -d "$BRIEFS" ] || [ -z "$(ls -A "$BRIEFS")" ]

  run_script "$PLAN" M02-T01
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: task not found: M02-T01" ]
  [ ! -d "$BRIEFS" ] || [ -z "$(ls -A "$BRIEFS")" ]

  run_script "$PLAN" T01
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not a task ID: T01" ]
  [ ! -d "$BRIEFS" ] || [ -z "$(ls -A "$BRIEFS")" ]
}
