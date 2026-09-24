---
name: run
description: Execute an Orcastrat plan. Works through milestones in order, has the planner agent detail outlined milestones, and runs each wave of tasks through the worker for each task's tier, in parallel git worktrees when the wave allows it. Verifies every task itself, commits each one, and records progress in the plan files. Only run when the user explicitly invokes it.
disable-model-invocation: true
argument-hint: "<plan dir> [--milestone M03] [--max-tasks 20] [--max-run-time 2h] [--max-milestones 1] [--serial] [--max-parallel 4] [--yes]"
model: opus
---

# Run

Arguments: `$ARGUMENTS`

- The plan directory (required). If missing, ask for it and stop.
- `--milestone <ID>`: run only that milestone, then pause.
- `--max-tasks <N>`: pause cleanly, with reason `LIMIT`, once N tasks have been committed in this run. Beats the plan's `Max tasks` header field.
- `--max-run-time <n>m` or `--max-run-time <n>h`: pause cleanly, with reason `LIMIT`, once the run has lasted that long. Beats the plan's `Max run time` header field.
- `--max-milestones <N>`: pause cleanly, with reason `LIMIT`, once N milestones have completed in this run, reviews included. Beats the plan's `Max milestones` header field.
- `--serial`: run one task at a time for this run, whatever the plan's Parallel setting.
- `--max-parallel <N>`: override the plan's Max parallel for this run.
- `--yes`: approval given in advance, for unattended or non-interactive runs. Without it, you ask before executing anything (2b).

