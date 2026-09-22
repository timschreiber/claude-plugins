# Plan format

A plan is a directory. It is the contract between:

- **plan** (skill), which creates it,
- **run** (skill), which executes it and records progress in it,
- **planner** (agent), which details outlined milestones during a run,
- **workers** and **reviewer** (agents), which read their task from it.

All state lives in these files, never in anyone's context. That is what lets a run survive context compaction, interruption, and multi-day execution: anyone can pick up from the files alone.

## Directory

```text
plans/<plan-slug>/
├── plan.md                # index: header, settings, milestones, decisions, open questions
├── sources/               # verbatim copies of any input that isn't already a file in the repo
│   └── prompt.md
├── notes/                 # investigate-task findings (<task-id>.md) and scout surveys (<milestone-id>-survey*.md)
├── M01-<slug>.md          # one file per milestone
└── M02-<slug>.md
```

Default location is `plans/<plan-slug>/` at the repository root.

## plan.md

```markdown
# Plan: <title>

- Goal: <one paragraph: what is true when the whole plan is done>
- Sources: `docs/spec.md` (§3–5), `plans/<plan-slug>/sources/prompt.md`
- Branch: <branch the plan runs on>
- Final verify: `<command>` | none
- Detailing: upfront | rolling
- Gates: none | detail | milestone | detail+milestone
- Parallel: auto | off
- Max parallel: 3
- Worktree setup: `<command>` | none
- Status: planned

## Milestones

| ID | Title | Status | File |
|---|---|---|---|
| M01 | <title> | ready | M01-<slug>.md |
| M02 | <title> | outline | M02-<slug>.md |

## Decisions

- D01: <decision> (source: <spec § / sources/prompt.md / user / GAP in M01-T04>)

## Open questions

- (M03) <question to resolve before or while M03 is detailed>
```

### Header fields

| Field | Rule |
|---|---|
| Sources | Every input the plan is built from. Inline input from chat is saved verbatim under `sources/` and listed here. |
| Final verify | Command run after the last milestone, or `none`. |
| Detailing | `upfront`: every milestone has tasks before the run starts. `rolling`: only the first milestone is detailed; the planner agent details each later milestone when the run reaches it, so its tasks reflect the code and findings that exist by then. |
| Gates | Where run stops for human review. `detail`: after the planner details a milestone. `milestone`: after each milestone completes. `none`: runs straight through. |
| Parallel | `auto` (default): run executes a wave's tasks at the same time, each in its own git worktree, whenever the wave has more than one task. `off`: always one task at a time. |
| Max parallel | Most tasks run at once. Default 3. Each concurrent task runs its own builds and tests, so size this to the machine. |
| Worktree setup | Command that makes a fresh worktree able to build and verify (for example `npm ci`, or copying an untracked `.env` from the main checkout), run from the worktree root before its worker starts, with the main checkout's absolute path in the environment variable `ORCHESTRATINATOR_MAIN`. `none` if a plain checkout builds as-is. It may only create files git ignores, or they'd fail the scope check. |
| Status | `planned`, `in-progress`, `complete`, or `blocked`. |

### Survey

Only meaningful while a milestone is an `outline`. Before the planner details it, run sends this scout to survey the code the milestone will touch, writing `notes/<milestone-id>-survey.md`, so the planner works from exact facts instead of reading the codebase on Opus. `scout-heavy` is for milestones whose code needs its logic traced, not just read.

### Milestone status

`outline` (goal and scope only, no tasks yet), `ready` (detailed, not started), `in-progress`, `done`, `blocked`. The table in plan.md and the Status line in the milestone file must always agree; run updates both.

### Decisions and open questions

Decisions are the only place a design decision may come from besides the sources themselves. Workers and the planner read them. A decision made once, including a user's answer to a GAP, applies to every later task.

Open questions are tagged with the milestone or task they block. `rolling` plans may carry open questions for outlined milestones; `upfront` plans may not have any.

## Milestone file

