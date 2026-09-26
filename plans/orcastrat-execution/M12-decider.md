# M12: The decider (Change 12)

- Status: in-progress
- Format: 2
- Goal: A `decider` agent answers every GAP during a run with a recommendation (or `no recommendation`) and a `local` or `stop` label. With `Auto-decide: local` or `--auto-decide`, `run` records `local` recommendations as Decisions and continues, up to `Max auto-decisions` per invocation, then pauses with `LIMIT`. Otherwise the stop report carries the recommendation. `plan` never uses the decider.
- Depends on: M11
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §13 (Change 12), §1.3, §8 (the retry's fresh brief), §10 (the decider's reply), §22 items 2 and 3 (`decider`); Decisions D12, D13, D29, D33, D48, D66, D68, D73, D81, D85, D101, D142, D206 and D215–D229.

- D62: no task in this milestone is `worker-light`; `worker` is the floor.
- Tier adjustment: test-first bats tasks → worker (worker-light escalated 2 times in M02)
- D48, D66, D215: the new `decider` agent gets the `## Search and command bounds` and `## No prototyping or duplicate work` sections and the 20-line reply cap, and its `tools` line is `Read, Glob, Grep, Write`, with no `Bash`, `Agent`, `Task`, `Skill` or `Artifact`. `tests/orcastrat/agent-files.bats` checks all of them once `decider` is in its agent lists.
- `decider` (D68, D215, D225): `model: opus`, `effort: high`, `maxTurns: 40`. Its input lines are `Plan:`, `Question ID:`, `From:`, `Question:`, `Brief:` (a worker's GAP only) and `Output: <plan dir>/notes/decisions/<question-id>.md`, question IDs following D33 and D217. It writes only its output file and replies with the four lines `RECOMMENDATION:`, `REASON:`, `LABEL:` and `OUTPUT:`.
- `run` (D216–D225, D227–D229): the decider runs for every GAP, from a worker or the planner, never for VACUOUS. Under Auto-decide `local`, a `local` recommendation becomes the Decision `- D<nn> [<milestone ID>]: ...` with the source `auto-decided (<question-id>)`, plus an `auto-decided <UTC> <question-id> D<nn>` run-log line, in the commit `chore(plan): <From> auto-decided <question-id>`. A worker's auto-decided task stays `todo`, and the wave loop retries it at the same tier; the planner is invoked again once all of its GAP's questions are auto-decided. Every other question gets a `Decider:` line in Open questions, and the run stops as a GAP. The auto-decision count limits this per run invocation, pausing with `LIMIT`.
- `run-report` (M11) already lists `auto-decided` run-log lines (D206). M12-T02 lets it find a Decision line that carries D225's milestone tag (D226).
- `plugins/orcastrat/README.md` and `CHANGELOG.md` are M15's: no task here edits them.
- The run executing this plan is the installed, pre-rename plugin (D37). Editing the repository's skills and agents changes nothing in that run. No task runs `run` or `plan`, installs the plugin or starts Claude Code, and no test runs Claude Code.
- The bats files run slowly on Windows. Give a Verify command that runs bats a Bash timeout of 600000 ms. On this machine git prints `LF will be replaced by CRLF` warnings while tests build fixtures; they are expected.
- Every block a Step gives in a fence is its literal final content: the fenced block in that Step, with the three-space list indentation removed from each line. Blank lines stay empty. Copy a block exactly; don't reformat, reorder or "improve" it. A block fenced with four backticks may hold three-backtick fences of its own: they are part of the content.
- **Replacing text.** "Replace A with B" means: find A, which occurs exactly once in the file unless the Step gives another count (as a whole line, or as the part of a line quoted), and put B in its place, changing nothing around it. If A isn't found that many times, stop and report `BLOCKED` / `GAP` quoting A.
- **Inserting lines.** "Directly below the line L, insert X" means: put X on its own lines right after L, with no empty line between them. "Directly above the line L, insert X" means: put X right before L, followed by one empty line, so that L keeps an empty line above it.
- Skill and reference text contains no `$(`: `tests/orcastrat/skill-files.bats` checks it.
- In a bats test body, never negate a command with `!` except on its last line: bats runs the body under `set -e`, which ignores a negated command. Use `run <command>` and then `[ "$status" -ne 0 ]` instead (M11-T11).

Waves: 6 (widths 4, 1, 1, 1, 1, 1)

## Coverage

- `docs/orcastrat-execution-spec.md` preamble: every question asked mid-run comes with a recommendation, and a clear GAP no longer stops an unattended run → M12-T06, M12-T07, M12-T09
- `docs/orcastrat-execution-spec.md` §1.1: known mechanisms only: an agent file, parallel Agent calls in one message, plan files and git → M12-T01, M12-T06
- `docs/orcastrat-execution-spec.md` §1.2: the plan format names the `decider`, its output files, the `Auto-decide` and `Max auto-decisions` fields, and the auto-decided Decision and `Decider:` lines; `run-report` reads the tagged Decision line → M12-T02, M12-T03
- `docs/orcastrat-execution-spec.md` §1.3: the decider only recommends; only `local` recommendations under `Auto-decide: local` are applied without the user → M12-T01, M12-T06
- `docs/orcastrat-execution-spec.md` §1.4: the decider's description is valid YAML, quoted → M12-T01
- `docs/orcastrat-execution-spec.md` §8: the retry after an auto-decided worker GAP gets a fresh brief holding the new Decision (D101) → M12-T07
- `docs/orcastrat-execution-spec.md` §10: the decider writes its reasoning to its output file and replies with a status block of at most 20 lines → M12-T01
- `docs/orcastrat-execution-spec.md` §12: auto-decided questions are listed, each with its Decision, the milestone-tagged line included (D206, D225, D226) → M12-T02
- `docs/orcastrat-execution-spec.md` §13: `decider` is Opus, high effort, `maxTurns: 40`, read-only except its one output file `notes/decisions/<question-id>.md` → M12-T01
- `docs/orcastrat-execution-spec.md` §13: its input is the plan directory, the question with its task or milestone, and the output path; it reads the question, the sources, plan.md's Decisions, the milestone's Context and the relevant code (D225) → M12-T01, M12-T06
- `docs/orcastrat-execution-spec.md` §13: it returns a recommendation with a one-line reason or `no recommendation`, and a `local` or `stop` label, writing its full reasoning to the output file → M12-T01
- `docs/orcastrat-execution-spec.md` §13: it answers only the question asked: no task revisions, no structure changes, no chained decisions → M12-T01
- `docs/orcastrat-execution-spec.md` §13: `run` uses it for every GAP, from a worker or the planner (D216, D217) → M12-T06, M12-T07, M12-T08, M12-T09
- `docs/orcastrat-execution-spec.md` §13: `Auto-decide: local` from the header field or `--auto-decide` (D221) → M12-T03, M12-T05
- `docs/orcastrat-execution-spec.md` §13: a `local` recommendation is recorded in Decisions with the source `auto-decided (<question-id>)` (D225, D227) → M12-T06
- `docs/orcastrat-execution-spec.md` §13: a worker's auto-decided GAP resets to BASE without a failure-log entry, regenerates the brief and retries at the same tier, not a failed attempt (D219, D224) → M12-T07, M12-T08
- `docs/orcastrat-execution-spec.md` §13: a planner's auto-decided GAP invokes the planner again (D220, D222, D228) → M12-T09
- `docs/orcastrat-execution-spec.md` §13: a `stop` label or `no recommendation` stops as a GAP; under `Auto-decide: off` the decider still runs and the stop report gives its recommendation and label (D225) → M12-T06, M12-T07, M12-T09
- `docs/orcastrat-execution-spec.md` §13: `Max auto-decisions` (default 5) per run invocation; reaching it pauses with `LIMIT` (D218, D223, D229) → M12-T03, M12-T05, M12-T06
- `docs/orcastrat-execution-spec.md` §13: auto-decided items get their own run-report section (D206) → M12-T02, M12-T06
- `docs/orcastrat-execution-spec.md` §13: planning questions are always answered by the user → M12-T03, M12-T04
- `docs/orcastrat-execution-spec.md` §13 Acceptance: the agent exists; `run` dispatches it on every GAP; auto-decide and its limit work as described → M12-T01, M12-T05, M12-T06, M12-T07, M12-T08, M12-T09
- `docs/orcastrat-execution-spec.md` §22 item 2: the decider's file has the search and command bounds, and its invariant instructions live in the agent file, not the dispatch → M12-T01
- `docs/orcastrat-execution-spec.md` §22 item 3: the decider's allowlist is `Read, Glob, Grep, Write`, with no shell and no Agent, Task, Skill or Artifact tool, and it has the no-prototyping section (D68, D215) → M12-T01
- `docs/orcastrat-execution-spec.md` §29 item 9: Change 12 is built after Changes 10 and 11 → M12-T01, M12-T06
- `docs/orcastrat-execution-spec.md` §31: the kebab-case name `decider` and valid frontmatter → M12-T01
- `docs/orcastrat-execution-spec.md` §32 items 16, 17 and 68: the decider handles every GAP and auto-accepts only `local` ones under `Auto-decide: local`, up to 5 per run; `plan` never auto-decides; the decider has no shell → M12-T01, M12-T04, M12-T06, M12-T07

## Review Focus

- An auto-decided Decision line that carries its `[<milestone ID>]` tag → `run-report` lists it with its full text under its question ID, not as `(not in plan.md)` (source: D206; D225; D226). Test: `an auto-decided Decision with a milestone tag is listed with its text` in M12-T02.
- A planner GAP where only some questions are auto-decided → those are recorded, and the run stops as a GAP with the rest, without invoking the planner again (source: D222). Test: `run stops with the planner questions the decider left open` in M12-T09.
- A decider call that errors or hits its turn limit, leaving no `RECOMMENDATION:` line → it counts as `no recommendation`, and nothing is applied (source: D216). Test: `run takes a decider reply without a recommendation as no recommendation` in M12-T06.
- A `local` recommendation that comes up once the auto-decision count equals `Max auto-decisions` → it isn't recorded, and it stops the run as a GAP with its recommendation (source: D223). Test: `run records no auto-decision past the limit` in M12-T06.
- A `RED: PASSED-EARLY` (VACUOUS) block → it is never sent to the decider (source: D216). Test: `run never sends a VACUOUS block to the decider` in M12-T07.

## Tasks

### M12-T01: Add the decider agent

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/agents/decider.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the decider agent`

**Objective**

`agents/decider.md` exists, an Opus/high agent with `maxTurns: 40` and `tools: Read, Glob, Grep, Write` that recommends an answer to one GAP question with a `local` or `stop` label, writes its reasoning to its one output file and replies with a four-line block, and `agent-files.bats` checks it (spec §13, §22 items 2 and 3; D68, D215, D225).

**Read first**

- `docs/orcastrat-execution-spec.md` §13
- `docs/orcastrat-execution-spec.md` §22, item 3 (the `decider` bullets)
- plan.md Decisions D215 and D225
- `plugins/orcastrat/agents/plan-reviewer.md` lines 1–57 (pattern: a no-shell agent that writes one output file)
- `tests/orcastrat/agent-files.bats` (whole file)

**Interfaces**

- Consumes: `NON_WORKER_AGENTS` (existing, `tests/orcastrat/agent-files.bats:9`)
- Consumes: `NO_SHELL_AGENTS` (existing, `tests/orcastrat/agent-files.bats:10`)
- Consumes: `field <file> <key>` (existing, `tests/orcastrat/agent-files.bats:16`)
- Consumes: `has_line <file> <text>` (existing, `tests/orcastrat/agent-files.bats:27`)
- Produces: `plugins/orcastrat/agents/decider.md`
- Produces: `orcastrat:decider input: Plan: <plan dir>, Question ID: <question-id>, From: <task ID or milestone ID>, Question: <the question>, Brief: <the task's brief path> (a worker's GAP only), Output: <plan dir>/notes/decisions/<question-id>.md`
- Produces: `orcastrat:decider reply: RECOMMENDATION: <the decision in one line, worded to stand alone as a plan.md Decision> | no recommendation, REASON: <one line>, LABEL: local | stop, OUTPUT: <the Output path>`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, replace `NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer planner merger status-reader validator'` with `NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer planner merger status-reader validator decider'`. Replace `NO_SHELL_AGENTS='plan-reviewer planner merger'` with `NO_SHELL_AGENTS='plan-reviewer planner merger decider'`. Replace the line `      plan-reviewer) expected='Read, Glob, Grep, Write' ;;` with `      plan-reviewer|decider) expected='Read, Glob, Grep, Write' ;;`.
2. At the end of the file, after one empty line, add this test:

   ```bash
   @test "decider has its model, effort, maxTurns, input lines, rules and reply block" {
     local f="$AGENTS/decider.md"
     [ "$(field "$f" name)" = 'decider' ]
     [ "$(field "$f" model)" = 'opus' ]
     [ "$(field "$f" effort)" = 'high' ]
     [ "$(field "$f" maxTurns)" = '40' ]
     has_line "$f" 'Plan: <plan dir>'
     has_line "$f" 'Question ID: <question-id>'
     has_line "$f" 'From: <task ID or milestone ID>'
     has_line "$f" 'Question: <the question>'
     has_line "$f" 'Brief: <the task'"'"'s brief path>'
     has_line "$f" 'Output: <plan dir>/notes/decisions/<question-id>.md'
     has_line "$f" '- Don'"'"'t implement. Never write or run trial code, scripts, tests or fixtures, in the repository, the scratchpad or any temp directory. Never create git worktrees, branches or commits. Write nothing except your own output file. Building and testing is the workers'"'"' job, and each task'"'"'s own tests catch mistakes.'
     has_line "$f" '- You have no shell. Read files with Read, Glob and Grep.'
     has_line "$f" '1. Answer only the question asked. Never revise a task, change the plan'"'"'s structure, or chain decisions: if answering it needs another decision first, your recommendation is `no recommendation`.'
     has_line "$f" '   - `local`: the decision is confined to one milestone'"'"'s implementation, and easy to reverse.'
     has_line "$f" '   - `stop`: the decision crosses milestones, or touches interfaces other milestones consume, data formats, public APIs, security, or licensing.'
     has_line "$f" 'RECOMMENDATION: <the decision in one line, worded to stand alone as a plan.md Decision> | no recommendation'
     has_line "$f" 'REASON: <one line>'
     has_line "$f" 'LABEL: local | stop'
     has_line "$f" 'OUTPUT: <the Output path>'
   }
   ```

3. Run Verify and confirm it fails.
4. Create `plugins/orcastrat/agents/decider.md` with exactly this content:

   ````markdown
   ---
   name: decider
   description: "Recommends an answer to one GAP question that a worker or the planner raised during an Orcastrat run, with a one-line reason, or no recommendation, and labels it local or stop. Read-only except its one output file. Dispatched by /orcastrat:run only; planning questions always go to the user."
   model: opus
   effort: high
   maxTurns: 40
   tools: Read, Glob, Grep, Write
   ---

   You answer one question that stopped a run: a design decision the plan left open, raised as a GAP by a worker or by the planner. You read the question, the sources, plan.md's Decisions, the milestone's Context and the relevant code, and you recommend one answer with a one-line reason, or reply `no recommendation`. You label your answer `local` or `stop`. `run` applies a `local` recommendation without the user only when the plan allows it; every other answer goes to the user, with your recommendation beside the question. You change nothing except your output file.

   ## No prototyping or duplicate work

   - Don't implement. Never write or run trial code, scripts, tests or fixtures, in the repository, the scratchpad or any temp directory. Never create git worktrees, branches or commits. Write nothing except your own output file. Building and testing is the workers' job, and each task's own tests catch mistakes.
   - Don't redo another agent's work: don't re-survey what the milestone's survey note covers; don't re-run a task's Verify, a Milestone verify or a Final verify; don't re-check facts a Decision or a cited note already records.
   - Settle uncertainty in the plan, not by experiment: a detail only running something would settle becomes an exact Step or Done-when for the worker; an unknown fact becomes an `investigate` task; a design choice is a GAP.
   - You have no shell. Read files with Read, Glob and Grep.

   ## Search and command bounds

   - Search only inside the repository, or paths named in your brief or task. Never search from a filesystem root or home directory (`find /`, `find ~`, `find /c`, `find C:\`). Prefer the Glob and Grep tools over `find`.
   - Never start a background command, and never run a command that may not finish within the Bash time limit. If you need information a long command would give, report the question instead of running it.
   - Don't verify environment facts (installed tools, versions) that a task's own Verify or scripts establish. For example, `run-bats.sh` clones bats itself.

   You have no Agent, Task, Skill or Artifact tool, so you can't start subagents, run skills or create artifacts.

   ## Before anything else

   You receive these lines, with `Brief:` only when a worker raised the question:

   ```
   Plan: <plan dir>
   Question ID: <question-id>
   From: <task ID or milestone ID>
   Question: <the question>
   Brief: <the task's brief path>
   Output: <plan dir>/notes/decisions/<question-id>.md
   ```

   Read these now, each file once, and only the parts you need:

   1. `CLAUDE.md` and `AGENTS.md` at the repository root. If one is a symlink to the other, or they have identical content, read it once.
   2. The context of the question. With a `Brief:` line, a worker raised it: read the brief at that path, in full. It holds plan.md's Decisions, the milestone's Context and the task block of the task that stopped. Without one, the planner raised it while detailing the milestone that `From:` names: Grep `<plan dir>/plan.md` for `^- \(<From>\) ` with 4 lines of context after each match, and read the `Where:` and `Options:` lines below the match that holds the question. Then read plan.md's `## Decisions` section, and the `## Context` section of the milestone file that plan.md's Milestones table names for that ID.
   3. The source sections that the question, the task or the milestone's Context cite. plan.md's `- Sources:` line names the sources.
   4. The code the question is about, only in the parts that bear on the answer.

   Project instruction files (CLAUDE.md, AGENTS.md, CLAUDE.local.md, `.claude/rules/`, and any nested or linked copies, whatever they're called) govern coding conventions, style, and project knowledge. They do not govern git. Where they say anything about committing, pushing, branching, stashing, resetting, or rewriting history, this plugin's rules replace them for the length of this task. You never commit, push, or change branches.

   ## Decide

   1. Answer only the question asked. Never revise a task, change the plan's structure, or chain decisions: if answering it needs another decision first, your recommendation is `no recommendation`.
   2. Recommend the answer that the sources, plan.md's Decisions, the instruction files and the existing code best support, with a one-line reason, or `no recommendation` when you can't recommend one. Word the recommendation as one line that stands alone as a plan.md Decision: `run` may copy it into plan.md's Decisions as it is.
   3. Label every answer, `no recommendation` included:
      - `local`: the decision is confined to one milestone's implementation, and easy to reverse.
      - `stop`: the decision crosses milestones, or touches interfaces other milestones consume, data formats, public APIs, security, or licensing.

   ## Output file

   Write your full reasoning to the file at the `Output:` path, creating its directory if needed, with these sections, in this order:

   - `## Question`: the question ID, the task or milestone it came from, and the question, quoted exactly.
   - `## What I read`: each file and section you read, with a `path:line` citation wherever it bears on the answer.
   - `## Options`: each answer you considered, with what speaks for and against it.
   - `## Recommendation`: your recommendation and its reason, or `no recommendation` and why.
   - `## Label`: `local` or `stop`, and why.

   ## Report

   Reply with exactly this block and nothing else:

   ```
   RECOMMENDATION: <the decision in one line, worded to stand alone as a plan.md Decision> | no recommendation
   REASON: <one line>
   LABEL: local | stop
   OUTPUT: <the Output path>
   ```

   Your reply is at most 20 lines. Anything longer goes in a file under the plan directory's `notes/`, and your reply gives its path.
   ````

5. Run Verify and confirm all 27 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats` reports 27 tests and no failure.
- `decider` has `model: opus`, `effort: high`, `maxTurns: 40`, `tools: Read, Glob, Grep, Write`, the no-prototyping and bounds sections, the six input lines, the four-line reply block and the 20-line reply cap.
- Nothing else in `agent-files.bats` changed.

### M12-T02: run-report finds auto-decided Decisions by their milestone tag

- Kind: change
- Tier: worker
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/scripts/run-report`, `tests/orcastrat/run-report.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/run-report.bats`
- Fails first: yes
- Commit: `fix(orcastrat): run-report finds auto-decided Decisions by their milestone tag`

**Objective**

`run-report` lists an auto-decided question with its Decision line when that line carries D225's milestone tag, `- D<nn> [<milestone ID>]: ...`, instead of printing `D<nn> (not in plan.md)` (spec §12, §13; D206, D225, D226).

**Read first**

- plan.md Decisions D206, D225 and D226
- `plugins/orcastrat/scripts/run-report` lines 73–80 (`decision_records`) and 685–690 (the `D` record parser)
- `tests/orcastrat/run-report.bats` lines 1–97 (setup, `run_script`, `write_plan`, `write_log`, `section`) and 394–422 (the test `run-log events are counted per invocation and for the plan`)

**Interfaces**

- Consumes: `decision_records (kind D)` (existing, `plugins/orcastrat/scripts/run-report:76`)
- Consumes: `auto-decided <UTC> <question-id> D<nn>` (existing, `plugins/orcastrat/scripts/run-report:544`)
- Consumes: `run-report.bats helpers run_script, write_plan, write_log <line>... and section <file> <heading>` (existing, `tests/orcastrat/run-report.bats:44`)
- Produces: `run-report Auto-decided questions entry "  - <question-id>: D<nn> [<milestone ID>]: <Decision text>" for a tagged Decision line`

**Steps**

1. At the end of `tests/orcastrat/run-report.bats`, after one empty line, add this test:

   ```bash
   @test "an auto-decided Decision with a milestone tag is listed with its text" {
     local tagged='- D10 [M02]: Use a lock file. (→ plans/demo plan/notes/decisions/M02-T05-q1.md; source: auto-decided (M02-T05-q1))'
     awk -v line="$tagged" '{ print } $0 == "- D02: Use the second option. (source: decider)" { print line }' "$PLAN/plan.md" > "$PLAN/plan.new"
     mv "$PLAN/plan.new" "$PLAN/plan.md"
     write_log "start 2026-09-21T09:00:00Z plans/demo plan" "auto-decided 2026-09-21T09:50:00Z M02-T05-q1 D10" "end 2026-09-21T11:30:59Z STOP GAP"
     run_script "$PLAN"
     [ "$status" -eq 0 ]
     P=$(section "$REPORT" '## Plan so far')
     printf '%s\n' "$P" | grep -qxF -- '- Auto-decided questions: 1'
     printf '%s\n' "$P" | grep -qxF -- "  - M02-T05-q1: ${tagged#- }"
   }
   ```

2. Run Verify and confirm it fails.
3. In `plugins/orcastrat/scripts/run-report`, replace the comment line `# "^- D[0-9]+:".` with these two lines:

   ```bash
   # "^- D[0-9]+( \[M[0-9]+\])?:": a Decision, with or without the milestone
   # tag of an auto-decided one (D225).
   ```

4. Replace the line `    /^- D[0-9]+:/ { printf "D\t%s\n", substr($0, 3) }` with `    /^- D[0-9]+( \[M[0-9]+\])?:/ { printf "D\t%s\n", substr($0, 3) }`.
5. Directly below the line `  sub(/:.*/, "", did)` (in the block that starts `substr($0, 1, 1) == "D" {`), insert the line `  sub(/ .*/, "", did)`, so the Decision ID of `D10 [M02]: ...` is `D10`, and an untagged ID stays as it was.
6. Run Verify and confirm all 30 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/run-report.bats` reports 30 tests and no failure.
- A tagged Decision is listed with its whole line, tag included, after its question ID, and the existing test's untagged `D02` line is still listed.
- Nothing else in either file changed.

### M12-T03: Name the decider and the auto-decide fields in the plan format

- Kind: change
- Tier: worker
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/reference/plan-format.md`
- Verify: `f=plugins/orcastrat/reference/plan-format.md && grep -qF -- '- **decider** (agent), which recommends an answer to each GAP during a run' "$f" && grep -qF "and the decider's recommendations (decisions/<question-id>.md)" "$f" && grep -qF '| Auto-decide | Optional:' "$f" && grep -qF '| Max auto-decisions | Optional:' "$f" && grep -qF 'whose milestone is its scope' "$f" && ! grep -qF '$(' "$f"`
- Fails first: no (reference text with no test of its own; the Verify greps fail until the edits are made)
- Commit: `docs(orcastrat): name the decider and the auto-decide fields in the plan format`

**Objective**

The plan format names the `decider` among the plan's readers and its `notes/decisions/` files, defines the optional header fields `Auto-decide` and `Max auto-decisions`, and describes the auto-decided Decision line and the `Decider:` line in Open questions (spec §1.2, §13; D221, D225).

**Read first**

- `docs/orcastrat-execution-spec.md` §13
- plan.md Decisions D221, D225 and D229
- `plugins/orcastrat/reference/plan-format.md` lines 1–111 (the reader list, `## Directory`, the header fields table, and "Decisions and open questions")

**Interfaces**

- Consumes: none
- Produces: `plan format header fields Auto-decide: off | local and Max auto-decisions: <n>`
- Produces: `plan format paragraph on auto-decided Decisions and Decider lines`

**Steps**

1. In `plugins/orcastrat/reference/plan-format.md`, directly below the line that starts `- **validator** (agent),`, insert this line:

   ```text
   - **decider** (agent), which recommends an answer to each GAP during a run and labels it `local` or `stop`,
   ```

2. Replace ``, and instruction suggestions (instruction-suggestions.md)`` with ``, instruction suggestions (instruction-suggestions.md), and the decider's recommendations (decisions/<question-id>.md)``.
3. Directly below the line that starts `| Instructions max lines |`, insert these two lines:

   ```text
   | Auto-decide | Optional: `off` (the default, also when the field is missing) or `local`. During a run, the `decider` agent recommends an answer to every GAP, from a worker or the planner, and labels it `local` or `stop`. With `local`, `run` records a `local` recommendation as a Decision and continues; any other answer stops the run as a GAP, with the recommendation and label in the stop report, as `off` always does. The flag `--auto-decide` sets `local` for one run. `plan` never uses the decider: planning questions are always answered by the user. |
   | Max auto-decisions | Optional: `5` (the default, also when the field is missing) or `<n>`. Once `run` has recorded that many auto-decided Decisions in one run invocation, it pauses with reason `LIMIT`. It applies only while Auto-decide is `local`, and it has no flag. |
   ```

4. Directly above the line `#### Assumptions`, insert this paragraph:

   ```text
   During a run, each question of a GAP gets an ID, `<task ID>-q<n>` for a worker's and `<milestone ID>-q<n>` for the planner's, and the `decider` writes its reasoning for it to `notes/decisions/<question-id>.md`. A question `run` auto-decides becomes the Decision `- D<nn> [<milestone ID>]: <RECOMMENDATION> (→ <plan dir>/notes/decisions/<question-id>.md; source: auto-decided (<question-id>))`, whose milestone is its scope. A question it doesn't auto-decide stays in Open questions, as `- (<task or milestone ID>) <question>`, with the line `  Decider: <RECOMMENDATION> — <REASON> (<LABEL>; <plan dir>/notes/decisions/<question-id>.md)` below its own lines.
   ```

5. Run Verify.

**Done when**

- The Verify command exits 0.
- Nothing else in the file changed.

### M12-T04: State that plan never uses the decider

- Kind: change
- Tier: worker
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/skills/plan/SKILL.md`
- Verify: `f=plugins/orcastrat/skills/plan/SKILL.md && grep -qF '**Planning questions are always answered by the user.**' "$f" && grep -qF 'never auto-decides a question and never uses the' "$f" && ! grep -qF '$(' "$f"`
- Fails first: no (skill text with no test of its own; the Verify greps fail until the edit is made)
- Commit: `docs(orcastrat): plan states that planning questions always go to the user`

**Objective**

The `plan` skill says that planning questions are always answered by the user, and that `plan` never auto-decides a question or uses the `decider` (spec §13, "Planning questions are always answered by the user"; §32 item 17).

**Read first**

- `docs/orcastrat-execution-spec.md` §13, its last two paragraphs
- `plugins/orcastrat/skills/plan/SKILL.md` section `## 5. Find every problem and ask about it`

**Interfaces**

- Consumes: none
- Produces: `plan skill statement: planning questions are always answered by the user`

**Steps**

1. In `plugins/orcastrat/skills/plan/SKILL.md`, directly above the line that starts ``For outlined milestones in a `rolling` plan,``, insert this paragraph:

   ```text
   **Planning questions are always answered by the user.** `plan` never auto-decides a question and never uses the `decider` agent, whatever a plan's `Auto-decide` field says and even under `--yes`: the decider and auto-decide exist only for GAPs during `/orcastrat:run`. Present every question and wait for the answers, as above.
   ```

2. Run Verify.

**Done when**

- The Verify command exits 0.
- The new paragraph sits between the paragraph starting `Never resolve a contradiction` and the one starting `For outlined milestones`, with one empty line on each side.
- Nothing else in the file changed.

### M12-T05: run takes --auto-decide and the auto-decision limit

- Kind: change
- Tier: worker
- Status: todo
- Wave: 2
- Depends on: none
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats && f=plugins/orcastrat/skills/run/SKILL.md && grep -qF '[--max-parallel 4] [--auto-decide] [--yes]' "$f" && grep -qF 'set Auto-decide to' "$f" && grep -qF -- '- **Auto-decide**:' "$f" && grep -qF -- '- **Auto-decision count**:' "$f" && grep -qF 'is at least Max auto-decisions, go to **Pause**' "$f" && grep -qF 'The auto-decision limit is Max auto-decisions' "$f" && grep -qF 'the run time, task, milestone or auto-decision limit' "$f"`
- Fails first: no (skill text with no test of its own; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run takes --auto-decide and the auto-decision limit`

**Objective**

`run` accepts `--auto-decide`, reads `Auto-decide` and `Max auto-decisions` from the plan header, counts this invocation's auto-decisions from the run log, and pauses with `LIMIT` when the count reaches the limit (spec §13; D218, D221, D223, D229).

**Read first**

- plan.md Decisions D218, D221, D223 and D229
- `plugins/orcastrat/skills/run/SKILL.md` lines 1–19 (frontmatter and Arguments)
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions`, the bullets starting `- **Limits**:` and `- **Check the limits**:`
- `plugins/orcastrat/skills/run/SKILL.md` section `## Pause`

**Interfaces**

- Consumes: `start <UTC> <plan-dir>` (existing, `plugins/orcastrat/scripts/run-state:90`)
- Consumes: `auto-decided <UTC> <question-id> D<nn>` (existing, `plugins/orcastrat/scripts/run-report:544`)
- Produces: `--auto-decide`
- Produces: `**Auto-decide**, **Max auto-decisions** and **Auto-decision count** in plugins/orcastrat/skills/run/SKILL.md Definitions`
- Produces: `the auto-decision limit in **Check the limits**`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, replace `[--max-parallel 4] [--yes]"` with `[--max-parallel 4] [--auto-decide] [--yes]"`.
2. Directly below the line that starts ``- `--max-parallel <N>`:``, insert this line:

   ```text
   - `--auto-decide`: set Auto-decide to `local` for this run, whatever the plan's `Auto-decide` header field says, so that the decider's `local` recommendations are recorded as Decisions and the run continues (see **Auto-decide**). It takes no value. `Max auto-decisions` has no flag.
   ```

3. In the bullet that starts `- **Limits**:`, replace ``and `<n>h` is n × 60 minutes.`` with ``and `<n>h` is n × 60 minutes. The auto-decision limit is Max auto-decisions (see **Auto-decide**), in effect only while Auto-decide is `local`.``
4. In the bullet that starts `- **Check the limits**:`, replace `Check them before each new serial task (3d) and before each parallel batch (3e).` with ``If the auto-decision limit is in effect and the **auto-decision count** (see below) is at least Max auto-decisions, go to **Pause** with reason `LIMIT`, saying in its report that the auto-decision limit was reached. Check them before each new serial task (3d), before each parallel batch (3e), and before invoking the planner again once all of its questions were auto-decided (3a item 4).``
5. Directly below the line that starts `- **Check the limits**:`, insert these two lines:

   ```text
   - **Auto-decide**: `local` when `--auto-decide` was given, or when the plan header's `Auto-decide` field says `local`; otherwise `off`, which is also its value when the field is missing. **Max auto-decisions** is the plan header's `Max auto-decisions` field, or 5 when that field is missing.
   - **Auto-decision count**: how many questions this run invocation has auto-decided. Grep `<plan dir>/notes/run-log.md` for `^(start|auto-decided) ` with line numbers, output mode content, and count the lines starting `auto-decided` below the last line starting `start`; with no such line, it is 0. Never keep the count in memory: each auto-decided question's `auto-decided` line goes into the run log in the same commit as its Decision, so the file always holds it.
   ```

6. In section `## Pause`, replace `(the run time, task or milestone limit; see Definitions)` with `(the run time, task, milestone or auto-decision limit; see Definitions)`.
7. Run Verify.

**Done when**

- The Verify command exits 0.
- The two new Definitions bullets come directly after **Check the limits**, and `## Start checks` still follows them after one empty line.
- Nothing else in the file changed.

### M12-T06: run decides GAP questions and records auto-decided ones

- Kind: change
- Tier: worker
- Status: todo
- Wave: 3
- Depends on: M12-T01, M12-T05
- Files: `plugins/orcastrat/skills/run/SKILL.md`, `tests/orcastrat/skill-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats && f=plugins/orcastrat/skills/run/SKILL.md && grep -qF -- '- **Decide GAP questions**:' "$f" && grep -qF -- '- **Record an auto-decided question**' "$f" && grep -qF 'source: auto-decided (<question-id>))' "$f" && grep -qF 'auto-decided <UTC> <question-id> D<nn>' "$f"`
- Fails first: yes
- Commit: `feat(orcastrat): run decides GAP questions and records auto-decided ones`

**Objective**

`run`'s Definitions say how to send each GAP question to the `decider`, which replies count as auto-decided, how a question that isn't gets its `Decider:` line, and how an auto-decided one becomes a Decision, a run-log line and a commit (spec §13; D216–D218, D223, D225, D227, D229).

**Read first**

- `docs/orcastrat-execution-spec.md` §13
- plan.md Decisions D216, D217, D218, D223, D225, D227 and D229
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions`, the bullets starting `- **Validate a review**` (pattern: a numbered Definition with a dispatch block) and `- **Auto-decision count**:`
- `tests/orcastrat/skill-files.bats` (whole file)

**Interfaces**

- Consumes: `orcastrat:decider input: Plan: <plan dir>, Question ID: <question-id>, From: <task ID or milestone ID>, Question: <the question>, Brief: <the task's brief path> (a worker's GAP only), Output: <plan dir>/notes/decisions/<question-id>.md` (M12-T01)
- Consumes: `orcastrat:decider reply: RECOMMENDATION: <the decision in one line, worded to stand alone as a plan.md Decision> | no recommendation, REASON: <one line>, LABEL: local | stop, OUTPUT: <the Output path>` (M12-T01)
- Consumes: `**Auto-decide**, **Max auto-decisions** and **Auto-decision count** in plugins/orcastrat/skills/run/SKILL.md Definitions` (M12-T05)
- Consumes: `has_stripped_line <file> <text>` (existing, `tests/orcastrat/skill-files.bats:21`)
- Produces: `**Decide GAP questions** and **Record an auto-decided question** in plugins/orcastrat/skills/run/SKILL.md Definitions`
- Produces: `auto-decided <UTC> <question-id> D<nn>`
- Produces: `- D<nn> [<milestone ID>]: <RECOMMENDATION> (→ <plan dir>/notes/decisions/<question-id>.md; source: auto-decided (<question-id>))`
- Produces: `  Decider: <RECOMMENDATION> — <REASON> (<LABEL>; <plan dir>/notes/decisions/<question-id>.md)`
- Produces: `chore(plan): <From> auto-decided <question-id>`

**Steps**

1. At the end of `tests/orcastrat/skill-files.bats`, after one empty line, add these two tests:

   ```bash
   @test "run takes a decider reply without a recommendation as no recommendation" {
     local f="$SKILLS/run/SKILL.md"
     has_stripped_line "$f" 'Question ID: <question-id>'
     has_stripped_line "$f" 'From: <From>'
     has_stripped_line "$f" 'Output: <plan dir>/notes/decisions/<question-id>.md'
     grep -qF 'or its reply has no `RECOMMENDATION:` line (for example, it hit its turn limit), its recommendation is `no recommendation`, and nothing is applied.' "$f"
   }

   @test "run records no auto-decision past the limit" {
     local f="$SKILLS/run/SKILL.md"
     grep -qF 'and the **auto-decision count** is below Max auto-decisions.' "$f"
     grep -qF 'and a `local` recommendation that comes up once the count has reached Max auto-decisions: each of them stops the run as a GAP' "$f"
   }
   ```

2. Run Verify and confirm it fails.
3. In `plugins/orcastrat/skills/run/SKILL.md`, directly below the line that starts `- **Auto-decision count**:`, insert these lines:

   ````text
   - **Decide GAP questions**: the decider recommends an answer to each question a worker's or the planner's GAP raised, before the run stops on it. The **From** of a question is the task ID for a worker's GAP, and the milestone ID for the planner's. Only a block with reason GAP goes to the decider, never VACUOUS: fixing that means revising the task, which the decider never does.
     1. Give each question its question ID, `<From>-q<n>`: with the Glob tool, count the files matching `<plan dir>/notes/decisions/<From>-q*.md`. The first question from that From gets `<n>` = 1 plus that count, and each further question from the same From, in the order given, the next number.
     2. Invoke the agent `orcastrat:decider` once for each question, all in a single message, so they run concurrently. Each gets exactly:
        ```
        Plan: <plan dir>
        Question ID: <question-id>
        From: <From>
        Question: <the question>
        Output: <plan dir>/notes/decisions/<question-id>.md
        ```
        plus, for a worker's GAP only, the line `Brief: <the task's brief path>`, directly below the `Question:` line, naming the brief its worker was dispatched with.
     3. Read each reply's `RECOMMENDATION:`, `REASON:` and `LABEL:` lines, and nothing else: the reasoning is in its output file, for the user. When a call returns an error, or its reply has no `RECOMMENDATION:` line (for example, it hit its turn limit), its recommendation is `no recommendation`, and nothing is applied. A `REASON:` or `LABEL:` line the reply lacks is `none`.
     4. Take the questions in the order given. A question is **auto-decided** when all of these hold at the moment you reach it: 2c item 6 has written this run's marker; Auto-decide is `local` (see **Auto-decide**); its recommendation isn't `no recommendation`; its label is `local`; and the **auto-decision count** is below Max auto-decisions. The place that decides the questions says what to do with each auto-decided one, including when to **record an auto-decided question**.
     5. A question that isn't auto-decided gets its **Decider line** in plan.md's Open questions, directly below the question's own lines: `  Decider: <RECOMMENDATION> — <REASON> (<LABEL>; <plan dir>/notes/decisions/<question-id>.md)`, with its reply's three values. That covers a `stop` label, `no recommendation`, Auto-decide `off`, a GAP before 2c item 6, and a `local` recommendation that comes up once the count has reached Max auto-decisions: each of them stops the run as a GAP, and the **Stop** report quotes each question with its Decider line.
   - **Record an auto-decided question**, given its question ID and its From:
     1. Find its Decision number `<nn>`: Grep plan.md for `^- D[0-9]+`, with only the matching part as output, and take one more than the highest number it prints, written with at least two digits.
     2. Grep plan.md for `^## ` with line numbers, and Read only the few lines just above the heading that follows `## Decisions`. Add this line directly below the last Decision line there, as the last line of the `## Decisions` section: `- D<nn> [<milestone ID>]: <RECOMMENDATION> (→ <plan dir>/notes/decisions/<question-id>.md; source: auto-decided (<question-id>))`. `<milestone ID>` is the From of a planner's question, and the `M<nn>` part of the task ID for a worker's. The milestone is the Decision's scope: a `local` label means the decision is confined to one milestone's implementation.
     3. For a planner's question, remove its lines from plan.md's Open questions: the line starting `- (<From>) ` that holds the question, and the indented lines below it. If no question is left in the section, it holds the single line `None.`.
     4. Append the line `auto-decided <UTC> <question-id> D<nn>` to `<plan dir>/notes/run-log.md`, with the current UTC time from `date -u +%Y-%m-%dT%H:%M:%SZ`.
     5. Commit: `git add -A`, then `git commit -m "chore(plan): <From> auto-decided <question-id>"`, with no `Orcastrat-Task:` trailer. The commit carries the Decision, the decider's output file and the `auto-decided` line together, so the **auto-decision count** always sees it.
   ````

