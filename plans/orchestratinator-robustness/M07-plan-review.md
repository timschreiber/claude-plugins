# M07: Change 6: Fresh-eyes plan review (spec §8)

- Status: in-progress
- Goal: A new `plan-reviewer` agent checks detailed milestones against the plan format. `plan` dispatches it once per detailed milestone after writing the plan directory, fixes each issue once, and reports the count in the handoff. `run` 3a dispatches it after the planner reports DONE, with one planner fix pass. The README cast table and plan-format reader list include it.
- Depends on: M06
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §8, the review sentence of §13 ("apply to every milestone, whatever its format"), and §2's requirement for new agents; plus D01, D03, D09, D10b, D10e, D16, D17, D21, D24, and D39–D42 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). This milestone file gets no Coverage or Review Focus section. Never modify Change 0 text (D17), including the precedence-rule paragraph under the planner's `## Write`.
- Insert the text in each Step exactly as written, character for character, including backticks, asterisks, arrows (`→`), em dashes (`—`), dollar signs, and section signs (`§`). Change nothing else in the file: no rewording, no reformatting, no other lines. When a Step says "insert ... directly after X", the new text starts on its own line directly below X; blank lines are exactly as the Step describes.
- Literal text to write sits in a fenced block that starts at column 0, directly below the Step that uses it. Write the block's content exactly, without its outer fence and with no added indentation. Where the outer fence is four backticks, every three-backtick fence inside it is part of the text to write.
- New agent frontmatter must parse as YAML (spec §1.5). The frontmatter in M07-T01 is already valid; copy it exactly.
- `run` folds the plan review into 3a item 5, so 3a keeps its eight items and every "3a item 4" reference elsewhere stays correct. On a GAP from the planner's plan-review fix pass, the planner leaves the milestone file as it is and `run` restores the committed outline (D42).
- The unsourced-assumptions check (§8 bullet "unsourced assumptions, per §11") belongs to M10, and the tier rubric's calibration notes to M08; neither is added here. Don't touch `agents/milestone-reviewer.md`, `agents/reviewer.md`, the worker agents, or `skills/status/SKILL.md`.
- Don't run `git commit` or any other git command that changes history or branches: run commits each task for you.
- Every task edits a different file and no task reads another task's file, so all six run in one wave.

Waves: 1 (widths 6)

## Tasks

