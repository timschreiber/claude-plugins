# Decidinator verification (WP-01)

Measured 2026-09-30 on Claude Code 2.1.285 (Windows) with `probes/decidinator/probe-plugin`
loaded through `--plugin-dir`. This covers the seven headless cells run by
`probes/decidinator/run-headless.js` (`normal-default`, `plan-default`, `normal-allowed`,
`plan-allowed`, `deny-normal`, `deny-plan`, `model`) and the four interactive cells from
`probes/decidinator/commands.md` (`interactive-normal`, `interactive-plan`, `interactive-deny-normal`,
`interactive-deny-plan`). Evidence:
`probes/evidence/decidinator-verification-results.json` (written by
`probes/decidinator/analyze.js`) and, per cell, `probes/evidence/decidinator-probe-<cell>-hooks.jsonl`
(raw hook inputs with an environment snapshot), `-agents.json` (one row per `SubagentStop`, with
the models from the agent's transcript), `-run.json` (arguments and final result) and
`-transcript.jsonl` (the main session transcript).

## Results

| # | Item | Headless | Interactive | Result | Fallback if not a pass |
|---|---|---|---|---|---|
| 1 | Oracles can use WebFetch, web search and `gh` through Bash, in plan mode and outside it | Default: WebFetch, WebSearch and `gh search repos` all completed, normal and plan. Allowed (`--allowedTools`): the same. | WebFetch, WebSearch and `gh search repos` completed in normal and plan mode. | pass; `default` mode asked for permission, `plan` mode did not | Oracles drop the failing tool; the README lists the tools users must allow. |
| 2 | `SubagentStop` identifies the agent and gives its final reply | `agent_type` on every oracle record; `last_assistant_message` missing on 3 of 5 (every subagent run in `auto` mode) | Present for the researcher in `default` and `plan` mode; the interactive `Agent` call is async, so the parent's `PostToolUse` carries no report | partial | No fallback in the spec; the recorder reads `last_assistant_message`, then the `SubagentHandback` call, then `agent_transcript_path` (see Item 2). |
| 3 | `PreToolUse` says whether a call comes from a subagent, and which | 19 subagent records carry `agent_id` and `agent_type`; 7 main-thread records carry neither | n/a | pass | Oracles lose Bash and use WebFetch for GitHub. |
| 4 | A hook can tell the session is non-interactive | `CLAUDE_CODE_SESSION_ATTENDED=0`, `CLAUDE_CODE_ENTRYPOINT=sdk-cli`, no `scratchpad_dir` | `CLAUDE_CODE_SESSION_ATTENDED=1`, `CLAUDE_CODE_ENTRYPOINT=cli`, `scratchpad_dir` on every record | pass | Headless callers must set DECIDINATOR_MODE=sidecar. |
| 5 | A `PreToolUse` deny reason reaches the model, in plan mode and outside it | Read: the token reached the transcript and the final message, both modes. AskUserQuestion: not available headless, so never called. | Read and AskUserQuestion were both denied by the hook, and the deny reason reached the model, in `default` and `plan` mode. | pass | No fallback in the spec; the dependent design (recorder / gate and guard) must change. |
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
- **Interactive:** in `interactive-normal` (`permission_mode: default`) and `interactive-plan` the
  researcher made the same three calls, each with a matching `PostToolUse`, and reported
  `WEBFETCH: OK`, `WEBSEARCH: OK`, `GH: OK`. Permission prompts, as reported by the person who ran the
  cells (not in the hook data): `interactive-normal` (`default` mode) asked for permission, and
  `interactive-plan` did not. Which tools asked in `default` mode was not written down. The `Agent` call itself was async (see Item 2).
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

Interactive cells (`decidinator-probe-interactive-*-hooks.jsonl`):

- **The `Agent` call is async.** The parent's `PostToolUse` for `Agent` has `status: async_launched`
  and keys `isAsync`, `agentId`, `description`, `resolvedModel`, `prompt`, `outputFile`,
  `canReadOutputFile`, with no `handbackReport`. So the verdict cannot be read from the parent's
  `PostToolUse` interactively. The earlier idea of reading `tool_response.handbackReport.text` holds
  only for foreground (headless) dispatches.
- **`SubagentStop` had the report** in `interactive-normal` (`default` mode) and `interactive-plan`:
  `last_assistant_message` is `WEBFETCH: OK...` for the researcher, and `SubagentHandback` was not
  called. `SubagentHandback` and a missing `last_assistant_message` were seen in `auto` mode (the
  three headless normal cells) and, in an earlier interactive run that was overwritten and is not in
  the evidence, in `auto` mode too. So the working hypothesis is that `SubagentHandback` appears
  when the session is in `auto` mode. Only `default` and `plan` are shown to give
  `last_assistant_message`.
- **Other subagents fire `SubagentStop` too.** Each interactive session has extra records with
  `agent_type: ""` and short progress-like `last_assistant_message` values (`(silence)`,
  `Loading WebFetch and WebSearch schemas`, `Searching GitHub repos with gh`). The recorder must
  match on the configured rung's `agent_type` and ignore the rest.
- `interactive-plan` holds records from three sessions (three `SessionStart` records), because its
  earlier runs were not cleared; all are `permission_mode: plan` and agree with each other.

Recorder rule this supports: match `agent_type`, take the report from `last_assistant_message`, and if
it is missing, from the `SubagentHandback` call's `tool_input.message`, and if that is missing, from
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

Decided from `item4.differences` in `decidinator-verification-results.json`, which compares the
seven headless and four interactive cells:

- **Environment** (hook process, `item4.byCell.<cell>.env`): every headless cell has
  `CLAUDE_CODE_SESSION_ATTENDED=0` and `CLAUDE_CODE_ENTRYPOINT=sdk-cli`; every interactive cell has
  `CLAUDE_CODE_SESSION_ATTENDED=1` and `CLAUDE_CODE_ENTRYPOINT=cli`. This holds for the `model` cell,
  which was re-run from a plain terminal (`stripped: []` in `decidinator-probe-model-run.json`), so
  the headless values are not inherited from a non-interactive parent session.
  `CLAUDE_CODE_CHILD_SESSION=1` is present in both and does not discriminate.
- **Payload keys:** `scratchpad_dir` is in every interactive hook input (PreToolUse, PostToolUse,
  SessionStart, SessionEnd, Stop, SubagentStart, SubagentStop, UserPromptSubmit) and in no headless
  one (`item4.differences.keys`); prior tierminator evidence agrees
  (`probes/evidence/planandtier-agents-probe.log`: 44 of 44 with it, interactive;
  `probes/evidence/planandtier-agent-probe.log`: 0 of 8, headless).
- **Method:** treat a session as headless when `CLAUDE_CODE_SESSION_ATTENDED` is `0`, or when
  `CLAUDE_CODE_ENTRYPOINT` is `sdk-cli`. Do not use `scratchpad_dir` alone: its absence on a payload
  might be a version difference, so use it only as a second signal.
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

Interactive (`decidinator-probe-interactive-deny-normal-run.json` and
`decidinator-probe-interactive-deny-plan-hooks.jsonl`, `item5.interactive-deny-*`): both `Read` and
`AskUserQuestion` reached `PreToolUse` on the main thread, were denied by the hook, and the token
`DECIDINATOR-PROBE-DENY-7F3K` reached the transcript and the final message, in `default` and in `plan`
mode. The final messages read `Read: DENIED PreToolUse:Read hook error: DECIDINATOR-PROBE-DENY-7F3K:
...` and `AskUserQuestion: DENIED PreToolUse:AskUserQuestion hook error: DECIDINATOR-PROBE-DENY-7F3K:
...`. So a deny reason on `AskUserQuestion` reaches the model, in and out of plan mode.

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
(`decidinator-probe-normal-default-agents.json`). The interactive plan cell agrees
(`decidinator-probe-interactive-plan-agents.json`: transcript `claude-opus-5-5`, `resolvedModel`
`claude-sonnet-5-5`).

Three more headless cells test predefined agents with full model IDs (`item6` in
`decidinator-verification-results.json`; the main-session model is `mainModels`, from the main
transcript):

| Cell | Mode | Agent's `model` | Main session ran | `resolvedModel` | Agent actually ran | Agent said |
|---|---|---|---|---|---|---|
| `model` | `auto` | `claude-opus-5-5` | `claude-sonnet-5-5` | `claude-opus-5-5` | `claude-opus-5-5` | `claude-opus-5-5` |
| `model-plan` | `plan` | `claude-opus-5-5` | `claude-opus-5-5` | `claude-opus-5-5` | `claude-opus-5-5` | `claude-opus-5-5` |
| `model-sonnet` | `auto` | `claude-sonnet-5-5` | `claude-sonnet-5-5` | `claude-sonnet-5-5` | `claude-sonnet-5-5` | `claude-sonnet-5-5` |
| `model-sonnet-plan` | `plan` | `claude-sonnet-5-5` | `claude-opus-5-5` | `claude-sonnet-5-5` | `claude-opus-5-5` | `claude-opus-5-5` |

Outside plan mode a predefined agent runs on its own `model` (the Opus agent ran on Opus under a
Sonnet session). In plan mode the session runs on Opus and a subagent runs on the session's model
whatever its `model` says: `model-sonnet-plan` asked for Sonnet, `resolvedModel` reported Sonnet, and
the agent ran on Opus and named Opus itself. `resolvedModel` is therefore not proof of what ran; the
agent's transcript is. Alias versus full ID does not matter (`sonnet` and `claude-sonnet-5-5` both
lose to plan mode). For the ladder this means rung models are honored only outside plan mode. In
plan mode every rung runs on Opus, so rung 3 (`claude-fable-5-1`) would not run as Fable, and the
recorder should read the model from the agent's transcript, not from `resolvedModel`.

