# Orchestratinator

Big asks. Small tasks. Right-sized models.

Orchestratinator turns a spec, a phased prompt set, or a long free-form prompt into a plan of small, mechanical tasks, each tagged with the cheapest model and effort that can do it. Then it runs them through a ladder of worker subagents, from Haiku up to Opus, running independent tasks in parallel git worktrees, verifying every task itself, and committing each one on its own. The Opus orchestrator never writes a line of code, and never takes a worker's word for anything.

## Install

```bash
claude plugin marketplace add timschreiber/claude-plugins
claude plugin install orchestratinator@timschreiber
```

Nothing to configure. The three skills appear as `/orchestratinator:plan`, `/orchestratinator:run`, and `/orchestratinator:status`, and run only when you invoke them.

## How to use

```text
/orchestratinator:plan docs/spec.md phases 3-5
/orchestratinator:run plans/<slug>
/orchestratinator:status plans/<slug>
```

1. **Plan.** Point `plan` at any mix of sources: spec files, sections, a prompt file, or a long prompt you've written in the conversation. It saves inline input verbatim under `plans/<slug>/sources/` and maps the source's own structure (phases, steps) onto milestones without reshuffling it. Before writing anything, it audits the sources for missing information, ambiguity, and contradictions, and asks you about every one it can't settle from the sources or the code.

   **Size check.** If the whole job comes out at five tasks or fewer (`--direct-max N` changes the threshold), `plan` doesn't write a plan at all. It still asks its questions, then shows you the tasks it would do and asks for approval. Once you approve, it does the work itself, verifies each task, and commits each one if your tree was clean. Reply "plan it", or pass `--always-plan`, to get a plan regardless.
2. **Review and commit the plan.** Edit tiers, steps, or gates as you like. `run` requires a clean working tree.
3. **Run.** Before executing anything, `run` shows what this run will do (next milestone, task counts by tier, waves, parallel or serial, and where it will stop) and asks for approval. Nothing in the repository changes until you say yes. Rerun the same command to continue after any pause or fix. Progress lives in the plan files, so a run survives context compaction, interruptions, and days between sessions.
4. **Check in** anytime with `status`. It's cheap (Haiku) and read-only.

For unattended or non-interactive runs, `--yes` gives approval in advance.

### Options

| Skill | Option | Effect |
|---|---|---|
| `plan` | `--into plans/<slug>` | Where to write the plan directory. |
| `plan` | `--direct-max N` | Largest job, in tasks, done directly instead of planned. Default 5. |
| `plan` | `--always-plan` | Always write a plan, however small the job. |
| `run` | `--milestone M03` | Run one milestone, then pause. |
| `run` | `--max-tasks 20` | Pause cleanly after 20 committed tasks. |
| `run` | `--serial` | Turn parallelism off for this run. |
| `run` | `--max-parallel 4` | Override the plan's Max parallel for this run. |
| both | `--yes` | Approval given in advance. |

### Resuming after a stop

`status` tells you what's blocked and what to do next. In general:

1. Resolve it: answer the question under `plan.md` Decisions, fix the environment, or split the task.
2. Commit or discard any leftover working-tree changes, and remove any worktrees the run left for inspection (`git worktree remove <path>`, then delete its `orchestratinator/...` branch). `status` lists them.
3. Set the blocked task or milestone back to `todo` / `ready` (or `outline` for a planner GAP), set the plan's Status back to `in-progress`, and commit.
4. Rerun `/orchestratinator:run plans/<slug>`.

## What it does

### The cast

| Who | Model / effort | Job |
|---|---|---|
| `plan` (skill) | Opus / session effort | Builds the plan directory, or does a small job itself. |
| `run` (skill) | Opus / session effort | Orchestrates: dispatch, verify, integrate, commit, record. Never writes code. |
| `status` (skill) | Haiku | Read-only progress summary. |
| `planner` | Opus / high | Details an outlined milestone when the run reaches it, working from a scout's survey. |
| Explore (built in) | Haiku | Used eagerly by `plan` for every discovery question about the codebase. |
| `scout` | Sonnet / medium | Read-only: exact signatures, behavior, and test layout with `path:line`; milestone surveys; library docs. |
| `scout-heavy` | Sonnet / high | Read-only: traces logic across many files (control flow, state, concurrency). |
| `reviewer` | Sonnet / high | Read-only check for tasks no command can verify. |
| `worker-light` | Haiku | No-logic edits. |
| `worker` | Sonnet / medium | The default: fully specified work. |
| `worker-heavy` | Sonnet / high | Fully specified but intricate work. |
| `specialist` | Opus / high | Bounded judgment calls. Rare by design. |

