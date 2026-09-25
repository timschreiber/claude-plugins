setup() {
  load test_helper
  AGENTS="$REPO_ROOT/plugins/orcastrat/agents"
}

# The agents the list-based tests below cover. The task that brings an agent
# file up to date adds its name here.
WORKER_AGENTS='worker-mini-serial worker-mini-parallel worker-light worker worker-heavy specialist'
NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer planner merger'
NO_SHELL_AGENTS='plan-reviewer planner merger'

# field <file> <key>: prints the value of the frontmatter line "<key>: <value>"
# of <file>, ignoring carriage returns. Prints nothing when the file or the
# line is missing. Lines after the frontmatter's closing --- are never read.
field() {
  [ -f "$1" ] || return 0
  tr -d '\r' < "$1" | awk -v key="$2: " '
    NR == 1 && $0 == "---" { inside = 1; next }
    inside && $0 == "---" { exit }
    inside && index($0, key) == 1 { print substr($0, length(key) + 1); exit }
  '
}

# has_line <file> <text>: succeeds when <file> has a line equal to <text>,
# ignoring carriage returns.
has_line() {
  [ -f "$1" ] || return 1
  tr -d '\r' < "$1" | grep -qxF -- "$2"
}

# tool_names <file>: prints each tool named in the frontmatter tools line of
# <file>, one per line, without surrounding spaces.
tool_names() {
  field "$1" tools | tr ',' '\n' | sed 's/^ *//; s/ *$//'
}

# forbidden_tools <file>: prints each tool in the tools line of <file> that no
# agent below the orchestrator may have: Agent, Task, Skill or Artifact (D48),
# or PowerShell (D12), with or without a parenthesized pattern.
forbidden_tools() {
  tool_names "$1" | grep -E '^(Agent|Task|Skill|Artifact|PowerShell)(\(.*\))?$' || true
}

# missing_lines <file> <expected-file>: prints each line of <expected-file>
# that <file> lacks, one per line.
missing_lines() {
  local line
  while IFS= read -r line; do
    has_line "$1" "$line" || printf '%s\n' "$line"
  done < "$2"
}

