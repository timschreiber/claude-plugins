# M11: CHANGELOG and read-through (spec §14, §16)

- Status: outline
- Goal: The repo-root CHANGELOG has the D13 entry. A read-through confirms that every reader of each new field and section was updated, that no reader references a field or section that doesn't exist, and that Change 0 is intact. Any problem the read-through finds is fixed.
- Depends on: M10
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`
- Survey: scout

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §14 (the CHANGELOG row and the reader map) and §16 (Verification), plus D12, D13, D16, D17 in plan.md.
- The §16 smoke test is not part of this plan (D12).
- Change 0 intact means (spec §16): the precedence rule ("They do not govern git") appears in every skill and agent that had it, plus `milestone-reviewer` and `plan-reviewer`, and `omitClaudeMd: true` is still set on the four workers (`worker-light`, `worker`, `worker-heavy`, `specialist`).
- The read-through is an `investigate` task that writes its findings to a note. Any fix it calls for becomes a follow-up task, or a GAP when the fix needs a decision.
- Verify commands are `grep` checks run from the repo root, with no backticks inside the command.

## Outline

- `CHANGELOG.md` (repo root): append the D13 bullet under `## [Unreleased]` → `### Added`, after the existing bullets.
- Read-through (investigate). For each new field or section (Format, Interfaces, Coverage, Fails first and RED, Review Focus, Origin, Batch, Assumptions, the two new agents, and `VACUOUS`), list every file §14 says reads it, and confirm each one handles it. Then list every reference in the skills, agents, and README to a field, section, step number, or agent, and confirm the target exists. Record findings with `path:line`.
- Change 0 check: count the files containing "They do not govern git" (expect the 10 existing skills and agents plus the 2 new agents) and `omitClaudeMd: true` (expect the 4 workers).
- Fix tasks for anything the read-through finds.