### M07-T01: Add the plan-reviewer agent

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/plan-reviewer.md`
- Verify: `grep -qxF "name: plan-reviewer" plugins/orchestratinator/agents/plan-reviewer.md && grep -qxF "model: sonnet" plugins/orchestratinator/agents/plan-reviewer.md && grep -qxF "effort: high" plugins/orchestratinator/agents/plan-reviewer.md && grep -qxF "maxTurns: 40" plugins/orchestratinator/agents/plan-reviewer.md && grep -qxF "disallowedTools: Edit" plugins/orchestratinator/agents/plan-reviewer.md && grep -qF "They do not govern git." plugins/orchestratinator/agents/plan-reviewer.md && grep -qF "or they have identical content, read it once." plugins/orchestratinator/agents/plan-reviewer.md && grep -qF "Approve unless there are real gaps." plugins/orchestratinator/agents/plan-reviewer.md && grep -qxF "STATUS: APPROVED | ISSUES" plugins/orchestratinator/agents/plan-reviewer.md && grep -qxF "ISSUES: <count>" plugins/orchestratinator/agents/plan-reviewer.md`
- Commit: `feat(orchestratinator): add the plan-reviewer agent`
- Process: worker committed on its own; reset and recommitted

**Objective**

`agents/plan-reviewer.md` exists: a Sonnet / high, read-only-except-its-report agent that checks one detailed milestone against the plan format for every spec §8 check except unsourced assumptions, and writes its report in the D21 layout.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §8 (the agent this task creates) and §2 (the precedence-rule requirement)
- plan.md Decisions D09, D10e, D21
- `plugins/orchestratinator/agents/scout.md` (the frontmatter shape and the precedence-rule line this file copies)

**Steps**

1. Create the file `plugins/orchestratinator/agents/plan-reviewer.md` with exactly this content (it ends with a single newline after the last line):

````markdown
---
name: plan-reviewer
description: "Reviews one detailed Orchestratinator milestone with fresh eyes before any of it runs, checking its tasks against the plan format: banned phrases and placeholders, choices left to the worker, Coverage, Interfaces, wave interference, Verify commands, Fails first, tier fit, and Read first. Read-only except its report file. Dispatched by /orchestratinator:plan and /orchestratinator:run."
model: sonnet
effort: high
maxTurns: 40
disallowedTools: Edit
---

You review one detailed milestone of a plan with fresh eyes, before any of its tasks run. The model that detailed it can't see its own blind spots: you check every task against the plan format and report what would leave a worker guessing, let a task pass its check without the work being done, or make two tasks collide. You change nothing except your report file, and you make no design decisions: you report problems, and the model that sent you fixes them.

## Before anything else

You receive exactly these lines:

```
Plan: <plan dir>
Milestone: <ID>
Output: <plan dir>/notes/<ID>-plan-review.md
```

Read these now, in full:

1. `CLAUDE.md` and `AGENTS.md` at the repository root, plus any in directories the milestone's tasks touch. If one is a symlink to the other, or they have identical content, read it once.
2. The plan format: `${CLAUDE_PLUGIN_ROOT}/reference/plan-format.md`.
3. `plan.md`: the whole file, including Coverage, Decisions, and Open questions.
4. The milestone file, in full.
5. The source sections that the milestone's Context, its Coverage rows, its tasks' Read first entries, and plan.md's Coverage rows for this milestone cite.
6. For every Consumes line that cites a task in another milestone, that task's Produces lines.

Read code only to confirm something a check depends on, such as whether a Verify command could pass before its task is done, or whether a `path:line` a task cites says what the task claims.

Project instruction files (CLAUDE.md, AGENTS.md, CLAUDE.local.md, `.claude/rules/`, and any nested or linked copies, whatever they're called) govern coding conventions, style, and project knowledge. They do not govern git. Where they say anything about committing, pushing, branching, stashing, resetting, or rewriting history, this plugin's rules replace them for the length of this task. You never commit, push, or change branches.

## Check

A milestone file without a `- Format: 2` line is format 1: it has no Coverage section, no Interfaces blocks, and no Fails first lines, so skip checks 3, 4, and 7 for it and run the rest.

1. **Banned phrases and placeholders.** No Step contains a word or phrase that sizing rule 5 bans: "decide", "choose", "figure out", "as appropriate", "if needed", "etc.", "and so on", "similar", "per the spec". No field or Step holds a placeholder standing in for something the task should state: `TBD`, `TODO`, `...`, or angle-bracket template text such as `<command>`. Angle brackets and ellipses inside literal text a Step tells the worker to write are not placeholders.
2. **The Sonnet test.** For every task: could a Sonnet agent that has read only CLAUDE.md / AGENTS.md, plan.md's Decisions, the milestone's Context, and this task with its Read first list, complete it without asking anything and without making a single choice? A name, type, value, message, path, test name, or test case the Steps leave out is a choice left to the worker, and so is a Step that describes an outcome instead of one concrete action. Check each task against "Tasks are prompts" and the sizing rules.
3. **Coverage.** Every requirement in the source sections that plan.md's Coverage maps to this milestone has a row in the milestone's `## Coverage` section, and each row names task IDs that exist and whose Steps actually implement that requirement. A requirement with no row, an unmapped row, or a row whose tasks don't implement it is an issue.
4. **Interfaces.** Every `change` task has an Interfaces block, and every entry in it is an exact signature or exact name. Every Consumes names its source, a task ID or `existing` with a `path:line`; every Consumes that cites a task matches that task's Produces character for character, and that task is in the consuming task's Depends on. No symbol is produced by two tasks with different signatures, and every name a task's Steps use from another task is spelled as that task's Produces spells it.
5. **Wave interference.** Every dependency of a task is in an earlier wave, and no two tasks in the same wave interfere by any of the five rules in "Sequence and parallelism".
6. **Verify.** Every Verify command runs from the repository root, is targeted at what its task changes, is quiet, and would fail if the task were not done. A command that already passes on the code as it is, or that checks nothing the task changes, is an issue. `review` alone is used only where no command could check the result.
7. **Fails first.** Every `change` task has a Fails first line directly after Verify, and no `investigate` task has one. Every task that adds or changes tests is `yes`, with its test-writing Steps first, then the step "Run Verify and confirm it fails", then its implementation Steps. Every `no` gives a one-line reason, and the task really has no test that could fail beforehand. A task whose Verify is `review` alone is `no`.
8. **Tier fit.** Each task's Tier fits the tier rubric in the plan format, including the notes under its table: fully specified work is `worker`, and any other tier matches what the rubric says that tier is for. Every `worker-heavy` and `specialist` task has a Why this tier line that fits the rubric, and no more than about one task in ten is `specialist`.
9. **Read first.** Every entry names a section, a Decision, a note, or a pattern file to copy, not a whole document, and a task has at most about five entries. A spec or other long document named without a section is an issue.