## WP-04: oracle-1 sample runs

Measured 2026-09-30 on Claude Code 2.1.285 with `node probes/decidinator/run-oracle.js <sample>`: one `claude -p` session per sample, in `plan` mode on `claude-opus-5-5`, with `plugins/decidinator` and the WP-01 probe plugin loaded, in a temp git repo holding a small fixture project (`tally`, a zero-dependency Node todo CLI with a spec, one source file, a decision log with one binding decision, and an empty sidecar). The main session dispatched `decidinator:oracle-1` with a dispatch prompt in the WP-04 contract (`dispatch` in each verdict file). The report was taken by the recorder rule and validated with `parseVerdict` from `plugins/decidinator/scripts/lib/verdict.js`, expecting the sample's question ID and rung 1. Evidence: `probes/evidence/decidinator-probe-oracle-<sample>-verdict.json` (report, verdict, checks), beside the `-hooks.jsonl`, `-agents.json`, `-transcript.jsonl` and `-run.json` files that `collect.js` writes.

| Sample | Question | Report from | Valid | Kind | Status | Confidence | Flags | Options | Sources | Agent model (transcript) |
|---|---|---|---|---|---|---|---|---|---|---|
| `clear` | Q-0002 | `last_assistant_message` | yes | researchable | resolved | high | none | 0 | 4 | `claude-opus-5-5` |
| `human-only` | Q-0003 | `last_assistant_message` | yes | human-only | unresolved | low | `spec-silent`, `cross-cutting` | 2 | 8 | `claude-opus-5-5` |
| `spec-silent` | Q-0004 | `last_assistant_message` | yes | researchable | resolved | medium | `spec-silent` | 2 | 4 | `claude-opus-5-5` |

