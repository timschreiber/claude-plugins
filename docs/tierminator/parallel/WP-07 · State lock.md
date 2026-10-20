# WP-07 · State lock

```text
Work package WP-07 · State lock
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md (P3 especially), docs/tierminator/tierminator-state-write-stall-findings.md, plugins/tierminator/scripts/lib/state.js and tests/tierminator/state.test.js.

Goal: several hook processes can change one session's run state without losing an update.

Depends on: none (the lost-update probe P3b was dropped; the concurrent-process test below proves the race).
Spec sections: State (the state lock); Judging a task; Risks.

Scope:
- lib/state.js: update(sessionId, fn). It takes an exclusive lock file beside the state (created with the wx flag; it records the owner's pid and time), retries with short backoff, treats a lock as stale when its owner's process is gone or it is older than 30 seconds and removes it, then reads the state, calls fn(state) (which returns the new state, or null for no write), writes through the existing write (its Windows rename retries stay), and always releases the lock, including when fn throws. It returns {ok, state}; ok is false when the lock could not be had or the write failed, so a caller can use the lost-state path (saveLost).
- Attempt claims for parallel slots: a key function that includes the task id, so two slots of one run never share a claim. The serial attemptKey is unchanged.
- remove deletes the lock file; prune also sweeps old .lock files.
- Do not use update in any hook yet (WP-09 does).
- Tests, additive to state.test.js, including real child processes: three to four processes each doing many increments through update on one state file lose none; a stale lock from a dead pid is recovered; fn throwing releases the lock; a failed write reports ok false; lock waiting times out and reports ok false.

Out of scope: hook changes, and changing how the serial run reads and writes state.

Acceptance criteria:
- The concurrent test fails when update is replaced by read then write (prove the test can catch a lost update) and passes with update.
- Serial paths are unchanged: node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
