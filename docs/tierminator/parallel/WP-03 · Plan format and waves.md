# WP-03 · Plan format and waves

```text
Work package WP-03 · Plan format and waves
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-reference.md, plugins/tierminator/scripts/lib/tasks.js, plugins/tierminator/scripts/lib/sidecar.js and plugins/tierminator/scripts/h2-gate-exit-plan.js, and the existing tests that cover them.

Goal: the task block accepts and normalizes after, setup and verify, and a pure module computes waves from the dependency graph. A graph plan is accepted and still runs serially.

Depends on: none.
Spec sections: Concepts; The plan (Task block, Validation); Execution (Starting a wave, for the cap).

Scope:
- lib/tasks.js: a task may carry an optional after (array of task ids). Absent after normalizes to the previous task's id, or [] for T01. Each id must name an earlier task; no duplicates, no self reference. The block may hold only tasks, setup (array of at most 10 non-empty single-line strings) and verify (a non-empty single-line string); anything else is an error. All errors are still collected. parseBlock returns the normalized tasks (every task with an explicit after) plus setup, verify and graph (true when the planner wrote any after). parsePlan passes them through. Today's TASK_KEYS are all required strings; after is optional, so handle that separately.
- Make sure the tasks file that H2 writes and the state that H3 saves keep after, setup, verify and graph (read sidecar.js and the hooks first). Run state gains setup, verify and graph next to tasks. Nothing else in the run reads them yet, so a graph plan runs exactly as a serial one.
- lib/waves.js, new and pure: waveOf and waves(tasks, doneIds) giving the waves as arrays of task ids in id order, where wave 1 holds the tasks with no unfinished dependencies and a done dependency counts as satisfied; startable(waveIds, inFlightIds, cap) giving the queued ids that may start; maxParallel(env) reading TIERMINATOR_MAX_PARALLEL (a positive integer; unset or invalid means 5).
- Tests for all of the above, additive to the existing test files where they exist.

Out of scope: the approval table and the planner rules (WP-04), running waves in parallel, and any hook behavior change for serial plans.

Acceptance criteria:
- Tests: a plan with no after normalizes to a chain; after [] makes independent tasks; a diamond graph gives three waves; a cycle, a forward reference, a duplicate, a self reference, an unknown id, a bad setup or verify, and an unknown top-level key are each rejected with the field named; done tasks count as satisfied; the cap and the environment variable behave as stated.
- A serial plan's parsed result differs from before only by the added normalized after fields.
- node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
