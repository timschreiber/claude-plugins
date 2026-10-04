# tierminator: dispatching tasks through the Agent tool

tierminator ran its tasks in a dynamic workflow. Claude Code shows every workflow agent the user's latest
typed prompt as a request that overrides its task, and plan-dialog feedback is never relayed, so a task
changed through that feedback can be refused (see
[`tierminator-dialog-findings.md`](tierminator-dialog-findings.md#rejecting-a-plan-after-its-block-was-moved)).
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

The first interactive end-to-end attempt (2026-09-28, Claude Code 2.1.283, `tierminator-agents-run.md`)
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
  prompt. See the reference doc's [dispatch hook](tierminator-reference.md#h4-dispatch).
- **The plan-dialog rejection worked in that attempt.** The "Howdy" feedback reached both T02 and T03, and
  H2 rewrote the tasks file with a new hash. Only the dispatch failed.

## The interactive run with background dispatch

The second interactive run (2026-09-28, Claude Code 2.1.283) ran all three tasks with nothing typed after
approval. Evidence: `probes/evidence/planandtier-agents-probe.log` (every Agent, SubagentStop, prompt and
Stop hook input) and `planandtier-agents-debug.log` (every state write).

- **The rejection with feedback worked end to end.** The approved plan and both task prompts said
  "Howdy", and the finished `greet.js` returns `"Howdy, " + name + "!"`.
- **Each background launch returned at once.** `PostToolUse` had
  `{"isAsync": true, "status": "async_launched", "agentId": …}`, and Claude ended its turn.
- **The worker's report reaches the main session twice, as prompts:**
  - an `<agent-message>` hand-back, which arrives **before** the worker's `SubagentStop`
    (16:55:50.4, then 16:55:51.8);
  - a `<task-notification>`, which arrives **after** it (16:55:58.7).

  The notification is what carries H4's notice to Claude.
- **`SubagentStop` carries `last_assistant_message`, but that is not always the report.** Workers delivered
  their report through Claude Code's `SubagentHandback` tool (`message: "STATUS: DONE\nCOMMIT: …"`).
  Sometimes they then ended with a closing line: "Task complete." for T02's first attempt, and "Task T03
  complete and handed back." for T03's. H4 read only that line and failed both correct attempts with "the
  worker returned no STATUS report". It reset their commits and retried them on `sonnet-medium`, which
  passed. The other three attempts ended by repeating the block as text and were accepted.
- **Fixed:** H4 now takes `last_assistant_message` only when it holds a STATUS block, and otherwise
  searches the worker's transcript for the hand-back message. Replaying the two rejected transcripts
  through the fixed hook finds `DONE` reports.
- **Claude sometimes dispatches before tierminator's notice.** After T01, Claude dispatched T02 from the
  hand-back report alone, before the notice was shown. That was harmless: H4 accepted the dispatch because
  it was the expected one, and dropped the unshown notice.
- **Every worker commit carried its `Tierminator-Task:` line.** The workers put `Co-Authored-By` in a
  paragraph after it, so Git does not parse `Tierminator-Task:` as a trailer. H4 checks the message text,
  so this does not matter to the plugin.

## The fix, in a live run

A rerun with the report fix in place (2026-09-28, 17:05). Evidence: `probes/evidence/planandtier-agents-rerun-probe.log` and
`planandtier-agents-rerun-debug.log`. It ran in the same throwaway repo, which the setup had not rebuilt, so
`greet.js` and its tests were already committed. Claude planned only T01.

- **T01's worker ended exactly as the failed attempts did.** `SubagentStop` had `last_assistant_message:
  "Task complete."`, with the report handed back by tool.
- **H4 found the report in the transcript** and accepted the attempt on its first tier (`sonnet-low`). The
  run went to `complete`, and the README change was committed as one commit with its `Tierminator-Task:`
  line.

## Arming: what a typed skill command looks like to a hook

Before building `/tierminator:arm`, a headless probe (2026-09-28, Claude Code 2.1.283,
`probes/planandtier/arm-probe.js`) typed `/planandtier-agent-probe:arm`. That is a skill in the probe plugin
with `disable-model-invocation: true`, whose body tells the model to reply `ARM-SKILL-BODY-SEEN`. Evidence:
`probes/evidence/planandtier-arm-probe.log` and `planandtier-arm-probe-results.json`.

- **`UserPromptSubmit` received the raw typed text,** `"/planandtier-agent-probe:arm"`, not the expanded
  skill body. So a hook can recognize the command exactly.
- **The namespaced command resolved** to the plugin's skill.
- **The skill body reached the model,** which replied `ARM-SKILL-BODY-SEEN`, even though the skill cannot be
  invoked by the model itself.

## Executing a saved plan, live

The execute-plan run guide, 2026-09-28 16:23 to 17:11 (Claude Code 2.1.284, tierminator installed at
`b8a88f5`, throwaway repo `tier-execute-20260928-162334`). Each part was a separate session. Evidence:
- `probes/evidence/planandtier-execute-plan-20260928-162334-partB-*`, `-partC-*` and `-partD-*`;
- `-telemetry.jsonl`, the plan's whole telemetry file.

- **A plan left unapproved can be run later.** Part A planned three tasks and left at the approval dialog.
  In Part B, `/tierminator:execute-plan` with no path listed it first, and typing the command with its path
  armed the session and ran T01 to T03. Each commit carries `Tierminator-Plan: dc933c25fcd95514`.
- **Only a typed command starts a plan.** Asked "1." after the listing, Claude refused and gave the command
  to type. The user-only skill cannot be run by the model. `/tierminator:execute-plan <number>` has since
  been added for this.
- **Tasks already committed are skipped.** Part C reset the branch to just after T01 and ran the command in
  a third session. Its `run` record starts at T02, and Claude said T01 would not run again. Only T02 and T03
  ran, and the summary counted 2 attempts.
- **Planning is counted across sessions.** Both runs' summaries included Part A's planning ($0.27), recorded
  in a session that never ran anything.
- **A plain plan runs without tierminator.** In Part D, a plan file with no task table was implemented by
  Claude directly, with no Agent dispatch, as the note said. The change was left uncommitted, as nothing
  requires a commit for a plain plan.
- **The early hand-back needed a note.** In Parts B and C the worker's report arrived before its
  `SubagentStop`, and Claude, with no next step yet, told the user to re-run the command. The Stop block
  then gave the next step. `af16b43` adds the note, and `eb1e5fc` moves the next step to the "finished"
  notification. Neither was installed for this run.

## A hand-back makes the finished notification transcript-only (Claude Code 2.1.285)

Evidence: `probes/evidence/planandtier-handback-stall.json`, made by
`probes/planandtier/extract-handback-stall.js` from the WP-01 session transcript. The entry indexes below
are the transcript's own line numbers (0-based).

- When a worker hands its report back with `SubagentHandback`, the report arrives as an `<agent-message>`
  prompt. Its record has `origin: {handback: true}` (entries 266-268), and `UserPromptSubmit` fires on it
  (entry 269).
- The later `<task-notification>` is recorded with `queueTranscriptOnly: true` (entry 277). Its text says
  the report is not repeated. It starts no turn and fires no `UserPromptSubmit`. The `Stop` hook had
  already run for the hand-back turn (entries 273-274), before the notification was recorded.
- So a notice that H4 left for the notification (`noticeByNotification`) was never delivered. H5 let the
  turn end, H1 had no prompt to give the notice on, and the run stalled after T01 until the user typed.
- The notice is now delivered by judging in H1, in the hand-back turn. H1 sees the `<agent-message>`,
  takes the report from the prompt (or the worker's transcript), judges the attempt and gives Claude the
  next step in that same turn. No later event is needed.

### Why not wait at Stop

An earlier fix had H5 wait at Stop for H4's `SubagentStop` to judge the attempt. Whether `SubagentStop`
had run by then varied from run to run, so the wait was timing-dependent and its test was flaky.
Orcastrat avoids the problem because its orchestrator judges a report when it reads it, and its Stop
guard is level-triggered (`plugins/orcastrat/hooks/stop-guard`).

## Not measured

- The fixes in `af16b43` and `eb1e5fc` (the early-report note, and the next step given with the "finished"
  notification instead of a Stop block), in a live run. The run guides check them. The three-task run in a
  fresh repo with the report fix has since been done twice (`planandtier-agents-20260928-155438-*`,
  `-161554-*`).
- Whether `updatedInput` can change `subagent_type`. The design does not need it: it denies a wrong dispatch
  instead.
