# M04: Worker tiers and agent prefix hygiene (Changes 4, 21)

- Status: in-progress
- Format: 2
- Goal: The plan has five tiers (`worker-mini`, `worker-light`, `worker`, `worker-heavy`, `specialist`) served by six worker agents, with the models, efforts and turn limits from Change 4's table. `run` dispatches `worker-mini` to `worker-mini-serial` or `worker-mini-parallel` by mode, and climbs the new ladder. The tier rubric is rewritten, and every reader of tier names is updated. Every existing agent has an explicit minimal `tools` allowlist in place of `disallowedTools`. Agent files hold every instruction that applies to every dispatch and nothing per-run, and dispatch messages carry only task-unique lines. The "before" dispatch sizes are recorded.
- Depends on: M03
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §5 (Change 4), §22 (Change 21), §1.4; Decisions D12, D13, D14, D28, D48, D62, D66, D68, D69–D74.

Tier table (Change 4):

| Plan tier | Agent | Model / effort | `maxTurns` |
|---|---|---|---|
| `worker-mini` | `worker-mini-serial` | Haiku, no effort | 50 |
| `worker-mini` | `worker-mini-parallel` | Sonnet / low | 50 |
| `worker-light` | `worker-light` | Sonnet / medium | 50 |
| `worker` | `worker` | Sonnet / high | 60 |
| `worker-heavy` | `worker-heavy` | Opus / medium | 80 |
| `specialist` | `specialist` | Opus / high | 80 |

- The ladder is `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist`. The three-rung cap and resume come in M05. A retry always goes one tier up, so `run` never dispatches `worker-mini` on a retry.
- Allowlists (Change 21.3, D68; D12: the shell tool is `Bash` only; D13: path limits are instructions only):
  - Workers: `Read, Edit, Write, Glob, Grep, Bash`.
  - `scout`: `Read, Glob, Grep, Bash, Write, WebFetch, WebSearch`.
  - `scout-heavy`, `reviewer`, `milestone-reviewer`: `Read, Glob, Grep, Bash, Write`.
  - `plan-reviewer`: `Read, Glob, Grep, Write` (no shell).
  - `planner`: `Read, Glob, Grep, Write, Edit` (no shell).
  - Agents created later get theirs when they are created (D28): `merger` in M07, `status-reader` in M09, `validator` in M10, `decider` in M12. Those milestones add their agents to the lists at the top of `tests/orcastrat/agent-files.bats` and to the `case` of expected allowlists in its non-worker tools test.
- Worker bodies change only by the Search and command bounds section here: Change 4 updates the worker agents' models, efforts and turn limits, nothing else, so `specialist` alone keeps its extra judgment Rule (spec §5 Files; `plugins/orcastrat/agents/specialist.md:50`). M05 rewrites the worker bodies for commits and resume.
- `milestone-reviewer` and `status` name no tier today, so the tier update doesn't touch them (`notes/M04-survey.md`, last bullet group). `status-reader` is built in M09 and the README cast table is updated in M15.
- The survey found no every-dispatch instruction in `run`'s dispatch templates and no per-run content in any agent file (`notes/M04-survey.md`, "Move every-dispatch instruction" bullet), so no text moves in M04. M04-T09 states the standing rule in `run`. The `Brief:`, `Failures:` and report-path lines arrive in M05 and M06.
- Quote every frontmatter value that contains `: ` (§1.4). No frontmatter value in this milestone contains one.
- Existing plans read the new tier meanings. There is no mapping and no format change (Change 4).
- D62: no task in this milestone is `worker-light`; `worker` is the floor.
- Tier adjustment: test-first tasks whose Steps give the literal test file and the literal code → worker (worker-light escalated 2 times in M02)
- Every block a Step gives is its literal final content: the fenced block in that Step, with the three-space list indentation removed from each line. Blank lines stay empty. Copy it exactly; don't reformat, reorder or "improve" it.
- **Inserting blocks above a heading.** "Insert block X above the heading H" means: put X's lines directly above H's line, followed by one empty line, so that the empty line that was above H now sits above X. "Insert blocks X and Y above H" means X, one empty line, Y, one empty line, then H.
- The bats files run slowly on Windows. Give a Verify command that runs bats a Bash timeout of 600000 ms.
- The run executing this plan is the installed, pre-rename plugin (D37). Editing the repository's agent files changes nothing in that run.

The shared blocks, used by M04-T02 to M04-T06. `tests/orcastrat/agent-files.bats` checks their lines exactly.

**Bounds block** (every agent file):

```text
## Search and command bounds

- Search only inside the repository, or paths named in your brief or task. Never search from a filesystem root or home directory (`find /`, `find ~`, `find /c`, `find C:\`). Prefer the Glob and Grep tools over `find`.
- Never start a background command, and never run a command that may not finish within the Bash time limit. If you need information a long command would give, report the question instead of running it.
- Don't verify environment facts (installed tools, versions) that a task's own Verify or scripts establish. For example, `run-bats.sh` clones bats itself.

You have no Agent, Task, Skill or Artifact tool, so you can't start subagents, run skills or create artifacts.
```

**No-prototyping block, shell version** (`scout`, `scout-heavy`, `reviewer`, `milestone-reviewer`):

```text
## No prototyping or duplicate work

- Don't implement. Never write or run trial code, scripts, tests or fixtures, in the repository, the scratchpad or any temp directory. Never create git worktrees, branches or commits. Write nothing except your own output file. Building and testing is the workers' job, and each task's own tests catch mistakes.
- Don't redo another agent's work: don't re-survey what the milestone's survey note covers; don't re-run a task's Verify, a Milestone verify or a Final verify; don't re-check facts a Decision or a cited note already records.
- Settle uncertainty in the plan, not by experiment: a detail only running something would settle becomes an exact Step or Done-when for the worker; an unknown fact becomes an `investigate` task; a design choice is a GAP.
- Use the shell only for short read-only commands (`git log`, `git show`, `git diff`, `git status`, `grep`, `ls`, `cat`).
```

**No-prototyping block, no-shell version** (`plan-reviewer`):

```text
## No prototyping or duplicate work

- Don't implement. Never write or run trial code, scripts, tests or fixtures, in the repository, the scratchpad or any temp directory. Never create git worktrees, branches or commits. Write nothing except your own output file. Building and testing is the workers' job, and each task's own tests catch mistakes.
- Don't redo another agent's work: don't re-survey what the milestone's survey note covers; don't re-run a task's Verify, a Milestone verify or a Final verify; don't re-check facts a Decision or a cited note already records.
- Settle uncertainty in the plan, not by experiment: a detail only running something would settle becomes an exact Step or Done-when for the worker; an unknown fact becomes an `investigate` task; a design choice is a GAP.
- You have no shell. Read files with Read, Glob and Grep.
```

