# Decidinator

**In development.** Decidinator makes Claude research its own questions before asking. Every `AskUserQuestion` call goes to a read-only oracle subagent first. Only questions it cannot settle reach a person, with researched options, and every decision is logged in the repo.

You work as usual after typing `/decidinator:arm` once in the session. The plugin holds each question Claude asks, has an oracle research it, and either answers it or passes it on to you.

## Install

```bash
claude plugin marketplace add timschreiber/claude-plugins
claude plugin install decidinator@timschreiber
```

To try it from a checkout of this repo instead:

```powershell
claude --plugin-dir ./plugins/decidinator
```

Installing it changes nothing on its own: every session starts unarmed, and an unarmed session behaves as if the plugin were not installed. So it can stay installed everywhere.

Requirements:
- **Node 20 or later** on the PATH. The hooks are Node scripts.
- **A Claude Code version whose plugin agents take `model` and `effort`.**
- **`gh` installed and authenticated**, for the oracles' GitHub research.
- **Git is recommended**, so decisions show in your diffs.

Tested on Claude Code 2.1.285.

## How to use

1. **Arm the session: type `/decidinator:arm`.** To pick a mode, type `/decidinator:arm ask` or `/decidinator:arm sidecar`.
2. **Work as usual.**
3. **When Claude asks a question,** Decidinator holds the call and tells Claude which oracle to start. The oracle researches in the background, and Claude's other tools wait until its report arrives.
4. **The outcome depends on the mode** and on whether the oracle could settle the question.

### Ask mode

The default. A question the oracle resolves never reaches you, and its decision is logged as `oracle-unconfirmed`. One it cannot resolve reaches you with the oracle's researched options. Your answer, with any `Notes:` line you typed, is logged as `user`.

### Sidecar mode

Claude continues on the oracle's best answer, logged as `oracle-provisional`. The question waits in `docs/open-questions.md` for you or your stakeholders (see below).

### Arming every session

Set `DECIDINATOR_MODE` to `ask` or `sidecar` before launching Claude Code, and every session arms itself at start:

```bash
DECIDINATOR_MODE=sidecar claude
```

```powershell
$env:DECIDINATOR_MODE = 'sidecar'; claude
```

`DECIDINATOR_CONTEXT` labels where the questions arose (a runner, a ticket, a branch), so the log and sidecar show it.

### In plan mode

It works. Oracles research without permission prompts in plan mode, and every rung runs on the session's model.

## The stakeholder workflow

For decisions that belong to other people:

1. **Run `/decidinator:export [path]`.** It writes a copy of the open questions, grouped by stakeholder or topic.
2. **Send it.** People write their answers after `Answer:`.
3. **Run `/decidinator:import <path>`.** Each answer is recorded as a stakeholder decision. The report says which ones confirmed the provisional answer and which changed it, and lists each changed one's `Depends on` labels, so you know what to revisit. An answer that differs only in wording is judged by `oracle-1`.

Two more commands work inside the session. `/decidinator:review` asks you the open questions yourself, and `/decidinator:confirm` walks the oracle decisions so you can approve or override each, highest impact first.

## The oracle ladder

