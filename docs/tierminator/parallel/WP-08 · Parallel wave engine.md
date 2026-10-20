# WP-08 · Parallel wave engine

```text
Work package WP-08 · Parallel wave engine
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md (the Recommendation, "Decided 2026-10-20 (the user): option C", decides how tasks are placed), plugins/tierminator/scripts/lib/run.js (every function; this package is its slot counterpart), plugins/tierminator/scripts/lib/waves.js from WP-03 and tests/tierminator/run.test.js.

Goal: all the decisions of a parallel wave, as pure functions over the run state with no file or Git access: starting a wave, what may start, whether a dispatch matches, judging a slot, retrying, closing and halting, and what Claude is told.

Depends on: WP-03.
Spec sections: Starting a wave; The dispatch of one task; Judging a task; Closing a wave; State; Notices.

Scope:
- lib/wave-run.js, new. run.js is not changed (export what you need from it, nothing more). The state is the spec's wave object: n, size, base, slots, queue, phase ('working', 'integrating' or 'verifying'), halting, and setAside (the task ids whose pick conflicted and that re-run serially after the wave, WP-11).
- Placement is option C (findings): tierminator makes every slot's worktree itself, at the wave base, before the Agent call, and the worker is not isolated. slotPlacement(runId, repoRoot, taskId) is a pure function returning the slot's worktree path and branch: the path is `<repoRoot>/.claude/worktrees/tierminator-<run>-<task>` in drive-letter, forward-slash form (`C:/...`, toWorktreePath of WP-06 formats it), never a name starting with `agent-` (Claude Code uses that), and the branch is `tierminator/<runId>/<taskId>`. startWave(state, taskIds, base, cap, repoRoot) returns the state with a wave whose slots already hold their worktree and branch. startable(state) gives the task ids that may start now under the cap (id order).
- expectedCall(state, id) returns the prompt of run.js plus a "Parallel: yes" line and a "Worktree: <path>" line (the slot's path); the call carries no isolation. checkDispatch(state, toolInput) finds the slot from the Task: line and returns the slot id or the problem (already running, over the cap, wrong tier, wrong prompt, not in this wave, a Worktree: line that is not the slot's, or any isolation value at all).
- recordAgent(state, id, agentId) joins a worker's agent id to its slot, the only fact learned after the call (the hooks take the slot from the Task: line in the first message of the worker's transcript, or from PostToolUse on Agent).
- judgeSlot reuses run.js judge with the slot's own head and worktree facts supplied by the caller; a report note starting "SETUP FAILED:" is fatal. So are two facts the caller supplies, with reasons starting "WORKTREE CREATE:" (the worktree could not be made) and "MAIN TREE:" (the main tree is no longer on the wave base or is not clean, which means some worker left its worktree; the leaking slot cannot be told, so the wave halts). A higher tier cannot fix any of them. advanceSlot(state, id, outcome) returns the state and an action: done, retry (one tier up, at most two retries, a fresh attempt: its worktree and branch are discarded and made again at the wave base), wait, or a closing action. Turn-limit resumes and the single report request work per slot with the same limits as run.js.
- Closing: closeWave(state) gives integrate when every task is done, or halt-with-passers when a slot exhausted the ladder or hit a fatal, once nothing is in flight and nothing queued. A halting wave starts nothing queued.
- Text: dispatchText for the startable tasks (one Agent call each, all in one message), runningText, noticeText per action (the three notices in the spec), and haltText for a wave.
- Tests, in tests/tierminator/wave-run.test.js, covering every function and every action above, including the cap with a queue, a retry in place while a sibling runs, an exhausted slot halting after siblings settle, a stale or repeated stop for a slot, expectedCall with its Worktree line, slotPlacement (never an `agent-` name, drive-letter form), checkDispatch refusing an isolation value and a foreign Worktree line, recordAgent, and the three fatals ("SETUP FAILED:", "WORKTREE CREATE:", "MAIN TREE:").

Out of scope: hooks, the state lock, Git, integration and the resolver.

Acceptance criteria:
- No function reads or writes files or runs Git.
- Serial plans are untouched: node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
