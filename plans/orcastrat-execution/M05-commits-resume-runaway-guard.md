# M05: Worker commits, resume, runaway guard (Changes 1, 2, 3)

- Status: outline
- Format: 2
- Goal: Workers commit their own work with `<task ID>: ` subjects, and `run` verifies `BASE..HEAD`, makes the status commit with the `Orcastrat-Task:` trailer, and checks for pushes. A failed attempt is resumed once on the same agent before escalating. Escalation resets to `BASE`, and commits the preserved report and failure-log entry without a trailer. The ladder is capped at three rungs, with a worker breaker, a failure log, and escalation context. `Max run time`, `Max tasks` and `Max milestones` pause with `LIMIT`. `run-state` exists with bats tests, and `status` shows a `Failures:` line.
- Depends on: M04
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout-heavy

## Context

Governing sources: spec §2 (Change 1), §3 (Change 2), §4 (Change 3), §1.3, §1.5; Decisions D05, D06, D23, D29, D31, D49.

- Leftover background work (D49, spec §4): after every agent returns (workers, reviewers, scouts, the planner, and every agent later milestones add), `run` checks the agent's completion notice. If it reports background work still running, `run` stops that agent's task with the Stop Task tool. If Stop Task fails, `run` appends `background-warning <UTC> <agent> <task or milestone ID> "<notice text>"` to `plans/<slug>/notes/run-log.md` and continues. `run` never kills processes by PID. This is a `run` rule, stated once in its dispatch section.

- Worker git rules, in all six worker agents:
  - Commit when the task is done and Verify passes. Subjects start `<task ID>: `, and several commits are fine.
  - Never push, switch branches, rebase, reset, stash, or rewrite history.
  - The precedence rule, reworded: project instruction files don't govern pushing, branching, or history. Committing the task's changes is expected.
  - Remove the "don't commit" rules and "your work can be lost".
- Only the success commit, `chore(plan): <task ID> done`, carries `Orcastrat-Task: <task ID>`. The failed-attempt commit, `chore(plan): <task ID> attempt <n> failed`, has no trailer.
- The report file path is `plans/<slug>/notes/reports/<task-id>.md` (Change 9). Workers start writing it in M06. The scope check and the report preservation handle it from now on, and skip preservation when the file doesn't exist.
- The failure log is `plans/<slug>/notes/<task ID>-failures.md`. Each entry has: attempt, tier, UTC timestamp, description, error (at most the last 40 lines of the Verify log), hypothesis, fixes tried.
- D23: remove only the soft-reset. The branch check and `STRAY` stay.
- `run-state` follows D06 exactly, is built to M02's bash rules (D04 naming), and has bats tests. `Max run time` uses `run-state elapsed`. Per D06, `run-state start` runs at the end of preflight, after "Proceed?".
- New header fields are optional with defaults (D29). The flags `--max-run-time`, `--max-tasks` and `--max-milestones` beat the header fields. `--max-tasks` already exists and keeps its meaning.
- D31 (the `Re-tiered:` starting rung) is wired in M14. Here, the ladder starts at the task's Tier.

## Outline

- `run-state` script and `tests/orcastrat/run-state.bats`.
- `run`: the leftover-background-work rule (D49), applied after every agent return.
- Worker agents: the commit and precedence rules above. The breaker: stop after the 3rd failed Verify run after implementation, where the expected red run doesn't count, and report `BLOCKED` / `STUCK` with one-line `HYPOTHESIS:` and `FIXES TRIED:`. When a `Failures: <path>` line is present, read the failure log and the preserved reports, don't repeat those approaches, and report a GAP if they show the Steps can't be followed.
- `run` preflight: the clean-tree check stops with `SETUP` and lists the files (`git clean -fd` rationale). Call `run-state start` at the end of preflight.
- `run` per task:
  - Record `BASE` before every dispatch. Use `scope-check` with Files + report file + failure log.
  - On success, make the status commit with the trailer.
  - Run `push-check` after every attempt; a hit goes to **Stop** `PUSHED`.
  - Remove the soft-reset part of the stray-commit guard.
- `run` failed attempts:
  - The triggers: Verify fails, reviewer FAIL, `STUCK` or no report, `RED not confirmed`.
  - Resume the same agent once, via SendMessage, with the Verify tail, the REASONS, or "turn limit reached". Reset first only for a scope violation.
  - If the resume errors, fall back to a fresh dispatch at the next tier, and record which happened.
  - Before escalating: preserve the report, `git reset --hard BASE` and `git clean -fd`, restore the report and failure log, make the no-trailer commit, then set `BASE = HEAD`.
  - Cap at three rungs from the planned Tier, never past `specialist`. The third failure goes to `Blocked: STUCK`, with the replanning note.
  - A fresh escalation dispatch carries `Failures: <path>`.
- `run` recovery: treat `recover`'s interrupted-attempt list as failed attempts at their recorded tier, handled per Change 1.
- `run` limits: check time and tasks before each serial task or parallel batch, and milestones after each milestone completes, including its review. Hitting one is a **Pause** with reason `LIMIT`, and calls `run-state end`. Add `LIMIT` to the Pause reasons. Call `run-state end` at every Pause, Stop and completion.
- `reference/plan-format.md`: the new header fields with defaults (D29), the Commit field (worker commits with the task ID prefix; `run`'s status commit carries the trailer), and the failure log path.
- `status` skill: a `Failures:` line listing tasks with failure logs. `status-reader` takes this over in M09.