4. Run Verify and confirm all 8 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats` reports 8 tests and no failure, and the Verify greps pass.
- The two new Definitions bullets come directly after **Auto-decision count**.
- Nothing else in either file changed.

### M12-T07: run sends a worker's GAP to the decider

- Kind: change
- Tier: worker
- Status: todo
- Wave: 4
- Depends on: M12-T06
- Files: `plugins/orcastrat/skills/run/SKILL.md`, `tests/orcastrat/skill-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats && f=plugins/orcastrat/skills/run/SKILL.md && grep -qF 'with its **Decider line** below it' "$f" && grep -qF 'git update-ref refs/orcastrat/discarded/<task ID>-<n> <sha>' "$f" && grep -qF 'so a retry keeps attempt number' "$f"`
- Fails first: yes
- Commit: `feat(orcastrat): run sends a worker's GAP to the decider`

**Objective**

`run`'s **Block with GAP** section discards a serial worker's GAP attempt, has the decider answer its question, and either records an auto-decided answer and leaves the task `todo` for a retry at the same tier, or blocks the task with the question and its `Decider:` line; a parallel task's GAP gets the same outcome through 3e; a VACUOUS block never goes to the decider (spec §13; D216, D219, D224, D225).

**Read first**

- `docs/orcastrat-execution-spec.md` §13, the bullet on `Auto-decide: local`
- plan.md Decisions D85, D216, D219, D224 and D225
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions`, the bullets starting `- **Discard an attempt**`, `- **Keep a blocked attempt**`, `- **Decide GAP questions**` and `- **Record an auto-decided question**`
- `plugins/orcastrat/skills/run/SKILL.md` section `## Block with GAP`

