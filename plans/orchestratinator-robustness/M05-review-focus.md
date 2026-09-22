# M05: Change 4: Review Focus (spec §6)

- Status: in-progress
- Goal: Every detailed format 2 milestone has a `## Review Focus` section listing up to five unexercised inputs or failure modes, each with a sourced expected behavior and an owning test and task, or `None found:` plus what was checked. `plan` and the planner build it under the sourcing rule, which turns an unsourced behavior into a question or a GAP. The README describes it.
- Depends on: M04
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §6, and §14's README row (its order: Interfaces, Coverage, Review Focus, Fails first), plus D01, D08, D16, D17, D32, D33 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). This milestone file gets no Coverage or Review Focus section. Never modify Change 0 text (D17), including the precedence-rule paragraph under the planner's `## Write` and the Change 0 sentences in item 5 of the `plan` skill's step 10.
- Insert the text in each Step exactly as written, character for character, including backticks, asterisks, arrows (`→`), and section signs (`§`). Change nothing else in the file: no rewording, no reformatting, no other lines. When a Step says "insert ... directly after X", the new text starts on its own line directly below X; blank lines are exactly as the Step describes.
- No step numbers change in `skills/plan/SKILL.md` (D32): Review Focus is built inside step 6, and step 10 (size check) is not edited.
- Don't touch the `## Report` block of any agent, `skills/run/SKILL.md`, the worker agents, `agents/reviewer.md`, the README's cast table, or anything about reviews, batching, or assumptions (later milestones). The milestone-reviewer's Review Focus check belongs to M06, the plan-reviewer's checks to M07.
- Every task edits a different file, so all four run in one wave.

Waves: 1 (widths 4)

## Tasks

### M05-T01: Define Review Focus in the plan format

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/reference/plan-format.md`
- Verify: `grep -qxF "## Review Focus" plugins/orchestratinator/reference/plan-format.md && grep -qxF "### Review Focus" plugins/orchestratinator/reference/plan-format.md && grep -qF "or D<nn>>). Test:" plugins/orchestratinator/reference/plan-format.md && grep -qF "None found: <what was checked>" plugins/orchestratinator/reference/plan-format.md && grep -qF "the planner reports it as a GAP" plugins/orchestratinator/reference/plan-format.md && grep -qF "that is never blank: at most five lines in the Review Focus line format" plugins/orchestratinator/reference/plan-format.md`
- Commit: `feat(orchestratinator): define Review Focus in the plan format`

**Objective**

`plan-format.md` shows a `## Review Focus` section in the milestone template after Coverage, defines it and its sourcing rule in a new Review Focus subsection, and has a new *(format 2)* validation checklist item for it.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §6 (the requirement this task implements)
- plan.md Decisions D08, D32, D33

**Steps**

1. In `plugins/orchestratinator/reference/plan-format.md`, in the milestone file template (the code block under `## Milestone file`), find the line `## Outline` (the only line in the file that is exactly `## Outline`). Directly before it, insert these five lines followed by one blank line (the existing blank line above `## Outline` stays where it is, above the new lines):

   ```
   ## Review Focus

   <Only once the milestone is detailed: up to five inputs or failure modes the sources imply but no task's tests exercise, most likely first, or one `None found:` line.>

   - <input or condition> → <expected behavior> (source: <§ or D<nn>>). Test: `<test name>` in <task ID>.
   ```

   The result reads: the Coverage row ``- `docs/spec.md` §4.2: <requirement, briefly> → M02-T01, M02-T03``, a blank line, `## Review Focus`, a blank line, the `<Only once ...>` line, a blank line, the `- <input or condition>` line, a blank line, `## Outline`.
