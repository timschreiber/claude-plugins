# M12: The decider (Change 12)

- Status: outline
- Format: 2
- Goal: A `decider` agent answers every GAP during a run with a recommendation (or `no recommendation`) and a `local` or `stop` label. With `Auto-decide: local` or `--auto-decide`, `run` records `local` recommendations as Decisions and continues, up to `Max auto-decisions` per invocation, then pauses with `LIMIT`. Otherwise the stop report carries the recommendation. `plan` never uses the decider.
- Depends on: M11
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §13 (Change 12), §1.3, §22 item 3 (`decider` allowlist); Decisions D12, D13, D29, D33.

- D48, D66: the new agent file gets the `## Search and command bounds` section and the `## No prototyping or duplicate work` section (both added in M04), and its `tools` line names no `Agent`, `Task`, `Skill` or `Artifact`; `tests/orcastrat/agent-files.bats` checks all three.

- `decider`:
  - Frontmatter: `model: opus`, `effort: high`, `maxTurns: 40`, `tools: Read, Glob, Grep, Write`.
  - Writes only its output file, `plans/<slug>/notes/decisions/<question-id>.md`, where the question ID follows D33. It replies with a status block only.
  - Reads the question, the sources, `plan.md`'s Decisions, the milestone's Context, and the relevant code.
  - Answers only the question asked: no task revisions, no structure changes, no chained decisions.
- Labels: `local` means confined to one milestone's implementation and easy to reverse. `stop` means it crosses milestones, or touches interfaces other milestones consume, data formats, public APIs, security, or licensing.
- Auto-decide `local`:
  - Record the Decision with source `auto-decided (<question-id>)`.
  - For a worker's GAP: reset to `BASE` with no failure-log entry, regenerate the brief, and retry with a fresh worker at the same tier. This is not a failed attempt.
  - For the planner's GAP: invoke the planner again.
- A `stop` label, `no recommendation`, or `Auto-decide: off` (the default, D29) stops as a GAP, with the recommendation and label in the stop report.
- `Max auto-decisions` defaults to 5 (D29) and counts per run invocation. Reaching it is a **Pause** with reason `LIMIT` (auto-decisions).
- `run-report` (M11) lists auto-decided items. Confirm that it reads the `auto-decided (` source.

## Outline

- Add `agents/decider.md`.
- `run`: dispatch the decider on every worker and planner GAP; auto-decide handling; the limit and pause; the stop-report content.
- `run` flags and `reference/plan-format.md`: `--auto-decide`, `Auto-decide: off | local`, `Max auto-decisions: <n>`.
- `plan` skill: state that planning questions are always answered by the user, and that `plan` never uses the decider.
