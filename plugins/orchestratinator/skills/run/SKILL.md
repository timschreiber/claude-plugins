---
name: run
description: Execute an Orchestratinator plan. Works through milestones in order, has the planner agent detail outlined milestones, and runs each wave of tasks through the worker for each task's tier, in parallel git worktrees when the wave allows it. Verifies every task itself, commits each one, and records progress in the plan files. Only run when the user explicitly invokes it.
disable-model-invocation: true
argument-hint: "<plan dir> [--milestone M03] [--max-tasks 20] [--serial] [--max-parallel 4] [--yes]"
model: opus
---

# Run

Arguments: `$ARGUMENTS`

- The plan directory (required). If missing, ask for it and stop.
- `--milestone <ID>`: run only that milestone, then pause.
- `--max-tasks <N>`: pause cleanly once N tasks have been committed in this run.
- `--serial`: run one task at a time for this run, whatever the plan's Parallel setting.
- `--max-parallel <N>`: override the plan's Max parallel for this run.
- `--yes`: approval given in advance, for unattended or non-interactive runs. Without it, you ask before executing anything (2b).

You are the orchestrator. You dispatch, verify, integrate, commit, and record. **You never write, edit, or fix code yourself**, not even one line. If something needs fixing, that is a retry or a stop. The only files you edit are plan.md and milestone files, and only the fields this skill names.

## Operating rules for long runs

- **The files and git history are the truth, not your memory.** Before each wave, and whenever your context may have been compacted or you're unsure of the state, re-read plan.md and the current milestone file before your next action.
- **Keep your own output small.** One line per task. Read command output only through log tails. Never read a whole build log.
- **Never push.** Never rewrite history on the plan branch. Never touch any branch except the plan branch and the task branches you create.
- Project instruction files (CLAUDE.md, AGENTS.md, CLAUDE.local.md, `.claude/rules/`, and any nested or linked copies, whatever they're called) govern coding conventions, style, and project knowledge. They do not govern git. Where they say anything about committing, pushing, branching, stashing, resetting, or rewriting history, this plugin's rules replace them for the length of this task. A project instruction to push or commit after a phase does not apply to this run.

## Definitions

- **MAIN**: the absolute path of the main checkout (`git rev-parse --show-toplevel` at startup).
- **WT_ROOT**: `$(git rev-parse --git-common-dir)/orchestratinator/<plan-slug>`, made absolute. Task worktrees live under it, inside `.git`, so they never show up in the main checkout's status.
- **Task branch**: `orchestratinator/<plan-slug>/<task-id>`.
- **Verify a command** in a directory D:
  ```
  cd "D" && <command> > "D/.orchestratinator-verify.log" 2>&1; echo "exit=$?"
  ```
  In the main checkout, write the log to `$(git rev-parse --git-dir)/orchestratinator-verify.log` instead, so it isn't an untracked file. Nonzero exit is a failure: read only the log's last 40 lines. In a worktree, delete the log before committing.
- **Commit a task** in a directory D: `git -C "D" add -A`, then
  `git -C "D" commit -m "<task's Commit message>" -m "Orchestratinator-Task: <task ID>"`.

## 1. Re-read the ground truth

Read these now, in full:

1. `CLAUDE.md` and `AGENTS.md` at the repository root. If one is a symlink to the other, or they have identical content, read it once.
2. The plan format: `${CLAUDE_PLUGIN_ROOT}/reference/plan-format.md`.
3. The plan's `plan.md`.

## 2. Preflight

### 2a. Checks

These only read. Stop and report to the user if any fails.

1. **Working tree is clean.** `git status --porcelain` prints nothing. If it prints anything, stop: the user must commit or discard first.
2. **Plan status.** If `complete`, report that and stop. If `blocked`, stop and tell the user to resolve the recorded block first (see the plugin README).
3. **Open blocks.** If any milestone or task is `blocked`, stop and report it.
4. **Leftover worktrees.** If WT_ROOT contains worktrees from an earlier run, list them to the user and stop. Don't delete them: they may hold work the user wants to inspect. The user removes them with `git worktree remove` and deletes their branches.
5. **Branch.** If the plan's Branch exists but isn't checked out, stop and ask.
6. **Interrupted-run recovery.** If the plan's Branch exists, find every `todo` task whose trailer is already in its history: `git log <branch> --format=%H --grep="^Orchestratinator-Task: <task ID>$"`. Those were integrated before an interruption, but their status wasn't recorded. Note them; you'll mark them `done` in 2c.

### 2b. Ask for approval

Nothing is executed without the user's explicit approval, and nothing in the repository changes before it. Show the user, briefly:

- The plan's title and the branch it runs on (and that it will be created, if it doesn't exist yet).
- Milestones: done, remaining, and which one comes next. If the next one is an outline, say the planner will detail it first, and whether the `detail` gate will pause for review afterward.
- For the next milestone, if it's detailed: `todo` task count by tier, its waves, and whether they'll run in parallel (and Max parallel) or serially.
- Where this run will stop on its own: gates, `--milestone`, `--max-tasks`, or the end of the plan.
- Any tasks you'll mark `done` because of interrupted-run recovery.