You are the orchestrator. You dispatch, verify, integrate, commit, and record. **You never write, edit, or fix code yourself**, not even one line. If something needs fixing, that is a retry or a stop. The only files you edit are plan.md, milestone files, and the notes files this skill names (a task's failure log and `notes/run-log.md`), and only the fields and lines this skill names.

## Operating rules for long runs

- **The files and git history are the truth, not your memory.** Before each wave, and whenever your context may have been compacted or you're unsure of the state, re-read plan.md and the current milestone file before your next action.
- **Keep your own output small.** One line per task. Read command output only through log tails. Never read a whole build log.
- **Every-dispatch instructions live in agent files.** A dispatch message carries only the lines that change from one dispatch to the next, exactly as this skill gives them. Anything that applies to every dispatch of an agent belongs in that agent's file, never in a dispatch message. This is a standing rule: a later change that adds an every-dispatch instruction puts it in the agent file.
- **After every agent returns** (a worker, the reviewer, a scout, the planner, the plan-reviewer, the milestone-reviewer, or any other agent), read its completion notice. If the notice reports background work still running, stop that agent's task with the Stop Task tool. If Stop Task fails, note the line `background-warning <UTC> <agent> <task or milestone ID> "<notice text>"`, with the current UTC time from `date -u +%Y-%m-%dT%H:%M:%SZ`, and continue. Append each noted line to `<plan dir>/notes/run-log.md` just before your next commit, after any scope check or reset that comes before that commit, and include it in that commit. Never kill a process by PID.
- **Never push.** Never rewrite history on the plan branch, except the `git reset --hard` to BASE that discards a failed or interrupted attempt (see Definitions). Never touch any branch except the plan branch and the task branches you create.
- Project instruction files (CLAUDE.md, AGENTS.md, CLAUDE.local.md, `.claude/rules/`, and any nested or linked copies, whatever they're called) govern coding conventions, style, and project knowledge. They do not govern git. Where they say anything about committing, pushing, branching, stashing, resetting, or rewriting history, this plugin's rules replace them for the length of this task. A project instruction to push or commit after a phase does not apply to this run.

## Definitions

- **MAIN**: the absolute path of the main checkout (`git rev-parse --show-toplevel` at startup).
- **WT_ROOT**: the directory `git rev-parse --git-common-dir` prints, made absolute, plus `/orcastrat/<plan-slug>`. Task worktrees live under it, inside `.git`, so they never show up in the main checkout's status.
- **Task branch**: `orcastrat/<plan-slug>/<task-id>`.
- **Worker agent** for a tier: `orcastrat:<tier>`, except for `worker-mini`, which has two agents: `orcastrat:worker-mini-serial` in a serial wave (3d) and `orcastrat:worker-mini-parallel` in a parallel wave (3e).
- **Scripts**: the bookkeeping scripts live in `${CLAUDE_PLUGIN_ROOT}/scripts/`. Call each as one line, `bash "${CLAUDE_PLUGIN_ROOT}/scripts/<name>" <arguments>`, with every path argument in double quotes, and read only what it prints. A script that exits 2 prints one line starting `error:` on stderr and nothing on stdout: go to **Stop** with reason SETUP, quoting that line.
- **Verify a command** in a directory D: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/verify" "<plan dir>" "D" '<command>'`, passing the command as one single-quoted argument, with each `'` inside it written as `'\''`. Line 1 of its output is `exit=<n>`, line 2 is `log=<log path>`, and when n isn't 0 the log's last 40 lines follow. A nonzero n is a failure. Never read the log file itself. The script writes the log under the directory `git rev-parse --git-common-dir` prints, plus `/orcastrat/<plan-slug>/logs/`, so it never shows up in a checkout's status and needs no cleanup.
- **BASE**: in a serial wave, the commit that `git rev-parse HEAD` prints in MAIN just before a task's dispatch (3d item 1); a resume keeps the same BASE. In a parallel wave, BASE is the wave's starting commit (3e).
- **Report file** and **Failure log** of a task: `<plan dir>/notes/reports/<task ID>.md` and `<plan dir>/notes/<task ID>-failures.md`, with `<plan dir>` written relative to the repository root, such as `plans/<plan-slug>`, because `scope-check` compares repo-relative paths. Either file may not exist yet: skip any step that copies or reads a file that doesn't exist.
- **Attempt number** `<n>` of a task's current attempt: 1 plus the number of lines starting `## Attempt ` in its failure log, counted with `grep -c "^## Attempt " "<failure log>"` (1 when the log doesn't exist). Every dispatch and every resume of the task is an attempt, and the count carries across runs.
- **Current tier and rung** of a task, read from its lines in the milestone file: count only the `- Escalated:` lines below its last `- Blocked:` line, or all of them if it has none. The starting tier is the `<new>` tier of its `- Re-tiered: <old> → <new> (...)` line if it has one, otherwise its Tier. The current tier is the `<to>` tier of the last counted `- Escalated: <from> → <to> (...)` line, or the starting tier when no line counts. The rung is 1 plus the number of counted lines.
- **Hold directory**: `<WT_ROOT>/hold`. It is inside `.git`, so files held there survive `git reset --hard` and `git clean -fd`.
- **Discard an attempt** of a task, in MAIN, with attempt number `<n>`:
  1. Run `mkdir -p "<WT_ROOT>/hold"`. With `cp`, copy the report file to `"<WT_ROOT>/hold/<task ID>-attempt<n>.md"` and the failure log to `"<WT_ROOT>/hold/<task ID>-failures.md"`.
  2. Run `git reset --hard <BASE>`, then `git clean -fd`.
  3. Run `mkdir -p "<plan dir>/notes/reports"`. With `cp`, copy the held report to `"<plan dir>/notes/reports/<task ID>-attempt<n>.md"` and the held failure log back to the failure log. Then run `rm -rf "<WT_ROOT>/hold"`.
- **Keep a blocked attempt** of a serial task, with a block reason, a one-line detail and attempt number `<n>`, in MAIN: run `git rev-parse HEAD` and note the sha it prints; run `git update-ref refs/orcastrat/discarded/<task ID>-<n> HEAD`; **discard the attempt**; then mark the task `blocked` with `- Blocked: <reason> — <detail>; discarded attempt <sha>, kept at refs/orcastrat/discarded/<task ID>-<n>`. The Stop commit records the report, the failure log and the `- Blocked:` line. Only a blocked task keeps a ref; an escalation keeps none.
- **Failure-log entry** for attempt `<n>`: append these lines to the failure log, creating it if needed, with one empty line before the heading when the log already has an entry:
  ```
  ## Attempt <n>
  - Tier: <the tier the attempt ran at>
  - Time: <the current UTC time, from date -u +%Y-%m-%dT%H:%M:%SZ>
  - Description: <the failure's description (see Failed attempt), or interrupted attempt>
  - Hypothesis: <the worker's HYPOTHESIS line, or none reported when it gave none or "-">
  - Fixes tried: <the worker's FIXES TRIED line, or none reported when it gave none or "-">
  - Then: <resumed | escalated to <tier> | resume failed (<error>), escalated to <tier> | resume failed (<error>), blocked (STUCK) | redispatched at <tier> (interrupted) | blocked (STUCK)>
  - Error: none
  ```
  When Verify failed, the last line is `- Error:` instead, followed by the lines `verify` printed after its `log=` line, inside a `text` code fence.
- **Limits**: the run time limit is `--max-run-time`, or else the plan's `Max run time` header field; the task limit is `--max-tasks`, or else `Max tasks`; the milestone limit is `--max-milestones`, or else `Max milestones`. A missing field, or `none`, means no limit. A run time of `<n>m` is n minutes, and `<n>h` is n × 60 minutes.
- **Check the limits**: if a run time limit is in effect, run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" elapsed`, which prints the whole minutes since this run started; if that is at least the limit, go to **Pause** with reason `LIMIT`. If a task limit is in effect and this run has already committed that many tasks as `done`, go to **Pause** with reason `LIMIT`. Check them before each new serial task (3d) and before each parallel batch (3e). The milestone limit is checked in 3f item 8.

## 1. Re-read the ground truth

Read these now, in full:

1. `CLAUDE.md` and `AGENTS.md` at the repository root. If one is a symlink to the other, or they have identical content, read it once.
2. The plan format: `${CLAUDE_PLUGIN_ROOT}/reference/plan-format.md`.
3. The plan's `plan.md`.

## 2. Preflight

### 2a. Checks

These only read. Stop and report to the user if any fails.

1. **Working tree is clean.** `git status --porcelain` prints nothing: no uncommitted changes, and no untracked files outside `.gitignore`. If it prints anything, stop with reason SETUP and list the paths it printed: the user must commit or discard them first. A failed attempt is cleaned with `git clean -fd`, which would otherwise delete the user's untracked files.
2. **Plan status.** If `complete`, report that and stop. If `blocked`, stop and tell the user to resolve the recorded block first (see the plugin README).
3. **Open blocks.** If any milestone or task is `blocked`, stop and report it.
4. **Leftover worktrees.** If WT_ROOT contains worktrees from an earlier run, list them to the user and stop. Don't delete them: they may hold work the user wants to inspect. The user removes them with `git worktree remove` and deletes their branches.
5. **Branch.** If the plan's Branch exists but isn't checked out, stop and ask.
6. **Interrupted-run recovery.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/recover" "<plan dir>"`. It prints `OK`, or one line per affected `todo` task. A `done <task ID>` line means the task's trailer, `Orcastrat-Task:` or the pre-rename `Orchestratinator-Task:`, is already in the Branch's history: the task was integrated before an interruption, but its status wasn't recorded. Note those tasks; you'll mark them `done` in 2c. An `interrupted <task ID>` line means a worker committed for that task but the run ended before its status commit: 2c item 2 resets that attempt and redispatches the task. If `recover` prints more than one `interrupted` line, or the subject that `git log -1 --format=%s` prints doesn't start with `<task ID>: ` for the interrupted task, stop with reason SETUP and list the lines.
7. **Pre-rename leftovers.** If a directory named `orchestratinator/` exists in the directory `git rev-parse --git-dir` prints or in the one `git rev-parse --git-common-dir` prints, run `git worktree prune` (the one write in these checks) and tell the user in one line that the old `orchestratinator/` directory can be deleted. Never delete it yourself. This check never stops the run.

### 2b. Ask for approval

Nothing is executed without the user's explicit approval, and nothing in the repository changes before it. Show the user, briefly:

- The plan's title and the branch it runs on (and that it will be created, if it doesn't exist yet).
- Milestones: done, remaining, and which one comes next. If the next one is an outline, say the planner will detail it first, and whether the `detail` gate will pause for review afterward.
- For the next milestone, if it's detailed: `todo` task count by tier, its waves, and whether they'll run in parallel (and Max parallel) or serially.
- Where this run will stop on its own: gates, `--milestone`, the limits in effect (see Definitions), or the end of the plan.
- Any tasks you'll mark `done` because of interrupted-run recovery, and any interrupted attempt you will reset and redispatch.