- **clear** (Q-0002): answer "Use node:test, the runner built into Node, with node:assert for assertions. Set package.json scripts.test to \"node --test\" and put the test files under test/ (for example test/list.test.js). Do not add Jest or Mocha.". Sources: `docs/spec.md`; `CLAUDE.md`; `package.json`; `https://nodejs.org/docs/latest-v20.x/api/test.html`.
- **human-only** (Q-0003): answer "Provisionally 5 lists, held in one named constant so the product team can change it; the product team must confirm the number.". Sources: `docs/spec.md`; `docs/decisions.md#D-0001`; `docs/open-questions.md`; `src/list.js`; `https://todoist.com/help/articles/todoists-limits-for-tasks,-projects,-files-and-more-e5rcSY`; `https://zapier.com/blog/free-todoist-account-five-project-limit/`; `https://quire.io/compare/best-to-do-list-apps`; `https://tasksboard.com/blog/shared-to-do-list-app`.
- **spec-silent** (Q-0004): answer "Added: open todos with the same due date print in the order they were added (a stable sort on due date only, with no secondary key), the same order the undated todos already use.". Sources: `docs/spec.md`; `src/list.js:7`; `src/list.js:8`; `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort`.

Acceptance: every sample returned a valid verdict block citing at least one source, and the human-only sample (Q-0003) was classified `human-only` with 2 options, each with tradeoffs ("checks" in each verdict file). The spec-silent sample was flagged `spec-silent`.

## Pending

From `probes/decidinator/commands.md`:

- Which tools asked for permission in `default` mode (only that prompts appeared was recorded), and
  the README wording for it: users must allow those tools for oracles to run unattended.
- Whether `SubagentHandback` appears only in `auto` mode: run the `research` cell interactively in
  `auto` mode and check the hooks file for `SubagentHandback` and `last_assistant_message`.
- A strict `default`-permission headless run (the headless "default" cells ran in `auto`).
- The `model` cell on a Bedrock setup and on a Pro-plan setup, for item 6.
