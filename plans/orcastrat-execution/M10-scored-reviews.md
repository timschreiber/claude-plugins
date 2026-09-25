# M10: Scored reviews and the validator (Change 10)

- Status: in-progress
- Format: 2
- Goal: `reviewer`, `milestone-reviewer` and `plan-reviewer` score every finding on the anchored rubric and tag it with a category. Only findings at 80 or above, with a citation and in a blocking category, become blocking candidates. A new `validator` agent scores each candidate independently, without seeing the reviewer's score. Only candidates the validator also scores at 80 or above have any effect, in `run` and in `plan`. Everything else is recorded as advisory. The rubric is defined once and copied verbatim into every scoring agent, with a bats drift test.
- Depends on: M09
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §11 (Change 10), §22 items 2 and 3 (`validator`), §32 items 14, 58, 59, 68 and 70; Decisions D12, D13, D21, D48, D66, D68, D73, D76, D178, D179, D181–D184 and D198–D203.

- D62: no task in this milestone is `worker-light`; `worker` is the floor.
- Tier adjustment: test-first bats tasks → worker (worker-light escalated 2 times in M02)
- D48, D66: the new `validator` gets the `## Search and command bounds` and `## No prototyping or duplicate work` sections, and its `tools` line names no `Agent`, `Task`, `Skill` or `Artifact`; `tests/orcastrat/agent-files.bats` checks all three.
- The scoring agents are `reviewer`, `milestone-reviewer`, `plan-reviewer` and `validator`. Each carries **the rubric block** below, verbatim, directly above its `## Report` heading (D21, D202), and **the Reading budget section** below directly above its `## Before anything else` heading (D76, D200).
- Scored findings (D182): `- [<score>] <category>: <path:line> — <problem> (<task ID, Coverage row, or D<nn>>)` for `reviewer` and `milestone-reviewer`, `1. [<score>] <category>: <task or milestone ID> — <which check> — <problem, quoting the text involved>` for `plan-reviewer`. Blocking candidates go under `## Blocking` (`## Issues` for `plan-reviewer`), every other finding under `## Advisory`. Category tags follow D198.
- The per-task reviewer's report file is `<plan dir>/notes/reviews/<task ID>-attempt<n>.md` (D181). `run` handles it like a worker's report file (D199).
- plan.md's `## Out of scope` section arrives in M13, and the Context's `Conventions:` block in M14. The agent text in this milestone names both already, as conditions.
- `plugins/orcastrat/README.md` and `CHANGELOG.md` are M15's (D179): no task here edits them.
- The run executing this plan is the installed, pre-rename plugin (D37). Editing the repository's skills and agents changes nothing in that run. No task runs `run` or `plan`, installs the plugin or starts Claude Code, and no test runs Claude Code.
- The bats files run slowly on Windows. Give a Verify command that runs bats a Bash timeout of 600000 ms. On this machine git prints `LF will be replaced by CRLF` warnings while tests build fixtures; they are expected.
- Every block a Step gives in a fence is its literal final content: the fenced block in that Step, with the three-space list indentation removed from each line. The two blocks below are literal the same way, with no indentation to remove. Blank lines stay empty. Copy a block exactly; don't reformat, reorder or "improve" it. A block fenced with four backticks may hold three-backtick fences of its own: they are part of the content.
- **Replacing text.** "Replace A with B" means: find A, which occurs exactly once in the file unless the Step gives another count (as a whole line, or as the part of a line quoted), and put B in its place, changing nothing around it. If A isn't found that many times, stop and report `BLOCKED` / `GAP` quoting A.
- **Inserting lines.** "Directly below the line L, insert X" means: put X on its own lines right after L, with no empty line between them. "Directly above the line L, insert X" means: put X right before L, followed by one empty line, so that L keeps an empty line above it.
- Skill and reference text contains no `$(`: `tests/orcastrat/skill-files.bats` checks it.

**The rubric block:**

```text
<!-- rubric:start -->
## Scoring rubric

Score each finding from 0 to 100 against these anchors:

- **0:** a false positive. It doesn't survive a close look, or the problem existed before this work.
- **25:** possibly real, but unverified. For a style point, one no instruction file calls for.
- **50:** verified as real, but minor, rare in practice, or unimportant relative to the rest of the change.
- **75:** verified and likely to be hit in practice; it affects behavior, or it breaks a rule an instruction file states explicitly.
- **100:** certain. The evidence directly confirms it, and it will be hit.
<!-- rubric:end -->
```

**The Reading budget section**, whose last bullet is `- Keep your reply to the status block. Everything else goes in your report file.` in the three reviewers and `- Keep your reply to the status block.` in `validator`:

```text
## Reading budget

- Read each file once.
- Read the milestone file, the brief, or the diff whole, and everything else only in part.
- Read only the Decisions and spec sections the work cites: Grep for `^- D<nn>:` and for the headings named, then read just those line ranges.
- Check `path:line` citations and literal replacement targets with Grep on the quoted text, not by reading the whole file.
- Don't read survey notes, and read the plan format only at `${CLAUDE_PLUGIN_ROOT}/reference/plan-format.md`, never a copy of it in the repository.
- <the last bullet>
```

Waves: 6 (widths 3, 1, 1, 2, 2, 1)

## Coverage

- `docs/orcastrat-execution-spec.md` preamble: fewer wasted attempts and fix rounds from false-positive findings, and less reading in reviews → M10-T05, M10-T06, M10-T08, M10-T09, M10-T10
- `docs/orcastrat-execution-spec.md` §1.1: known mechanisms only: agent files, parallel Agent calls in one message, and git → M10-T01, M10-T07, M10-T09
- `docs/orcastrat-execution-spec.md` §1.2: the plan format names the `validator` and the per-task review files, and every reader of review reports (`run`, `plan`) handles scored findings → M10-T02, M10-T07, M10-T09, M10-T10
- `docs/orcastrat-execution-spec.md` §1.4: the new and changed agent descriptions are valid YAML, quoted → M10-T01, M10-T06
- `docs/orcastrat-execution-spec.md` §11 Rubric: one rubric in the spec's five anchors, defined once in `reference/review-rubric.md` and copied verbatim into the four scoring agents, with a drift test (D21, D202) → M10-T01, M10-T04
- `docs/orcastrat-execution-spec.md` §11 Reviewers: every finding is scored on the rubric and tagged with a category (D182, D198) → M10-T05, M10-T06, M10-T08
- `docs/orcastrat-execution-spec.md` §11: a work reviewer's blocking candidate scores 80 or higher, cites `path:line`, and is in a work-review blocking category, `contradicts-decision` included (D184) → M10-T06, M10-T08
- `docs/orcastrat-execution-spec.md` §11: a plan-reviewer's blocking candidate scores 80 or higher, cites the plan section, and is in one of D183's categories → M10-T05
- `docs/orcastrat-execution-spec.md` §11: everything else is advisory, recorded with its score and category in the review's notes file; the per-task reviewer writes a report file, which `run` keeps and commits (D181, D199) → M10-T03, M10-T05, M10-T06, M10-T08
- `docs/orcastrat-execution-spec.md` §11: reviewer inputs are the diff or detailed milestone plus the criteria, never worker transcripts → M10-T06, M10-T08
- `docs/orcastrat-execution-spec.md` §11 Reading budget: in `reviewer`, `milestone-reviewer`, `plan-reviewer` and `validator`, and `agent-files.bats` fails when one lacks it (D76, D200) → M10-T01, M10-T05, M10-T06, M10-T08
- `docs/orcastrat-execution-spec.md` §11 Independent validation: `validator` is Sonnet, medium effort, read-only, `maxTurns: 20` → M10-T01
- `docs/orcastrat-execution-spec.md` §11: `run` dispatches one `validator` per blocking candidate, in parallel, for task, milestone and plan reviews; `plan` does the same for plan-reviewer findings → M10-T07, M10-T09, M10-T10
- `docs/orcastrat-execution-spec.md` §11: the validator gets the finding, the reviewer's inputs and the paths of the instruction files it cites, never the reviewer's score (D182, D201) → M10-T01, M10-T07, M10-T09
- `docs/orcastrat-execution-spec.md` §11: the validator scores on the same rubric, confirms that a cited instruction file states the rule, and replies with its score and a one-line reason in at most 5 lines → M10-T01
- `docs/orcastrat-execution-spec.md` §11: a finding blocks only if the validator also scores it 80 or higher; otherwise it moves to advisory with both scores, and one with no score is downgraded too (D178) → M10-T07, M10-T09
- `docs/orcastrat-execution-spec.md` §11: only validated findings trigger a fix round, a reviewer FAIL or plan-review handling; the reviewer's FAIL is final only after validation, and with no surviving candidate the task passes (D203) → M10-T07, M10-T09, M10-T10
- `docs/orcastrat-execution-spec.md` §22 item 2: the `validator` has the search and command bounds section, and the rubric and each reviewer's findings format live in agent files → M10-T01, M10-T04, M10-T05, M10-T06, M10-T08
- `docs/orcastrat-execution-spec.md` §22 item 3: the `validator`'s allowlist is `Read, Glob, Grep, Bash`, it uses the shell for short read-only commands only, writes nothing, and has the no-prototyping section (D68) → M10-T01
- `docs/orcastrat-execution-spec.md` §29 item 8: Change 10 is built serially, before the run report and suggestions (M11) → M10-T01, M10-T04, M10-T09, M10-T10
- `docs/orcastrat-execution-spec.md` §31: the kebab-case name `validator` and valid frontmatter → M10-T01
- `docs/orcastrat-execution-spec.md` §32 items 14, 58, 59, 68 and 70: blocking only at 80 on the rubric after validation, the rubric in Orcastrat's wording in every scoring agent, a Sonnet/medium validator that never sees the reviewer's score, read-only shell use, and the reading budget → M10-T01, M10-T04, M10-T05, M10-T06, M10-T08, M10-T09