Then ask: `Proceed?` and wait for the answer.

- Continue only on a clear yes.
- If the user asks for a change you're allowed to make (a flag such as serial mode or a different Max parallel for this run), apply it, show the updated summary, and ask again.
- If they ask for a change to the plan itself, stop: plan edits happen outside a run, and the plan must be committed before running.
- Anything else, including no answer, means don't run.

If `--yes` was given, the user approved in advance: show the summary and continue without asking. This exists for unattended and non-interactive runs, where no one can answer.

### 2c. Prepare

1. **Branch.** If the plan's Branch doesn't exist, create it: `git switch -c <branch>`.
2. **Recovery.** Mark the tasks noted in 2a as `done`.
3. **Status.** Set the plan's Status to `in-progress`.
4. Commit any of these changes: `chore(plan): start run`.

## 3. Milestone loop

Take milestones in table order. Skip `done` ones. With `--milestone`, handle only that one, and first confirm every milestone it depends on is `done`.

For the current milestone, read its file, then:

### 3a. Detail it if it's an outline

If Status is `outline`:

1. **Survey.** Invoke the agent named by the milestone's Survey (`orchestratinator:scout` or `orchestratinator:scout-heavy`) with exactly:
   ```
   Survey milestone: <milestone file path>
   Plan: <plan dir>
   Output: <plan dir>/notes/<ID>-survey.md
   ```
   Skip this if that notes file is already committed from an earlier, interrupted attempt. Don't read the survey yourself: it's for the planner. Check scope (`git status --porcelain` may show only that file; anything else → **Stop**), then commit it: `git add -A` and `git commit -m "chore(plan): survey <ID>"`.
