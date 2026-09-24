# M11: Run report and rule suggestions (Changes 11, 18)

- Status: outline
- Format: 2
- Goal: `run-report` builds `plans/<slug>/notes/run-report.md` from recorded files and history, with bats tests. `run` runs it at every Pause, Stop and completion, and commits the report. When a finding category appears in the reviews of two or more milestones, `run`'s milestone-end step appends a suggested CLAUDE.md rule or hook to `notes/instruction-suggestions.md`, and the run report lists it. Suggestions are never applied.
- Depends on: M10
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §12 (Change 11), §19 (Change 18), §1.5; Decisions D04, D06, D07, D49.

- Sources the report reads: task statuses; `Orcastrat-Task:` and `Orchestratinator-Task:` trailers; failure logs; `Escalated:` lines; merge and containment notes; review notes (advisory counts, validator confirmations and downgrades); `Re-tiered:` lines (D31, once M14 lands); auto-decided Decisions (`auto-decided (<question-id>)`, once M12 lands); `notes/run-log.md` (D06 start and end lines, D07 usage lines, the M09 model notice, and D49 background warnings).
- It reports per run invocation and for the plan so far:
  - tasks done;
  - attempts, resumes and escalations per tier;
  - STUCK tasks;
  - merges resolved and reruns after failed merges;
  - containment downgrades;
  - auto-decided questions, each with its Decision;
  - advisory findings per milestone, and candidates confirmed or downgraded;
  - stops and pauses by reason;
  - wall-clock time.
- Usage is summed from the D07 lines. Where none exist, that section says `not available`. Usage is display only.
- Suggestions (Change 18):
  - a CLAUDE.md rule with draft wording, or a hook when the rule must hold every time and can be checked by a script;
  - a suggestion for a file already flagged for leanness (M09's `review.md`) says so and prefers a hook or skill.

## Outline

- `run-report` script and `tests/orcastrat/run-report.bats`, with fixture plan directories and fixture repos.
- `run`: call `run-report` at Pause, Stop and completion, and commit the report in the pause, stop or completion commit.
- `run`: the milestone-end suggestion step and `notes/instruction-suggestions.md`.
- `run-report` shows every `model-notice` line from `notes/run-log.md` (D42).
- `run-report` counts the `background-warning` lines in `notes/run-log.md` (D49), per run invocation and for the plan so far, and lists each one.