**Interfaces**

- Consumes: `**Decide GAP questions** and **Record an auto-decided question** in plugins/orcastrat/skills/run/SKILL.md Definitions` (M12-T06)
- Consumes: `  Decider: <RECOMMENDATION> — <REASON> (<LABEL>; <plan dir>/notes/decisions/<question-id>.md)` (M12-T06)
- Consumes: `has_stripped_line <file> <text>` (existing, `tests/orcastrat/skill-files.bats:21`)
- Produces: `**Block with GAP** in plugins/orcastrat/skills/run/SKILL.md, deciding a worker's GAP`

**Steps**

1. At the end of `tests/orcastrat/skill-files.bats`, after one empty line, add this test:

   ```bash
   @test "run never sends a VACUOUS block to the decider" {
     local f="$SKILLS/run/SKILL.md"
     grep -qF 'Never retry or escalate it, and never send it to the decider:' "$f"
     run grep -qF 'gets the same handling, with block reason `VACUOUS` instead of `GAP`' "$f"
     [ "$status" -ne 0 ]
   }
   ```

2. Run Verify and confirm it fails.
3. In `plugins/orcastrat/skills/run/SKILL.md`, section `## Block with GAP`, replace the line that starts `The plan left a decision open.`, the empty line below it, and the line that starts ``A `RED: PASSED-EARLY` report on a task``, which are everything between the empty line below the heading `## Block with GAP` and the empty line above `## Pause`, with these lines:

   ```text
   The plan left a decision open. **Never retry or escalate a GAP**: a higher tier would just make the decision. The decider recommends an answer first (see **Decide GAP questions**), and only an auto-decided answer, recorded as a Decision, lets the task run again, at the same tier. The question is the worker's NOTE.

   In serial mode:

   1. Run `git rev-parse HEAD` and note the sha it prints. Find the attempt number `<n>` (see Definitions), then **discard the attempt** (see Definitions). The held report goes back as `<task ID>-attempt<n>.md`, and the failure log gets no new entry, so a retry keeps attempt number `<n>`. The tree is clean before the decider runs, so no `git clean -fd` can remove its output file.
   2. **Decide GAP questions** (see Definitions) for the question, with the task ID as its From.
   3. If it is auto-decided, **record an auto-decided question** (see Definitions). The task stays `todo`, with no `- Escalated:` line and no failure-log entry: this isn't a failed attempt. Go on with whatever comes after the task, the wave set's next task in 3d or the next task in 3e item 11: the wave loop retries it through the next **next**, at the same tier, with a fresh brief that holds the new Decision.
   4. Otherwise, run `git update-ref refs/orcastrat/discarded/<task ID>-<n> <sha>`, with the sha from item 1, and mark the task `blocked` with `- Blocked: GAP — <question>; discarded attempt <sha>, kept at refs/orcastrat/discarded/<task ID>-<n>`. Add the question to plan.md's Open questions as the line `- (<task ID>) <question>`, with its **Decider line** below it. Then go to **Stop**.

   In parallel mode, 3e item 4 records the task for a block, 3e item 11 decides its question once the wave's integrated tasks are recorded, and the wave loop retries an auto-decided task. For a task whose question isn't auto-decided, 3e item 12 writes the block once the wave's other tasks are integrated and settled: add the question to plan.md's Open questions as the line `- (<task ID>) <question>`, with its **Decider line** below it, and mark the task `blocked` with `- Blocked: GAP — <question>; discarded attempt <sha>, kept at refs/orcastrat/discarded/<task ID>-<n>`, with the sha and `<n>` 3e noted when it removed the task's worktree. Then **Stop**.

   A `RED: PASSED-EARLY` report on a task with `- Fails first: yes` is a block with reason `VACUOUS`: the test passed before any implementation existed, so either it can't fail or the behavior already exists, and both mean the plan is wrong. Never retry or escalate it, and never send it to the decider: fixing it means revising the task, which the decider never does. Its detail is the worker's NOTE, and its Open question is `Verify passed before implementation: <worker's NOTE>`, tagged with the task ID. In serial mode, **keep the blocked attempt** (see Definitions) with reason `VACUOUS`, then add the Open question to plan.md, then go to **Stop**. In parallel mode, 3e item 12 adds the Open question to plan.md and marks the task `blocked` with `- Blocked: VACUOUS — <worker's NOTE>; discarded attempt <sha>, kept at refs/orcastrat/discarded/<task ID>-<n>`, as for a GAP. Then **Stop**.
   ```

