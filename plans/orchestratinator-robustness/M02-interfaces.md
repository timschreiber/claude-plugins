# M02: Change 1: Interfaces per task (spec §3)

- Status: in-progress
- Goal: Every format 2 `change` task carries an Interfaces block that names what it consumes and produces. The plan format defines the block, its rules, and its checklist items. Workers implement Produces exactly and stop with GAP on a Consumes mismatch. `plan` and the planner run an interface-consistency pass. The per-task reviewer checks the code against Produces. The README describes it.
- Depends on: M01
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §3, plus D01, D08, D11, D16, D17, D25, D26 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). Never modify Change 0 text (D17).
- Insert the text in each Step exactly as written, character for character, including backticks and asterisks. Change nothing else in the file: no rewording, no reformatting, no other lines. When a Step says "insert a new line after X", the new line goes on its own line directly below X, with no blank line between them unless the Step says so.
- Don't touch the `## Report` block of any agent (the `RED:` line is M04's), step numbers in `skills/plan/SKILL.md` (M03 renumbers them), or the README's cast table (M06/M07).
- The milestone-reviewer's Interfaces check belongs to M06, not here.

Waves: 1 (widths 6)

## Tasks

### M02-T01: Define the Interfaces block in the plan format

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/reference/plan-format.md`
- Verify: `grep -qF "static boolean isLargeText(float fontSizePt, boolean bold)" plugins/orchestratinator/reference/plan-format.md && grep -qF "| Interfaces | Format 2 milestones only." plugins/orchestratinator/reference/plan-format.md && grep -qF "No symbol is produced by two tasks with different signatures. *(format 2)*" plugins/orchestratinator/reference/plan-format.md`
- Commit: `feat(orchestratinator): define task Interfaces in the plan format`

**Objective**

`plan-format.md` shows an Interfaces block in the task template, defines it in a Task fields row, and has four *(format 2)* validation checklist items for it.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §3, from "**Plan format.**" through rule 5 (the requirement this task implements)

**Steps**

1. In `plugins/orchestratinator/reference/plan-format.md`, in the milestone file template (the code block under `## Milestone file`), find the line `` - `path/to/ExistingPattern.java` (pattern to copy) ``. Directly after it, insert one blank line followed by these six lines (the existing blank line and `**Steps**` stay below them):

   ```
   **Interfaces**

   - Consumes: `CandidateSelector.select(PDDocument doc): List<Candidate>` (M01-T03)
   - Consumes: `WcagThresholds.LARGE_TEXT_PT` (existing, `core/.../WcagThresholds.java:14`)
   - Produces: `FigureWithAlternateText implements CandidateSelector`
   - Produces: `static boolean isLargeText(float fontSizePt, boolean bold)`
   ```

   The result reads: the `ExistingPattern.java` line, a blank line, `**Interfaces**`, a blank line, the four entry lines, a blank line, `**Steps**`.
2. In the `### Task fields` table, find the row that begins `| Read first |`. Directly after that row (and before the row that begins `| Steps |`), insert this row as one line:

   ```
   | Interfaces | Format 2 milestones only. Required in every `change` task, directly after Read first; `investigate` tasks omit it. One entry per line, `- Consumes: <entry> (<source>)` or `- Produces: <entry>`, with at least one Consumes line and at least one Produces line; `none` is allowed for either (`- Consumes: none`, `- Produces: none`). Each entry is an exact signature or exact name: method signatures with parameter and return types, class and interface names, constants with their values, JSON or file shapes, CLI flags, config keys. Each Consumes names its source: a task ID, or `existing` with a `path:line`, as in the template. A symbol produced by a format 1 task, which has no Produces, is cited as `existing` with a `path:line`. Every Consumes that cites a task matches that task's Produces character for character, and the consuming task lists that task in Depends on, so it runs in a later wave. No symbol is produced by two tasks with different signatures. |
   ```
3. In `## Validation checklist`, find the line that begins `- [ ] Every investigate task's Files is exactly its own note`. Directly after it (before the blank line and the sentence that begins `Items marked *(format 2)*`), insert these four lines:

   ```
   - [ ] Every `change` task has an Interfaces block directly after Read first, with at least one Consumes line and one Produces line (`none` allowed for either), and no `investigate` task has one. *(format 2)*
   - [ ] Every Interfaces entry is an exact signature or exact name, and every Consumes names its source: a task ID, or `existing` with a `path:line`. *(format 2)*
   - [ ] Every Consumes that cites a task matches that task's Produces character for character, and the consuming task lists that task in Depends on. *(format 2)*
   - [ ] No symbol is produced by two tasks with different signatures. *(format 2)*
   ```