**No-prototyping block, planner version** (`planner`):

```text
## No prototyping or duplicate work

- Don't implement. Never write or run trial code, scripts, tests or fixtures, in the repository, the scratchpad or any temp directory. Never create git worktrees, branches or commits. Write nothing except the milestone file you detail, `plan.md`, and your notes. Building and testing is the workers' job, and each task's own tests catch mistakes.
- Don't redo another agent's work: don't re-survey what the milestone's survey note covers; don't re-run a task's Verify, a Milestone verify or a Final verify; don't re-check facts a Decision or a cited note already records.
- Settle uncertainty in the plan, not by experiment: a detail only running something would settle becomes an exact Step or Done-when for the worker; an unknown fact becomes an `investigate` task; a design choice is a GAP.
- You have no shell. Read files with Read, Glob and Grep.
```

Waves: 6 (widths 3, 3, 2, 1, 1, 1)

## Coverage

- `docs/orcastrat-execution-spec.md` preamble: less repeated context and fewer wasted attempts → M04-T03, M04-T04, M04-T05, M04-T06, M04-T09
- `docs/orcastrat-execution-spec.md` §1.1: only documented agent frontmatter fields (`model`, `effort`, `maxTurns`, `tools`) and existing dispatch behavior are used → M04-T02, M04-T03, M04-T04, M04-T05, M04-T06, M04-T08
- `docs/orcastrat-execution-spec.md` §1.2: every reader of tier names (plan format, `run`, `plan`, `planner`, `plan-reviewer`) is updated in this milestone → M04-T07, M04-T08, M04-T10, M04-T11
- `docs/orcastrat-execution-spec.md` §1.4: agent frontmatter is valid YAML → M04-T02, M04-T03, M04-T04, M04-T05, M04-T06
- `docs/orcastrat-execution-spec.md` §5: six worker agents with the table's models, efforts and `maxTurns` (`worker-mini-serial`, `worker-mini-parallel` added; four existing agents updated) → M04-T02, M04-T03
- `docs/orcastrat-execution-spec.md` §5: `worker-mini` dispatches `worker-mini-serial` in a serial wave and `worker-mini-parallel` in a parallel wave → M04-T08
- `docs/orcastrat-execution-spec.md` §5: the ladder `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist` → M04-T07, M04-T08, M04-T10
- `docs/orcastrat-execution-spec.md` §5: the tier rubric rewritten (worker-mini only for literal content, worker-light the default, worker for intricate work, Why this tier for worker-heavy and specialist, one in ten, plan the tier where the task will succeed) (D72) → M04-T07, M04-T10, M04-T11
- `docs/orcastrat-execution-spec.md` §5: existing plans read the new meanings, with no mapping and no format change → M04-T07
- `docs/orcastrat-execution-spec.md` §5: a worker that returns no report counts as a failed attempt (D74) → M04-T09
- `docs/orcastrat-execution-spec.md` §22 item 1: agent files hold no dates, paths, plan names or per-run content → M04-T02, M04-T03, M04-T04, M04-T05, M04-T06
- `docs/orcastrat-execution-spec.md` §22 item 2: search and command bounds in every agent file (D48, D73) → M04-T02, M04-T03, M04-T04, M04-T05, M04-T06
- `docs/orcastrat-execution-spec.md` §22 item 2: dispatch messages carry only task-unique lines; the standing rule that every-dispatch instructions go in agent files → M04-T09
- `docs/orcastrat-execution-spec.md` §22 item 2: record the before dispatch sizes for one task per tier (D14, D69) → M04-T01
- `docs/orcastrat-execution-spec.md` §22 item 3: every existing agent has an explicit minimal `tools` allowlist matching its role (D12, D68) → M04-T02, M04-T03, M04-T04, M04-T05, M04-T06
- `docs/orcastrat-execution-spec.md` §22 item 3: no agent gets the Agent (Task), Skill or Artifact tool (D48) → M04-T02, M04-T03, M04-T04, M04-T05, M04-T06
- `docs/orcastrat-execution-spec.md` §22 item 3: `planner` and `plan-reviewer` get no shell (D66, D68) → M04-T05, M04-T06
- `docs/orcastrat-execution-spec.md` §22 item 3: the no-prototyping section in every existing non-worker agent file and the `plan` skill (D66, D70, D71, D73) → M04-T04, M04-T05, M04-T06, M04-T11
- `docs/orcastrat-execution-spec.md` §22 item 4: workers still read CLAUDE.md as a file → M04-T02, M04-T03
- `docs/orcastrat-execution-spec.md` §29 item 4: Changes 4 and 21 are built together → M04-T01, M04-T02, M04-T03, M04-T04, M04-T05, M04-T06, M04-T07, M04-T08, M04-T09, M04-T10, M04-T11
- `docs/orcastrat-execution-spec.md` §31: kebab-case names for `worker-mini-serial` and `worker-mini-parallel`; valid frontmatter; `Validate-All.ps1` passes → M04-T02, M04-T03, M04-T04, M04-T05, M04-T06
- `docs/orcastrat-execution-spec.md` §32 items 4, 45, 46, 65, 67 and 68: five tiers on six agents; every-dispatch instructions in agent files; explicit minimal allowlists; bounded searches and commands; no prototyping; only workers get an unrestricted shell → M04-T02, M04-T03, M04-T04, M04-T05, M04-T06, M04-T07, M04-T09, M04-T11

## Review Focus

- An agent file checked out with CRLF line endings, as on the `windows-latest` CI runner → its frontmatter values still read the same (source: D22). Test: `field ignores carriage returns` in M04-T02.
- A `tools:` line in an agent's body, below its frontmatter → not read as the agent's allowlist (source: spec §22 item 3, "an explicit `tools` allowlist"; §1.4). Test: `field reads only the frontmatter` in M04-T02.
- A forbidden tool written with a pattern, such as `Task(worker)` → reported like the bare name (source: D48, D12). Test: `forbidden_tools flags Agent, Task, Skill, Artifact and PowerShell` in M04-T02.
- A section line shortened or reworded, or a file with CRLF endings → a shortened line counts as missing, and CRLF endings don't (source: D73, spec §22 item 2). Test: `has_line ignores carriage returns and matches whole lines only` in M04-T02.
- A no-shell agent with no `tools` line at all, which gets every tool, Bash included → reported as allowing a shell (source: D68). Test: `no-shell agents have a tools line without Bash` in M04-T02.

