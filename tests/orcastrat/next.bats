bats_require_minimum_version 1.5.0

setup() {
  load test_helper
  SCRIPT="$REPO_ROOT/plugins/orcastrat/scripts/next"
  REPO="$BATS_TEST_TMPDIR/fixture repo"
  make_fixture_repo "$REPO"
  make_cygpath_stub "$BATS_TEST_TMPDIR/stub-bin"
  git -C "$REPO" checkout --quiet -b demo-branch
  PLAN="$REPO/plans/demo plan"
  mkdir -p "$PLAN/notes"
}

# run_script <args...>: runs next with the stub cygpath first on PATH,
# keeping stderr apart from stdout.
run_script() {
  run --separate-stderr env PATH="$BATS_TEST_TMPDIR/stub-bin:$PATH" bash "$SCRIPT" "$@"
}

# out_line <key>: prints the line of $output that starts with "<key>: ".
out_line() {
  printf '%s\n' "$output" | grep "^$1: "
}

# write_plan <plan status> <M01 status> <M02 status> [<open-question line>...]
write_plan() {
  local plan_status="$1" m01_status="$2" m02_status="$3"
  shift 3
  printf '%s\n' \
    '# Plan: Demo' \
    '' \
    '- Branch: demo-branch' \
    "- Status: $plan_status" \
    '' \
    '## Milestones' \
    '' \
    '| ID | Title | Status | File |' \
    '|---|---|---|---|' \
    "| M01 | First | $m01_status | M01-first.md |" \
    "| M02 | Second | $m02_status | M02-second.md |" \
    '' \
    '## Decisions' \
    '' \
    '- D01: A decision next never reads.' \
    '' \
    '## Open questions' \
    '' > "$PLAN/plan.md"
  if [ "$#" -eq 0 ]; then
    printf '%s\n' 'None.' >> "$PLAN/plan.md"
  else
    printf '%s\n' "$@" >> "$PLAN/plan.md"
  fi
}

# write_milestone <file> <status> [<task ID>:<status>:<wave>:<tier>...]
write_milestone() {
  local file="$1" status="$2"
  shift 2
  local mid="${file%%-*}"
  printf '%s\n' \
    "# $mid: Demo" \
    '' \
    "- Status: $status" \
    '' \
    '## Context' \
    '' \
    'Nothing here.' > "$PLAN/$file"
  if [ "$#" -gt 0 ]; then
    printf '%s\n' '' '## Tasks' >> "$PLAN/$file"
    local task tid tstatus twave ttier
    for task in "$@"; do
      IFS=: read -r tid tstatus twave ttier <<< "$task"
      printf '%s\n' \
        '' \
        "### $tid: Demo task" \
        '' \
        '- Kind: change' \
        "- Tier: $ttier" \
        "- Status: $tstatus" \
        "- Wave: $twave" >> "$PLAN/$file"
    done
  fi
}

# commit_all <message>
commit_all() {
  git -C "$REPO" add -A
  git -C "$REPO" commit --quiet -m "$1"
}

# fresh_plan: a plan with both milestones outline.
fresh_plan() {
  write_plan planned outline outline
  write_milestone M01-first.md outline
  write_milestone M02-second.md outline
  commit_all plan
}

# mid_wave_plan: M01 done, M02 in-progress with a mix of done and todo tasks
# across waves 1, 2, 3 and 10.
mid_wave_plan() {
  write_plan in-progress done in-progress
  write_milestone M01-first.md done M01-T01:done:1:worker
  write_milestone M02-second.md in-progress M02-T01:done:1:worker M02-T02:todo:2:worker-heavy M02-T03:todo:2:specialist M02-T04:todo:3:worker M02-T05:todo:10:worker
  commit_all plan
}

@test "fresh plan: next surveys the first outline milestone" {
  fresh_plan
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line plan)" = 'plan: planned' ]
  [ "$(out_line milestone)" = "milestone: M01 outline cygpath-stub [-m] [$PLAN/M01-first.md]" ]
  [ "$(out_line next)" = 'next: survey M01' ]
  [ "$(out_line wave)" = 'wave: none' ]
  [ "$(out_line blocked)" = 'blocked: none' ]
  [ "$(out_line open-questions)" = 'open-questions: 0' ]
}

