# Tierminator

Plan in plan mode, approve, and watch. Each task in the approved plan runs as its own subagent, one at a
time, on the model and effort chosen for it during planning, and commits its own work. A task that fails
is rolled back and retried on a stronger tier.

Type `/tierminator:plan` and what you want: Claude plans it in plan mode, the plugin adds a task list to
the end of the plan, and it runs after you approve. There is nothing to type after approval.

For a project too big for one plan (milestones, parallel work, planned reviews), use
[Orchestratinator](https://github.com/timschreiber/claude-plugins/tree/main/plugins/orchestratinator)
instead. Tierminator is for a plan that fits in one plan-mode session.

## Install

```bash
claude plugin marketplace add timschreiber/claude-plugins
claude plugin install tierminator@timschreiber
```

To try it from a checkout of this repo instead:

```powershell
claude --plugin-dir ./plugins/tierminator
```

Installing it changes nothing on its own: only `/tierminator:plan` and `/tierminator:execute` turn it on, and
a session without them plans and works exactly as if the plugin were not installed. A plan made in plan
mode without `/tierminator:plan` is not tiered. So it can stay installed everywhere.

Requirements:
- **Node 20 or later** on the PATH. The hooks are Node scripts.
- **Git, with a user name and email.** A tiered plan runs in a Git repository with a clean working tree:
  each task is a commit, and a failed attempt is reset to the commit before it. The repository needs a
  commit identity (`user.name` and `user.email`, set globally or in the repository), or the plan is refused.

Tested on Claude Code 2.1.283.

## How to use

1. **Commit or stash your changes.** Starting to plan, and later approving a tiered plan, need a clean
   working tree.
2. **Type `/tierminator:plan` and what you want planned,** for example
   `/tierminator:plan add a --verbose flag`.
   - **Claude switches the session to plan mode** if it isn't there already. Claude Code may ask you to
     approve entering plan mode. The plugin adds its tiering rules to the conversation.
   - **Planning is refused, with the reason,** if Git is missing, the directory is not a repository with a
     commit, Git has no user name and email, or the tree has uncommitted changes. Fix that and type the
     command again.
   - **The same checks run again when Claude submits the plan,** since the tree can change in between.
   - **Leaving plan mode without approving** ends the plugin's part: the next plan is not tiered unless it
     starts with `/tierminator:plan` again.
3. **Answer Claude's questions, if it has any.**
4. **Claude plans** and ends the plan with a `## Tasks` section holding a `json tiered-tasks` block: one
   entry per task, each with a model, an effort and a self-contained prompt. If the block is invalid,
   `ExitPlanMode` is denied with the problems listed, and Claude fixes the plan and tries again. You never
   see an invalid plan.
5. **Read the plan and approve it.** The approval dialog shows a table of the tasks (title, model, effort and
   prompt length) instead of the block, because it cannot show a plan with very long lines. The full prompts
   are in the tasks file the table names, next to the plan (`<plan>.tasks.json`). Open it to read them
   before you approve.
6. **Watch.** Claude dispatches each task to the agent for its tier. The worker runs in the background and
   Claude ends its turn. When the worker finishes, the plugin gives Claude the next step along with Claude
   Code's "Agent … finished" notification, so the run carries on with nothing typed. The worker does the task, runs its `Verify:` step and, if it passed,
   commits with the task's title, a `Tierminator-Task: T02` line and a `Tierminator-Plan: <id>` line that
   names the plan. When every task is done, Claude says so.

### When a task fails

It is retried, twice at most, each time one tier up (`sonnet` from `low` to `high`, then `opus` at
`medium` and `high`). Before each retry the working tree is reset to the commit before the
task, so earlier tasks' commits are kept. If the second retry fails too, or a task fails at `opus` /
`high`, the run stops, and the last attempt's changes stay in the working tree for you to inspect.

### Stopping a run

Typing anything while a run is in progress stops it: nothing more is dispatched, and Claude tells you which
tasks are done and committed, which did not run, and the `/tierminator:execute` command that resumes it. A
worker already running finishes, but its work is not checked or rolled back. The tasks that finished are
already committed.

### Picking a plan up again

A run does not survive a prompt you type during it, or its session, and neither does a plan you never got
to approve. The plan file stays on disk, though (in `~/.claude/plans/`), and you can run it, in this session
or a new one:

```
/tierminator:execute ~/.claude/plans/brave-fox.md
```

- **A tierminator plan runs as tiered tasks.** The run starts at the first task
  not already committed on the current branch: tasks from an earlier run of the same plan are skipped, and
  Claude says which. It needs the same clean Git repository as approving a plan does.
- **With no path,** Claude lists the most recent tierminator plans, numbered. Then pick one by typing its
  number: `/tierminator:execute 1`. A number always refers to the list you were last shown in the
  session.
- **`--from T03`** starts at a given task instead, treating the ones before it as done. Use it for a run
  whose commits predate the plan line, or when Claude reports a gap (a later task committed, an earlier one
  not).
- **A plain plan** (one made without tierminator, or with `Tiered execution: off`) runs without tierminator:
  Claude implements it as it normally would.
- **A tierminator plan whose tasks file is missing or changed is refused.** Its task prompts are not in the
  plan, so there is nothing reliable to run.

Type it outside plan mode: the workers work in the session's permission mode.

### What a run costs

The plugin estimates the tokens and cost of every run, and shows them to you as the run goes:

- **After each task attempt**, a line such as
  `tierminator: T02 on sonnet-medium done: 412k tokens (96% cache reads), ~$0.31. Run so far: ~$0.52.`
  It appears when Claude next ends a turn, which in a normal run is right after it starts the next task.
- **When the run ends** (completed, halted, or stopped by a prompt you typed), a summary:

  ```
  tierminator spend (estimated, prices as of 2026-09-28):
    planning       ~$0.40  claude-opus-5-5, 3 subagents, 88% cache reads
    sonnet-low     ~$0.05  1 attempt, 180k tokens, 94% cache reads
    sonnet-medium  ~$0.33  2 attempts (1 failed), 590k tokens, 96% cache reads
    opus-high      ~$0.61  1 attempt, 410k tokens, 95% cache reads
    orchestration  ~$0.20  claude-sonnet-5, 91% cache reads
    total          ~$1.59  2.1M tokens, 93% cache reads
    main agent     ~$2.40  3.4M tokens, claude-opus-5-5 running the tasks itself (estimated)
    savings        ~$0.81  34% of the main agent's cost, 1.3M fewer tokens
  ```

**Planning** is what the main session spent in plan mode on this plan, including rounds you rejected, plus
its Explore and Plan subagents. Each message is priced at the model that wrote it, so an `opusplan` session is priced
correctly. **Orchestration** is the main session's own turns during the run.

The **main agent** row estimates what it would have cost had the planning model done the finished tasks itself.
Each of its turns would re-read the session's context at approval plus what earlier tasks added. The row leaves out
failed attempts and orchestration, and ignores compaction and effort, so it is a rough guide. The last row is
`savings`, or `extra cost` when tierminator cost more. With data missing, the row says `not estimated` and
gives the reason.

Everything is also written, one JSON line per event, to `<plan>.telemetry.jsonl` beside the plan in
`~/.claude/plans/`. Nothing is sent anywhere. The numbers come from Claude Code's own transcripts, priced
from Anthropic's published rates, so they are **estimates**:
- output counts can run slightly low;
- fast mode is priced at the standard rate;
- a subscription plan isn't billed per token at all.

### Opting out

After `/tierminator:plan`, for a normal, untiered plan, ask for one. Claude then puts the line `Tiered execution: off` in the plan
instead of a task block, and nothing about Git is required. Without a task block or that line, the plan
cannot be approved.

## Unattended runs

For a headless run, start the prompt with `/tierminator:plan`:

```bash
claude -p --model opus --effort medium --permission-mode bypassPermissions "/tierminator:plan <request>"
```

The plugin tells a headless session from an interactive one by `CLAUDE_CODE_ENTRYPOINT`, which Claude Code
sets to `sdk-cli` for `claude -p`. Interactive sessions plan in plan mode and approve in the dialog.

- **The main thread plans and then orchestrates,** so `--model` and `--effort` choose the planning model.
  Opus at `medium` effort is the recommendation, and other values override it. tierminator cannot set them
  itself. Workers always run at their task's tier.
- **`/tierminator:plan` starts unattended planning.** Claude plans read-only outside plan mode and ends its turn with
  the plan. tierminator saves it as `tierminator-unattended-<time>-<session>.md` in the plans directory and
  runs it with no approval.
- **Requirements:** not plan mode (headless sessions have no `ExitPlanMode`), a clean Git tree with a commit
  identity, and permissions for workers to edit, run their `Verify:` commands and `git commit` unattended
  (`bypassPermissions` in a sandbox or CI, or `acceptEdits` with `--allowedTools` rules).
- **An invalid plan gets three chances and then nothing runs.** It never falls back to untiered work. After
  a compaction the rules are given again.

## The tiers

| Tier | Meant for |
|---|---|
| `sonnet` / `low` | Fully given work: literal find-and-replace edits, a new file with its exact content, or a checked rename |
| `sonnet` / `medium` | The baseline: fully specified work |
| `sonnet` / `high` | Fully specified but intricate work, including across several files |
| `opus` / `medium` | The baseline for judgment: work the plan cannot pin down |
| `opus` / `high` | Rare: the hardest bounded work |

Claude picks the model by the kind of work and starts at `medium` effort. Sonnet goes lower for simpler
tasks and higher for harder ones. Opus runs only at `medium` and `high`. On Anthropic's published coding
benchmarks for Sonnet 5.5, Opus 5.5 at `low` scores below Sonnet 5.5 at `high` and doesn't gain enough
over it to earn a tier. Sonnet 5.5 at `xhigh` scores no better than Opus 5.5 at `medium` or `high` and
costs as much or more, and Opus at `xhigh` adds little over `high`. A plan that asks for `sonnet` / `xhigh`
or `opus` / `low` anyway runs it at `opus` / `medium`, and `opus` / `xhigh` runs at `opus` / `high`.
Haiku is not offered: it doesn't follow instructions reliably enough for coding work.

Each tier is its own agent, `tierminator:<model>-<effort>`, with the model and effort set in its
definition. Workers cannot start agents or workflows.

## How it works

Every hook does nothing in an inactive session, except H1 handling the `/tierminator:plan` and
`/tierminator:execute` commands and H6 cleaning up.

| Hook | Job |
|---|---|
| Rules (H1) | Starts planning for `/tierminator:plan` and a saved plan for `/tierminator:execute`. Adds the tiering rules once when planning starts, and again after compaction (`PreCompact` clears the record that they were shown). During a run, gives Claude the next step when a worker's report arrives, and stops the run when you type a prompt. |
| Gate (H2) | Denies `ExitPlanMode` until the task block validates and the repository can run it (a commit, a commit identity and a clean tree), then moves the block to the tasks file and leaves a table |
| Hand-off (H3) | On approval of a plan made after `/tierminator:plan`, starts the run and gives Claude the first dispatch |
| Dispatch (H4) | Lets through only the expected dispatch; when the worker finishes, reads its report, checks its commit, and decides the next dispatch, a retry after a reset, or a stop |
| Guard (H5) | Blocks main-thread file edits and stopping while a task is due, and gives up after a few blocks |
| Cleanup (H6) | Deletes the run's state and the activation flag when the session ends |

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
- **A run does not outlive its session, or a prompt you type during it.** Tasks that finished are
  committed, and `/tierminator:execute` can pick the plan up again.
- **Spend is an estimate,** from transcripts and a price table fixed in the plugin with its date. A
  worker still running when you stop the run is not counted, and orchestration includes anything else you ask
  Claude during the run.
- **The plan listing only looks in `~/.claude/plans`.** If you moved the plans directory with the
  `plansDirectory` setting, type the plan's path.
- **The next step rides on Claude Code's "Agent … finished" notification.** It has always arrived in
  testing. If it ever didn't, the run would wait until you type something, which gives Claude the next
  step.
- **The model dispatches the tasks.** The plugin gives the exact call and refuses any other, but it cannot
  make the call itself. If Claude keeps doing something else, the guard steps aside after a few blocks.

## Configuration notes

- The run's state lives in `${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json`, outside your repo, and
  the activation flag beside it in `<session_id>.active`. Both are deleted when the session ends, and any left
  behind are removed after 7 days. The tasks
  file sits next to the plan file in Claude Code's plans directory and is kept as a record of what ran.
  The only changes to your repository are the tasks' own commits.
- Set `TIERMINATOR_DEBUG=1` to log hook errors and every state change to `tierminator-debug.log` in the
  temp directory.
- Everything the plugin does is described in
  [the reference](https://github.com/timschreiber/claude-plugins/blob/main/docs/tierminator/tierminator-reference.md),
  with the measurements behind it.
