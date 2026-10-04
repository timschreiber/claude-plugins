# tierminator: tiered plans

After approval, tierminator runs each task in its own subagent, in order, at the model and effort you
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
- A worker that reaches its turn limit is resumed where it stopped, at most twice. If it still has not
  reported, the run stops at that task, leaving its work in place. It is never retried a tier up: a higher
  tier uses more turns, not fewer.

## Choosing a tier

Use the smallest tier that will do the job: a retry costs less than a tier that is too big.

1. Pick the model by the kind of work. `sonnet` does any work the plan can fully specify, however large or
   important. `opus` is only for work that needs judgment you cannot settle while planning; if you can
   write the change out, it is a `sonnet` task.
2. Pick the effort by complexity. Start at `medium`. Use `sonnet` / `low` only for work written out in
   full (below) and `sonnet` / `high` for intricate work. Raise `opus` to `high` only for the hardest
   judgment.
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

## Sizing tasks

Small tasks finish; large ones run out of turns. Split the work until each task:

- has one purpose, which its title states without "and";
- for `sonnet`, changes at most about 3 files, listed on its `Files to change:` line; for `opus`, whose
  right files are often unknown while planning, has one goal and a few acceptance criteria instead;
- has one `Verify:` step that is fast and targeted, such as a named test file or a grep, rather than the
  whole suite unless the change can break anything;
- needs only a few rounds of reading, editing and checking.

Split along seams: a new type or module with its tests, then wiring it in, then docs and config. Keep a
refactor (a rename, a move, an extraction) in its own task, apart from behavior changes. If a higher tier
would do part of a task differently from the rest, it is two tasks. When unsure, split: an extra task
costs a commit; an oversized one can stop the run.

`ExitPlanMode` flags a `sonnet` task with no `Files to change:` line or more than 4 files to change, and any task with a prompt over
4,000 characters (`sonnet`) or 5,000 (`opus`), or "and", "then" or ";" in its title. These are guidelines:
split a flagged task, or keep it and add a line `Keep T03: <why it stays one task>` to the plan, outside
the task block.

## Task prompts

A worker sees only its prompt, the repository and the project's CLAUDE.md, never this plan or this
conversation. Every prompt:

- names the files and spec sections to read first, including AGENTS.md or a spec if there is one;
- has a `Files to change:` line: for `sonnet`, every file the task creates, edits or deletes; for `opus`,
  the files you expect it to change;
- covers one coherent change, about one commit;
- ends with `Verify:`: a command or check that fails if the task is incomplete, such as a build, a named
  test run or a grep. The task commits only when it passes.

A `sonnet` prompt is a contract: exact names, signatures, behavior, error handling and test cases, leaving
no design decisions. For find-and-replace it is a list of `(file, old_str, new_str)` triples. Use numbered
steps only where order or completeness matters.

An `opus` prompt states the goal, the constraints, what to read and the acceptance criteria, then
`Verify:`. Its `Files to change:` line is a starting point, not a limit: the worker changes any other file
the goal needs and names it in its report. Don't script it edit by edit: the worker makes routine judgment calls itself. If you find
yourself writing every edit out, the task belongs on `sonnet`.

A task can depend only on earlier tasks.

## Opting out

If the user asked for a normal plan, or the work is trivial, put this line on its own line, outside any
code fence, and add no task block:

```
Tiered execution: off
```

The plan then runs the ordinary way, with no Git requirement.
