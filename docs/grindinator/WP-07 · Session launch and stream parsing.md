# WP-07 · Session launch and stream parsing

```text
Work package WP-07 · Session launch and stream parsing
Spec: docs/grindinator/Grindinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/grindinator/Grindinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/grindinator/grindinator-verification.md from WP-01.

Goal: the runner launches one headless Tierminator session per package, captures its session ID and stream, and maps the result file to an outcome.

Depends on: WP-02, WP-06.
Spec sections: Runner contract (Environment, Result file); Architecture; Repository layout.

Scope:
- Spawn `claude -p` with the configured model, effort, permission mode and allowed tools, `--output-format stream-json --verbose`, and the prompt `/tierminator:plan <preamble and package text>`, with the environment from the contract.
- A tolerant stream parser: capture `session_id` from the init message, the final result message, and ignore unknown lines. Use WP-01's recorded shapes.
- Save the stream to `runs/<id>/attempt-<n>`, read the result file, and map it to `complete`, `halted`, `limit`, `no-plan`, `declined`, or `crashed`.
- A per-attempt wall-clock cap, and SIGINT handling that stops the child, keeps state intact, and exits 4.
- Stub scenarios: success, halted, limit, no result file, malformed stream.
- Location: runner code goes under `tools/grindinator/` and tests under `tests/grindinator/`, using the stub `claude` in `tests/grindinator/fixtures/`.

Out of scope: gates, the Git discard policy, limit waiting, Decidinator-specific behavior.

Acceptance criteria:
- A scenario test per outcome checks the mapping and the state written.
- The session ID is captured from the stub's init message, and the attempt directory holds the stream and result.
- A crash with no result file yields `crashed`, and a SIGINT test checks exit 4 and intact state.
- `node --test tests/grindinator/*.test.js` passes.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
