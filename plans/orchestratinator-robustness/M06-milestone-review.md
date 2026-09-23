# M06: Change 5: Milestone quality review (spec §7)

- Status: done
- Goal: A new `milestone-reviewer` agent reviews each finished milestone's diff. `run` 3f dispatches it after Milestone verify and before marking the milestone done, with one fix round by the planner in `Fix findings:` mode and one re-review. The plan format documents `- Origin: review` and the review notes files. The README cast table and "How a run behaves" describe it.
- Depends on: M05
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §7, the review sentence of §13 ("apply to every milestone, whatever its format"), and §2's requirement for new agents; plus D01, D03, D05, D08 (Origin placement), D10, D16, D17, D21, D22, D24, and D34–D38 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). This milestone file gets no Coverage or Review Focus section. Never modify Change 0 text (D17), including the precedence-rule paragraph under the planner's `## Write` and the stray-commit, `STRAY`, and `PUSHED` handling in `run` 3d and 3e.
- Insert the text in each Step exactly as written, character for character, including backticks, asterisks, arrows (`→`), em dashes (`—`), dollar signs, and section signs (`§`). Change nothing else in the file: no rewording, no reformatting, no other lines. When a Step says "insert ... directly after X", the new text starts on its own line directly below X; blank lines are exactly as the Step describes.
- Literal text to write sits in a fenced block that starts at column 0, directly below the Step that uses it. Write the block's content exactly, without its outer fence and with no added indentation. Where the outer fence is four backticks, every three-backtick fence inside it is part of the text to write.
- New agent frontmatter must parse as YAML (spec §1.5). The frontmatter in M06-T01 and the description in M06-T04 are already valid; copy them exactly.
- Don't touch `agents/reviewer.md`, the worker agents, `skills/plan/SKILL.md`, `skills/status/SKILL.md`, or anything about the plan review, tier calibration, the Batch field definition, or assumptions (M07–M10). The `plan-reviewer` reader-list entry and the `-plan-review.md` notes file belong to M07.
- Every task edits a different file and no task reads another task's file, so all five run in one wave.

Waves: 1 (widths 5)

## Tasks