@test "next prints its lines in order" {
  fresh_plan
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  local keys
  keys=$(printf '%s\n' "$output" | awk -F: '{print $1}' | tr '\n' ' ')
  keys=${keys% }
  [ "$keys" = 'plan milestone next wave blocked open-questions' ]
}

@test "survey committed: next details the milestone" {
  fresh_plan
  printf 'survey\n' > "$PLAN/notes/M01-survey.md"
  commit_all survey
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line next)" = 'next: detail M01' ]
}

@test "an untracked survey note doesn't count as committed" {
  fresh_plan
  printf 'survey\n' > "$PLAN/notes/M01-survey.md"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line next)" = 'next: survey M01' ]
}

@test "detailed but uncommitted: next starts the milestone" {
  fresh_plan
  printf 'survey\n' > "$PLAN/notes/M01-survey.md"
  commit_all survey
  write_plan planned ready outline
  write_milestone M01-first.md ready M01-T01:todo:1:worker M01-T02:todo:1:worker-light M01-T03:todo:2:worker
  printf 'review\n' > "$PLAN/notes/M01-plan-review.md"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line milestone)" = "milestone: M01 ready cygpath-stub [-m] [$PLAN/M01-first.md]" ]
  [ "$(out_line next)" = 'next: start M01' ]
  [ "$(out_line wave)" = 'wave: 1 M01-T01:worker M01-T02:worker-light' ]
}

@test "mid-wave: next names the lowest wave with todo tasks" {
  mid_wave_plan
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line plan)" = 'plan: in-progress' ]
  [ "$(out_line milestone)" = "milestone: M02 in-progress cygpath-stub [-m] [$PLAN/M02-second.md]" ]
  [ "$(out_line next)" = 'next: wave 2' ]
  [ "$(out_line wave)" = 'wave: 2 M02-T02:worker-heavy M02-T03:specialist' ]
  [ "$(out_line blocked)" = 'blocked: none' ]
}

@test "blocked with open questions: next is blocked and counts the questions" {
  write_plan blocked blocked outline \
    '- (M01-T02) [ambiguous] First question?' \
    '  Where: somewhere' \
    '- (M01-T02) [assumption] Second question?' \
    '  Where: elsewhere'
  write_milestone M01-first.md blocked M01-T01:done:1:worker M01-T02:blocked:1:worker
  write_milestone M02-second.md outline
  commit_all plan
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line next)" = 'next: blocked' ]
  [ "$(out_line blocked)" = 'blocked: M01 M01-T02' ]
  [ "$(out_line open-questions)" = 'open-questions: 2' ]
  [ "$(out_line wave)" = 'wave: none' ]
}

@test "a blocked task makes next blocked while the plan is in-progress" {
  write_plan in-progress in-progress outline
  write_milestone M01-first.md in-progress M01-T01:blocked:1:worker M01-T02:todo:1:worker
  write_milestone M02-second.md outline
  commit_all plan
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line next)" = 'next: blocked' ]
  [ "$(out_line blocked)" = 'blocked: M01-T01' ]
  [ "$(out_line wave)" = 'wave: 1 M01-T02:worker' ]
}

@test "milestone done awaiting review: next runs the milestone verify" {
  write_plan in-progress in-progress outline
  write_milestone M01-first.md in-progress M01-T01:done:1:worker M01-T02:done:2:worker
  write_milestone M02-second.md outline
  commit_all plan
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line next)" = 'next: milestone-verify M01' ]
  [ "$(out_line wave)" = 'wave: none' ]
}

@test "a committed review note: next goes to the review" {
  write_plan in-progress in-progress outline
  write_milestone M01-first.md in-progress M01-T01:done:1:worker M01-T02:done:2:worker
  write_milestone M02-second.md outline
  printf 'review\n' > "$PLAN/notes/M01-review.md"
  commit_all plan
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line next)" = 'next: review M01' ]
}

@test "every milestone done: next runs the final verify" {
  write_plan in-progress done done
  write_milestone M01-first.md done M01-T01:done:1:worker
  write_milestone M02-second.md done M02-T01:done:1:worker
  commit_all plan
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line milestone)" = 'milestone: none' ]
  [ "$(out_line next)" = 'next: final-verify' ]
  [ "$(out_line wave)" = 'wave: none' ]
}

