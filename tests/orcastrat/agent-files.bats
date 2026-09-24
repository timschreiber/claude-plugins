setup() {
  load test_helper
  AGENTS="$REPO_ROOT/plugins/orcastrat/agents"
}

# The agents the list-based tests below cover. The task that brings an agent
# file up to date adds its name here.
WORKER_AGENTS='worker-mini-serial worker-mini-parallel worker-light worker worker-heavy specialist'
NON_WORKER_AGENTS=''
NO_SHELL_AGENTS=''

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
