# WP-10 · End-to-end tests and documentation

```text
Work package WP-10 · End-to-end tests and documentation
Spec: docs/decidinator/Decidinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/decidinator/Decidinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/decidinator/decidinator-verification.md.

Goal: Decidinator is proven end to end in every mode and documented well enough for a stranger to install and use it.

Depends on: WP-01 through WP-09 (complete).
Spec sections: all.

Scope:
- End-to-end scenarios in a fixture repo, each a script that runs a real session and checks the resulting files:
  1. Interactive ask mode: a researchable question resolves at rung 1 without reaching the user.
  2. Interactive ask mode: a human-only question reaches the user with researched options, and the answer is logged as user.
  3. Sidecar mode: an unresolvable question gets a provisional answer and a sidecar entry, and the session continues.
  4. Sidecar mode set by `DECIDINATOR_MODE=sidecar` in an interactive session: the question is queued and `AskUserQuestion` is never let through.
  5. Plan mode: scenario 1 repeated with the session in plan mode, oracle research tools working.
  6. Escalation: a question engineered to return low confidence reaches rung 2 with rung 1's verdict in its prompt.
  7. Round trip: export, fill answers, import, and check the report.
- README.md in tierminator's style: what it does, install, requirements, how to use each mode, the stakeholder workflow, the ladder and how to change it, cost note for subscription plans, the tools to allow for unattended research (`WebFetch`, `WebSearch`, `Bash(gh search:*)`), and known limitations (headless `claude -p` sessions are out of scope; rung models are honored only outside plan mode).
- A reference document covering every hook, file format, configuration key, and environment variable.
- Leave probes/decidinator/ in place: it is outside the plugin package and never ships.

Out of scope: new behavior. Any bug found is fixed within the package that owns it, then this package is re-run.

Acceptance criteria:
- All seven scenarios pass, with their output files committed as fixtures.
- Every configuration key and environment variable in the spec appears in the reference document.
- A fresh install from the marketplace, following only the README, arms and resolves a question.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task, including each scenario's exact prompt and expected file contents.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
