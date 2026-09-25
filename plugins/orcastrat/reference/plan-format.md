# Plan format

A plan is a directory. It is the contract between:

- **plan** (skill), which creates it,
- **run** (skill), which executes it and records progress in it,
- **planner** (agent), which details outlined milestones during a run,
- **plan-reviewer** (agent), which checks each detailed milestone against it before it runs,
- **milestone-reviewer** (agent), which reviews each finished milestone against it,
- **validator** (agent), which scores each blocking review finding again, without seeing the reviewer's score, before it has any effect,
- **workers** and **reviewer** (agents), which read their task from it, through a brief that run's `task-brief` script copies out of it.

All state lives in these files, never in anyone's context. That is what lets a run survive context compaction, interruption, and multi-day execution: anyone can pick up from the files alone.

## Directory

```text
plans/<plan-slug>/
├── plan.md                # index: header, settings, milestones, coverage, decisions, open questions
├── sources/               # verbatim copies of any input that isn't already a file in the repo
│   └── prompt.md
├── notes/                 # investigate-task findings (<task-id>.md), scout surveys (<milestone-id>-survey*.md), milestone reviews (<milestone-id>-review.md, <milestone-id>-review-2.md), plan reviews (<milestone-id>-plan-review.md), per-task reviews (reviews/<task-id>-attempt<n>.md), worker reports (reports/<task-id>.md), failure logs (<task-id>-failures.md), and the run log (run-log.md)
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
- Max parallel: 2
- Worktree setup: `<command>` | none
- Status: planned

## Milestones

| ID | Title | Status | File |
|---|---|---|---|
| M01 | <title> | ready | M01-<slug>.md |
| M02 | <title> | outline | M02-<slug>.md |

## Coverage

- `docs/spec.md` §3: <requirement, briefly> → M01
- `docs/spec.md` §4: <requirement, briefly> → M01, M02
- `docs/spec.md` §5: <requirement, briefly> → out of scope (D01)

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
| Max parallel | Most tasks run at once. Default 2: two concurrent workers roughly halve the wall-clock time of wide waves while keeping setup, re-verify and machine load modest. Raise it for more speed; each concurrent task runs its own builds and tests, so size this to the machine. |
| Worktree setup | Command that makes a fresh worktree able to build and verify (for example `npm ci`, or copying an untracked `.env` from the main checkout), run from the worktree root before its worker starts, with the main checkout's absolute path in the environment variable `ORCASTRAT_MAIN` (and, for plans written before the rename, also `ORCHESTRATINATOR_MAIN`). `none` if a plain checkout builds as-is. It may only create files git ignores, or they'd fail the scope check. |
| Max run time | Optional: `none` (the default, also when the field is missing) or `<n>m` / `<n>h`. Once the run has lasted that long, `run` pauses with reason `LIMIT` before its next serial task or parallel batch. The flag `--max-run-time` beats it. |
| Max tasks | Optional: `none` (the default, also when the field is missing) or `<n>`. Once `run` has committed that many tasks as `done` in this run, it pauses with reason `LIMIT`. The flag `--max-tasks` beats it. |
| Max milestones | Optional: `none` (the default, also when the field is missing) or `<n>`. Once that many milestones have completed in this run, milestone reviews included, `run` pauses with reason `LIMIT`. The flag `--max-milestones` beats it. `Max milestones: 1` gives a natural point to `/clear` between milestones. |
| Instructions max lines | Optional: absent by default, meaning no threshold, or `<n>`. When it is set, `run`'s instruction-file check adds a size finding once the instruction files it loads hold more than `<n>` lines in total. `plan` never uses it: its checks run before plan.md exists. |
| Status | `planned`, `in-progress`, `complete`, or `blocked`. |

### Survey

Only meaningful while a milestone is an `outline`. Before the planner details it, run sends this scout to survey the code the milestone will touch, writing `notes/<milestone-id>-survey.md`, so the planner works from exact facts instead of reading the codebase on Opus. `scout-heavy` is for milestones whose code needs its logic traced, not just read.

### Milestone status

`outline` (goal and scope only, no tasks yet), `ready` (detailed, not started), `in-progress`, `done`, `blocked`. The table in plan.md and the Status line in the milestone file must always agree; run updates both.

### Decisions and open questions

Decisions are the only place a design decision may come from besides the sources themselves. Workers and the planner read them. A decision made once, including a user's answer to a GAP, applies to every later task.

Open questions are tagged with the milestone or task they block. `rolling` plans may carry open questions for outlined milestones; `upfront` plans may not have any.

#### Assumptions

**Definition.** An assumption is any choice or conclusion the plan depends on that isn't stated in the sources, a Decision, or CLAUDE.md / AGENTS.md, and isn't a fact read directly from code or docs with a citation. Typical forms:

- a default filled in where the sources are silent (a branch, a location, a name, a threshold, a tag);
- a convention extrapolated from existing code to new code;
- an algorithm or format detail the sources don't specify;
- a factual conclusion drawn from evidence rather than stated anywhere, such as "these fixtures were licensed under X on date Y". The evidence is attached, but the conclusion still needs the user's confirmation;
- a structural choice not dictated by the sources, such as splitting one source phase into several milestones.

**Not assumptions:** the plugin's own documented defaults for plan settings (Detailing, Gates, Parallel, Max parallel), and facts a scout or Explore reported with a `path:line` or URL citation.

An assumption is asked as a question, like the other three kinds of problem: insufficient information, ambiguity, and contradiction. In Open questions, it is tagged `[assumption]`.

## Milestone file

```markdown
# M02: <title>