## Review Focus

- A scoring agent's rubric copy that differs from the canonical text by one character → the drift test fails (source: D21). Test: `a copy that differs by one character is caught` in M10-T04.
- A `run` validator dispatch → carries the finding without its list marker and leading `[<score>] `, and the reviewer's lines without `Output:`, so the validator never sees the reviewer's score (source: spec §11; D182; D201). Test: `run's validator dispatch carries the finding without its score` in M10-T09.
- A `plan` validator dispatch → carries the finding without its leading `[<score>] ` (source: spec §11; D182). Test: `plan's validator dispatch carries the finding without its score` in M10-T07.
- A review report within the validator's reach → the validator's file forbids reading any review report, since each holds the reviewer's scores (source: spec §11, "not given the reviewer's score"; D201). Test: `validator has its model, effort, maxTurns, input lines and reply block` in M10-T01.
- A scoring agent with two rubric blocks, or none → the test fails (source: D21; D202). Test: `every scoring agent has exactly one rubric block` in M10-T04.

## Tasks

### M10-T01: Add the validator agent

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: M02-T05
- Files: `plugins/orcastrat/agents/validator.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the validator agent`

**Objective**

`agents/validator.md` exists, a Sonnet/medium agent with `maxTurns: 20` and `tools: Read, Glob, Grep, Bash` that scores one blocking finding on the rubric without the reviewer's score and replies in at most 5 lines, and `agent-files.bats` checks it and every listed reviewer's Reading budget section (spec §11, §22 items 2 and 3).

**Read first**

- `docs/orcastrat-execution-spec.md` §11, the "Reading budget" bullet and the "Independent validation" paragraph
- `docs/orcastrat-execution-spec.md` §22, item 3 (the `status-reader` and `validator` bullet)
- plan.md Decisions D178, D182, D201 and D202
- `plugins/orcastrat/agents/status-reader.md` (pattern: an inline-reply agent that writes nothing)
- `tests/orcastrat/agent-files.bats` (whole file)

**Interfaces**

- Consumes: `NON_WORKER_AGENTS` (existing, `tests/orcastrat/agent-files.bats:9`)
- Consumes: `has_line <file> <text>` (existing, `tests/orcastrat/agent-files.bats:26`)
- Consumes: `missing_lines <file> <expected-file>` (existing, `tests/orcastrat/agent-files.bats:46`)
- Consumes: `field <file> <key>` (existing, `tests/orcastrat/agent-files.bats:15`)
- Consumes: `REPO_ROOT` (M02-T05)
- Produces: `plugins/orcastrat/agents/validator.md`
- Produces: `orcastrat:validator input: Finding: <the finding, without its score>, then the lines the reviewer was sent except Output:, then one Instruction file: <path> line per instruction file the finding names`
- Produces: `orcastrat:validator reply: SCORE: <0 to 100> and REASON: <one line: what you confirmed or refuted>, at most 5 lines`
- Produces: `READING_BUDGET_AGENTS`
- Produces: `write_reading_budget <file>`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, replace `NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer planner merger status-reader'` with `NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer planner merger status-reader validator'`. Directly below the line `NO_SHELL_AGENTS='plan-reviewer planner merger'`, insert the line `READING_BUDGET_AGENTS='validator'`. Replace the line `      status-reader) expected='Read, Glob, Grep, Bash' ;;` with `      status-reader|validator) expected='Read, Glob, Grep, Bash' ;;`.
2. In the test `non-worker agents cap their reply at 20 lines`, directly below the line `      has_line "$AGENTS/$name.md" 'Your reply is at most 20 lines.' || bad="$bad $name"`, insert these two lines:

   ```bash
       elif [ "$name" = validator ]; then
         has_line "$AGENTS/$name.md" 'Your reply is at most 5 lines.' || bad="$bad $name"
   ```

3. Directly above the line `@test "field ignores carriage returns" {`, insert this function:

   ```bash
   # write_reading_budget <file>: writes the lines every listed reviewer's and
   # the validator's reading budget section must contain (spec section 11, D76,
   # D200). Its last bullet differs between the reviewers and the validator, so
   # it isn't listed.
   write_reading_budget() {
     cat > "$1" <<'EOF'
   ## Reading budget
   - Read each file once.
   - Read the milestone file, the brief, or the diff whole, and everything else only in part.
   - Read only the Decisions and spec sections the work cites: Grep for `^- D<nn>:` and for the headings named, then read just those line ranges.
   - Check `path:line` citations and literal replacement targets with Grep on the quoted text, not by reading the whole file.
   - Don't read survey notes, and read the plan format only at `${CLAUDE_PLUGIN_ROOT}/reference/plan-format.md`, never a copy of it in the repository.
   EOF
   }
   ```

4. At the end of the file, after one empty line, add these two tests:

   ```bash
   @test "listed reviewers have the reading budget section" {
     local bad='' name missing
     write_reading_budget "$BATS_TEST_TMPDIR/reading-budget"
     for name in $READING_BUDGET_AGENTS; do
       missing="$(missing_lines "$AGENTS/$name.md" "$BATS_TEST_TMPDIR/reading-budget")"
       [ -z "$missing" ] || bad="$bad $name"
     done
     echo "missing reading budget:$bad"
     [ -z "$bad" ]
   }

   @test "validator has its model, effort, maxTurns, input lines and reply block" {
     local f="$AGENTS/validator.md"
     [ "$(field "$f" name)" = 'validator' ]
     [ "$(field "$f" model)" = 'sonnet' ]
     [ "$(field "$f" effort)" = 'medium' ]
     [ "$(field "$f" maxTurns)" = '20' ]
     has_line "$f" 'Finding: <the finding, without its score>'
     has_line "$f" 'Instruction file: <path>'
     has_line "$f" 'SCORE: <0 to 100>'
     has_line "$f" 'REASON: <one line: what you confirmed or refuted>'
     has_line "$f" '- Keep your reply to the status block.'
     has_line "$f" '- Use the shell only for short read-only commands (`git log`, `git show`, `git diff`, `git status`, `grep`, `ls`, `cat`).'
     has_line "$f" 'Never read a review report: a file under `<plan dir>/notes/reviews/`, `<plan dir>/notes/<ID>-review.md`, `<plan dir>/notes/<ID>-review-2.md` or `<plan dir>/notes/<ID>-plan-review.md`. They hold the scores the reviewer gave, and you score without them.'
   }
   ```

