# M03: Change 2: Spec coverage check (spec §4)

- Status: in-progress
- Goal: plan.md and every detailed format 2 milestone carry a Coverage section that maps requirements to milestones and tasks. The plan format defines both levels, the row format, and the checklist items. `plan` builds both levels in a new step. The planner builds the milestone level, and adds plan-level rows in format 1 plans. The README describes it.
- Depends on: M02
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §4 and the Coverage sentence of §13, plus D01, D04, D08, D16, D17, D18, D19, D27, D28 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). This milestone file gets no Coverage section. Never modify Change 0 text (D17).
- Insert the text in each Step exactly as written, character for character, including backticks, asterisks, arrows (`→`), and section signs (`§`). Change nothing else in the file: no rewording, no reformatting, no other lines. When a Step says "insert a new line after X", the new line goes on its own line directly below X, with no blank line between them unless the Step says so.
- Don't touch the `## Report` block of any agent, the README's cast table, or anything about Review Focus, Fails first, reviews, batching, or assumptions (later milestones). The milestone-reviewer's and plan-reviewer's Coverage checks belong to M06 and M07.
- M03-T02 and M03-T05 both edit `skills/plan/SKILL.md`; T05 runs after T02 has renumbered the steps.

Waves: 2 (widths 4, 1)

## Tasks

### M03-T01: Define Coverage in the plan format

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/reference/plan-format.md`
- Verify: `grep -qF "milestones, coverage, decisions, open questions" plugins/orchestratinator/reference/plan-format.md && grep -qF "out of scope (D01)" plugins/orchestratinator/reference/plan-format.md && grep -qF "<Only once the milestone is detailed:" plugins/orchestratinator/reference/plan-format.md && grep -qF "### Coverage" plugins/orchestratinator/reference/plan-format.md && grep -qF "Either way, no row is unmapped." plugins/orchestratinator/reference/plan-format.md && grep -qF "Every task ID in a Coverage row exists. *(format 2)*" plugins/orchestratinator/reference/plan-format.md`
- Commit: `feat(orchestratinator): define Coverage in the plan format`
- Process: worker committed on its own; reset and recommitted

**Objective**

`plan-format.md` shows a `## Coverage` section in both the plan.md and milestone templates, defines both coverage levels, "requirement", and the row format in a new Coverage subsection, and has three new validation checklist items.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §4, from "**Plan format.**" through "**Validation checklist:**" (the requirement this task implements)
- plan.md Decisions D04, D08, D27

**Steps**

1. In `plugins/orchestratinator/reference/plan-format.md`, in the directory tree under `## Directory`, find the line that ends `# index: header, settings, milestones, decisions, open questions`. In that line only, change `milestones, decisions, open questions` to `milestones, coverage, decisions, open questions`. Leave the spacing before `#` unchanged.
2. In the plan.md template (the code block under `## plan.md`), find the line `| M02 | <title> | outline | M02-<slug>.md |`. Directly after it, insert one blank line followed by these five lines (the existing blank line and `## Decisions` stay below them):

   ```
   ## Coverage

   - `docs/spec.md` §3: <requirement, briefly> → M01
   - `docs/spec.md` §4: <requirement, briefly> → M01, M02
   - `docs/spec.md` §5: <requirement, briefly> → out of scope (D01)
   ```

   The result reads: the `| M02 |` row, a blank line, `## Coverage`, a blank line, the three rows, a blank line, `## Decisions`.
3. In the milestone file template (the code block under `## Milestone file`), find the line `Waves: <count> (widths <w1>, <w2>, ...)`. Directly after it, insert one blank line followed by these five lines (the existing blank line and `## Outline` stay below them):

   ```
   ## Coverage

   <Only once the milestone is detailed: one row per requirement it implements, mapped to the task IDs that implement it.>

   - `docs/spec.md` §4.2: <requirement, briefly> → M02-T01, M02-T03
   ```

   The result reads: the `Waves:` line, a blank line, `## Coverage`, a blank line, the `<Only once ...>` line, a blank line, the row, a blank line, `## Outline`.
