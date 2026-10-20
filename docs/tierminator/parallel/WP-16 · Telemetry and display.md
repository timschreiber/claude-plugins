# WP-16 · Telemetry and display

> **Mostly deferred 2026-10-20.** The one fix needed for correct spend, `recordAttempt` and `outcomeOf` reading the slot instead of `state.current`, moved into WP-09's audit. Spend already attributes by agent id. The run lines, the speed-up summary and the new telemetry fields wait for a later release.

```text
Work package WP-16 · Telemetry and display
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-telemetry-findings.md, plugins/tierminator/scripts/lib/spend.js, usage.js, telemetry.js, prices.js, h5-guard.js, and tests/tierminator/spend and telemetry and usage tests.

Goal: spend is attributed to the right worker when workers overlap, and the run shows its waves and the speed-up.

Depends on: WP-10, WP-12.
Spec sections: Telemetry and display.

Scope:
- Attribution: worker usage is read by agent id (SubagentStop's agent_id and transcript path) and no longer by time window for parallel slots. Serial attribution stays as it is. First find how usage.js windows subagents and what a window means for overlapping workers, and record what you found in a comment.
- Telemetry records for slots gain wave and parallel; the resolver is its own tier row, priced as opus.
- H5 run lines: "wave 2 of 4: T03, T04, T05 running in parallel (3/5 slots)" while a parallel wave runs, and a task's finish line says its wave. Serial lines are unchanged.
- The end summary gains wall-clock time, the serial estimate (the sum of the task attempts' durations from the slots' start and finish times), and the speed-up between them, beside the existing token and cost lines, with a line saying parallelism changes time and not cost. A serial run's summary is unchanged.
- The result file's fields from WP-15 are filled from the same figures.
- Tests: overlapping workers each get their own tokens; the resolver row; the lines; the summary for a parallel run and for a serial run.

Out of scope: the plan table (WP-04).

Acceptance criteria:
- With three overlapping fixture workers, no worker is counted twice and none is missed.
- Serial plans: node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
