# M13: Targeted Verify and the planning interview (Changes 13, 14)

- Status: outline
- Format: 2
- Goal: `plan` and `planner` write the narrowest Verify for each task, never the whole suite or a repo-wide verify script, with the `# build config` exception. The plan-reviewer flags violations as blocking. `plan` runs its new sequence: checks, then read and survey, size, interview, write-back, audit, write-back, planning. That includes the scaled interview, `--skip-interview`, the completeness checks (Out of scope, end-to-end proof), the question rules, and write-back of answers into the primary spec file. `plan` ends by recommending `/clear` or a new session.
- Depends on: M12
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §14 (Change 13), §15 (Change 14); Decisions D29, D38.

- Targeted Verify:
  - The narrowest command that fails before the task and passes after it.
  - Never equal to Milestone verify or Final verify, and never a repo-wide verify script.
  - Exception: a task whose Files include shared build configuration may use a full build, still with targeted tests, marked with a `# build config` comment in its Verify line.
  - This applies to milestones detailed after this change. Already-detailed milestones are not rewritten.
  - The `plan-reviewer` check is a blocking category (M10).
- `plan` sequence (Change 14):
  1. Toolchain, instruction-file and model checks (M09).
  2. Read the sources and survey the repo.
  3. Size the job.
  4. Interview.
  5. Write back.
  6. Question audit.
  7. Write back.
  8. Planning.
- Interview:
  - Scaling: on the ≤5-task direct path, ask only approach-changing questions, and skip the phase when there are none.
  - `--skip-interview` skips the phase; the audit still runs.
  - Coverage areas: technical approach and interfaces; edge cases and failure modes; UI/UX, where there is one; data, migration and compatibility; security and operability; tradeoffs and concerns; non-goals; the end-to-end proof.
  - Rounds continue until no material question remains or the user says to move on. The audit never re-asks what the interview settled.
- Completeness checks:
  - Out of scope becomes a `plan.md` `## Out of scope` section after Coverage, which reviewers use.
  - The end-to-end proof becomes, or is appended to, Final verify.
  - Skip a check when the sources answer it, recording the quote in Decisions.
- Question rules, defined once in `plan`:
  - One message per round, numbered; the quoted passage or "not stated"; options; a recommendation.
  - Answerable as a single pasted block. No AskUserQuestion for rounds.
  - Never ask what the sources or the repo answer; record the finding as a Decision instead.
  - Always ask about spec/repo contradictions.
  - Order: structure first, then behavior, then minor questions.
  - Always answered by the user. `--yes` never skips questions.
- Write-back:
  - Answers go into the primary spec file, integrated into the relevant sections. Each adds or updates an entry in the spec's final "Decisions made in this spec" section.
  - Out of scope and the end-to-end step are added if missing. No requirement the user wrote is removed unless an answer says so.
  - Inline input under `sources/` is never edited. With no file source, answers live only in `plan.md` Decisions.
  - `plan` shows a short summary of the spec changes.
  - `plan.md` Decisions cite the spec section changed, and the spec wins if they disagree.
  - `planner`, scouts and reviewers read the updated spec.

## Outline

- `reference/plan-format.md`, `plan`, `planner`: the targeted Verify rule and its exception. `plan-reviewer`: the blocking check.
- `reference/plan-format.md`: the `## Out of scope` section in `plan.md` (after Coverage). `milestone-reviewer` and `reviewer`: use it (M10's category).
- `plan` skill: the new sequence, the interview phase with scaling and `--skip-interview` (argument hint included), the completeness checks, the question-rules format defined once, and write-back.
- `plan` skill: end the hand-off with the `/clear` or new-session recommendation.
- `planner`, `scout`, `scout-heavy`, reviewers: read the updated spec when detailing or reviewing.
