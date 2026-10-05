# WP-03 · Tierminator limit capture

```text
Work package WP-03 · Tierminator limit capture
Spec: docs/grindinator/Grindinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/grindinator/Grindinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/grindinator/grindinator-verification.md from WP-01.

Goal: a usage limit that ends a session is recorded as outcome `limit`, with the reset time when Claude Code provides one.

Depends on: WP-01, WP-02.
Spec sections: Runner contract (Limits and recovery); Component requirements (R-T2).

Scope:
- A new `StopFailure` entry in `hooks/hooks.json` and a script `h7-limit.js`, inert unless the session is active.
- Recognition of a usage-limit failure using the payload fields WP-01 recorded, and writing `limit.detectedAt`, `limit.resetsAt` (null when absent) and `limit.raw` into the result file with outcome `limit`.
- `SessionEnd` cleanup must not overwrite an existing `limit` outcome.
- Plan, tasks and telemetry files left in place.

Out of scope: any sleeping or relaunching; that belongs to the runner (WP-09).

Acceptance criteria:
- Fixture-driven tests, using WP-01's payload samples: a limit payload yields outcome `limit` with the reset time when present, and with `resetsAt` null when absent.
- A non-limit failure payload does not produce a `limit` outcome.
- An inactive session produces no output and no file.
- `docs/tierminator/tierminator-reference.md` documents the hook.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
