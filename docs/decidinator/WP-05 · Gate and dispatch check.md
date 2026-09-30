# WP-05 · Gate and dispatch check hooks

```text
Work package WP-05 · Gate and dispatch check hooks
Spec: docs/decidinator/Decidinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/decidinator/Decidinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/decidinator/decidinator-verification.md for the exact hook input fields.

Goal: every AskUserQuestion call in an armed session is held until its questions have oracle verdicts, and the model is told exactly which oracle to dispatch.

Depends on: WP-02, WP-03 (complete).
Spec sections: Architecture (Gate, Dispatch check); Question lifecycle steps 1 and 6; Oracle ladder.

Scope:
- Gate (PreToolUse, matcher AskUserQuestion): ignore calls from subagents (a subagent's `PreToolUse` input has `agent_id` and `agent_type`; the main thread's has neither); mint a Q- ID per question; store each question, its options, and its normalized hash in session state; deny with a reason giving the exact Agent call for the next due question (agent name, and a prompt starting "Decidinator question Q-0007" with the question, its options, and an instruction to add the surrounding context).
- Gate pass-through: in ask mode, allow a call whose questions all match (by normalized hash) questions with a final unresolved verdict. Always allow calls issued by /decidinator:review and /decidinator:confirm (a flag in session state set by those commands).
- Multi-question calls: dispatch one question at a time in order; allow a later call containing only the still-unresolved ones.
- Known behavior to plan around: a deny reaches the model as `PreToolUse:AskUserQuestion hook error: <reason>` in both `default` and `plan` mode (verification item 5), and the `Agent` call returns `async_launched` at once, so a dispatch is complete only when the recorder (WP-06) stores a verdict.
- Dispatch check (PreToolUse, matcher Agent): while a question is due, allow only an Agent call to the due rung whose prompt contains the due question ID; deny others with the expected call.

Out of scope: recording verdicts and advancing the ladder (WP-06).

Acceptance criteria:
- Unit tests with recorded hook payloads from WP-01 (`probes/evidence/decidinator-probe-interactive-*-hooks.jsonl`): a single question is denied with the correct dispatch; a three-question call produces three IDs and dispatches in order; a subagent call is ignored; a matching re-call in ask mode is allowed once its verdict is final unresolved.
- The dispatch check allows the expected call and denies a call to the wrong rung or without the ID.
- Deny reason texts are defined once as constants and covered by snapshot tests.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task, including the exact text of every deny reason.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