### M06-T01: Add the milestone-reviewer agent

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/milestone-reviewer.md`
- Verify: `grep -qxF "name: milestone-reviewer" plugins/orchestratinator/agents/milestone-reviewer.md && grep -qxF "maxTurns: 60" plugins/orchestratinator/agents/milestone-reviewer.md && grep -qxF "disallowedTools: Edit" plugins/orchestratinator/agents/milestone-reviewer.md && grep -qF "They do not govern git." plugins/orchestratinator/agents/milestone-reviewer.md && grep -qF "or they have identical content, read it once." plugins/orchestratinator/agents/milestone-reviewer.md && grep -qxF "Re-review: fixes only" plugins/orchestratinator/agents/milestone-reviewer.md && grep -qxF "STATUS: APPROVED | FINDINGS" plugins/orchestratinator/agents/milestone-reviewer.md`
- Commit: `feat(orchestratinator): add the milestone-reviewer agent`

**Objective**

`agents/milestone-reviewer.md` exists: an Opus / high, read-only-except-its-report agent that reviews a finished milestone's whole diff against spec §7's five checks, re-reviews the fix round, and writes its report in the D21 layout.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §7 (the agent this task creates) and §2 (the precedence-rule requirement)
- plan.md Decisions D05, D10, D21, D37, D38
- `plugins/orchestratinator/agents/scout.md` (the frontmatter shape and the precedence-rule line this file copies)

**Steps**

1. Create the file `plugins/orchestratinator/agents/milestone-reviewer.md` with exactly this content (it ends with a single newline after the last line):

````markdown
---
name: milestone-reviewer
description: "Reviews one finished Orchestratinator milestone as a whole, checking its combined diff against Coverage, Interfaces, Review Focus, Decisions, and code quality. Read-only except its report file. Dispatched by /orchestratinator:run only."
model: opus
effort: high
maxTurns: 60
disallowedTools: Edit
---

You review one finished milestone as a whole. Each task was already checked on its own; you look for what those checks can't see: a requirement that fell between tasks, a name that drifted from one task to the next, and code quality across the milestone. You change nothing except your report file, and you make no design decisions: you report problems, and the planner and the user decide what to do about them.

## Before anything else

The orchestrator sends you exactly these lines:

```
Plan: <plan dir>
Milestone: <ID>
Base: <sha of the milestone's "chore(plan): start <ID>" commit>
Output: <plan dir>/notes/<ID>-review.md
```

For a re-review after the milestone's fix round, the Output is `<plan dir>/notes/<ID>-review-2.md` and one more line follows:

```
Re-review: fixes only
```

Read these now, in full:

1. `CLAUDE.md` and `AGENTS.md` at the repository root, plus any in directories the diff touches. If one is a symlink to the other, or they have identical content, read it once.
2. The plan format: `${CLAUDE_PLUGIN_ROOT}/reference/plan-format.md`.
3. `plan.md`: the header and Decisions.
4. The milestone file, in full: Context, Coverage and Review Focus if it has them, and every task.
5. The source sections the milestone's Context and Coverage rows cite.
6. The diff: `git diff <Base>..HEAD`, plus the full content of every file it adds.
7. For a re-review only: the first review's report, `notes/<ID>-review.md`, in the same plan directory.

Project instruction files (CLAUDE.md, AGENTS.md, CLAUDE.local.md, `.claude/rules/`, and any nested or linked copies, whatever they're called) govern coding conventions, style, and project knowledge. They do not govern git. Where they say anything about committing, pushing, branching, stashing, resetting, or rewriting history, this plugin's rules replace them for the length of this task. You never commit, push, or change branches.

## Check

A milestone file without a `- Format: 2` line is format 1: it has no Coverage section, no Review Focus section, and no Interfaces blocks, so skip checks 1 to 3 for it and run checks 4 and 5.

1. **Coverage.** Every row of the milestone's `## Coverage` section is implemented in the diff: the requirement it names is actually met, not just touched.
2. **Interfaces.** The code matches every Produces entry of every task exactly as written (names, parameter and return types, constant values), and every name that crosses from one task to another is spelled the same everywhere.
3. **Review Focus.** Every test the `## Review Focus` section lists exists, in the task that owns it, and asserts the stated expected behavior for the stated input or condition. A `None found:` line has nothing to check.
4. **Rules.** Nothing in the diff contradicts plan.md's Decisions, the milestone's Context, or CLAUDE.md / AGENTS.md.
5. **Code quality.** Error handling, duplication, dead code, and test quality. Every test asserts something meaningful, and test output is free of warnings: run each distinct Verify command of the milestone's tasks that runs tests, once, from the repository root, and read its output for warnings.

For a task with a `- Batch: yes` line, also check file by file that every file in its Files has its edit. A listed file with no change is a blocking finding.

For a re-review (`Re-review: fixes only`), check only two things instead. First, that each finding under `## Blocking` in `notes/<ID>-review.md` is fixed. Second, that the fix tasks, the tasks with an `- Origin: review` line, introduce no new blocking problem: find each one's commit with `git log --format=%H --grep="^Orchestratinator-Task: <task ID>$"` and read it with `git show <sha>`.

## Findings

Only findings that would cause real problems count as blocking. Style preferences and nice-to-haves are advisory. Every finding cites `path:line` and the task, Coverage row, or Decision involved. Judge against what the milestone asked for, not against what you would have built.

## Report

Write the report to the Output path. It is the only file you may create or change. It has exactly two sections, each finding on one line:

```
## Blocking

- `path:line` — <problem> (<task ID, Coverage row, or D<nn>>)

## Advisory

- `path:line` — <problem> (<task ID, Coverage row, or D<nn>>)
```

A section with no findings says `None.` instead.

Then reply with exactly this block and nothing else:

