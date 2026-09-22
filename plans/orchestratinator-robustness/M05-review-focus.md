# M05: Change 4: Review Focus (spec §6)

- Status: outline
- Goal: Every detailed format 2 milestone has a `## Review Focus` section listing up to five unexercised inputs or failure modes, each with a sourced expected behavior and an owning test and task, or `None found:` plus what was checked. `plan` and the planner build it under the sourcing rule, which turns an unsourced behavior into a question or a GAP. The README describes it.
- Depends on: M04
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`
- Survey: scout

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §6, plus D01, D08 (placement after Coverage, and the Review Focus line format), D16, D17 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). Never modify Change 0 text (D17).
- Per D01, this milestone updates every reader of Review Focus. The milestone-reviewer's Review Focus check belongs to M06.
- The sourcing rule is the core of this change: an expected behavior with no source or Decision is a design decision. In `plan` it becomes an ambiguity question for the user; in the planner it becomes a GAP.
- Steps should give the exact anchor line and the literal text to insert. Verify commands are `grep -qF` checks for the inserted text, run from the repo root, with no backticks inside the command.

## Outline

- `reference/plan-format.md`: add `## Review Focus` to the milestone template (after Coverage, D08). Define it per §6: up to five items, most likely first; the D08 line format; the owning task's Steps include writing the test; `None found:` plus what was checked, never blank; and the sourcing rule. Add a *(format 2)* checklist item: every detailed format 2 milestone has a non-empty Review Focus section.
- `skills/plan/SKILL.md`: when detailing a milestone, build its Review Focus. An unsourced expected behavior is an ambiguity question in step 5.
- `agents/planner.md`: build Review Focus when detailing. An unsourced expected behavior is a GAP.
- `README.md` "What a plan contains": add a Review Focus bullet.