2. Find the line `### Task fields`. Directly before it, insert these eleven lines followed by one blank line (so the new subsection sits between the last paragraph of `### Coverage` and `### Task fields`, with one blank line on each side):

   ```
   ### Review Focus

   Specs describe what software must do, not every input it will meet, and silence on an input is not permission for that input to break the program. Every detailed milestone has a `## Review Focus` section, directly after its Coverage section *(format 2)*: up to five inputs or failure modes the sources imply but no task's tests exercise, most likely first. An `outline` milestone has none.

   Each item is one line: ``- <input or condition> → <expected behavior> (source: <§ or D<nn>>). Test: `<test name>` in <task ID>.`` The source is the spec section or Decision the expected behavior comes from. The task named is the one that owns the test, and that task's Steps include writing it, so that task adds tests and is `Fails first: yes`.

   If nothing qualifies, the section is one line, `None found: <what was checked>`. The section is never blank.

   The expected behavior must come from the sources or Decisions. If it doesn't, it's a design decision, not a Review Focus item: `plan` asks the user about it as an ambiguity question, and the planner reports it as a GAP. This is what keeps Review Focus from becoming a back door for decisions.

   `plan` builds the Review Focus of every milestone it details, and the planner builds it when it details a milestone, in both cases once the milestone's tasks are drafted and before they are sequenced, so the owning task's test-writing Steps and test file are in place before waves are assigned.
   ```
3. In `## Validation checklist`, find the line that begins `- [ ] Every task that adds or changes tests has`. Directly after it (before the blank line and the sentence that begins `Items marked *(format 2)*`), insert this line:

   ```
   - [ ] A detailed milestone has a `## Review Focus` section, directly after its Coverage section, that is never blank: at most five lines in the Review Focus line format, each citing a source and an existing task whose Steps write the named test, or one `None found:` line saying what was checked. *(format 2)*
   ```

**Done when**

- The milestone template has `## Review Focus` with its `<Only once ...>` line and one item line between the Coverage row and `## Outline`, separated by blank lines.
- A `### Review Focus` subsection with the Step 2 paragraphs sits between the `### Coverage` subsection and `### Task fields`, with one blank line on each side.
- The new checklist item is the last item of the checklist, directly after the `Every task that adds or changes tests has` item, and the `Items marked *(format 2)*` sentence still follows the checklist after one blank line.
- No other line in the file changed (`git diff` shows only these additions).

### M05-T02: plan skill builds Review Focus and writes it

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/skills/plan/SKILL.md`
- Verify: `grep -qF "Once a milestone's tasks are drafted, build its Review Focus" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "an ambiguity question for the user, asked as in step 5, never a behavior you choose." plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "Every detailed milestone file also gets its Review Focus section from step 6, directly after its Coverage section." plugins/orchestratinator/skills/plan/SKILL.md`
- Commit: `feat(orchestratinator): plan builds Review Focus`

**Objective**

The `plan` skill's step 6 builds each detailed milestone's Review Focus once its tasks are drafted, routes an unsourced expected behavior to the user as an ambiguity question, and step 11 writes the section into every detailed milestone file.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §6 (the requirement this task implements)
- plan.md Decisions D32 and D33

**Steps**

1. In `plugins/orchestratinator/skills/plan/SKILL.md`, under `## 6. Write the tasks as prompts`, find the line that begins `Assign each task a tier from the rubric.`. Directly after it, insert one blank line followed by these three lines (the existing blank line and the `## 7. Sequence the tasks and find the parallelism` heading stay below them):

   ```
   Once a milestone's tasks are drafted, build its Review Focus, as the plan format's Review Focus section defines it: up to five inputs or failure modes the sources imply but no task's tests exercise, most likely first, each with its expected behavior, the source of that behavior (a spec section or Decision), the test that pins it, and the task that owns that test. Add the test-writing Steps to the owning task under its Fails first rules, with the test's file in its Files, before you sequence the tasks in step 7. If nothing qualifies, write `None found:` plus what you checked.

   The expected behavior must come from the sources or Decisions. If it doesn't, it's a design decision: an ambiguity question for the user, asked as in step 5, never a behavior you choose. Add the item only once the user's answer is recorded as a Decision, and cite that Decision as its source.
   ```
2. Under `## 11. Write and hand off`, find the line that begins `Write the plan directory (default`. At the end of that same line, after the final period, append a space and this sentence (the paragraph stays one line):

   ```
   Every detailed milestone file also gets its Review Focus section from step 6, directly after its Coverage section.
   ```