5. Run Verify and confirm it fails.
6. Create `plugins/orcastrat/agents/validator.md` with exactly this content:

   ````markdown
   ---
   name: validator
   description: "Scores one blocking review finding again on the review rubric, without seeing the score the reviewer gave it, so that a finding takes effect only if both score it 80 or higher. Read-only; replies inline in at most 5 lines. Dispatched by /orcastrat:run and /orcastrat:plan."
   model: sonnet
   effort: medium
   maxTurns: 20
   tools: Read, Glob, Grep, Bash
   ---

   You check one finding from a review, independently of the reviewer that made it. The reviewer scored it 80 or higher and would block the work on it. You score it again, on the same rubric and against the same criteria, without seeing the reviewer's score: the finding takes effect only if you also score it 80 or higher. You change nothing, and you judge only this one finding.

   ## No prototyping or duplicate work

   - Don't implement. Never write or run trial code, scripts, tests or fixtures, in the repository, the scratchpad or any temp directory. Never create git worktrees, branches or commits. Write nothing at all: your reply is your only output.
   - Don't redo another agent's work: don't re-survey what the milestone's survey note covers; don't re-run a task's Verify, a Milestone verify or a Final verify; don't re-check facts a Decision or a cited note already records.
   - Settle uncertainty in the plan, not by experiment: a detail only running something would settle becomes an exact Step or Done-when for the worker; an unknown fact becomes an `investigate` task; a design choice is a GAP.
   - Use the shell only for short read-only commands (`git log`, `git show`, `git diff`, `git status`, `grep`, `ls`, `cat`).

   ## Search and command bounds

   - Search only inside the repository, or paths named in your brief or task. Never search from a filesystem root or home directory (`find /`, `find ~`, `find /c`, `find C:\`). Prefer the Glob and Grep tools over `find`.
   - Never start a background command, and never run a command that may not finish within the Bash time limit. If you need information a long command would give, report the question instead of running it.
   - Don't verify environment facts (installed tools, versions) that a task's own Verify or scripts establish. For example, `run-bats.sh` clones bats itself.

   You have no Agent, Task, Skill or Artifact tool, so you can't start subagents, run skills or create artifacts.

   ## Reading budget

   - Read each file once.
   - Read the milestone file, the brief, or the diff whole, and everything else only in part.
   - Read only the Decisions and spec sections the work cites: Grep for `^- D<nn>:` and for the headings named, then read just those line ranges.
   - Check `path:line` citations and literal replacement targets with Grep on the quoted text, not by reading the whole file.
   - Don't read survey notes, and read the plan format only at `${CLAUDE_PLUGIN_ROOT}/reference/plan-format.md`, never a copy of it in the repository.
   - Keep your reply to the status block.

   ## Before anything else

   You receive a `Finding:` line, then the lines the reviewer was sent, except its `Output:` line, then one `Instruction file:` line for each instruction file the finding names, if it names any:

   ```
   Finding: <the finding, without its score>
   <the lines the reviewer was sent, except Output:>
   Instruction file: <path>
   ```

   The finding starts with its category tag, then its citation and the problem. The reviewer's lines tell you what was reviewed, and against what:

   - `Brief:` and `Base:`, sometimes with `Worktree:` and `Report:`: one task. The criteria are in the brief at the `Brief:` path: plan.md's Decisions, the milestone's Context, and the task block. The changes are `git diff <Base>` and `git status --porcelain`, plus the full content of any new file. If there is a `Worktree:` line, the changes are in that worktree: start every shell command with `cd "<worktree>" &&`, and read every file by its absolute path under the worktree. A `Report:` line names the worker's report file; its `## Concerns` section lists the worker's own doubts.
   - `Plan:`, `Milestone:` and `Base:`, sometimes with `Re-review: fixes only`: one finished milestone. The criteria are the milestone's file in the plan directory, found through the Milestones table of `<plan dir>/plan.md`, and the Decisions it cites. The changes are `git diff <Base>..HEAD`. `Re-review: fixes only` means the finding is about the milestone's fix tasks, the tasks with an `- Origin: review` line.
   - `Plan:` and `Milestone:` alone: one detailed milestone, before it runs. What was reviewed is the milestone's file itself. The criteria are the plan format, and the sources and Decisions the milestone cites.

   Never read a review report: a file under `<plan dir>/notes/reviews/`, `<plan dir>/notes/<ID>-review.md`, `<plan dir>/notes/<ID>-review-2.md` or `<plan dir>/notes/<ID>-plan-review.md`. They hold the scores the reviewer gave, and you score without them.

   ## Check

   1. Find what the finding cites, its `path:line` or its task or milestone ID, and read only the part of the work and of the criteria that the finding is about.
   2. Check the claim against them. The problem must exist as the finding describes it, in this work, and not before it. For a correctness finding, its failing scenario must really fail.
   3. For each `Instruction file:` line, check with Grep whether that file states the rule the finding says is broken. A rule no cited file states doesn't count for the finding: say so in your reason, and score only what is left of it. A finding that rests on that rule alone doesn't survive a close look.
   4. Score the finding on the rubric below. Judge only this finding: don't look for other problems, and don't score how you would have done the work.

   <!-- rubric:start -->
   ## Scoring rubric

   Score each finding from 0 to 100 against these anchors:

   - **0:** a false positive. It doesn't survive a close look, or the problem existed before this work.
   - **25:** possibly real, but unverified. For a style point, one no instruction file calls for.
   - **50:** verified as real, but minor, rare in practice, or unimportant relative to the rest of the change.
   - **75:** verified and likely to be hit in practice; it affects behavior, or it breaks a rule an instruction file states explicitly.
   - **100:** certain. The evidence directly confirms it, and it will be hit.
   <!-- rubric:end -->

   ## Report

   Reply with exactly this block and nothing else:

   ```
   SCORE: <0 to 100>
   REASON: <one line: what you confirmed or refuted>
   ```

   Your reply is at most 5 lines.
   ````

7. Run Verify and confirm all 23 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats` reports 23 tests and no failure.
- `validator` has `model: sonnet`, `effort: medium`, `maxTurns: 20`, `tools: Read, Glob, Grep, Bash`, the bounds, no-prototyping and Reading budget sections, the rubric block directly above `## Report`, and the two-line reply block with the 5-line cap.
- Nothing else in `agent-files.bats` changed.

### M10-T02: Name the validator and the per-task review files in the plan format

- Kind: change
- Tier: worker
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/reference/plan-format.md`
- Verify: `f=plugins/orcastrat/reference/plan-format.md; grep -qF -- '- **validator** (agent), which scores each blocking review finding again' "$f" && grep -qF 'per-task reviews (reviews/<task-id>-attempt<n>.md)' "$f" && grep -qF 'and its review files, `notes/reviews/<task ID>-attempt<n>.md`, all in the plan directory.' "$f"`
- Fails first: no (reference text with no test; the Verify greps fail until the edits are made)
- Commit: `docs(orcastrat): name the validator and per-task review files in the plan format`

**Objective**

The plan format lists `validator` among its readers, lists the per-task reviewer's review files under `notes/`, and says the scope check allows a task's review files (spec §1.2, §11; D181).

**Read first**

- plan.md Decisions D181 and D199
- `plugins/orcastrat/reference/plan-format.md` lines 1–24 (the readers list and the Directory tree) and the `Files` row of the Task fields table

**Interfaces**

- Consumes: `notes/ line of the plan format's Directory tree` (existing, `plugins/orcastrat/reference/plan-format.md:21`)
- Consumes: `Files row of the Task fields table` (existing, `plugins/orcastrat/reference/plan-format.md:231`)
- Produces: `- **validator** (agent) in the plan format's list of readers`
- Produces: `per-task reviews (reviews/<task-id>-attempt<n>.md) in the plan format's notes/ line`
- Produces: `the Files row's scope-check allowance for notes/reviews/<task ID>-attempt<n>.md`

**Steps**

1. In `plugins/orcastrat/reference/plan-format.md`, directly below the line `- **milestone-reviewer** (agent), which reviews each finished milestone against it,`, insert the line `- **validator** (agent), which scores each blocking review finding again, without seeing the reviewer's score, before it has any effect,`.
2. Replace `plan reviews (<milestone-id>-plan-review.md), worker reports (reports/<task-id>.md)` with `plan reviews (<milestone-id>-plan-review.md), per-task reviews (reviews/<task-id>-attempt<n>.md), worker reports (reports/<task-id>.md)`.
3. Replace `` `run`'s scope check also allows the task's report file, `notes/reports/<task ID>.md`, and its failure log, `notes/<task ID>-failures.md`, both in the plan directory.`` with `` `run`'s scope check also allows the task's report file, `notes/reports/<task ID>.md`, its failure log, `notes/<task ID>-failures.md`, and its review files, `notes/reviews/<task ID>-attempt<n>.md`, all in the plan directory.``
4. Run Verify.

**Done when**

- The readers list names `validator`, the `notes/` line names per-task reviews, and the `Files` row reads: `` `run`'s scope check also allows the task's report file, `notes/reports/<task ID>.md`, its failure log, `notes/<task ID>-failures.md`, and its review files, `notes/reviews/<task ID>-attempt<n>.md`, all in the plan directory.``
- Nothing else in the file changed.

### M10-T03: run keeps a task's review files like its report file

- Kind: change
- Tier: worker
- Status: todo
- Wave: 1
- Depends on: M09-T04, M09-T14
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `f=plugins/orcastrat/skills/run/SKILL.md; grep -qF -- '- **Review file** of a task' "$f" && grep -cF '"<failure log>" "<review file>" ...`' "$f" | grep -qx 3 && grep -cF '.md" "<failure log>" "<failure log>" "<review file>" "<review file>" ...`' "$f" | grep -qx 2 && grep -cF '"<report file>" "<failure log>" "<failure log>" "<review file>" "<review file>" ...`' "$f" | grep -qx 2 && grep -cF 'report file, failure log and review files (see Definitions)' "$f" | grep -qx 2 && grep -qF '":(exclude)<plan dir>/notes/reviews"' "$f" && ! grep -qF '$(' "$f"`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run keeps per-task review files across scope checks and resets`

**Objective**

`run` defines a task's review files, passes them to `scope-check`, holds and restores them with `hold` wherever it holds the report file, and leaves them out of the parallel leftover commit, so the status, escalation or Stop commit carries them (D181, D199).

**Read first**

- plan.md Decisions D181 and D199
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions` (the **Report file**, **Attempt number** and **Discard an attempt** bullets)
- `plugins/orcastrat/skills/run/SKILL.md` section `### 3d. Serial wave` item 4, and section `### 3e. Parallel wave` items 4, 5 and 10, and the paragraph after item 6

**Interfaces**

- Consumes: `hold save <plan-dir> <key> <dir> <path>...` (M09-T04)
- Consumes: `hold restore <plan-dir> <key> <dir> <held-path> <dest-path> [<held-path> <dest-path>]...` (M09-T04)
- Consumes: `**Discard an attempt** through hold save and hold restore in plugins/orcastrat/skills/run/SKILL.md` (M09-T14)
- Produces: `**Review file** of a task's attempt <n>: <plan dir>/notes/reviews/<task ID>-attempt<n>.md`
- Produces: `"<review file>" ... and "<review file>" "<review file>" ... in run's hold commands`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `## Definitions`, directly below the line that starts ``- **Report file** and **Failure log** of a task:``, insert this line:

   ```text
   - **Review file** of a task's attempt `<n>`: `<plan dir>/notes/reviews/<task ID>-attempt<n>.md`, with `<plan dir>` relative to the repository root, as for the report file. The per-task reviewer writes it (3d item 5). A task's **review files** are the review files of its attempts 1 to `<n>`, its current attempt number (see **Attempt number**; in a parallel wave, counted in the failure log inside its worktree). Where a `hold` command in this skill shows `"<review file>" ...`, pass each of the task's review files as its own double-quoted argument, and where it shows `"<review file>" "<review file>" ...`, pass that pair once for each of them. A review file that doesn't exist is harmless: `scope-check` only compares paths, and `hold` skips it.
   ```

2. In the **Discard an attempt** bullet, replace `1. Hold the report file and the failure log: run` with `1. Hold the report file, the failure log and the review files: run`, and replace ``It copies the held report to `<task ID>-attempt<n>.md` and the held failure log back to the failure log,`` with ``It copies the held report to `<task ID>-attempt<n>.md`, and the held failure log and review files back to where they came from,``.
3. Replace all 3 occurrences of `` "<report file>" "<failure log>"` `` (the text `"<report file>" "<failure log>"` followed directly by a backtick, which ends each `hold save` command) with `` "<report file>" "<failure log>" "<review file>" ...` ``.
4. Replace both occurrences of `` .md" "<failure log>" "<failure log>"` `` with `` .md" "<failure log>" "<failure log>" "<review file>" "<review file>" ...` ``, and both occurrences of `` "<report file>" "<failure log>" "<failure log>"` `` with `` "<report file>" "<failure log>" "<failure log>" "<review file>" "<review file>" ...` ``. Each text ends with a backtick. Leave the merge-failed task's command in 3e item 11, which ends `"<MAIN>" "<failure log>" "<failure log>"`, unchanged.
5. Replace both occurrences of `then the task's report file and failure log (see Definitions), each as its own double-quoted argument` with `then the task's report file, failure log and review files (see Definitions), each as its own double-quoted argument`.
6. In section `### 3e. Parallel wave`, make these replacements:
   - `` ":(exclude)<report file>" ":(exclude)<failure log>"`, which stages every uncommitted path except those two.`` with `` ":(exclude)<report file>" ":(exclude)<failure log>" ":(exclude)<plan dir>/notes/reviews"`, which stages every uncommitted path except those two and the task's review files.``
   - `The report file and failure log stay uncommitted: the task's status commit carries them (item 10).` with `The report file, failure log and review files stay uncommitted: the task's status commit carries them (item 10).`
   - `keeping the report and the failure log: run` with `keeping the report, the failure log and the review files: run`
   - `which copies both back to where they came from.` with `which copies them back to where they came from.`
   - `- Hold its report file and failure log: run` with `- Hold its report file, failure log and review files: run`
   - `Write back its held report file and failure log: run` with `Write back its held report file, failure log and review files: run`
7. Run Verify.

**Done when**

- Every `hold save` that holds a report file also holds the task's review files, every `hold restore` of a report file also restores them to their own paths, both `scope-check` calls allow them, and the parallel leftover commit excludes `<plan dir>/notes/reviews`.
- Nothing else in the file changed.

### M10-T04: Add the canonical review rubric and its drift test

- Kind: change
- Tier: worker
- Status: todo
- Wave: 2
- Depends on: M10-T01, M02-T05
- Files: `plugins/orcastrat/reference/review-rubric.md`, `tests/orcastrat/review-rubric.bats`, `plugins/orcastrat/agents/reviewer.md`, `plugins/orcastrat/agents/milestone-reviewer.md`, `plugins/orcastrat/agents/plan-reviewer.md`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/review-rubric.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the canonical review rubric and its drift test`

**Objective**

`reference/review-rubric.md` holds the rubric block, `reviewer`, `milestone-reviewer` and `plan-reviewer` carry it verbatim like `validator`, and `tests/orcastrat/review-rubric.bats` fails when any copy differs (D21, D202).

**Read first**

- `docs/orcastrat-execution-spec.md` §11, the "Rubric" paragraph and its five anchors
- plan.md Decisions D21 and D202
- `tests/orcastrat/agent-files.bats` lines 1–22 (the setup and helper style to follow)
- `plugins/orcastrat/agents/validator.md` (the rubric block directly above `## Report`)

**Interfaces**

- Consumes: `REPO_ROOT` (M02-T05)
- Consumes: `plugins/orcastrat/agents/validator.md` (M10-T01)
- Produces: `plugins/orcastrat/reference/review-rubric.md`
- Produces: `tests/orcastrat/review-rubric.bats`
- Produces: `rubric_block <file>`
- Produces: `SCORING_AGENTS='reviewer milestone-reviewer plan-reviewer validator'`
- Produces: `the rubric block directly above ## Report in reviewer.md, milestone-reviewer.md and plan-reviewer.md`

**Steps**

1. Create `tests/orcastrat/review-rubric.bats` with exactly this content:

   ````bash
   setup() {
     load test_helper
     AGENTS="$REPO_ROOT/plugins/orcastrat/agents"
     CANONICAL="$REPO_ROOT/plugins/orcastrat/reference/review-rubric.md"
   }

   # The agents that score review findings (D21). Each carries a verbatim copy
   # of the canonical rubric block, between the rubric markers.
   SCORING_AGENTS='reviewer milestone-reviewer plan-reviewer validator'

   # rubric_block <file>: prints the lines of <file> strictly between the line
   # <!-- rubric:start --> and the line <!-- rubric:end -->, ignoring carriage
   # returns. Prints nothing when the file or the markers are missing.
   rubric_block() {
     [ -f "$1" ] || return 0
     tr -d '\r' < "$1" | awk '
       $0 == "<!-- rubric:end -->" { inside = 0 }
       inside { print }
       $0 == "<!-- rubric:start -->" { inside = 1 }
     '
   }

   # marker_count <file> <marker>: prints how many lines of <file> equal
   # <marker>, ignoring carriage returns.
   marker_count() {
     tr -d '\r' < "$1" | grep -cxF -- "$2"
   }

   @test "rubric_block prints only the lines between the markers" {
     printf 'before\r\n<!-- rubric:start -->\r\none\r\n\r\ntwo\r\n<!-- rubric:end -->\r\nafter\r\n' > "$BATS_TEST_TMPDIR/sample.md"
     run rubric_block "$BATS_TEST_TMPDIR/sample.md"
     [ "$status" -eq 0 ]
     [ "$output" = "$(printf 'one\n\ntwo')" ]
   }

   @test "the canonical rubric has the five anchors in the spec's wording" {
     local line missing=''
     rubric_block "$CANONICAL" > "$BATS_TEST_TMPDIR/block"
     cat > "$BATS_TEST_TMPDIR/anchors" <<'EOF'
   - **0:** a false positive. It doesn't survive a close look, or the problem existed before this work.
   - **25:** possibly real, but unverified. For a style point, one no instruction file calls for.
   - **50:** verified as real, but minor, rare in practice, or unimportant relative to the rest of the change.
   - **75:** verified and likely to be hit in practice; it affects behavior, or it breaks a rule an instruction file states explicitly.
   - **100:** certain. The evidence directly confirms it, and it will be hit.
   EOF
     while IFS= read -r line; do
       grep -qxF -- "$line" "$BATS_TEST_TMPDIR/block" || missing="$missing|$line"
     done < "$BATS_TEST_TMPDIR/anchors"
     echo "missing:$missing"
     [ -z "$missing" ]
   }

   @test "every scoring agent carries the canonical rubric verbatim" {
     local bad='' name canonical
     canonical="$(rubric_block "$CANONICAL")"
     [ -n "$canonical" ]
     for name in $SCORING_AGENTS; do
       [ "$(rubric_block "$AGENTS/$name.md")" = "$canonical" ] || bad="$bad $name"
     done
     echo "rubric differs in:$bad"
     [ -z "$bad" ]
   }

   @test "every scoring agent has exactly one rubric block" {
     local bad='' name
     for name in $SCORING_AGENTS; do
       if [ ! -f "$AGENTS/$name.md" ]; then
         bad="$bad $name(missing)"
         continue
       fi
       [ "$(marker_count "$AGENTS/$name.md" '<!-- rubric:start -->')" = 1 ] || bad="$bad $name(start)"
       [ "$(marker_count "$AGENTS/$name.md" '<!-- rubric:end -->')" = 1 ] || bad="$bad $name(end)"
     done
     echo "wrong markers:$bad"
     [ -z "$bad" ]
   }

   @test "a copy that differs by one character is caught" {
     [ -n "$(rubric_block "$CANONICAL")" ]
     sed 's/it will be hit\./it will be hit!/' "$CANONICAL" > "$BATS_TEST_TMPDIR/changed.md"
     [ "$(rubric_block "$BATS_TEST_TMPDIR/changed.md")" != "$(rubric_block "$CANONICAL")" ]
   }
   ````

2. Run Verify and confirm it fails.
3. Create `plugins/orcastrat/reference/review-rubric.md` with exactly this content:

   ````markdown
   # Review rubric

   The one rubric that review findings are scored on (Change 10). `reviewer`, `milestone-reviewer`, `plan-reviewer` and `validator` each carry a verbatim copy of the block below, markers included, directly above their `## Report` heading. Edit the rubric here first, then copy the block into all four agent files: `tests/orcastrat/review-rubric.bats` fails when a copy differs.

   <!-- rubric:start -->
   ## Scoring rubric

   Score each finding from 0 to 100 against these anchors:

   - **0:** a false positive. It doesn't survive a close look, or the problem existed before this work.
   - **25:** possibly real, but unverified. For a style point, one no instruction file calls for.
   - **50:** verified as real, but minor, rare in practice, or unimportant relative to the rest of the change.
   - **75:** verified and likely to be hit in practice; it affects behavior, or it breaks a rule an instruction file states explicitly.
   - **100:** certain. The evidence directly confirms it, and it will be hit.
   <!-- rubric:end -->
   ````

4. In each of `plugins/orcastrat/agents/reviewer.md`, `plugins/orcastrat/agents/milestone-reviewer.md` and `plugins/orcastrat/agents/plan-reviewer.md`, directly above the line `## Report`, insert the rubric block from Context, from its `<!-- rubric:start -->` line to its `<!-- rubric:end -->` line. Each of the three files has exactly one line `## Report`.
5. Run Verify and confirm all 5 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/review-rubric.bats` reports 5 tests and no failure.
- In each of the three reviewer files, the only change is the rubric block and the empty line after it, directly above `## Report`.

### M10-T05: plan-reviewer scores its findings on the rubric

- Kind: change
- Tier: worker
- Status: todo
- Wave: 3
- Depends on: M02-T10, M10-T01, M10-T04
- Files: `plugins/orcastrat/agents/plan-reviewer.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats tests/orcastrat/review-rubric.bats`
- Fails first: yes
- Commit: `feat(orcastrat): plan-reviewer scores and tags its findings`

**Objective**

`plan-reviewer` works to the Reading budget, scores and tags every finding, puts only blocking candidates in D183's categories under `## Issues`, and says each issue is validated before anyone fixes it (spec §11; D183, D198, D200).

**Read first**

- `docs/orcastrat-execution-spec.md` §11, the "Reviewers" bullets
- plan.md Decisions D182, D183, D198 and D200
- `plugins/orcastrat/agents/plan-reviewer.md` (whole file)
- `tests/orcastrat/agent-files.bats` (the `READING_BUDGET_AGENTS` line and the last two tests)

**Interfaces**

- Consumes: `READING_BUDGET_AGENTS` (M10-T01)
- Consumes: `write_reading_budget <file>` (M10-T01)
- Consumes: `the rubric block directly above ## Report in reviewer.md, milestone-reviewer.md and plan-reviewer.md` (M10-T04)
- Consumes: `## Advisory` (M02-T10)
- Produces: `plan-reviewer report line: 1. [<score>] <category>: <task or milestone ID> — <which check> — <problem, quoting the text involved>`
- Produces: `plan-reviewer blocking categories: design-decision, coverage, wave-interference, verify-fails-first, verify-targeted`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, replace `READING_BUDGET_AGENTS='validator'` with `READING_BUDGET_AGENTS='validator plan-reviewer'`. At the end of the file, after one empty line, add this test:

   ```bash
   @test "plan-reviewer scores its findings and sorts them into issues and advisory findings" {
     local f="$AGENTS/plan-reviewer.md"
     has_line "$f" '- Keep your reply to the status block. Everything else goes in your report file.'
     has_line "$f" '3. `plan.md`: its header, its Coverage rows for this milestone, its Open questions, and the Decisions the milestone cites, found with Grep. Not the whole file.'
     has_line "$f" '- `design-decision`: a task needs a design decision to execute (checks 1, 2 and 4, and the unsourced assumptions of check 9).'
     has_line "$f" '- `coverage`: a Coverage gap (check 3).'
     has_line "$f" '- `wave-interference`: two tasks in one wave interfere (check 5).'
     has_line "$f" '- `verify-fails-first`: a Verify command that would pass before its task is done (check 6), or a Fails first problem (check 7).'
     has_line "$f" '- `verify-targeted`: a Verify command not targeted at what its task changes (check 6).'
     has_line "$f" '1. [<score>] <category>: <task or milestone ID> — <which check> — <problem, quoting the text involved>'
     run grep -qF 'for what check 11 finds' "$f"
     [ "$status" -ne 0 ]
   }
   ```

2. Run Verify and confirm it fails.
3. In `plugins/orcastrat/agents/plan-reviewer.md`, directly above the line `## Before anything else`, insert the Reading budget section from Context, with the last bullet `- Keep your reply to the status block. Everything else goes in your report file.`. Replace `Read these now, in full:` with `Read these now, keeping to the Reading budget above:`. Replace the line ``3. `plan.md`: the whole file, including Coverage, Decisions, and Open questions.`` with ``3. `plan.md`: its header, its Coverage rows for this milestone, its Open questions, and the Decisions the milestone cites, found with Grep. Not the whole file.``
4. Directly above the line `<!-- rubric:start -->`, insert:

   ```markdown
   ## Findings

   Every problem a check finds is a finding. Score each one on the rubric below, and tag it with a category in kebab-case:

   - `design-decision`: a task needs a design decision to execute (checks 1, 2 and 4, and the unsourced assumptions of check 9).
   - `coverage`: a Coverage gap (check 3).
   - `wave-interference`: two tasks in one wave interfere (check 5).
   - `verify-fails-first`: a Verify command that would pass before its task is done (check 6), or a Fails first problem (check 7).
   - `verify-targeted`: a Verify command not targeted at what its task changes (check 6).
   - Any other finding, including every finding of checks 8, 10 and 11: a short tag naming its topic, for example `tier-fit`, `read-first` or `non-bash-verify`.

   A finding is an **issue** only if all three hold: its score is 80 or higher, it cites the plan section it is about by its task or milestone ID, and its category is one of the first five above. Every other finding is advisory, and findings of checks 8, 10 and 11 always are.
   ```

5. In section `## Report`, replace ``It has exactly two sections, in this order, each a numbered list with one finding per item: `## Issues` for what checks 1 to 10 find, and `## Advisory` for what check 11 finds.`` with ``It has exactly two sections, in this order, each a numbered list with one finding per item: `## Issues` for the issues, and `## Advisory` for every other finding.`` Replace the line `1. <task or milestone ID> — <which check> — <problem, quoting the text involved>` and the line `1. <task or milestone ID> — non-bash Verify — <problem, quoting the command>` each with the line `1. [<score>] <category>: <task or milestone ID> — <which check> — <problem, quoting the text involved>`.
6. Replace `advisory findings never change STATUS or the count, and nobody fixes them automatically.` with ``advisory findings never change STATUS or the count, and nobody fixes them automatically. Before anyone fixes an issue, a validator scores it again without seeing your score, and an issue it scores below 80 moves to `## Advisory`.``
7. Run Verify and confirm all 29 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats tests/orcastrat/review-rubric.bats` reports 29 tests and no failure.
- `plan-reviewer` has the Reading budget, the `## Findings` section above the rubric block, and the scored report lines; its checks 1 to 11 are unchanged.

### M10-T06: reviewer scores its findings and writes a report file

- Kind: change
- Tier: worker
- Status: todo
- Wave: 4
- Depends on: M10-T01, M10-T04, M10-T05
- Files: `plugins/orcastrat/agents/reviewer.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats tests/orcastrat/review-rubric.bats`
- Fails first: yes
- Commit: `feat(orcastrat): reviewer scores its findings and writes a report file`

**Objective**

`reviewer` works to the Reading budget, writes every finding scored and tagged to its `Output:` report file under `## Blocking` or `## Advisory`, and replies with its verdict and two counts (spec §11; D181, D182, D184, D203).

**Read first**

- `docs/orcastrat-execution-spec.md` §11, the "Reviewers" bullets
- plan.md Decisions D181, D182, D184, D198 and D203
- `plugins/orcastrat/agents/reviewer.md` (whole file)
- `tests/orcastrat/agent-files.bats` (the `READING_BUDGET_AGENTS` line, `write_reviewer_rules`, and the test `reviewer reads the brief and checks the worker's concerns`)

**Interfaces**

- Consumes: `READING_BUDGET_AGENTS` (M10-T01)
- Consumes: `the rubric block directly above ## Report in reviewer.md, milestone-reviewer.md and plan-reviewer.md` (M10-T04)
- Consumes: `write_reviewer_rules <file>` (existing, `tests/orcastrat/agent-files.bats:124`)
- Produces: `orcastrat:reviewer input: Brief: <path>, Base: <sha>, Output: <report file path>, and sometimes Worktree: <path> and Report: <path>`
- Produces: `orcastrat:reviewer reply: VERDICT: PASS | FAIL, BLOCKING: <count>, ADVISORY: <count>`
- Produces: `reviewer report line: - [<score>] <category>: <path:line> — <problem> (<task ID, Coverage row, or D<nn>>)`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, replace `READING_BUDGET_AGENTS='validator plan-reviewer'` with `READING_BUDGET_AGENTS='validator plan-reviewer reviewer'`. At the end of the file, after one empty line, add this test:

   ```bash
   @test "reviewer scores its findings and writes them to its report file" {
     local f="$AGENTS/reviewer.md"
     has_line "$f" '- Keep your reply to the status block. Everything else goes in your report file.'
     has_line "$f" '- It contradicts a Decision in plan.md, or the Context of the milestone other than a rule quoted in its `Conventions:` block (tag it `contradicts-decision`).'
     has_line "$f" '- [<score>] <category>: <path:line> — <problem> (<task ID, Coverage row, or D<nn>>)'
     has_line "$f" 'VERDICT: PASS | FAIL'
     has_line "$f" 'BLOCKING: <count>'
     has_line "$f" 'ADVISORY: <count>'
     run grep -qF 'REASONS:' "$f"
     [ "$status" -ne 0 ]
     run grep -qF 'an `Output:` path for your report file' "$f"
     [ "$status" -eq 0 ]
   }
   ```

2. Run Verify and confirm it fails.
3. In `plugins/orcastrat/agents/reviewer.md`, replace the line `description: Checks one completed Orcastrat task against its Steps and Done-when criteria when no command can verify it. Read-only. Dispatched by /orcastrat:run only.` with `description: "Checks one completed Orcastrat task against its Steps and Done-when criteria and scores each finding on the review rubric. Read-only except its report file. Dispatched by /orcastrat:run only."`, and replace `You change nothing: you only read and report.` with `You change nothing except your report file: you only read and report.`
4. Directly above the line `## Before anything else`, insert the Reading budget section from Context, with the last bullet `- Keep your reply to the status block. Everything else goes in your report file.`. Replace ``The orchestrator sends you a `Brief:` path and a `Base:` commit, sometimes a `Worktree:` path,`` with ``The orchestrator sends you a `Brief:` path and a `Base:` commit, an `Output:` path for your report file, sometimes a `Worktree:` path,``. Replace `Read these now, in full:` with `Read these now, keeping to the Reading budget above:`.
5. Directly above the line `<!-- rubric:start -->`, insert:

   ```markdown
   ## Findings

   Every problem the checks find is a finding. Score each one on the rubric below, tag it with a short category in kebab-case naming its topic, for example `nullable`, `naming`, `test-pattern` or `scope`, and cite it by `path:line`.

   A finding is **blocking** only if all three hold: its score is 80 or higher, it cites `path:line`, and it is one of these:

   - It violates a Done-when criterion.
   - It leaves a Coverage item unimplemented.
   - It breaks a declared Interfaces entry, a Consumes or a Produces line.
   - It is a correctness bug, with a concrete scenario in which it fails.
   - It changes something outside the task's Files, or outside the plan's Out of scope section when your inputs include one.
   - It contradicts a Decision in plan.md, or the Context of the milestone other than a rule quoted in its `Conventions:` block (tag it `contradicts-decision`).

   Every other finding is advisory, style points included. A finding that breaks a rule of an instruction file, or a rule quoted in the `Conventions:` block, stays advisory unless it is also one of the first five kinds above.
   ```

6. In section `## Report`, replace the line `Reply with exactly this block and nothing else:` with the block below, and replace the line `REASONS: <for FAIL, up to three specific failures, each naming the Step or criterion, separated by " | ". For PASS, "-".>` with the two lines `BLOCKING: <count>` and `ADVISORY: <count>`:

   ````markdown
   Write your report file at the `Output:` path, creating its directory when it doesn't exist. It is the only file you may create or change. It has exactly two sections, each finding on one line:

   ```
   ## Blocking

   - [<score>] <category>: <path:line> — <problem> (<task ID, Coverage row, or D<nn>>)

   ## Advisory

   - [<score>] <category>: <path:line> — <problem> (<task ID, Coverage row, or D<nn>>)
   ```

   A section with no findings says `None.` instead.

   Then reply with exactly this block and nothing else:
   ````

7. Directly above the line that starts `Your reply is at most 20 lines.`, insert the line ``VERDICT is `FAIL` when `## Blocking` has at least one finding, and `PASS` when it says `None.`. Before a `FAIL` takes effect, a validator scores each blocking finding again without seeing your score, and one it scores below 80 becomes advisory.`` Then run Verify and confirm all 30 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats tests/orcastrat/review-rubric.bats` reports 30 tests and no failure.
- `reviewer` writes its scored findings to its `Output:` file and replies `VERDICT`, `BLOCKING` and `ADVISORY`; its `## Check` section is unchanged.

### M10-T07: plan validates plan-review issues before fixing them

- Kind: change
- Tier: worker
- Status: todo
- Wave: 4
- Depends on: M10-T01, M10-T05, M09-T06
- Files: `plugins/orcastrat/skills/plan/SKILL.md`, `tests/orcastrat/skill-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats && grep -qF '[<score>/none]' plugins/orcastrat/skills/plan/SKILL.md`
- Fails first: yes
- Commit: `feat(orcastrat): plan validates plan-review issues before fixing them`

**Objective**

`plan` dispatches one `validator` per plan-review issue, all at once, rewrites each report with both scores, moves unconfirmed issues to `## Advisory`, and fixes only the issues left (spec §11; D178, D182, D201).

**Read first**

- `docs/orcastrat-execution-spec.md` §11, the "Independent validation" paragraph
- plan.md Decisions D178, D182, D201 and D203
- `plugins/orcastrat/skills/plan/SKILL.md` section `## 11. Write and hand off`
- `plugins/orcastrat/agents/validator.md` sections `## Before anything else` and `## Report`
- `tests/orcastrat/skill-files.bats` (whole file)

**Interfaces**

- Consumes: `orcastrat:validator input: Finding: <the finding, without its score>, then the lines the reviewer was sent except Output:, then one Instruction file: <path> line per instruction file the finding names` (M10-T01)
- Consumes: `orcastrat:validator reply: SCORE: <0 to 100> and REASON: <one line: what you confirmed or refuted>, at most 5 lines` (M10-T01)
- Consumes: `plan-reviewer report line: 1. [<score>] <category>: <task or milestone ID> — <which check> — <problem, quoting the text involved>` (M10-T05)
- Consumes: `tests/orcastrat/skill-files.bats` (M09-T06)
- Produces: `has_stripped_line <file> <text>`
- Produces: `plan's validator dispatch in step 11 of plugins/orcastrat/skills/plan/SKILL.md`

**Steps**

1. In `tests/orcastrat/skill-files.bats`, directly above the line `@test "field reads a frontmatter key and ignores the body" {`, insert:

   ```bash
   # has_stripped_line <file> <text>: succeeds when <file> has a line equal to
   # <text> once carriage returns and leading spaces are removed.
   has_stripped_line() {
     [ -f "$1" ] || return 1
     tr -d '\r' < "$1" | sed 's/^ *//' | grep -qxF -- "$2"
   }
   ```

2. At the end of the file, after one empty line, add this test:

   ```bash
   @test "plan's validator dispatch carries the finding without its score" {
     local f="$SKILLS/plan/SKILL.md"
     has_stripped_line "$f" 'Finding: <the candidate line, without its list marker and without its leading [<score>] >'
     has_stripped_line "$f" 'Plan: <plan dir>'
     has_stripped_line "$f" 'Milestone: <ID>'
     run grep -qiE '^ *(reviewer )?score:' "$f"
     [ "$status" -ne 0 ]
   }
   ```

3. Run Verify and confirm it fails.
4. In `plugins/orcastrat/skills/plan/SKILL.md`, replace ``Each reviewer writes its issues to its Output file and replies `APPROVED` or `ISSUES`, with a count. For each milestone whose reviewer replied `ISSUES`, read its report and fix every issue under its `## Issues` heading yourself, once, under the same rules you wrote the milestone by in steps 6 to 9.`` with the block below. The rest of that paragraph, from ` Findings under its `, stays where it is, on the same line as the block's last sentence.

   ````markdown
   Each reviewer writes its findings to its Output file, each scored on the review rubric, the issues under `## Issues` and every other finding under `## Advisory`, and replies `APPROVED` or `ISSUES`, with a count.

   Before you fix anything, have every issue scored again by a validator, which never sees the reviewer's score. For each milestone whose reviewer replied `ISSUES`, read the lines under its report's `## Issues` heading: each line that starts with a number, a period and ` [` is a candidate. Invoke the agent `orcastrat:validator` once for each candidate, for every milestone at once, all in one message so they run at the same time, each with exactly:

   ```
   Finding: <the candidate line, without its list marker and without its leading [<score>] >
   Plan: <plan dir>
   Milestone: <ID>
   ```

   plus one line `Instruction file: <path>` for each instruction file the candidate names: each path in its text whose file name is `CLAUDE.md`, `CLAUDE.local.md` or `AGENTS.md`, or which starts with `.claude/rules/`. Each validator replies with a `SCORE:` line and a `REASON:` line. A call that returns an error, or a reply with no `SCORE:` line holding a whole number, gives its candidate no score. Then, in each report:

   1. Change each candidate's leading `[<score>]` to `[<score>/<validator score>]`, or to `[<score>/none]` when it has no score.
   2. Move each candidate the validator scored below 80, or that has no score, to the end of `## Advisory`, adding ` — validator: <the text after REASON: in its reply>` to its end, or ` — validator: no score`. If `## Advisory` says `None.`, the first line moved replaces it.
   3. Renumber both sections from 1, and write `None.` in a section left with no finding.

   The candidates left under `## Issues` are the validated issues. For each milestone whose report still has one, fix every issue under its `## Issues` heading yourself, once, under the same rules you wrote the milestone by in steps 6 to 9.
   ````

5. Run Verify and confirm all 5 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats` reports 5 tests and no failure.
- `plan` validates every plan-review issue before its fix pass and fixes only the issues left under `## Issues`; the rest of step 11 is unchanged.

### M10-T08: milestone-reviewer scores its findings on the rubric

- Kind: change
- Tier: worker
- Status: todo
- Wave: 5
- Depends on: M10-T01, M10-T04, M10-T06
- Files: `plugins/orcastrat/agents/milestone-reviewer.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats tests/orcastrat/review-rubric.bats`
- Fails first: yes
- Commit: `feat(orcastrat): milestone-reviewer scores and tags its findings`

**Objective**

`milestone-reviewer` works to the Reading budget, scores and tags every finding, and puts under `## Blocking` only the candidates in a work-review blocking category (spec §11; D182, D184, D198, D200).

**Read first**

- `docs/orcastrat-execution-spec.md` §11, the "Reviewers" bullets
- plan.md Decisions D182, D184, D198 and D200
- `plugins/orcastrat/agents/milestone-reviewer.md` (whole file)
- `tests/orcastrat/agent-files.bats` (the `READING_BUDGET_AGENTS` line and the last test)

**Interfaces**

- Consumes: `READING_BUDGET_AGENTS` (M10-T01)
- Consumes: `the rubric block directly above ## Report in reviewer.md, milestone-reviewer.md and plan-reviewer.md` (M10-T04)
- Produces: `milestone-reviewer report line: - [<score>] <category>: <path:line> — <problem> (<task ID, Coverage row, or D<nn>>)`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, replace `READING_BUDGET_AGENTS='validator plan-reviewer reviewer'` with `READING_BUDGET_AGENTS='validator plan-reviewer reviewer milestone-reviewer'`. At the end of the file, after one empty line, add this test:

   ```bash
   @test "milestone-reviewer scores its findings" {
     local f="$AGENTS/milestone-reviewer.md"
     has_line "$f" '- Keep your reply to the status block. Everything else goes in your report file.'
     has_line "$f" '3. `plan.md`: its header, its `## Out of scope` section if it has one, and the Decisions the milestone cites, found with Grep.'
     has_line "$f" '- It contradicts a Decision in plan.md, or the Context of the milestone other than a rule quoted in its `Conventions:` block (tag it `contradicts-decision`).'
     has_line "$f" '- [<score>] <category>: <path:line> — <problem> (<task ID, Coverage row, or D<nn>>)'
     run grep -qF 'Only findings that would cause real problems count as blocking.' "$f"
     [ "$status" -ne 0 ]
   }
   ```

2. Run Verify and confirm it fails.
3. In `plugins/orcastrat/agents/milestone-reviewer.md`, directly above the line `## Before anything else`, insert the Reading budget section from Context, with the last bullet `- Keep your reply to the status block. Everything else goes in your report file.`. Replace `Read these now, in full:` with `Read these now, keeping to the Reading budget above:`. Replace the line ``3. `plan.md`: the header and Decisions.`` with ``3. `plan.md`: its header, its `## Out of scope` section if it has one, and the Decisions the milestone cites, found with Grep.``
4. Replace `A listed file with no change is a blocking finding.` with `A listed file with no change is a finding.`
5. In section `## Findings`, replace the line that starts `Only findings that would cause real problems count as blocking.` with:

   ```markdown
   Every problem the checks find is a finding. Score each one on the rubric below, tag it with a short category in kebab-case naming its topic, for example `nullable`, `naming`, `test-pattern` or `scope`, and cite it by `path:line` and the task, Coverage row, or Decision involved. Judge against what the milestone asked for, not against what you would have built.

   A finding is **blocking** only if all three hold: its score is 80 or higher, it cites `path:line`, and it is one of these:

   - It violates a Done-when criterion of a task.
   - It leaves a Coverage row unimplemented.
   - It breaks a declared Interfaces entry, a Consumes or a Produces line.
   - It is a correctness bug, with a concrete scenario in which it fails.
   - It changes something outside the Files of the milestone's tasks, or something the `## Out of scope` section of plan.md excludes, when plan.md has that section.
   - It contradicts a Decision in plan.md, or the Context of the milestone other than a rule quoted in its `Conventions:` block (tag it `contradicts-decision`).

   Every other finding is advisory, style points included. A finding that breaks a rule of an instruction file, or a rule quoted in the `Conventions:` block, stays advisory unless it is also one of the first five kinds above.
   ```

6. In section `## Report`, replace both lines ``- `path:line` — <problem> (<task ID, Coverage row, or D<nn>>)`` with the line `- [<score>] <category>: <path:line> — <problem> (<task ID, Coverage row, or D<nn>>)`. Replace ``any finding at all makes it `FINDINGS`.`` with ``any finding at all makes it `FINDINGS`. Before a blocking finding takes effect, a validator scores it again without seeing your score, and one it scores below 80 moves to `## Advisory`.``
7. Run Verify and confirm all 31 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats tests/orcastrat/review-rubric.bats` reports 31 tests and no failure.
- `milestone-reviewer`'s checks 1 to 5 and its re-review rules are unchanged; its `## Findings` section holds the scoring rules and its report lines are scored.