**Done when**

- The template shows the `**Interfaces**` block, with its four entry lines, between the Read first bullets and `**Steps**`, separated by blank lines.
- The `| Interfaces |` row sits between the `| Read first |` and `| Steps |` rows.
- The four checklist items sit directly after the investigate-task item, and the `Items marked *(format 2)*` sentence still follows the checklist after one blank line.
- No other line in the file changed (`git diff` shows only these additions).

### M02-T02: Workers implement Produces and stop on a Consumes mismatch

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/worker-light.md`, `plugins/orchestratinator/agents/worker.md`, `plugins/orchestratinator/agents/worker-heavy.md`, `plugins/orchestratinator/agents/specialist.md`
- Verify: `grep -qF "implement every Produces entry exactly as written, and never change the signature of anything consumed" plugins/orchestratinator/agents/worker-light.md && grep -qF "implement every Produces entry exactly as written, and never change the signature of anything consumed" plugins/orchestratinator/agents/worker.md && grep -qF "implement every Produces entry exactly as written, and never change the signature of anything consumed" plugins/orchestratinator/agents/worker-heavy.md && grep -qF "implement every Produces entry exactly as written, and never change the signature of anything consumed" plugins/orchestratinator/agents/specialist.md`
- Commit: `feat(orchestratinator): workers honor task Interfaces`

**Objective**

All four worker agents have the same new Rules bullet: implement every Produces exactly, never change a consumed signature, and stop with `BLOCKED` / `GAP` on a Consumes mismatch.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §3, the "**Workers.**" paragraph (the requirement this task implements)

**Steps**

The bullet to insert, identical in every file, is this one line:

```
- If the task has an Interfaces block: implement every Produces entry exactly as written, and never change the signature of anything consumed. If the code disagrees with a Consumes entry, stop and report `BLOCKED` / `GAP`.
```

The anchor, identical in every file, is the Rules bullet that begins `- If the Steps, Decisions, and sources leave a choice open`.

1. In `plugins/orchestratinator/agents/worker-light.md`, under `## Rules`, insert the bullet as a new line directly after the anchor line.
2. In `plugins/orchestratinator/agents/worker.md`, under `## Rules`, insert the bullet as a new line directly after the anchor line.
3. In `plugins/orchestratinator/agents/worker-heavy.md`, under `## Rules`, insert the bullet as a new line directly after the anchor line.
4. In `plugins/orchestratinator/agents/specialist.md`, under `## Rules`, insert the bullet as a new line directly after the anchor line.

**Done when**

- In each of the four files, the new bullet is the line directly after the anchor line, and the line after it is `- Never delete, skip, or weaken a test to get a pass.`
- The frontmatter, the `## Report` block, and every other line of each file are unchanged (`git diff` shows exactly one added line per file).

### M02-T03: plan skill runs an interface-consistency pass

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/skills/plan/SKILL.md`
- Verify: `grep -qF "Run an interface-consistency pass across all tasks of every milestone you detailed" plugins/orchestratinator/skills/plan/SKILL.md`
- Commit: `feat(orchestratinator): plan checks interface consistency`

**Objective**

The `plan` skill's Self-check step includes an interface-consistency pass across all tasks of every detailed milestone.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §3, the "**`plan` and `planner`.**" paragraph (the requirement this task implements)

**Steps**

1. In `plugins/orchestratinator/skills/plan/SKILL.md`, under `## 8. Self-check`, find the paragraph that begins `For every outlined milestone, check that its Goal, Context, and Outline`. Directly after that paragraph, insert one blank line and then this paragraph as one line, so it sits between that paragraph and the line `Then run the validation checklist from the plan format and fix every failure.`, with one blank line on each side:

   ```
   Run an interface-consistency pass across all tasks of every milestone you detailed, including Consumes that cite a task in another milestone: every Interfaces entry is an exact signature or exact name; every Consumes names its source, a task ID or `existing` with a `path:line`; every Consumes that cites a task matches that task's Produces character for character, and that task is in the consuming task's Depends on; and no symbol is produced by two tasks with different signatures. Fix every mismatch.
   ```

**Done when**

- Step 8 has, in order: the Sonnet-test paragraph, the outlined-milestone paragraph, the new paragraph, and `Then run the validation checklist from the plan format and fix every failure.`, separated by single blank lines.
- The heading stays `## 8. Self-check`, and no other line in the file changed.