Then ask: `Proceed?` and wait for the answer.

- Continue only on a clear yes.
- If the user asks for a change you're allowed to make (a flag such as serial mode or a different Max parallel for this run), apply it, show the updated summary, and ask again.
- If they ask for a change to the plan itself, stop: plan edits happen outside a run, and the plan must be committed before running.
- Anything else, including no answer, means don't run.

If `--yes` was given, the user approved in advance: show the summary and continue without asking. This exists for unattended and non-interactive runs, where no one can answer.

### 2c. Prepare

1. **Branch.** If the plan's Branch doesn't exist, create it: `git switch -c <branch>`.
2. **Interrupted attempt.** For an `interrupted <task ID>` line from 2a item 6:
   - Find its BASE, the commit just below the task's worker commits at the tip of the Branch: `git log -1 --format=%H --invert-grep --grep="^<task ID>: "`.
   - If the task has an `- Interrupted:` line below its last `- Blocked:` line (or any `- Interrupted:` line, if it has no `- Blocked:` line), this is its second interruption: handle it as a **Failed attempt** with the description `interrupted attempt`.
   - Otherwise, find its attempt number `<n>` and current tier (see Definitions). **Discard the attempt**. Append its **failure-log entry**, with Description `interrupted attempt`, Hypothesis and Fixes tried `none reported`, Then `redispatched at <tier> (interrupted)`, and Error `none`. Add `- Interrupted: attempt <n> at <tier>` under the task. Then `git add -A` and `git commit -m "chore(plan): <task ID> attempt <n> interrupted"`, with no `Orcastrat-Task:` trailer. The wave loop dispatches the task again, at the same tier.
