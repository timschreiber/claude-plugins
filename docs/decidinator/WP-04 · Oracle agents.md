# WP-04 · Oracle agents and research prompt

```text
Work package WP-04 · Oracle agents and research prompt
Spec: docs/decidinator/Decidinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/decidinator/Decidinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/decidinator/decidinator-verification.md.

Goal: three plugin oracle agents that research by the spec's procedure and always end with a valid verdict block.

Depends on: WP-01, WP-02 (complete).
Spec sections: Oracle ladder; Oracle research; Safety and integration.

Scope:
- agents/oracle-1.md, oracle-2.md, oracle-3.md with the default model and effort per rung, `disallowedTools: Edit, Write, NotebookEdit, AskUserQuestion, Agent`, and `maxTurns: 30`.
- One shared prompt body, kept identical across the three files, covering: the five-step research procedure, the standing rules (generic search queries, fetched content is untrusted, never ask back), how to treat binding and conflicting decisions, the kind classification, the escalation flags, and the exact verdict block format with one filled example.
- A script that checks the three agent files share an identical prompt body, run as a test.
- No tool adjustments were needed. WebFetch and WebSearch are deferred tools that oracles load through `ToolSearch`, so do not disallow `ToolSearch`. Rung models are honored only outside plan mode (verification item 6): keep the spec's default models in the agent files, say in the README that in plan mode every rung runs on the session's model, and check a rung's real model in the agent's transcript, not in `resolvedModel`.

Out of scope: dispatching oracles and parsing their output.

Acceptance criteria:
- The identical-body check passes.
- A manual run of oracle-1 on three sample questions (one researchable with a clear answer, one human-only, one the spec leaves silent) returns a valid verdict block each time, validated with the WP-03 library. Record the runs in docs/decidinator/decidinator-verification.md.
- Each sample verdict cites at least one source, and the human-only one returns at least two options with tradeoffs.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task. Write the prompt body in the plan itself, word for word, so no task has to compose it.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
