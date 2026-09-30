# WP-06 · Recorder, ladder rules, and guard

```text
Work package WP-06 · Recorder, ladder rules, and guard
Spec: docs/decidinator/Decidinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/decidinator/Decidinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/decidinator/decidinator-verification.md for the exact SubagentStop input.

Goal: each oracle verdict is recorded and the ladder advances deterministically, with the model held to the next dispatch until the question's ladder ends.

Depends on: WP-03, WP-05 (complete).
Spec sections: Architecture (Recorder, Guard); Question lifecycle steps 2-4; Oracle ladder.

Scope:
- Recorder (SubagentStop): act only on configured rung agents; match the configured rung by `agent_type` (other subagents also fire `SubagentStop`, with an empty `agent_type`); read the report from `last_assistant_message`, or, when it is missing, from the `SubagentHandback` call's `tool_input.message` (seen in `PreToolUse` with the subagent's `agent_id`), or from the file at `agent_transcript_path`; record the model the agent actually ran on from its transcript, not from `resolvedModel`; parse the verdict with the WP-03 library; store it in session state under its question ID and rung.
- Ladder rules as a pure function: given a question's verdicts and the configured rungs, return resolved, escalate(next rung), or final-unresolved, exactly per the spec, including human-only questions never escalating.
- On escalate: mark the next rung due and give the dispatch prompt the previous verdicts as JSON, following WP-04's dispatch contract (plugins/decidinator/agents/oracle-1.md, "Your dispatch"): the gate's dispatch lines with `Rung:` set to the next rung, plus an `Earlier verdicts:` line followed by a JSON array of the earlier verdicts, lowest rung first.
- On a final state: clear the due marker and hand the question to mode resolution (a stub in this package; WP-07 fills it).
- Open for the plan, to settle with the user: the `Agent` call returns `async_launched` at once, so decide what the guard does between a dispatch and its verdict (block the model, or tell it to wait). The spec does not say.
- Guard (PreToolUse, all tools except Agent and AskUserQuestion): while a dispatch is due, deny with the expected dispatch; after guardMaxBlocks consecutive denials, step aside and log it.

Out of scope: writing the decision log and sidecar (WP-07).

Acceptance criteria:
- Table-driven tests for the ladder function cover every escalation condition, the top rung, human-only questions, and an invalid verdict (escalates).
- Recorder tests with recorded SubagentStop payloads (probes/evidence/decidinator-probe-*-hooks.jsonl), including one with no last_assistant_message: a verdict is stored under the right ID and rung; a non-oracle subagent is ignored.
- Guard tests: denial while due, pass-through when nothing is due, step-aside after the limit.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task, including the ladder function's full case table.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