4. Find the line `### Task fields`. Directly before it, insert these twelve lines followed by one blank line (so the new subsection sits between the `### Format` paragraph and `### Task fields`, with one blank line on each side):

   ```
   ### Coverage

   Coverage maps every requirement to the work that implements it, at two levels, so a requirement can't fall between tasks unnoticed:

   - **plan.md**, `## Coverage`, between Milestones and Decisions: one row per section of every source (heading or numbered item), mapped to the milestone ID(s) that implement it, or `out of scope` with the Decision that says so.
   - **Milestone file**, `## Coverage`, directly after Context and its Waves line *(format 2)*: every detailed milestone has one, with one row per requirement the milestone implements, mapped to the task ID(s) that implement it. An `outline` milestone has none.

   A requirement is any normative statement: must, shall, should, a numbered acceptance criterion, or an explicit behavior. Trivially related statements may share a row.

   Each row is one line: `- <source> <location>: <requirement, briefly> → <task IDs | milestone ID | out of scope (D<nn>)>`. A row is mapped when its target is one or more task IDs (milestone level), one or more milestone IDs (plan level), or `out of scope (D<nn>)` citing the Decision that says so. Any other row is unmapped.

   `plan` builds both levels. The planner builds a milestone's Coverage when it details the milestone, from the plan-level rows that point at it. In a plan created under format 1, plan.md may have no rows for that milestone, or no Coverage section at all: the planner adds the plan-level rows for its own milestone, creating the section if needed. So a plan-level row for every section of every source is required only once every milestone in the plan is format 2.
   ```
5. In `## Validation checklist`, find the line `- [ ] No symbol is produced by two tasks with different signatures. *(format 2)*`. Directly after it (before the blank line and the sentence that begins `Items marked *(format 2)*`), insert these three lines:

   ```
   - [ ] plan.md's Coverage: when every milestone in the plan is format 2, plan.md has a `## Coverage` section with a row for every section of every source; otherwise, every format 2 milestone has at least one row in plan.md's `## Coverage` mapped to it. Either way, no row is unmapped.
   - [ ] A detailed milestone has a `## Coverage` section, directly after Context, with one row per requirement it implements and no unmapped row. *(format 2)*
   - [ ] Every task ID in a Coverage row exists. *(format 2)*
   ```

**Done when**

- The directory tree's plan.md comment lists `coverage` between `milestones` and `decisions`.
- The plan.md template has `## Coverage` with three rows between the Milestones table and `## Decisions`, separated by blank lines.
- The milestone template has `## Coverage` with its `<Only once ...>` line and one row between the `Waves:` line and `## Outline`, separated by blank lines.
- A `### Coverage` subsection sits between the `### Format` paragraph and `### Task fields`.
- The three checklist items sit directly after the `No symbol is produced` item, and the `Items marked *(format 2)*` sentence still follows the checklist after one blank line.
- No other line in the file changed (`git diff` shows only these additions and the one-line change from Step 1).

### M03-T02: Add the plan skill's coverage step and renumber the later steps

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/skills/plan/SKILL.md`
- Verify: `grep -qF "## 9. Check spec coverage" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "## 10. Size check: do small jobs directly" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "## 11. Write and hand off" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "which you do yourself (step 10)." plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "a small job directly (step 10). Without it" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "write the plan directory in step 11. If the job turns out small enough to do directly (step 10)," plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "write the plan (step 11)." plugins/orchestratinator/skills/plan/SKILL.md`
- Commit: `feat(orchestratinator): plan checks spec coverage`
- Process: worker committed on its own; reset and recommitted

**Objective**

The `plan` skill has a new step 9 that builds both coverage levels, directly after Self-check, and the size check and write-and-hand-off steps, and every reference to them, are renumbered to 10 and 11.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §4, the "**`plan` skill.**" paragraph (the requirement this task implements)
- plan.md Decision D19

**Steps**

1. In `plugins/orchestratinator/skills/plan/SKILL.md`, find the line `Then run the validation checklist from the plan format and fix every failure.` (the last line of `## 8. Self-check`). Directly after it, insert one blank line followed by these ten lines (the existing blank line and the `## 9. Size check: do small jobs directly` heading stay below them):

   ```
   ## 9. Check spec coverage

   A requirement that falls between tasks is the failure a plan is least likely to catch any other way. Build both coverage levels the plan format defines in its Coverage section, in your draft:

   - **plan.md:** one row per section of every source (heading or numbered item), mapped to the milestone(s) that implement it, or `out of scope (D<nn>)` citing the Decision that says so.
   - **Every detailed milestone:** one row per requirement it implements, mapped to the task IDs that implement it.

   A requirement with no task or milestone gets one added; sequence and self-check what you add as in steps 7 and 8. If a requirement seems deliberately out of scope, that is a question for the user, asked as in step 5, never a silent drop: mark it `out of scope` only once the user's answer is recorded as a Decision, and cite that Decision in the row.

   Then check the Coverage items of the validation checklist and fix every failure. Step 11 writes both levels into the plan.
   ```
