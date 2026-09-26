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
| `sonnet` / `low` | Extremely mechanical work: the prompt contains the literal final content (exact lines of code or config, exact file text), renames, one-line edits. Transcription plus a check. |
| `sonnet` / `medium` | **The default.** Fully specified work: names, signatures, behavior and test cases are all in the prompt. |
| `sonnet` / `high` | Fully specified but intricate: parsers, state machines, numeric code, many edge cases. |
| `sonnet` / `xhigh` | Fully specified, intricate and wide: interacting edge cases across several files, where `high` is likely to miss one. |
| `opus` / `low` | Small bounded judgment: a well-defined change in unfamiliar code that the prompt cannot fully describe. |
| `opus` / `medium` | Judgment the plan cannot pin down: unfamiliar library internals, poorly documented APIs, debugging a known failure. |
| `opus` / `high` | The hardest bounded implementation: a failure of unknown cause across components, or subtle cross-cutting changes. |
| `opus` / `xhigh` | Very rare, for extreme reasoning only: concurrency correctness, algorithmic subtleties, security-critical logic. Say in the plan's prose why the task needs it. |

If more than about one task in ten is `opus` / `high` or above, the plan is under-specified: settle the
design decisions during planning and put the answers in the prompts, so workers execute rather than decide.

## Writing task prompts

A worker sees only its own prompt and the repository, never this plan or this conversation. It
gets the project's CLAUDE.md automatically. So each prompt must:

- Name the files and spec sections to read first, including AGENTS.md or a spec if the project has one.
- State exact names, signatures, behavior and error handling, and name the tests with their cases. Leave
  no design decisions to the worker.
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
