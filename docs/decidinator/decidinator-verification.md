# Decidinator verification (WP-01)

Measured 2026-09-30 on Claude Code 2.1.285 (Windows) with `probes/decidinator/probe-plugin`
loaded through `--plugin-dir`. This covers the seven headless cells run by
`probes/decidinator/run-headless.js` (`normal-default`, `plan-default`, `normal-allowed`,
`plan-allowed`, `deny-normal`, `deny-plan`, `model`). The four interactive cells in
`probes/decidinator/commands.md` are pending, so items 1, 4 and 5 are not decided yet. Evidence:
`probes/evidence/decidinator-verification-results.json` (written by
`probes/decidinator/analyze.js`) and, per cell, `probes/evidence/decidinator-probe-<cell>-hooks.jsonl`
(raw hook inputs with an environment snapshot), `-agents.json` (one row per `SubagentStop`, with
the models from the agent's transcript), `-run.json` (arguments and final result) and
`-transcript.jsonl` (the main session transcript).

## Results

| # | Item | Headless | Interactive | Result | Fallback if not a pass |
|---|---|---|---|---|---|
| 1 | Oracles can use WebFetch, web search and `gh` through Bash, in plan mode and outside it | Default: WebFetch, WebSearch and `gh search repos` all completed, normal and plan. Allowed (`--allowedTools`): the same. | pending | pending | Oracles drop the failing tool; the README lists the tools users must allow. |
| 2 | `SubagentStop` identifies the agent and gives its final reply | `agent_type` on every record; `last_assistant_message` missing on 3 of 5 (every subagent run outside plan mode) | n/a | partial | No fallback in the spec; the dependent design (recorder / gate and guard) must change. |
| 3 | `PreToolUse` says whether a call comes from a subagent, and which | 19 subagent records carry `agent_id` and `agent_type`; 7 main-thread records carry neither | n/a | pass | Oracles lose Bash and use WebFetch for GitHub. |
| 4 | A hook can tell the session is non-interactive | Candidates seen (see Item 4); nothing to compare against yet | pending | pending | Headless callers must set DECIDINATOR_MODE=sidecar. |
| 5 | A `PreToolUse` deny reason reaches the model, in plan mode and outside it | Read: the token reached the transcript and the final message, both modes. AskUserQuestion: not available headless, so never called. | pending | pending | No fallback in the spec; the dependent design (recorder / gate and guard) must change. |
| 6 | Plugin agents with Anthropic-format model IDs and `effort` resolve on Bedrock and Pro | `claude-opus-5-5` at `high` on this login | n/a | partial | Verify with node probes/decidinator/run-headless.js model on each setup before relying on the default rungs there. |

## Item 1

In all four research cells the researcher made the three calls and each has a matching
`PostToolUse` (outcome `post` in `item1` of `decidinator-verification-results.json`):
`WebFetch https://docs.github.com/en/rest`, `WebSearch node.js child_process spawnSync documentation`,
`Bash gh search repos "claude code plugin" --limit 3 --json fullName`. Every cell's final result was
(`decidinator-probe-<cell>-run.json`, `result`):

```text
WEBFETCH: OK
WEBSEARCH: OK (WebSearch)
GH: OK
```

- **The "default" cells did not run in default permission mode.** Their records carry
  `"permission_mode": "auto"` (`decidinator-probe-normal-default-hooks.jsonl`), because the probe
  passed no `--permission-mode` and this login defaults to auto. So default versus allowed made no
  difference here, and a strict default-mode headless run is untested. Plan cells carry
  `"permission_mode": "plan"`.
- WebFetch and WebSearch are deferred tools: in every cell the researcher first called
  `ToolSearch` with `select:WebFetch,WebSearch` (`decidinator-probe-plan-default-hooks.jsonl`).
- The researcher's tool list included built-in `WebSearch` and the claude.ai Docs MCP tools, and
  no other search tool (`TOOLS:` line in each `-run.json`).

## Item 2

`SubagentStop` input fields (union over all cells, `item2.subagentStopKeys`): `agent_id`,
`agent_transcript_path`, `agent_type`, `background_tasks`, `cwd`, `effort`, `hook_event_name`,
`last_assistant_message`, `permission_mode`, `prompt_id`, `session_crons`, `session_id`,
`stop_hook_active`, `transcript_path`.

`agent_type` was present on all records (`withoutAgentType: 0`), as the plugin-qualified name
`decidinator-probe:researcher`. `last_assistant_message` was absent on 3 records
(`withoutLastMessage: 3`): `normal-default`, `normal-allowed` and `model`, every subagent run outside plan mode. In those runs the subagent ended by calling a `SubagentHandback` tool, and the report is in
that call's `tool_input.message` (`PreToolUse`, carrying `agent_id`) and in the parent's `Agent`
`PostToolUse` as `tool_response.handbackReport.text`, not in `SubagentStop`
(`decidinator-probe-normal-default-hooks.jsonl`). In plan mode `SubagentHandback` was not in the
researcher's tool list and the report arrived in `last_assistant_message`
(`decidinator-probe-plan-default-agents.json`). The agent's transcript is also reachable through
`agent_transcript_path`.

Sample, plan mode (`decidinator-probe-plan-default-hooks.jsonl`, long strings trimmed):

```json
{
  "session_id": "c576a273-08d0-41ec-b669-40bcdc1810fe",
  "transcript_path": "C:\\Users\\timsc\\.claude\\projects\\...\\c576a273-08d0-41ec-b669-40bcdc1810fe.jsonl",
  "cwd": "C:\\Users\\timsc\\AppData\\Local\\Temp\\decidinator-probe\\plan-default\\repo",
  "prompt_id": "e95fd314-3fbb-4181-bd9a-a4dc567ac596",
  "permission_mode": "plan",
  "agent_id": "ae62106fe263cfaed",
  "agent_type": "decidinator-probe:researcher",
  "effort": { "level": "low" },
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_transcript_path": "C:\\Users\\timsc\\.claude\\projects\\...\\subagents\\agent-ae62106fe263cfaed.jsonl",
  "last_assistant_message": "WEBFETCH: OK\nWEBSEARCH: OK (WebSearch)\nGH: OK\nTOOLS: Bash, Glob, ...",
  "background_tasks": [],
  "session_crons": []
}
```

## Item 3

Main-thread `PreToolUse` fields (`item3.keysMain`): `cwd`, `effort`, `hook_event_name`,
`permission_mode`, `prompt_id`, `session_id`, `tool_input`, `tool_name`, `tool_use_id`,
`transcript_path`. Subagent `PreToolUse` fields (`item3.keysSubagent`): the same plus `agent_id` and
`agent_type`. Counts: 7 main-thread, 19 subagent records (`item3.counts`), with no exceptions in
either direction. So a hook tells a subagent call by the presence of `agent_id`, and which agent by
`agent_type`; the same holds in plan mode.

Sample, a subagent Bash call in plan mode (`decidinator-probe-plan-default-hooks.jsonl`):

```json
{
  "session_id": "c576a273-08d0-41ec-b669-40bcdc1810fe",
  "transcript_path": "C:\\Users\\timsc\\.claude\\projects\\...\\c576a273-08d0-41ec-b669-40bcdc1810fe.jsonl",
  "cwd": "C:\\Users\\timsc\\AppData\\Local\\Temp\\decidinator-probe\\plan-default\\repo",
  "prompt_id": "e95fd314-3fbb-4181-bd9a-a4dc567ac596",
  "permission_mode": "plan",
  "agent_id": "ae62106fe263cfaed",
  "agent_type": "decidinator-probe:researcher",
  "effort": { "level": "low" },
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "gh search repos \"claude code plugin\" --limit 3 --json fullName",
    "description": "Search GitHub repos for claude code plugin"
  },
  "tool_use_id": "toolu_01JvZqakqH8JCJdzpph6r7ua"
}
```

## Item 4

The method is decided once the interactive cells exist; `item4.differences` is `null` until then.
Candidate signals seen so far:

- **Environment** (every headless cell, `item4.byCell.<cell>.env`):
  `CLAUDE_CODE_ENTRYPOINT=sdk-cli`, `CLAUDE_CODE_SESSION_ATTENDED=0`,
  `CLAUDE_CODE_CHILD_SESSION=1`. The driver stripped the inherited `CLAUDECODE` and
  `CLAUDE_CODE_ENTRYPOINT` before launching (`stripped` in each `-run.json`), so
  `CLAUDE_CODE_ENTRYPOINT=sdk-cli` was set by the headless session itself. The other two were not
  stripped and may be inherited from the Claude Code session that ran the driver.
- **Payload keys:** no headless payload has `scratchpad_dir` (`item4.byCell.<cell>.keysByEvent`).
  Prior planandtier evidence has it on every interactive record and on no headless one:
  `probes/evidence/planandtier-agents-probe.log` (interactive, 44 hook inputs, all with
  `scratchpad_dir`) versus `probes/evidence/planandtier-agent-probe.log` (headless, 8 hook inputs,
  none).
- `permission_mode` does not distinguish them: headless sessions report `auto` or `plan`, as
  interactive ones do.

## Item 5

Only `Read` was called on the main thread in both deny cells (`item5.<cell>.mainCalls`), and the
denial token `DECIDINATOR-PROBE-DENY-7F3K` reached both the transcript and the final message
(`tokenInTranscript: true`, `tokenInFinalMessage: true`). Final messages
(`decidinator-probe-deny-normal-run.json`, `decidinator-probe-deny-plan-run.json`):

```text
deny-normal: Read: DENIED. The hook's reason was: "PreToolUse:Read hook error: DECIDINATOR-PROBE-DENY-7F3K: the probe denied Read. ..."
deny-plan:   Read: DENIED DECIDINATOR-PROBE-DENY-7F3K: the probe denied Read. ...
```

The model sees a deny as `PreToolUse:<tool> hook error: <reason>`. Both runs then reported
`AskUserQuestion: NOT-AVAILABLE`: a headless `claude -p` session has no `AskUserQuestion` tool, so
the gate's deny path cannot be exercised headless, and no `AskUserQuestion` record exists in either
cell's hooks file.

## Item 6

The `model` cell dispatched `decidinator-probe:model-probe` (`model: claude-opus-5-5`,
`effort: high`). Its `SubagentStop` recorded `"effort": {"level": "high"}`, its transcript's
messages all name `claude-opus-5-5` (`decidinator-probe-model-agents.json`), the parent's `Agent`
`PostToolUse` has `resolvedModel: claude-opus-5-5`, and the agent reported
`MODEL: claude-opus-5-5` (`decidinator-probe-model-run.json`). This is one first-party login;
Bedrock and a Pro plan were not tested, hence partial.

In the plan-mode research cells the researcher (`model: sonnet`) has `resolvedModel:
claude-sonnet-5-5` in the parent's `Agent` `PostToolUse`, but its transcript's messages name
`claude-opus-5-5` (`decidinator-probe-plan-default-agents.json`,
`decidinator-probe-plan-allowed-agents.json`); outside plan mode both say `claude-sonnet-5-5`
(`decidinator-probe-normal-default-agents.json`). So in plan mode an agent's `model` may not be
what runs.

## Pending

From `probes/decidinator/commands.md`:

- The four interactive cells: `interactive-normal`, `interactive-plan`, `interactive-deny-normal`,
  `interactive-deny-plan`. They decide items 1, 4 and 5.
- The `model` cell on a Bedrock setup and on a Pro-plan setup, for item 6.