## Tasks

### M04-T01: Record the before dispatch sizes

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plans/orcastrat-execution/notes/dispatch-sizes.md`
- Verify: `! grep -q '{' plans/orcastrat-execution/notes/dispatch-sizes.md && awk -F'|' '/^[|] worker(-light)? [|] M0[14]-T0[16] [|]/ { n++; if ($4 + $5 + $6 != $7 || $4 < 1 || $5 < 1 || $6 < 1) bad = 1 } END { exit (bad || n != 2) }' plans/orcastrat-execution/notes/dispatch-sizes.md`
- Fails first: no (a notes file with no test; Verify fails until the file has both rows)
- Commit: `docs(plan): record the before dispatch sizes`

**Objective**

`plans/orcastrat-execution/notes/dispatch-sizes.md` records, in characters, the dispatch message, milestone file and `plan.md` sizes for the first `worker-light` and the first `worker` task of `plans/orchestratinator-robustness` (D14, D69).

**Read first**

- plan.md Decisions D14 and D69
- `plugins/orcastrat/skills/run/SKILL.md` lines 156–162 (the dispatch message these sizes measure)

**Interfaces**

- Consumes: `Plan: <plan dir>` / `Milestone: <milestone ID>` / `Task: <task ID>` dispatch lines (existing, `plugins/orcastrat/skills/run/SKILL.md:157`)
- Produces: `plans/orcastrat-execution/notes/dispatch-sizes.md`, with the section `## Before (M04)` and the table header `| Tier | Task | Dispatch message | Milestone file | plan.md | Total |`

**Steps**

1. Run `printf 'Plan: plans/orchestratinator-robustness\nMilestone: M01\nTask: M01-T01\n' | LC_ALL=C.UTF-8 wc -m`. Its number is A1.
2. Run `git show HEAD:plans/orchestratinator-robustness/M01-format-versioning.md | LC_ALL=C.UTF-8 wc -m`. Its number is A2.
3. Run `git show HEAD:plans/orchestratinator-robustness/plan.md | LC_ALL=C.UTF-8 wc -m`. Its number is both A3 and B3.
4. Run `printf 'Plan: plans/orchestratinator-robustness\nMilestone: M04\nTask: M04-T06\n' | LC_ALL=C.UTF-8 wc -m`. Its number is B1.
5. Run `git show HEAD:plans/orchestratinator-robustness/M04-fails-first.md | LC_ALL=C.UTF-8 wc -m`. Its number is B2.
6. Create `plans/orcastrat-execution/notes/dispatch-sizes.md` with this content, replacing `{A1}` to `{A3}` and `{B1}` to `{B3}` with those numbers (digits only, no spaces), `{A4}` with A1 + A2 + A3, and `{B4}` with B1 + B2 + B3:

   ```text
   # Dispatch sizes (D14)

   Characters, counted with `LC_ALL=C.UTF-8 wc -m`. Files are counted as committed (`git show HEAD:<path>`), so working-tree line endings don't change the count. M06 adds the "after" sizes for the same tasks, counted the same way.

   ## Before (M04)

   Before = dispatch message + milestone file + `plan.md` (D14). The dispatch message is the three lines `run` sent before M04, each ending in a newline: `Plan: plans/orchestratinator-robustness`, then `Milestone:` and `Task:` with the task's IDs.

   | Tier | Task | Dispatch message | Milestone file | plan.md | Total |
   |---|---|---|---|---|---|
   | worker-light | M01-T01 | {A1} | {A2} | {A3} | {A4} |
   | worker | M04-T06 | {B1} | {B2} | {B3} | {B4} |

   The tasks are the first `worker-light` task and the first `worker` task of `plans/orchestratinator-robustness`, in milestone table order and then task order: M01-T01 in `M01-format-versioning.md` and M04-T06 in `M04-fails-first.md`. No plan in the repository has a task planned at `worker-heavy` or `specialist`, so those tiers have no row (D69).
   ```

7. Run Verify.

**Done when**

- The file has the two table rows, each with three positive counts and their sum, and no `{` is left in it.

### M04-T02: Add the worker-mini agents and the agent-files test

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/agents/worker-mini-serial.md`, `plugins/orcastrat/agents/worker-mini-parallel.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the worker-mini agents and the agent-files test`

**Objective**

`worker-mini-serial` (Haiku) and `worker-mini-parallel` (Sonnet / low) exist, built from the current worker body with an explicit `tools` allowlist and the bounds block, and `tests/orcastrat/agent-files.bats` checks agent frontmatter, allowlists and sections.

**Read first**

- `docs/orcastrat-execution-spec.md` §5, the tier table and the paragraph "`worker-mini` picks its agent by mode"
- `docs/orcastrat-execution-spec.md` §22 item 2, the "Search and command bounds" bullets, and item 3
- `plugins/orcastrat/agents/worker.md` (the body to copy)
- `tests/orcastrat/no-powershell.bats` (bats style to follow)

**Interfaces**

- Consumes: `tests/orcastrat/test_helper.bash`, loaded with `load test_helper` (existing, `tests/orcastrat/test_helper.bash:2`)
- Consumes: `REPO_ROOT` (existing, `tests/orcastrat/test_helper.bash:5`)
- Consumes: `bash scripts/run-bats.sh [<bats arguments>...]` (existing, `scripts/run-bats.sh:21`)
- Produces: `plugins/orcastrat/agents/worker-mini-serial.md`, agent `orcastrat:worker-mini-serial`
- Produces: `plugins/orcastrat/agents/worker-mini-parallel.md`, agent `orcastrat:worker-mini-parallel`
- Produces: `tests/orcastrat/agent-files.bats`
- Produces: `WORKER_AGENTS`, a space-separated list of agent names
- Produces: `NON_WORKER_AGENTS`, a space-separated list of agent names
- Produces: `NO_SHELL_AGENTS`, a space-separated list of agent names
- Produces: `field <file> <key>`
- Produces: `has_line <file> <text>`
- Produces: `tool_names <file>`
- Produces: `forbidden_tools <file>`
- Produces: `missing_lines <file> <expected-file>`
- Produces: `write_bounds <file>`
- Produces: `write_no_prototyping <file>`

**Steps**

1. Create `tests/orcastrat/agent-files.bats` with exactly this content:

   ```bash
   setup() {
     load test_helper
     AGENTS="$REPO_ROOT/plugins/orcastrat/agents"
   }

   # The agents the list-based tests below cover. The task that brings an agent
   # file up to date adds its name here.
   WORKER_AGENTS='worker-mini-serial worker-mini-parallel'
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
   ```

2. Run Verify and confirm it fails: the test `worker agents have the tier table's name, model, effort, maxTurns and tools` fails, because the two agent files don't exist yet.
3. Create `plugins/orcastrat/agents/worker-mini-serial.md`: these eight lines, followed by every line of `plugins/orcastrat/agents/worker.md` after its closing `---` (line 8), copied exactly, from the empty line 9 to the end of the file:

   ```text
   ---
   name: worker-mini-serial
   description: Executes one Orcastrat worker-mini task in a serial wave. Its Steps contain the literal final content to write (complete lines of code or config, exact file text). Dispatched by /orcastrat:run only.
   model: haiku
   maxTurns: 50
   tools: Read, Edit, Write, Glob, Grep, Bash
   omitClaudeMd: true
   ---
   ```

