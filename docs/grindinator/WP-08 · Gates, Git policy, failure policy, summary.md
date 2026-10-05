# WP-08 · Gates, Git policy, failure policy, summary

```text
Work package WP-08 · Gates, Git policy, failure policy, summary
Spec: docs/grindinator/Grindinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/grindinator/Grindinator — Specification.md in full, even if you have read them earlier in this session.

Goal: a package counts as done only after its commits exist and its gate passes, and every run ends with a summary and the right exit code.

Depends on: WP-07.
Spec sections: Runner contract (Git and state, Runner exit codes); Architecture (lifecycle steps 5 and 7); Repository layout.

Scope:
- After `complete`: verify that `HEAD` advanced from the package's start commit, run the configured gate command and capture its output to `runs/<id>/attempt-<n>`, then write the `.done` marker only on a pass.
- On a gate failure or a `halted` outcome: mark the package `failed`, then stop or continue according to configuration (default: stop).
- A discard helper that runs `git reset --hard` and `git clean -fd` only when the current branch is the runner's own, and refuses otherwise.
- `summary.md` at the end of every run: per-package outcome, attempts, commits, gate result, and the stop reason.
- Exit codes 0 and 1 as in the contract.
- Location: runner code goes under `tools/grindinator/` and tests under `tests/grindinator/`, using the stub `claude` in `tests/grindinator/fixtures/`.

Out of scope: limit recovery and Decidinator commits.

Acceptance criteria:
- Tests: a `complete` outcome with no new commit fails with a clear message; a failing gate stops the run; a passing gate writes the marker; the discard helper refuses off the runner branch; the summary lists every package; exit codes are correct.
- `node --test tests/grindinator/*.test.js` passes.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
