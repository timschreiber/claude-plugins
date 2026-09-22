# M07: Change 6: Fresh-eyes plan review (spec §8)

- Status: outline
- Goal: A new `plan-reviewer` agent checks detailed milestones against the plan format. `plan` dispatches it once per detailed milestone after writing the plan directory, fixes each issue once, and reports the count in the handoff. `run` 3a dispatches it after the planner reports DONE, with one planner fix pass. The README cast table and plan-format reader list include it.
- Depends on: M06
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`
- Survey: scout

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §8, the review sentence of §13, and §2's requirement for new agents; plus D01, D03, D09, D10b, D10e, D16, D17, D21, D24 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). Never modify Change 0 text (D17).
- New agent frontmatter must parse as YAML (spec §1.5). Copy the frontmatter shape from `agents/scout.md` (`disallowedTools: Edit`, D10e), with `model: sonnet`, `effort: high`, `maxTurns: 40`.
- The new agent's precedence rule is copied verbatim from an existing agent (search for "They do not govern git"), followed by `You never commit, push, or change branches.` Its CLAUDE.md / AGENTS.md re-read ends with the symlink sentence (spec §2, D17).
- The unsourced-assumptions check (§8 bullet "unsourced assumptions, per §11") is added in M10, when the plan format defines assumptions. It is not added here. Tier fit is checked against the tier rubric in `plan-format.md`, which M08 updates.
- The plan review applies to format 1 milestones too (§13). Checks for sections the milestone lacks are skipped.
- Steps should give the exact anchor line and the literal text to insert, including the full text of the new agent file. Verify commands are `grep -qF` checks, run from the repo root, with no backticks inside the command.

## Outline

- `agents/plan-reviewer.md` (new):
  - Input lines per D09 (`Plan:`, `Milestone:`, `Output:`).
  - Checks every §8 bullet except unsourced assumptions: banned phrases and placeholders, the Sonnet test, Coverage gaps against the sources, Interfaces consistency, wave interference, untargeted or can't-fail Verify commands, Fails first settings, tier fit, and whole-document Read first entries.
  - "Approve unless there are real gaps" calibration. Report file layout per D21; reply block per §8.
- `skills/plan/SKILL.md`: after writing the plan directory and before the handoff reply, dispatch `plan-reviewer` per D09. Fix each issue yourself, once, with no re-review, and add to the handoff how many issues were found and fixed. There is no plan review in direct mode.
- `skills/run/SKILL.md` 3a:
  - After the planner reports `DONE` and before validation, dispatch `plan-reviewer` on the milestone, writing `notes/<ID>-plan-review.md`.
  - On `ISSUES`, invoke the planner once more with `Plan review: <path>`.
  - The 3a scope check also allows that notes file.
- `agents/planner.md`: handle the `Plan review: <path>` line. Fix the listed issues under the usual rules and report as usual.
- `reference/plan-format.md`: list `notes/<milestone-id>-plan-review.md` in the directory tree (D03). Add `plan-reviewer` to the reader list at the top (D24).
- `README.md`: add a cast table row for `plan-reviewer` (Sonnet / high).