### M10-T09: run validates the per-task review before a FAIL counts

- Kind: change
- Tier: worker
- Status: todo
- Wave: 5
- Depends on: M10-T01, M10-T03, M10-T06, M10-T07
- Files: `plugins/orcastrat/skills/run/SKILL.md`, `tests/orcastrat/skill-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats && f=plugins/orcastrat/skills/run/SKILL.md && grep -qF -- '- **Validate a review**' "$f" && grep -qF 'Output: <MAIN>/<review file>' "$f" && grep -qF 'Output:` line names the review file under the worktree' "$f" && ! grep -qF 'reviewer FAIL: <REASONS>' "$f"`
- Fails first: yes
- Commit: `feat(orcastrat): run validates the per-task review before a FAIL counts`

**Objective**

`run` defines **Validate a review**, sends the per-task reviewer an `Output:` review file, validates every blocking finding on `VERDICT: FAIL`, and makes the task a failed attempt only when a validated finding is left (spec §11; D178, D181, D182, D201, D203).

**Read first**

- `docs/orcastrat-execution-spec.md` §11, the "Independent validation" paragraph
- plan.md Decisions D178, D181, D182, D201 and D203
- `plugins/orcastrat/skills/run/SKILL.md`: the opening paragraph after the argument list, section `## Definitions` (the **Committed review result** and **Review file** bullets), `### 3d. Serial wave` item 5, `### 3e. Parallel wave` item 4, and the first paragraph of `## Failed attempt`
- `plugins/orcastrat/agents/reviewer.md` section `## Report`, and `plugins/orcastrat/agents/validator.md` sections `## Before anything else` and `## Report`
- `tests/orcastrat/skill-files.bats` (whole file)

