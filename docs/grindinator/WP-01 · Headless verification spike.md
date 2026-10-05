# WP-01 · Headless verification spike

```text
Work package WP-01 · Headless verification spike
Spec: docs/grindinator/Grindinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/grindinator/Grindinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/decidinator/decidinator-verification.md and docs/tierminator/tierminator-headless-command-findings.md.

Goal: confirm or refute the headless behaviors this design depends on, with evidence, before any product code changes.

Depends on: none.
Spec sections: Current state; Runner contract; Open items.

Scope: a throwaway probe under `probes/grindinator/`, outside any plugin, run on the Claude Code version recorded in the findings. Verify each item:
- V1: whether a `StopFailure` event exists and fires in `claude -p` when a usage limit stops the session; the payload field names; whether a reset time is present. If a real limit cannot be triggered safely, record "not testable" and the fallback.
- V2: the `--output-format stream-json --verbose` message shapes: the init and result messages, where `session_id` appears, and the process exit code for success, error and limit.
- V3: where a reset time can be read (transcript, stream, or result text), or "none found".
- V4: whether `SessionEnd` fires when a limit ends the session.
- V5: whether `/tierminator:execute <plan> --from Txx` activates and runs in a headless session, and under which preconditions.
- V6: with `DECIDINATOR_MODE=sidecar` in `-p`: whether arming, oracle dispatch through the `Agent` tool, the `SubagentStop` recorder, and the decision log and sidecar writes work; whether the rung models apply outside plan mode.
- V7: whether an oracle's write to the decision log during unattended planning blocks Tierminator's run start or leaves the tree dirty after the worker commits.
- V8: the minimal permissions that let workers and oracles run headless: `bypassPermissions` versus `acceptEdits` plus allow rules.
- V9: on Pro and on Bedrock: model pinning, rung model resolution, and oracle web search availability (Serper MCP on Bedrock).

Out of scope: any change to the plugins.

Acceptance criteria:
- `docs/grindinator/grindinator-verification.md` has one row per item V1 to V9: result (pass, fail, partial, not testable), evidence reference, and the fallback to apply if not a pass.
- Raw payload samples are saved as `probes/evidence/grindinator-*` files, and every claim in the findings doc has an evidence file behind it.
- The specification's Runner contract and Component requirements sections are updated wherever a fallback applies.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
