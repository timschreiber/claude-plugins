# WP-10 · Decidinator integration in the runner

```text
Work package WP-10 · Decidinator integration in the runner
Spec: docs/grindinator/Grindinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/grindinator/Grindinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/decidinator/decidinator-reference.md.

Goal: every runner session is armed in sidecar mode, labeled by package, and writes its decision files outside the tracked tree during the run; after each complete package they are copied to their repo paths and committed, so the next package starts clean.

Depends on: WP-04 (the `DECIDINATOR_LOG` and `DECIDINATOR_SIDECAR` variables), WP-08.
Spec sections: Runner contract (Environment, Git and state); Component requirements (R-G3, R-D5); Open items (O-7); Repository layout.

Scope:
- Set `DECIDINATOR_MODE=sidecar` and `DECIDINATOR_CONTEXT=<package id>` for each attempt, unless configuration disables Decidinator, in which case none of the Decidinator variables are set.
- Also set `DECIDINATOR_LOG=.grindinator/decisions/decisions.md` and `DECIDINATOR_SIDECAR=.grindinator/decisions/open-questions.md` (R-D5), under the `.grindinator/` directory that `.git/info/exclude` hides, so oracle writes never dirty the tree or enter a task commit (WP-01 V7).
- Read the repo decision log and sidecar paths from `.claude/decidinator.json`, falling back to `docs/decisions.md` and `docs/open-questions.md`. Before the first package, seed the two `.grindinator/decisions/` files from those repo paths when they exist.
- After a `complete` outcome and before the gate, copy the two files over their repo paths and commit only those two with the message `chore(grindinator): decisions for <id>`. Any other dirty file fails the package.
- `summary.md` lists the open sidecar entries and the `/decidinator:export` command for a stakeholder copy.
- An optional `--stop-on-open-questions` flag, default off, stops the run after a package that adds open entries.
- Location: runner code goes under `tools/grindinator/` and tests under `tests/grindinator/`, using the stub `claude` in `tests/grindinator/fixtures/`.

Out of scope: changes to Decidinator itself; the variables are WP-04's.

Acceptance criteria:
- Tests: the `DECIDINATOR_LOG` and `DECIDINATOR_SIDECAR` variables are set; both files are seeded from the repo paths before the first package, and seeding is skipped when those do not exist; the repo paths are untouched until a package completes; decision-file changes are committed in their own commit; an unrelated dirty file fails the package; open questions appear in the summary; the stop flag stops after the right package; disabled mode sets no environment.
- `node --test tests/grindinator/*.test.js` passes.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