**Interfaces**

- Consumes: `**Review file** of a task's attempt <n>: <plan dir>/notes/reviews/<task ID>-attempt<n>.md` (M10-T03)
- Consumes: `orcastrat:reviewer input: Brief: <path>, Base: <sha>, Output: <report file path>, and sometimes Worktree: <path> and Report: <path>` (M10-T06)
- Consumes: `orcastrat:reviewer reply: VERDICT: PASS | FAIL, BLOCKING: <count>, ADVISORY: <count>` (M10-T06)
- Consumes: `orcastrat:validator input: Finding: <the finding, without its score>, then the lines the reviewer was sent except Output:, then one Instruction file: <path> line per instruction file the finding names` (M10-T01)
- Consumes: `orcastrat:validator reply: SCORE: <0 to 100> and REASON: <one line: what you confirmed or refuted>, at most 5 lines` (M10-T01)
- Consumes: `has_stripped_line <file> <text>` (M10-T07)
- Produces: `**Validate a review** in plugins/orcastrat/skills/run/SKILL.md`
- Produces: `reviewer FAIL: <validated findings>`

**Steps**

1. In `tests/orcastrat/skill-files.bats`, at the end of the file, after one empty line, add this test:

   ```bash
   @test "run's validator dispatch carries the finding without its score" {
     local f="$SKILLS/run/SKILL.md"
     has_stripped_line "$f" 'Finding: <the candidate line, without its list marker and without its leading [<score>] >'
     has_stripped_line "$f" '<each line you sent the reviewer, in the same order, except its Output: line>'
     run grep -qiE '^ *(reviewer )?score:' "$f"
     [ "$status" -ne 0 ]
   }
   ```

