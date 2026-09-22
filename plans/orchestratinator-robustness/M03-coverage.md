# M03: Change 2: Spec coverage check (spec §4)

- Status: outline
- Goal: plan.md and every detailed format 2 milestone carry a Coverage section that maps requirements to milestones and tasks. The plan format defines both levels, the row format, and the checklist items. `plan` builds both levels in a new step. The planner builds the milestone level, and adds plan-level rows in format 1 plans. The README describes it.
- Depends on: M02
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`
- Survey: scout

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §4 and the Coverage sentences of §13, plus D01, D04, D08 (placements), D16, D17, D18, D19 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). Never modify Change 0 text (D17).
- Per D01, this milestone updates every reader of Coverage. The milestone-reviewer's and plan-reviewer's Coverage checks belong to M06 and M07.
- Milestone-level checklist items are marked *(format 2)*. The plan-level completeness rule follows D04.
- Renumbering the `plan` skill's steps (D19) changes every in-file reference to "step 9" and "step 10", and any other reference to a renumbered step. Every one must be updated in the same task as the renumbering.
- Steps should give the exact anchor line and the literal text to insert. Verify commands are `grep -qF` checks for the inserted text, run from the repo root, with no backticks inside the command.

## Outline

- `reference/plan-format.md`:
  - Add `## Coverage` to the plan.md template (between Milestones and Decisions) and to the milestone template (after Context, before Outline/Tasks), per D08.
  - Define both levels, "requirement", and the §4 row format.
  - Add checklist items: plan.md Coverage has no unmapped row (with D04's completeness gating); every detailed format 2 milestone has a Coverage section with no unmapped row *(format 2)*; every task ID in a Coverage row exists.
- `skills/plan/SKILL.md`: add a new step directly after Self-check that builds both coverage levels. An unmapped requirement gets a task or milestone added; a requirement that seems deliberately out of scope becomes a question for the user, never a silent drop. In direct mode (the size check), apply D18. Renumber the following steps and every reference to them (D19).
- `agents/planner.md`:
  - When detailing, build the milestone's Coverage section from the plan-level rows pointing at it; a row it can't map is a GAP.
  - In a plan created under format 1, also add the plan-level Coverage rows for its own milestone, creating plan.md's `## Coverage` section if needed (§13).
  - Coverage is part of what the planner may edit in plan.md.
- `README.md` "What a plan contains": add a Coverage bullet.