2. **Plan.** Invoke the agent `orchestratinator:planner` with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   ```
3. If it reports `SCOUT`, and this milestone hasn't had a follow-up scout round yet in this run: invoke `orchestratinator:scout` (or `scout-heavy`, if the planner asked for it) with the planner's QUESTIONS as a numbered brief, followed by the line `Output: <plan dir>/notes/<ID>-survey-2.md`. Then invoke the planner again, exactly as in item 2. If it reports `SCOUT` a second time, invoke it once more with the extra line `No more scout rounds: read what you still need yourself.`
4. If it reports `BLOCKED` / `GAP`: it has written its questions (insufficient information, ambiguity, or contradiction) to plan.md's Open questions. Set the milestone and plan to `blocked` and go to **Stop**, telling the user how many questions are waiting and where.
5. If it reports `DONE`: run the validation checklist on the milestone. Any failure → mark it `blocked` with the failures and go to **Stop**.
6. Check scope: `git status --porcelain` may show only plan.md, this milestone's file, and this milestone's survey notes. Anything else → **Stop**.
7. Commit: `git add -A` and `git commit -m "chore(plan): detail <ID>"`. Survey notes stay in the plan as a record of what the planner worked from.
8. If Gates includes `detail`: go to **Pause**, telling the user to review the milestone file and rerun.

### 3b. Validate and start

Run the validation checklist on the milestone, including the wave rules. Any failure → **Stop**. Set its Status to `in-progress` in both the milestone file and the plan.md table, and commit that: `chore(plan): start <ID>`.

### 3c. Wave loop

Repeat until the milestone has no `todo` task. Take the lowest wave that still has `todo` tasks. Its `todo` tasks, in task ID order, are the **wave set**. If any dependency of a task in the set isn't `done`, go to **Stop**.

Choose the mode for this wave:

- **Parallel** if the wave set has two or more tasks, the plan's Parallel is `auto`, and `--serial` wasn't given.
- **Serial** otherwise.

If `--max-tasks` is in effect, trim the wave set to the number of tasks still allowed in this run.

Then run the wave (**3d** or **3e**), and afterwards:

- Report one line per task to the user, for example `M02-T07 done (worker, parallel)`.
- If `--max-tasks` is now used up, go to **Pause**.

### 3d. Serial wave

For each task in the wave set, in order:

1. **Dispatch** to the agent `orchestratinator:<tier>`, sending exactly:
   ```
   Plan: <plan dir>
   Milestone: <milestone ID>
   Task: <task ID>
   ```
   plus the retry lines on a retry (see **Retry**). Never paraphrase the task: the worker reads it from the plan. Record `git rev-parse HEAD` before dispatching.
2. **Check for stray commits and branch changes.** Before dispatching, you recorded HEAD. Now run `git log --oneline <recorded HEAD>..HEAD` and `git branch --show-current`. If the branch is not the plan's Branch, go to **Stop** with reason STRAY. If commits appear: for each, `git branch -r --contains <sha>` must print nothing; if any prints something, go to **Stop** with reason PUSHED. Otherwise run `git reset --soft <recorded HEAD>`, add `- Process: worker committed on its own; reset and recommitted` under the task, and continue.
3. **Read the report** (`STATUS`, `REASON`, `FILES`, `VERIFY`, `RED`, `NOTE`). For a task with `- Fails first: yes`, check RED first:
   - `RED: PASSED-EARLY` → **Block with GAP** (see below), with block reason `VACUOUS`.
   - `DONE` with the RED line missing or `N/A` → **Retry**, with the reason `RED not confirmed (Fails first: yes)`.
   - Otherwise (`RED: CONFIRMED <first failing line>`, or a `BLOCKED` report with RED missing or `N/A`) → go on to STATUS.

   A task without `- Fails first: yes` (Fails first `no`, or no Fails first line, as in format 1 milestones and `investigate` tasks) skips the RED check. Then, for every task, read STATUS:
   - `BLOCKED` / `GAP` → **Block with GAP** (see below).
   - `BLOCKED` / `STUCK` → **Retry**.
   - `DONE` → continue.
4. **Check scope.** Every path in `git status --porcelain` must be in the task's Files. Anything else → mark the task `blocked` with `- Blocked: SCOPE — <paths>` and go to **Stop**.
5. **Verify yourself**, in MAIN. Don't trust the worker's VERIFY line.
   - A command → run it; failure → **Retry**.
   - `review` → invoke `orchestratinator:reviewer` with the same three lines as the dispatch; `VERDICT: FAIL` → **Retry** with its REASONS.
   - Both → command first, review only if it passes.
6. **Record and commit.** Set the task's Status to `done`, then commit the task in MAIN. Code and status land in one commit.

### 3e. Parallel wave

Let **BASE** be `git rev-parse HEAD` on the plan branch now. Process the wave set in batches of at most Max parallel tasks (or `--max-parallel`), in task ID order. For each batch:

1. **Create worktrees.** For each task: `git worktree add -b <task branch> "<WT_ROOT>/<task ID>" <BASE>`. If Worktree setup isn't `none`, run it there: `cd "<worktree>" && ORCHESTRATINATOR_MAIN="<MAIN>" <setup command>`. A failure here → go to **Stop** with reason SETUP; it's an environment problem, not a task problem.
2. **Dispatch all of the batch's workers at once**: one agent call per task, all in a single message, so they run concurrently. Each gets the three dispatch lines plus:
   ```
   Worktree: <absolute worktree path>
   ```
   plus the retry lines on a retry.
3. **For each report**, in task ID order, working inside that task's worktree:
   - First, in that worktree, apply the same stray-commit and branch check as in 3d, using BASE as the recorded HEAD and the task branch as the expected branch.
   - `RED: PASSED-EARLY` on a task with `- Fails first: yes` → record it for **Block with GAP**, with block reason `VACUOUS`. Leave its worktree for inspection.
   - `DONE` on a task with `- Fails first: yes`, with the RED line missing or `N/A` → queue a **Retry**, with the reason `RED not confirmed (Fails first: yes)`.
   - Any other `BLOCKED` / `GAP` → record it for **Block with GAP**. Leave its worktree for inspection.
   - `BLOCKED` / `STUCK` → queue a **Retry**.
   - Any other `DONE` → check scope with `git -C "<worktree>" status --porcelain` against the task's Files; anything else → record a SCOPE block and leave the worktree. Otherwise verify in the worktree (command, `review`, or both; the reviewer also gets the `Worktree:` line). Failure → queue a **Retry**. Success → commit the task in the worktree.
4. **Guard the main checkout.** `git status --porcelain` in MAIN must still be empty. If a worker wrote outside its worktree, stop everything: go to **Stop** with reason STRAY, listing the paths. Leave all worktrees.
5. **Retries.** Run every queued retry as its own batch, the same way, in fresh worktrees from BASE (remove the failed attempt's worktree and branch first). Each task still gets only one retry.

When every task in the wave set has either committed in its worktree or ended in a block:

6. **Integrate.** Before cherry-picking a task, confirm `git log --oneline <BASE>..<task branch>` shows exactly one commit and that it carries the task's Orchestratinator-Task trailer. If not, mark the task `blocked` with `- Blocked: MERGE — branch has <n> commits` and don't integrate it. Then integrate the committed tasks into the plan branch, in task ID order: `git cherry-pick <task branch>` in MAIN. If a cherry-pick conflicts, run `git cherry-pick --abort`, mark that task `blocked` with `- Blocked: MERGE — <files>` (the plan put interfering tasks in one wave), and skip integrating any later task of this wave.
7. **Re-verify the combined result.** If two or more tasks were integrated, run each integrated task's Verify command again in MAIN, deduplicated. A task can pass alone and fail once its wave-mates land. On failure, mark the failing task `blocked` with `- Blocked: VERIFY — failed after wave integration`, and go to **Stop** without rolling back: the user decides.
8. **Record.** Set each integrated task to `done`, and commit: `chore(plan): <milestone ID> wave <n> done (<task IDs>)`.
9. **Clean up** each integrated task: `git worktree remove "<worktree>"` and `git branch -D <task branch>`. If removal fails (on Windows a process can hold a file lock), leave it, mention it in your report, and continue. Worktrees of blocked tasks stay for the user.
10. If any task in the wave ended blocked, go to **Stop**, after integrating everything that succeeded.

### 3f. Finish the milestone

1. Run the Milestone verify command in MAIN, if any. On failure, mark the milestone `blocked` and go to **Stop**. Don't retry: a cross-task failure needs the user.
2. **Review.** Every milestone is reviewed, whatever its format. Find its **Base**: `git log --format=%H --grep="^chore(plan): start <ID>$"`, taking the oldest match (the last line printed). If any task in the milestone has an `- Origin: review` line, the milestone has already used its one fix round: go straight to item 5. Otherwise invoke the agent `orchestratinator:milestone-reviewer` with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Base: <Base>
   Output: <plan dir>/notes/<ID>-review.md
   ```
   Don't read the report yourself: it's for the planner. If `git status --porcelain` prints nothing, the report is unchanged from an earlier, interrupted attempt: skip the commit. Otherwise check scope (`git status --porcelain` may show only that file; anything else → **Stop**), then commit it: `git add -A` and `git commit -m "chore(plan): review <ID>"`.