2. Run Verify and confirm it fails.
3. In `plugins/orcastrat/skills/run/SKILL.md`, replace ``(a task's failure log and `notes/run-log.md`)`` with ``(a task's failure log, `notes/run-log.md`, and the review reports that **Validate a review** rewrites)``.
4. In section `## Definitions`, directly below the line that starts ``- **Committed review result** of a review note:``, insert:

   ````text
   - **Validate a review** in its report file, given the lines you sent the reviewer, in the section that holds its blocking findings: `## Blocking` for `reviewer` and `milestone-reviewer`, `## Issues` for `plan-reviewer`. No validator ever sees the reviewer's scores.
     1. Read that section: Grep the report for `^## ` with line numbers, then Read only the lines from the section's heading to the line before the next `## ` heading. Each line in it that starts `- [`, or a number followed by `. [`, is a **candidate**.
     2. Invoke the agent `orcastrat:validator` once for each candidate, all in a single message, so they run concurrently. Each gets exactly:
        ```
        Finding: <the candidate line, without its list marker and without its leading [<score>] >
        <each line you sent the reviewer, in the same order, except its Output: line>
        ```
        plus one line `Instruction file: <path>` for each instruction file the candidate names: each path in its text whose file name is `CLAUDE.md`, `CLAUDE.local.md` or `AGENTS.md`, or which starts with `.claude/rules/`.
     3. A validator's score is the whole number on its reply's `SCORE:` line. When its call returns an error, or its reply has no such line (for example, it hit its turn limit), the candidate has no score.
     4. In the report, change each candidate's leading `[<score>]` to `[<score>/<validator score>]`, or to `[<score>/none]` when it has no score.
     5. Move each candidate whose validator score is below 80, or which has no score, to the end of the report's `## Advisory` section, adding ` — validator: <the text after REASON: in its reply>` to its end, or ` — validator: no score` when it has none. If `## Advisory` says `None.`, the first line moved replaces it. In `plan-reviewer`'s numbered lists, renumber both sections from 1. A section left with no finding says `None.`.
     6. The candidates left in the section are the **validated findings**. Only they have any effect: a failed attempt, a milestone's fix round, or a plan review's fix pass. The others are advisory, with both scores recorded.
   ````