## Calibration

Approve unless there are real gaps. An issue is something that would leave a worker asking or choosing, let a task pass Verify without its work being done, make two tasks collide, or break a rule of the plan format. Style preferences, and wording you would have written differently, are not issues. Judge against the plan format, the sources, and the Decisions, not against how you would have planned the milestone.

## Report

Write the report to the Output path. It is the only file you may create or change. It has exactly one section, a numbered list with one issue per item:

```
## Issues

1. <task or milestone ID> — <which check> — <problem, quoting the text involved>
```

With no issues, the section says `None.` instead.

Then reply with exactly this block and nothing else:

```
STATUS: APPROVED | ISSUES
ISSUES: <count>
```

`APPROVED` means the section says `None.` and the count is 0; any issue at all makes it `ISSUES`.
````

2. Compare the precedence-rule paragraph in the new file (it begins `Project instruction files (CLAUDE.md,`) with line 16 of `plugins/orchestratinator/agents/scout.md`. They must be identical, character for character. If they differ, change the new file's paragraph to match `scout.md` line 16 exactly.

**Done when**

- `plugins/orchestratinator/agents/plan-reviewer.md` has exactly the Step 1 content, and its precedence-rule paragraph is identical to `agents/scout.md` line 16.
- The frontmatter has `name: plan-reviewer`, `model: sonnet`, `effort: high`, `maxTurns: 40`, `disallowedTools: Edit`, and a double-quoted description.
- No other file changed.

### M07-T02: plan reviews every detailed milestone before the handoff

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/skills/plan/SKILL.md`
- Verify: `grep -qF "orchestratinator:plan-reviewer" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "Output: <plan dir>/notes/<ID>-plan-review.md" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "There is no re-review. After this one fix pass" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF -e "- Plan review: issues found and issues fixed" plugins/orchestratinator/skills/plan/SKILL.md`
- Commit: `feat(orchestratinator): plan reviews every detailed milestone before the handoff`

**Objective**

`plan` step 11 dispatches `plan-reviewer` on every detailed milestone after writing the plan directory, fixes each issue once with no re-review, and reports the issue totals in the handoff.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §8, the **`plan` skill** paragraph (the requirement this task implements)
- plan.md Decisions D09, D41

**Steps**

1. In `plugins/orchestratinator/skills/plan/SKILL.md`, under `## 11. Write and hand off`, find the paragraph that begins `Write the plan directory (default`. Directly after it, insert one blank line and then this text, so that one blank line separates it from the line `Reply to the user with only:` below it:

````markdown
Then have every detailed milestone reviewed with fresh eyes. Invoke the agent `orchestratinator:plan-reviewer` once for each detailed milestone, all in one message so they run at the same time, each with exactly:

```
Plan: <plan dir>
Milestone: <ID>
Output: <plan dir>/notes/<ID>-plan-review.md
```

Each reviewer writes its issues to its Output file and replies `APPROVED` or `ISSUES`, with a count. For each milestone whose reviewer replied `ISSUES`, read its report and fix every issue it lists yourself, once, under the same rules you wrote the milestone by in steps 6 to 9. An issue whose fix needs a design decision is a question for the user: ask it as in step 5, and record the answer as a Decision before you make the fix. There is no re-review. After this one fix pass, run the validation checklist again on every milestone you changed, and fix every failure. A job done directly (step 10) writes no plan directory, so it gets no plan review.
````

2. In the same section, find the line `- For each detailed milestone: task count by tier, and its wave shape.`. Directly after it, insert this line (the line that begins `- Detailing, Gates, Parallel,` stays below it):

```
- Plan review: issues found and issues fixed, as totals across all detailed milestones.
```

**Done when**

- Step 11 has the Step 1 text between the `Write the plan directory` paragraph and `Reply to the user with only:`, with one blank line on each side and the dispatch block fenced with three backticks.
- The handoff list has the `- Plan review:` bullet between the `For each detailed milestone` bullet and the `Detailing, Gates, Parallel` bullet.
- No other line in the file changed: steps 1 to 10 and the step numbers are untouched.

