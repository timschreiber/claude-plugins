# Decidinator

**In development.** Decidinator makes Claude research its own questions before asking. Every `AskUserQuestion` call goes to a read-only oracle subagent first, and only questions it cannot settle reach a person, with researched options. This version arms, disarms and reports status, ships the oracle agents, holds each question until an oracle has researched it, and walks the oracle ladder; it also writes the decision log and the sidecar.

## Install

```bash
claude plugin marketplace add timschreiber/claude-plugins
claude plugin install decidinator@timschreiber
```

## Requirements

Node 20 or later on the PATH.

## Commands

| Command | Effect |
| --- | --- |
| `/decidinator:arm [ask\|sidecar]` | Arms the session in the given mode (default from configuration, else `ask`). |
| `/decidinator:disarm` | Disarms, dropping pending questions. |
| `/decidinator:status` | Shows whether the session is armed and in which mode, and the counts of open sidecar entries and unconfirmed decisions. |

Setting `DECIDINATOR_MODE=ask` or `sidecar` before launch arms every session at start. Unarmed, the plugin does nothing.

## Configuration

Settings come from the defaults, then `~/.claude/decidinator.json`, then `.claude/decidinator.json` in the project, applied key by key.

| Key | Default |
| --- | --- |
| `mode` | `ask` |
| `rungs` | `["decidinator:oracle-1", "decidinator:oracle-2", "decidinator:oracle-3"]` |
| `decisionLog` | `docs/decisions.md` |
| `sidecar` | `docs/open-questions.md` |
| `guardMaxBlocks` | `3` |
| `nudgeOnPlainTextQuestions` | `true` |

A key with an invalid value, or a key that isn't a setting, is ignored (the lower-precedence value applies). The arm note, the start message and `/decidinator:status` name the file and key.

`DECIDINATOR_DEBUG=1` logs hook errors and state changes to `decidinator-debug.log` in the temp directory.

## Oracles

Three read-only research agents form the default ladder. Each researches one question (the decision log and sidecar, the project's documents and code, official documentation, then GitHub) and ends its reply with a `decidinator-verdict` block.

| Rung | Agent | Model | Effort |
| --- | --- | --- | --- |
| 1 | `decidinator:oracle-1` | `claude-opus-5-5` | high |
| 2 | `decidinator:oracle-2` | `claude-opus-5-5` | xhigh |
| 3 | `decidinator:oracle-3` | `claude-fable-5-1` | high |

Oracles may use every tool except Edit, Write, NotebookEdit, AskUserQuestion and Agent, so they use whatever web search your environment provides, and each stops after 30 turns.

Rung models are honored only outside plan mode. In plan mode every rung runs on the session's model, whatever its definition says, so escalation adds a fresh critique but not a different model. To see which model a rung really ran on, read the agent's transcript: the `resolvedModel` field of the `Agent` result shows the definition's model, not the one that ran.

In `default` permission mode Claude asks before an oracle uses WebFetch, WebSearch or `gh`. For unattended research, allow `WebFetch`, `WebSearch` and `Bash(gh search:*)`. GitHub searches need `gh` installed and authenticated.

On subscription plans, oracle research counts against your usage like any other subagent.

## While an oracle researches

When Claude calls `AskUserQuestion`, Decidinator holds the call and tells Claude which oracle to start. Until Claude starts it, and while the oracle researches in the background, Claude's other tool calls are refused with the same instruction, or with one to wait for the report. A verdict with low confidence, an unresolved researchable question, or a `spec-silent`, `spec-contradiction` or `cross-cutting` flag sends the question to the next rung, which is given the earlier verdicts to critique; a human-only question never escalates. After `guardMaxBlocks` refused calls in a row the guard steps aside, says so once, and lets tools run, so a lost report never wedges the session.

## What gets written

When a question's research ends:

- **Resolved:** the decision goes to the log as `oracle-unconfirmed`.
- **Ask mode:** the question goes to the user. A `PostToolUse` hook on `AskUserQuestion` (`scripts/user-answer.js`) logs the answer as a `user` decision, with any notes the user typed.
- **Sidecar mode:** the question gets an `oracle-provisional` decision with the best answer (highest confidence, ties to the higher rung) plus a sidecar entry. A duplicate of an open entry extends that entry's Depends on instead of adding a new one.

Context labels come from `DECIDINATOR_CONTEXT`, else the session ID and branch.

## Design

See the [specification](https://github.com/timschreiber/claude-plugins/blob/main/docs/decidinator/Decidinator%20%E2%80%94%20Specification.md).
