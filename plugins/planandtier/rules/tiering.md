# planandtier: tiered plans

After approval, planandtier runs each task in its own subagent, in order, at the model and effort you
choose, and the subagent commits its work. Plan as usual, then end the plan with a task block.

## The plan

1. A prose summary for the user: what changes, why, and how it is verified.
2. A `## Tasks` section at the end, with exactly one fenced block whose info string is
   `json tiered-tasks`:

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

| Field | Rule |
|---|---|
| `id` | `T01`, `T02`, ... in execution order, no gaps |
| `title` | One line, at most 100 characters; the task's commit message |
| `model` | `sonnet` or `opus` |
| `effort` | `low`, `medium` or `high` for `sonnet`; `medium` or `high` for `opus` |
| `prompt` | Self-contained, with a `Verify:` step |

No other keys. The block is what runs, so keep the prose consistent with it.

`ExitPlanMode` is denied until the block is valid, and the denial says what to fix. A valid block is moved
to `<plan>.tasks.json` and replaced by a task table. To change the tasks, write a complete new block under
`## Tasks`; never edit the table or the tasks file.

## How it runs

- It needs a Git repository with a clean working tree. If `ExitPlanMode` is denied for uncommitted
  changes, tell the user, and don't call it again until they commit or stash.
- Each task commits its own work once its `Verify:` step passes. Put no commit steps in prompts.
- A failed task is reset and retried twice, one tier up each time. The tiers, weakest first: `sonnet` at
  `low`, `medium`, `high`, then `opus` at `medium`, `high`. The run stops after the second retry fails,
  or after a failure at `opus` / `high`.

## Choosing a tier

Use the smallest tier that will do the job: a retry costs less than a tier that is too big.

1. Pick the model by the kind of work: `sonnet` for fully specified work, `opus` for judgment the prompt
   cannot pin down.
2. Start at `medium` effort for both. Lower `sonnet` for simpler tasks and raise it for harder ones; raise
   `opus` to `high` only for the hardest.
3. Past `sonnet` / `high`, use `opus` / `medium`.

| Tier | Use for |
|---|---|
| `sonnet` / `low` | Fully given work: find-and-replace pairs, a new file with its exact content, or a checked rename (below). |
| `sonnet` / `medium` | The baseline: fully specified work, with names, signatures, behavior and test cases in the prompt. |
| `sonnet` / `high` | Fully specified but intricate work: parsers, state machines, numeric code, many edge cases, including edge cases that interact across several files. |
| `opus` / `medium` | The baseline for judgment: a change in unfamiliar code that the prompt cannot fully describe, library internals, poorly documented APIs, debugging a known failure. |
| `opus` / `high` | Rare: a failure of unknown cause across components, subtle cross-cutting changes, concurrency, algorithmic subtleties, security-critical logic. |

If more than about one task in ten is `opus` / `high`, the plan is under-specified: settle the design
while planning and put the answers in the prompts.

### `sonnet` / `low`

Only work whose result is fully written out in the prompt:

- **Find-and-replace:** literal pairs, each giving the file, the exact `old_str` and the exact `new_str`.
  One task may hold many pairs across a few files; don't split them into a task per pair. Each `old_str`
  must match exactly one place in its file: check that while planning (for example with grep).
- **A new file**, with its complete, exact content.
- **A rename**, only when you have checked (for example with grep) that the set of references is
  complete: the file's path plus every import, config entry, build line and fixture that names it. With
  dynamic paths, reflection, generated code or string interpolation, a rename is `sonnet` / `medium` or
  higher. Either way, its `Verify:` must catch a missed reference, such as a repo-wide search for the old
  name.

Anything the worker has to work out goes to `sonnet` / `medium` or higher.

## Task prompts

A worker sees only its prompt, the repository and the project's CLAUDE.md, never this plan or this
conversation. Each prompt must:

- Name the files and spec sections to read first, including AGENTS.md or a spec if there is one.
- Give exact names, signatures, behavior, error handling and test cases, leaving no design decisions.
- For find-and-replace, be a list of `(file, old_str, new_str)` triples, then the `Verify:` step.
- Cover one coherent change, about one commit, in a few files.
- End with `Verify:`: a command or check that fails if the task is incomplete, such as a build, a named
  test run or a grep. The task commits only when it passes.

A task can depend only on earlier tasks.

## Opting out

If the user asked for a normal plan, or the work is trivial, put this line on its own line, outside any
code fence, and add no task block:

```
Tiered execution: off
```

The plan then runs the ordinary way, with no Git requirement.