4. Run Verify and confirm all 9 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats` reports 9 tests and no failure, and the Verify greps pass.
- `## Block with GAP` holds exactly the new text, followed by one empty line and `## Pause`.
- Nothing else in either file changed.

### M12-T08: run decides a parallel wave's GAPs

- Kind: change
- Tier: worker
- Status: todo
- Wave: 5
- Depends on: M12-T06, M12-T07
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats && f=plugins/orcastrat/skills/run/SKILL.md && grep -qF '**GAPs, escalations and merge failures.**' "$f" && grep -qF 'git update-ref -d refs/orcastrat/discarded/<task ID>-<n>' "$f" && grep -qF 'NOTE as its question.' "$f" && grep -qF "Decide the wave's GAPs, as item 11" "$f"`
- Fails first: no (skill text with no test of its own; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run decides a parallel wave's GAPs`

**Objective**

In a parallel wave, `run` sends the questions of the wave's GAP tasks to the decider once the integrated tasks are recorded, and for each auto-decided task writes back its held files, deletes its branch and kept ref, records the Decision and leaves the task `todo` for a retry, also on the re-verify's Stop path (spec §13; D224).

**Read first**

- plan.md Decisions D163, D174 and D224
- `plugins/orcastrat/skills/run/SKILL.md` section `### 3e. Parallel wave`: item 4, the paragraph after item 6 on removing worktrees, and items 9 to 12
- `plugins/orcastrat/skills/run/SKILL.md` section `## Block with GAP`, the paragraph starting `In parallel mode,`

