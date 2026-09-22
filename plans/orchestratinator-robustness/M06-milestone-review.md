# M06: Change 5: Milestone quality review (spec §7)

- Status: outline
- Goal: A new `milestone-reviewer` agent reviews each finished milestone's diff. `run` 3f dispatches it after Milestone verify and before marking the milestone done, with one fix round by the planner in `Fix findings:` mode and one re-review. The plan format documents `- Origin: review` and the review notes files. The README cast table and "How a run behaves" describe it.
- Depends on: M05
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`
- Survey: scout

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §7, the review sentence of §13 ("apply to every milestone, whatever its format"), and §2's requirement for new agents; plus D01, D03, D05, D08 (Origin placement), D10, D16, D17, D21, D22, D24 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). Never modify Change 0 text (D17).
- New agent frontmatter must parse as YAML (spec §1.5): quote any value containing `: ` or starting with a special character. Copy the frontmatter shape from `agents/scout.md` (`disallowedTools: Edit`, D10e), with `model: opus`, `effort: high`, `maxTurns: 60`.
- The new agent's precedence rule is copied verbatim from an existing agent (search for "They do not govern git"), followed by `You never commit, push, or change branches.` Its CLAUDE.md / AGENTS.md re-read ends with the symlink sentence (spec §2, D17).
- In a format 1 milestone, the reviewer skips the checks for sections the milestone doesn't have (Coverage, Interfaces, Review Focus), per §13.
- Steps should give the exact anchor line and the literal text to insert, including the full text of the new agent file. Verify commands are `grep -qF` checks, run from the repo root, with no backticks inside the command.

## Outline

- `agents/milestone-reviewer.md` (new):
  - Input lines from §7, plus the optional `Re-review: fixes only` line (D05).
  - Review `git diff <Base>..HEAD` against §7's five checks. For a batch task, check file by file.
  - Blocking vs advisory calibration, with every finding citing `path:line` and the task, requirement, or Decision.
  - Report file layout per D21; reply block per §7.
- `skills/run/SKILL.md` 3f, between Milestone verify and marking the milestone done:
  - Find Base (D22), dispatch the reviewer, and don't read the report.
  - Approved or advisory-only → commit the report (`chore(plan): review <ID>`, D10d).
  - Blocking → invoke the planner with `Fix findings: <path>`, commit its fix tasks (`chore(plan): fix tasks <ID>`), validate them, and run them through the wave loop. The `detail` gate doesn't pause and there is no plan-review (D10b).
  - Then re-run Milestone verify, run the re-review (writing `notes/<ID>-review-2.md`, committed as `chore(plan): re-review <ID>`), and go to Stop with `REVIEW` if it's still blocking.
  - Resume rule D10a. The review applies to format 1 milestones too.
- `agents/planner.md`: add a `Fix findings:` mode. It reads the review and appends fix tasks with the next task IDs, waves after the current last wave, and `- Origin: review` each, in the milestone's own Format (D10c). It edits only the milestone file and plan.md. A finding that needs a design decision is a GAP.
- `reference/plan-format.md`:
  - Add `- Origin: review` to the task template and Task fields (D03, D08).
  - List `notes/<milestone-id>-review.md` and `notes/<milestone-id>-review-2.md` in the directory tree (D03).
  - Add `milestone-reviewer` to the reader list at the top (D24).
- `README.md`: add a cast table row for `milestone-reviewer` (Opus / high) and a "How a run behaves" bullet for the milestone review.