4. Create `plugins/orcastrat/agents/worker-mini-parallel.md` the same way: these nine lines, followed by every line of `plugins/orcastrat/agents/worker.md` after line 8, copied exactly:

   ```text
   ---
   name: worker-mini-parallel
   description: Executes one Orcastrat worker-mini task in a parallel wave, in its own git worktree. Its Steps contain the literal final content to write (complete lines of code or config, exact file text). Dispatched by /orcastrat:run only.
   model: sonnet
   effort: low
   maxTurns: 50
   tools: Read, Edit, Write, Glob, Grep, Bash
   omitClaudeMd: true
   ---
   ```

5. In each of the two new files, insert the Bounds block from Context above the heading `## Before anything else` (see "Inserting blocks above a heading" in Context).
6. Run Verify.

**Done when**

- Both agent files exist with the frontmatter from Steps 3 and 4, the worker body, and the Bounds block directly above `## Before anything else`.
- `tests/orcastrat/agent-files.bats` has the content from Step 1, and all its tests pass.

### M04-T03: Move the four existing worker agents to the new tier table

- Kind: change
- Tier: worker
- Status: todo
- Wave: 2
- Depends on: M04-T02
- Files: `plugins/orcastrat/agents/worker-light.md`, `plugins/orcastrat/agents/worker.md`, `plugins/orcastrat/agents/worker-heavy.md`, `plugins/orcastrat/agents/specialist.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats`
- Fails first: yes
- Commit: `feat(orcastrat): move the worker agents one step up the ladder, with tool allowlists`

**Objective**

`worker-light`, `worker`, `worker-heavy` and `specialist` have Change 4's models, efforts, turn limits and descriptions, the workers' `tools` allowlist, and the Bounds block, and the agent-files test covers all six worker agents.

**Read first**

- `docs/orcastrat-execution-spec.md` §5, the tier table
- `tests/orcastrat/agent-files.bats` (the `WORKER_AGENTS` line and the worker agents test)
- `plugins/orcastrat/agents/worker.md` lines 1–14

**Interfaces**

- Consumes: `WORKER_AGENTS`, a space-separated list of agent names (M04-T02)
- Consumes: `tests/orcastrat/agent-files.bats` (M04-T02)
- Produces: `tools: Read, Edit, Write, Glob, Grep, Bash` in `worker-light.md`, `worker.md`, `worker-heavy.md` and `specialist.md`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, replace the line `WORKER_AGENTS='worker-mini-serial worker-mini-parallel'` with exactly `WORKER_AGENTS='worker-mini-serial worker-mini-parallel worker-light worker worker-heavy specialist'`.
2. Run Verify and confirm it fails: the worker agents test and the bounds test fail for the four existing worker agents.
3. In `plugins/orcastrat/agents/worker-light.md`, replace lines 1–7 (the frontmatter, from the first `---` to the second) with exactly:

   ```text
   ---
   name: worker-light
   description: Executes one fully specified Orcastrat task, with names, signatures, behavior and tests all in its Steps. The default tier. Dispatched by /orcastrat:run only.
   model: sonnet
   effort: medium
   maxTurns: 50
   tools: Read, Edit, Write, Glob, Grep, Bash
   omitClaudeMd: true
   ---
   ```

4. In `plugins/orcastrat/agents/worker.md`, replace lines 1–8 (the frontmatter) with exactly:

   ```text
   ---
   name: worker
   description: Executes one fully specified but intricate Orcastrat task (numeric or geometric code, parsers, state machines, concurrency). Dispatched by /orcastrat:run only.
   model: sonnet
   effort: high
   maxTurns: 60
   tools: Read, Edit, Write, Glob, Grep, Bash
   omitClaudeMd: true
   ---
   ```

5. In `plugins/orcastrat/agents/worker-heavy.md`, replace lines 1–8 (the frontmatter) with exactly:

   ```text
   ---
   name: worker-heavy
   description: Executes one Orcastrat task that needs bounded judgment the plan can't pin down (unfamiliar library internals, debugging a known failure). Dispatched by /orcastrat:run only.
   model: opus
   effort: medium
   maxTurns: 80
   tools: Read, Edit, Write, Glob, Grep, Bash
   omitClaudeMd: true
   ---
   ```

6. In `plugins/orcastrat/agents/specialist.md`, replace lines 1–8 (the frontmatter) with exactly:

   ```text
   ---
   name: specialist
   description: Executes one of the hardest bounded Orcastrat implementation tasks, rare by design. Dispatched by /orcastrat:run only.
   model: opus
   effort: high
   maxTurns: 80
   tools: Read, Edit, Write, Glob, Grep, Bash
   omitClaudeMd: true
   ---
   ```

7. In each of the four files, insert the Bounds block from Context above the heading `## Before anything else`. Then run Verify.

**Done when**

- The four files have the frontmatter from Steps 3–6 and the Bounds block directly above `## Before anything else`; the rest of each file is unchanged.
- `WORKER_AGENTS` names all six worker agents, and every test in `tests/orcastrat/agent-files.bats` passes.

### M04-T04: Give scout, scout-heavy and reviewer allowlists and the new sections

- Kind: change
- Tier: worker
- Status: todo
- Wave: 3
- Depends on: M04-T02, M04-T03
- Files: `plugins/orcastrat/agents/scout.md`, `plugins/orcastrat/agents/scout-heavy.md`, `plugins/orcastrat/agents/reviewer.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats`
- Fails first: yes
- Commit: `feat(orcastrat): give the scouts and the reviewer tool allowlists and bounds`

**Objective**

`scout`, `scout-heavy` and `reviewer` have explicit `tools` allowlists in place of `disallowedTools`, and carry the No-prototyping block (shell version) and the Bounds block, checked by the agent-files test.

**Read first**

