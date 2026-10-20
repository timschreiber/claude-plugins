# WP-10 · Starting waves and the hand-back and guard hooks

```text
Work package WP-10 · Starting waves and the hand-back and guard hooks
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md (P4 especially, and the Recommendation, "Decided 2026-10-20 (the user): option C", for the permission restriction), plugins/tierminator/scripts/h3-post-approval.js, lib/execute.js, h1-plan-rules.js, h5-guard.js, lib/wave-run.js and lib/h4-wave.js, and tests/tierminator/hooks.test.js.

Goal: a run starts in its first wave, moves from wave to wave, and the hand-back and stop-guard hooks understand several workers in flight.

Depends on: WP-09.
Spec sections: Starting a wave; Lifecycle; Notices; Resuming (starting part-way).

Scope:
- H3 and lib/execute.js start the run with the first wave computed from the tasks not yet done. A wave of one task starts exactly as a run starts today (state.current); a wave of two or more starts a wave state. When a wave closes and the next is computed, a single task goes to the serial path and several to the wave path, so one plan can alternate. After a parallel wave is integrated, the tasks in its `setAside` list (a conflicting pick, WP-11) come first, each as a serial wave in id order. A serial plan's state and behavior are identical to today.
- Before a run of a graph plan starts (H3, lib/execute.js, interactive and headless), call excludeWorktrees (WP-06) so the main tree stays clean. Nothing else is checked or written: there is no settings check, no `baseRef` and no `isolation` (findings, option C: tierminator makes the worktrees, so the base is right by construction). Serial plans never reach this and write nothing.
- The start notice for a graph plan gains one line when the hook input's `permission_mode` is `default` or `acceptEdits` (or, headless, when the run was started in one): "Parallel workers ask for permission for each commit in this mode; a shell command that starts with cd cannot be allowed permanently. Use auto or bypassPermissions mode to run unattended." Text only; nothing about the run changes. The same restriction goes in the documentation (WP-17).
- H1: a background worker's hand-back is matched to its slot by agent id and judged through the same function as the SubagentStop path, once, through the per-slot claim. Several hand-backs close together each deliver their own notice, and each says only what is true then (dispatch the next startable tasks, or end your turn because others are running, or the next step after the wave closed).
- H5: the stop guard does not block a turn end while any slot is in flight, and tells Claude to end its turn; the edit guard is unchanged. The user-visible run lines keep today's text for now (WP-16 changes them).
- Tests, additive: a plan with waves of 1, 3 and 1 tasks runs through all three with real commits; two hand-backs arriving together both deliver once; the stop guard does not loop; a typed prompt stops a parallel run as it stops a serial one; a graph plan adds the exclude entry once and a serial plan adds nothing; the permission line appears in default and acceptEdits mode and not in auto or bypassPermissions mode.

Out of scope: integration (WP-11); the display (WP-16).

Acceptance criteria:
- Serial plans: node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.
- Mixed wave sizes in one plan work, up to the integration stub of WP-09.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
