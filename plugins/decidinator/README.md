# Decidinator

**In development.** Decidinator makes Claude research its own questions before asking. Every `AskUserQuestion` call goes to a read-only oracle subagent first, and only questions it cannot settle reach a person, with researched options. This version only arms, disarms and reports status; the oracles, decision log and sidecar come in later releases.

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

## Design

See the [specification](https://github.com/timschreiber/claude-plugins/blob/main/docs/decidinator/Decidinator%20%E2%80%94%20Specification.md).