- Status: outline
- Format: 2
- Goal: <what this milestone delivers, observably>
- Depends on: M01
- Milestone verify: `<command>` | none
- Survey: scout | scout-heavy

## Context

<Constraints every task in this milestone must respect: packages, naming, patterns to copy
(by file path), things not to touch, and the source sections that govern this milestone.
Every worker reads this section before its task. Keep it short.>

Waves: <count> (widths <w1>, <w2>, ...)

## Coverage

<Only once the milestone is detailed: one row per requirement it implements, mapped to the task IDs that implement it.>

- `docs/spec.md` §4.2: <requirement, briefly> → M02-T01, M02-T03

## Review Focus

<Only once the milestone is detailed: up to five inputs or failure modes the sources imply but no task's tests exercise, most likely first, or one `None found:` line.>

- <input or condition> → <expected behavior> (source: <§ or D<nn>>). Test: `<test name>` in <task ID>.

## Outline

<Only while Status is outline: bullet list of intended scope, for the planner.
Removed when the milestone is detailed.>

## Tasks

### M02-T01: <imperative title>

- Kind: change
- Tier: worker
- Batch: yes
- Status: todo
- Wave: 1
- Depends on: none
- Files: `path/to/Thing.java`, `path/to/ThingTest.java`
- Verify: `<targeted, quiet command>`
- Fails first: yes
- Commit: `<type>(<scope>): <message>`
- Origin: review

**Objective**

<One sentence: what exists or is true when this task is done.>

**Read first**

- `docs/spec.md` §4.2 (the requirement this task implements)
- `path/to/ExistingPattern.java` (pattern to copy)

**Interfaces**

- Consumes: `CandidateSelector.select(PDDocument doc): List<Candidate>` (M01-T03)
- Consumes: `WcagThresholds.LARGE_TEXT_PT` (existing, `core/.../WcagThresholds.java:14`)
- Produces: `FigureWithAlternateText implements CandidateSelector`
- Produces: `static boolean isLargeText(float fontSizePt, boolean bold)`

**Steps**

1. <One concrete action: exact names, signatures, types, values, behavior, error cases.>
2. <...>

**Done when**

- <Observable criterion.>
```

### Format

A milestone file whose header has the line `- Format: 2`, directly after its Status line, is a format 2 milestone. A milestone file without a Format line is format 1. `plan` always writes format 2, in every milestone file it writes, detailed or outlined. The planner always writes format 2 when it details a milestone, even in a plan created under format 1. Validation applies the checklist items marked *(format 2)* only to format 2 milestones, and format 1 milestones validate as before, so plans already in progress keep running.

### Coverage

Coverage maps every requirement to the work that implements it, at two levels, so a requirement can't fall between tasks unnoticed:

- **plan.md**, `## Coverage`, between Milestones and Decisions: one row per section of every source (heading or numbered item), mapped to the milestone ID(s) that implement it, or `out of scope` with the Decision that says so.
- **Milestone file**, `## Coverage`, directly after Context and its Waves line *(format 2)*: every detailed milestone has one, with one row per requirement the milestone implements, mapped to the task ID(s) that implement it. An `outline` milestone has none.

A requirement is any normative statement: must, shall, should, a numbered acceptance criterion, or an explicit behavior. Trivially related statements may share a row.

Each row is one line: `- <source> <location>: <requirement, briefly> → <task IDs | milestone ID | out of scope (D<nn>)>`. A row is mapped when its target is one or more task IDs (milestone level), one or more milestone IDs (plan level), or `out of scope (D<nn>)` citing the Decision that says so. Any other row is unmapped.