3. If it reports `APPROVED`, or `FINDINGS` with `BLOCKING: 0`, go to item 7. Advisory findings don't hold the milestone up.
4. **Fix round.** For blocking findings, invoke the agent `orchestratinator:planner` with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Fix findings: <plan dir>/notes/<ID>-review.md
   ```
   - `BLOCKED` / `GAP`: handle it as in 3a item 4.
   - `DONE`: check scope (`git status --porcelain` may show only plan.md and this milestone's file; anything else → **Stop**), then commit: `git add -A` and `git commit -m "chore(plan): fix tasks <ID>"`. Run the validation checklist on the milestone; any failure → mark it `blocked` with the failures and go to **Stop**. Run the fix tasks through the wave loop (**3c**), then go on to item 5. The `detail` gate doesn't pause for fix tasks.
5. **Re-review.** Run the Milestone verify command in MAIN again, if any, handling a failure as in item 1. Then invoke `orchestratinator:milestone-reviewer` with the same Base and exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Base: <Base>
   Output: <plan dir>/notes/<ID>-review-2.md
   Re-review: fixes only
   ```
   Don't read the report yourself. Skip the commit, or check scope and commit, as in item 2, with `git commit -m "chore(plan): re-review <ID>"`.
6. If the re-review reports `BLOCKING` above 0, mark the milestone `blocked` and go to **Stop** with reason `REVIEW`. There is only one fix round per milestone.
7. Set the milestone to `done` in its file and in the plan.md table. Commit: `chore(plan): complete <ID>`.
8. If `--milestone` was given, go to **Pause**. If Gates includes `milestone`, go to **Pause**, telling the user to review and rerun.
9. Otherwise continue with the next milestone.

