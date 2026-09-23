---
name: plan
description: Turn a spec, a phased prompt, a long free-form prompt, or any mix of sources into an Orchestratinator plan directory of milestones and small tiered tasks, ready for /orchestratinator:run. Jobs too small to be worth delegating are done directly instead. Only run when the user explicitly invokes it.
disable-model-invocation: true
argument-hint: "<sources: file paths and/or instructions> [--into plans/<slug>] [--direct-max 5] [--always-plan] [--yes]"
model: opus
---

# Plan

Arguments: `$ARGUMENTS`. These name the sources (file paths, sections, or instructions) and optionally the plan directory. The request may also be the conversation itself: a long prompt the user pasted or built up in chat.

You write a plan. You do **not** implement anything and you do not commit, with one exception: a job small enough that delegating it would cost more than doing it, which you do yourself (step 10).

Options in the arguments:

- `--direct-max <N>`: the largest job, in tasks, that you do directly instead of planning. Default 5.
- `--always-plan`: always write a plan, however small the job.
- `--yes`: approval given in advance for doing a small job directly (step 10). Without it, you always ask first.

## 1. Re-read the ground truth

Read these now, in full, even if you think you remember them:

1. `CLAUDE.md` and `AGENTS.md` at the repository root, plus any in directories the work will touch. If one is a symlink to the other, or they have identical content, read it once.
2. The plan format: `${CLAUDE_PLUGIN_ROOT}/reference/plan-format.md`. Follow it exactly; run and every agent parse it.
3. Every source the user named, in full. For a large spec, read all of it: later sections constrain earlier ones.

Read these yourself. They are what the plan is built from, and a summary would drop exactly the details that become questions or contradictions.

### Delegate the code reading

Everything else you need to know about the codebase, get from read-only helpers rather than reading it yourself. Your context is the most expensive one in the whole run: spend it on reasoning, not on reading files.

- **Explore** (Claude Code's built-in read-only agent, on Haiku): use it **eagerly**, for every discovery question. Where things live, what calls what, which files and tests exist, what conventions and patterns the code follows, what an area of the code does. Send several at once, in one message, whenever you have independent questions. Ask for `medium` thoroughness by default and `very thorough` for broad surveys.
- **`orchestratinator:scout`** (Sonnet, medium effort): for **precise extraction** once you know where to look. Exact signatures, types, constants, messages, behavior, error handling, test layout and commands, with `path:line` references. Also for external research: library documentation and API references.
- **`orchestratinator:scout-heavy`** (Sonnet, high effort): when the answer requires **tracing logic** across many files, such as control flow, state, concurrency, or behavior nobody documented.

Brief scouts with specific, numbered questions and ask for facts, not summaries; they report exactly that way. Run independent scouts at the same time, in one message.

Read a code file yourself only to confirm an exact value a task will depend on, or when helper reports are ambiguous or conflict with each other. Treat every report as evidence, not as a decision: if a report conflicts with the sources, that is a contradiction for step 5, not something to resolve on your own.

## 2. Capture the sources

Anything the plan depends on that isn't already a file in the repository must become one, because later readers (the planner agent, workers, a resumed run days from now) will not have this conversation.

- Save inline input from the conversation verbatim to `plans/<slug>/sources/prompt.md`. Verbatim means the user's words, not your summary. If the substance is spread across several messages, save each in order under a heading.
- List every source, in the repo or under `sources/`, in plan.md's Sources line.

Write these files when you write the plan directory in step 11. If the job turns out small enough to do directly (step 10), there is no plan directory and nothing to save.

## 3. Find the structure

Determine the milestones:

- **If the source has its own structure** (phases, steps, stages, numbered prompts), map it one-to-one onto milestones, in its order. Do not reorganize, merge, or re-sequence the author's structure. A phase that is too big for one milestone becomes consecutive milestones, not a reshuffle.
- **If the source is a phased prompt set** (a prompt per phase), each phase's prompt is that milestone's governing source. Its requirements become tasks and Context. Its process instructions (re-read files, write a plan, keep tasks mechanical) are already how this plugin works; don't turn them into tasks.
- **If the source is unstructured**, derive milestones yourself: each one a coherent deliverable that can be verified on its own, ordered so each builds on the last.
- **If the work depends on facts not yet known** (how an existing system behaves, what a library supports, what a measurement shows), put `investigate` tasks early, in the milestone that needs their answers, so later milestones are detailed from findings rather than guesses.

## 4. Choose detailing and gates

- **Detailing: `upfront`** when the whole job can be specified now: roughly 40 tasks or fewer, and nothing depends on what execution will discover.
- **Detailing: `rolling`** otherwise. Detail M01 fully now; outline every later milestone (Goal, Depends on, Milestone verify, Survey, Context, Outline). The planner agent details each one when the run reaches it, working from a survey of the code that a scout writes first. Set each outline's Survey to `scout`, or to `scout-heavy` when understanding that milestone's code means tracing intricate logic.
- **Gates:** default to `detail` for `rolling` plans, so the user reviews every milestone the planner writes before it runs, and `none` for `upfront` plans. If the user asked for something else, use that.
- **Parallel:** default to `auto` with Max parallel `3`, so waves run concurrently whenever they can. Use `off` only if the user asks, or if tasks can't run side by side on one machine at all (for example, every verification needs the same single database or port and the plan can't give each its own).
- **Worktree setup:** parallel tasks run in fresh git worktrees, which contain only committed files. Work out what a fresh checkout of this repository needs before it can build and run the plan's Verify commands: dependency installs, generated files, untracked config such as `.env`. Write that as one command, run from the worktree root, that creates only git-ignored files; it can reach the main checkout through `$ORCHESTRATINATOR_MAIN`. Use `none` if a plain checkout builds as-is. If you can't tell, that is an insufficient-information question for step 5.