2. Change the heading line `## 9. Size check: do small jobs directly` to `## 10. Size check: do small jobs directly`.
3. Change the heading line `## 10. Write and hand off` to `## 11. Write and hand off`.
4. In the line that begins `You write a plan. You do **not** implement anything`, change `which you do yourself (step 9).` to `which you do yourself (step 10).`.
5. In the line that begins `` - `--yes`: approval given in advance ``, change `a small job directly (step 9).` to `a small job directly (step 10).`.
6. In the line that begins `Write these files when you write the plan directory`, change `in step 10.` to `in step 11.`, and change `directly (step 9),` to `directly (step 10),`. The line becomes: `Write these files when you write the plan directory in step 11. If the job turns out small enough to do directly (step 10), there is no plan directory and nothing to save.`
7. In the line that begins `   - If they say "plan it"`, change `write the plan (step 10).` to `write the plan (step 11).`.

**Done when**

- The headings run `## 1.` through `## 11.` in order, with `## 9. Check spec coverage` between `## 8. Self-check` and `## 10. Size check: do small jobs directly`, separated from each by one blank line.
- No line in the file contains `step 9`; every former reference to the size check says step 10, and every former reference to write-and-hand-off says step 11. `Every question from step 5` and `Do the tasks you drafted in step 6, in the order from step 7` are unchanged.
- The frontmatter, the Change 0 sentences in the size-check step's item 5, and every other line are unchanged.

