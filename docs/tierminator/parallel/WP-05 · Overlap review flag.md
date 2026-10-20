# WP-05 · Overlap review flag

```text
Work package WP-05 · Overlap review flag
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read plugins/tierminator/scripts/lib/sizing.js, plugins/tierminator/scripts/h2-gate-exit-plan.js, plugins/tierminator/scripts/h5-guard.js (the headless draft review) and the tests that cover them.

Goal: ExitPlanMode flags two tasks that can run at the same time yet name the same file, so the planner adds a dependency or says why they may share it.

Depends on: WP-03, WP-04.
Spec sections: Open decisions (O6); Planner rules; Non-goals.

Scope:
- lib/sizing.js: for a graph plan only, find the pairs of tasks with no dependency path between them (transitively, in either direction) whose Files to change: lines (use filesToChange) name the same file after normalizing separators and case-insensitively on the drive and path. Flag the later task of each pair with a message naming both tasks and the file, and the two fixes: add after, or add a line "Keep T03: <why these can share files>" for the later task. The existing Keep mechanism clears the pair.
- The flag is counted by the same limited number of review rounds (MAX_REVIEWS) as the other sizing flags, after which the plan goes through. It applies in ExitPlanMode and in the headless draft review exactly as the sizing flags do.
- Tasks with no Files to change: line (opus tasks) are not compared. Directories and globs are not expanded.
- A serial plan is never flagged.
- Tests for each rule above, additive.

Out of scope: any change to the plan format, and enforcing independence anywhere else.

Acceptance criteria:
- Tests: an overlapping independent pair is flagged; the same pair with an after between them, or a transitive path, is not; Keep on the later task clears it; missing Files lines are skipped; a serial plan is never flagged; the review stops after the maximum rounds.
- node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