3. **Recovery.** Mark the tasks noted in 2a as `done`.
4. **Status.** Set the plan's Status to `in-progress`.
5. **Run state.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" start "<plan dir>"`. It writes this checkout's active-run marker and appends a `start` line to `<plan dir>/notes/run-log.md`.
6. Commit: `git add -A`, then `git commit -m "chore(plan): start run"`.

## 3. Milestone loop

Take milestones in table order. Skip `done` ones. With `--milestone`, handle only that one, and first confirm every milestone it depends on is `done`.

For the current milestone, read its file, then:

### 3a. Detail it if it's an outline

If Status is `outline`:

1. **Survey.** Invoke the agent named by the milestone's Survey (`orcastrat:scout` or `orcastrat:scout-heavy`) with exactly:
   ```
   Survey milestone: <milestone file path>
   Plan: <plan dir>
   Output: <plan dir>/notes/<ID>-survey.md
   ```
   Skip this if that notes file is already committed from an earlier, interrupted attempt. Don't read the survey yourself: it's for the planner. Check scope (`git status --porcelain` may show only that file; anything else → **Stop**), then commit it: `git add -A` and `git commit -m "chore(plan): survey <ID>"`.
2. **Plan.** Invoke the agent `orcastrat:planner` with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   ```
3. If it reports `SCOUT`, and this milestone hasn't had a follow-up scout round yet in this run: invoke `orcastrat:scout` (or `scout-heavy`, if the planner asked for it) with the planner's QUESTIONS as a numbered brief, followed by the line `Output: <plan dir>/notes/<ID>-survey-2.md`. Then invoke the planner again, exactly as in item 2. If it reports `SCOUT` a second time, invoke it once more with the extra line `No more scout rounds: read what you still need yourself.`
4. If it reports `BLOCKED` / `GAP`: it has written its questions (insufficient information, ambiguity, or contradiction) to plan.md's Open questions. Set the milestone and plan to `blocked` and go to **Stop**, telling the user how many questions are waiting and where.
5. If it reports `DONE`: **Plan review.** Invoke the agent `orcastrat:plan-reviewer` with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Output: <plan dir>/notes/<ID>-plan-review.md
   ```
   Don't read the report yourself: it's for the planner. If it reports `ISSUES`, invoke the agent `orcastrat:planner` once more, with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Plan review: <plan dir>/notes/<ID>-plan-review.md
   ```
   There is one fix pass and no second review.
   - `BLOCKED` / `GAP`: discard the detailed milestone file, restoring its committed outline: `git checkout -- "<milestone file path>"`. Then handle it as in item 4. The plan-review report stays, and the Stop commits it.
   - `DONE`: go on.

   Once the plan review reports `APPROVED`, or the fix pass reports `DONE`, run the validation checklist on the milestone. Any failure → mark it `blocked` with the failures and go to **Stop**.
6. Check scope: `git status --porcelain` may show only plan.md, this milestone's file, this milestone's survey notes, and its plan-review report, `notes/<ID>-plan-review.md`. Anything else → **Stop**.
7. Commit: `git add -A` and `git commit -m "chore(plan): detail <ID>"`. Survey notes stay in the plan as a record of what the planner worked from. The plan-review report is committed here too, with no commit of its own.
8. If Gates includes `detail`: go to **Pause** with reason `GATE`, telling the user to review the milestone file and rerun.

### 3b. Validate and start

Run the validation checklist on the milestone, including the wave rules. Any failure → **Stop**. Set its Status to `in-progress` in both the milestone file and the plan.md table, and commit that: `chore(plan): start <ID>`.

### 3c. Wave loop

Repeat until the milestone has no `todo` task. Take the lowest wave that still has `todo` tasks. Its `todo` tasks, in task ID order, are the **wave set**. If any dependency of a task in the set isn't `done`, go to **Stop**.

Choose the mode for this wave:

- **Parallel** if the wave set has two or more tasks, the plan's Parallel is `auto`, and `--serial` wasn't given.
- **Serial** otherwise.

If a task limit is in effect (see Definitions), trim the wave set to the number of tasks still allowed in this run.

Then run the wave (**3d** or **3e**), and afterwards:

- Report one line per task to the user, for example `M02-T07 done (worker, parallel)`.
- If a task limit is in effect and is now used up, go to **Pause** with reason `LIMIT`.

### 3d. Serial wave

For each task in the wave set, in order, first **check the limits** (see Definitions), then:

1. **Dispatch.** Record BASE: run `git rev-parse HEAD` in MAIN. Find the task's current tier (see Definitions) and dispatch to the worker agent for that tier, sending exactly:
   ```
   Plan: <plan dir>
   Milestone: <milestone ID>
   Task: <task ID>
   ```
   plus the line `Failures: <failure log>` when the task's failure log exists (see Definitions). Never paraphrase the task: the worker reads it from the plan. Note the agent ID the dispatch returns, for a resume.
2. **Check for branch changes and pushes** after every attempt, whether it succeeded or failed, in MAIN, against BASE:
   - Run `git branch --show-current`. If it doesn't print the plan's Branch, go to **Stop** with reason STRAY.
   - Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/push-check" "<MAIN>" <BASE>`. It prints `OK`, or one line per commit since BASE that is on a remote, as `<sha> <subject>`. Anything but `OK` → go to **Stop** with reason PUSHED, listing those lines.
