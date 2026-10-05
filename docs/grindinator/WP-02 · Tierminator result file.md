# WP-02 · Tierminator result file

```text
Work package WP-02 · Tierminator result file
Spec: docs/grindinator/Grindinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/grindinator/Grindinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/grindinator/grindinator-verification.md from WP-01.

Goal: every Tierminator run that ends writes a versioned result file that a caller can read after the session is gone.

Depends on: WP-01.
Spec sections: Runner contract (Result file); Component requirements (R-T1).

Scope:
- A `scripts/lib/result.js` module that builds and writes the result file atomically (temp file, then rename), swallows every error, and never writes for an inactive session.
- Calls at each run end: completion and halt (H5), a typed prompt interrupting a run (H1), no valid plan after three tries, a declined start, and a `SessionEnd` fallback (H6) that writes `halted` with reason `session ended during run` when the state still says running.
- The path from `TIERMINATOR_RESULT_FILE`, else `<plan>.result.json`.
- Fields exactly as in the Runner contract, adjusted for WP-01's findings.

Out of scope: limit capture (WP-03) and headless execute (WP-05).

Acceptance criteria:
- A unit test per outcome (`complete`, `halted`, `no-plan`, `declined`, interrupt, `SessionEnd` fallback) checks the written fields.
- A test proves an inactive session writes no file, and another proves the file survives `SessionEnd` cleanup.
- A schema test pins `version: 1` and the field set.
- `node --test tests/tierminator/*.test.js` passes, and `docs/tierminator/tierminator-reference.md` documents the file.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
