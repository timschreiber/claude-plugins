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
| What does `PreToolUse` on Agent see? | `tool_input` with `description`, `prompt` and `subagent_type` (namespaced, for example `planandtier-agent-probe:sonnet-low`), plus `run_in_background` in a headless session only. The prompt arrives exactly as dispatched. |
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
- **Headless, `run_in_background` is chosen per call.** Claude set it to `false` here, so the call ran in
  the foreground: `PostToolUse` fired after the worker finished, and the session continued in the same turn.

## Interactive sessions: always in the background

The first interactive end-to-end attempt (2026-09-28, Claude Code 2.1.283, `planandtier-agents-run.md`)
required `run_in_background: false` and failed on it. Evidence:
`probes/evidence/planandtier-agents-interactive-attempt1-probe.log`, from the agent probe running beside the
plugin.

- **The Agent tool in an interactive session has no `run_in_background` field.** All three dispatches
  reached `PreToolUse` with only `description`, `prompt` and `subagent_type`, including the one where Claude
  said it had set the field to `false`. Claude reported that its Agent tool offers no such setting and
  always runs subagents in the background.
- **An earlier interactive session agrees.** The result of an Agent call there was "Async agent launched
  successfully … The agent is working in the background", with the report arriving later.
- **So the plugin no longer checks the field.** It judges each attempt at `SubagentStop`, which fires when
  the worker finishes in either mode, and gives Claude the next step when the worker's report arrives as a
  prompt. See the reference doc's [dispatch hook](planandtier-reference.md#h4-dispatch).
- **The plan-dialog rejection worked in that attempt.** The "Howdy" feedback reached both T02 and T03, and
  H2 rewrote the tasks file with a new hash. Only the dispatch failed.

## Not measured

- Whether the worker's report arrives as a `UserPromptSubmit` prompt in an interactive session, as it did
  headless. The rerun of `planandtier-agents-run.md` covers it.
- Whether `SubagentStop` carries `last_assistant_message` for a background worker. If not, H4 reads the
  worker's transcript.
- Whether `updatedInput` can change `subagent_type`. The design does not need it: it denies a wrong dispatch
  instead.