**Done when**

- Step 6 ends with the two Step 1 paragraphs, after the `Assign each task a tier` line, separated by blank lines, and `## 7. Sequence the tasks and find the parallelism` still follows after one blank line.
- The first paragraph of step 11 ends with the Step 2 sentence and is still one line.
- The step headings still run `## 1.` through `## 11.` unchanged, step 10 is unchanged, and no other line in the file changed.

### M05-T03: planner builds Review Focus

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/planner.md`
- Verify: `grep -qxF "## Build the Review Focus" plugins/orchestratinator/agents/planner.md && grep -qF "it's a design decision, not yours to make" plugins/orchestratinator/agents/planner.md && grep -qF "and write the question to Open questions, tagged" plugins/orchestratinator/agents/planner.md && grep -qE "add its .## Coverage. and .## Review Focus. sections," plugins/orchestratinator/agents/planner.md`
- Commit: `feat(orchestratinator): planner builds Review Focus`

**Objective**

The planner builds the detailed milestone's Review Focus once its tasks are drafted, reports an unsourced expected behavior as a GAP, and lists the Review Focus section among the things it may edit.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §6 (the requirement this task implements)
- plan.md Decisions D32 and D33

**Steps**

1. In `plugins/orchestratinator/agents/planner.md`, find the line `## Sequence and find the parallelism`. Directly before it, insert these five lines followed by one blank line (so the new section sits between the `## Write the tasks as prompts` section and `## Sequence and find the parallelism`, with one blank line on each side):

   ```
   ## Build the Review Focus

   Once the tasks are drafted, build this milestone's `## Review Focus` section, directly after its Coverage section, as the plan format's Review Focus section defines it: up to five inputs or failure modes the sources imply but no task's tests exercise, most likely first, each with its expected behavior, the source of that behavior (a spec section or Decision), the test that pins it, and the task that owns that test. Add the test-writing Steps to the owning task under its Fails first rules, with the test's file in its Files, before you sequence the tasks. If nothing qualifies, write `None found:` plus what you checked.

   The expected behavior must come from the sources or Decisions. If it doesn't, it's a design decision, not yours to make: report `BLOCKED` / `GAP` and write the question to Open questions, tagged `[ambiguous]`, as in "Find every problem".
   ```
2. Under `## Write`, in the paragraph that begins `Edit only two files:`, find the text ``add its `## Coverage` section,`` and replace it with this text:

   ```
   add its `## Coverage` and `## Review Focus` sections,
   ```

**Done when**

- A `## Build the Review Focus` section with the two Step 1 paragraphs sits between `## Write the tasks as prompts` and `## Sequence and find the parallelism`.
- The `Edit only two files:` paragraph has the Step 2 change and is still one line; its GAP and SCOUT sentences are unchanged.
- The Change 0 paragraph in `## Write`, the `## Report` block, the frontmatter, and every other line are unchanged.

### M05-T04: README describes Review Focus

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/README.md`
- Verify: `grep -qF -e "- **Review Focus.** " plugins/orchestratinator/README.md`
- Commit: `docs(orchestratinator): describe Review Focus in the README`

**Objective**

The README's "What a plan contains" list has a Review Focus bullet between Coverage and Fails first.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §6 (the feature the bullet describes)

**Steps**

1. In `plugins/orchestratinator/README.md`, under `### What a plan contains`, find the bullet that begins `- **Coverage.**`. Directly after it, insert this bullet as a new line (before the bullet that begins `- **Fails first.**`):

   ```
   - **Review Focus.** Specs say what software must do, not every input it will meet, and silence on an input is not permission for it to break the program. Every detailed milestone lists up to five inputs or failure modes the sources imply but no task's tests exercise, most likely first, each with its expected behavior, the spec section or Decision that behavior comes from, and the test and task that pin it, or says `None found:` and what was checked. An expected behavior that no source or Decision supports is a design decision, so `plan` asks you about it and the planner stops with a question, rather than either one choosing a behavior.
   ```

**Done when**

- The Review Focus bullet sits between the `Coverage` and `Fails first` bullets.
- No other line in the file changed.
