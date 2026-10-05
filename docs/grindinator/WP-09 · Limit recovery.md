# WP-09 · Limit recovery

```text
Work package WP-09 · Limit recovery
Spec: docs/grindinator/Grindinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/grindinator/Grindinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/grindinator/grindinator-verification.md from WP-01.

Goal: a usage limit pauses the run until the reset and then continues the same package by phase, without counting as a failure.

Depends on: WP-03, WP-05, WP-08.
Spec sections: Runner contract (Limits and recovery, Git and state); Architecture (lifecycle step 6); Repository layout.

Scope:
- Reset time resolution in the contract's order: the result file's `limit.resetsAt`, any field WP-01 found, then a fixed five-hour wait, plus five minutes of grace.
- A sleep loop that wakes at least every 60 seconds and compares an injectable clock to the target, so a machine that slept through the reset continues promptly.
- Phase detection from the result file and plan directory: no plan file (rerun from planning), plan saved with tasks pending (discard uncommitted changes with the WP-08 helper, then launch `/tierminator:execute <planFile> --from <first unfinished task>`), all tasks committed (treat as `complete`).
- A cap of three consecutive limit waits per package, then exit 3. A reset more than 24 hours away stops with exit 3 unless `--wait-weekly` is set.
- Waits recorded in `state.json` and listed in `summary.md`.
- Location: runner code goes under `tools/grindinator/` and tests under `tests/grindinator/`, using the stub `claude` in `tests/grindinator/fixtures/`.

Out of scope: Decidinator integration.

Acceptance criteria:
- Fake-clock tests: sleep until reset plus grace, a clock jump past the target resuming at once, the five-hour fallback, each phase row of the recovery table, the cap giving exit 3, and the weekly stop.
- A stub scenario test runs limit then success and ends with the package done and no failed attempt recorded.
- `node --test tests/grindinator/*.test.js` passes.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
