# planandtier spike findings

Measured on Claude Code 2.1.283 (Windows) with `plugins/planandtier` loaded through
`--plugin-dir`. Two runs:

- **Headless:** `claude -p` sessions against a throwaway repo. Evidence:
  `probes/evidence/planandtier-spike-headless-results.json` (22 hook records). It has no
  `ExitPlanMode`, so it covers P1 and P4–P7 only.
- **Interactive:** one plan-and-approve session in auto mode, started in plan mode. Evidence:
  `probes/evidence/planandtier-spike-interactive-results.json` (25 hook records). It covers
  every probe. P3 and P8 also rest on the session transcript, which the log points to.

Both files come from `probes/planandtier/analyze-spike.js`, which reads the probe hooks' raw
stdin log. Probes are numbered as in `planandtier-spike-spec.md`; P8 is new: does the model
launch the workflow on a hook-injected instruction alone?

| Probe | Question | Result |
|---|---|---|
| P1 | `UserPromptSubmit` carries `permission_mode` | **Pass** |
| P2 | `ExitPlanMode` hooks fire; plan text present; a deny makes the model revise | **Pass, with a catch: `tool_input.plan` can be stale** |
| P3 | First response after approval sees H3's `additionalContext` | **Pass** |
| P4 | `Workflow` fires `PreToolUse`; its input fields | **Pass** |
| P5 | Hook-supplied `args` reach the script as an object | **Pass** |
| P6 | `agent()` accepts per-call `effort` and `agentType`, and applies them | **Pass** |
| P7 | Haiku accepts an effort value | **Accepted and ignored** |
| P8 | Model launches the workflow on injected context alone | **Pass, in auto mode** |

## Findings

**P1.** `permission_mode` is present on `UserPromptSubmit` and correct on both sides of the
switch: `plan` under `--permission-mode plan`, `auto` in a normal headless run and in the
interactive session after approval. H1 can gate on it.

**P2.** All three hook events fire for `ExitPlanMode`: `PreToolUse`, `PermissionRequest`
(the approval dialog) and `PostToolUse`. `tool_input` holds `plan` and `planFilePath`.

- A `PreToolUse` deny blocks the call. The model sees it as
  `PreToolUse:ExitPlanMode hook error: <reason>`, and it acted on the reason: it edited the
  plan file and called `ExitPlanMode` again. The user saw no denial dialog, only one plan and
  one approval.
- **The retried call's `tool_input.plan` was the old text**, without the requested line, even
  though the file at `planFilePath` had it. The `plan` parameter is whatever the model sent
  and can lag the file. **H2 and H3 must read the plan from `planFilePath` and treat
  `plan` as a fallback**, the reverse of what the spec says.

**P3.** The `PostToolUse` `additionalContext` reached the model. Its first message after
approval began with the marker word, `ZEBRA-PLANANDTIER`.

**P4.** `PreToolUse` fires for `Workflow`, and `tool_name` is `Workflow`. In both runs the model
called it as `{"name": "planandtier:execute-plan"}`, and the hook's `tool_input` held only
`name`. H4 should match on that field.

**P5.** The hook returned `updatedInput` = the original input plus `args: {tasks: [...]}`.
The script saw `typeof args === 'object'` and read all seven tasks from it, in both runs.
The `PostToolUse` record's `tool_input` then held `name`, `args` and `script`, so the runtime
resolved the saved script onto the input after the hook ran. The spec's `JSON.parse` fallback
is not needed but is harmless.

**P6.** `agent()` accepts `model`, `effort` and `agentType`, and applies them. Both Sonnet
tasks ran as `planandtier:worker`. `SubagentStop` records `effort: {level}` and it matched the
request (`low`, `high`) while the session ran at `high`, so `low` was applied rather than
inherited. The per-effort worker files in the spec's fallback are not needed.

**P7.** All five Haiku tasks (`low`, `medium`, `high`, `xhigh`, `max`) ran to `done` on
`claude-haiku-4-5-20251001` without an error, and none of their `SubagentStop` records has
an `effort` field. Haiku takes an effort value and does nothing with it. Haiku tasks should
carry no effort, or one fixed value, so a planner does not choose between identical levels.

**P8.** In auto mode, with nothing typed after approval, the model wrote the marker, called
`Workflow` with the saved workflow's name and all seven tasks ran. The only later
`UserPromptSubmit` was the workflow's own completion notification. So auto mode did not
hold back the launch, and no permission prompt for the workflow was needed. This was a single
run with one prompt. The model reached for the workflow because the injected text named it,
which the spec's risk table flagged as uncertain.

**Worker nesting (weak evidence).** In the headless run, six of seven workers reported they
could not call the Agent tool, which fits `disallowedTools: Agent`. The seventh (haiku `low`)
said yes while naming only `ListAgents` and `SendMessage`. A model's report of its own tools is
not proof, so this is unconfirmed either way.

## Environment facts

- With `--plugin-dir`, Claude Code sets `CLAUDE_PLUGIN_DATA` itself, to
  `~/.claude/plugins/data/planandtier-inline`. A value set in the shell is ignored.
- `SubagentStart` carries only `agent_id` and `agent_type`. `SubagentStop` adds `effort` (when
  the model has one), `permission_mode` and `agent_transcript_path`.
- The interactive session logged two `SubagentStop` records with no `agent_type`, in addition to
  the seven workers'. Anything that reads these records must filter on `agent_type`.
- `PostToolUse` for `Workflow` returns when the workflow launches, not when it finishes, so
  its `tool_response` does not carry the workflow's result. This matters for H6: the state
  file is cleared at launch, as the spec already assumes.

## Decisions these findings support

- **Build as designed.** P2–P6 and P8 passed, so the spec's fallback architecture (hook-driven
  Agent dispatch) and per-effort worker files are not needed.
- **Read the plan from `planFilePath`** in H2 and H3, per P2.
- **Allowed pairs.** Haiku carries no effort. Sonnet and Opus take the range the spec lists;
  that has been shown for Sonnet only, at `low` and `high`.
- **H3's wording** can follow the probe's: name the workflow and say to launch it with the
  Workflow tool. It worked once; the real tests should confirm it holds.