- `docs/orcastrat-execution-spec.md` §22 item 3, the "Read-only agents that write notes" and "No prototyping or duplicate work" bullets
- plan.md Decisions D66, D68 and D73
- `tests/orcastrat/agent-files.bats` (the `NON_WORKER_AGENTS` line)

**Interfaces**

- Consumes: `NON_WORKER_AGENTS`, a space-separated list of agent names (M04-T02)
- Consumes: `tests/orcastrat/agent-files.bats` (M04-T02)
- Produces: `tools: Read, Glob, Grep, Bash, Write, WebFetch, WebSearch` in `scout.md`
- Produces: `tools: Read, Glob, Grep, Bash, Write` in `scout-heavy.md` and `reviewer.md`
- Produces: `## No prototyping or duplicate work` in `scout.md`, `scout-heavy.md` and `reviewer.md`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, replace the line `NON_WORKER_AGENTS=''` with exactly `NON_WORKER_AGENTS='scout scout-heavy reviewer'`.
2. Run Verify and confirm it fails: the non-worker tools test, the bounds test and the no-prototyping test fail for the three agents.
3. In `plugins/orcastrat/agents/scout.md`, replace line 7, `disallowedTools: Edit`, with exactly `tools: Read, Glob, Grep, Bash, Write, WebFetch, WebSearch`.
4. In `plugins/orcastrat/agents/scout-heavy.md`, replace line 7, `disallowedTools: Edit`, with exactly `tools: Read, Glob, Grep, Bash, Write`.
5. In `plugins/orcastrat/agents/reviewer.md`, replace line 7, `disallowedTools: Write, Edit`, with exactly `tools: Read, Glob, Grep, Bash, Write`.
6. In each of the three files, insert the No-prototyping block, shell version, and the Bounds block, both from Context, above the heading `## Before anything else` (see "Inserting blocks above a heading" in Context).
7. Run Verify.

**Done when**

- Each of the three files has the `tools` line from its Step, no `disallowedTools` line, and the two blocks, in that order, directly above `## Before anything else`; nothing else in them changed.
- Every test in `tests/orcastrat/agent-files.bats` passes.

### M04-T05: Give milestone-reviewer and plan-reviewer allowlists and the new sections

- Kind: change
- Tier: worker
- Status: todo
- Wave: 4
- Depends on: M04-T02, M04-T04
- Files: `plugins/orcastrat/agents/milestone-reviewer.md`, `plugins/orcastrat/agents/plan-reviewer.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats && ! grep -qF 'run each distinct Verify command' plugins/orcastrat/agents/milestone-reviewer.md`
- Fails first: yes
- Commit: `feat(orcastrat): give the milestone and plan reviewers tool allowlists and bounds`

**Objective**

`milestone-reviewer` (`Read, Glob, Grep, Bash, Write`) and `plan-reviewer` (`Read, Glob, Grep, Write`, no shell) have explicit allowlists and the new sections, and `milestone-reviewer` no longer runs Verify commands (D70).

**Read first**

- `docs/orcastrat-execution-spec.md` §22 item 3, the "`planner`, `plan-reviewer`, `decider` and `merger` get no shell" and "No prototyping or duplicate work" bullets
- plan.md Decisions D66, D68, D70 and D73
- `plugins/orcastrat/agents/milestone-reviewer.md` line 49 (check 5)
- `tests/orcastrat/agent-files.bats` (the `NON_WORKER_AGENTS` and `NO_SHELL_AGENTS` lines)

**Interfaces**

- Consumes: `NON_WORKER_AGENTS`, a space-separated list of agent names (M04-T02)
- Consumes: `NO_SHELL_AGENTS`, a space-separated list of agent names (M04-T02)
- Produces: `tools: Read, Glob, Grep, Bash, Write` in `milestone-reviewer.md`
- Produces: `tools: Read, Glob, Grep, Write` in `plan-reviewer.md`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, replace the line `NON_WORKER_AGENTS='scout scout-heavy reviewer'` with exactly `NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer'`, and the line `NO_SHELL_AGENTS=''` with exactly `NO_SHELL_AGENTS='plan-reviewer'`.
2. Run Verify and confirm it fails: the non-worker tools, no-shell, bounds and no-prototyping tests fail for these two agents.
3. In `plugins/orcastrat/agents/milestone-reviewer.md`, replace line 7, `disallowedTools: Edit`, with exactly `tools: Read, Glob, Grep, Bash, Write`.
4. In `plugins/orcastrat/agents/plan-reviewer.md`, replace line 7, `disallowedTools: Edit`, with exactly `tools: Read, Glob, Grep, Write`.
5. In `plugins/orcastrat/agents/milestone-reviewer.md`, insert the No-prototyping block, shell version, and the Bounds block, both from Context, above the heading `## Before anything else`.
6. In `plugins/orcastrat/agents/plan-reviewer.md`, insert the No-prototyping block, no-shell version, and the Bounds block, both from Context, above the heading `## Before anything else`.
7. In `plugins/orcastrat/agents/milestone-reviewer.md`, check 5, replace the text `Every test asserts something meaningful, and test output is free of warnings: run each distinct Verify command of the milestone's tasks that runs tests, once, from the repository root, and read its output for warnings.` with exactly ``Every test asserts something meaningful. Judge this from the diff: `run` has already run every Verify command.`` Then run Verify.

**Done when**

- Both files have their `tools` line, no `disallowedTools` line, and their two blocks directly above `## Before anything else`.
- `milestone-reviewer.md` check 5 keeps its first sentence and then has exactly the two sentences Step 7 gives, with no instruction to run a command; nothing else in the two files changed.
- Every test in `tests/orcastrat/agent-files.bats` passes.

### M04-T06: Give the planner its allowlist and the new sections, and check every agent file

- Kind: change
- Tier: worker
- Status: todo
- Wave: 5
- Depends on: M04-T02, M04-T03, M04-T04, M04-T05
- Files: `plugins/orcastrat/agents/planner.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats`
- Fails first: yes
- Commit: `feat(orcastrat): give the planner a tool allowlist and bounds, and check every agent file`

**Objective**

`planner` has `tools: Read, Glob, Grep, Write, Edit` (no shell) and its two sections, and the agent-files test checks that every agent file has the bounds section, a `tools` line and no `disallowedTools` line.

**Read first**

- `docs/orcastrat-execution-spec.md` §22 item 3, the "`planner`" and "`planner`, `plan-reviewer`, `decider` and `merger` get no shell" bullets
- plan.md Decisions D66, D68 and D73
- `plugins/orcastrat/agents/planner.md` lines 1–12
- `tests/orcastrat/agent-files.bats` (the list lines and the helpers `field`, `missing_lines`, `write_bounds`)