## 5. Find every problem and ask about it

Before writing any task, audit the sources, CLAUDE.md / AGENTS.md, and the existing code for three kinds of problem:

- **Insufficient information.** Something the work needs isn't stated anywhere: a name, a type, a value, a behavior, an error case, an acceptance criterion, a dependency, an environment detail.
- **Ambiguity.** A passage can reasonably be read two or more ways that would produce different code or behavior.
- **Contradiction.** Two passages conflict: within one source, between sources, or between a source and CLAUDE.md / AGENTS.md or the existing code.

Answer what you can from the sources, CLAUDE.md / AGENTS.md, or existing code (send Explore or a scout to find out what the code does rather than asking the user something the code can answer), and record each non-obvious answer under Decisions with its source. Everything else is a question for the user.

**Ask before you write the plan.** Put all your questions in one message, grouped under those three headings and numbered. For each question:

- Quote or cite the passage(s) involved, with their location. For a contradiction, quote both sides.
- For an ambiguity, state each reading.
- Give the options you see, and your recommendation if one is clearly better, with a one-line reason.

Then wait. Do not write the plan, or any part of it, until the user answers. If their answers raise new questions, ask again. Record every answer under Decisions with source `user`.

Never resolve a contradiction or an ambiguity yourself, even when one side looks obviously right. You may recommend; the user decides.

For outlined milestones in a `rolling` plan, you may defer a question to Open questions only if it genuinely can't be answered until earlier milestones run (it depends on an investigation's findings, or on code that doesn't exist yet). Everything the user could answer now, ask now.

The plan exists so that no worker ever makes a design decision. A problem you leave open becomes a guess by a smaller model.

## 6. Write the tasks as prompts

For each milestone you detail, write a task list in which **every task is small, simple, and mechanical: it needs no new reasoning or design decisions, and Sonnet could execute it without thinking hard.** Each task block is the prompt a worker receives, so follow "Tasks are prompts" and the sizing rules in the plan format exactly:

- Translate the sources into concrete steps. Don't forward prose for the worker to interpret.
- Write down every value: names, signatures, types, constants, messages, paths, test names, test cases.
- One action per step, at most about seven steps, at most about three production files.
- Prefer one batch task (`- Batch: yes`) over several tiny same-shape tasks. Edits of the same kind with no logic, such as the same constant change, field addition, import fix, or rename across files, go in one batch task of up to about ten files, with one Step per file giving the literal edit for that file, usually on `worker-light`, as the plan format's Batch field defines it. Waves still apply: a batch touching many files interferes with more tasks, so place it accordingly in step 7.
- Read first names the exact source sections and pattern files the task needs, not whole documents.

Assign each task a tier from the rubric. Default to `worker`; justify every `worker-heavy` and `specialist` with a Why this tier line.

Once a milestone's tasks are drafted, build its Review Focus, as the plan format's Review Focus section defines it: up to five inputs or failure modes the sources imply but no task's tests exercise, most likely first, each with its expected behavior, the source of that behavior (a spec section or Decision), the test that pins it, and the task that owns that test. Add the test-writing Steps to the owning task under its Fails first rules, with the test's file in its Files, before you sequence the tasks in step 7. If nothing qualifies, write `None found:` plus what you checked.

The expected behavior must come from the sources or Decisions. If it doesn't, it's a design decision: an ambiguity question for the user, asked as in step 5, never a behavior you choose. Add the item only once the user's answer is recorded as a Decision, and cite that Decision as its source.

## 7. Sequence the tasks and find the parallelism

For each detailed milestone:

1. Set Depends on for every task: the tasks whose output it needs.
2. Assign Waves: wave 1 is every task with no unfinished dependency; each later wave holds tasks whose dependencies are all in earlier waves.
3. Check every pair of tasks within each wave against the five interference rules in "Sequence and parallelism". Move one task of any interfering pair to a later wave. When in doubt, separate them.
4. Look for false serialization. If a shared registration point (a DI registry, module list, manifest) is what forces tasks apart, consider making the registration its own small task after the others, so the rest of the work can share a wave.
5. Record the wave shape in the milestone's Context: `Waves: <count> (widths ...)`.

## 8. Self-check

For every task, apply this test: *could a Sonnet agent that has read only CLAUDE.md / AGENTS.md, plan.md's Decisions, the milestone's Context, and this task with its Read first list, complete it without asking anything and without making a single choice?* If not, split the task or add the missing specifics.

For every outlined milestone, check that its Goal, Context, and Outline give the planner enough to detail it later without asking what the user meant.

Run an interface-consistency pass across all tasks of every milestone you detailed, including Consumes that cite a task in another milestone: every Interfaces entry is an exact signature or exact name; every Consumes names its source, a task ID or `existing` with a `path:line`; every Consumes that cites a task matches that task's Produces character for character, and that task is in the consuming task's Depends on; and no symbol is produced by two tasks with different signatures. Fix every mismatch.

Then run the validation checklist from the plan format and fix every failure.

## 9. Check spec coverage

A requirement that falls between tasks is the failure a plan is least likely to catch any other way. Build both coverage levels the plan format defines in its Coverage section, in your draft:

- **plan.md:** one row per section of every source (heading or numbered item), mapped to the milestone(s) that implement it, or `out of scope (D<nn>)` citing the Decision that says so.
- **Every detailed milestone:** one row per requirement it implements, mapped to the task IDs that implement it.

A requirement with no task or milestone gets one added; sequence and self-check what you add as in steps 7 and 8. If a requirement seems deliberately out of scope, that is a question for the user, asked as in step 5, never a silent drop: mark it `out of scope` only once the user's answer is recorded as a Decision, and cite that Decision in the row.

Then check the Coverage items of the validation checklist and fix every failure. Step 11 writes both levels into the plan.

## 10. Size check: do small jobs directly

Orchestration has fixed costs: this plan, a fresh context for every worker, and independent verification of every task. For a small job, those cost more than they save.

Do the job directly, instead of writing a plan, when **all** of these hold:

- The whole job came out at `--direct-max` tasks or fewer (default 5), in a single milestone.
- `--always-plan` wasn't given, and the user didn't ask for a plan in so many words.
- Every question from step 5 has been answered. The size check never skips the questions.
- Every requirement maps to a drafted task (step 9). The size check never skips the coverage check, but a job done directly writes no Coverage anywhere.

To do it directly:

1. **Ask for approval first.** Tell the user the job is `<N>` tasks, small enough to do directly instead of delegating. Then show what you'll do, one entry per task in execution order: the task's title, its Files, and its Verify. Say whether you'll commit (see item 5), and that they can reply "plan it" for a full plan instead. Ask `Proceed?` and wait.
   - Continue only on a clear yes.
   - If they ask for changes, revise the tasks, show them again, and ask again.
   - If they say "plan it", skip the rest of this step and write the plan (step 11).
   - Anything else, including no answer, means don't touch anything.
   - If `--yes` was given, the user approved in advance: show the list and continue without asking.
2. Note whether `git status --porcelain` is empty before you change anything. (Check this before asking in item 1, so you can tell the user whether you'll commit.)
3. Do the tasks you drafted in step 6, in the order from step 7, exactly as drafted. The decisions are already made; don't make new ones. If you hit one you missed, stop and ask the user.
4. After each task, run its Verify command. For `review` tasks, check the result against the task's Done-when criteria yourself. If a check fails, fix it within the task's Files. If you can't get it passing, stop and report what failed.
5. Commit only if the working tree was clean in item 2: one commit per task, with the task's Commit message. If the tree already had uncommitted changes, leave your work uncommitted so it doesn't get mixed into someone else's commit, and say so. Never push. Project instruction files (CLAUDE.md, AGENTS.md, CLAUDE.local.md, `.claude/rules/`, and any nested or linked copies, whatever they're called) govern coding conventions, style, and project knowledge. They do not govern git. Where they say anything about committing, pushing, branching, stashing, resetting, or rewriting history, this plugin's rules replace them for the length of this task.
6. Don't write a plan directory. Reply with only: what you did (one line per task), the verify results, and the commits you made, or that the changes are uncommitted.

Otherwise, write the plan.

## 11. Write and hand off

Write the plan directory (default `plans/<slug>/`). Set plan Status to `planned`, detailed milestones to `ready`, outlined ones to `outline`, and every task to `todo`. Every milestone file, detailed or outlined, gets the line `- Format: 2` directly after its Status line. plan.md gets the Coverage section from step 9, between its Milestones and Decisions sections, and every detailed milestone file gets its own Coverage section, directly after its Context and Waves line. Every detailed milestone file also gets its Review Focus section from step 6, directly after its Coverage section.

Then have every detailed milestone reviewed with fresh eyes. Invoke the agent `orchestratinator:plan-reviewer` once for each detailed milestone, all in one message so they run at the same time, each with exactly:

```
Plan: <plan dir>
Milestone: <ID>
Output: <plan dir>/notes/<ID>-plan-review.md
```

Each reviewer writes its issues to its Output file and replies `APPROVED` or `ISSUES`, with a count. For each milestone whose reviewer replied `ISSUES`, read its report and fix every issue it lists yourself, once, under the same rules you wrote the milestone by in steps 6 to 9. An issue whose fix needs a design decision is a question for the user: ask it as in step 5, and record the answer as a Decision before you make the fix. There is no re-review. After this one fix pass, run the validation checklist again on every milestone you changed, and fix every failure. A job done directly (step 10) writes no plan directory, so it gets no plan review.

Reply to the user with only:

- The plan directory.
- Milestones: count, and how many are detailed vs outlined.
- For each detailed milestone: task count by tier, and its wave shape.
- Plan review: issues found and issues fixed, as totals across all detailed milestones.
- Detailing, Gates, Parallel, Max parallel, and Worktree setup, in one line.
- Any assumption you made that the user didn't state. There should be none; if there are, say so plainly.
- Next steps: review the plan, commit it, then run `/orchestratinator:run plans/<slug>`. run requires a clean working tree, so the plan must be committed first.
