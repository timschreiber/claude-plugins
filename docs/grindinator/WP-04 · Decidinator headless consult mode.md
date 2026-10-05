# WP-04 · Decidinator headless consult mode

```text
Work package WP-04 · Decidinator headless consult mode
Spec: docs/grindinator/Grindinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/grindinator/Grindinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/decidinator/Decidinator — Specification.md and docs/grindinator/grindinator-verification.md.

Goal: an armed Decidinator session in `claude -p` sends every open decision to an oracle and logs the result, with no question ever waiting for a person.

Depends on: WP-01.
Spec sections: Component requirements (R-D1 to R-D4); Open items (O-4).

Scope:
- In `session-start.js`, for an armed headless session (detected per WP-01), inject a rule once: `AskUserQuestion` is unavailable, every open decision goes to `oracle-1` with the standard dispatch, escalate by the ladder, and in sidecar mode record the highest-confidence answer as provisional and continue.
- Not injected on `compact`, so a compaction cannot repeat or undo it.
- Fix the recorder for headless sessions if WP-01's V6 found a failure.
- Decide in the plan whether to add the optional `Stop` check from R-D3, and record the decision.
- Update the README (replace the headless limitation), the specification, the reference, and the verification doc.

Out of scope: interactive behavior changes; runner integration (WP-10).

Acceptance criteria:
- Tests: a headless armed session gets the rule once and not after `compact`; an interactive session is unchanged; the recorder writes the log and sidecar from a headless fixture.
- The end-to-end runbook has a headless scenario with expected results.
- `node --test tests/decidinator/*.test.js` passes.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