5. In section `### 3d. Serial wave`, item 5, replace the whole line that starts ``   - `review` → invoke `orcastrat:reviewer` with exactly the two lines`` with this line:

   ```text
      - `review` → invoke `orcastrat:reviewer` with exactly the three lines `Brief: <the task's brief path>`, `Base: <BASE>` and `Output: <MAIN>/<review file>`, naming the current attempt's review file (see Definitions). The reviewer writes its scored findings there and replies `VERDICT: PASS | FAIL`, `BLOCKING: <count>` and `ADVISORY: <count>`. On `VERDICT: FAIL`, **validate the review** (see Definitions) in its `## Blocking` section, with the lines you sent the reviewer. If a validated finding is left → **Failed attempt** with the description `reviewer FAIL: <validated findings>`: the text of each validated finding after its `<category>: `, joined with ` | `. If none is left, the review passes: the reviewer's FAIL is final only after validation.
   ```

   Then, in the `DONE_WITH_CONCERNS` line just below it, replace `` `VERDICT: FAIL` → **Failed attempt** with the description `reviewer FAIL: <REASONS>`. `` with `` `VERDICT: FAIL` is handled as for `review`. ``, so that line ends ``A task whose Verify includes `review` gets one review, with that line. `VERDICT: FAIL` is handled as for `review`.``
6. In section `### 3e. Parallel wave`, item 4, replace ``The reviewer also gets the `Worktree:` line, and after `DONE_WITH_CONCERNS` its `Report:` line names the report file under the worktree.`` with ``The reviewer also gets the `Worktree:` line, its `Output:` line names the review file under the worktree, `<worktree>/<review file>`, and after `DONE_WITH_CONCERNS` its `Report:` line names the report file under the worktree. Validate its review in that review file, as 3d item 5 says.`` In section `## Failed attempt`, replace `the reviewer returned FAIL,` with `the reviewer returned FAIL and a finding survived validation,`, and replace `` `reviewer FAIL: <REASONS>` `` with `` `reviewer FAIL: <validated findings>` ``.
7. Run Verify and confirm all 6 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/skill-files.bats` reports 6 tests and no failure, and `reviewer FAIL: <REASONS>` appears nowhere in the file.
- 3d item 5 sends the reviewer an `Output:` line, validates on `VERDICT: FAIL`, and fails the attempt only with a validated finding; 3e item 4 does the same under the worktree.
- Nothing else in the file changed.

### M10-T10: run validates plan reviews and milestone reviews

- Kind: change
- Tier: worker
- Status: todo
- Wave: 6
- Depends on: M10-T05, M10-T08, M10-T09
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `f=plugins/orcastrat/skills/run/SKILL.md; grep -cF '**validate the review** (see Definitions)' "$f" | grep -qx 4 && ! grep -qF 'read the report yourself' "$f" && grep -qF 'leaves no validated finding' "$f" && grep -cF 'after validation or as the committed review result' "$f" | grep -qx 2 && ! grep -qF '$(' "$f"`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run validates plan reviews and milestone reviews`