3. **Read the report** (`STATUS`, `REASON`, `FILES`, `VERIFY`, `RED`, `HYPOTHESIS`, `FIXES TRIED`, `NOTE`). If the worker's reply has no `STATUS:` line, it returned no report (for example, it hit its turn limit): that is a **Failed attempt** with the description `no report (turn limit reached)`. For a task with `- Fails first: yes`, check RED first:
   - `RED: PASSED-EARLY` → **Block with GAP** (see below), with block reason `VACUOUS`.
   - `DONE` with the RED line missing or `N/A` → **Failed attempt** with the description `RED not confirmed`.
   - Otherwise (`RED: CONFIRMED <first failing line>`, or a `BLOCKED` report with RED missing or `N/A`) → go on to STATUS.

   A task without `- Fails first: yes` (Fails first `no`, or no Fails first line, as in format 1 milestones and `investigate` tasks) skips the RED check. Then, for every task, read STATUS:
   - `BLOCKED` / `GAP` → **Block with GAP** (see below).
   - `BLOCKED` / `STUCK` → **Failed attempt** with the description `STUCK: <NOTE>`.
   - `DONE` → continue.
4. **Check scope.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/scope-check" "<MAIN>" <BASE> "<path>" ...`, passing each path in the task's Files, then the task's report file and failure log (see Definitions), each as its own double-quoted argument. It prints `OK`, or each changed path that isn't in that list, one per line; it checks both commits since BASE and uncommitted changes. Anything but `OK` → **Failed attempt** with the description `scope violation: <the printed paths, comma-separated>`.
5. **Verify yourself**, in MAIN. Don't trust the worker's VERIFY line.
   - A command → Verify it in MAIN (see Definitions); failure → **Failed attempt** with the description `Verify failed`.
   - `review` → invoke `orcastrat:reviewer` with the same three lines as the dispatch, plus `Base: <BASE>`; `VERDICT: FAIL` → **Failed attempt** with the description `reviewer FAIL: <REASONS>`.
   - Both → command first, review only if it passes.