Three read-only research agents form the default ladder. Each researches one question (the decision log and sidecar, the project's documents and code, official documentation, then GitHub) and ends its reply with a `decidinator-verdict` block.

| Rung | Agent | Model | Effort |
| --- | --- | --- | --- |
| 1 | `decidinator:oracle-1` | `claude-opus-5-5` | high |
| 2 | `decidinator:oracle-2` | `claude-opus-5-5` | xhigh |
| 3 | `decidinator:oracle-3` | `claude-fable-5-1` | high |

Oracles may use every tool except Edit, Write, NotebookEdit, AskUserQuestion and Agent, so they use whatever web search your environment provides, and each stops after 30 turns.

A verdict with low confidence, an unresolved researchable question, or a `spec-silent`, `spec-contradiction` or `cross-cutting` flag sends the question to the next rung, which is given the earlier verdicts to critique. A human-only question never escalates. When the ladder ends without a resolution, the best answer is the one with the highest confidence, with ties going to the higher rung.

### Changing the ladder

Set `rungs` in `.claude/decidinator.json`. To drop the Fable rung:

```json
{"rungs": ["decidinator:oracle-1", "decidinator:oracle-2"]}
```

To use your own agent at rung 1:

```json
{"rungs": ["my-oracle", "decidinator:oracle-2"]}
```

Put your agent in `.claude/agents/`, and start from a copy of `plugins/decidinator/agents/oracle-1.md` so it stays read-only and ends its reply with the `decidinator-verdict` block.

## Letting oracles research unattended

In default permission mode, Claude asks before an oracle uses WebFetch, WebSearch or `gh`. Plan mode does not ask. To allow them, add to `.claude/settings.json`:

```json
{"permissions": {"allow": ["WebFetch", "WebSearch", "Bash(gh search:*)"]}}
```

Or pass them at launch: `--allowedTools WebFetch WebSearch "Bash(gh search:*)"`.

In an armed session, oracle Bash and PowerShell calls may run only one `gh search`, `gh repo view` or read-only (GET) `gh api` command each, with no pipes, redirects, chaining or variables (`--jq` filters output), and oracle Monitor calls are refused. Anything else is denied with the reason, and the oracle reads project files with Read, Glob and Grep instead. The main thread and other subagents are not affected.

## What gets written

When a question's research ends:

- **Resolved:** the decision goes to the log as `oracle-unconfirmed`.
- **Ask mode:** the question goes to the user. A `PostToolUse` hook on `AskUserQuestion` (`scripts/user-answer.js`) logs the answer as a `user` decision, with any notes the user typed.
- **Sidecar mode:** the question gets an `oracle-provisional` decision with the best answer (highest confidence, ties to the higher rung) plus a sidecar entry. A duplicate of an open entry extends that entry's Depends on instead of adding a new one.

Context labels come from `DECIDINATOR_CONTEXT`, else the session ID and branch.

Decidinator writes only the decision log, the sidecar and its own state outside the repo (in `${CLAUDE_PLUGIN_DATA}/sessions/`).

## Commands

| Command | Effect |
| --- | --- |
| `/decidinator:arm [ask\|sidecar]` | Arms the session in the given mode (default from configuration, else `ask`). |
| `/decidinator:disarm` | Disarms, dropping pending questions. |
| `/decidinator:status` | Shows whether the session is armed and in which mode, and the counts of open sidecar entries and unconfirmed decisions. |
| `/decidinator:review` | Asks you the open sidecar questions, with their researched options, and records your answers. Needs an armed session. |
| `/decidinator:confirm` | Walks unconfirmed and provisional decisions, highest impact first; confirm or override each. Needs an armed session. |
| `/decidinator:export [path]` | Writes a stakeholder copy of the open questions (default: next to the sidecar, dated). |
| `/decidinator:import <path>` | Imports the stakeholders' answers and reports which decisions they confirmed or changed. Needs an armed session. |

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

When `nudgeOnPlainTextQuestions` is `true`, a `Stop` hook checks Claude's final message. If its last non-blank line, outside fenced code blocks and with inline code removed, ends with `?`, the hook keeps Claude from ending its turn, once, and tells it to ask through `AskUserQuestion`. It stays quiet while an oracle dispatch is due or running.

Environment variables:

| Variable | Effect |
| --- | --- |
| `DECIDINATOR_MODE` | `ask` or `sidecar`: arms every session at start in that mode. |
| `DECIDINATOR_CONTEXT` | Labels where questions arose, for runners. Default: the session ID and branch. |
| `DECIDINATOR_DEBUG` | `1` logs hook errors and state changes to `decidinator-debug.log` in the temp directory. |

## Cost

On subscription plans, oracle research counts against your usage like any other subagent. Each question costs at least one oracle run on Opus at high effort. Escalation adds a run per rung (rung 2 at xhigh, rung 3 on Fable), and an import adds one judgment run per answer that differs in wording.

## Known limitations

- **Headless `claude -p` sessions are out of scope,** because `AskUserQuestion` does not exist there. For unattended work, use sidecar mode in an interactive session.
- **Rung models are honored only outside plan mode.** In plan mode every rung runs on the session's model, whatever its definition says, so escalation adds a fresh critique but not a different model. The `resolvedModel` field of an `Agent` result shows the definition's model, not the one that ran.
- **Plain-text questions are only nudged, once.** Questions that still slip through are not intercepted.
- **The model makes the oracle dispatches.** The guard refuses other tools, and steps aside after `guardMaxBlocks` blocks, says so once, and lets tools run, so a lost report never wedges the session.
- **Rung models are untested on Bedrock and on a Pro plan.**

## More

- [Reference](https://github.com/timschreiber/claude-plugins/blob/main/docs/decidinator/decidinator-reference.md): every hook, file format, command, key and variable.
- [Specification](https://github.com/timschreiber/claude-plugins/blob/main/docs/decidinator/Decidinator%20%E2%80%94%20Specification.md): the design.
