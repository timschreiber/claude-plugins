# Decidinator

**In development.** Decidinator makes Claude research its own questions before asking. Every `AskUserQuestion` call goes to a read-only oracle subagent first, and only questions it cannot settle reach a person, with researched options. This version arms, disarms and reports status, and ships the oracle agents; the hooks that dispatch them, the decision log and the sidecar come in later releases.

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
| `/decidinator:status` | Shows whether the session is armed and in which mode. |

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

## Design

See the [specification](https://github.com/timschreiber/claude-plugins/blob/main/docs/decidinator/Decidinator%20%E2%80%94%20Specification.md).
