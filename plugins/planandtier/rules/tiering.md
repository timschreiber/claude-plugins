# planandtier: tiered plans

This plan will be executed by the planandtier plugin, not by you. After the user approves it,
a workflow runs each task as its own subagent, one at a time, in order, on the model and effort
you choose for it. Plan as usual (explore, research, design), then end the plan with a task block.

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

| Field | Rule |
|---|---|
| `id` | `T01`, `T02`, ... in execution order, no gaps |
| `title` | One line, at most 100 characters. Shown as the task's name while it runs |
| `model` | `sonnet` or `opus` |
| `effort` | `low`, `medium`, `high` or `xhigh` (both models take all four) |
| `prompt` | Self-contained, and contains a `Verify:` step (see below) |

No other keys are allowed. Tasks run one at a time, and the run stops at the first task that fails.

## Choosing model and effort

Pick the cheapest pair you expect to succeed on the first try. A task that fails halts the run, and
a cheaper pair that needs retries costs more than the right one.

| Pair | Use for |
|---|---|
| `sonnet` / `low` | Extremely mechanical work, expressed as literal find-and-replace pairs against existing files. Transcription plus a check. Full rules in the section below. |
| `sonnet` / `medium` | **The default.** Fully specified work: names, signatures, behavior and test cases are all in the prompt. |
| `sonnet` / `high` | Fully specified but intricate: parsers, state machines, numeric code, many edge cases. |
| `sonnet` / `xhigh` | Fully specified, intricate and wide: interacting edge cases across several files, where `high` is likely to miss one. |
| `opus` / `low` | Small bounded judgment: a well-defined change in unfamiliar code that the prompt cannot fully describe. |
| `opus` / `medium` | Judgment the plan cannot pin down: unfamiliar library internals, poorly documented APIs, debugging a known failure. |
| `opus` / `high` | The hardest bounded implementation: a failure of unknown cause across components, or subtle cross-cutting changes. |
| `opus` / `xhigh` | Very rare, for extreme reasoning only: concurrency correctness, algorithmic subtleties, security-critical logic. Say in the plan's prose why the task needs it. |

If more than about one task in ten is `opus` / `high` or above, the plan is under-specified: settle the
design decisions during planning and put the answers in the prompts, so workers execute rather than decide.

### `sonnet` / `low`: find-and-replace only

Extremely mechanical work, expressed as one or more literal find-and-replace pairs. For each edit, the
task's prompt states the exact file, the exact existing text to match (`old_str`), and the exact text
to replace it with (`new_str`). A single task may contain multiple such pairs across one or a few
files — do not fragment mechanical work into one task per pair. Each `old_str` must include enough
surrounding context to match exactly one location in its file; the planner must verify this (e.g. by
grep) before finalizing the plan, not leave it for the worker to discover.

This tier no longer covers writing a new file from scratch — even fully-known new-file content isn't a
replacement against existing text, so it belongs to `sonnet` / `medium` or above.

Renames are not a separate case. A rename qualifies for this tier only when the planner has enumerated
the complete, closed set of reference sites — the file's own path plus every import, config entry,
build script line, test fixture, etc. that names it — as its own replacement pair, and has confirmed
(e.g. via a verified grep) that the set is exhaustive. If the planner cannot be confident the set of
references is closed — dynamically constructed paths, reflection, generated code, string
interpolation, or a codebase where a plain search might miss variants — the rename is not mechanical:
it moves to `sonnet` / `medium` or higher, and its `Verify:` step must do more than confirm a build
passes — it needs a check that would catch a missed reference (e.g. a repo-wide search for the old
name returning nothing outside comments/history).

## Writing task prompts

A worker sees only its own prompt and the repository, never this plan or this conversation. It
gets the project's CLAUDE.md automatically. So each prompt must:

- Name the files and spec sections to read first, including AGENTS.md or a spec if the project has one.
- State exact names, signatures, behavior and error handling, and name the tests with their cases. Leave
  no design decisions to the worker.
- For a `sonnet` / `low` task, make the prompt a list of `(file, old_str, new_str)` triples, not prose
  describing the changes, followed by the `Verify:` step.
- Cover one coherent piece of work, roughly one commit, touching a few files.
- End with a `Verify:` step: a command or check that fails if the task is incomplete, such as a build,
  a named test run or a grep for the expected change.

A task can only depend on earlier tasks, so order them accordingly.

## Opting out

If the user asked for a normal plan, or the work is not worth splitting into tasks, put this exact line
on its own line in the plan, outside any code fence, and add no task block:

```
Tiered execution: off
```

The plan is then approved and executed the ordinary way. Use this only when the user asks for it or the
task is trivial.