### M02-T04: planner reads done Produces and runs an interface-consistency pass

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/planner.md`
- Verify: `grep -qF "For each of their tasks that has an Interfaces block, also read its Produces lines." plugins/orchestratinator/agents/planner.md && grep -qF "Run an interface-consistency pass across all tasks in this milestone and against the Produces of" plugins/orchestratinator/agents/planner.md`
- Commit: `feat(orchestratinator): planner checks interface consistency`

**Objective**

The planner reads the Produces lines of the `done` milestones it depends on, and its Self-check runs an interface-consistency pass across this milestone's tasks and against those Produces.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §3, the "**`plan` and `planner`.**" paragraph (the requirement this task implements)

**Steps**

1. In `plugins/orchestratinator/agents/planner.md`, under `## Before anything else`, find the numbered item that begins `` 6. The `done` milestones this one depends on: `` and ends `their investigate tasks wrote.`. At the end of that same line, after the final period, append a space and this sentence (the item stays one line):

   ```
   For each of their tasks that has an Interfaces block, also read its Produces lines.
   ```
2. Under `## Self-check`, in its one paragraph, find the text `If not, split it or add the specifics. Then run the validation checklist`. Between `If not, split it or add the specifics.` and ` Then run the validation checklist`, insert a space followed by this text, so the paragraph stays one line:

   ```
   Run an interface-consistency pass across all tasks in this milestone and against the Produces of `done` milestones: every Interfaces entry is an exact signature or exact name; every Consumes names its source, a task ID or `existing` with a `path:line`; every Consumes that cites a task matches that task's Produces character for character, and that task is in the consuming task's Depends on; and no symbol is produced by two tasks, in this milestone or a `done` one, with different signatures. Fix every mismatch in this milestone's tasks.
   ```

**Done when**

- Item 6 ends with the Step 1 sentence and is still one line.
- The Self-check paragraph reads, in order: the Sonnet test, `If not, split it or add the specifics.`, the Step 2 text, then `Then run the validation checklist for this milestone and fix every failure.`, all on one line.
- The `## Write` section, including its Change 0 paragraph, is unchanged, and no other line in the file changed.

### M02-T05: reviewer checks the code against Produces

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/reviewer.md`
- Verify: `grep -qF "For a task with an Interfaces block: the code matches every Produces entry exactly as written" plugins/orchestratinator/agents/reviewer.md`
- Commit: `feat(orchestratinator): reviewer checks task Produces`

**Objective**

The per-task reviewer's Check list includes matching the code against every Produces entry, skipped for tasks without an Interfaces block.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §3, the "**Reviewers.**" paragraph (the requirement this task implements)

**Steps**

1. In `plugins/orchestratinator/agents/reviewer.md`, under `## Check`, find the bullet `- Nothing contradicts Decisions, the milestone's Context, or CLAUDE.md / AGENTS.md.`. Directly after it, insert this bullet as a new line (before the bullet that begins `` - For an `investigate` task: ``):

   ```
   - For a task with an Interfaces block: the code matches every Produces entry exactly as written (names, parameter and return types, constant values). A task without an Interfaces block (a format 1 task) skips this check.
   ```

**Done when**

- The Check list has five bullets; the new one is the fourth, directly after the `Nothing contradicts` bullet and directly before the `investigate` bullet.
- The frontmatter (including `disallowedTools: Write, Edit`) and every other line are unchanged.

### M02-T06: README describes Interfaces

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/README.md`
- Verify: `grep -qF -e "- **Interfaces.** Every" plugins/orchestratinator/README.md`
- Commit: `docs(orchestratinator): describe task Interfaces in the README`

**Objective**

The README's "What a plan contains" list has an Interfaces bullet.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §3 (the feature the bullet describes)

**Steps**

1. In `plugins/orchestratinator/README.md`, under `### What a plan contains`, find the bullet that begins `- **Tasks that are prompts.**`. Directly after it, insert this bullet as a new line (before the bullet that begins `- **Sequence and parallelism.**`):

   ```
   - **Interfaces.** Every `change` task lists what it consumes and what it produces: exact signatures, class names, constants with their values, file shapes, CLI flags, config keys. Each Consumes names its source, a task ID or an existing `path:line`, and must match that task's Produces character for character, so workers that never see each other, even running in parallel, agree on every name and type that crosses a task boundary. A worker implements its Produces exactly and stops with a question if the code disagrees with a Consumes, and the reviewer checks the code against Produces.
   ```

**Done when**

- The Interfaces bullet sits between the `Tasks that are prompts` and `Sequence and parallelism` bullets.
- No other line in the file changed.
