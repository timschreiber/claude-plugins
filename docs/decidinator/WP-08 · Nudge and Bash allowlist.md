# WP-08 · Nudge hook and oracle Bash allowlist

```text
Work package WP-08 · Nudge hook and oracle Bash allowlist
Spec: docs/decidinator-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/decidinator-spec.md in full, even if you have read them earlier in this session. Also read docs/verification.md, item 3, to know which branch of this package applies.

Goal: plain-text questions get pushed into AskUserQuestion, and oracles can use only read-only GitHub commands through Bash.

Depends on: WP-01, WP-02, WP-04 (complete).
Spec sections: Architecture (Nudge); Safety and integration; Requirements and verification (item 3 and fallbacks).

Scope:
- Nudge (Stop): when nudgeOnPlainTextQuestions is true and the final assistant message ends with a question addressed to the user, block the stop once per turn with an instruction to ask through AskUserQuestion. The detection rule is a fixed heuristic defined in the plan (for example, the last sentence ends with "?" and is not inside a code block).
- Bash allowlist (PreToolUse, matcher Bash), only if WP-01 item 3 passed: for calls from a configured rung agent, allow only commands matching `gh search`, `gh repo view`, and `gh api` without a method other than GET; deny everything else with the reason. Main-thread Bash calls are untouched.
- If WP-01 item 3 failed: remove Bash from the oracles (add it to disallowedTools in all three agent files) and add a line to the shared prompt pointing oracles to WebFetch for GitHub pages.

Out of scope: other hooks.

Acceptance criteria:
- Nudge tests: a trailing question is blocked once and then allowed; a question inside a code block and a statement are not blocked.
- Allowlist tests with recorded payloads: allowed and denied oracle commands, including `gh api -X POST` denied, and a main-thread command ignored.
- Or, if the fallback was taken, the identical-body check from WP-04 still passes.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task, including the exact allowlist patterns and the nudge heuristic.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