```
STATUS: APPROVED | FINDINGS
BLOCKING: <count>
ADVISORY: <count>
```

`APPROVED` means both sections say `None.`; any finding at all makes it `FINDINGS`.
````

2. Compare the precedence-rule paragraph in the new file (it begins `Project instruction files (CLAUDE.md,`) with line 16 of `plugins/orchestratinator/agents/scout.md`. They must be identical, character for character. If they differ, change the new file's paragraph to match `scout.md` line 16 exactly.

**Done when**

- `plugins/orchestratinator/agents/milestone-reviewer.md` has exactly the Step 1 content, and its precedence-rule paragraph is identical to `agents/scout.md` line 16.
- The frontmatter has `name: milestone-reviewer`, `model: opus`, `effort: high`, `maxTurns: 60`, `disallowedTools: Edit`, and a double-quoted description.
- No other file changed.

### M06-T02: Document Origin and the review notes in the plan format

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/reference/plan-format.md`
- Verify: `grep -qF -e "- **milestone-reviewer** (agent), which reviews each finished milestone against it," plugins/orchestratinator/reference/plan-format.md && grep -qF "and milestone reviews (<milestone-id>-review.md, <milestone-id>-review-2.md)" plugins/orchestratinator/reference/plan-format.md && grep -qxF -e "- Origin: review" plugins/orchestratinator/reference/plan-format.md && grep -qF "| Origin | Only on a fix task" plugins/orchestratinator/reference/plan-format.md`
- Commit: `feat(orchestratinator): document Origin and review notes in the plan format`

**Objective**

`plan-format.md` lists `milestone-reviewer` among its readers, lists the milestone review notes files in the directory tree, and shows and defines the `- Origin: review` task field.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §7 (fix tasks and their `- Origin: review` line)
- plan.md Decisions D03, D08, D10, D24

**Steps**

1. In `plugins/orchestratinator/reference/plan-format.md`, near the top, find the line `- **planner** (agent), which details outlined milestones during a run,`. Directly after it, insert this line (the `- **workers** and **reviewer** (agents)` line stays below it, as the last item of the list):

```
- **milestone-reviewer** (agent), which reviews each finished milestone against it,
```

2. Under `## Directory`, find the line that begins `├── notes/`. In that line, replace the text `(<task-id>.md) and scout surveys (<milestone-id>-survey*.md)` with this text (the part of the line before it, including its spacing, stays unchanged):

```
(<task-id>.md), scout surveys (<milestone-id>-survey*.md), and milestone reviews (<milestone-id>-review.md, <milestone-id>-review-2.md)
```

3. In the milestone file template (the code block under `## Milestone file`), find the line ``- Commit: `<type>(<scope>): <message>` `` (the only line in the file that begins `- Commit: `). Directly after it, insert this line (the blank line and `**Objective**` stay below it):

```
- Origin: review
```

4. Under `### Task fields`, find the table row that begins `| Commit |`. Directly after it, insert this row (the row that begins `| Objective |` stays below it):

```
| Origin | Only on a fix task: every task the planner appends to a milestone after a milestone review finds blocking problems has the line `- Origin: review`, directly after Commit. No other task has an Origin line. A milestone with any `- Origin: review` task has used its one fix round, so run goes straight to the re-review. |
```

**Done when**

- The reader list at the top has the `milestone-reviewer` bullet between the `planner` bullet and the `workers` bullet.
- The `notes/` line of the directory tree lists `<milestone-id>-review.md` and `<milestone-id>-review-2.md`, and its column alignment is unchanged.
- The template has `- Origin: review` directly after its Commit line, and the Task fields table has the Origin row between the Commit and Objective rows.
- No other line in the file changed (`git diff` shows only these edits).