`plan` builds both levels. The planner builds a milestone's Coverage when it details the milestone, from the plan-level rows that point at it. In a plan created under format 1, plan.md may have no rows for that milestone, or no Coverage section at all: the planner adds the plan-level rows for its own milestone, creating the section if needed. So a plan-level row for every section of every source is required only once every milestone in the plan is format 2.

### Review Focus

Specs describe what software must do, not every input it will meet, and silence on an input is not permission for that input to break the program. Every detailed milestone has a `## Review Focus` section, directly after its Coverage section *(format 2)*: up to five inputs or failure modes the sources imply but no task's tests exercise, most likely first. An `outline` milestone has none.

Each item is one line: ``- <input or condition> → <expected behavior> (source: <§ or D<nn>>). Test: `<test name>` in <task ID>.`` The source is the spec section or Decision the expected behavior comes from. The task named is the one that owns the test, and that task's Steps include writing it, so that task adds tests and is `Fails first: yes`.

If nothing qualifies, the section is one line, `None found: <what was checked>`. The section is never blank.

The expected behavior must come from the sources or Decisions. If it doesn't, it's a design decision, not a Review Focus item: `plan` asks the user about it as an ambiguity question, and the planner reports it as a GAP. This is what keeps Review Focus from becoming a back door for decisions.

`plan` builds the Review Focus of every milestone it details, and the planner builds it when it details a milestone, in both cases once the milestone's tasks are drafted and before they are sequenced, so the owning task's test-writing Steps and test file are in place before waves are assigned.

### Task fields

