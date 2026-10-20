# WP-14 · Resume and cleanup

```text
Work package WP-14 · Resume and cleanup
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read plugins/tierminator/scripts/lib/execute.js, plugins/tierminator/skills/execute/SKILL.md, the worktree helpers in lib/git.js, lib/waves.js, and tests/tierminator/execute-headless.test.js and hooks.test.js (the /tierminator:execute cases).

Goal: /tierminator:execute resumes a graph plan from what is committed, refuses --from for it, and clears what an earlier halted or ended run left behind.

Depends on: WP-10, WP-11.
Spec sections: Resuming; Headless.

Scope:
- A graph plan resumes from the tasks whose Tierminator-Task commits are on the branch (committedTasks). Waves are recomputed over the rest, with a done dependency counting as satisfied, and the run starts at the first of them (a serial or a parallel wave).
- --from Txx on a graph plan is refused with a message saying graph plans resume from what is committed. Plans with no after keep --from exactly as today, interactive and headless; a headless refusal writes a declined result.
- Before starting, find what an earlier run left: branches matching tierminator/<oldRunId>/* and the worktrees on them, the integration worktree included. Remove them with the git helpers after telling the user what was found, in the command's output. A leftover worktree with uncommitted work in it is named in the message before it is removed. If removal fails, say so and go on.
- Update the plan listing and the skill text if they describe resuming.
- Tests, additive: a graph plan half done resumes at the right wave; a done dependency counts as satisfied; --from is refused for a graph plan and works for a serial plan; leftovers are found, reported and removed; the headless declined result.

Out of scope: documentation (WP-17).

Acceptance criteria:
- A run halted in the middle of a parallel wave, then resumed, finishes the remaining tasks without redoing the integrated ones.
- Serial plans: node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