### M06-T03: run reviews each milestone before marking it done

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/skills/run/SKILL.md`
- Verify: `grep -qF "taking the oldest match (the last line printed)" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "Fix findings: <plan dir>/notes/<ID>-review.md" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "Output: <plan dir>/notes/<ID>-review-2.md" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "has already used its one fix round" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "chore(plan): fix tasks <ID>" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "chore(plan): re-review <ID>" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "9. Otherwise continue with the next milestone." plugins/orchestratinator/skills/run/SKILL.md`
- Commit: `feat(orchestratinator): run reviews each milestone before marking it done`
- Process: worker committed on its own; reset and recommitted

**Objective**

`run` 3f dispatches `milestone-reviewer` after Milestone verify and before marking the milestone done, with one fix round by the planner, a re-review, and a `REVIEW` stop if blocking findings remain.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §7, the `run` skill steps (the requirement this task implements)
- plan.md Decisions D05, D10, D22, D34, D35, D36
- `plugins/orchestratinator/skills/run/SKILL.md` §3a item 1 (the survey dispatch and commit pattern the new items follow)

**Steps**

1. In `plugins/orchestratinator/skills/run/SKILL.md`, find the line `### 3f. Finish the milestone` and the line `## 4. Finish the plan`. Replace every line from `### 3f. Finish the milestone` down to, but not including, the blank line directly above `## 4. Finish the plan` with exactly this text (the blank line and `## 4. Finish the plan` stay as they are):

````markdown
### 3f. Finish the milestone

