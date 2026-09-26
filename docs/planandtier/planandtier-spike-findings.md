# planandtier spike findings

Measured on Claude Code 2.1.283 (Windows), by loading `plugins/planandtier` with
`--plugin-dir` in headless (`claude -p`) sessions against a throwaway repo. Every result
below is a record in `probes/evidence/planandtier-spike-results.json`, produced by
`probes/planandtier/analyze-spike.js` from the probe hooks' raw stdin log.

Probes are numbered as in `planandtier-spike-spec.md`. P8 is new: it asks whether the model
launches the workflow on a hook-injected instruction alone.

| Probe | Question | Result |
|---|---|---|
| P1 | `UserPromptSubmit` carries `permission_mode` | **Pass** |
| P2 | `ExitPlanMode` hooks fire; plan text in `tool_input.plan`; deny forces a revision | **Not tested** |
| P3 | First response after approval sees H3's `additionalContext` | **Not tested** |
| P4 | `Workflow` fires `PreToolUse`; its input fields | **Pass** |
| P5 | Hook-supplied `args` reach the script as an object | **Pass** |
| P6 | `agent()` accepts per-call `effort` and `agentType`, and applies them | **Pass** |
| P7 | Haiku accepts an effort value | **Accepted and ignored** |
| P8 | Model launches the workflow on injected context alone | **Not tested** |

## Not tested: P2, P3, P8

Headless sessions have no `ExitPlanMode` tool: in a `--permission-mode plan` run the model
searched for it with ToolSearch, found nothing, and reported that it could not call it. So
there was no approval for H2/H3 to hook. These three need one interactive plan-and-approve
cycle (`probes/planandtier/commands.md`).

## Findings

**P1.** `permission_mode` is present on `UserPromptSubmit` and correct on both sides of the
switch: `auto` in the normal headless run, `plan` under `--permission-mode plan`. H1 can
gate on it.

**P4.** `PreToolUse` fires for `Workflow`, and `tool_name` is `Workflow`. When the model
called it as `{"name": "planandtier:execute-plan"}`, the hook's `tool_input` held only
`name`. The saved workflow is addressed by `name` with the plugin prefix, so H4 should match
on that field.

**P5.** The hook returned `updatedInput` = the original input plus `args: {tasks: [...]}`.
The script saw `typeof args === 'object'` and read all seven tasks from it. The
`PostToolUse` record's `tool_input` then held `name`, `args` and `script`, so the runtime
resolved the saved script onto the input after the hook ran. The spec's `JSON.parse` fallback
line is not needed, but it is harmless.

**P6.** `agent()` accepts `model`, `effort` and `agentType`, and applies them. Both Sonnet
tasks ran as `planandtier:worker`. `SubagentStop` records `effort: {level}` and it matched the
request (`low`, `high`) while the session itself ran at `high`, so `low` was applied rather
than inherited. `SubagentStop` is therefore a reliable way to read a task's effort without
opening `/workflows`. The per-effort worker files in the spec's fallback are not needed.

**P7.** All five Haiku tasks (`low`, `medium`, `high`, `xhigh`, `max`) ran to `done` on
`claude-haiku-4-5-20251001` without an error, and none of their `SubagentStop` records has
an `effort` field. Haiku takes an effort value and does nothing with it. Haiku tasks should
carry no effort, or one fixed value, so a planner does not pick between levels that are
identical.

**Worker nesting (weak evidence).** Six of seven workers reported they could not call the
Agent tool, which fits `disallowedTools: Agent`. The seventh (haiku `low`) answered "yes"
while naming only `ListAgents` and `SendMessage`. A model's report of its own tools is not
proof, so this is unconfirmed either way.

## Environment facts

- With `--plugin-dir`, Claude Code sets `CLAUDE_PLUGIN_DATA` itself, to
  `~/.claude/plugins/data/planandtier-inline`. A value set in the shell is ignored.
- `SubagentStart` carries only `agent_id` and `agent_type`. `SubagentStop` adds `effort` (when
  the model has one), `permission_mode` and `agent_transcript_path`.
- `PostToolUse` for `Workflow` returns when the workflow launches, not when it finishes, so
  its `tool_response` does not carry the workflow's result. This matters for H6: the state
  file is cleared at launch, as the spec already assumes.

## Decisions these findings support

- **Build as designed.** P4–P6 passed, so the spec's fallback architecture (hook-driven Agent
  dispatch) and per-effort worker files are not needed, pending P2/P3/P8.
- **Allowed pairs.** Haiku carries no effort. Sonnet and Opus take the full `low`…`max` range
  the spec lists; that has been shown for Sonnet only, at `low` and `high`.
