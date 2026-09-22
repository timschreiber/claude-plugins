# M02: Change 1: Interfaces per task (spec §3)

- Status: outline
- Goal: Every format 2 `change` task carries an Interfaces block that names what it consumes and produces. The plan format defines the block, its rules, and its checklist items. Workers implement Produces exactly and stop with GAP on a Consumes mismatch. `plan` and the planner run an interface-consistency pass. The per-task reviewer checks the code against Produces. The README describes it.
- Depends on: M01
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`
- Survey: scout

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §3, plus D01, D08 (placement), D11, D16, D17 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). Never modify Change 0 text (D17).
- Per D01, this milestone updates every reader of the Interfaces block, so the plugin is consistent when it's done. The milestone-reviewer's Interfaces check belongs to M06, not here.
- New checklist items apply to format 2 only and are marked *(format 2)*, as defined in M01's `### Format` subsection of `plan-format.md`.
- Steps should give the exact anchor line and the literal text to insert. Verify commands are `grep -qF` checks for the inserted text, run from the repo root, with no backticks inside the command.

## Outline

- `reference/plan-format.md`: add the `**Interfaces**` block to the task template after Read first, using the §3 example. Add an Interfaces row to Task fields that states §3 rules 1–5 and D11. Add *(format 2)* validation checklist items for §3 rules 1–5.
- `agents/worker-light.md`, `agents/worker.md`, `agents/worker-heavy.md`, `agents/specialist.md`: add a Rules bullet from the §3 "Workers" paragraph. Implement every Produces exactly as written, never change the signature of anything consumed, and stop with `BLOCKED` / `GAP` if the code disagrees with a Consumes entry.
- `skills/plan/SKILL.md` step 8 (Self-check) and `agents/planner.md` "Self-check": add the §3 interface-consistency pass. It covers every task in each milestone being detailed, and, when detailing a later milestone, checks against the Produces of `done` milestones.
- `agents/reviewer.md` "Check": the code matches every Produces entry of the task. A task without an Interfaces block (format 1) skips this check.
- `README.md` "What a plan contains": add an Interfaces bullet.
