# WP-02 · Plugin scaffold, arming, and configuration

```text
Work package WP-02 · Plugin scaffold, arming, and configuration
Spec: docs/decidinator/Decidinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/decidinator/Decidinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/decidinator/decidinator-verification.md from WP-01.

Goal: an installable Decidinator plugin that arms, disarms, reports status, loads configuration, and does nothing when unarmed.

Depends on: WP-01 (complete).
Spec sections: Architecture; Commands and configuration; Safety and integration.

Scope:
- Plugin manifest and layout in the marketplace repo, following planandtier's conventions (Node 20 hook scripts, hooks/hooks.json, commands/, agents/).
- Configuration loader: defaults, then ~/.claude/decidinator.json, then .claude/decidinator.json, with validation of every key in the spec's configuration table.
- Arming: /decidinator:arm [ask|sidecar], /decidinator:disarm, /decidinator:status (status shows mode only until later packages add counts), and DECIDINATOR_MODE arming at session start.
- Session state and arming flag files under ${CLAUDE_PLUGIN_DATA}/sessions/, the SessionEnd cleanup hook, and removal of files older than 7 days.
- DECIDINATOR_DEBUG=1 logging to a temp-directory log.
- A shared hook entry helper: reads input, checks arming, catches errors, and exits without output when unarmed.

Out of scope: the gate, recorder, guard, and nudge logic; oracle agents.

Acceptance criteria:
- `claude plugin install` from the marketplace succeeds.
- Unit tests cover config precedence, invalid config (rejected with the key named), and arming by command and by environment variable.
- A test proves every hook exits with no output in an unarmed session.
- SessionEnd removes the session's files; a test covers the 7-day sweep.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