| Field | Rule |
|---|---|
| ID | `M<nn>-T<nn>`, unique across the plan, sequential within the milestone. |
| Kind | `change` (modifies the codebase or docs) or `investigate` (reads and reports; writes only its note, `plans/<plan-slug>/notes/<task-id>.md`). |
| Tier | `worker-mini`, `worker-light`, `worker`, `worker-heavy`, or `specialist`. |
| Batch | Format 2 milestones only. Optional: a batch task has the line `- Batch: yes`, directly after Tier; any other task has no Batch line. A batch task groups edits of the **same kind with no logic**: the same constant change, field addition, import fix, or rename across files. It relaxes two sizing rules: it may touch about ten files instead of about three production files, and it has one Step per file in its Files, each with the literal edit for that file, instead of at most about seven Steps. It is one commit, like every task, and is usually `worker-mini`. Waves still apply: a batch touching many files interferes with more tasks, so place it accordingly. |
| Why this tier | Required line for `worker-heavy` and `specialist` only. One sentence. |
| Status | `todo`, `done`, or `blocked`. Only run changes it after planning. |
| Wave | Positive integer. See [Sequence and parallelism](#sequence-and-parallelism). |
| Depends on | `none`, or earlier task IDs (any milestone). Never a later task. |
| Files | Every path the task may create or modify, including tests and, for investigate tasks, its note. Nothing else may change. `run`'s scope check also allows the task's report file, `notes/reports/<task ID>.md`, its failure log, `notes/<task ID>-failures.md`, and its review files, `notes/reviews/<task ID>-attempt<n>.md`, all in the plan directory. |
| Verify | A command, `review`, or both (`<command>` + review). A command must be runnable from the repo root, targeted, quiet, and must fail when the task isn't done. `review` sends the diff to the reviewer agent to check against Objective, Steps, and Done when. Use `review` alone only when no command can check the result (docs, investigate tasks, config with no test). A command runs with `bash -c` from the repo root on every platform, so it is written in bash syntax. A project whose tooling is PowerShell calls it explicitly, for example `pwsh -NoProfile -File scripts/verify.ps1`. Milestone verify and Final verify follow the same rule. `run` runs each of these commands through its `verify` script, which writes the full output to a log inside `.git` and prints only `exit=<n>`, the log's path, and, on failure, the log's last 40 lines. |
| Fails first | Format 2 milestones only. Required in every `change` task, directly after Verify; `investigate` tasks omit it. `yes` for any task that adds or changes tests: its Steps put the test-writing steps first, then the step "Run Verify and confirm it fails", then the implementation steps. The worker runs Verify after writing the tests and confirms it fails before writing any implementation code. If Verify passes early, either the test can't fail or the behavior already exists, and both mean the plan is wrong: the worker stops, and run blocks the task as `VACUOUS`. `no` for a task with no test that can fail beforehand (docs, config, pure renames, refactors covered by passing tests), always with a one-line reason: `- Fails first: no (<reason>)`. A task whose Verify is `review` alone is always `no`. A task in a format 1 milestone has no Fails first field and is handled as `no`. |
| Commit | Conventional-commit message. The worker commits its own work when the task is done and Verify passes: its first commit's subject is `<task ID>: <this message>`, and any further commit for the task is `<task ID>: <short message>`. After verifying, `run` makes the task's one status commit, `chore(plan): <task ID> done`, with the trailer `Orcastrat-Task: <task ID>`, so progress can be recovered from git history. Only that commit carries the trailer: a failed attempt's commit, `chore(plan): <task ID> attempt <n> failed`, has none. Recovery also matches the pre-rename `Orchestratinator-Task:` trailer. `run` finds these commits with its `recover` script when a run starts, and treats worker commits with no status commit after them as an interrupted attempt. |
| Origin | Only on a fix task: every task the planner appends to a milestone after a milestone review finds blocking problems has the line `- Origin: review`, directly after Commit. No other task has an Origin line. A milestone with any `- Origin: review` task has used its one fix round, so run goes straight to the re-review. |
| Objective | One sentence. |
| Read first | Everything the worker must read beyond CLAUDE.md / AGENTS.md, plan.md's Decisions, and the milestone's Context: the exact source sections the task implements, patterns to copy, and notes it depends on. Name sections, not whole documents. At most about five entries. |
| Interfaces | Format 2 milestones only. Required in every `change` task, directly after Read first; `investigate` tasks omit it. One entry per line, `- Consumes: <entry> (<source>)` or `- Produces: <entry>`, with at least one Consumes line and at least one Produces line; `none` is allowed for either (`- Consumes: none`, `- Produces: none`). Each entry is an exact signature or exact name: method signatures with parameter and return types, class and interface names, constants with their values, JSON or file shapes, CLI flags, config keys. Each Consumes names its source: a task ID, or `existing` with a `path:line`, as in the template. A symbol produced by a format 1 task, which has no Produces, is cited as `existing` with a `path:line`. Every Consumes that cites a task matches that task's Produces character for character, and the consuming task lists that task in Depends on, so it runs in a later wave. No symbol is produced by two tasks with different signatures. |
| Steps | Numbered. Each step is one concrete action. At most about seven steps, except in a batch task, which has one Step per file in its Files. |
| Done when | Observable criteria that Verify or the reviewer can check. |

run appends these lines under a task when they apply:

- `- Escalated: <from> → <to> (<one-line reason>)`
- `- Interrupted: attempt <n> at <tier>`
- `- Blocked: GAP | STUCK | SCOPE | VERIFY | REVIEW | VACUOUS — <one line>`

A task climbs the ladder one tier per `- Escalated:` line, at most two tiers above its planned Tier (three rungs), and only the lines below its last `- Blocked:` line count. run also keeps a failure log for each task that has failed an attempt, `notes/<task ID>-failures.md`, with one `## Attempt <n>` entry per failed attempt, resumes included, and keeps each discarded attempt's report as `notes/reports/<task ID>-attempt<n>.md`.

## Tasks are prompts

Each task block is the prompt a worker executes. The planner does the thinking so the worker doesn't have to:

- **Translate, don't forward.** The plan turns source requirements into concrete steps. A worker should never have to interpret prose from the sources to work out what to do; Read first gives it the governing section for reference, and the Steps say what to do about it.
- **Every value is written down.** Names, signatures, types, constants, messages, file paths, test names, and test cases appear in the Steps, not "per the spec".
- **One action per step.** "Add method `x(int): String` to `Foo` that returns ..." is a step. "Implement the parser" is a task that hasn't been planned yet.
- **Self-contained.** A worker that has read only CLAUDE.md / AGENTS.md, plan.md's Decisions, the milestone's Context, and the task (with its Read first list) can finish it without asking anything and without making a choice.

A worker never opens plan.md or the milestone file. Before each dispatch, run's `task-brief` script copies plan.md's Decisions, the milestone's whole Context, and the task block into one brief inside `.git`, and the worker and the per-task reviewer read that brief, CLAUDE.md / AGENTS.md, and the task's Read first list. So anything a worker needs from the plan must be in one of those three places. The worker writes what it did, with its RED and GREEN evidence, to its report file, `notes/reports/<task ID>.md` in the plan directory, and run commits that file with the task.

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
- Waves still apply to a batch task (`- Batch: yes`). A batch touching many files interferes with more tasks, so check it against every other task in its wave by the five rules above, and move one of any interfering pair to a later wave.
- A wave whose tasks are all tiny, same-kind edits with no logic is planned as one batch task (`- Batch: yes`) rather than as parallel tasks.
- Within a wave, run dispatches same-tier tasks back to back, so each tier's cached prefix stays warm: it groups the wave's tasks by the tier each runs at, puts the groups in the order their first task appears in task ID order, and keeps task ID order within a group. That is the execution and commit order of a serial wave and the dispatch order of a parallel one. Parallel results are still merged in task ID order.
- Keep waves as wide as the rules allow. A milestone whose waves are all one task wide is often a sign of tasks that are too big or registration points that should be their own task.

The milestone's Context records its wave shape on one line, for example `Waves: 5 (widths 1, 4, 3, 3, 1)`.

## Tier rubric

| Tier | Model / effort | Use for |
|---|---|---|
| `worker-mini` | Haiku in a serial wave (agent `worker-mini-serial`); Sonnet / low in a parallel wave (agent `worker-mini-parallel`) | Only tasks whose Steps contain the **literal final content** to write: complete lines of code or config, exact file text. The work is transcription plus verification. If any step requires composing code from a prose description, the floor is `worker-light`. |
| `worker-light` | Sonnet / medium | **The default.** Fully specified work: names, signatures, behavior, and test cases all given in Steps. Most investigate tasks. |
| `worker` | Sonnet / high | Fully specified but intricate: numeric or geometric code, parsers, state machines, concurrency, many edge cases. |
| `worker-heavy` | Opus / medium | No design decisions, but bounded judgment the plan can't pin down: unfamiliar library internals, debugging a known failure, poorly documented APIs. |
| `specialist` | Opus / high | The hardest bounded implementation. Rare by design. |

The ladder, from lowest to highest, is `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist`.

Plan the tier where the task is expected to succeed: a failed task climbs only a few rungs of the ladder, so starting too low wastes the rungs it might need.

The cheapest models often take two to three times as many turns on multi-step work described in prose, which can cost more overall.

If more than about one task in ten is `worker-heavy` or `specialist`, the milestone is under-specified: split or specify those tasks instead.

A milestone's Context can hold `- Tier adjustment:` lines, which the planner writes when the same tier escalated two or more times on the same kind of task in `done` milestones. Tasks of that kind in that milestone take the tier the line names, the next tier up the ladder from the one that escalated.

## Sizing rules

A task is correctly sized when:

1. It is one commit.
2. It touches at most about three production files, plus their tests. A batch task (`- Batch: yes`) may touch about ten files.
3. It has at most about seven Steps and five Read first entries. A batch task has one Step per file in its Files, each with the literal edit for that file, instead of at most about seven Steps.
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
- [ ] Every `change` task has an Interfaces block directly after Read first, with at least one Consumes line and one Produces line (`none` allowed for either), and no `investigate` task has one. *(format 2)*
- [ ] Every Interfaces entry is an exact signature or exact name, and every Consumes names its source: a task ID, or `existing` with a `path:line`. *(format 2)*
- [ ] Every Consumes that cites a task matches that task's Produces character for character, and the consuming task lists that task in Depends on. *(format 2)*
- [ ] No symbol is produced by two tasks with different signatures. *(format 2)*
- [ ] plan.md's Coverage: when every milestone in the plan is format 2, plan.md has a `## Coverage` section with a row for every section of every source; otherwise, every format 2 milestone has at least one row in plan.md's `## Coverage` mapped to it. Either way, no row is unmapped.
- [ ] A detailed milestone has a `## Coverage` section, directly after Context, with one row per requirement it implements and no unmapped row. *(format 2)*
- [ ] Every task ID in a Coverage row exists. *(format 2)*
- [ ] Every `change` task has a Fails first line directly after Verify, either `yes` or `no (<reason>)` with a one-line reason, and no `investigate` task has one. *(format 2)*
- [ ] Every task that adds or changes tests has `Fails first: yes`, with its test-writing Steps first, then the step "Run Verify and confirm it fails", then its implementation Steps; every task whose Verify is `review` alone has `no`. *(format 2)*
- [ ] A detailed milestone has a `## Review Focus` section, directly after its Coverage section, that is never blank: at most five lines in the Review Focus line format, each citing a source and an existing task whose Steps write the named test, or one `None found:` line saying what was checked. *(format 2)*
- [ ] Every task with `- Batch: yes` has one Step per file in its Files, each with the literal edit for that file. *(format 2)*

Items marked *(format 2)* apply only to format 2 milestones (see [Format](#format)). Format 1 milestones skip them and validate as before.
