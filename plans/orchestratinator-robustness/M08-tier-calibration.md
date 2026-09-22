# M08: Change 7: Tier calibration (spec §9)

- Status: outline
- Goal: The tier rubric restricts `worker-light` to tasks whose Steps contain the literal final content, with the turn-count rationale under the rubric. The planner raises a kind of task one tier after repeated escalations, and records that in Context.
- Depends on: M07
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`
- Survey: scout

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §9, plus D01, D06, D16, D17, D23 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). Never modify Change 0 text (D17).
- The one-line rationale under the rubric is spec §9's **Why** sentence, verbatim: "The cheapest models often take two to three times as many turns on multi-step work described in prose, which can cost more overall."
- Check whether the README cast table's `worker-light` description ("No-logic edits.") or the `worker-light` agent's frontmatter description needs to change to stay consistent with the new rubric. Only change them if they contradict the rubric.
- Steps should give the exact anchor line and the literal text to insert. Verify commands are `grep -qF` checks, run from the repo root, with no backticks inside the command.

## Outline

- `reference/plan-format.md` "Tier rubric": change the `worker-light` row to spec §9's first bullet. `worker-light` is only for Steps that contain the literal final content; if any step requires composing code from prose, the floor is `worker`. Add the rationale line under the rubric.
- `agents/planner.md`: add escalation feedback. When detailing, read the `- Escalated:` lines in `done` milestones. If the same tier escalated two or more times on the same kind of task (D06), assign that kind one tier higher in this milestone, and write the D23 line in Context.
