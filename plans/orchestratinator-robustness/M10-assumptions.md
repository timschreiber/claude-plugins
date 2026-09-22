# M10: Change 9: Assumptions are questions (spec §11)

- Status: outline
- Goal: The plan format defines assumptions in an "Assumptions" subsection with the `[assumption]` tag. `plan` audits four categories, and replaces the handoff's assumptions line with a pre-handoff assumption check that ends in `Assumptions: none`. The planner treats an unsourceable assumption as a GAP tagged `[assumption]`. `plan-reviewer` checks for unsourced assumptions. The README describes four question categories.
- Depends on: M09
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`
- Survey: scout

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §11 and the §8 bullet "unsourced assumptions, per §11"; plus D01, D07, D16, D17, D24 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). Never modify Change 0 text (D17).
- Per D07, the definition lives in `plan-format.md` only, copied verbatim from §11's **Definition** paragraph with its bullets and its **Not assumptions** sentence. `plan`, `planner`, and `plan-reviewer` point to that subsection instead of restating it.
- Steps should give the exact anchor line and the literal text to insert. Verify commands are `grep -qF` checks, run from the repo root, with no backticks inside the command.

## Outline

- `reference/plan-format.md` "Decisions and open questions": add the "Assumptions" subsection (D07) and the `[assumption]` tag.
- `skills/plan/SKILL.md`:
  - Step 5 audits four categories, adding **assumption**. An assumption question states what `plan` would assume, why the plan needs it, the recommended value, and the evidence for a factual conclusion.
  - Replace the handoff line "Any assumption you made that the user didn't state..." with the §11 check: if the finished plan has assumptions, ask them as one more round, record the answers, then hand off. The handoff states `Assumptions: none`.
- `agents/planner.md`: in "Find every problem", add the fourth category. An unsourceable assumption is a GAP, and the Open questions format's bracket list gains `assumption`.
- `agents/plan-reviewer.md`: add the unsourced-assumptions check, pointing to the plan-format subsection. Each one found is an issue.
- `README.md`: update "How to use" item 1 and the "Questions answered first" bullet to the four categories (D24).