@test "plan complete: next is complete" {
  write_plan complete done done
  write_milestone M01-first.md done M01-T01:done:1:worker
  write_milestone M02-second.md done M02-T01:done:1:worker
  commit_all plan
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line plan)" = 'plan: complete' ]
  [ "$(out_line milestone)" = 'milestone: none' ]
  [ "$(out_line next)" = 'next: complete' ]
}

@test "next never reads Decisions" {
  mid_wave_plan
  awk '{ print } $0 == "- D01: A decision next never reads." { print "| M09 | Fake | blocked | M09-fake.md |"; print "- Status: blocked"; print "- D02: - (M02-T02) not a question" }' "$PLAN/plan.md" > "$PLAN/plan.md.tmp"
  mv "$PLAN/plan.md.tmp" "$PLAN/plan.md"
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line plan)" = 'plan: in-progress' ]
  [ "$(out_line milestone)" = "milestone: M02 in-progress cygpath-stub [-m] [$PLAN/M02-second.md]" ]
  [ "$(out_line next)" = 'next: wave 2' ]
  [ "$(out_line wave)" = 'wave: 2 M02-T02:worker-heavy M02-T03:specialist' ]
  [ "$(out_line blocked)" = 'blocked: none' ]
  [ "$(out_line open-questions)" = 'open-questions: 0' ]
}

@test "task headings inside code fences are ignored" {
  write_plan in-progress in-progress outline
  write_milestone M01-first.md in-progress M01-T01:done:1:worker
  printf '%s\n' \
    '' \
    '```markdown' \
    '### M01-T09: Not a task' \
    '- Tier: worker' \
    '- Status: todo' \
    '- Wave: 1' \
    '```' >> "$PLAN/M01-first.md"
  write_milestone M02-second.md outline
  commit_all plan
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line next)" = 'next: milestone-verify M01' ]
  [ "$(out_line wave)" = 'wave: none' ]
}

@test "next reads CRLF plan files" {
  mid_wave_plan
  local f
  for f in plan.md M01-first.md M02-second.md; do
    awk '{ printf "%s\r\n", $0 }' "$PLAN/$f" > "$PLAN/$f.tmp"
    mv "$PLAN/$f.tmp" "$PLAN/$f"
  done
  run_script "$PLAN"
  [ "$status" -eq 0 ]
  [ -z "$stderr" ]
  [ "$(out_line plan)" = 'plan: in-progress' ]
  [ "$(out_line next)" = 'next: wave 2' ]
  [ "$(out_line wave)" = 'wave: 2 M02-T02:worker-heavy M02-T03:specialist' ]
  [[ "$output" != *$'\r'* ]]
}

@test "next accepts <plan-dir> in both drive-letter forms" {
  command -v cygpath >/dev/null 2>&1 || skip "cygpath is not available"
  fresh_plan
  local win_m win_w
  win_m=$(cygpath -m "$PLAN")
  win_w=$(cygpath -w "$PLAN")
  run_script "$win_m"
  [ "$status" -eq 0 ]
  [ "$(out_line next)" = 'next: survey M01' ]
  run_script "$win_w"
  [ "$status" -eq 0 ]
  [ "$(out_line next)" = 'next: survey M01' ]
}

@test "next exits 2 with the wrong number of arguments" {
  run_script
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: usage: next <plan-dir>' ]

  run_script "$PLAN" extra
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = 'error: usage: next <plan-dir>' ]
}

@test "next exits 2 when <plan-dir> is not a directory" {
  run_script "$REPO/plans/missing"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not a directory: cygpath-stub [-m] [$REPO/plans/missing]" ]
}

@test "next exits 2 outside a git work tree" {
  mkdir -p "$BATS_TEST_TMPDIR/plain dir"
  local saved_plan="$PLAN"
  PLAN="$BATS_TEST_TMPDIR/plain dir"
  write_plan planned outline outline
  PLAN="$saved_plan"
  run_script "$BATS_TEST_TMPDIR/plain dir"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: not inside a git work tree: cygpath-stub [-m] [$BATS_TEST_TMPDIR/plain dir]" ]
}

@test "next exits 2 when plan.md is missing" {
  mkdir -p "$REPO/plans/empty"
  run_script "$REPO/plans/empty"
  [ "$status" -eq 2 ]
  [ -z "$output" ]
  [ "$stderr" = "error: no plan.md in: cygpath-stub [-m] [$REPO/plans/empty]" ]
}
