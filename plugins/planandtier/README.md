# Plan and Tier

Plan in plan mode, approve, and watch. Each task in the approved plan runs as its own subagent, one at a
time, on the model and effort chosen for it during planning, and commits its own work. A task that fails
is rolled back and retried on a stronger tier.

You use plan mode as you always do, after typing `/planandtier:arm` once in the session. The plugin adds
a task list to the end of the plan and runs it after you approve. There is nothing to type after approval.

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

Installing it changes nothing on its own: every session starts unarmed, and an unarmed session plans and
works exactly as if the plugin were not installed. So it can stay installed everywhere.

Requirements:
- **Node 20 or later** on the PATH. The hooks are Node scripts.
- **Git, with a user name and email.** A tiered plan runs in a Git repository with a clean working tree:
  each task is a commit, and a failed attempt is reset to the commit before it. The repository needs a
  commit identity (`user.name` and `user.email`, set globally or in the repository), or the plan is refused.

Tested on Claude Code 2.1.283.

## How to use

1. **Commit or stash your changes.** Arming, and later approving a tiered plan, need a clean working
   tree.
2. **Arm the session: type `/planandtier:arm`.** Claude confirms it in one line. Arming is refused, with
   the reason, if Git is missing, the directory is not a repository with a commit, Git has no user name and
   email, or the tree has uncommitted changes; fix that and arm again. Arming lasts for the session;
   `/clear` starts a new, unarmed one. The same checks run again when Claude submits the plan, since the
   tree can change in between.
3. **Start a plan as usual, in plan mode.** The plugin adds its tiering rules to the conversation.
4. **Claude plans** and ends the plan with a `## Tasks` section holding a `json tiered-tasks` block: one
   entry per task, each with a model, an effort and a self-contained prompt. If the block is invalid,
   `ExitPlanMode` is denied with the problems listed, and Claude fixes the plan and tries again. You never
   see an invalid plan.
5. **Read the plan and approve it.** The approval dialog shows a table of the tasks (title, model, effort and
   prompt length) instead of the block, because it cannot show a plan with very long lines. The full prompts
   are in the tasks file the table names, next to the plan (`<plan>.tasks.json`). Open it to read them
   before you approve.
6. **Watch.** Claude dispatches each task to the agent for its tier. The worker runs in the background and
   Claude ends its turn; when the worker's report arrives, the plugin gives Claude the next step, so the run
   carries on with nothing typed. The worker does the task, runs its `Verify:` step and, if it passed,
   commits with the task's title, a `Planandtier-Task: T02` line and a `Planandtier-Plan: <id>` line that
   names the plan. When every task is done, Claude says so.

### When a task fails

It is retried, twice at most, each time one tier up (`sonnet` from `low` to `high`, then `opus` from `low`
to `xhigh`). Before each retry the working tree is reset to the commit before the
task, so earlier tasks' commits are kept. If the second retry fails too, the run stops, and the last
attempt's changes stay in the working tree for you to inspect.

### Continuing after an interruption

If you interrupt a run, just say "continue": the plugin tells Claude where the run stands and what to
dispatch next. The run lasts until the session ends. The tasks that finished are already committed.

### Picking a plan up again

A run does not survive its session, and neither does a plan you never got to approve. The plan file stays
on disk, though (in `~/.claude/plans/`), and you can run it in a new session:

```
/planandtier:execute-plan ~/.claude/plans/brave-fox.md
```

- **A planandtier plan runs as tiered tasks.** The session is armed, and the run starts at the first task
  not already committed on the current branch: tasks from an earlier run of the same plan are skipped, and
  Claude says which. It needs the same clean Git repository as approving a plan does.
- **With no path,** Claude lists the most recent planandtier plans and asks which one to run.
- **`--from T03`** starts at a given task instead, treating the ones before it as done. Use it for a run
  whose commits predate the plan line, or when Claude reports a gap (a later task committed, an earlier one
  not).
- **A plain plan** (one made without planandtier, or with `Tiered execution: off`) runs without planandtier:
  Claude implements it as it normally would.
- **A planandtier plan whose tasks file is missing or changed is refused.** Its task prompts are not in the
  plan, so there is nothing reliable to run.

Type it outside plan mode: the workers work in the session's permission mode.

### What a run costs

The plugin estimates the tokens and cost of every run, and shows them to you as the run goes:

- **After each task attempt**, a line such as
  `planandtier: T02 on sonnet-medium done: 412k tokens (96% cache reads), ~$0.31. Run so far: ~$0.52.`
- **When the run ends** (completed, stopped or disarmed), a summary:

  ```
  planandtier spend (estimated, prices as of 2026-09-28):
    planning       ~$0.40  claude-opus-5-5, 3 subagents
    sonnet-low     ~$0.05  1 attempt, 180k tokens
    sonnet-medium  ~$0.33  2 attempts (1 failed), 590k tokens
    opus-high      ~$0.61  1 attempt, 410k tokens
    orchestration  ~$0.20  claude-sonnet-5
    total          ~$1.59
  ```

