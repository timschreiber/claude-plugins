# WP-05 · Tierminator headless execute and resume

```text
Work package WP-05 · Tierminator headless execute and resume
Spec: docs/grindinator/Grindinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/grindinator/Grindinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/grindinator/grindinator-verification.md from WP-01.

Goal: a headless session can run a saved plan, or resume one from a named task, with no approval and a result file at the end.

Depends on: WP-01, WP-02.
Spec sections: Component requirements (R-T3); Runner contract (Limits and recovery).

Scope:
- Start from WP-01's V5 result. If `/tierminator:execute` already activates and runs headless, limit this package to tests and docs.
- Otherwise add a headless branch for `/tierminator:execute <plan> [--from Txx]` in `lib/execute.js` and H1: the same preconditions as headless planning (not plan mode, a commit, a commit identity, a clean tree), no approval step, and a result file at the end.
- A missing plan file, an unknown task ID, or failed preconditions produce a `declined` result with a reason.
- Update the README's Unattended runs section and the reference doc.

Out of scope: limit capture (WP-03) and any runner code.

Acceptance criteria:
- Tests with a fixture plan: headless execute runs all tasks; `--from` skips earlier tasks; a missing plan and an unknown task ID give `declined`.
- Interactive `/tierminator:execute` behavior is unchanged, covered by the existing tests.
- `node --test tests/tierminator/*.test.js` passes.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
