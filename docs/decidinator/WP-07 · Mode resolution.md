# WP-07 · Mode resolution

```text
Work package WP-07 · Mode resolution
Spec: docs/decidinator/Decidinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/decidinator/Decidinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/decidinator/decidinator-verification.md. Headless sessions are out of scope.

Goal: every question whose ladder has ended is written to the decision log, and in sidecar mode to the sidecar, with the correct provenance.

Depends on: WP-06 (complete).
Spec sections: Question lifecycle steps 5-7 and Rules; Oracle ladder (best answer); Decision log; Questions sidecar (deduplication, context labels).

Scope:
- Replace WP-06's stub. Resolved: append an oracle-unconfirmed decision. Final unresolved in ask mode: keep the question pending for the gate's pass-through, then record the user's answer as user from the AskUserQuestion result (a PostToolUse hook on AskUserQuestion). Final unresolved in sidecar mode: pick the best answer, append an oracle-provisional decision, and add or extend the sidecar entry.
- Deduplication by normalized hash and by the verdict's duplicate_of: extend the existing entry's Depends on instead of adding one.
- Context labels from DECIDINATOR_CONTEXT, else session ID and branch.
- /decidinator:status extended with counts of open sidecar entries and unconfirmed decisions.

Out of scope: the review, confirm, export, and import commands (WP-09).

Acceptance criteria:
- Tests for each outcome: resolved, ask-mode user answer, sidecar provisional with a new entry, and sidecar with a duplicate.
- The best-answer function passes table tests, including a confidence tie resolved to the higher rung.
- In sidecar mode (set by DECIDINATOR_MODE=sidecar), an unresolved question is written to the sidecar and the gate never lets AskUserQuestion through for it.
- Every log and sidecar entry written in tests parses back with the WP-03 library.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