### Opus reasons, cheaper models read

Planning needs to know the codebase, but reading code on Opus is the most expensive way to learn it. So `plan` reads the sources you gave it (the spec or prompt) itself, in full, and delegates everything else: Explore answers discovery questions, several at a time, and scouts extract exact signatures, behavior, and test commands with `path:line` references. Before the planner details an outlined milestone, `run` has a scout survey that milestone's code into `notes/`, and the planner works from the survey. If it needs more, it asks for one more scout round rather than combing the codebase itself. Scouts report facts, never designs: every decision stays with Opus.

### What a plan contains

- **Questions answered first.** `plan` groups its questions as insufficient information, ambiguity, or contradiction, quotes the passages involved, lists the options, and recommends one when it can. It never resolves a contradiction or ambiguity on its own, and it writes nothing until you answer. Your answers become recorded Decisions.
- **Tasks that are prompts.** Each task is the complete prompt for one worker: an Objective, a short Read first list (exact spec sections and pattern files, not whole documents), at most about seven one-action Steps with every name and value written out, and Done-when criteria. The planning model does the reasoning so the worker doesn't have to.
- **Interfaces.** Every `change` task lists what it consumes and what it produces: exact signatures, class names, constants with their values, file shapes, CLI flags, config keys. Each Consumes names its source, a task ID or an existing `path:line`, and must match that task's Produces character for character, so workers that never see each other, even running in parallel, agree on every name and type that crosses a task boundary. A worker implements its Produces exactly and stops with a question if the code disagrees with a Consumes, and the reviewer checks the code against Produces.
- **Coverage.** `plan.md` maps every section of every source to the milestones that implement it, or to `out of scope` with the Decision that says so, and every detailed milestone maps each requirement it implements (any must, shall, should, numbered acceptance criterion, or explicit behavior) to its task IDs. `plan` adds a task or milestone for anything unmapped and asks you about anything that looks deliberately out of scope, and the planner stops with a question for a requirement it can't map, so no requirement falls between tasks unnoticed.
- **Sequence and parallelism.** Every task has dependencies and a Wave. Tasks in the same wave have no dependencies on each other and don't interfere: no shared files, no shared registration points (DI registries, manifests, migration sequences), no shared external state, and neither one's verification exercises the other's changes. Each milestone records its wave shape, such as `Waves: 5 (widths 1, 4, 3, 3, 1)`. Runs use the waves to decide what executes at the same time.

### Plans that scale

A plan is a directory: an index (`plan.md`) plus one file per milestone, so the orchestrator only ever loads the milestone it's working on.

- **Upfront detailing** specifies every task before the run starts. `plan` chooses it for jobs of roughly 40 tasks or fewer where nothing depends on what execution discovers.
- **Rolling detailing** specifies only the first milestone and outlines the rest. When the run reaches an outlined milestone, the `planner` agent details it against the code and findings that exist by then. For long, complex jobs, this avoids planning milestone 9 from guesses made before milestone 1 was written.
- **Investigate tasks** establish facts (how an existing system behaves, what a library supports) and write findings to `notes/`. Later tasks and milestones plan from the notes instead of assumptions.
- **Decisions** are recorded once in `plan.md` and apply to every later task, including your answers to questions raised mid-run.
- **Gates** choose where the run pauses for you: after the planner details a milestone (`detail`, the default for rolling plans), after each milestone completes (`milestone`), both, or `none`.

The full plan format, including the tier rubric and sizing rules, is in [`reference/plan-format.md`](reference/plan-format.md).

### How a run behaves