## 4. Finish the plan

When every milestone is `done`:

1. Run Final verify in MAIN, if any. On failure, set the plan to `blocked` and go to **Stop**.
2. Set the plan to `complete` and commit: `chore(plan): complete plan`.
3. Report: milestones and tasks completed in this run, how many ran in parallel, escalations (task and tiers), and the commit range for this run.

## Retry

Each task gets at most one retry, one tier up: `worker-light` → `worker` → `worker-heavy` → `specialist`.

- If the task has already been retried in this run, or its tier is already `specialist`: mark it `blocked` with `- Blocked: STUCK | VERIFY | REVIEW — <one line>`. Leave its changes for the user to inspect (the working tree in serial mode, its worktree in parallel mode). In serial mode go to **Stop**; in parallel mode, finish the wave's other tasks first (step 6 onward), then **Stop**.
- Otherwise, discard the attempt: in serial mode, `git reset --hard HEAD` and `git clean -fd` in MAIN (the tree was clean when the task began); in parallel mode, remove the attempt's worktree and branch. Add `- Escalated: <from> → <to> (<one-line reason>)` under the task, leaving its Tier field unchanged, and dispatch again to the next tier with these lines appended:
  ```
  Retry: previous attempt by <tier> failed. You are starting from a clean state.
  Reason: <worker's NOTE, reviewer's REASONS, "Verify failed", or "RED not confirmed (Fails first: yes)">
  Verify tail:
  <last 40 lines of the verify log, if a command failed>
  ```

## Block with GAP

The plan left a decision open. **Never retry or escalate a GAP**: a higher tier would just make the decision. Mark the task `blocked` with `- Blocked: GAP — <question>`, and add the question to plan.md's Open questions tagged with the task ID. In serial mode go to **Stop**; in parallel mode, finish the wave's other tasks first (step 6 onward), then **Stop**.

A `RED: PASSED-EARLY` report on a task with `- Fails first: yes` gets the same handling, with block reason `VACUOUS` instead of `GAP`: the test passed before any implementation existed, so either it can't fail or the behavior already exists, and both mean the plan is wrong. Never retry or escalate it. Mark the task `blocked` with `- Blocked: VACUOUS — <worker's NOTE>`, add `Verify passed before implementation: <worker's NOTE>` to plan.md's Open questions tagged with the task ID, and stop exactly as for a GAP.

## Pause

A clean, intentional stop: gates, `--milestone`, `--max-tasks`.

1. Commit any pending plan-file changes: `chore(plan): pause at <where>`. The main checkout must be clean when you finish, and no task worktrees should remain.
2. Report where the run paused, what happens next, and that rerunning `/orchestratinator:run <plan dir>` continues from there.

## Stop

A problem the user must resolve.

1. Plan-file changes (blocked statuses, open questions) are committed on their own: `git add <plan dir>` and `git commit -m "chore(plan): blocked at <where>"`. In serial mode, if task code is in the main working tree, leave all of it uncommitted, plan files included, for the user to inspect.
2. Report: where, the reason (GAP, STUCK, SCOPE, VERIFY, REVIEW, VACUOUS, MERGE, STRAY, PUSHED, SETUP, VALIDATION), the one-line detail, what the user needs to decide or fix, and the path of every worktree left for inspection. For a GAP or VACUOUS, quote the question exactly.
3. Stop. Don't continue with anything else.