**Interfaces**

- Consumes: `NON_WORKER_AGENTS`, a space-separated list of agent names (M04-T02)
- Consumes: `NO_SHELL_AGENTS`, a space-separated list of agent names (M04-T02)
- Consumes: `field <file> <key>` (M04-T02)
- Consumes: `missing_lines <file> <expected-file>` (M04-T02)
- Consumes: `write_bounds <file>` (M04-T02)
- Produces: `tools: Read, Glob, Grep, Write, Edit` in `planner.md`
- Produces: `@test "every agent file has the search and command bounds section"` and `@test "every agent file has a tools line and no disallowedTools line"` in `tests/orcastrat/agent-files.bats`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, replace the line `NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer'` with exactly `NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer planner'`, and the line `NO_SHELL_AGENTS='plan-reviewer'` with exactly `NO_SHELL_AGENTS='plan-reviewer planner'`.
2. At the end of `tests/orcastrat/agent-files.bats`, after one empty line, append exactly:

   ```bash
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
   ```

3. Run Verify and confirm it fails: the tests fail for `planner.md`, which has no `tools` line and no bounds section yet.
4. In `plugins/orcastrat/agents/planner.md`, insert the line `tools: Read, Glob, Grep, Write, Edit` directly after the line `maxTurns: 60`, inside the frontmatter.
5. In `plugins/orcastrat/agents/planner.md`, insert the No-prototyping block, planner version, and the Bounds block, both from Context, above the heading `## Before anything else`.
6. Run Verify.

**Done when**

- `planner.md`'s frontmatter has `tools: Read, Glob, Grep, Write, Edit` after `maxTurns: 60`, and the two blocks sit directly above `## Before anything else`; nothing else in it changed.
- `tests/orcastrat/agent-files.bats` ends with the two tests from Step 2, and every test in it passes.

### M04-T07: Rewrite the tier rubric in the plan format

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/reference/plan-format.md`
- Verify: `grep -qE '^\| Tier \| .worker-mini., .worker-light., .worker., .worker-heavy., or .specialist.\. \|' plugins/orcastrat/reference/plan-format.md && grep -qE 'and is usually .worker-mini.\. Waves' plugins/orcastrat/reference/plan-format.md && grep -qE '^\| .worker-mini. \| Haiku in a serial wave' plugins/orcastrat/reference/plan-format.md && grep -qE '^\| .worker-heavy. \| Opus / medium \|' plugins/orcastrat/reference/plan-format.md && grep -qE 'one task in ten is .worker-heavy. or .specialist.' plugins/orcastrat/reference/plan-format.md && grep -qF 'Plan the tier where the task is expected to succeed' plugins/orcastrat/reference/plan-format.md && grep -qE 'is .worker-mini. → .worker-light. → .worker. → .worker-heavy. → .specialist.\.' plugins/orcastrat/reference/plan-format.md && ! grep -qE '^\| .worker-light. \| Haiku' plugins/orcastrat/reference/plan-format.md`
- Fails first: no (reference text with no tests; the Verify greps fail until the edits are made)
- Commit: `docs(orcastrat): rewrite the tier rubric for five tiers`

**Objective**

The plan format's Tier field lists five tiers, a batch task is usually `worker-mini`, and the Tier rubric describes the five tiers, the ladder, and the one-in-ten rule for `worker-heavy` and `specialist` (spec §5, D72).

**Read first**

- `docs/orcastrat-execution-spec.md` §5, the tier table and "Tier rubric (plan format), rewritten"
- plan.md Decision D72
- `plugins/orcastrat/reference/plan-format.md` lines 221–222 and 270–283

**Interfaces**

- Consumes: `## Tier rubric` (existing, `plugins/orcastrat/reference/plan-format.md:270`)
- Produces: Tier field values `worker-mini`, `worker-light`, `worker`, `worker-heavy`, `specialist`
- Produces: the ladder `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist`

**Steps**

1. In `plugins/orcastrat/reference/plan-format.md`, replace the Tier row of the task field table (line 221), `` | Tier | `worker-light`, `worker`, `worker-heavy`, or `specialist`. | ``, with exactly:

   ```text
   | Tier | `worker-mini`, `worker-light`, `worker`, `worker-heavy`, or `specialist`. |
   ```

2. In the Batch row of the same table (line 222), replace the text ``and is usually `worker-light`.`` with exactly ``and is usually `worker-mini`.``
3. In the `## Tier rubric` section, replace everything from the line `| Tier | Model / effort | Use for |` through the paragraph that starts `A milestone's Context can hold` (lines 272–283) with exactly:

   ```text
   | Tier | Model / effort | Use for |
   |---|---|---|
   | `worker-mini` | Haiku in a serial wave (agent `worker-mini-serial`); Sonnet / low in a parallel wave (agent `worker-mini-parallel`) | Only tasks whose Steps contain the **literal final content** to write: complete lines of code or config, exact file text. The work is transcription plus verification. If any step requires composing code from a prose description, the floor is `worker-light`. |
   | `worker-light` | Sonnet / medium | **The default.** Fully specified work: names, signatures, behavior, and test cases all given in Steps. Most investigate tasks. |
   | `worker` | Sonnet / high | Fully specified but intricate: numeric or geometric code, parsers, state machines, concurrency, many edge cases. |
   | `worker-heavy` | Opus / medium | No design decisions, but bounded judgment the plan can't pin down: unfamiliar library internals, debugging a known failure, poorly documented APIs. |
   | `specialist` | Opus / high | The hardest bounded implementation. Rare by design. |

   The ladder, from lowest to highest, is `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist`.

   Plan the tier where the task is expected to succeed: a failed task climbs only a few rungs of the ladder, so starting too low wastes the rungs it might need.

   The cheapest models often take two to three times as many turns on multi-step work described in prose, which can cost more overall.

   If more than about one task in ten is `worker-heavy` or `specialist`, the milestone is under-specified: split or specify those tasks instead.

   A milestone's Context can hold `- Tier adjustment:` lines, which the planner writes when the same tier escalated two or more times on the same kind of task in `done` milestones. Tasks of that kind in that milestone take the tier the line names, the next tier up the ladder from the one that escalated.
   ```

4. Run Verify.

**Done when**

- The Tier row, the Batch row's last-but-one sentence, and the Tier rubric section read as in Steps 1–3, and nothing else in the file changed.

### M04-T08: Dispatch by the new ladder in run

