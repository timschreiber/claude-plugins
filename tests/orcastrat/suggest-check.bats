bats_require_minimum_version 1.5.0

setup() {
  load test_helper
  SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/suggest-check"
  REPO="$BATS_TEST_TMPDIR/fixture repo"
  make_fixture_repo "$REPO"
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  PLAN="$REPO/plans/demo plan"
  mkdir -p "$PLAN/notes/reviews"
}

# run_script <args...>: runs suggest-check with the stub cygpath first on
# PATH, keeping stderr apart from stdout.
run_script() {
  run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
}

# write_reviews: writes six review-note files under $PLAN/notes.
write_reviews() {
  printf '%s\n' \
    '# M01 review' \
    '' \
    '## Blocking' \
    '' \
    '- [85/90] missing-test: src/a.sh:3 — no test for the error path (M01-T01)' \
    '' \
    '## Advisory' \
    '' \
    '- [40] naming: src/a.sh:9 — unclear name (M01-T01)' \
    '- [90/30] security: src/a.sh:12 — eval of input (M01-T02) — validator: not reachable' \
    > "$PLAN/notes/M01-review.md"

  printf '%s\n' \
    '## Blocking' \
    '' \
    'None.' \
    '' \
    '## Advisory' \
    '' \
    '- [50] security: src/b.sh:4 — unquoted variable (M01-T02)' \
    > "$PLAN/notes/reviews/M01-T02-attempt1.md"

  printf '%s\n' \
    '## Blocking' \
    '' \
    'None.' \
    '' \
    '## Advisory' \
    '' \
    '- [60] missing-test: src/c.sh:2 — no test (M02-T01)' \
    > "$PLAN/notes/M02-review-2.md"

  printf '%s\n' \
    '## Advisory' \
    '' \
    '- [70/none] naming: src/d.sh:1 — vague (M03-T01) — validator: no score' \
    > "$PLAN/notes/reviews/M03-T01-attempt2.md"

  printf '%s\n' \
    '## Issues' \
    '' \
    '1. [80] missing-test: M04-T01 — check 6 — no failing test' \
    > "$PLAN/notes/M04-plan-review.md"

  printf '%s\n' \
    '## Advisory' \
    '' \
    '`src/e.sh:5` — security: old-style finding (M05-T01)' \
    > "$PLAN/notes/M05-review.md"
}

@test "recurring categories are printed with their milestones" {
  write_reviews
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  expected=$'missing-test M01 M02\nnaming M01 M03'
  [ "$output" = "$expected" ]
}

@test "plan reviews don't count toward a recurring category" {
  printf '%s\n' \
    '## Blocking' \
    '' \
    '- [90/85] security: src/a.sh:1 — eval (M01-T01)' \
    > "$PLAN/notes/M01-review.md"

  printf '%s\n' \
    '## Issues' \
    '' \
    '1. [80] security: M02-T01 — check 2 — unsourced' \
    '' \
    '## Advisory' \
    '' \
    '- [80] security: M02-T02 — check 4 — unsourced' \
    > "$PLAN/notes/M02-plan-review.md"

  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$output" = "OK" ]
}

@test "a category already suggested is not printed again" {
  write_reviews
  printf '%s\n' \
    '# Instruction suggestions' \
    '' \
    '## naming' \
    '' \
    '- Kind: rule' \
    '' \
    '```text' \
    '## missing-test' \
    '```' \
    > "$PLAN/notes/instruction-suggestions.md"

  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$output" = "missing-test M01 M02" ]
}

@test "every recurring category already suggested prints OK" {
  write_reviews
  printf '%s\n' \
    '## missing-test' \
    '## naming' \
    > "$PLAN/notes/instruction-suggestions.md"

  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$output" = "OK" ]
}

@test "no review notes prints OK" {
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$output" = "OK" ]
}

@test "suggest-check accepts carriage returns" {
  write_reviews
  find "$PLAN/notes" -type f | while IFS= read -r f; do
    awk '{ printf "%s\r\n", $0 }' "$f" > "$f.crlf"
    mv "$f.crlf" "$f"
  done

  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  expected=$'missing-test M01 M02\nnaming M01 M03'
  [ "$output" = "$expected" ]
}

@test "suggest-check exits 2 with the wrong number of arguments" {
  run_script
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: usage: suggest-check <plan-dir>" ]

  run_script "$PLAN" extra
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: usage: suggest-check <plan-dir>" ]
}

@test "suggest-check exits 2 when <plan-dir> is not a directory" {
  run_script "$REPO/plans/missing"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not a directory: cygpath-stub [-m] [$REPO/plans/missing]" ]
}

@test "suggest-check exits 2 outside a git work tree" {
  mkdir -p "$BATS_TEST_TMPDIR/plain dir"
  run_script "$BATS_TEST_TMPDIR/plain dir"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not inside a git work tree: cygpath-stub [-m] [$BATS_TEST_TMPDIR/plain dir]" ]
}

@test "suggest-check accepts <plan-dir> in both drive-letter forms" {
  command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
  write_reviews
  win_m=$(cygpath -m "$PLAN")
  win_w=$(cygpath -w "$PLAN")
  expected=$'missing-test M01 M02\nnaming M01 M03'

  run_script "$win_m"
  [ "$status" -eq 0 ]
  [ "$output" = "$expected" ]

  run_script "$win_w"
  [ "$status" -eq 0 ]
  [ "$output" = "$expected" ]
}
