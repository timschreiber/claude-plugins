# WP-10 · Decidinator integration in the runner

```text
Work package WP-10 · Decidinator integration in the runner
Spec: docs/grindinator/Grindinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/grindinator/Grindinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/decidinator/decidinator-reference.md.

Goal: every runner session is armed in sidecar mode, labeled by package, and the decision files it produces are committed so the next package starts clean.

Depends on: WP-04, WP-08.
Spec sections: Runner contract (Environment, Git and state); Component requirements (R-G3); Repository layout.

Scope:
- Set `DECIDINATOR_MODE=sidecar` and `DECIDINATOR_CONTEXT=<package id>` for each attempt, unless configuration disables Decidinator, in which case neither is set.
- Read the decision log and sidecar paths from `.claude/decidinator.json`, falling back to `docs/decisions.md` and `docs/open-questions.md`.
- After a `complete` outcome and before the gate, commit only those two files with the message `chore(grindinator): decisions for <id>`. Any other dirty file fails the package.
- `summary.md` lists the open sidecar entries and the `/decidinator:export` command for a stakeholder copy.
- An optional `--stop-on-open-questions` flag, default off, stops the run after a package that adds open entries.
- Location: runner code goes under `tools/grindinator/` and tests under `tests/grindinator/`, using the stub `claude` in `tests/grindinator/fixtures/`.

Out of scope: changes to Decidinator itself.

Acceptance criteria:
- Tests: decision-file changes are committed in their own commit; an unrelated dirty file fails the package; open questions appear in the summary; the stop flag stops after the right package; disabled mode sets no environment.
- `node --test tests/grindinator/*.test.js` passes.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