**Interfaces**

- Consumes: `**Decide GAP questions** and **Record an auto-decided question** in plugins/orcastrat/skills/run/SKILL.md Definitions` (M12-T06)
- Consumes: `**Block with GAP** in plugins/orcastrat/skills/run/SKILL.md, deciding a worker's GAP` (M12-T07)
- Produces: `3e item 11's first paragraph: deciding the wave's GAPs`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `### 3e. Parallel wave`, item 4, replace the line ``   - Any other `BLOCKED` / `GAP` → record the task for **Block with GAP**.`` with the line ``   - Any other `BLOCKED` / `GAP` → record the task for **Block with GAP**, with the worker's NOTE as its question.``
2. In item 9, directly below the line that starts `   - For each integrated task whose Verify command failed,`, insert this line:

   ```text
      - Decide the wave's GAPs, as item 11's first paragraph says. An auto-decided task stays `todo`, and the next run retries it.
   ```

3. Replace the line `11. **Escalations and merge failures**, in task ID order:` with this line:

   ```text
   11. **GAPs, escalations and merge failures.** First, if any task of the wave is recorded for **Block with GAP** with reason `GAP`, decide the wave's GAPs: **decide GAP questions** (see Definitions) for those tasks' questions, each with its task ID as its From. Then, in task ID order, for each task whose question is auto-decided: write back its held report file, failure log and review files: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" restore "<plan dir>" <task ID> "<MAIN>" "<report file>" "<plan dir>/notes/reports/<task ID>-attempt<n>.md" "<failure log>" "<failure log>" "<review file>" "<review file>" ...`, with the attempt number `<n>` noted when its worktree was removed; delete its branch, `git branch -D <task branch>`, and its kept attempt, `git update-ref -d refs/orcastrat/discarded/<task ID>-<n>`; then **record an auto-decided question** (see Definitions). That task is no longer recorded for a block: it stays `todo`, and the wave loop retries it at the same tier through the next **next**. A task whose question isn't auto-decided stays recorded for **Block with GAP**, and item 12 writes its block. Then, in task ID order:
   ```

4. Run Verify.

**Done when**

- The Verify command exits 0.
- The new item 9 bullet sits directly above the bullet starting `   - Write the wave's blocks (item 12)`, and item 11's existing bullets follow its new first line unchanged.
- Nothing else in the file changed.