```markdown
# M02: <title>

- Status: outline
- Goal: <what this milestone delivers, observably>
- Depends on: M01
- Milestone verify: `<command>` | none
- Survey: scout | scout-heavy

## Context

<Constraints every task in this milestone must respect: packages, naming, patterns to copy
(by file path), things not to touch, and the source sections that govern this milestone.
Every worker reads this section before its task. Keep it short.>

Waves: <count> (widths <w1>, <w2>, ...)

## Outline

<Only while Status is outline: bullet list of intended scope, for the planner.
Removed when the milestone is detailed.>

## Tasks

### M02-T01: <imperative title>

- Kind: change
- Tier: worker
- Status: todo
- Wave: 1
- Depends on: none
- Files: `path/to/Thing.java`, `path/to/ThingTest.java`
- Verify: `<targeted, quiet command>`
- Commit: `<type>(<scope>): <message>`

**Objective**

<One sentence: what exists or is true when this task is done.>

**Read first**

- `docs/spec.md` §4.2 (the requirement this task implements)
- `path/to/ExistingPattern.java` (pattern to copy)

**Steps**

1. <One concrete action: exact names, signatures, types, values, behavior, error cases.>
2. <...>

**Done when**

- <Observable criterion.>
```

### Task fields

| Field | Rule |
|---|---|
| ID | `M<nn>-T<nn>`, unique across the plan, sequential within the milestone. |
| Kind | `change` (modifies the codebase or docs) or `investigate` (reads and reports; writes only its note, `plans/<plan-slug>/notes/<task-id>.md`). |
| Tier | `worker-light`, `worker`, `worker-heavy`, or `specialist`. |
| Why this tier | Required line for `worker-heavy` and `specialist` only. One sentence. |
| Status | `todo`, `done`, or `blocked`. Only run changes it after planning. |
| Wave | Positive integer. See [Sequence and parallelism](#sequence-and-parallelism). |
| Depends on | `none`, or earlier task IDs (any milestone). Never a later task. |
| Files | Every path the task may create or modify, including tests and, for investigate tasks, its note. Nothing else may change. |
| Verify | A command, `review`, or both (`<command>` + review). A command must be runnable from the repo root, targeted, quiet, and must fail when the task isn't done. `review` sends the diff to the reviewer agent to check against Objective, Steps, and Done when. Use `review` alone only when no command can check the result (docs, investigate tasks, config with no test). |
| Commit | Conventional-commit message, used verbatim. run adds the trailer `Orchestratinator-Task: <task ID>` to the commit, so progress can be recovered from git history. |
| Objective | One sentence. |
| Read first | Everything the worker must read beyond CLAUDE.md / AGENTS.md, plan.md's Decisions, and the milestone's Context: the exact source sections the task implements, patterns to copy, and notes it depends on. Name sections, not whole documents. At most about five entries. |
| Steps | Numbered. Each step is one concrete action. At most about seven steps. |
| Done when | Observable criteria that Verify or the reviewer can check. |

run appends these lines under a task when they apply:

- `- Escalated: <from> → <to> (<one-line reason>)`
- `- Blocked: GAP | STUCK | SCOPE | VERIFY | REVIEW — <one line>`

## Tasks are prompts

Each task block is the prompt a worker executes. The planner does the thinking so the worker doesn't have to:

- **Translate, don't forward.** The plan turns source requirements into concrete steps. A worker should never have to interpret prose from the sources to work out what to do; Read first gives it the governing section for reference, and the Steps say what to do about it.
- **Every value is written down.** Names, signatures, types, constants, messages, file paths, test names, and test cases appear in the Steps, not "per the spec".
- **One action per step.** "Add method `x(int): String` to `Foo` that returns ..." is a step. "Implement the parser" is a task that hasn't been planned yet.
- **Self-contained.** A worker that has read only CLAUDE.md / AGENTS.md, plan.md's Decisions, the milestone's Context, and the task (with its Read first list) can finish it without asking anything and without making a choice.

## Sequence and parallelism

Every task has a **Wave**. Waves define both the order of execution and which tasks could safely run at the same time.

- Wave 1 holds tasks with no unfinished dependencies. Each later wave holds tasks whose dependencies are all in earlier waves (or earlier milestones).
- **Tasks in the same wave must not interfere with one another.** Two tasks interfere if any of these is true:
  1. Their Files overlap.
  2. One task's Files include anything in the other's Read first.
  3. Both modify a shared registration point, even in different ways: a dependency-injection or service registry, a module or project list, a routing table, a barrel/index file, a package manifest or lockfile, a migration sequence, a generated-code input.
  4. Both depend on the same external state they could change: a database, a port, a service, a shared temp or output path outside the repo.
  5. One task's Verify exercises code the other task changes.
- When in doubt, put the tasks in different waves. With `Parallel: auto`, same-wave tasks really do run at the same time: a wrongly parallel pair causes merge conflicts or broken builds, while a wrongly serial pair only costs time.
- Within a wave, task ID order is the execution order for serial runs, and the order in which parallel results are merged.
- Keep waves as wide as the rules allow. A milestone whose waves are all one task wide is often a sign of tasks that are too big or registration points that should be their own task.

The milestone's Context records its wave shape on one line, for example `Waves: 5 (widths 1, 4, 3, 3, 1)`.

## Tier rubric

| Tier | Model / effort | Use for |
|---|---|---|
| `worker-light` | Haiku | No logic: renames, constants, config edits, doc comments, boilerplate copied from a named file. |
| `worker` | Sonnet / medium | **The default.** Fully specified work: names, signatures, behavior, and test cases all given in Steps. Most investigate tasks. |
| `worker-heavy` | Sonnet / high | Fully specified but intricate: numeric or geometric code, parsers, state machines, concurrency, many edge cases. |
| `specialist` | Opus / high | No design decisions, but the implementation needs judgment the plan can't pin down: unfamiliar library internals, debugging a known failure, poorly documented APIs. |

If more than about one task in ten is `specialist`, the milestone is under-specified: split or specify those tasks instead.

## Sizing rules

A task is correctly sized when:

1. It is one commit.
2. It touches at most about three production files, plus their tests.
3. It has at most about seven Steps and five Read first entries.
4. It needs **no new reasoning or design decisions**. Steps state names, signatures, types, exact behavior, and error handling. Tests are named, with their cases listed.
5. Steps contain none of: "decide", "choose", "figure out", "as appropriate", "if needed", "etc.", "and so on", "similar", "per the spec".
6. Verify fails when the task is incomplete.

A milestone is correctly sized when it is one coherent, verifiable deliverable of at most about 25 tasks. Split larger ones.

## Validation checklist

run refuses to execute a milestone, and plan and planner must not finish one, unless all of these hold:

- [ ] plan.md has every header field with a valid value, including Parallel, Max parallel, and Worktree setup.
- [ ] Every milestone in the table has a file, and table status matches the file's Status.
- [ ] Every source listed exists.
- [ ] `upfront` plans have no `outline` milestones and no open questions.
- [ ] The milestone has Goal, Depends on, Milestone verify, and Context. A `ready` milestone's Context has a Waves line; an `outline` milestone has a Survey of `scout` or `scout-heavy`.
- [ ] A `ready` milestone has Tasks and no Outline; an `outline` milestone has an Outline and no Tasks.
- [ ] Every task has Kind, Tier, Status, Wave, Depends on, Files, Verify, Commit, Objective, Read first, Steps, and Done when, with valid values.
- [ ] Every `worker-heavy` and `specialist` task has a Why this tier line.
- [ ] Task IDs are unique and sequential, and Depends on never references a later task.
- [ ] Every dependency of a task is in an earlier wave or an earlier milestone.
- [ ] No two tasks in the same wave interfere, by the five rules above.
- [ ] Every investigate task's Files is exactly its own note, `plans/<plan-slug>/notes/<task-id>.md`.
