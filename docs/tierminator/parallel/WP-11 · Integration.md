# WP-11 · Integration

```text
Work package WP-11 · Integration
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md (P5, and the Recommendation), the worktree helpers in plugins/tierminator/scripts/lib/git.js, lib/wave-run.js, lib/h4-wave.js and plugins/tierminator/hooks/hooks.json.

Goal: when a wave closes, its commits are cherry-picked onto the run branch in plan order, in the main tree; a task whose pick conflicts is set aside and run again serially; the plan's verify runs and halts the run if it fails; and the run moves on. There is no conflict-resolver agent (spec, "Conflicts").

Depends on: WP-06, WP-09, WP-10.
Spec sections: Integration; Conflicts; Plan-level verify; Closing a wave; Lifecycle.

Scope:
- lib/integrate.js: integrateWave(state, cwd), run by hook code in the main tree on the run branch:
  1. Check the main tree is on the wave base with an empty status; if not, halt with the reason starting "MAIN TREE:" (the user committed during the run, or a worker leaked).
  2. For each done task of the wave in id order, cherryPick (WP-06) the tip of its slot branch `tierminator/<runId>/<task>` (never -x, so the message and its Tierminator trailers are kept and committedTasks still finds them).
  3. A conflicting pick is aborted (cherryPickAbort, WP-06, leaving the tree as it was), the task is added to `wave.setAside`, and the remaining picks go on.
  4. After all picks, run the plan's verify when the wave is parallel and the plan has one: runVerify(cwd, command) runs it through the platform shell in the main tree, returns the exit status and the bounded tail of the output (at most 4,000 characters), and runs under the hook's timeout. A failure halts the run naming the command and the output; nothing repairs it, nothing is reset, and the picks stay on the run branch (spec O8, proposed: confirm it with the user before this package is planned if it is still marked proposed). Verify does not run on resume.
  5. Remove the slot worktrees and branches of the integrated tasks with worktreeRemove and branchDelete (they are tierminator's own, named `tierminator-<run>-<task>`). A set-aside task's branch is kept until its re-run finishes.
- The set-aside tasks: when the wave is finished and verified, the run continues with each set-aside task as a serial wave, in id order, through today's serial path, at the tier it last ran, as a fresh attempt with no ladder step charged (a serial task runs alone, so it cannot conflict again). WP-10 computes the next wave with these first. The end summary text counts the conflicts (one line, no new statistics).
- A halting wave (a slot exhausted the ladder) integrates the tasks that passed, skips verify, then halts naming the failed task. The failed slot's worktree is left in place for inspection.
- Replace WP-09's "integration is not built yet" stub. Run integration in the hook that settles the wave's last task (name it: SubagentStop's timeout in hooks.json is 15 s and PostToolUse's is 60 s), and give that hook the timeout the P5 findings recommend. The state moves to the next wave, the set-aside re-runs, or complete.
- Tests with real repositories: a clean wave of three gives three linear commits on the run branch, one per task, with their trailers; a conflict aborts that pick, integrates the others, and the conflicting task then runs serially and lands as one commit; a halting wave integrates its passers; a moved run branch or a dirty main tree halts with "MAIN TREE:"; verify runs only for a parallel wave and only when the plan has one, and a failing verify halts with the output and leaves the picks; cleanup removes every slot worktree and branch it made (including a locked worktree) and touches no other worktree or branch; the main tree's status stays empty throughout (with the exclude entry in place); committedTasks finds the integrated tasks.

Out of scope: a conflict resolver (WP-12, deferred), repairing a failed verify (WP-13, deferred), the display (WP-16, deferred).

Acceptance criteria:
- A wave of three independent fixture tasks runs end to end in the hook tests and the run completes; a forced conflict is integrated by the serial re-run and the history is linear with one commit per task.
- Serial plans: node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
