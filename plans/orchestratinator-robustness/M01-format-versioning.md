# M01: Format versioning (spec §13)

- Status: in-progress
- Goal: The plan format defines format 2 milestones (`- Format: 2` directly after Status; no Format line means format 1) and marks where format-2-only checklist items apply; `plan` writes `- Format: 2` in every milestone file, and the planner adds it to every milestone it details.
- Depends on: none
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §13 (Compatibility), plus D08 (placement of `- Format: 2`) in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed. They are not the format this plan is written in (D16).
- Insert the text in each Step exactly as written, character for character, including backticks and asterisks. Change nothing else in the file: no rewording, no reformatting, no other lines.
- Never modify Change 0 text (D17).
- The parts of §13 that mention Coverage, the milestone review, and the plan review are done in M03, M06, and M07, when those exist. Don't add them here.

Waves: 1 (widths 3)

## Tasks

### M01-T01: Define format 2 milestones in the plan format

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/reference/plan-format.md`
- Verify: `grep -A1 -F -e "- Status: outline" plugins/orchestratinator/reference/plan-format.md | grep -qF -e "- Format: 2" && grep -qF "### Format" plugins/orchestratinator/reference/plan-format.md && grep -qF "Items marked *(format 2)* apply only to format 2 milestones" plugins/orchestratinator/reference/plan-format.md`
- Commit: `feat(orchestratinator): define format 2 milestones in the plan format`

**Objective**

`plan-format.md` shows `- Format: 2` in the milestone template, defines format 1 and format 2 milestones in a new Format subsection, and says checklist items marked *(format 2)* apply only to format 2 milestones.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §13 (the requirement this task implements)

**Steps**

1. In `plugins/orchestratinator/reference/plan-format.md`, in the milestone file template (the code block under `## Milestone file`), insert a new line `- Format: 2` directly after the line `- Status: outline`.
2. Directly before the line `### Task fields`, insert these three lines followed by one blank line (so the new paragraph is separated from `### Task fields` by a blank line):

   ```
   ### Format

   A milestone file whose header has the line `- Format: 2`, directly after its Status line, is a format 2 milestone. A milestone file without a Format line is format 1. `plan` always writes format 2, in every milestone file it writes, detailed or outlined. The planner always writes format 2 when it details a milestone, even in a plan created under format 1. Validation applies the checklist items marked *(format 2)* only to format 2 milestones, and format 1 milestones validate as before, so plans already in progress keep running.
   ```
3. After the last line of the file (the checklist item that begins `- [ ] Every investigate task's Files is exactly its own note`), add one blank line, then this line:

   ```
   Items marked *(format 2)* apply only to format 2 milestones (see [Format](#format)). Format 1 milestones skip them and validate as before.
   ```

**Done when**

- The line after `- Status: outline` in the milestone template is `- Format: 2`.
- A `### Format` subsection with the Step 2 paragraph sits directly before `### Task fields`.
- The Step 3 sentence follows the validation checklist.
- No other line in the file changed (`git diff` shows only these additions).

### M01-T02: plan writes format 2 milestone files

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/skills/plan/SKILL.md`
- Verify: `grep -qF "Every milestone file, detailed or outlined, gets the line" plugins/orchestratinator/skills/plan/SKILL.md`
- Commit: `feat(orchestratinator): plan writes format 2 milestones`
- Process: worker committed on its own; reset and recommitted

**Objective**

The `plan` skill's write step tells it to put `- Format: 2` in every milestone file it writes.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §13 (the requirement this task implements)

**Steps**

1. In `plugins/orchestratinator/skills/plan/SKILL.md`, find the line that begins `Write the plan directory (default` and ends `and every task to` followed by `` `todo`. ``. At the end of that same line, after the final period, append a space and this sentence:

   ```
   Every milestone file, detailed or outlined, gets the line `- Format: 2` directly after its Status line.
   ```

**Done when**

- That line ends with the Step 1 sentence, and it is still one line.
- No other line in the file changed.

### M01-T03: planner writes format 2 when it details a milestone

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/planner.md`
- Verify: `grep -qF "adding it if it's missing, even in a plan created under format 1)" plugins/orchestratinator/agents/planner.md`
- Commit: `feat(orchestratinator): planner writes format 2 milestones`

**Objective**

The planner's Write section tells it to put `- Format: 2` directly after the milestone's Status line whenever it details a milestone, even in a format 1 plan.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §13 (the requirement this task implements)

**Steps**

1. In `plugins/orchestratinator/agents/planner.md`, under `## Write`, find the text `` set Status to `ready`) `` (it closes the parenthesis that begins `this milestone's file (`). Replace exactly that text with:

   ```
   set Status to `ready`, and put `- Format: 2` directly after the Status line, adding it if it's missing, even in a plan created under format 1)
   ```

**Done when**

- In the Write section's `Edit only two files:` sentence, the Step 1 replacement text stands where the old text was, and the sentence continues ` and plan.md (Decisions, ...` as before.
- The Change 0 paragraph at the start of `## Write` is unchanged, and no other line in the file changed.