### M12-T09: run sends the planner's GAP to the decider

- Kind: change
- Tier: worker
- Status: todo
- Wave: 6
- Depends on: M12-T05, M12-T06
- Files: `plugins/orcastrat/skills/run/SKILL.md`, `tests/orcastrat/skill-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats && f=plugins/orcastrat/skills/run/SKILL.md && grep -qF 'with the milestone ID as their From' "$f" && grep -qF 'Milestones table back to' "$f" && grep -qF 'For a GAP, quote each question exactly' "$f"`
- Fails first: yes
- Commit: `feat(orcastrat): run sends the planner's GAP to the decider`

**Objective**

When the planner reports a GAP, `run` has the decider answer each of its questions, records the auto-decided ones, and invokes the planner again only when none is left, otherwise stopping with the rest; a fix-pass GAP resets the milestone's table row with its outline; and the Stop report quotes each GAP question with its `Decider:` line (spec §13; D220, D222, D223, D225, D228).

**Read first**

- plan.md Decisions D220, D222, D223, D225 and D228
- `plugins/orcastrat/skills/run/SKILL.md` section `### 3a. Detail it if it's an outline`, items 2 to 5
- `plugins/orcastrat/skills/run/SKILL.md` section `### 3f. Finish the milestone`, item 4
- `plugins/orcastrat/skills/run/SKILL.md` section `## Stop`, item 3

