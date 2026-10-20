# WP-08 · Parallel wave engine

```text
Work package WP-08 · Parallel wave engine
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md, plugins/tierminator/scripts/lib/run.js (every function; this package is its slot counterpart), plugins/tierminator/scripts/lib/waves.js from WP-03 and tests/tierminator/run.test.js.

Goal: all the decisions of a parallel wave, as pure functions over the run state with no file or Git access: starting a wave, what may start, whether a dispatch matches, judging a slot, retrying, closing and halting, and what Claude is told.

Depends on: WP-03, WP-07.
Spec sections: Starting a wave; The dispatch of one task; Judging a task; Closing a wave; State; Notices.

Scope:
- lib/wave-run.js, new. run.js is not changed (export what you need from it, nothing more). The state is the spec's wave object: n, size, base, slots, queue, phase, halting, integration.
- startWave(state, taskIds, base, cap) returns the state with a wave; startable(state) the task ids that may start now under the cap (id order); expectedCall(state, id, placement) with the prompt of run.js plus a "Parallel: yes" line. The WP-01 findings fix the two placements: 'isolation' (every task; M1) adds no Worktree line, because Claude Code makes the worktree after the call, and says the call may carry `isolation: "worktree"` (H4 adds it when absent); 'explicit' (the conflict resolver only; M2) adds a "Worktree: <path>" line, with the path in the drive-letter, forward-slash form (`C:/...`) that toWorktreePath of WP-06 returns. checkDispatch(state, toolInput) finds the slot from the Task: line and returns the slot id or the problem (already running, over the cap, wrong tier, wrong prompt, not in this wave, an isolation value other than "worktree").
- recordPlacement(state, id, {agentId, worktree, branch}) stores what the hooks learn after the call, since the worktree does not exist at PreToolUse: the path and branch from PostToolUse on Agent (`tool_response.worktreePath`, `worktreeBranch`) and the path from `cwd` on SubagentStart/SubagentStop. The findings show a hook-made worktree (a WorktreeCreate hook) gives no `worktreeBranch`, so the branch may be unknown; keep it nullable and let the caller read it from Git in the worktree.
- judgeSlot reuses run.js judge with the slot's own head and worktree facts supplied by the caller; a report note starting "SETUP FAILED:" is fatal, and so is a worktree that was not made at the wave base (a fact the caller supplies, reason starting "WORKTREE BASE:"): by default Claude Code bases an isolated worktree on the remote's default branch, not the run branch (WP-01 findings), and a higher tier cannot fix that. advanceSlot(state, id, outcome) returns the state and an action: done, retry (one tier up, at most two retries, a fresh attempt with the wave base as its head), wait, or a closing action. Turn-limit resumes and the single report request work per slot with the same limits as run.js.
- Closing: closeWave(state) gives integrate when every task is done, or halt-with-passers when a slot exhausted the ladder or hit a fatal, once nothing is in flight and nothing queued. A halting wave starts nothing queued.
- Text: dispatchText for the startable tasks (one Agent call each, all in one message), runningText, noticeText per action (the three notices in the spec), and haltText for a wave.
- Tests, in tests/tierminator/wave-run.test.js, covering every function and every action above, including the cap with a queue, a retry in place while a sibling runs, an exhausted slot halting after siblings settle, a stale or repeated stop for a slot, both placements of expectedCall, recordPlacement with and without a branch, and a "WORKTREE BASE:" failure being fatal.

Out of scope: hooks, the state lock, Git, integration and the resolver.

Acceptance criteria:
- No function reads or writes files or runs Git.
- Serial plans are untouched: node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
