# Plan and Tier

Plan in plan mode, approve, and watch. Each task in the approved plan runs as its own subagent, one
at a time, on the model and effort chosen for it during planning. Orchestration runs as code in a
saved workflow, not as model turns, so a long plan costs the tasks and little else.

You use plan mode as you always do. The plugin adds a task list to the end of the plan and runs it
after you approve. There is nothing to type after approval.

## Install

Not in the marketplace catalog yet. Load it from a checkout of this repo:

```powershell
claude --plugin-dir ./plugins/planandtier
```

Requirements:
- **Node 20 or later** on the PATH. The hooks are Node scripts.
- **Dynamic workflows enabled** in `/config`. Workflows are a research preview, so behavior can change
  between Claude Code versions. This plugin was tested on 2.1.283.

## How to use

1. Start a plan as usual, in plan mode. The plugin adds its tiering rules to the conversation.
2. Claude explores, plans, and ends the plan with a `## Tasks` section holding a
   `json tiered-tasks` block: one entry per task, each with a model, an effort, and a self-contained
   prompt. If the block is invalid, `ExitPlanMode` is denied with the problems listed, and Claude fixes
   the plan and tries again. You never see an invalid plan.
3. Read the plan and approve it. This was tested with auto mode.
4. Claude launches the `planandtier:execute-plan` workflow. Watch it with `/workflows`. It stops at the
   first task that fails.

### Opting out

For a normal, untiered plan, ask for one. Claude then puts the line `Tiered execution: off` in the plan
instead of a task block. Without a task block or that line, the plan cannot be approved.

### Relaunching

The approved tasks are kept until the session ends. If the workflow halts, fix the cause and type
`/planandtier:execute-plan`, or ask Claude to run that workflow. The plugin supplies the same tasks
either way. Earlier tasks run again, so a rerun of a plan that already finished repeats all of it.

## What it does

| Pair | Meant for |
|---|---|
| `sonnet` / `low` | Extremely mechanical work: literal file content, renames, one-line edits |
| `sonnet` / `medium` | The default: fully specified work |
| `sonnet` / `high` | Fully specified but intricate work |
| `sonnet` / `xhigh` | Intricate and wide work across several files |
| `opus` / `low` to `high` | Bounded judgment, from small to the hardest |
| `opus` / `xhigh` | Very rare: extreme reasoning only |

Both models take `low`, `medium`, `high` and `xhigh`. Haiku is not offered.

Six hooks do the work:

| Hook | Job |
|---|---|
| Rules (H1) | Adds the tiering rules to the conversation in plan mode |
| Gate (H2) | Denies `ExitPlanMode` until the plan file's task block validates, up to three times |
| Hand-off (H3) | On approval, saves the tasks and tells Claude to launch the workflow |
| Arguments (H4) | Replaces the workflow's arguments with the saved tasks, so no model retypes them |
| Guard (H5) | Blocks edits and shell commands from the main thread until the workflow launches, and gives up after a few blocks |
| Cleanup (H6) | Reverts a failed launch and deletes the state when the session ends |

The workflow runs each task with the `planandtier:worker` agent at the task's model and effort. Workers
cannot start agents or workflows.

## What it does not do

- Run tasks in parallel. They run one at a time.
- Pause between tasks for your approval. A workflow cannot ask for input while it runs.
- Commit. Put a commit step in a task's prompt if you want one.
- Catch work that a task's `Verify:` step doesn't check.

## Known limitations

- **Workers see only their prompt.** They do not see the plan or the conversation, so a vague prompt gives
  a vague result.
- **Auto mode and manual permissions** both worked in testing. With manual permissions, expect an approval
  prompt when the workflow launches, and permission prompts from workers as they edit files or run
  commands. Allow rules for the tools your tasks use will reduce them. If nobody can approve (a
  non-interactive session), a worker that needs permission fails, and the workflow stops at that task.
- **The state is deleted at session end**, so a resumed session cannot relaunch the old plan.
- **The model launches the workflow.** The plugin tells it to and blocks other work until it does, but it
  cannot launch the workflow itself. If Claude never does, the guard steps aside after a few blocks.

## Configuration notes

- State lives in `${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json`, outside your repo. Nothing is written
  to the project.
- Set `PLANANDTIER_DEBUG=1` to log hook errors to `planandtier-debug.log` in the temp directory.
- The design, and the measurements behind it, are in
  [the spec](https://github.com/timschreiber/claude-plugins/blob/main/docs/planandtier/planandtier-spike-spec.md)
  and [the findings](https://github.com/timschreiber/claude-plugins/blob/main/docs/planandtier/planandtier-spike-findings.md).
