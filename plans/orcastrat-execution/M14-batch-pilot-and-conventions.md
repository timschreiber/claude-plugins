# M14: Batch pilot and conventions excerpts (Changes 15, 17)

- Status: outline
- Format: 2
- Goal: The `Batch` field takes `yes` or a group `<id>`. For each group, the first task is a pilot that runs alone and serially before the rest are dispatched. A pilot that passes only after escalation re-tiers the rest of its batch (recorded as a Decision plus `Re-tiered:` lines), and the ladder starts from the re-tiered rung. `plan` and `planner` write a Conventions block in each milestone's Context, and the plan-reviewer flags a missing or incomplete one as advisory.
- Depends on: M13
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §16 (Change 15), §18 (Change 17); Decisions D15, D16, D24, D31, D32.

- D24: `Batch: yes` keeps its meaning: one multi-file task of same-kind edits, with no pilot. `Batch: <id>` marks a group of separate same-template tasks. The first in task order is the pilot.
- Pilot rules:
  - It runs alone and serially in the main checkout, even in parallel mode. A `worker-mini` pilot uses `worker-mini-serial` (D15).
  - It passes on its planned tier (a resume at that tier counts): release the rest normally.
  - It passes only after escalation: apply D31. Append `Batch <id> re-tiered to <tier> after pilot <task id>` to `plan.md` Decisions, with source `run (pilot <task id>)`. Add `- Re-tiered: <old> → <new> (batch <id> pilot <task id>)` under each remaining member. Keep their Tier fields. The `Re-tiered:` line is the starting rung, and the three-rung cap counts from it, never past `specialist`.
  - It ends STUCK: stop with `STUCK` as usual.
  - Tasks in other batches or with no batch can share the pilot's wave if they don't interfere.
- Conventions (D32): a `Conventions:` line in Context, with bullets `- "<short quote>" (<path>:<line>)`, or `Conventions: none`. It quotes only the rules that apply to that milestone's tasks. `plan` and `planner` both write it (D16). `task-brief` (M06) carries it with Context. Workers still read the full files.
- `run-report` (M11) counts `Re-tiered:` lines. Confirm it does.

## Outline

- `reference/plan-format.md`: the Batch field's two forms and their validation (Batch `<id>` tasks follow the normal sizing rules), `Re-tiered:` as a line `run` appends, and the Conventions block in Context.
- `plan`, `planner`: when to use `Batch: <id>`, and writing the Conventions block. `plan-reviewer`: Batch-form checks, and the advisory Conventions check.
- `run`: the pilot scheduling, re-tiering, and starting-rung rules.
- A `task-brief` bats test that a Context with a Conventions block appears in the brief.
- A-M05-2 (from `notes/M16-survey.md`): `reference/plan-format.md`'s ladder sentence says "at most two tiers above its planned Tier"; when adding `Re-tiered:`, change "its planned Tier" to "its starting tier (its `- Re-tiered:` tier, if any, otherwise its planned Tier)" (D31, D84).
