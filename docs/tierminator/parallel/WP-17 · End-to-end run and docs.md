# WP-17 · End-to-end run and docs

```text
Work package WP-17 · End-to-end run and docs
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md, docs/tierminator/tierminator-e2e-run.md and tierminator-execute-plan-run.md (the runbook style and where results go), docs/tierminator/tierminator-reference.md and plugins/tierminator/README.md.

Goal: the feature is proven end to end by a hand-run runbook, and every document says what is built.

Depends on: WP-01 to WP-16.
Spec sections: Rollout (Done means); Risks; Changes by file.

Scope:
- A fixture repository for the scenarios, built the way the existing end-to-end fixtures are, and a runbook docs/tierminator/tierminator-parallel-run.md in the style of the existing runbooks, with a result file per scenario where the others keep theirs. Scenarios: (1) three independent tasks finish in about the time of the slowest and the summary shows the speed-up; (2) a forced conflict is resolved and the history is linear, one commit per task; (3) a failed task retries in place while its siblings run; (4) an exhausted task halts after its siblings settle with the passers integrated, and /tierminator:execute finishes the rest; (5) a failed resolver halts with the worktree left; (6) a plan-level verify fails, the resolver repairs it, and a second verify failure halts with the branch untouched; (7) a usage limit mid-wave and the resume; (8) the same plan headless; (9) a serial plan behaves as before. Interactive scenarios are hand-run; headless ones run from a script.
- Documentation: replace the "Serial only" non-goal in tierminator-reference.md with a Parallel execution section (the plan format, waves, worktrees, integration, the resolver, setup, verify, resuming, TIERMINATOR_MAX_PARALLEL, TIERMINATOR_VERIFY_TIMEOUT, the state lock, the new files and tests, and limitations); the plugin README (usage, the environment variables, limitations); CLAUDE.md's tierminator paragraph; docs/README.md rows for the spec, the findings and the runbook; the note on the parallel non-goal in tierminator-spike-spec.md; the spec's status line (built, with the date) and its open decisions marked decided.
- Do not claim anything in the docs that an evidence file does not support.

Out of scope: new features, version fields, pushing.

Acceptance criteria:
- The runbook exists with all nine scenarios and their pass conditions; scenarios 8 and 9 and whatever else can run headless have been run, with results recorded; the rest are listed as pending for a hand run.
- The documents above are updated and consistent with each other.
- node --test tests/tierminator/*.test.js, tests/decidinator/*.test.js and tests/grindinator/*.test.js pass; ./scripts/Validate-All.ps1 passes.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
