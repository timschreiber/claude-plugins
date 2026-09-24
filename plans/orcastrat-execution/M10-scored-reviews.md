# M10: Scored reviews and the validator (Change 10)

- Status: outline
- Format: 2
- Goal: `reviewer`, `milestone-reviewer` and `plan-reviewer` score every finding on the anchored rubric and tag it with a category. Only findings at 80 or above, with a citation and in a blocking category, become blocking candidates. A new `validator` agent scores each candidate independently, without seeing the reviewer's score. Only candidates the validator also scores at 80 or above have any effect, in `run` and in `plan`. Everything else is recorded as advisory. The rubric is defined once and copied verbatim into every scoring agent, with a bats drift test.
- Depends on: M09
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §11 (Change 10), §22 item 3 (`validator` allowlist); Decisions D12, D13, D21.

- D48, D66: the new agent file gets the `## Search and command bounds` section and the `## No prototyping or duplicate work` section (both added in M04), and its `tools` line names no `Agent`, `Task`, `Skill` or `Artifact`; `tests/orcastrat/agent-files.bats` checks all three.

- The rubric (D21): canonical text in `plugins/orcastrat/reference/review-rubric.md`. It uses the spec's five anchors (0, 25, 50, 75, 100) in the spec's wording. It is copied verbatim between `<!-- rubric:start -->` and `<!-- rubric:end -->` into `reviewer`, `milestone-reviewer`, `plan-reviewer` and `validator`. `tests/orcastrat/review-rubric.bats` fails when any copy differs.
- Blocking candidate: score ≥ 80, cites `path:line` (or the plan section), and falls in a blocking category.
  - Work reviewers: violates a Done when; a Coverage item not implemented; breaks a declared Interface; a correctness bug with a concrete failing scenario; changes outside the task's or milestone's Files, or outside the plan's Out of scope. The Out of scope section arrives in M13; reviewers use it when present.
  - `plan-reviewer`: a task that needs a design decision to execute; a Coverage gap; Wave interference; a Verify that can't fail first; a Verify that violates Change 13 (the rule text arrives in M13).
- Reviewer inputs are the diff or detailed milestone plus the criteria, never worker transcripts.
- `validator`:
  - Frontmatter: `model: sonnet`, `effort: medium`, `maxTurns: 20`, `tools: Read, Glob, Grep, Bash`. Read-only; replies inline in at most 5 lines, with its score and a one-line reason.
  - It gets the finding, the diff or plan section, the same criteria, and the paths of any instruction file cited. It never gets the reviewer's score.
  - For a finding that cites an instruction file, it confirms that the file states that rule.
- `run` dispatches one `validator` per candidate, in parallel. `plan` does the same for plan-reviewer findings.
  - A candidate the validator scores below 80 is downgraded to advisory, with both scores recorded.
  - The per-task `reviewer`'s FAIL is final only after validation; if no candidate survives, the task passes.
- Advisory findings are recorded in the review's notes file, with scores and categories. They are counted in the run report (M11) and never acted on.

## Outline

- `reference/review-rubric.md` and the rubric drift test.
- `reviewer`, `milestone-reviewer`, `plan-reviewer`: scoring, category tags, blocking-candidate rules, notes format with advisory findings, and the rubric copy.
- Add `agents/validator.md`.
- `run`: validator dispatch per blocking candidate for task reviews, milestone reviews, and plan reviews during detailing; downgrades; FAIL only after validation.
- `plan` skill: validator dispatch for plan-reviewer candidates before its fix pass.
