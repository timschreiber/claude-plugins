# planandtier: dispatching tasks through the Agent tool

planandtier ran its tasks in a dynamic workflow. Claude Code shows every workflow agent the user's latest
typed prompt as a request that overrides its task, and plan-dialog feedback is never relayed, so a task
changed through that feedback can be refused (see
[`planandtier-dialog-findings.md`](planandtier-dialog-findings.md#rejecting-a-plan-after-its-block-was-moved)).
Subagents started with the Agent tool get no such frame. These findings cover what hooks can see and
control if the tasks are dispatched that way instead. They are all on Claude Code 2.1.283 (Windows).

Evidence:
- `probes/evidence/planandtier-agent-probe.log` (every hook input) and
  `planandtier-agent-probe-results.json` (a summary), from `probes/planandtier/agent-probe.js`. That runner
  starts one headless session with `probes/planandtier/agent-probe-plugin`, a probe `sonnet-low` agent and
  hooks that log the Agent events and deny the first dispatch naming `Task: T01`.
- `probes/evidence/planandtier-reject-worker-frames.json` and the reject run's probe log, for the frames and
  `SubagentStop` records of the earlier interactive runs.

## Result

| Question | Answer |
|---|---|
| Do Agent-tool subagents get the "user request" frame? | **No.** Twelve Agent-tool subagents from interactive sessions on 2.1.282 and 2.1.283 had none, and neither did the probe's agent. The frame is the workflow runtime's. |
| What does `PreToolUse` on Agent see? | `tool_input` with `description`, `prompt`, `subagent_type` (namespaced, for example `planandtier-agent-probe:sonnet-low`) and `run_in_background`. The prompt arrives exactly as dispatched. |
| Does a denial with a corrective reason work? | **Yes.** The probe denied `Task: T01` and told Claude to dispatch `Task: T02`, and the next call was exactly that. |
| Where is the worker's report? | **`SubagentStop`**, in `last_assistant_message`, verbatim. `PostToolUse` on Agent does not carry it. |
| In what order? | `SubagentStop` fired before `PostToolUse` (14:32:40.052, then 14:32:40.207), so a `PostToolUse` hook can use what `SubagentStop` recorded. |

## Details

- **`SubagentStop`** carried `agent_type` (`planandtier-agent-probe:sonnet-low`), `effort` (`{"level": "low"}`,
  from the agent's frontmatter), `agent_transcript_path` and `last_assistant_message`
  (`STATUS: DONE` / `NOTE: probe ran T02`). In the earlier workflow runs, workers that ended with a
  structured-output tool call had no `last_assistant_message`. A worker that ends with a text report has
  one.
- **`PostToolUse` on Agent** had `tool_response.status: "completed"`, `agentType`, `resolvedModel`
  (`claude-sonnet-5`), token usage and duration. Its content said only that the report "was delivered to
  you as a message".
- **The report reached the model** as a `UserPromptSubmit` whose prompt is an `<agent-message>` block,
  opened by a "[Subagent hand-back]" frame. The frame says the report is model output and carries no
  user authority.
- **`run_in_background` is chosen per call.** Claude set it to `false` here, so the call ran in the
  foreground: `PostToolUse` fired after the worker finished, and the session continued in the same turn.
  In an earlier interactive session the result of an Agent call was "Async agent launched…", with the report
  arriving later as a notification. A `PreToolUse` hook can deny a dispatch with `run_in_background: true`.

## Not measured

- Interactive behavior: whether Claude sets `run_in_background: false` when told to, and how a denied
  background dispatch is handled in an interactive turn. These are covered by the end-to-end run of the
  rebuilt plugin.
- Whether `updatedInput` can change `subagent_type` or `run_in_background`. The design does not need it: it
  denies a wrong dispatch instead.