**Interfaces**

- Consumes: `**Decide GAP questions** and **Record an auto-decided question** in plugins/orcastrat/skills/run/SKILL.md Definitions` (M12-T06)
- Consumes: `the auto-decision limit in **Check the limits**` (M12-T05)
- Produces: `3a item 4: deciding the planner's GAP questions`

**Steps**

1. At the end of `tests/orcastrat/skill-files.bats`, after one empty line, add this test:

   ```bash
   @test "run stops with the planner questions the decider left open" {
     local f="$SKILLS/run/SKILL.md"
     grep -qF 'If none of this GAP'"'"'s questions is left in Open questions, every one was auto-decided' "$f"
     grep -qF 'Otherwise, set the milestone and plan to `blocked` and go to **Stop**, telling the user how many questions are waiting and where.' "$f"
   }
   ```

2. Run Verify and confirm it fails.
3. In `plugins/orcastrat/skills/run/SKILL.md`, section `### 3a. Detail it if it's an outline`, replace the whole line that starts ``4. If it reports `BLOCKED` / `GAP`: it has written its questions`` with these lines:

   ```text
   4. If it reports `BLOCKED` / `GAP`: it has written its questions (insufficient information, ambiguity, or contradiction) to plan.md's Open questions, each a line starting `- (<ID>) ` with its indented lines below it. **Decide GAP questions** (see Definitions) for them, with the milestone ID as their From: Grep plan.md for `^- \(<ID>\) `, output mode content, and take each matching line, in order, without its `- (<ID>) ` prefix, as a question. Then, in the same order, **record an auto-decided question** (see Definitions) for each one that is auto-decided.
      - If none of this GAP's questions is left in Open questions, every one was auto-decided (Grep for `^- \(<ID>\) ` finds no line): **check the limits** (see Definitions), then invoke the planner again with exactly the lines of the call that reported the GAP, item 2's two lines or 3f item 4's three, and handle its report as that call's report is handled. A GAP from item 5's fix pass is the exception: item 5 has restored the milestone's outline, so go back to item 2 instead.
      - Otherwise, set the milestone and plan to `blocked` and go to **Stop**, telling the user how many questions are waiting and where.
   ```

4. In item 5, replace the whole line that starts ``   - `BLOCKED` / `GAP`: discard the detailed milestone file`` with this line:

   ```text
      - `BLOCKED` / `GAP`: discard the detailed milestone file, restoring its committed outline: `git checkout -- "<milestone file path>"`. Set the milestone's Status in plan.md's Milestones table back to `outline`, so that the table and the file agree. Then handle it as in item 4, which goes back to item 2 once every question is auto-decided. The plan-review report stays, and the next commit carries it.
   ```

5. In section `## Stop`, item 3, replace `For a GAP or VACUOUS, quote the question exactly.` with ``For a GAP, quote each question exactly, with its `Decider:` line below it. For VACUOUS, quote the question exactly.``
6. Run Verify and confirm all 10 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats` reports 10 tests and no failure, and the Verify greps pass.
- 3a item 4 has its two sub-bullets, item 5's GAP bullet resets the table row, and 3f item 4's line `` - `BLOCKED` / `GAP`: handle it as in 3a item 4.`` is unchanged.
- Nothing else in either file changed.
