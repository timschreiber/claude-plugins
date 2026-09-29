# WP-01 · Verification spike

```text
Work package WP-01 · Verification spike
Spec: docs/decidinator-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/decidinator-spec.md in full, even if you have read them earlier in this session.

Goal: confirm or refute the six behaviors in the spec's "Requirements and verification" section, with evidence, before any product hook is built.

Depends on: none.
Spec sections: Requirements and verification; Architecture; Oracle research.

Scope:
- A throwaway probe plugin under spikes/probe/ with one read-only probe agent (tools as in "Oracle research"), and hooks on PreToolUse, SubagentStop, and Stop that append their raw JSON input to spikes/out/<event>.jsonl.
- Probe runs in four setups: interactive normal mode, interactive plan mode, headless normal mode, headless plan mode. In each, the probe agent attempts WebFetch, web search, and `gh search repos` through Bash.
- A deny experiment: a PreToolUse hook that denies AskUserQuestion and Read with a known reason string, checked in plan mode and outside it.
- A model experiment: a probe agent with `model: claude-opus-5-5` and `effort: high` that reports its model, run on each available setup (Pro, Bedrock).

Out of scope: any Decidinator product code.

Acceptance criteria:
- docs/verification.md has one row per item 1-6: result (pass, fail, partial), the evidence (log excerpt or transcript reference), and the fallback to apply if not a pass.
- For items 2 and 3, the exact hook input field names are recorded, with a sample payload.
- For item 4, the detection method is recorded, or "none found".
- The spikes/ directory is excluded from the plugin package.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
