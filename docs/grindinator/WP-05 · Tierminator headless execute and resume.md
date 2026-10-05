# WP-05 · Tierminator headless execute and resume

```text
Work package WP-05 · Tierminator headless execute and resume
Spec: docs/grindinator/Grindinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/grindinator/Grindinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/grindinator/grindinator-verification.md from WP-01.

Goal: a headless session can run a saved plan, or resume one from a named task, with no approval and a result file at the end.

Depends on: WP-01, WP-02.
Spec sections: Component requirements (R-T3, R-T1); Runner contract (Result file, Limits and recovery); Open items (O-3).

Scope:
- WP-01 V5 found that `/tierminator:execute <plan path> [--from Txx]` already activates and runs headless with no approval, committing each task and skipping earlier tasks under `--from`. Do not add a headless branch. The package is the result file, tests and docs.
- Write the result file (WP-02's module) at the end of a headless execute, and a `declined` result with a reason for a missing plan file, an unknown task ID, a dirty tree (an untracked file counts), plan mode, or no commit identity.
- A list number does not resolve in a fresh session; the runner always passes the plan path. Document that, and do not change it.
- Workers write `Tierminator-Task:` and `Tierminator-Plan:` as separate `-m` paragraphs, so Git does not read them as trailers. Decide in the plan whether the worker writes both lines in one paragraph, or the docs say to read the message body, and record the decision.
- Update the README's Unattended runs section and the reference doc.

Out of scope: limit capture (WP-03), a list-number fix, and any runner code.

Acceptance criteria:
- Tests with a fixture plan: headless execute runs all tasks; `--from` skips earlier tasks; a missing plan, an unknown task ID, a dirty tree and plan mode give `declined`; the result file is written at the end of a headless execute.
- Interactive `/tierminator:execute` behavior is unchanged, covered by the existing tests.
- `node --test tests/tierminator/*.test.js` passes.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
