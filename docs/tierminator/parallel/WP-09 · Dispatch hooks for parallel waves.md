# WP-09 · Dispatch hooks for parallel waves

```text
Work package WP-09 · Dispatch hooks for parallel waves
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md in full (its P1 and P2 recommendation decides how workers are placed), plugins/tierminator/scripts/h4-dispatch.js, plugins/tierminator/scripts/lib/wave-run.js, the worktree helpers in lib/git.js, state.update in lib/state.js, the six agent files in plugins/tierminator/agents/ and tests/tierminator/hooks.test.js and agents.test.js.

Goal: H4 dispatches, judges, retries and resumes the workers of a parallel wave, each in its own worktree, and the worker agents run the plan's setup commands.

Depends on: WP-01, WP-06, WP-07, WP-08.
Spec sections: The dispatch of one task; Judging a task; Setup; State; Notices.

Scope:
- h4-dispatch.js stays as it is for serial waves. When the run state has a wave, each mode hands over to a new lib file (for example lib/h4-wave.js). Every change to the wave state goes through state.update.
- pre: find the slot from the Task: line, check it through checkDispatch, then place the worker as WP-01 recommends: M1 requires the isolation parameter or adds it with updatedInput (never a permissionDecision), or M2 makes the worktree with worktreeAdd (serialized by the state lock) and relies on the Worktree: line. Record the slot's worktree, branch and head. The main tree is not checked or reset.
- stop and the hand-back path: judge the slot from its report and from Git in its own worktree (one commit since its head, the Tierminator-Task and Tierminator-Plan lines, a clean tree, still on its own branch); claim the attempt per slot; a retry discards the worktree and its branch (worktreeRemove, branchDelete) and the next dispatch makes a fresh one from the wave base; record the notice. No reset --hard in a parallel wave.
- post, failure and the three resume modes work per slot: a SendMessage is matched to a slot by agent id.
- All six tier agents get a Parallel section in their shared body: when the message has "Parallel: yes", run the tasks file's setup commands first, in order, with the shell, and stop at the first failure by reporting FAILED with a NOTE starting "SETUP FAILED:"; work only in the worktree. Update agents.test.js (the bodies stay identical).
- When the last slot of a wave settles, the wave is closed in the state and the run halts with the reason "integration is not built yet", so this package is testable alone. WP-11 replaces that stub.
- Tests with real commits for a wave of three: dispatch, a clean finish, a retry in place while the others run, an exhausted slot halting after its siblings settle, a stale stop, a turn-limit resume per slot, and a setup failure being fatal. Serial hook tests are untouched.

Out of scope: starting waves (WP-10), the hand-back, guard and display hooks (WP-10), integration (WP-11).

Acceptance criteria:
- A wave of three independent fixture tasks runs to the stub in parallel.
- Serial runs behave exactly as before: node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.
- No script grants a permission (the existing test for that still passes).

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