- Kind: change
- Tier: worker
- Status: todo
- Wave: 2
- Depends on: M04-T02
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'orcastrat:worker-mini-serial' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'orcastrat:worker-mini-parallel' plugins/orcastrat/skills/run/SKILL.md && grep -qF '1. **Dispatch** to the worker agent for the task' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'one call per task to the worker agent for its tier (see Definitions)' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'dispatch again to the worker agent for the next tier (see Definitions)' plugins/orcastrat/skills/run/SKILL.md && grep -qE 'one tier up the ladder: .worker-mini. → .worker-light. → .worker. → .worker-heavy. → .specialist.\.' plugins/orcastrat/skills/run/SKILL.md && ! grep -qE 'Dispatch\*\* to the agent .orcastrat:<tier>.' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no tests; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): dispatch worker-mini by mode and climb the five-tier ladder`

**Objective**

`run` sends each task to the worker agent for its tier, with `worker-mini` going to `worker-mini-serial` in a serial wave and `worker-mini-parallel` in a parallel wave, and retries one tier up the five-tier ladder.

**Read first**

- `docs/orcastrat-execution-spec.md` §5, the paragraphs "`worker-mini` picks its agent by mode" and "Ladder"
- `plugins/orcastrat/skills/run/SKILL.md` lines 29–37 (Definitions), 156–162 (3d item 1), 188–192 (3e item 2) and 253–264 (**Retry**)

**Interfaces**

- Consumes: `plugins/orcastrat/agents/worker-mini-serial.md`, agent `orcastrat:worker-mini-serial` (M04-T02)
- Consumes: `plugins/orcastrat/agents/worker-mini-parallel.md`, agent `orcastrat:worker-mini-parallel` (M04-T02)
- Produces: `**Worker agent** for a tier` definition in `plugins/orcastrat/skills/run/SKILL.md`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, Definitions, directly after the line ``- **Task branch**: `orcastrat/<plan-slug>/<task-id>`.``, insert exactly this line:

   ```text
   - **Worker agent** for a tier: `orcastrat:<tier>`, except for `worker-mini`, which has two agents: `orcastrat:worker-mini-serial` in a serial wave (3d) and `orcastrat:worker-mini-parallel` in a parallel wave (3e).
   ```

2. In section 3d, replace the line ``1. **Dispatch** to the agent `orcastrat:<tier>`, sending exactly:`` with exactly:

   ```text
   1. **Dispatch** to the worker agent for the task's tier (see Definitions), sending exactly:
   ```

3. In section 3e, item 2, replace the text `one agent call per task, all in a single message, so they run concurrently.` with exactly `one call per task to the worker agent for its tier (see Definitions), all in a single message, so they run concurrently.`
4. In the **Retry** section, replace the line ``Each task gets at most one retry, one tier up: `worker-light` → `worker` → `worker-heavy` → `specialist`.`` with exactly:

   ```text
   Each task gets at most one retry, one tier up the ladder: `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist`.
   ```

5. In the **Retry** section, replace the text `Then dispatch again to the next tier with these lines appended:` with exactly `Then dispatch again to the worker agent for the next tier (see Definitions) with these lines appended:`
6. Run Verify.

**Done when**

- Definitions has the **Worker agent** entry; 3d item 1, 3e item 2 and the **Retry** section dispatch through it; the Retry ladder has five tiers; nothing else in the file changed.

### M04-T09: Count a missing report as a failed attempt, and state the dispatch rule

- Kind: change
- Tier: worker
- Status: todo
- Wave: 3
- Depends on: M04-T08
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'it returned no report (for example, it hit its turn limit)' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'the worker returned no report: queue a **Retry**' plugins/orcastrat/skills/run/SKILL.md && grep -qF '"RED not confirmed (Fails first: yes)", or "no report">' plugins/orcastrat/skills/run/SKILL.md && grep -qF '**Every-dispatch instructions live in agent files.**' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no tests; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): retry a worker that returns no report, and keep dispatches task-unique`

**Objective**

`run` treats a worker reply with no `STATUS:` line as a failed attempt and retries it with the reason `no report` (D74), and its operating rules state the standing rule that every-dispatch instructions live in agent files (Change 21.2).

**Read first**

- `docs/orcastrat-execution-spec.md` §4, the "Failed attempt" bullet, and §22 item 2, the last three bullets
- plan.md Decision D74
- `plugins/orcastrat/skills/run/SKILL.md` "Operating rules for long runs", section 3d item 3, section 3e item 3, and the **Retry** section's appended lines

**Interfaces**

- Consumes: `Reason: <worker's NOTE, reviewer's REASONS, "Verify failed", or "RED not confirmed (Fails first: yes)">` (existing, `plugins/orcastrat/skills/run/SKILL.md:261`, one line lower once M04-T08 has inserted its Definitions line)
- Produces: retry reason `no report`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, Operating rules for long runs, directly after the bullet that starts `- **Keep your own output small.**`, insert exactly this line:

   ```text
   - **Every-dispatch instructions live in agent files.** A dispatch message carries only the lines that change from one dispatch to the next, exactly as this skill gives them. Anything that applies to every dispatch of an agent belongs in that agent's file, never in a dispatch message. This is a standing rule: a later change that adds an every-dispatch instruction puts it in the agent file.
   ```

2. In section 3d, item 3, replace the text ``For a task with `- Fails first: yes`, check RED first:`` with exactly:

   ```text
   If the worker's reply has no `STATUS:` line, it returned no report (for example, it hit its turn limit): that is a failed attempt, so go to **Retry** with the reason `no report`. For a task with `- Fails first: yes`, check RED first:
   ```

3. In section 3e, item 3, directly after the bullet that starts `   - First, apply the checks of 3d item 2 to that worktree,`, insert exactly this line:

   ```text
      - No `STATUS:` line in the reply → the worker returned no report: queue a **Retry**, with the reason `no report`.
   ```

4. In the **Retry** section, replace the line `  Reason: <worker's NOTE, reviewer's REASONS, "Verify failed", or "RED not confirmed (Fails first: yes)">` with exactly:

   ```text
     Reason: <worker's NOTE, reviewer's REASONS, "Verify failed", "RED not confirmed (Fails first: yes)", or "no report">
   ```

5. Run Verify.

**Done when**

- 3d item 3 and 3e item 3 retry a reply with no `STATUS:` line with the reason `no report`, the Retry reason line lists `"no report"`, and the operating rules have the every-dispatch bullet; nothing else in the file changed.

### M04-T10: Name the new tiers in the planner and the plan-reviewer

