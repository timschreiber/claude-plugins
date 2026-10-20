# WP-17 · End-to-end run and docs

```text
Work package WP-17 · End-to-end run and docs
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md, docs/tierminator/tierminator-e2e-run.md and tierminator-execute-plan-run.md (the runbook style and where results go), docs/tierminator/tierminator-reference.md and plugins/tierminator/README.md.

Goal: the first release is proven end to end by a hand-run runbook, and every document says what is built and what is deferred.

Depends on: WP-01 to WP-04, WP-06 to WP-11, WP-14.
Spec sections: Rollout (Done means); Risks; Changes by file.

Scope:
- A fixture repository for the scenarios, built the way the existing end-to-end fixtures are, and a runbook docs/tierminator/tierminator-parallel-run.md in the style of the existing runbooks, with a result file per scenario where the others keep theirs. Scenarios: (1) three independent tasks finish in about the time of the slowest (compare the tasks' start and finish times in the telemetry file; the summary's speed-up line is deferred); (2) a forced conflict: the conflicting pick is aborted, the other tasks are integrated, the conflicting task runs again serially, and the history is linear with one commit per task; (3) a failed task retries in place while its siblings run; (4) an exhausted task halts after its siblings settle with the passers integrated, and /tierminator:execute finishes the rest; (5) a plan-level verify fails: the run halts with the command and output named, the picks stay, and the user's fix plus /tierminator:execute finishes the rest; (6) a serial plan behaves as before; (7) in the default permission mode (hand-run, interactive) a parallel plan asks for approval of each worker commit, every request can be answered, the run completes, and the start notice carries the permission line; (8) the same plan headless with `--permission-mode auto`, run from a script, with the result file and telemetry checked. Interactive scenarios are hand-run; headless ones run from a script.
- Documentation: replace the "Serial only" non-goal in tierminator-reference.md with a Parallel execution section (the plan format, waves, worktrees made by tierminator and their names, the guard hook, integration in the main tree, conflicts re-run serially, setup, plan-level verify and what a failure leaves, resuming and cleanup by name, TIERMINATOR_MAX_PARALLEL, the permission restriction for unattended runs (in the default and acceptEdits modes every worker command asks for approval and a command that starts with `cd` cannot be allowed permanently, so unattended and headless runs use auto or bypassPermissions), the state lock, the new files and tests, and limitations including what is deferred: the conflict resolver, the overlap flag, verify repair, the usage-limit rule, the new result fields, and the display and summary lines); the plugin README (usage, the environment variable, limitations); CLAUDE.md's tierminator paragraph; docs/README.md rows for the spec, the findings and the runbook; the note on the parallel non-goal in tierminator-spike-spec.md; the spec's status line (built, with the date) and its open decisions marked decided (O8 included).
- Do not claim anything in the docs that an evidence file does not support.

Out of scope: new features, version fields, pushing, and the deferred packages.

Acceptance criteria:
- The runbook exists with all eight scenarios and their pass conditions; scenarios 6 and 8 and whatever else can run headless have been run, with results recorded; the rest are listed as pending for a hand run.
- The documents above are updated and consistent with each other.
- node --test tests/tierminator/*.test.js, tests/decidinator/*.test.js and tests/grindinator/*.test.js pass; ./scripts/Validate-All.ps1 passes.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
