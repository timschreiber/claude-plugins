bats_require_minimum_version 1.5.0

setup() {
  load test_helper
  SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/recover"
  REPO="$BATS_TEST_TMPDIR/fixture repo"
  make_fixture_repo "$REPO"
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  git -C "$REPO" checkout --quiet -b demo-branch
  PLAN="$REPO/plans/demo plan"
  mkdir -p "$PLAN"
  write_plan demo-branch
  write_milestones
}

# run_script <args...>: runs recover with the stub cygpath first on PATH,
# keeping stderr apart from stdout.
run_script() {
  run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
}

# write_plan <branch>: writes plan.md with `- Branch: <branch>` and a
# Milestones table naming M01-first.md, then M02-second.md.
write_plan() {
  printf '%s\n' \
    '# Plan: Demo' \
    '' \
    "- Branch: $1" \
    '- Status: in-progress' \
    '' \
    '## Milestones' \
    '' \
    '| ID | Title | Status | File |' \
    '|---|---|---|---|' \
    '| M01 | First | done | M01-first.md |' \
    '| M02 | Second | in-progress | M02-second.md |' \
    '' \
    '## Decisions' \
    '' \
    '- D01: Nothing yet.' > "$PLAN/plan.md"
}

# write_milestones: writes M01-first.md (M01-T01 done, M01-T02 todo) and
# M02-second.md (M02-T01 todo, M02-T02 todo, M02-T03 done). M02-T01's Steps
# hold a fenced block with a task heading and a todo status in column 1.
write_milestones() {
  printf '%s\n' \
    '# M01: First' \
    '' \
    '- Status: done' \
    '' \
    '## Tasks' \
    '' \
    '### M01-T01: Do one' \
    '' \
    '- Kind: change' \
    '- Status: done' \
    '' \
    '### M01-T02: Do two' \
    '' \
    '- Kind: change' \
    '- Status: todo' > "$PLAN/M01-first.md"
  printf '%s\n' \
    '# M02: Second' \
    '' \
    '- Status: in-progress' \
    '' \
    '## Tasks' \
    '' \
    '### M02-T01: Do three' \
    '' \
    '- Status: todo' \
    '' \
    '**Steps**' \
    '' \
    '1. Write this example:' \
    '' \
    '````markdown' \
    '```' \
    '### M09-T09: Not a task' \
    '' \
    '- Status: todo' \
    '```' \
    '````' \
    '' \
    '### M02-T02: Do four' \
    '' \
    '- Status: todo' \
    '' \
    '### M02-T03: Do five' \
    '' \
    '- Status: done' > "$PLAN/M02-second.md"
}

# add_commit <subject> [<body>]: adds an empty commit to demo-branch.
add_commit() {
  if [ "$#" -eq 2 ]; then
    git -C "$REPO" commit --quiet --allow-empty -m "$1" -m "$2"
  else
    git -C "$REPO" commit --quiet --allow-empty -m "$1"
  fi
}

# to_crlf <file>: rewrites <file> with CRLF line endings.
to_crlf() {
  awk '{ printf "%s\r\n", $0 }' "$1" > "$1.crlf"
  mv "$1.crlf" "$1"
}

@test "recover prints OK when the plan's branch does not exist" {
  write_plan no-such-branch
  add_commit "chore(plan): M01-T02 done" "Orcastrat-Task: M01-T02"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
  [ -z "$stderr" ]
}

@test "recover prints OK when no todo task has a trailer or a worker commit" {
  add_commit "feat: unrelated work"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
}

@test "recover prints done for a todo task with an Orcastrat-Task trailer" {
  add_commit "chore(plan): M01-T02 done" "Orcastrat-Task: M01-T02"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "$output" = "done M01-T02" ]
}

@test "recover prints done for a todo task with an Orchestratinator-Task trailer" {
  add_commit "feat: four" "Orchestratinator-Task: M02-T02"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "$output" = "done M02-T02" ]
}

@test "recover ignores a trailer for a task that is not todo" {
  add_commit "feat: one" "Orcastrat-Task: M01-T01"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
}

@test "recover matches only a whole trailer line" {
  add_commit "feat: other" "$(printf 'Orcastrat-Task: M02-T021\nRefs Orcastrat-Task: M02-T02')"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
}

@test "recover prints interrupted only for worker commits after the newest trailer commit" {
  add_commit "M01-T02: old attempt"
  add_commit "chore(plan): M01-T01 done" "Orcastrat-Task: M01-T01"
  add_commit "M02-T01: partial work"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "$output" = "interrupted M02-T01" ]
}

@test "recover counts every commit when no commit has a trailer" {
  add_commit "M01-T02: work"
  add_commit "M02-T02: work"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "${#lines[@]}" -eq 2 ]
  [ "${lines[0]}" = "interrupted M01-T02" ]
  [ "${lines[1]}" = "interrupted M02-T02" ]
}

@test "recover prints done, not interrupted, when a task has both" {
  add_commit "chore(plan): M02-T01 done" "Orcastrat-Task: M02-T01"
  add_commit "M02-T01: more work"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "$output" = "done M02-T01" ]
}

@test "recover prints tasks in table order, then task order" {
  add_commit "feat: four" "Orcastrat-Task: M02-T02"
  add_commit "feat: three" "Orchestratinator-Task: M02-T01"
  add_commit "feat: two" "Orcastrat-Task: M01-T02"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "${#lines[@]}" -eq 3 ]
  [ "${lines[0]}" = "done M01-T02" ]
  [ "${lines[1]}" = "done M02-T01" ]
  [ "${lines[2]}" = "done M02-T02" ]
}

@test "recover skips task headings and statuses inside fenced code blocks" {
  add_commit "feat: not a task" "Orcastrat-Task: M09-T09"
  add_commit "feat: three" "Orcastrat-Task: M02-T01"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "$output" = "done M02-T01" ]
}

@test "recover reads plan files with CRLF line endings" {
  to_crlf "$PLAN/plan.md"
  to_crlf "$PLAN/M01-first.md"
  to_crlf "$PLAN/M02-second.md"
  add_commit "feat: four" "Orcastrat-Task: M02-T02"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "$output" = "done M02-T02" ]
}

@test "recover accepts <plan-dir> in both drive-letter forms" {
  command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
  add_commit "feat: two" "Orcastrat-Task: M01-T02"
  run_script "$(cygpath -m "$PLAN")"
  [ "$status" -eq 0 ]
  [ "$output" = "done M01-T02" ]
  run_script "$(cygpath -w "$PLAN")"
  [ "$status" -eq 0 ]
  [ "$output" = "done M01-T02" ]
}

@test "recover ignores trailers and worker commits on other branches" {
  git -C "$REPO" checkout --quiet -b other main
  add_commit "chore(plan): M01-T02 done" "Orcastrat-Task: M01-T02"
  add_commit "M02-T02: work elsewhere"
  git -C "$REPO" checkout --quiet demo-branch
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
}

@test "recover exits 2 with the wrong number of arguments" {
  run_script
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: usage: recover <plan-dir>" ]
}

@test "recover exits 2 when <plan-dir> is not a directory" {
  run_script "$BATS_TEST_TMPDIR/missing"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [[ "$stderr" == "error: not a directory: "* ]]
}

@test "recover exits 2 when <plan-dir> is outside a git work tree" {
  mkdir -p "$BATS_TEST_TMPDIR/plain dir"
  run_script "$BATS_TEST_TMPDIR/plain dir"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [[ "$stderr" == "error: not inside a git work tree: "* ]]
}