- Kind: change
- Tier: worker
- Status: todo
- Wave: 6
- Depends on: M04-T05, M04-T06, M04-T07
- Files: `plugins/orcastrat/agents/planner.md`, `plugins/orcastrat/agents/plan-reviewer.md`
- Verify: `grep -qE 'Default to .worker-light.; justify each' plugins/orcastrat/agents/planner.md && grep -qE 'usually on .worker-mini., as the plan' plugins/orcastrat/agents/planner.md && grep -qE 'on the ladder .worker-mini. → .worker-light. → .worker. → .worker-heavy. → .specialist.' plugins/orcastrat/agents/planner.md && grep -qE 'fully specified work is .worker-light., fully specified but intricate work is .worker.' plugins/orcastrat/agents/plan-reviewer.md && grep -qE 'one task in ten is .worker-heavy. or .specialist.' plugins/orcastrat/agents/plan-reviewer.md && ! grep -qE 'Default to .worker.;' plugins/orcastrat/agents/planner.md`
- Fails first: no (agent text with no tests; the Verify greps fail until the edits are made)
- Commit: `docs(orcastrat): name the five tiers in the planner and plan-reviewer`

**Objective**

The planner defaults to `worker-light`, puts batch tasks on `worker-mini` and raises tiers on the five-tier ladder, and the plan-reviewer's tier-fit check follows the new rubric and applies the one-in-ten rule to `worker-heavy` and `specialist` together.

**Read first**

- `docs/orcastrat-execution-spec.md` §5, "Tier rubric (plan format), rewritten"
- plan.md Decision D72
- `plugins/orcastrat/agents/planner.md` the "Write the tasks as prompts" section
- `plugins/orcastrat/agents/plan-reviewer.md` check 8

**Interfaces**

- Consumes: Tier field values `worker-mini`, `worker-light`, `worker`, `worker-heavy`, `specialist` (M04-T07)
- Consumes: the ladder `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist` (M04-T07)
- Produces: none

**Steps**

1. In `plugins/orcastrat/agents/planner.md`, replace the text ``Default to `worker`; justify each`` with exactly ``Default to `worker-light`; justify each``.
2. In `plugins/orcastrat/agents/planner.md`, replace the text ``usually on `worker-light`, as the plan format's Batch field defines it`` with exactly ``usually on `worker-mini`, as the plan format's Batch field defines it``.
3. In `plugins/orcastrat/agents/planner.md`, replace the text ``on the ladder `worker-light` → `worker` → `worker-heavy` → `specialist`,`` with exactly ``on the ladder `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist`,``.
4. In `plugins/orcastrat/agents/plan-reviewer.md`, replace the line that starts `8. **Tier fit.**` with exactly:

   ```text
   8. **Tier fit.** Each task's Tier fits the tier rubric in the plan format, including the notes under its table: `worker-mini` only when the Steps contain the literal final content, fully specified work is `worker-light`, fully specified but intricate work is `worker`, and any other tier matches what the rubric says that tier is for. Every `worker-heavy` and `specialist` task has a Why this tier line that fits the rubric, and no more than about one task in ten is `worker-heavy` or `specialist`.
   ```

5. Run Verify.

**Done when**

- `planner.md` names `worker-light` as the default, `worker-mini` for batch tasks, and the five-tier ladder; `plan-reviewer.md` check 8 reads as in Step 4; nothing else in either file changed.

### M04-T11: Name the new tiers in the plan skill and add its no-prototyping section

- Kind: change
- Tier: worker
- Status: todo
- Wave: 2
- Depends on: M04-T07
- Files: `plugins/orcastrat/skills/plan/SKILL.md`
- Verify: `grep -qF '## No prototyping or duplicate work' plugins/orcastrat/skills/plan/SKILL.md && grep -qF 'The one exception is a small job you do directly in step 10' plugins/orcastrat/skills/plan/SKILL.md && grep -qF 'Write nothing except the plan directory.' plugins/orcastrat/skills/plan/SKILL.md && grep -qE 'Default to .worker-light.; justify every' plugins/orcastrat/skills/plan/SKILL.md && grep -qE 'usually on .worker-mini., as the plan' plugins/orcastrat/skills/plan/SKILL.md && ! grep -qE 'Default to .worker.;' plugins/orcastrat/skills/plan/SKILL.md`
- Fails first: no (skill text with no tests; the Verify greps fail until the edits are made)
- Commit: `docs(orcastrat): add the plan skill's no-prototyping section and name the new tiers`

**Objective**

The `plan` skill has its own `## No prototyping or duplicate work` section, with step 10 as its one exception (D71), defaults to `worker-light`, and puts batch tasks on `worker-mini` (D72).

**Read first**

- `docs/orcastrat-execution-spec.md` §22 item 3, the "No prototyping or duplicate work" bullet
- plan.md Decisions D71, D72 and D73
- `plugins/orcastrat/skills/plan/SKILL.md` lines 9–21 and 95–106

**Interfaces**

- Consumes: Tier field values `worker-mini`, `worker-light`, `worker`, `worker-heavy`, `specialist` (M04-T07)
- Produces: `## No prototyping or duplicate work` in `plugins/orcastrat/skills/plan/SKILL.md`

**Steps**

1. In `plugins/orcastrat/skills/plan/SKILL.md`, insert this block above the heading `## 1. Re-read the ground truth` (see "Inserting blocks above a heading" in Context):

   ```text
   ## No prototyping or duplicate work

   These rules hold while you plan. The one exception is a small job you do directly in step 10: there you implement, verify and commit its tasks as that step says.

   - Don't implement. Never write or run trial code, scripts, tests or fixtures, in the repository, the scratchpad or any temp directory. Never create git worktrees, branches or commits. Write nothing except the plan directory. Building and testing is the workers' job, and each task's own tests catch mistakes.
   - Don't redo another agent's work: don't re-survey what the milestone's survey note covers; don't re-run a task's Verify, a Milestone verify or a Final verify; don't re-check facts a Decision or a cited note already records.
   - Settle uncertainty in the plan, not by experiment: a detail only running something would settle becomes an exact Step or Done-when for the worker; an unknown fact becomes an `investigate` task; a design choice is a GAP.
   - Use the shell only for short read-only commands (`git log`, `git show`, `git diff`, `git status`, `grep`, `ls`, `cat`).
   ```

2. In step 6, replace the text ``usually on `worker-light`, as the plan format's Batch field defines it`` with exactly ``usually on `worker-mini`, as the plan format's Batch field defines it``.
3. In step 6, replace the text ``Default to `worker`; justify every`` with exactly ``Default to `worker-light`; justify every``.
4. Run Verify.

**Done when**

- The skill has the section from Step 1 directly above `## 1. Re-read the ground truth`, step 6 names `worker-mini` for batch tasks and `worker-light` as the default, and nothing else in the file changed.