### M03-T03: planner builds Coverage

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/planner.md`
- Verify: `grep -qF "## Build the Coverage" plugins/orchestratinator/agents/planner.md && grep -qF "A row you can't map to this milestone's tasks is a GAP" plugins/orchestratinator/agents/planner.md && grep -qF "replace the Outline section with Tasks, add its" plugins/orchestratinator/agents/planner.md && grep -qF "(Decisions, Open questions, Coverage, and this milestone's table row" plugins/orchestratinator/agents/planner.md`
- Commit: `feat(orchestratinator): planner builds Coverage`

**Objective**

The planner builds the detailed milestone's Coverage section from the plan-level rows, adds plan-level rows in a plan created under format 1, reports an unmappable row as a GAP, and lists Coverage among the things it may edit.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §4, the "**`plan` skill.**" paragraph, its last sentence about `planner` (the requirement this task implements)
- `docs/orchestratinator-robustness-spec.md` §13, the bullet that begins "When the planner details an outlined milestone"
- plan.md Decision D28

**Steps**

1. In `plugins/orchestratinator/agents/planner.md`, find the line `## Self-check`. Directly before it, insert these five lines followed by one blank line (so the new section sits between the `## Sequence and find the parallelism` paragraph and `## Self-check`, with one blank line on each side):

   ```
   ## Build the Coverage

   If this milestone's file has no `- Format: 2` line when you start, the plan was created under format 1, and plan.md may have no Coverage rows for this milestone, or no `## Coverage` section at all. Add one plan-level row for each source section this milestone implements, mapped to this milestone's ID, in the row format from the plan format's Coverage section. If plan.md has no `## Coverage` section, create it between `## Milestones` and `## Decisions`.

   Then build this milestone's `## Coverage` section, directly after Context and its Waves line, from the plan-level rows that point at this milestone: one row per requirement this milestone implements from the source sections those rows name, mapped to the task IDs that implement it. Write a task for any such requirement that no task implements yet. A row you can't map to this milestone's tasks is a GAP: report `BLOCKED` / `GAP` and write the question to Open questions, as in "Find every problem".
   ```
2. Under `## Write`, in the paragraph that begins `Edit only two files:`, find the text `replace the Outline section with Tasks, update Context if needed,` and replace it with this text:

   ```
   replace the Outline section with Tasks, add its `## Coverage` section, update Context if needed,
   ```
3. In the same paragraph, change `and plan.md (Decisions, Open questions, and this milestone's table row set to` to `and plan.md (Decisions, Open questions, Coverage, and this milestone's table row set to`.

**Done when**

- A `## Build the Coverage` section with the two Step 1 paragraphs sits between `## Sequence and find the parallelism` and `## Self-check`.
- The `Edit only two files:` paragraph has both Step 2 and Step 3 changes and is still one line; its GAP and SCOUT sentences are unchanged.
- The Change 0 paragraph in `## Write`, the `## Report` block, the frontmatter, and every other line are unchanged.

### M03-T04: README describes Coverage

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/README.md`
- Verify: `grep -qF -e "- **Coverage.** " plugins/orchestratinator/README.md`
- Commit: `docs(orchestratinator): describe Coverage in the README`

**Objective**

The README's "What a plan contains" list has a Coverage bullet.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §4 (the feature the bullet describes)

**Steps**

1. In `plugins/orchestratinator/README.md`, under `### What a plan contains`, find the bullet that begins `- **Interfaces.**`. Directly after it, insert this bullet as a new line (before the bullet that begins `- **Sequence and parallelism.**`):

   ```
   - **Coverage.** `plan.md` maps every section of every source to the milestones that implement it, or to `out of scope` with the Decision that says so, and every detailed milestone maps each requirement it implements (any must, shall, should, numbered acceptance criterion, or explicit behavior) to its task IDs. `plan` adds a task or milestone for anything unmapped and asks you about anything that looks deliberately out of scope, and the planner stops with a question for a requirement it can't map, so no requirement falls between tasks unnoticed.
   ```

**Done when**

- The Coverage bullet sits between the `Interfaces` and `Sequence and parallelism` bullets.
- No other line in the file changed.

### M03-T05: plan skill applies coverage to direct jobs and writes Coverage

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 2
- Depends on: M03-T02
- Files: `plugins/orchestratinator/skills/plan/SKILL.md`
- Verify: `grep -qF -e "- Every requirement maps to a drafted task (step 9). The size check never skips the coverage check" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "every detailed milestone file gets its own Coverage section, directly after its Context and Waves line." plugins/orchestratinator/skills/plan/SKILL.md`
- Commit: `feat(orchestratinator): plan writes Coverage and checks it for direct jobs`

**Objective**

The size check (step 10) keeps the coverage check for jobs done directly without writing any Coverage, and step 11 writes both coverage levels into the plan.

**Read first**

- plan.md Decisions D18 and D19

**Steps**

1. In `plugins/orchestratinator/skills/plan/SKILL.md`, under `## 10. Size check: do small jobs directly`, find the line `- Every question from step 5 has been answered. The size check never skips the questions.`. Directly after it, insert this line (before the blank line and `To do it directly:`):

   ```
   - Every requirement maps to a drafted task (step 9). The size check never skips the coverage check, but a job done directly writes no Coverage anywhere.
   ```
2. Under `## 11. Write and hand off`, find the line that begins `Write the plan directory (default`. At the end of that same line, after the final period, append a space and this sentence (the paragraph stays one line):

   ```
   plan.md gets the Coverage section from step 9, between its Milestones and Decisions sections, and every detailed milestone file gets its own Coverage section, directly after its Context and Waves line.
   ```

**Done when**

- The size check's condition list has four bullets; the new one is the last, directly after the `Every question from step 5` bullet.
- The first paragraph of step 11 ends with the Step 2 sentence and is still one line.
- No other line in the file changed.