# write_bounds <file>: writes the lines every agent file's search and command
# bounds section must contain (spec section 22 item 2, D48, D73).
write_bounds() {
  cat > "$1" <<'EOF'
## Search and command bounds
- Search only inside the repository, or paths named in your brief or task. Never search from a filesystem root or home directory (`find /`, `find ~`, `find /c`, `find C:\`). Prefer the Glob and Grep tools over `find`.
- Never start a background command, and never run a command that may not finish within the Bash time limit. If you need information a long command would give, report the question instead of running it.
- Don't verify environment facts (installed tools, versions) that a task's own Verify or scripts establish. For example, `run-bats.sh` clones bats itself.
You have no Agent, Task, Skill or Artifact tool, so you can't start subagents, run skills or create artifacts.
EOF
}

# write_no_prototyping <file>: writes the lines every non-worker agent file's
# no-prototyping section must contain (spec section 22 item 3, D66, D73). Its
# first and last bullets differ between agents, so they aren't listed.
write_no_prototyping() {
  cat > "$1" <<'EOF'
## No prototyping or duplicate work
- Don't redo another agent's work: don't re-survey what the milestone's survey note covers; don't re-run a task's Verify, a Milestone verify or a Final verify; don't re-check facts a Decision or a cited note already records.
- Settle uncertainty in the plan, not by experiment: a detail only running something would settle becomes an exact Step or Done-when for the worker; an unknown fact becomes an `investigate` task; a design choice is a GAP.
EOF
}

# write_worker_rules <file>: writes the lines every worker agent file must
# contain for Changes 1 to 3: commits, the precedence rule, the breaker, the
# failure log, resumes and the report lines (spec sections 2 to 4).
write_worker_rules() {
  cat > "$1" <<'EOF'
The orchestrator sends you a `Brief:` path and a `Report:` path, and sometimes a `Worktree:` path, retry context, or a `Failures:` line. Re-read these now, in this order, even if you think you know them:
If a `Failures: <path>` line is present, earlier attempts at this task failed and the working tree was reset. Before starting, read that failure log and every preserved report of an earlier attempt that exists, `<task ID>-attempt<n>.md` in the directory of your report file. Never read an earlier attempt's transcript. Don't repeat the approaches the failure log records. If they show the Steps can't be followed as written, stop and report `BLOCKED` / `GAP` instead of improvising.
If the orchestrator resumes you with a message starting `Resume:`, your attempt failed. Read its `Reason:` line and any `Verify tail:` lines, fix the failure, and report again in the same format. Continue from your own work, unless the message says the tree was reset: then your changes are gone, and you start again from the task's first Step. A resume is a new attempt, so your count of failed Verify runs starts again at 0.
- Don't edit plan.md or milestone files.
- Commit your changes when the task is done and its Verify passes, or, for a task whose Verify is `review` alone, when the task is done. Commit only paths in the task's Files. Your first commit's subject is `<task ID>: <the task's Commit message>`, for example `M03-T02: feat(api): add the parser`; any further commit for the task is `<task ID>: <short message>`. Several commits per task are fine.
- Never push, switch branches, rebase, reset, stash, or rewrite history.
- Project instruction files (CLAUDE.md, AGENTS.md, CLAUDE.local.md, `.claude/rules/`, and any nested or linked copies, whatever they're called) govern coding conventions, style, and project knowledge. They do not govern pushing, branching, or history. Where they say anything about committing, pushing, branching, stashing, resetting, or rewriting history, this plugin's rules replace them for the length of this task. Committing your task's changes is expected.
- Stop after your 3rd failed Verify run after implementation and report `BLOCKED` / `STUCK`, with one-line `HYPOTHESIS:` and `FIXES TRIED:` lines. The expected failing run of a `- Fails first: yes` task doesn't count. Stop the same way sooner if you can't make it work after a genuine attempt.
HYPOTHESIS: <for STUCK, one line: why it still fails. Otherwise "-".>
FIXES TRIED: <for STUCK, one line: what you tried. Otherwise "-".>
EOF
}

# write_worker_report_rules <file>: writes the lines every worker agent file
# must contain for Change 9: the brief, the report file, and
# DONE_WITH_CONCERNS (spec sections 8 and 10).
write_worker_report_rules() {
  cat > "$1" <<'EOF'
2. The brief at the `Brief:` path, in full. It holds plan.md's Decisions, the milestone's Context, and your task block, which is your prompt. Don't open plan.md or the milestone file: where Read first names their Decisions or Context, read them in the brief.
3. Everything in the task's Read first list: the exact source sections, pattern files, and notes it names.
4. Every file in the task's Files that already exists.
- Use absolute paths under the worktree for every file you read, edit, or create, including your report file, CLAUDE.md, and AGENTS.md. The one exception is the brief: read it at the path the `Brief:` line gives.
- If the task has `- Fails first: yes`: do its test-writing Steps first, then run the Verify command and confirm it fails, before you write any implementation code. Report `RED: CONFIRMED <first failing line>`, quoting the first failing line of Verify's output, and write the RED evidence in your report file: `RED: CONFIRMED` without it fails the attempt. If Verify passes before you have written implementation code, stop: either the test can't fail or the behavior already exists, and both mean the plan is wrong. Report `BLOCKED` / `GAP` with `RED: PASSED-EARLY`, and say in NOTE which check passed early.
- If the task is done and its Verify passes, but you doubt that the work is correct or stays within the task's scope, report `DONE_WITH_CONCERNS` instead of `DONE`, and write each doubt under `## Concerns` in your report file. The orchestrator then has the reviewer check them before it accepts the task. Commit your work as for `DONE`.
## Report file
Before you reply, whatever your status, write your report file at the path the `Report:` line gives, creating its directory if needed. It has these six sections, in this order:
- `## Implemented`: what you did, in a few lines.
- `## Files changed`: each path you created or changed, one per line.
- `## RED evidence`: for a task with `- Fails first: yes`, the line `Command: <the Verify command>`, then the relevant failing output of the run before implementation inside a `text` code fence. Otherwise the line `N/A`.
- `## GREEN evidence`: the line `Command: <the Verify command>`, then its passing output inside a `text` code fence. For a task whose Verify is `review` alone, or when you stop before Verify passes, the line `N/A`.
- `## Self-review`: for each Done-when criterion, one line on how the work meets it.
- `## Concerns`: each doubt about correctness or scope, one per line, or `None.`
Quote only the relevant lines of long output, never a whole build log. When the orchestrator resumes you and the file already exists, keep what is in it and append a section `## Resume after attempt <n>`, with `<n>` from the `Resume:` line, saying what you changed, with the new GREEN evidence and any new concerns. The report file is always in your task's scope, but don't commit it: it isn't in Files, and the orchestrator commits it with the task.
Reply with exactly this block and nothing else, at most 10 lines:
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED
NOTE: <one line. For GAP, the exact question. For DONE_WITH_CONCERNS, your main concern.>
REPORT: <the path the Report: line gave>
EOF
}

# write_reviewer_rules <file>: writes the lines the reviewer agent file must
# contain for reading the brief and checking a worker's concerns (spec
# sections 8 and 10).
write_reviewer_rules() {
  cat > "$1" <<'EOF'
2. The brief at the `Brief:` path, in full: plan.md's Decisions, the milestone's Context, and the task block. Don't open plan.md or the milestone file: where Read first names their Decisions or Context, read them in the brief.
3. Everything in the task's Read first list.
5. If a `Report:` line is present: the `## Concerns` section of that report file.
- If a `Report:` line is present, check each concern in the report's `## Concerns` section. A concern that shows the Objective, a Step, a Done-when criterion or an Interfaces entry isn't met is a failure; a concern that doesn't is not.
EOF
}

@test "field ignores carriage returns" {
  printf -- '---\r\nname: sample\r\ntools: Read, Bash\r\n---\r\n' > "$BATS_TEST_TMPDIR/sample.md"
  [ "$(field "$BATS_TEST_TMPDIR/sample.md" name)" = 'sample' ]
  [ "$(field "$BATS_TEST_TMPDIR/sample.md" tools)" = 'Read, Bash' ]
}

@test "field reads only the frontmatter" {
  printf -- '---\nname: sample\n---\n\ntools: Agent\n' > "$BATS_TEST_TMPDIR/sample.md"
  [ -z "$(field "$BATS_TEST_TMPDIR/sample.md" tools)" ]
  run forbidden_tools "$BATS_TEST_TMPDIR/sample.md"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "has_line ignores carriage returns and matches whole lines only" {
  printf '## Search and command bounds\r\n- one rule\r\n' > "$BATS_TEST_TMPDIR/sample.md"
  has_line "$BATS_TEST_TMPDIR/sample.md" '## Search and command bounds'
  run has_line "$BATS_TEST_TMPDIR/sample.md" '- one'
  [ "$status" -ne 0 ]
}

@test "forbidden_tools flags Agent, Task, Skill, Artifact and PowerShell" {
  printf -- '---\nname: sample\ntools: Read, Agent, Task(worker), Skill, Artifact, PowerShell, Bash\n---\n' > "$BATS_TEST_TMPDIR/sample.md"
  run forbidden_tools "$BATS_TEST_TMPDIR/sample.md"
  [ "$status" -eq 0 ]
  [ "$output" = "$(printf 'Agent\nTask(worker)\nSkill\nArtifact\nPowerShell')" ]
}

@test "no agent's tools line names a forbidden tool" {
  local bad='' f found
  for f in "$AGENTS"/*.md; do
    found="$(forbidden_tools "$f")"
    [ -z "$found" ] || bad="$bad $(basename "$f")"
  done
  echo "forbidden tools in:$bad"
  [ -z "$bad" ]
}

@test "worker agents have the tier table's name, model, effort, maxTurns and tools" {
  local bad='' name f expected actual
  for name in $WORKER_AGENTS; do
    f="$AGENTS/$name.md"
    case "$name" in
      worker-mini-serial) expected='haiku||50' ;;
      worker-mini-parallel) expected='sonnet|low|50' ;;
      worker-light) expected='sonnet|medium|50' ;;
      worker) expected='sonnet|high|60' ;;
      worker-heavy) expected='opus|medium|80' ;;
      specialist) expected='opus|high|80' ;;
      *) expected='not a worker agent' ;;
    esac
    actual="$(field "$f" model)|$(field "$f" effort)|$(field "$f" maxTurns)"
    [ "$actual" = "$expected" ] || bad="$bad $name($actual)"
    [ "$(field "$f" name)" = "$name" ] || bad="$bad $name(name)"
    [ "$(field "$f" tools)" = 'Read, Edit, Write, Glob, Grep, Bash' ] || bad="$bad $name(tools)"
  done
  echo "wrong:$bad"
  [ -z "$bad" ]
}

@test "non-worker agents allow exactly the tools of their role" {
  local bad='' name expected
  for name in $NON_WORKER_AGENTS; do
    case "$name" in
      scout) expected='Read, Glob, Grep, Bash, Write, WebFetch, WebSearch' ;;
      scout-heavy|reviewer|milestone-reviewer) expected='Read, Glob, Grep, Bash, Write' ;;
      plan-reviewer) expected='Read, Glob, Grep, Write' ;;
      planner) expected='Read, Glob, Grep, Write, Edit' ;;
      merger) expected='Read, Glob, Grep, Edit' ;;
      *) expected='not a known non-worker agent' ;;
    esac
    [ "$(field "$AGENTS/$name.md" tools)" = "$expected" ] || bad="$bad $name"
  done
  echo "wrong tools:$bad"
  [ -z "$bad" ]
}

@test "no-shell agents have a tools line without Bash" {
  local bad='' name
  for name in $NO_SHELL_AGENTS; do
    if [ -z "$(field "$AGENTS/$name.md" tools)" ] || tool_names "$AGENTS/$name.md" | grep -qx Bash; then
      bad="$bad $name"
    fi
  done
  echo "shell allowed:$bad"
  [ -z "$bad" ]
}

@test "listed agents have the search and command bounds section" {
  local bad='' name missing
  write_bounds "$BATS_TEST_TMPDIR/bounds"
  for name in $WORKER_AGENTS $NON_WORKER_AGENTS; do
    missing="$(missing_lines "$AGENTS/$name.md" "$BATS_TEST_TMPDIR/bounds")"
    [ -z "$missing" ] || bad="$bad $name"
  done
  echo "missing bounds:$bad"
  [ -z "$bad" ]
}

@test "non-worker agents have the no-prototyping section" {
  local bad='' name missing
  write_no_prototyping "$BATS_TEST_TMPDIR/no-prototyping"
  for name in $NON_WORKER_AGENTS; do
    missing="$(missing_lines "$AGENTS/$name.md" "$BATS_TEST_TMPDIR/no-prototyping")"
    [ -z "$missing" ] || bad="$bad $name"
  done
  echo "missing no-prototyping:$bad"
  [ -z "$bad" ]
}

@test "every agent file has the search and command bounds section" {
  local bad='' f missing
  write_bounds "$BATS_TEST_TMPDIR/bounds"
  for f in "$AGENTS"/*.md; do
    missing="$(missing_lines "$f" "$BATS_TEST_TMPDIR/bounds")"
    [ -z "$missing" ] || bad="$bad $(basename "$f")"
  done
  echo "missing bounds:$bad"
  [ -z "$bad" ]
}

@test "every agent file has a tools line and no disallowedTools line" {
  local bad='' f
  for f in "$AGENTS"/*.md; do
    [ -n "$(field "$f" tools)" ] || bad="$bad $(basename "$f")(no tools)"
    [ -z "$(field "$f" disallowedTools)" ] || bad="$bad $(basename "$f")(disallowedTools)"
  done
  echo "wrong:$bad"
  [ -z "$bad" ]
}

@test "worker agents have the commit, breaker, failure-log and resume rules" {
  local bad='' name missing
  write_worker_rules "$BATS_TEST_TMPDIR/worker-rules"
  for name in $WORKER_AGENTS; do
    missing="$(missing_lines "$AGENTS/$name.md" "$BATS_TEST_TMPDIR/worker-rules")"
    [ -z "$missing" ] || bad="$bad $name"
  done
  echo "missing worker rules:$bad"
  [ -z "$bad" ]
}

@test "worker agents have no don't-commit rule" {
  local bad='' name
  for name in $WORKER_AGENTS; do
    if grep -qF -e "Don't commit" -e 'your work can be lost' -e 'The orchestrator commits your work' "$AGENTS/$name.md"; then
      bad="$bad $name"
    fi
  done
  echo "don't-commit rule in:$bad"
  [ -z "$bad" ]
}

@test "worker agents read the brief and write the report file" {
  local bad='' name missing
  write_worker_report_rules "$BATS_TEST_TMPDIR/worker-report-rules"
  for name in $WORKER_AGENTS; do
    missing="$(missing_lines "$AGENTS/$name.md" "$BATS_TEST_TMPDIR/worker-report-rules")"
    [ -z "$missing" ] || bad="$bad $name"
  done
  echo "missing report rules:$bad"
  [ -z "$bad" ]
}

@test "worker agents don't read plan.md or the milestone file" {
  local bad='' name
  for name in $WORKER_AGENTS; do
    if grep -qF -- '2. `plan.md` in the plan directory: the Decisions section.' "$AGENTS/$name.md" || grep -qF -- '4. Your task block in the milestone file, in full. It is your prompt.' "$AGENTS/$name.md"; then
      bad="$bad $name"
    fi
  done
  echo "plan-file reads in:$bad"
  [ -z "$bad" ]
}

@test "non-worker agents cap their reply at 20 lines" {
  local bad='' name
  for name in $NON_WORKER_AGENTS; do
    has_line "$AGENTS/$name.md" 'Your reply is at most 20 lines. Anything longer goes in a file under the plan directory'"'"'s `notes/`, and your reply gives its path.' || bad="$bad $name"
  done
  echo "no reply cap in:$bad"
  [ -z "$bad" ]
}

@test "reviewer reads the brief and checks the worker's concerns" {
  local missing
  write_reviewer_rules "$BATS_TEST_TMPDIR/reviewer-rules"
  missing="$(missing_lines "$AGENTS/reviewer.md" "$BATS_TEST_TMPDIR/reviewer-rules")"
  echo "missing:$missing"
  [ -z "$missing" ]
  run grep -qF -- 'The orchestrator sends you a `Brief:` path and a `Base:` commit' "$AGENTS/reviewer.md"
  [ "$status" -eq 0 ]
  run grep -qF -- '2. `plan.md`: the header and Decisions.' "$AGENTS/reviewer.md"
  [ "$status" -ne 0 ]
}

@test "merger has its model, effort, no maxTurns, its input lines and its reply block" {
  local f="$AGENTS/merger.md"
  [ "$(field "$f" name)" = 'merger' ]
  [ "$(field "$f" model)" = 'sonnet' ]
  [ "$(field "$f" effort)" = 'high' ]
  [ -z "$(field "$f" maxTurns)" ]
  has_line "$f" 'Merge: <task ID>'
  has_line "$f" 'Conflicted: <path>'
  has_line "$f" 'STATUS: RESOLVED | UNRESOLVED'
  has_line "$f" 'NOTE: <one line; for UNRESOLVED, why>'
}