**Planning** is what the main session spent in plan mode on this plan, plus its Explore and Plan
subagents. Each message is priced at the model that wrote it, so an `opusplan` session is priced
correctly. **Orchestration** is the main session's own turns during the run.

Everything is also written, one JSON line per event, to `<plan>.telemetry.jsonl` beside the plan in
`~/.claude/plans/`. Nothing is sent anywhere. The numbers come from Claude Code's own transcripts, priced
from Anthropic's published rates, so they are **estimates**:
- output counts can run slightly low;
- fast mode is priced at the standard rate;
- a subscription plan isn't billed per token at all.

### Disarming

Type `/planandtier:disarm` to turn the plugin off for the rest of the session. If a run is in progress, it
stops: nothing more is dispatched, and Claude tells you which tasks are done and committed and which did
not run. A worker already running finishes, but its work is not checked or rolled back.

### Opting out

In an armed session, for a normal, untiered plan, ask for one. Claude then puts the line `Tiered execution: off` in the plan
instead of a task block, and nothing about Git is required. Without a task block or that line, the plan
cannot be approved.

## The tiers

| Tier | Meant for |
|---|---|
| `sonnet` / `low` | Fully given work: literal find-and-replace edits, a new file with its exact content, or a checked rename |
| `sonnet` / `medium` | The baseline: fully specified work |
| `sonnet` / `high` | Fully specified but intricate work |
| `opus` / `low` | Intricate work across several files, or small bounded judgment |
| `opus` / `medium` to `high` | Judgment the plan cannot pin down, up to the hardest bounded work |
| `opus` / `xhigh` | Very rare: extreme reasoning only |

Claude picks the model by the kind of work, starts at `medium` effort, and goes lower for simpler tasks and
higher for harder ones. Sonnet stops at `high`: harder work goes to `opus` / `low`, which measured
stronger than Sonnet 5 at `xhigh`. A plan that asks for `sonnet` / `xhigh` anyway runs it at `opus` / `low`.
That choice will be revisited when a newer Sonnet ships. Haiku is not offered: it doesn't follow
instructions reliably enough for coding work.

Each tier is its own agent, `planandtier:<model>-<effort>`, with the model and effort set in its
definition. Workers cannot start agents or workflows.

## How it works

Every hook does nothing in an unarmed session, except H1 handling the arm, disarm and execute-plan
commands and H6 cleaning up.

| Hook | Job |
|---|---|
| Rules (H1) | Arms and disarms the session when you type the commands, and starts a saved plan for `/planandtier:execute-plan`. Adds the tiering rules in plan mode. During a run, gives Claude the next step when a worker's report arrives, and reminds it of the next dispatch when you write. |
| Gate (H2) | Denies `ExitPlanMode` until the task block validates and the repository can run it (a commit, a commit identity and a clean tree), then moves the block to the tasks file and leaves a table |
| Hand-off (H3) | On approval, starts the run and gives Claude the first dispatch |
| Dispatch (H4) | Lets through only the expected dispatch; when the worker finishes, reads its report, checks its commit, and decides the next dispatch, a retry after a reset, or a stop |
| Guard (H5) | Blocks main-thread file edits and stopping while a task is due, and gives up after a few blocks |
| Cleanup (H6) | Deletes the run's state and the arming flag when the session ends |

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
  committed, and `/planandtier:execute-plan` can pick the plan up in a new session.
- **Spend is an estimate,** from transcripts and a price table fixed in the plugin with its date. A
  worker still running when you disarm is not counted, and orchestration includes anything else you ask
  Claude during the run.
- **The plan listing only looks in `~/.claude/plans`.** If you moved the plans directory with the
  `plansDirectory` setting, type the plan's path.
- **The model dispatches the tasks.** The plugin gives the exact call and refuses any other, but it cannot
  make the call itself. If Claude keeps doing something else, the guard steps aside after a few blocks.

## Configuration notes

- The run's state lives in `${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json`, outside your repo, and
  the arming flag beside it in `<session_id>.armed`. Both are deleted when the session ends, and any left
  behind are removed after 7 days. The tasks
  file sits next to the plan file in Claude Code's plans directory and is kept as a record of what ran.
  The only changes to your repository are the tasks' own commits.
- Set `PLANANDTIER_DEBUG=1` to log hook errors and every state change to `planandtier-debug.log` in the
  temp directory.
- Everything the plugin does is described in
  [the reference](https://github.com/timschreiber/claude-plugins/blob/main/docs/planandtier/planandtier-reference.md),
  with the measurements behind it.