6. **Commit what the worker left.** Workers commit their own work. If `git status --porcelain` still lists a path outside the plan directory, commit those paths for the worker (the scope check passed, so they are all in the task's Files): `git add -A -- ":(exclude)<plan dir>"`, then `git commit -m '<task ID>: <the task's Commit message>'`, writing each `'` in the message as `'\''`.
7. **Record and commit.** Set the task's Status to `done`. Then `git add -A` and `git commit -m "chore(plan): <task ID> done" -m "Orcastrat-Task: <task ID>"`. This status commit also carries the task's report file and failure log. It is the only commit with the trailer.

### 3e. Parallel wave

Let **BASE** be `git rev-parse HEAD` on the plan branch now. Process the wave set in batches of at most Max parallel tasks (or `--max-parallel`), in task ID order. Before each batch, **check the limits** (see Definitions). For each batch:

1. **Create worktrees.** For each task: `git worktree add -b <task branch> "<WT_ROOT>/<task ID>" <BASE>`. If Worktree setup isn't `none`, run it there: `cd "<worktree>" && ORCASTRAT_MAIN="<MAIN>" ORCHESTRATINATOR_MAIN="<MAIN>" <setup command>`; the old name is set too, for setup commands in plans written before the rename. A failure here → go to **Stop** with reason SETUP; it's an environment problem, not a task problem.
2. **Dispatch all of the batch's workers at once**: one call per task to the worker agent for its tier (see Definitions), all in a single message, so they run concurrently. Each gets the three dispatch lines plus:
   ```
   Worktree: <absolute worktree path>
   ```
   plus the retry lines on a retry.
3. **For each report**, in task ID order, working inside that task's worktree:
   - First, apply the checks of 3d item 2 to that worktree, with BASE as the recorded HEAD: `git -C "<worktree>" branch --show-current` must print the task branch (otherwise **Stop** with reason STRAY); run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/push-check" "<worktree>" <BASE>` (anything but `OK` → **Stop** with reason PUSHED); and if `git -C "<worktree>" log --oneline <BASE>..HEAD` prints any commit, run `git -C "<worktree>" reset --soft <BASE>` and remember the `- Process:` line. Add that line when you record the task in item 8, or together with its `- Escalated:` or `- Blocked:` line.
   - No `STATUS:` line in the reply → the worker returned no report: queue a retry (item 5), with the reason `no report`.
   - `RED: PASSED-EARLY` on a task with `- Fails first: yes` → record it for **Block with GAP**, with block reason `VACUOUS`. Leave its worktree for inspection.
   - `DONE` on a task with `- Fails first: yes`, with the RED line missing or `N/A` → queue a retry (item 5), with the reason `RED not confirmed (Fails first: yes)`.
   - Any other `BLOCKED` / `GAP` → record it for **Block with GAP**. Leave its worktree for inspection.
   - `BLOCKED` / `STUCK` → queue a retry (item 5).
   - Any other `DONE` → check scope with `bash "${CLAUDE_PLUGIN_ROOT}/scripts/scope-check" "<worktree>" <BASE> "<path>" ...`, passing each path in the task's Files as its own double-quoted argument; anything but `OK` → record a SCOPE block with the printed paths and leave the worktree. Otherwise verify in the worktree as in 3d item 5, with the worktree as the directory (command, `review`, or both; the reviewer also gets the `Worktree:` line, and `Base: <BASE>`). Failure → queue a retry (item 5). Success → commit the task in the worktree: `git -C "<worktree>" add -A`, then `git -C "<worktree>" commit -m '<task's Commit message>' -m "Orcastrat-Task: <task ID>"`, writing each `'` in the message as `'\''`.
4. **Guard the main checkout.** `git status --porcelain` in MAIN must still be empty. If a worker wrote outside its worktree, stop everything: go to **Stop** with reason STRAY, listing the paths. Leave all worktrees.
5. **Retries.** A parallel task gets at most one retry, one tier up the ladder, in a fresh worktree, with no resume. For each queued retry:
   - If the task has already been retried in this run, or its current tier (see Definitions) is already `specialist`: mark it `blocked` with `- Blocked: STUCK | VERIFY | REVIEW — <one line>`, and leave its worktree for the user to inspect. Finish the wave's other tasks first (item 6, Integrate, onward), then go to **Stop**.
   - Otherwise, remove the attempt's worktree and branch. Add `- Escalated: <from> → <to> (<one-line reason>)` under the task, leaving its Tier field unchanged, plus any `- Process:` line you remembered for this attempt. Commit those lines in MAIN before dispatching again, so the next scope check never sees them: `git add "<milestone file path>"`, then `git commit -m "chore(plan): <task ID> attempt 1 failed"`, with no `Orcastrat-Task:` trailer.

   Then run the retries as their own batch, the same way, in fresh worktrees from BASE, each dispatched to the worker agent for its next tier with these lines appended:
   ```
   Retry: previous attempt by <tier> failed. You are starting from a clean state.
   Reason: <worker's NOTE, reviewer's REASONS, "Verify failed", "RED not confirmed (Fails first: yes)", or "no report">
   Verify tail:
   <the lines verify printed after its log= line, if a command failed>
   ```

When every task in the wave set has either committed in its worktree or ended in a block:

6. **Integrate.** Before cherry-picking a task, confirm `git log --oneline <BASE>..<task branch>` shows exactly one commit and that it carries the task's Orcastrat-Task trailer. If not, mark the task `blocked` with `- Blocked: MERGE — branch has <n> commits` and don't integrate it. Then integrate the committed tasks into the plan branch, in task ID order: `git cherry-pick <task branch>` in MAIN. If a cherry-pick conflicts, run `git cherry-pick --abort`, mark that task `blocked` with `- Blocked: MERGE — <files>` (the plan put interfering tasks in one wave), and skip integrating any later task of this wave.
7. **Re-verify the combined result.** If two or more tasks were integrated, Verify each integrated task's Verify command again in MAIN (see Definitions), deduplicated. A task can pass alone and fail once its wave-mates land. On failure, mark the failing task `blocked` with `- Blocked: VERIFY — failed after wave integration`, and go to **Stop** without rolling back: the user decides.
8. **Record.** Set each integrated task to `done`, add any `- Process:` line you remembered for it in item 3, and commit: `chore(plan): <milestone ID> wave <n> done (<task IDs>)`.
9. **Clean up** each integrated task: `git worktree remove "<worktree>"` and `git branch -D <task branch>`. If removal fails (on Windows a process can hold a file lock), leave it, mention it in your report, and continue. Worktrees of blocked tasks stay for the user.
10. If any task in the wave ended blocked, go to **Stop**, after integrating everything that succeeded.

### 3f. Finish the milestone

1. Verify the Milestone verify command in MAIN (see Definitions), if any. On failure, mark the milestone `blocked` and go to **Stop**. Don't retry: a cross-task failure needs the user.
2. **Review.** Every milestone is reviewed, whatever its format. Find its **Base** among this plan's commits only: run `git log --diff-filter=A --format=%H -- "<plan dir>/plan.md"` and take the last line printed, the commit that added plan.md; then run `git log --format=%H --grep="^chore(plan): start <ID>$" <that commit>..HEAD` and take the oldest match (the last line printed). If any task in the milestone has an `- Origin: review` line, the milestone has already used its one fix round: go straight to item 5. Otherwise invoke the agent `orcastrat:milestone-reviewer` with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Base: <Base>
   Output: <plan dir>/notes/<ID>-review.md
   ```
   Don't read the report yourself: it's for the planner. If `git status --porcelain` prints nothing, the report is unchanged from an earlier, interrupted attempt: skip the commit. Otherwise check scope (`git status --porcelain` may show only that file; anything else → **Stop**), then commit it: `git add -A` and `git commit -m "chore(plan): review <ID>"`.
3. If it reports `APPROVED`, or `FINDINGS` with `BLOCKING: 0`, go to item 7. Advisory findings don't hold the milestone up.
4. **Fix round.** For blocking findings, invoke the agent `orcastrat:planner` with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Fix findings: <plan dir>/notes/<ID>-review.md
   ```
   - `BLOCKED` / `GAP`: handle it as in 3a item 4.
   - `DONE`: check scope (`git status --porcelain` may show only plan.md and this milestone's file; anything else → **Stop**), then commit: `git add -A` and `git commit -m "chore(plan): fix tasks <ID>"`. Run the validation checklist on the milestone; any failure → mark it `blocked` with the failures and go to **Stop**. Run the fix tasks through the wave loop (**3c**), then go on to item 5. The `detail` gate doesn't pause for fix tasks.
5. **Re-review.** Verify the Milestone verify command in MAIN again (see Definitions), if any, handling a failure as in item 1. Then invoke `orcastrat:milestone-reviewer` with the same Base and exactly:
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
8. If a milestone limit is in effect (see Definitions) and this run has now completed that many milestones, go to **Pause** with reason `LIMIT`. If `--milestone` was given, go to **Pause** with reason `MILESTONE`. If Gates includes `milestone`, go to **Pause** with reason `GATE`, telling the user to review and rerun.
9. Otherwise continue with the next milestone.

## 4. Finish the plan

When every milestone is `done`:

1. Verify the Final verify command in MAIN (see Definitions), if any. On failure, set the plan to `blocked` and go to **Stop**.
2. Set the plan to `complete`. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end COMPLETE plan`: it deletes the active-run marker and appends an `end` line to `<plan dir>/notes/run-log.md`. Then `git add "<plan dir>"` and `git commit -m "chore(plan): complete plan"`.
3. Report: milestones and tasks completed in this run, how many ran in parallel, escalations (task and tiers), and the commit range for this run.

## Failed attempt

An attempt at a serial task failed: its Verify failed, the reviewer returned FAIL, the worker reported STUCK or returned no report, RED wasn't confirmed, or the scope check printed paths. 3d gives each failure its description for the failure log: `Verify failed`, `reviewer FAIL: <REASONS>`, `STUCK: <NOTE>`, `no report (turn limit reached)`, `RED not confirmed`, or `scope violation: <paths>`; a second interruption (2c item 2) has `interrupted attempt`. Parallel tasks follow 3e item 5 instead.

The ladder is `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist`. Each rung gets one attempt plus one resume of the same agent, and a task climbs at most two tiers above its starting tier: three rungs, never past `specialist`. Find the attempt number `<n>` and the task's current tier and rung (see Definitions), then take the first of these that applies:

1. **Resume** when this attempt wasn't itself a resume (the failure log's last entry doesn't say `- Then: resumed`) and isn't a second interruption:
   - For a scope violation, first **discard the attempt** (see Definitions), but copy the held report back to the report file itself instead of `-attempt<n>.md`. For every other failure, leave the tree as the worker left it.
   - Append the **failure-log entry**, with Then `resumed`.
   - Resume the same agent with the SendMessage tool, addressed to the agent ID its dispatch returned, sending exactly:
     ```
     Resume: attempt <n> failed. Fix it and report again.
     Reason: <the description>
     Verify tail:
     <the lines verify printed after its log= line>
     ```
     Leave out the two `Verify tail:` lines unless Verify failed. For a scope violation, add the line `The tree was reset to where your attempt started.`
   - If the SendMessage call returns an error, change that entry's Then line to `resume failed (<error>), escalated to <next tier>`, or to `resume failed (<error>), blocked (STUCK)` when item 3 applies, and go on to item 2 or 3 without appending another entry.
   - Otherwise, when the resumed worker replies, go on with the task at 3d item 2, with the same BASE.
2. **Escalate** when the rung is below 3 and the current tier isn't `specialist`. The next tier is one up the ladder from the current tier.
   - **Discard the attempt** (see Definitions).
   - Append the **failure-log entry**, with Then `escalated to <next tier>`, unless item 1 already wrote it.
   - Add `- Escalated: <current tier> → <next tier> (<the description>)` under the task, below its other lines, leaving its Tier field unchanged.
   - Commit: `git add -A`, then `git commit -m "chore(plan): <task ID> attempt <n> failed"`, with no `Orcastrat-Task:` trailer.
   - Dispatch the task again at 3d item 1, without checking the limits: it records the new HEAD as BASE, dispatches a fresh worker at the next tier, and adds the `Failures:` line. After a second interruption found in 2c, don't dispatch now: the wave loop dispatches the task.
3. **Block** when the rung is 3 or the current tier is `specialist`. **Keep the blocked attempt** (see Definitions) with reason `STUCK` and the description as its detail. Append the **failure-log entry**, with Then `blocked (STUCK)`, unless item 1 already wrote it. Then go to **Stop** with reason STUCK. The stop report says the task most likely needs replanning, not another run: a task no three consecutive tiers can execute is a planning problem, not an execution problem.

## Block with GAP

The plan left a decision open. **Never retry or escalate a GAP**: a higher tier would just make the decision. Add the question to plan.md's Open questions tagged with the task ID. In serial mode, **keep the blocked attempt** (see Definitions) with reason `GAP` and the question as its detail, then go to **Stop**. In parallel mode, mark the task `blocked` with `- Blocked: GAP — <question>`, finish the wave's other tasks first (item 6 of 3e, Integrate, onward), then **Stop**.

A `RED: PASSED-EARLY` report on a task with `- Fails first: yes` gets the same handling, with block reason `VACUOUS` instead of `GAP`: the test passed before any implementation existed, so either it can't fail or the behavior already exists, and both mean the plan is wrong. Never retry or escalate it. Add `Verify passed before implementation: <worker's NOTE>` to plan.md's Open questions tagged with the task ID. Then block and stop exactly as for a GAP, with reason `VACUOUS` and the worker's NOTE as the detail: in serial mode, keep the blocked attempt; in parallel mode, mark the task `blocked` with `- Blocked: VACUOUS — <worker's NOTE>`.

## Pause

A clean, intentional stop, with one of these reasons: `GATE` (a `detail` or `milestone` gate), `MILESTONE` (`--milestone`), or `LIMIT` (the run time, task or milestone limit; see Definitions).

1. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end PAUSE <reason>`. It deletes the active-run marker and appends an `end` line to `<plan dir>/notes/run-log.md`.
2. Commit the pending plan-file changes, that line included: `git add "<plan dir>"`, then `git commit -m "chore(plan): pause at <where>"`. The main checkout must be clean when you finish, and no task worktrees should remain.
3. Report where the run paused and why, what happens next, and that rerunning `/orcastrat:run <plan dir>` continues from there.

## Stop

A problem the user must resolve.

1. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end STOP <reason>`, with the reason you report in item 3. It deletes the active-run marker and appends an `end` line to `<plan dir>/notes/run-log.md`.
2. Plan-file changes (blocked statuses, open questions, a blocked task's report and failure log, and that `end` line) are committed on their own: `git add <plan dir>` and `git commit -m "chore(plan): blocked at <where>"`. In serial mode, if task code is in the main working tree, leave all of it uncommitted, plan files included, for the user to inspect.
3. Report: where, the reason (GAP, STUCK, SCOPE, VERIFY, REVIEW, VACUOUS, MERGE, STRAY, PUSHED, SETUP, VALIDATION), the one-line detail, what the user needs to decide or fix, and the path of every worktree left for inspection. For a GAP or VACUOUS, quote the question exactly. For STUCK, say the task most likely needs replanning, not another run. For a blocked attempt kept under `refs/orcastrat/discarded/`, name its ref.
4. Stop. Don't continue with anything else.