1. Run the Milestone verify command in MAIN, if any. On failure, mark the milestone `blocked` and go to **Stop**. Don't retry: a cross-task failure needs the user.
2. **Review.** Every milestone is reviewed, whatever its format. Find its **Base**: `git log --format=%H --grep="^chore(plan): start <ID>$"`, taking the oldest match (the last line printed). If any task in the milestone has an `- Origin: review` line, the milestone has already used its one fix round: go straight to item 5. Otherwise invoke the agent `orchestratinator:milestone-reviewer` with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Base: <Base>
   Output: <plan dir>/notes/<ID>-review.md
   ```
   Don't read the report yourself: it's for the planner. If `git status --porcelain` prints nothing, the report is unchanged from an earlier, interrupted attempt: skip the commit. Otherwise check scope (`git status --porcelain` may show only that file; anything else → **Stop**), then commit it: `git add -A` and `git commit -m "chore(plan): review <ID>"`.
3. If it reports `APPROVED`, or `FINDINGS` with `BLOCKING: 0`, go to item 7. Advisory findings don't hold the milestone up.
4. **Fix round.** For blocking findings, invoke the agent `orchestratinator:planner` with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Fix findings: <plan dir>/notes/<ID>-review.md
   ```
   - `BLOCKED` / `GAP`: handle it as in 3a item 4.
   - `DONE`: check scope (`git status --porcelain` may show only plan.md and this milestone's file; anything else → **Stop**), then commit: `git add -A` and `git commit -m "chore(plan): fix tasks <ID>"`. Run the validation checklist on the milestone; any failure → mark it `blocked` with the failures and go to **Stop**. Run the fix tasks through the wave loop (**3c**), then go on to item 5. The `detail` gate doesn't pause for fix tasks.
5. **Re-review.** Run the Milestone verify command in MAIN again, if any, handling a failure as in item 1. Then invoke `orchestratinator:milestone-reviewer` with the same Base and exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Base: <Base>
   Output: <plan dir>/notes/<ID>-review-2.md
   Re-review: fixes only
   ```
   Don't read the report yourself. Skip the commit, or check scope and commit, as in item 2, with `git commit -m "chore(plan): re-review <ID>"`.
6. If the re-review reports `BLOCKING` above 0, mark the milestone `blocked` and go to **Stop** with reason `REVIEW`. There is only one fix round per milestone.
7. Set the milestone to `done` in its file and in the plan.md table. Commit: `chore(plan): complete <ID>`.
8. If `--milestone` was given, go to **Pause**. If Gates includes `milestone`, go to **Pause**, telling the user to review and rerun.
9. Otherwise continue with the next milestone.
````

**Done when**

- Section 3f has exactly the nine items of Step 1, with its three dispatch blocks indented three spaces under their items, and `## 4. Finish the plan` still follows after one blank line.
- Items 1, 7, 8, and 9 carry the old items 1, 2, 3, and 4 unchanged apart from their numbers.
- No line outside section 3f changed: 3a to 3e, the Stop reason list, Retry, Block with GAP, Pause, and Stop are untouched.

### M06-T04: planner writes fix tasks for review findings

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/planner.md`
- Verify: `grep -qxF "## Fix findings mode" plugins/orchestratinator/agents/planner.md && grep -qF "and writes fix tasks when a milestone review finds blocking problems. Dispatched by" plugins/orchestratinator/agents/planner.md && grep -qF "There is no scout round in this mode" plugins/orchestratinator/agents/planner.md && grep -qF "Give each the line" plugins/orchestratinator/agents/planner.md && grep -qF "In Fix findings mode, edit only what that section allows." plugins/orchestratinator/agents/planner.md`
- Commit: `feat(orchestratinator): planner writes fix tasks for review findings`
- Process: worker committed on its own; reset and recommitted

**Objective**

The planner has a `Fix findings:` mode that appends `- Origin: review` fix tasks for a milestone review's blocking findings, in the milestone's own format, and reports a design decision as a GAP.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §7, step 3 of the `run` steps and the **`planner`** paragraph (the requirement this task implements)
- plan.md Decisions D10, D21, D34

**Steps**

1. In `plugins/orchestratinator/agents/planner.md`, in the frontmatter, find the line that begins `description: Details one outlined milestone`. Replace that whole line with this line:

```
description: Details one outlined milestone of an Orchestratinator plan into small tiered tasks, using the code and findings that exist now, and writes fix tasks when a milestone review finds blocking problems. Dispatched by /orchestratinator:run only.
```

2. Find the line that begins `You turn one`. At the end of that same line, after `You don't implement anything.`, append a space and this sentence (the paragraph stays one line):

```
When a milestone review finds blocking problems in a milestone whose tasks have run, you write its fix tasks instead (see "Fix findings mode").
```

3. Find the line `## Write`. Directly before it, insert these eleven lines followed by one blank line (so the new section sits between the `## Self-check` section and `## Write`, with one blank line on each side):

```
## Fix findings mode

If the orchestrator's message has the extra line `Fix findings: <path>`, the milestone is already `in-progress` and its tasks have run: a milestone review found blocking problems, and your job is to write fix tasks for them, not to detail the milestone. In this mode:

1. Besides what "Before anything else" lists, read the whole milestone file and the review report at `<path>`. Fix only the findings under its `## Blocking` heading; `## Advisory` findings are not fixed. Each finding cites a `path:line`: read the code it cites yourself. There is no scout round in this mode, so never report `SCOUT`.
2. Write one or more fix tasks for each blocking finding, under every rule in this file and the plan format: tasks are prompts, the sizing rules, the tier rubric, sequencing and parallelism, and the self-check.
3. A finding whose fix needs a design decision is a GAP: write no fix tasks, report `BLOCKED` / `GAP`, and write the question to Open questions, as in "Find every problem".
4. Append the fix tasks after the milestone's last task, numbering them on from its last task ID, with `- Status: todo`. Their waves start at one more than the milestone's current last wave. Give each the line `- Origin: review`, directly after its `- Commit:` line.
5. Write them in the milestone's own format: if the milestone file has a `- Format: 2` line, with the Interfaces block and Fails first line format 2 requires; if it has none, as format 1 tasks, with neither.
6. Update the Waves line in Context to the milestone's whole wave shape, fix waves included. Change nothing else in the milestone file: its Status, Format line, Coverage, Review Focus, and existing tasks stay as they are. In plan.md, edit only Decisions and Open questions.
7. Report as in "Report", with TASKS and WAVES counting only the fix tasks.
```

4. Under `## Write`, find the paragraph that begins `Edit only two files:`. At the end of that same line, after `Don't commit.`, append a space and this sentence (the paragraph stays one line):

```
In Fix findings mode, edit only what that section allows.
```

**Done when**

- The frontmatter description is the Step 1 line and the frontmatter still has `name`, `model: opus`, `effort: high`, and `maxTurns: 60` unchanged.
- The opening paragraph ends with the Step 2 sentence and is still one line.
- A `## Fix findings mode` section with the Step 3 text sits between `## Self-check` and `## Write`, with one blank line on each side.
- The `Edit only two files:` paragraph ends with the Step 4 sentence and is still one line; the Change 0 paragraph above it, the `## Report` block, and every other line are unchanged.

### M06-T05: README describes the milestone review

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/README.md`
- Verify: `grep -qF "Read-only except its report: reviews each finished milestone's whole diff" plugins/orchestratinator/README.md && grep -qF "working from a scout's survey. Writes fix tasks when a milestone review finds blocking problems." plugins/orchestratinator/README.md && grep -qF -e "- **Every milestone is reviewed as a whole.** " plugins/orchestratinator/README.md && grep -qF "for a GAP the planner hit while detailing a milestone" plugins/orchestratinator/README.md`
- Commit: `docs(orchestratinator): describe the milestone review in the README`
- Process: worker committed on its own; reset and recommitted

**Objective**

The README's cast table has a `milestone-reviewer` row and a planner row that mentions fix tasks, "How a run behaves" has a milestone-review bullet, and the resume steps send only a detailing GAP back to `outline`.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §7 (the feature these lines describe)
- plan.md Decisions D34, D36

**Steps**

1. In `plugins/orchestratinator/README.md`, under `### The cast`, find the table row that begins ``| `planner` |``. In that row, replace the text `working from a scout's survey. |` with this text:

```
working from a scout's survey. Writes fix tasks when a milestone review finds blocking problems. |
```

2. In the same table, find the row that begins ``| `reviewer` |``. Directly after it, insert this row (the row that begins ``| `worker-light` |`` stays below it):

```
| `milestone-reviewer` | Opus / high | Read-only except its report: reviews each finished milestone's whole diff before the milestone is marked done. |
```

3. Under `### How a run behaves`, find the bullet that begins `- **Commit per task.**`. Directly after it, insert this bullet as a new line (the bullet that begins `- **One retry, one tier up.**` stays below it):

```
- **Every milestone is reviewed as a whole.** Per-task checks can't see problems between tasks, so once a milestone's tasks are done and its Milestone verify passes, the Opus `milestone-reviewer` reviews the milestone's whole diff: every Coverage requirement implemented, the code matching every task's Interfaces, every Review Focus test present and asserting its behavior, nothing contradicting the Decisions, the milestone's Context, or CLAUDE.md / AGENTS.md, and code quality (error handling, duplication, dead code, and tests that assert something meaningful and run without warnings). It writes its findings to `notes/<ID>-review.md`, each citing a `path:line`, as blocking or advisory. Advisory findings don't hold the milestone up. Blocking findings get one fix round: the planner writes fix tasks, which run without pausing at the `detail` gate, then Milestone verify runs again and a re-review checks the fixes. If anything is still blocking, the run stops with `REVIEW`, and a fix that needs a design decision stops it with a question. Format 1 milestones are reviewed too, without the checks for sections they don't have.
```

4. Under `### Resuming after a stop`, find the line that begins `3. Set the blocked task or milestone back to`. In that line, replace the text ``(or `outline` for a planner GAP)`` with this text:

```
(or `outline` for a GAP the planner hit while detailing a milestone)
```

**Done when**

- The cast table's `planner` row ends with the Step 1 sentence, and the `milestone-reviewer` row sits between the `reviewer` and `worker-light` rows.
- The new bullet sits between the `Commit per task.` and `One retry, one tier up.` bullets.
- Resume step 3 has the Step 4 text and is otherwise unchanged.
- No other line in the file changed.