**Objective**

`run` validates a plan review's issues before the planner's fix pass, and a milestone review's or re-review's blocking findings before it commits the report, and goes by the validated count (spec §11; D178, D203).

**Read first**

- plan.md Decisions D178, D203 and D104
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions`, the **Committed review result** and **Validate a review** bullets
- `plugins/orcastrat/skills/run/SKILL.md` section `### 3a. Detail it if it's an outline` item 5, and section `### 3f. Finish the milestone` items 2 to 6

**Interfaces**

- Consumes: `**Validate a review** in plugins/orcastrat/skills/run/SKILL.md` (M10-T09)
- Consumes: `milestone-reviewer report line: - [<score>] <category>: <path:line> — <problem> (<task ID, Coverage row, or D<nn>>)` (M10-T08)
- Consumes: `plan-reviewer report line: 1. [<score>] <category>: <task or milestone ID> — <which check> — <problem, quoting the text involved>` (M10-T05)
- Produces: `3a item 5 and 3f items 2 to 6 validating plan and milestone reviews in plugins/orcastrat/skills/run/SKILL.md`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `### 3a. Detail it if it's an outline`, item 5, replace ``   Don't read the report yourself: it's for the planner. If it reports `ISSUES`, invoke the agent `orcastrat:planner` once more, with exactly:`` with ``   If it reports `ISSUES`, **validate the review** (see Definitions) in its `## Issues` section, with those three lines as the lines you sent the reviewer. Read nothing else of the report: it's for the planner. If a validated finding is left, invoke the agent `orcastrat:planner` once more, with exactly:``
2. In the same item, replace ``Once the plan review reports `APPROVED`, or the fix pass reports `DONE`,`` with ``Once the plan review reports `APPROVED` or leaves no validated finding, or the fix pass reports `DONE`,``.
3. In section `### 3f. Finish the milestone`, item 2, replace ``   Don't read the report yourself: it's for the planner. If `git status --porcelain` prints nothing,`` with ``   If it reports `FINDINGS` with `BLOCKING` above 0, **validate the review** (see Definitions) in its `## Blocking` section, with those four lines as the lines you sent the reviewer, before you commit it. Read nothing else of the report: it's for the planner. The review's result is then `BLOCKING: <the number of validated findings>`. If `git status --porcelain` prints nothing,``
4. Replace ``3. If it reports `APPROVED`, or `FINDINGS` with `BLOCKING: 0`, go to item 7.`` with ``3. If it reports `APPROVED`, or the review's result is `BLOCKING: 0`, after validation or as the committed review result, go to item 7.``
5. In item 5, replace ``   Don't read the report yourself. Skip the commit,`` with ``   If it reports `BLOCKING` above 0, **validate the review** (see Definitions) in its `## Blocking` section, with those five lines as the lines you sent the reviewer, before you commit it. Read nothing else of the report. Skip the commit,``
6. Replace ``6. If the re-review reports `BLOCKING` above 0,`` with ``6. If the re-review's result is `BLOCKING` above 0, after validation or as the committed review result,``.
7. Run Verify.

**Done when**

- 3a item 5 runs the fix pass only when a validated issue is left, and 3f validates a review and a re-review before committing them and goes by the validated count.
- Nothing else in the file changed.