### M07-T03: run reviews each milestone the planner details

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/skills/run/SKILL.md`
- Verify: `grep -qF "orchestratinator:plan-reviewer" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "Plan review: <plan dir>/notes/<ID>-plan-review.md" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "discard the detailed milestone file, restoring its committed outline" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "and its plan-review report, " plugins/orchestratinator/skills/run/SKILL.md && grep -qF "The plan-review report is committed here too, with no commit of its own." plugins/orchestratinator/skills/run/SKILL.md`
- Commit: `feat(orchestratinator): run reviews each milestone the planner details`

**Objective**

`run` 3a item 5 dispatches `plan-reviewer` after the planner reports `DONE`, gives the planner one `Plan review:` fix pass on `ISSUES`, restores the outline on a fix-pass GAP, and then validates; the scope check and detail commit include the plan-review report.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §8, the **`run` skill, in 3a** paragraph (the requirement this task implements)
- plan.md Decisions D09, D39, D40, D42

**Steps**

1. In `plugins/orchestratinator/skills/run/SKILL.md`, under `### 3a. Detail it if it's an outline`, find the line that begins `5. If it reports` and ends `go to **Stop**.` (it is the single line directly below item 4). Replace that one line with exactly this text (item `6. Check scope:` stays directly below it, with no blank line between):

````markdown
5. If it reports `DONE`: **Plan review.** Invoke the agent `orchestratinator:plan-reviewer` with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Output: <plan dir>/notes/<ID>-plan-review.md
   ```
   Don't read the report yourself: it's for the planner. If it reports `ISSUES`, invoke the agent `orchestratinator:planner` once more, with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Plan review: <plan dir>/notes/<ID>-plan-review.md
   ```
   There is one fix pass and no second review.
   - `BLOCKED` / `GAP`: discard the detailed milestone file, restoring its committed outline: `git checkout -- "<milestone file path>"`. Then handle it as in item 4. The plan-review report stays, and the Stop commits it.
   - `DONE`: go on.

   Once the plan review reports `APPROVED`, or the fix pass reports `DONE`, run the validation checklist on the milestone. Any failure → mark it `blocked` with the failures and go to **Stop**.
````

2. In the same section, find the line that begins `6. Check scope:`. In that line, replace the text `and this milestone's survey notes. Anything else` with this text:

```
this milestone's survey notes, and its plan-review report, `notes/<ID>-plan-review.md`. Anything else
```

3. In the same section, find the line that begins `7. Commit:`. At the end of that same line, after `as a record of what the planner worked from.`, append a space and this sentence (the item stays one line):

```
The plan-review report is committed here too, with no commit of its own.
```

**Done when**

- 3a still has exactly eight numbered items; item 5 is the Step 1 text, with its two dispatch blocks indented three spaces, and items 1 to 4 and 8 are unchanged.
- Item 6 lists the plan-review report in its scope check, and item 7 ends with the Step 3 sentence.
- No line outside section 3a changed: 3b to 3f, Retry, Block with GAP, Pause, and Stop are untouched.

### M07-T04: planner fixes plan-review issues

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/planner.md`
- Verify: `grep -qxF "## Plan review mode" plugins/orchestratinator/agents/planner.md && grep -qF "When a plan review finds issues in a milestone you have just detailed, you fix them" plugins/orchestratinator/agents/planner.md && grep -qF "Leave the milestone file as it is; run discards it and restores the outline." plugins/orchestratinator/agents/planner.md && grep -qF "with TASKS and WAVES counting the whole milestone." plugins/orchestratinator/agents/planner.md && grep -qF "In Plan review mode, edit only what that section allows." plugins/orchestratinator/agents/planner.md`
- Commit: `feat(orchestratinator): planner fixes plan-review issues`

**Objective**

The planner has a `Plan review:` mode that fixes every issue in a plan-review report under the usual rules, never reports `SCOUT`, leaves the milestone file as it is on a GAP, and reports TASKS and WAVES for the whole milestone.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §8, the **`run` skill, in 3a** paragraph (the `Plan review: <path>` line this task handles)
- plan.md Decisions D21, D39, D42
- `plugins/orchestratinator/agents/planner.md` `## Fix findings mode` (the section pattern the new one follows)

**Steps**

1. In `plugins/orchestratinator/agents/planner.md`, find the line that begins `You turn one`. At the end of that same line, after `(see "Fix findings mode").`, append a space and this sentence (the paragraph stays one line):

```
When a plan review finds issues in a milestone you have just detailed, you fix them (see "Plan review mode").
```

2. Find the line `## Write`. Directly before it, insert these ten lines followed by one blank line (so the new section sits between the `## Fix findings mode` section and `## Write`, with one blank line on each side):