- **Parallel by default, wave by wave.** When a wave has two or more tasks, each runs in its own git worktree created from the same commit, up to Max parallel at once (default 3). A wave with one task, a plan with `Parallel: off`, or `--serial` runs in the main checkout, one task at a time.
- **Worktrees you can trust.** Worktrees live under `.git/orchestratinator/`, branch from the plan branch's current commit (not your default branch), and get the plan's Worktree setup command (dependency installs, untracked config) before their worker starts. If a worker writes outside its worktree, the run stops.
- **Integrated in order, then checked together.** Verified tasks are cherry-picked onto the plan branch in task order, then every integrated task's Verify runs again on the combined result, because two tasks can each pass alone and still break each other. A merge conflict or a combined failure stops the run and reports the wave as a planning error.
- **Recoverable.** Every task commit carries an `Orchestratinator-Task:` trailer, so an interrupted run recovers its progress from git history on the next start.
- **Verify, don't trust.** The orchestrator runs each task's Verify command itself, or sends the diff to the read-only reviewer when no command can check it. A worker saying "tests pass" is not evidence.
- **Scope check.** A changed file not listed in the task's Files blocks the task instead of being committed.
- **Commit per task.** The code and the plan's status update land in one commit.
- **One retry, one tier up.** A failed verify, failed review, or stuck worker gets a clean start and one retry at the next tier. A second failure stops the run and leaves that task's changes (in the tree or its worktree) for you to inspect. In a parallel wave, the other tasks still finish and integrate first.
- **GAPs stop, they don't escalate.** When a worker or the planner hits a decision the plan left open, the run stops and quotes the question. A bigger model would just make the decision, which is exactly what the plan exists to prevent.
- **Project instructions don't govern git.** Whatever CLAUDE.md or AGENTS.md say about committing or pushing, workers never commit, the orchestrator never pushes, and a worker's stray commit is caught and redone properly. Workers read project instructions as files (`omitClaudeMd: true`) instead of receiving them as system instructions.

## What it does not do

- **It never runs on its own.** All three skills are invoke-only: Claude won't start a plan or a run because a conversation looks like it needs one, and `plan` and `run` ask for approval before changing anything unless you pass `--yes`.
- **It never pushes, and never rewrites history.** Work lands as commits on the plan's branch. What happens to that branch afterward is up to you.
- **It doesn't make design decisions for you.** Contradictions and ambiguities become questions, never guesses. Mid-run, a decision the plan left open stops the run rather than being escalated to a bigger model.
- **The orchestrator never fixes code itself.** A failing task is retried once at the next tier, then stopped. It doesn't patch the result by hand.
- **It doesn't edit the plan mid-run.** Plan changes happen between runs, and the plan must be committed before `run` starts.
- **It doesn't clean up after a stop.** Worktrees and uncommitted changes from a blocked task are left in place for you to inspect, and a failed combined verify is not rolled back.
- **It isn't worth it for small jobs.** Planning, fresh worker contexts, and independent verification are fixed costs that only pay off at scale. For a single edit, a quick fix, or anything that comes to a handful of tasks, ask Claude directly. If you hand `plan` a job like that anyway, it notices and offers to do it directly (see the size check above).

## Known limitations

- **Requires a git repository, and `run` requires a clean working tree.** Commit or discard changes, including the plan itself, before running.
- **Worktrees contain only committed files.** If a fresh checkout can't build as-is (dependency installs, generated files, untracked config such as `.env`), the plan's Worktree setup command has to handle it, or parallel tasks fail with SETUP. `plan` asks about this when it can't work it out.
- **Verification is only as good as each task's Verify.** Tasks checked by a command are checked by that command alone. Tasks that no command can check go to the read-only `reviewer`, which is a model's judgment, not a test.
- **Parallel tasks compete for your machine.** Each concurrent task runs its own builds and tests. Start at the default Max parallel of 3 and adjust.
- **On Windows, worktree removal can fail** when a process holds a file lock. The run leaves that worktree, says so, and continues. Remove it yourself later.
- **Don't set `CLAUDE_CODE_EFFORT_LEVEL`** while using this plugin. It overrides the effort in every agent's frontmatter, flattening all the tiers to one level. Use `/effort` or `--effort` to choose the effort for `plan` and `run` instead.
- **Model aliases float.** The `opus`, `sonnet`, and `haiku` aliases resolve to the newest models for your provider. Opus 5.5 needs Claude Code v2.1.280 or later.

## Configuration notes

- **`plan` and `run` use your session's effort level**, like OpusPlan: set it with `/effort` or `--effort` before you start. Opus 5.5 defaults to `medium`, so set `/effort high` before planning unless you want a lighter plan. The agents keep their own effort, so the tiers stay distinct whatever the session uses.
- **Retune the ladder** by editing `model` and `effort` in `agents/*.md`. Haiku doesn't take an effort setting, so `worker-light` has none.
- **Keep build output quiet.** Every task runs its Verify command, so a long plan runs the build many times. Write quiet flags into Verify commands, and pair this with an output-quieting plugin such as [`denoizinator-net`](https://github.com/timschreiber/claude-plugins/tree/main/plugins/denoizinator-net).

Found something not listed here? Please
[open an issue](https://github.com/timschreiber/claude-plugins/issues).
