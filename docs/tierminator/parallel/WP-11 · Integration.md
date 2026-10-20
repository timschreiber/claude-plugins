# WP-11 · Integration

```text
Work package WP-11 · Integration
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md (P5 and P6), the worktree helpers in plugins/tierminator/scripts/lib/git.js, lib/wave-run.js, lib/h4-wave.js and plugins/tierminator/hooks/hooks.json.

Goal: when a wave closes, its commits are cherry-picked onto the run branch in plan order and the run moves on. A conflict halts the run for now.

Depends on: WP-06, WP-09, WP-10.
Spec sections: Integration; Closing a wave; Lifecycle.

Scope:
- lib/integrate.js: integrateWave(state, cwd). In a throwaway integration worktree on tierminator/<runId>/wave-<n>, started at the wave base and placed inside the repository at `.claude/worktrees/tierminator-wave-<n>` (listed in info/exclude by excludeWorktrees, WP-06), cherry-pick each done task's commit in id order. The WP-01 findings changed the spec's placement in the plugin data directory: the conflict resolver (WP-12) is a model that edits files there, an outside path is untested for permission prompts in a normal session (the `p2-outside` interactive cell is pending), and the inside placement passed everything. Say so in a comment, so a later finding about the outside cell can move it. When all are in, fast-forward the run branch in the main tree (git merge --ff-only), then remove the task worktrees and branches and the integration worktree and branch. The task worktrees are Claude Code's (`.claude/worktrees/agent-<id>`, branch `worktree-agent-<id>`), found from the slots' recorded placement; Claude Code keeps an isolated worktree that holds a commit until its periodic sweep and holds a lock on it while its agent runs, so remove them with worktreeRemove and branchDelete and never rely on Claude Code to do it. If the run branch is no longer at the wave base, halt with that reason and keep the integration branch. A clean wave leaves one commit per task on the run branch, with the task's own message and trailers, so committedTasks still finds them.
- A halting wave (a slot exhausted the ladder) integrates the tasks that passed, then halts naming the failed task. The failed slot's worktree is left in place for inspection.
- A conflicting pick halts the run with the conflicting files named and the integration worktree left in place. WP-12 replaces this halt with the resolver.
- Replace WP-09's "integration is not built yet" stub. Run integration in the hook that settles the wave's last task, and give that hook the timeout the findings recommend in hooks.json. The state moves to the next wave or to complete.
- Tests with real repositories: a clean wave of three gives three linear commits and a moved branch; a conflict halts and leaves the worktree; a halting wave integrates its passers; a moved run branch halts; cleanup removes every worktree and branch it made, including a locked task worktree and its `worktree-agent-*` branch, and touches no other worktree or branch; the main tree's status stays empty throughout (with the exclude entry in place); committedTasks finds the integrated tasks.

Out of scope: the resolver (WP-12), plan-level verify (WP-13).

Acceptance criteria:
- A wave of three independent fixture tasks runs end to end in the hook tests and the run completes.
- Serial plans: node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