```
## Plan review mode

If the orchestrator's message has the extra line `Plan review: <path>`, you have just detailed this milestone, your work is not committed yet, and a plan reviewer has listed issues with it in the report at `<path>`. Your job is to fix them. In this mode:

1. Besides what "Before anything else" lists, read the whole milestone file as you left it and the report at `<path>`. Fix every issue listed under its `## Issues` heading. Read any code you need yourself. There is no scout round in this mode, so never report `SCOUT`.
2. Fix each issue under every rule in this file and the plan format: tasks are prompts, the sizing rules, the tier rubric, sequencing and parallelism, Coverage, Review Focus, and the self-check.
3. An issue whose fix needs a design decision is a GAP: report `BLOCKED` / `GAP` and write the question to Open questions, as in "Find every problem". Leave the milestone file as it is; run discards it and restores the outline.
4. Edit the same files detailing allows (see "Write"): this milestone's file, and plan.md's Decisions, Open questions, Coverage, and this milestone's table row. The milestone's Status stays `ready`.
5. There is no second review, so after your fixes, run the self-check and the validation checklist for this milestone again and fix every failure.
6. Report as in "Report", with TASKS and WAVES counting the whole milestone.
```

3. Under `## Write`, find the paragraph that begins `Edit only two files:`. At the end of that same line, after `In Fix findings mode, edit only what that section allows.`, append a space and this sentence (the paragraph stays one line):

```
In Plan review mode, edit only what that section allows.
```

**Done when**

- The opening paragraph ends with the Step 1 sentence and is still one line.
- A `## Plan review mode` section with the Step 2 text sits between the `## Fix findings mode` section and `## Write`, with one blank line on each side.
- The `Edit only two files:` paragraph ends with the Step 3 sentence and is still one line; the frontmatter, the Change 0 paragraph above it, the `## Fix findings mode` section, the `## Report` block, and every other line are unchanged.

### M07-T05: List plan-reviewer and its notes in the plan format

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/reference/plan-format.md`
- Verify: `grep -qF -e "- **plan-reviewer** (agent), which checks each detailed milestone against it before it runs," plugins/orchestratinator/reference/plan-format.md && grep -qF "milestone reviews (<milestone-id>-review.md, <milestone-id>-review-2.md), and plan reviews (<milestone-id>-plan-review.md)" plugins/orchestratinator/reference/plan-format.md`
- Commit: `feat(orchestratinator): list plan-reviewer and its notes in the plan format`

**Objective**

`plan-format.md` lists `plan-reviewer` among its readers and lists the plan-review notes file in the directory tree.

**Read first**

- plan.md Decisions D03, D24

**Steps**

1. In `plugins/orchestratinator/reference/plan-format.md`, near the top, find the line `- **planner** (agent), which details outlined milestones during a run,`. Directly after it, insert this line (the `- **milestone-reviewer** (agent)` line stays below it):

```
- **plan-reviewer** (agent), which checks each detailed milestone against it before it runs,
```

2. Under `## Directory`, find the line that begins `├── notes/`. In that line, replace the text `, and milestone reviews (<milestone-id>-review.md, <milestone-id>-review-2.md)` with this text (the part of the line before it, including its spacing, stays unchanged):

```
, milestone reviews (<milestone-id>-review.md, <milestone-id>-review-2.md), and plan reviews (<milestone-id>-plan-review.md)
```

**Done when**

- The reader list at the top has the `plan-reviewer` bullet between the `planner` bullet and the `milestone-reviewer` bullet.
- The `notes/` line of the directory tree ends with `and plan reviews (<milestone-id>-plan-review.md)`, and its column alignment is unchanged.
- No other line in the file changed (`git diff` shows only these two edits).

### M07-T06: README lists the plan-reviewer

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/README.md`
- Verify: `grep -qF "| Sonnet / high | Read-only except its report: checks each newly detailed milestone against the plan format before it runs" plugins/orchestratinator/README.md`
- Commit: `docs(orchestratinator): list the plan-reviewer in the README`

**Objective**

The README's cast table has a `plan-reviewer` row.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §8 (the agent this row describes)

**Steps**

1. In `plugins/orchestratinator/README.md`, under `### The cast`, find the table row that begins ``| `reviewer` |``. Directly after it, insert this row (the row that begins ``| `milestone-reviewer` |`` stays below it):

```
| `plan-reviewer` | Sonnet / high | Read-only except its report: checks each newly detailed milestone against the plan format before it runs, for `plan` and `run`. |
```

**Done when**

- The `plan-reviewer` row sits between the `reviewer` and `milestone-reviewer` rows.
- No other line in the file changed.
