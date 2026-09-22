# M09: Change 8: Batching tiny, same-shape tasks (spec §10)

- Status: outline
- Goal: The plan format has an optional `- Batch: yes` task field with its rules and relaxed sizing limits. `plan` and the planner prefer one batch task over several tiny same-shape tasks. The per-task reviewer checks a batch file by file. The README describes batching.
- Depends on: M08
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`
- Survey: scout

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §10, plus D01, D02, D08 (placement after Tier), D16, D17 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). Never modify Change 0 text (D17).
- Batch relaxes two sizing rules: about ten files instead of about three production files, and one Step per file instead of about seven Steps (D02).
- The milestone-reviewer already checks batches file by file (added in M06). This milestone adds the same check to the per-task `reviewer`.
- Steps should give the exact anchor line and the literal text to insert. Verify commands are `grep -qF` checks, run from the repo root, with no backticks inside the command.

## Outline

- `reference/plan-format.md`:
  - Add `- Batch: yes` to the task template (after Tier, D08) and a Task fields row with the §10 rules: same kind, no logic; about ten files; one Step per file with the literal edit; one commit; usually `worker-light`.
  - Update the Sizing rules for batch tasks (D02), and add the waves note: a batch touching many files interferes with more tasks.
  - Add a *(format 2)* checklist item: every batch task has one Step per file in its Files.
- `skills/plan/SKILL.md` (write the tasks step) and `agents/planner.md` ("Write the tasks as prompts"): prefer one batch task over several tiny same-shape tasks.
- `agents/reviewer.md` "Check": for a batch task, check file by file that every listed file has its edit. A listed file with no change is a failure.
- `README.md` "What a plan contains": add a batching bullet.
