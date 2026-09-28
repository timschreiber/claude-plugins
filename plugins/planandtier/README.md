# Plan and Tier

Plan in plan mode, approve, and watch. Each task in the approved plan runs as its own subagent, one at a
time, on the model and effort chosen for it during planning, and commits its own work. A task that fails
is rolled back and retried on a stronger tier.

You use plan mode as you always do. The plugin adds a task list to the end of the plan and runs it after
you approve. There is nothing to type after approval.

For a project too big for one plan (milestones, parallel work, planned reviews), use
[Orchestratinator](https://github.com/timschreiber/claude-plugins/tree/main/plugins/orchestratinator)
instead. Plan and Tier is for a plan that fits in one plan-mode session.

## Install

```bash
claude plugin marketplace add timschreiber/claude-plugins
claude plugin install planandtier@timschreiber
```

To try it from a checkout of this repo instead:

```powershell
claude --plugin-dir ./plugins/planandtier
```

Requirements:
- **Node 20 or later** on the PATH. The hooks are Node scripts.
- **Git.** A tiered plan runs in a Git repository with a clean working tree: each task is a commit, and a
  failed attempt is reset to the commit before it.

Tested on Claude Code 2.1.283.

## How to use

1. **Commit or stash your changes.** A tiered plan cannot be approved while the working tree has
   uncommitted changes, and Claude tells you if that is the case.
2. **Start a plan as usual, in plan mode.** The plugin adds its tiering rules to the conversation.
3. **Claude plans** and ends the plan with a `## Tasks` section holding a `json tiered-tasks` block: one
   entry per task, each with a model, an effort and a self-contained prompt. If the block is invalid,
   `ExitPlanMode` is denied with the problems listed, and Claude fixes the plan and tries again. You never
   see an invalid plan.
4. **Read the plan and approve it.** The approval dialog shows a table of the tasks (title, model, effort and
   prompt length) instead of the block, because it cannot show a plan with very long lines. The full prompts
   are in the tasks file the table names, next to the plan (`<plan>.tasks.json`). Open it to read them
   before you approve.
5. **Watch.** Claude dispatches each task to the agent for its tier. The worker does the task, runs its
   `Verify:` step and, if it passed, commits with the task's title and a `Planandtier-Task: T02` trailer.
   When every task is done, Claude says so.

### When a task fails

It is retried, twice at most, each time one tier up (`haiku-default`, then `sonnet` from `low` to `high`,
then `opus` from `low` to `xhigh`). Before each retry the working tree is reset to the commit before the
task, so earlier tasks' commits are kept. If the second retry fails too, the run stops, and the last
attempt's changes stay in the working tree for you to inspect.

### Continuing after an interruption

If you interrupt a run, just say "continue": the plugin tells Claude where the run stands and what to
dispatch next. The run lasts until the session ends. The tasks that finished are already committed.

### Opting out

For a normal, untiered plan, ask for one. Claude then puts the line `Tiered execution: off` in the plan
instead of a task block, and nothing about Git is required. Without a task block or that line, the plan
cannot be approved.

## The tiers

| Tier | Meant for |
|---|---|
| `haiku` / `default` | The simplest work: literal find-and-replace edits to existing files |
| `sonnet` / `low` | Fully given work: a new file with its exact content, or a checked rename |
| `sonnet` / `medium` | The baseline: fully specified work |
| `sonnet` / `high` | Fully specified but intricate work |
| `opus` / `low` | Intricate work across several files, or small bounded judgment |
| `opus` / `medium` to `high` | Judgment the plan cannot pin down, up to the hardest bounded work |
| `opus` / `xhigh` | Very rare: extreme reasoning only |

Claude picks the model by the kind of work, starts at `medium` effort, and goes lower for simpler tasks and
higher for harder ones. Sonnet stops at `high`: harder work goes to `opus` / `low`, which measured
stronger than Sonnet 5 at `xhigh`. That choice will be revisited when a newer Sonnet ships.

Each tier is its own agent, `planandtier:<model>-<effort>`, with the model and effort set in its
definition. Workers cannot start agents or workflows.

## How it works

| Hook | Job |
|---|---|
| Rules (H1) | Adds the tiering rules in plan mode. While a run is in progress, reminds Claude of the next dispatch when you write. |
| Gate (H2) | Denies `ExitPlanMode` until the task block validates and the Git tree is clean, then moves the block to the tasks file and leaves a table |
| Hand-off (H3) | On approval, starts the run and gives Claude the first dispatch |
| Dispatch (H4) | Lets through only the expected dispatch, reads each worker's report, checks its commit, and gives the next dispatch, a retry after a reset, or a stop |
| Guard (H5) | Blocks main-thread file edits and stopping while a task is due, and gives up after a few blocks |
| Cleanup (H6) | Deletes the run's state when the session ends |

## What it does not do

- Run tasks in parallel. They run one at a time.
- Pause between tasks for your approval.
- Push. Each task is a local commit on your current branch.
- Catch work that a task's `Verify:` step doesn't check.

## Known limitations

- **Workers see only their prompt**, not the plan or the conversation, so a vague prompt gives a vague
  result.
- **You approve a table, not the prompts.** The prompts are in the tasks file. If the tasks file or the
  table is changed after the table was written, the plan does not run, and Claude says so.
- **Orchestration uses model turns.** Claude makes one Agent call per task attempt and reads a short report
  back, so a long plan adds some main-session cost.
- **Manual permissions:** workers may ask for permission as they edit files or run commands. Allow rules
  for the tools your tasks use will reduce that.
- **A run does not outlive its session.** Its state is deleted at session end. Tasks that finished are
  committed.
- **The model dispatches the tasks.** The plugin gives the exact call and refuses any other, but it cannot
  make the call itself. If Claude keeps doing something else, the guard steps aside after a few blocks.

## Configuration notes

- The run's state lives in `${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json`, outside your repo. The tasks
  file sits next to the plan file in Claude Code's plans directory and is kept as a record of what ran.
  The only changes to your repository are the tasks' own commits.
- Set `PLANANDTIER_DEBUG=1` to log hook errors and every state change to `planandtier-debug.log` in the
  temp directory.
- Everything the plugin does is described in
  [the reference](https://github.com/timschreiber/claude-plugins/blob/main/docs/planandtier/planandtier-reference.md),
  with the measurements behind it.
