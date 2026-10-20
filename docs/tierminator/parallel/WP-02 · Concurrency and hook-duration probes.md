# WP-02 · Concurrency and hook-duration probes

```text
Work package WP-02 · Concurrency and hook-duration probes
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md from WP-01, docs/tierminator/tierminator-state-write-stall-findings.md, plugins/tierminator/scripts/lib/state.js and plugins/tierminator/hooks/hooks.json.

Goal: measure how Claude Code runs several background workers and several hooks at once, and how long a hook may run, so the notices and the hooks that make worktrees, integrate and verify are built on facts.

Depends on: WP-01 (reuse its probe plugin and runner).
Spec sections: Starting a wave; State (the state lock); Notices; Probes (P3, P4, P5).

Scope:
- P3a: one assistant message with three Agent calls to the probe agent. Record whether the workers overlap in time, and whether the PreToolUse hook processes overlap (log pid, start and end times per hook run). Use the option C setup of the WP-01 findings (probes/tierminator-parallel/c-runner.js, cell c-haiku-guard, where a PreToolUse hook on each Agent call makes the worker's worktree): WP-01 already measured that the foreground workers overlap in a headless run and that the three hook processes ran one after another (62 to 109 ms each), so this package adds only what is still open: the same for background (interactive) dispatch, as pending hand-run steps, and the hook timings under load.
- P4: with three background workers finishing close together, record the sequence of prompts and events that reach the model (UserPromptSubmit and Stop hook logs) in a headless session. Interactive behavior is listed as pending with hand-run steps.
- P5: a hook that sleeps 20, 120 and 400 seconds, registered on SubagentStop and on UserPromptSubmit with timeouts of 15 and 600 seconds. Record whether Claude Code waits, kills the hook at its timeout, delays other hooks or the session, and the largest timeout it accepts.
- Evidence files probes/evidence/tierminator-parallel-p3-*.json, -p4-*.json and -p5-*.json; findings sections P3, P4 and P5 added to docs/tierminator/tierminator-parallel-findings.md.

Out of scope: any change under plugins/tierminator (the lock is WP-07).

Acceptance criteria:
- Each question in the spec's P3, P4 and P5 rows is answered with an evidence file, or marked not determinable with the reason.
- The findings state the longest hook duration that works, on which events, and what timeout value hooks.json should use for the hooks that integrate and verify.
- The probes are re-runnable.
- node --test tests/tierminator/*.test.js still passes.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
