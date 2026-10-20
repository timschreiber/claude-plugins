# WP-09 · Dispatch hooks for parallel waves

```text
Work package WP-09 · Dispatch hooks for parallel waves
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md in full (its Recommendation decides how workers are placed: M1, the Agent tool's isolation, for tasks; the M1 base mechanism is an open decision, see the note in parallel/README.md, so read the findings for what was settled), plugins/tierminator/scripts/h4-dispatch.js, plugins/tierminator/scripts/lib/wave-run.js, the worktree helpers in lib/git.js, state.update in lib/state.js, the six agent files in plugins/tierminator/agents/ and tests/tierminator/hooks.test.js and agents.test.js.

Goal: H4 dispatches, judges, retries and resumes the workers of a parallel wave, each in its own worktree, and the worker agents run the plan's setup commands.

Depends on: WP-01, WP-06, WP-07, WP-08.
Spec sections: The dispatch of one task; Judging a task; Setup; State; Notices.

Scope:
- h4-dispatch.js stays as it is for serial waves. When the run state has a wave, each mode hands over to a new lib file (for example lib/h4-wave.js). Every change to the wave state goes through state.update.
- lib/worktree-base.js, new: the one place that knows how an isolated worktree gets the wave base (by default Claude Code uses the remote's default branch, so every worker would start from stale code). It exports check(cwd) returning null or a problem that names the exact fix, and nothing else in the plugin may depend on how the base is achieved. Which mechanism it implements is the open decision in parallel/README.md: write it from what the findings state when this package is planned; if they state none, stop and say so.
- pre: find the slot from the Task: line, check it through checkDispatch, then place the worker as the findings recommend: M1 adds `isolation: "worktree"` with updatedInput when the call lacks it (never a permissionDecision; measured as `p1-hook-isolation`), and denies a call that names another isolation. The worktree does not exist yet, so record only the slot's head (the wave base). The main tree is not checked or reset.
- Placement facts arrive later and in either order: SubagentStart gives `cwd` (the worktree) and agent_id, PostToolUse on Agent gives `agentId` and, when present, `tool_response.worktreePath` and `worktreeBranch` (whether an interactive background launch carries them is a pending interactive cell: take the path from SubagentStart `cwd` first). Join them by agent id through state.update with recordPlacement (WP-08), whichever comes first; the branch may stay unknown (read it from Git in the worktree) and is `worktree-agent-<agent_id>` by default (inferred in the findings: verify it in a test with real Git).
- Before the judge runs, check the worktree really was made at the wave base (its merge-base with the wave base is the base) and pass that fact to judgeSlot: a failure is the fatal "WORKTREE BASE:" of WP-08.
- stop and the hand-back path: judge the slot from its report and from Git in its own worktree (one commit since its head, the Tierminator-Task and Tierminator-Plan lines, a clean tree, still on its own branch); claim the attempt per slot; a retry discards the worktree and its branch (worktreeRemove, which copes with Claude Code's lock, and branchDelete; Claude Code keeps an isolated worktree that holds a commit until its periodic sweep, so tierminator must remove it) and the next dispatch makes a fresh one from the wave base; record the notice. Read the worktree's HEAD in the worktree itself: SubagentStop's `cwd` is the worktree, not the project, so keep preferring the state's recorded cwd for the main tree (`s.cwd ?? input.cwd` in h4-dispatch.js). No reset --hard in a parallel wave.
- post, failure and the three resume modes work per slot: a SendMessage is matched to a slot by agent id.
- All six tier agents get a Parallel section in their shared body: when the message has "Parallel: yes", you were started inside a Git worktree: run the tasks file's setup commands first, in order, with the shell, and stop at the first failure by reporting FAILED with a NOTE starting "SETUP FAILED:"; never `cd` out of the worktree; take the worktree's absolute path from `git rev-parse --show-toplevel` (drive-letter form, `C:/...`) and give every file-tool call an absolute path that starts with it, and never build a path from `pwd` output (Git Bash prints `/tmp/...`, which file tools resolve to the wrong place; P1 lost a write that way). A message with a "Worktree:" line is the resolver's and does not reach these agents. Update agents.test.js (the bodies stay identical).
- When the last slot of a wave settles, the wave is closed in the state and the run halts with the reason "integration is not built yet", so this package is testable alone. WP-11 replaces that stub.
- Tests with real commits for a wave of three: dispatch, a clean finish, a retry in place while the others run, an exhausted slot halting after its siblings settle, a stale stop, a turn-limit resume per slot, a setup failure being fatal, pre adding isolation through updatedInput with no permissionDecision (and denying another isolation value), the placement facts joining in either order, and a worktree not at the wave base failing as "WORKTREE BASE:". Serial hook tests are untouched.

Out of scope: starting waves (WP-10), the hand-back, guard and display hooks (WP-10), integration (WP-11).

Acceptance criteria:
- A wave of three independent fixture tasks runs to the stub in parallel.
- Serial runs behave exactly as before: node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.
- No script grants a permission (the existing test for that still passes).

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
