# planandtier: tiered plans

This plan will be executed by the planandtier plugin, not by you. After the user approves it, each task
runs in its own subagent, one at a time, in order, on the model and effort you choose for it, and commits
its own work. Plan as usual (explore, research, design), then end the plan with a task block.

## What the plan must contain

1. A prose summary the user can read and judge: what changes, why, and how it is verified.
2. A `## Tasks` section at the end holding **exactly one** fenced block whose info string is
   `json tiered-tasks`.

````markdown
## Tasks

```json tiered-tasks
{
  "tasks": [
    {
      "id": "T01",
      "title": "Add the IClock abstraction",
      "model": "sonnet",
      "effort": "medium",
      "prompt": "Read docs/spec.md section 3. Create src/IClock.cs with ... Verify: dotnet build succeeds and dotnet test --filter ClockTests passes."
    }
  ]
}
```
````

`ExitPlanMode` is denied until the block validates, and the denial tells you what to fix. The block
is what gets executed: the prose is for the user, so keep the two consistent.

Once the block validates, the plugin moves it to a tasks file next to the plan (`<plan>.tasks.json`)
and puts a table of the tasks in its place, between `<!-- planandtier:tasks -->` lines. The user
approves the plan with that table and can open the tasks file to read the prompts. If the user asks for
changes to the tasks, write a complete new `json tiered-tasks` block under `## Tasks`: the plugin
replaces the old table when you call `ExitPlanMode` again. Never edit the table or the tasks file by hand.

| Field | Rule |
|---|---|
| `id` | `T01`, `T02`, ... in execution order, no gaps |
| `title` | One line, at most 100 characters. Used as the task's commit message |
| `model` | `sonnet` or `opus` |
| `effort` | `low`, `medium` or `high` for `sonnet`; `low`, `medium`, `high` or `xhigh` for `opus` |
| `prompt` | Self-contained, and contains a `Verify:` step (see below) |

No other keys are allowed.

## How the plan runs

- **It needs a Git repository with a clean working tree.** `ExitPlanMode` is denied while there are
  uncommitted changes. That is for the user to fix: tell them, and don't call `ExitPlanMode` again until
  they have committed or stashed.
- **Each task commits its own work**, as one commit, only after its `Verify:` step passes. Don't put
  commit steps in prompts.
- **A failed task is retried twice, each time one tier up**, from a working tree reset to the commit
  before it. The tiers, weakest first: `sonnet` at `low`, `medium`, `high`, then `opus` at `low`,
  `medium`, `high`, `xhigh`. After the second retry fails, the run stops there.

## Choosing model and effort

Favor the smallest model and effort that will get the job done.

1. **Pick the model by the kind of work.** `sonnet` for fully specified work, `opus` for work that needs
   judgment the prompt cannot pin down or is too intricate and wide for `sonnet`.
2. **Start at `medium` effort: that is the baseline.** Lower it when the task is easier or simpler than
   the baseline for its model, and raise it when the task is harder or more complex.
3. **Past `sonnet` / `high`, go to `opus` / `low`**, not to a higher Sonnet effort: `sonnet` stops at
   `high`.

A failed task is reset and retried one tier up, so a tier that is slightly too small usually costs less
than one that is too big.

| Tier | Use for |
|---|---|
| `sonnet` / `low` | Easier than the baseline: fully given work, such as literal find-and-replace pairs, a new file whose exact content is in the prompt, or a rename whose complete set of references the planner has checked. Full rules below. |
| `sonnet` / `medium` | **The baseline.** Fully specified work: names, signatures, behavior and test cases are all in the prompt. |
| `sonnet` / `high` | Harder than the baseline: fully specified but intricate work, such as parsers, state machines, numeric code, many edge cases. |
| `opus` / `low` | Fully specified, intricate and wide (interacting edge cases across several files, where `sonnet` / `high` is likely to miss one), or small bounded judgment: a well-defined change in unfamiliar code that the prompt cannot fully describe. |
| `opus` / `medium` | **The baseline for judgment work.** Judgment the plan cannot pin down: unfamiliar library internals, poorly documented APIs, debugging a known failure. |
| `opus` / `high` | The hardest bounded implementation: a failure of unknown cause across components, or subtle cross-cutting changes. |
| `opus` / `xhigh` | Very rare, for extreme reasoning only: concurrency correctness, algorithmic subtleties, security-critical logic. Say in the plan's prose why the task needs it. |

If more than about one task in ten is `opus` / `high` or above, the plan is under-specified: settle the
design decisions during planning and put the answers in the prompts, so workers execute rather than decide.

### `sonnet` / `low`: fully given work

Work whose result is fully written out in the prompt. There are three kinds.

**Find-and-replace.** Extremely mechanical work, expressed as one or more literal find-and-replace pairs.
For each edit, the task's prompt states the exact file, the exact existing text to match (`old_str`), and
the exact text to replace it with (`new_str`). A single task may contain multiple such pairs across one or
a few files — do not fragment mechanical work into one task per pair. Each `old_str` must include enough
surrounding context to match exactly one location in its file; the planner must verify this (e.g. by
grep) before finalizing the plan, not leave it for the worker to discover.

**A new file**, with its complete, exact content in the prompt.

**A rename.** A rename qualifies for this tier only when the planner has enumerated the complete, closed
set of reference sites — the file's own path plus every import, config entry, build script line, test
fixture, etc. that names it — and has confirmed (e.g. via a verified grep) that the set is exhaustive. The
edits may be given as replacement pairs or described. If the planner cannot be confident the set of
references is closed — dynamically constructed paths, reflection, generated code, string
interpolation, or a codebase where a plain search might miss variants — the rename is not mechanical:
it moves to `sonnet` / `medium` or higher. Either way, its `Verify:` step must do more than confirm a
build passes — it needs a check that would catch a missed reference (e.g. a repo-wide search for the old
name returning nothing outside comments/history).

Anything that needs the worker to work out code or content belongs to `sonnet` / `medium` or above.

## Writing task prompts

A worker sees only its own prompt and the repository, never this plan or this conversation. It
gets the project's CLAUDE.md automatically. So each prompt must:

- Name the files and spec sections to read first, including AGENTS.md or a spec if the project has one.
- State exact names, signatures, behavior and error handling, and name the tests with their cases. Leave
  no design decisions to the worker.
- For a find-and-replace task, make the prompt a list of `(file, old_str, new_str)` triples, not prose
  describing the changes, followed by the `Verify:` step.
- Cover one coherent piece of work, roughly one commit, touching a few files.
- End with a `Verify:` step: a command or check that fails if the task is incomplete, such as a build,
  a named test run or a grep for the expected change. The task is committed only when it passes.

A task can only depend on earlier tasks, so order them accordingly.

## Opting out

If the user asked for a normal plan, or the work is not worth splitting into tasks, put this exact line
on its own line in the plan, outside any code fence, and add no task block:

```
Tiered execution: off
```

The plan is then approved and executed the ordinary way, with no Git requirement. Use this only when the
user asks for it or the task is trivial.
