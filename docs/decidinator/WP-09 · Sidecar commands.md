# WP-09 · Review, confirm, export, and import commands

```text
Work package WP-09 · Review, confirm, export, and import commands
Spec: docs/decidinator-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/decidinator-spec.md in full, even if you have read them earlier in this session.

Goal: people can answer open questions in a session, confirm or override oracle decisions, and run the stakeholder round trip.

Depends on: WP-03, WP-07 (complete).
Spec sections: Commands and configuration; Decision log (provenance table, superseding); Questions sidecar (export, import, matching answers).

Scope:
- /decidinator:review: set the pass-through flag, walk open sidecar entries through AskUserQuestion with their researched options, and record each answer as a user decision that supersedes the provisional one; mark the entry answered.
- /decidinator:confirm: walk oracle-unconfirmed and oracle-provisional decisions in the spec's impact order; record approval as oracle-confirmed or an override as a superseding user decision.
- /decidinator:export [path]: write the stakeholder copy (open entries only, grouped by Stakeholder, else topic), including the version marker, and print the path.
- /decidinator:import <path>: for each entry with a filled Answer, write a superseding stakeholder decision and mark the entry imported. Classify each as confirmed (identical after normalization) or needs judgment; for the latter, dispatch oracle-1 to judge match or change. Print a report listing confirmed and changed decisions, with each changed one's Depends on labels.
- All writes go through a command script, never the model.

Out of scope: re-planning or reworking work affected by changed decisions.

Acceptance criteria:
- An export then import round trip with sample answers produces the expected decisions, statuses, and report (fixture-based test).
- Import of an answer identical to the provisional one reports it confirmed without an oracle call.
- Confirm and review record the correct provenance and Supersedes lines.
- Import refuses a file without the sidecar version marker.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task, including each command file's exact prompt text.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
