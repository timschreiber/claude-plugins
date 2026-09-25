---
name: run
description: Execute an Orcastrat plan. Works through milestones in order, has the planner agent detail outlined milestones, and runs each wave of tasks through the worker for each task's tier, in parallel git worktrees when the wave allows it. Verifies every task itself, commits each one, and records progress in the plan files. Only run when the user explicitly invokes it.
disable-model-invocation: true
argument-hint: "<plan dir> [--milestone M03] [--max-tasks 20] [--max-run-time 2h] [--max-milestones 1] [--serial] [--max-parallel 4] [--yes]"
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
- `--yes`: approval given in advance, for unattended or non-interactive runs. Without it, you ask before executing anything (2b). Under it, the instruction-file check and the model check never ask either (see **Start checks**).

You are the orchestrator. You dispatch, verify, integrate, commit, and record. **You never write, edit, or fix code yourself**, not even one line. If something needs fixing, that is a retry or a stop. The only files you edit are plan.md, milestone files, the notes files this skill names (a task's failure log, `notes/run-log.md`, and the review reports that **Validate a review** rewrites), and the instruction-check files `.orcastrat/instructions/review.md` and `fix-prompt.md` (see **Start checks**), and only the fields and lines this skill names.

## Operating rules for long runs

- **The files and git history are the truth, not your memory.** Find your place with **next** (see Definitions): at start, before each wave, whenever your context may have been compacted or you're unsure of the state, and whenever the Stop hook sends you back. Take the step its `next:` line names. Every bookkeeping step resumes from git: before doing a step, check whether its result is already committed, and skip or finish it instead of redoing it.
- **Read as little of the plan as you can.** Never read plan.md's Decisions: agents get them through their briefs. Read the **plan header**, and a **task block** when you need one of its fields (see Definitions). Only the validation checklist (3a, 3b, and the fix round in 3f) reads the milestone file whole, and plan.md's sections other than Decisions.
- **Notes are committed before the next dispatch.** Every file under `<plan dir>/notes/` that an agent or you wrote (surveys, reviews, reports, failure logs, `run-log.md`) goes into your next bookkeeping commit, before the next task is dispatched, so the tree is clean for the next scope check. Before you record BASE for a dispatch, run `git status --porcelain -- "<plan dir>/notes"`; if it prints anything, commit it first: `git add "<plan dir>/notes"`, then `git commit -m "chore(plan): notes"`.
- **Keep your own output small.** One line per task. Read command output only through log tails. Never read a whole build log.
- **Every-dispatch instructions live in agent files.** A dispatch message carries only the lines that change from one dispatch to the next, exactly as this skill gives them. Anything that applies to every dispatch of an agent belongs in that agent's file, never in a dispatch message. This is a standing rule: a later change that adds an every-dispatch instruction puts it in the agent file.
- **After every agent returns** (a worker, the reviewer, a scout, the planner, the plan-reviewer, the milestone-reviewer, or any other agent), read its completion notice. If the notice reports background work still running, stop that agent's task with the Stop Task tool. If Stop Task fails, note the line `background-warning <UTC> <agent> <task or milestone ID> "<notice text>"`, and continue. If the notice reports a token count, note the line `usage <UTC> <task or milestone ID> <agent> <total tokens> <duration ms>`, with the agent's name without `orcastrat:`, the notice's total token count, and its duration in milliseconds; the ID is the task ID for a worker, the per-task reviewer, the merger and a validator of a task's review, and the milestone ID for any other agent. A notice with no token count gets no `usage` line. Usage is display only: nothing you do waits, pauses or stops on it. In every line you note, `<UTC>` is the current UTC time from `date -u +%Y-%m-%dT%H:%M:%SZ`. Append each noted line (these two, and the `merge-resolved` and `merge-rerun` lines of 3e) to `<plan dir>/notes/run-log.md` just before your next commit, after any scope check or reset that comes before that commit, and include it in that commit. Never kill a process by PID.
- **Keep the heartbeat.** From 2c item 6 until a **Pause**, a **Stop** or completion, run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" beat` just before each agent dispatch or SendMessage resume (once before the one message that dispatches or resumes a parallel batch), just after each agent returns (once when a parallel batch has returned), and just after each commit you make. It updates the heartbeat in this checkout's active-run marker. The Stop hook lets this session end its turn after three blocked stops in a row with no new heartbeat, and a later preflight removes a marker whose heartbeat is more than an hour old, so a run that keeps its heartbeat is never taken for a stuck or crashed one.
- **Never push.** Never rewrite history on the plan branch, except the `git reset --hard` to BASE that discards a failed or interrupted attempt (see Definitions), and, in a parallel wave (3e), the reset that undoes a failed merge and the reset after a containment failure. Never touch any branch except the plan branch and the task branches you create.
- Project instruction files (CLAUDE.md, AGENTS.md, CLAUDE.local.md, `.claude/rules/`, and any nested or linked copies, whatever they're called) govern coding conventions, style, and project knowledge. They do not govern git. Where they say anything about committing, pushing, branching, stashing, resetting, or rewriting history, this plugin's rules replace them for the length of this task. A project instruction to push or commit after a phase does not apply to this run.

## Definitions

- **MAIN**: the absolute path of the main checkout (`git rev-parse --show-toplevel` at startup).
- **Task worktree** of a task: `<MAIN>/.orcastrat/wt/<task ID>`, at the repository root rather than inside `.git`, where Claude Code would prompt for every file a worker writes. The toolchain check keeps the line `/.orcastrat/` in `.git/info/exclude`, so task worktrees never show up in the main checkout's status, and `git clean -fd` never removes them.
- **Task branch**: `orcastrat/<plan-slug>/<task-id>`.
- **Worker agent** for a tier: `orcastrat:<tier>`, except for `worker-mini`, which has two agents: `orcastrat:worker-mini-serial` in a serial wave (3d) and `orcastrat:worker-mini-parallel` in a parallel wave (3e).
- **Scripts**: the bookkeeping scripts live in `${CLAUDE_PLUGIN_ROOT}/scripts/`. Call each as one line, `bash "${CLAUDE_PLUGIN_ROOT}/scripts/<name>" <arguments>`, with every path argument in double quotes, and read only what it prints. A script that exits 2 prints one line starting `error:` on stderr and nothing on stdout: go to **Stop** with reason SETUP, quoting that line.
- **Next**: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/next" "<plan dir>"`. It prints nine `key: value` lines, in this order: `plan: <plan status>`; `milestone: <ID> <status> <file path>` for the first milestone that isn't `done`, or `milestone: none`; `next:` with the step to take, one of `survey <ID>`, `detail <ID>`, `start <ID>`, `wave <n>`, `milestone-verify <ID>`, `review <ID>`, `final-verify`, `complete` or `blocked`; `wave: <n> <task ID>:<tier> ...`, the current milestone's lowest wave with `todo` tasks, each with its planned Tier, or `wave: none`; `blocked:` with the blocked milestone and task IDs, or `blocked: none`; `open-questions: <count>`; `recover:` with the `recover` script's output lines joined by `; `; `worktrees: <count>`, the task worktrees left in `.orcastrat/wt/`; and `marker: none`, `marker: active <n>m` or `marker: stale`, this checkout's active-run marker. It reads only the plan's status, Wave and Tier lines, never Decisions, Context or Steps.
- **Plan header**: plan.md's title, header fields and Milestones table, every line above its `## Coverage` heading, or above `## Decisions` when it has no Coverage. To read it, Grep plan.md for `^## (Coverage|Decisions)` with line numbers, then Read plan.md from line 1 up to the line before the first match. Never read further down plan.md, except for the validation checklist.
- **Task block** of a task: its lines in the milestone file, from its `### <task ID>:` heading to the line before the next line starting `## ` or `### ` outside a code fence. To read it, Grep the milestone file for `^#{2,3} ` with line numbers, then Read only that range, with the Read tool's offset and limit; if the range ends inside an open code fence, read on to the next heading after the fence. It gives you the fields `next` doesn't print (Verify, Files, Commit, Fails first, Depends on) and the task's `- Escalated:`, `- Re-tiered:`, `- Interrupted:` and `- Blocked:` lines, and it lets you edit the task's lines.
- **Committed review result** of a review note: Grep the note for `^## Blocking` with `-A 2`. If `None.` follows the heading, the result is `BLOCKING: 0`; any finding there means `BLOCKING` above 0. Read nothing else of the note.
- **Validate a review** in its report file, given the lines you sent the reviewer, in the section that holds its blocking findings: `## Blocking` for `reviewer` and `milestone-reviewer`, `## Issues` for `plan-reviewer`. No validator ever sees the reviewer's scores.
  1. Read that section: Grep the report for `^## ` with line numbers, then Read only the lines from the section's heading to the line before the next `## ` heading. Each line in it that starts `- [`, or a number followed by `. [`, is a **candidate**.
  2. Invoke the agent `orcastrat:validator` once for each candidate, all in a single message, so they run concurrently. Each gets exactly:
     ```
     Finding: <the candidate line, without its list marker and without its leading [<score>] >
     <each line you sent the reviewer, in the same order, except its Output: line>
     ```
     plus one line `Instruction file: <path>` for each instruction file the candidate names: each path in its text whose file name is `CLAUDE.md`, `CLAUDE.local.md` or `AGENTS.md`, or which starts with `.claude/rules/`.
  3. A validator's score is the whole number on its reply's `SCORE:` line. When its call returns an error, or its reply has no such line (for example, it hit its turn limit), the candidate has no score.
  4. In the report, change each candidate's leading `[<score>]` to `[<score>/<validator score>]`, or to `[<score>/none]` when it has no score.
  5. Move each candidate whose validator score is below 80, or which has no score, to the end of the report's `## Advisory` section, adding ` — validator: <the text after REASON: in its reply>` to its end, or ` — validator: no score` when it has none. If `## Advisory` says `None.`, the first line moved replaces it. In `plan-reviewer`'s numbered lists, renumber both sections from 1. A section left with no finding says `None.`.
  6. The candidates left in the section are the **validated findings**. Only they have any effect: a failed attempt, a milestone's fix round, or a plan review's fix pass. The others are advisory, with both scores recorded.
- **Verify a command** in a directory D: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/verify" "<plan dir>" "D" '<command>'`, passing the command as one single-quoted argument, with each `'` inside it written as `'\''`. Line 1 of its output is `exit=<n>`, line 2 is `log=<log path>`, and when n isn't 0 the log's last 40 lines follow. A nonzero n is a failure. Never read the log file itself. The script writes the log under the directory `git rev-parse --git-common-dir` prints, plus `/orcastrat/<plan-slug>/logs/`, so it never shows up in a checkout's status and needs no cleanup.
- **Run report**: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-report" "<plan dir>"`. It writes `<plan dir>/notes/run-report.md` from the plan files, `notes/run-log.md` and git history, and prints only that file's path. Don't read the report. Write it only just after `run-state end` has run, in **Pause**, **Stop** or section 4. Unlike the other scripts, an exit 2 here never goes to **Stop**: quote its `error:` line in the report you give the user, and go on. The report file goes into the same commit as the other plan files; in a serial **Stop** that leaves the plan files uncommitted, it stays uncommitted with them.
- **Brief** of a task: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/task-brief" "<plan dir>" <task ID>`. It copies plan.md's Decisions, the milestone's Context and the task block into one file under the directory `git rev-parse --git-common-dir` prints, plus `/orcastrat/<plan-slug>/briefs/`, where every worktree can read it, and prints only that file's path. Generate it before every dispatch of a task, including the fresh dispatch after an escalation and the redispatch of an interrupted attempt, so it always holds the current Decisions and task block. Never generate it for a resume: the resumed agent has already read it.
- **RED evidence** in a report file: its `## RED evidence` section has a `Command:` line and a code fence with at least one line of output in it. Check it with Grep on the report file, pattern `^## RED evidence`, output mode content, with `-A 12`, and read nothing else of the report. A report file that doesn't exist has no RED evidence.
- **BASE**: in a serial wave, the commit that `git rev-parse HEAD` prints in MAIN just before a task's dispatch (3d item 1); a resume keeps the same BASE. In a parallel wave, BASE is the wave's starting commit (3e).
- **Report file** and **Failure log** of a task: `<plan dir>/notes/reports/<task ID>.md` and `<plan dir>/notes/<task ID>-failures.md`, with `<plan dir>` written relative to the repository root, such as `plans/<plan-slug>`, because `scope-check` compares repo-relative paths. Either file may not exist yet: skip any step that copies or reads a file that doesn't exist.
- **Review file** of a task's attempt `<n>`: `<plan dir>/notes/reviews/<task ID>-attempt<n>.md`, with `<plan dir>` relative to the repository root, as for the report file. The per-task reviewer writes it (3d item 5). A task's **review files** are the review files of its attempts 1 to `<n>`, its current attempt number (see **Attempt number**; in a parallel wave, counted in the failure log inside its worktree). Where a `hold` command in this skill shows `"<review file>" ...`, pass each of the task's review files as its own double-quoted argument, and where it shows `"<review file>" "<review file>" ...`, pass that pair once for each of them. A review file that doesn't exist is harmless: `scope-check` only compares paths, and `hold` skips it.
- **Attempt number** `<n>` of a task's current attempt: 1 plus the number of lines starting `## Attempt ` in its failure log, counted with `grep -c "^## Attempt " "<failure log>"` (1 when the log doesn't exist). Every dispatch and every resume of the task is an attempt, and the count carries across runs.
- **Current tier and rung** of a task, read from its lines in the milestone file: count only the `- Escalated:` lines below its last `- Blocked:` line, or all of them if it has none. The starting tier is the `<new>` tier of its `- Re-tiered: <old> → <new> (...)` line if it has one, otherwise its Tier. The current tier is the `<to>` tier of the last counted `- Escalated: <from> → <to> (...)` line, or the starting tier when no line counts. The rung is 1 plus the number of counted lines.
- **Dispatch order** of a wave set: its tasks grouped by the tier each will be dispatched at, its current tier (see above), so that same-tier tasks run back to back and each tier's cached prefix stays warm. The groups go in the order their first task appears in task ID order, and each group keeps task ID order. For example, `M01-T01:worker M01-T02:worker-light M01-T03:worker M01-T04:worker-light` runs as M01-T01, M01-T03, M01-T02, M01-T04. Wave tasks don't interfere, so this order is safe. Serial tasks run and commit in this order, and parallel batches are cut from it, but parallel integration stays in task ID order (3e).
- **Discard an attempt** of a task, in MAIN, with attempt number `<n>`:
  1. Hold the report file, the failure log and the review files: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" save "<plan dir>" <task ID> "<MAIN>" "<report file>" "<failure log>" "<review file>" ...`. It copies whichever of them exist into this run's hold, inside `.git`, where `git reset --hard` and `git clean -fd` don't reach.
  2. Run `git reset --hard <BASE>`, then `git clean -fd`.
  3. Write them back: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" restore "<plan dir>" <task ID> "<MAIN>" "<report file>" "<plan dir>/notes/reports/<task ID>-attempt<n>.md" "<failure log>" "<failure log>" "<review file>" "<review file>" ...`. It copies the held report to `<task ID>-attempt<n>.md`, and the held failure log and review files back to where they came from, creating their directories, skips a file it didn't hold, and empties the hold.
- **Keep a blocked attempt** of a serial task, with a block reason, a one-line detail and attempt number `<n>`, in MAIN: run `git rev-parse HEAD` and note the sha it prints; run `git update-ref refs/orcastrat/discarded/<task ID>-<n> HEAD`; **discard the attempt**; then mark the task `blocked` with `- Blocked: <reason> — <detail>; discarded attempt <sha>, kept at refs/orcastrat/discarded/<task ID>-<n>`. The Stop commit records the report, the failure log and the `- Blocked:` line. Only a blocked task keeps a ref; an escalation keeps none. Discarding the attempt resets the tree and reverts every uncommitted plan-file edit, so make every other plan-file edit for the block, such as an Open question, after this step.
- **Failure-log entry** for attempt `<n>`: append these lines to the failure log, creating it if needed, with one empty line before the heading when the log already has an entry:
  ```
  ## Attempt <n>
  - Tier: <the tier the attempt ran at>
  - Time: <the current UTC time, from date -u +%Y-%m-%dT%H:%M:%SZ>
  - Description: <the failure's description (see Failed attempt), or interrupted attempt>
  - Hypothesis: <the worker's HYPOTHESIS line, or none reported when it gave none or "-">
  - Fixes tried: <the worker's FIXES TRIED line, or none reported when it gave none or "-">
  - Report: <notes/reports/<task ID>-attempt<n>.md when this attempt's report was preserved under that name, otherwise notes/reports/<task ID>.md>
  - Then: <resumed | escalated to <tier> | resume failed (<error>), escalated to <tier> | resume failed (<error>), blocked (STUCK) | redispatched at <tier> (interrupted) | blocked (STUCK)>
  - Error: none
  ```
  When Verify failed, the last line is `- Error:` instead, followed by the lines `verify` printed after its `log=` line, inside a `text` code fence.
- **Limits**: the run time limit is `--max-run-time`, or else the plan's `Max run time` header field; the task limit is `--max-tasks`, or else `Max tasks`; the milestone limit is `--max-milestones`, or else `Max milestones`. A missing field, or `none`, means no limit. A run time of `<n>m` is n minutes, and `<n>h` is n × 60 minutes.
- **Check the limits**: if a run time limit is in effect, run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" elapsed`, which prints the whole minutes since this run started; if that is at least the limit, go to **Pause** with reason `LIMIT`. If a task limit is in effect and this run has already committed that many tasks as `done`, go to **Pause** with reason `LIMIT`. Check them before each new serial task (3d) and before each parallel batch (3e). The milestone limit is checked in 3f item 8.

## Start checks

Run these three checks first, in this order, before anything else in this skill: before step 1's reads, before any survey or question, before `Proceed?`, and before 2c item 6 writes the marker. When a check ends the run here, including a script that exits 2 (see Definitions, **Scripts**), report the reason and stop there: skip the **Stop** section's steps, and write and commit nothing, so there is no marker, no `run-state end`, no plan-file change and no commit.

### Toolchain check

Run items 1 to 4 directly with whatever shell tool the platform gives you (on Windows without Git Bash, the PowerShell tool), never through a script: bash may be missing.

1. **bash.** Run `bash --version`. It passes when the command runs and its first line reports version 3.2 or later.
2. **git.** Run `git --version`. It passes when the command runs and reports version 2.17 or later, the oldest with `git worktree remove`.
3. **Repository.** Run `git rev-parse --is-inside-work-tree`. It passes when it prints `true`: the current directory is inside a git work tree, not a bare repository.
4. **Commit identity.** Run `git config user.name` and `git config user.email`. It passes when each prints a value. Workers commit, so a missing identity would fail every task.

If any of items 1 to 4 fails, end the run with reason SETUP. Tell the user, in one message, `Orcastrat can't start: the toolchain check failed.`, then one line for each failed item, all of them at once: `- <item>: <what the command printed, or that it didn't run>. Fix: <the fix>`. Take the fix from this list, for the platform your environment reports (`win32` is native Windows):

- bash or git, on native Windows: `Install Git for Windows (https://git-scm.com/download/win), which provides both bash and git, then restart Claude Code.`
- bash, elsewhere: `Install bash 3.2 or later with your system package manager. Minimal containers, such as Alpine-based ones, ship sh without bash.`
- git, elsewhere: `Install git 2.17 or later with your system package manager.`
- Repository: `Run git init to make this directory a repository, or start Claude Code inside a git work tree.`
- Commit identity: `Run git config --global user.name "Your Name" and git config --global user.email "you@example.com".`

Once items 1 to 4 pass:

5. **Where the run stands.** Run **next** (see Definitions).
6. **Active run.** Read the `marker:` line of **next**, this checkout's active-run marker. A run writes it in 2c item 6 and removes it at its **Pause**, **Stop** or completion.
   - `marker: none`: go on.
   - `marker: stale`: its heartbeat is more than an hour old, or unreadable, so a crashed session left it. Remove it, which is a write: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" drop`. It deletes the marker without adding an `end` line to the crashed run's run log. Tell the user in one line: `Removed a stale run marker left by a crashed session.` Then go on.
   - `marker: active <n>m`: another run is active in this checkout, and its last heartbeat was <n> minutes ago. Only one run may be active per checkout. End the run here, before anything changes, and skip the rest of the start checks: item 7's advice to commit or discard would touch the other run's changes. Tell the user in one line that another Orcastrat run is active in this checkout, naming its marker, `<the directory git rev-parse --git-dir prints>/orcastrat/active-run`, and saying that a later run removes it once its heartbeat is more than an hour old. Runs in other worktrees of this repository have their own markers and never stop this one.
7. **Working tree is clean.** `git status --porcelain` prints nothing: no uncommitted changes, and no untracked files outside `.gitignore`. It may print one other thing, a **detailed but uncommitted milestone**: the `milestone:` line of **next** says `ready`, and every path printed is `<plan dir>/plan.md`, that milestone's file, one of its survey notes `<plan dir>/notes/<ID>-survey*.md`, or its plan-review report `<plan dir>/notes/<ID>-plan-review.md`; 2c item 2 finishes that milestone. If it prints anything else, end the run with reason SETUP and list the paths it printed: the user must commit or discard them first. Uncommitted changes in a task's Files are never treated as an interrupted attempt: they may be the user's own edits, which a reset and clean would destroy. A failed attempt is cleaned with `git clean -fd`, which would otherwise delete the user's untracked files.
8. **Exclude line.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/ensure-exclude"`. It adds the line `/.orcastrat/` to `.git/info/exclude` when it's missing, so the task worktrees under `.orcastrat/wt/` and the instruction-check files under `.orcastrat/instructions/` never show up in `git status`, and `git clean -fd` never removes them.
9. **Worktree leftovers.** Run `git worktree prune`, then `git worktree list --porcelain`, then `ls "<MAIN>/.orcastrat/wt"`. A directory `<name>` that `ls` prints is left over when no `worktree ` line of `git worktree list` ends with `/.orcastrat/wt/<name>`. If there are any, tell the user in one line: `Left over under .orcastrat/wt/, no longer a git worktree: <names>. Delete them yourself once you don't need them.` Never delete them yourself. If `ls` fails because `<MAIN>/.orcastrat/wt` doesn't exist, there is nothing to report. This item never ends the run.
10. **Long paths.** Only on native Windows (`win32`): run `git config core.longpaths`. If it doesn't print `true`, warn the user once, in one line, without stopping: `Warning: git's core.longpaths isn't true, so paths longer than 260 characters in nested worktrees can fail. To allow them, run: git config core.longpaths true`. Never change git config yourself.

### Instruction-file check

Claude Code loads the project's instruction files into this session and into every worker, so every task pays for every line. This check looks for content that costs more than it helps, and for rules that work against a run. It never edits an instruction file.

1. **Find the files.** With the Glob tool, searching `<MAIN>`, find `**/CLAUDE.md`, `**/CLAUDE.local.md`, `**/AGENTS.md`, `**/.claude/CLAUDE.md`, `**/.claude/AGENTS.md` and `.claude/rules/**/*.md`. Drop every path inside a `.git` or `.orcastrat` directory, and every duplicate. Write each path relative to `<MAIN>`, with `/` between its parts, for example `CLAUDE.md`, `.claude/rules/style.md` or `src/api/CLAUDE.md`. If no file is found, skip the rest of this check.
2. **Compare them with the acknowledgement.** Run `cd "<MAIN>" && bash "${CLAUDE_PLUGIN_ROOT}/scripts/instructions-ack" --check "<file>" ...`, passing every path from item 1 in double quotes. It adds the imported files the last review recorded, hashes every file, and prints `OK` when the file set and each file are unchanged since the user last chose Continue, or `REVIEW` otherwise. Never hash a file or read the acknowledgement yourself.
3. **`OK`.** Grep `<MAIN>/.orcastrat/instructions/review.md` for `^Conflicts:`, passing that file's path, since Grep skips excluded directories unless it is given the path. If it finds a line other than `Conflicts: none`, show the user that line. Then go on to the model check.
4. **`REVIEW`.** Read `${CLAUDE_PLUGIN_ROOT}/reference/instruction-review.md` and do the full review it describes for `run`, with the files from item 1 and `<MAIN>` as the repository root. The review either goes on to the model check or ends the run.

### Model check

Planning and orchestration are designed for Opus. Your system prompt names the model you run on.

- If its name or ID contains `opus`, in any case, go on.
- Otherwise, without `--yes`, show the user one line: `This session runs on <model>. Planning and orchestration are designed for Opus.` Then ask with the AskUserQuestion tool: one question, `Stop, or continue on this model?`, header `Model`, single choice, with the options `Stop` (description `End now, so you can restart the session on Opus.`) and `Continue on this model` (description `Go on with <model>.`). On `Continue on this model`, go on. On `Stop`, or any other answer, end the run: tell the user it stopped before anything started, and write and commit nothing.
- Otherwise, under `--yes`, don't ask. Note the line `model-notice <UTC> <model ID>`, with the current UTC time from `date -u +%Y-%m-%dT%H:%M:%SZ` and the model ID your system prompt gives, and go on. 2c item 6 appends it to the run log.

## 1. Re-read the ground truth

Read these now:

1. `CLAUDE.md` and `AGENTS.md` at the repository root, in full. If one is a symlink to the other, or they have identical content, read it once.
2. The plan format, in full: `${CLAUDE_PLUGIN_ROOT}/reference/plan-format.md`.
3. The **plan header** (see Definitions). Not the rest of plan.md: never its Decisions.
4. Where the run stands: the nine lines of **next** from item 5 of the toolchain check (see **Start checks**). Keep them for the preflight.

## 2. Preflight

### 2a. Checks

These only read, except where an item says it writes. Stop and report to the user if any fails.

1. **Plan status.** If the `plan:` line of **next** says `complete`, report that and stop. If it says `blocked`, stop and tell the user to resolve the recorded block first (see the plugin README).
2. **Open blocks.** If the `blocked:` line of **next** isn't `blocked: none`, stop and report the IDs it lists.
3. **Leftover worktrees.** If the `worktrees:` line of **next** isn't `worktrees: 0`, `.orcastrat/wt/` holds task worktrees from an earlier run: list them to the user from `git worktree list`, and stop. Don't delete them: they may hold work the user wants to inspect. The user removes them with `git worktree remove` and deletes their branches.
4. **Branch.** If the plan's Branch exists but isn't checked out, stop and ask.
5. **Interrupted-run recovery.** Read the `recover:` line of **next**: the output of the `recover` script, with its lines joined by `; `. It is `OK`, or one line per affected `todo` task. A `done <task ID>` line means the task's trailer, `Orcastrat-Task:` or the pre-rename `Orchestratinator-Task:`, is already in the Branch's history: the task was integrated before an interruption, but its status wasn't recorded. Note those tasks; you'll mark them `done` in 2c. An `interrupted <task ID>` line means a worker committed for that task but the run ended before its status commit: 2c item 3 resets that attempt and redispatches the task. If `recover` prints more than one `interrupted` line, or the subject that `git log -1 --format=%s` prints doesn't start with `<task ID>: ` for the interrupted task, stop with reason SETUP and list the lines.
6. **Pre-rename leftovers.** If a directory named `orchestratinator/` exists in the directory `git rev-parse --git-dir` prints or in the one `git rev-parse --git-common-dir` prints, run `git worktree prune` (the one write in these checks) and tell the user in one line that the old `orchestratinator/` directory can be deleted. Never delete it yourself. This check never stops the run.

### 2b. Ask for approval

Nothing is executed without the user's explicit approval, and nothing in the repository changes before it. Show the user, briefly:

- The plan's title and the branch it runs on (and that it will be created, if it doesn't exist yet).
- Milestones: done, remaining, and which one comes next. If the next one is an outline, say the planner will detail it first, and whether the `detail` gate will pause for review afterward.
- For the next milestone, if it's detailed: the wave **next** names, with its tasks and tiers, and whether waves will run in parallel (and Max parallel) or serially.
- Where this run will stop on its own: gates, `--milestone`, the limits in effect (see Definitions), or the end of the plan.
- Any tasks you'll mark `done` because of interrupted-run recovery, and any interrupted attempt you will reset and redispatch.
- A detailed but uncommitted milestone (the toolchain check's item 7), which you will plan-review, validate and commit without running the planner again.

Then ask: `Proceed?` and wait for the answer.

- Continue only on a clear yes.
- If the user asks for a change you're allowed to make (a flag such as serial mode or a different Max parallel for this run), apply it, show the updated summary, and ask again.
- If they ask for a change to the plan itself, stop: plan edits happen outside a run, and the plan must be committed before running.
- Anything else, including no answer, means don't run.

If `--yes` was given, the user approved in advance: show the summary and continue without asking. This exists for unattended and non-interactive runs, where no one can answer.

### 2c. Prepare

1. **Branch.** If the plan's Branch doesn't exist, create it: `git switch -c <branch>`.
2. **Detailed milestone.** If the toolchain check's item 7 accepted a detailed but uncommitted milestone, finish it before anything else in 2c changes a file, without running the planner again: invoke `orcastrat:plan-reviewer` and handle its result as in 3a item 5, unless `<plan dir>/notes/<ID>-plan-review.md` was among the paths the toolchain check's item 7 listed; then run the validation checklist on the milestone, and on any failure mark it `blocked` with the failures and go to **Stop**; then check scope and commit as in 3a items 6 and 7 (`chore(plan): detail <ID>`). If Gates includes `detail`, go to **Pause** with reason `GATE`, telling the user to review the milestone file and rerun.
3. **Interrupted attempt.** For an `interrupted <task ID>` line from 2a item 5:
   - Find its BASE, the commit just below the task's worker commits at the tip of the Branch: `git log -1 --format=%H --invert-grep --grep="^<task ID>: "`.
   - If the task has an `- Interrupted:` line below its last `- Blocked:` line (or any `- Interrupted:` line, if it has no `- Blocked:` line), this is its second interruption: handle it as a **Failed attempt** with the description `interrupted attempt`.
   - Otherwise, find its attempt number `<n>` and current tier (see Definitions). **Discard the attempt**. Append its **failure-log entry**, with Description `interrupted attempt`, Hypothesis and Fixes tried `none reported`, Then `redispatched at <tier> (interrupted)`, and Error `none`. Add `- Interrupted: attempt <n> at <tier>` under the task. Then `git add -A` and `git commit -m "chore(plan): <task ID> attempt <n> interrupted"`, with no `Orcastrat-Task:` trailer. The wave loop dispatches the task again, at the same tier.
4. **Recovery.** Mark the tasks noted in 2a as `done`.
5. **Status.** Set the plan's Status to `in-progress`.
6. **Run state.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" start "<plan dir>" "${CLAUDE_SESSION_ID}"`. Claude Code writes this session's ID into that command before you read this skill, so run it as you see it. It writes this checkout's active-run marker, holding this session's ID, and appends a `start` line to `<plan dir>/notes/run-log.md`. From now until a **Pause**, a **Stop** or completion, the plugin's Stop hook sends this session back to work whenever it tries to end its turn, telling you to run **next** and continue from the step it names. Keep the heartbeat from here on (see Operating rules). If the model check noted a `model-notice` line, append it now to `<plan dir>/notes/run-log.md`, below the `start` line, so item 7's commit carries it.
7. Commit: `git add -A`, then `git commit -m "chore(plan): start run"`.

## 3. Milestone loop

Take milestones in table order. Skip `done` ones. With `--milestone`, handle only that one, and first confirm every milestone it depends on is `done`.

The current milestone is the one the `milestone:` line of **next** names, with its file path. Read that file only for the validation checklist and for task blocks (see Definitions). Then:

### 3a. Detail it if it's an outline

If the `next:` line of **next** says `survey <ID>` or `detail <ID>`, the milestone is an outline:

1. **Survey.** Invoke the agent named by the milestone's Survey (`orcastrat:scout` or `orcastrat:scout-heavy`) with exactly:
   ```
   Survey milestone: <milestone file path>
   Plan: <plan dir>
   Output: <plan dir>/notes/<ID>-survey.md
   ```
   Skip this when the `next:` line of **next** says `detail <ID>`: the survey note is already committed. Don't read the survey yourself: it's for the planner. Check scope (`git status --porcelain` may show only that file; anything else → **Stop**), then commit it: `git add -A` and `git commit -m "chore(plan): survey <ID>"`.
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
   If it reports `ISSUES`, **validate the review** (see Definitions) in its `## Issues` section, with those three lines as the lines you sent the reviewer. Read nothing else of the report: it's for the planner. If a validated finding is left, invoke the agent `orcastrat:planner` once more, with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Plan review: <plan dir>/notes/<ID>-plan-review.md
   ```
   There is one fix pass and no second review.
   - `BLOCKED` / `GAP`: discard the detailed milestone file, restoring its committed outline: `git checkout -- "<milestone file path>"`. Then handle it as in item 4. The plan-review report stays, and the Stop commits it.
   - `DONE`: go on.

   Once the plan review reports `APPROVED` or leaves no validated finding, or the fix pass reports `DONE`, run the validation checklist on the milestone. Any failure → mark it `blocked` with the failures and go to **Stop**.
6. Check scope: `git status --porcelain` may show only plan.md, this milestone's file, this milestone's survey notes, and its plan-review report, `notes/<ID>-plan-review.md`. Anything else → **Stop**.
7. Commit: `git add -A` and `git commit -m "chore(plan): detail <ID>"`. Survey notes stay in the plan as a record of what the planner worked from. The plan-review report is committed here too, with no commit of its own.
8. If Gates includes `detail`: go to **Pause** with reason `GATE`, telling the user to review the milestone file and rerun.

### 3b. Validate and start

Run the validation checklist on the milestone, including the wave rules. Any failure → **Stop**. Set its Status to `in-progress` in both the milestone file and the plan.md table, and commit that: `chore(plan): start <ID>`.

### 3c. Wave loop

Before each wave, run **next** (see Definitions); repeat until its `wave:` line says `wave: none`. That line names the lowest wave that still has `todo` tasks and lists them, in task ID order, with their planned tiers: they are the **wave set**. Read a task's **task block** (see Definitions) when you need its fields. If any dependency of a task in the set isn't `done`, go to **Stop**. Then put the wave set in **dispatch order** (see Definitions), reading each task's current tier from its task block: 3d and 3e take its tasks in that order.

Choose the mode for this wave:

- **Parallel** if the wave set has two or more tasks, the plan's Parallel is `auto`, `--serial` wasn't given, and no containment failure has switched this run to serial (3e item 3).
- **Serial** otherwise.

If a task limit is in effect (see Definitions), trim the wave set to the number of tasks still allowed in this run, keeping its first tasks in dispatch order.

Then run the wave (**3d** or **3e**), and afterwards:

- Report one line per task to the user, for example `M02-T07 done (worker, parallel)`.
- If a task limit is in effect and is now used up, go to **Pause** with reason `LIMIT`.

### 3d. Serial wave

For each task in the wave set, in dispatch order (see Definitions), first **check the limits** (see Definitions), then:

1. **Dispatch.** Record BASE: run `git rev-parse HEAD` in MAIN. Generate the task's **brief** (see Definitions). Find the task's current tier (see Definitions) and dispatch to the worker agent for that tier, sending exactly:
   ```
   Brief: <the path task-brief printed>
   Report: <MAIN>/<report file>
   ```
   plus the line `Failures: <failure log>` when the task's failure log exists (see Definitions). Never paraphrase the task: the worker reads it from the brief. The report path is MAIN followed by the task's report file (see Definitions). Note the agent ID the dispatch returns, for a resume.
2. **Check for branch changes and pushes** after every attempt, whether it succeeded or failed, in MAIN, against BASE:
   - Run `git branch --show-current`. If it doesn't print the plan's Branch, go to **Stop** with reason STRAY.
   - Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/push-check" "<MAIN>" <BASE>`. It prints `OK`, or one line per commit since BASE that is on a remote, as `<sha> <subject>`. Anything but `OK` → go to **Stop** with reason PUSHED, listing those lines.
3. **Read the report** (`STATUS`, `REASON`, `FILES`, `VERIFY`, `RED`, `HYPOTHESIS`, `FIXES TRIED`, `NOTE`, `REPORT`). If the worker's reply has no `STATUS:` line, it returned no report (for example, it hit its turn limit): that is a **Failed attempt** with the description `no report (turn limit reached)`. For a task with `- Fails first: yes`, check RED first:
   - `RED: PASSED-EARLY` → **Block with GAP** (see below), with block reason `VACUOUS`.
   - `DONE` or `DONE_WITH_CONCERNS` with the RED line missing or `N/A`, or with `RED: CONFIRMED` but no **RED evidence** in the task's report file (see Definitions) → **Failed attempt** with the description `RED not confirmed`.
   - Otherwise (`RED: CONFIRMED <first failing line>` with its RED evidence, or a `BLOCKED` report with RED missing or `N/A`) → go on to STATUS.

   A task without `- Fails first: yes` (Fails first `no`, or no Fails first line, as in format 1 milestones and `investigate` tasks) skips the RED check. Then, for every task, read STATUS:
   - `BLOCKED` / `GAP` → **Block with GAP** (see below).
   - `BLOCKED` / `STUCK` → **Failed attempt** with the description `STUCK: <NOTE>`.
   - `DONE` → continue.
   - `DONE_WITH_CONCERNS` → continue as for `DONE`; item 5 also sends the task to the reviewer with the worker's concerns.
4. **Check scope.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/scope-check" "<MAIN>" <BASE> "<path>" ...`, passing each path in the task's Files, then the task's report file, failure log and review files (see Definitions), each as its own double-quoted argument. It prints `OK`, or each changed path that isn't in that list, one per line; it checks both commits since BASE and uncommitted changes. Anything but `OK` → **Failed attempt** with the description `scope violation: <the printed paths, comma-separated>`.
5. **Verify yourself**, in MAIN. Don't trust the worker's VERIFY line.
   - A command → Verify it in MAIN (see Definitions); failure → **Failed attempt** with the description `Verify failed`.
   - `review` → invoke `orcastrat:reviewer` with exactly the three lines `Brief: <the task's brief path>`, `Base: <BASE>` and `Output: <MAIN>/<review file>`, naming the current attempt's review file (see Definitions). The reviewer writes its scored findings there and replies `VERDICT: PASS | FAIL`, `BLOCKING: <count>` and `ADVISORY: <count>`. On `VERDICT: FAIL`, **validate the review** (see Definitions) in its `## Blocking` section, with the lines you sent the reviewer. If a validated finding is left → **Failed attempt** with the description `reviewer FAIL: <validated findings>`: the text of each validated finding after its `<category>: `, joined with ` | `. If none is left, the review passes: the reviewer's FAIL is final only after validation.
   - Both → command first, review only if it passes.
   - `DONE_WITH_CONCERNS` → the reviewer always runs, even when Verify is only a command: once the command passes, if there is one, invoke `orcastrat:reviewer` as for `review`, with the extra line `Report: <MAIN>/<report file>`, so it also checks the worker's concerns. A task whose Verify includes `review` gets one review, with that line. `VERDICT: FAIL` is handled as for `review`.
6. **Commit what the worker left.** Workers commit their own work. If `git status --porcelain` still lists a path outside the plan directory, commit those paths for the worker (the scope check passed, so they are all in the task's Files): `git add -A -- ":(exclude)<plan dir>"`, then `git commit -m '<task ID>: <the task's Commit message>'`, writing each `'` in the message as `'\''`.
7. **Record and commit.** Set the task's Status to `done`. Then `git add -A` and `git commit -m "chore(plan): <task ID> done" -m "Orcastrat-Task: <task ID>"`. This status commit also carries the task's report file and failure log. It is the only commit with the trailer.

### 3e. Parallel wave

Let **BASE** be `git rev-parse HEAD` in MAIN now: the wave's starting commit. Cut the wave set, in **dispatch order** (see Definitions), into batches of at most Max parallel tasks (or `--max-parallel`). Every batch starts from BASE, and nothing in MAIN changes until item 7: the workers work and commit in their worktrees, and each task's failure-log entries go in the failure log inside its worktree. Before each batch, **check the limits** (see Definitions). For each batch:

1. **Create worktrees.** Each task's worktree is its **task worktree** (see Definitions). For each task: `git worktree add -b <task branch> "<MAIN>/.orcastrat/wt/<task ID>" <BASE>`. If Worktree setup isn't `none`, run it there: `cd "<worktree>" && ORCASTRAT_MAIN="<MAIN>" ORCHESTRATINATOR_MAIN="<MAIN>" <setup command>`; the old name is set too, for setup commands in plans written before the rename. A failure here → go to **Stop** with reason SETUP; it's an environment problem, not a task problem.
2. **Dispatch all of the batch's workers at once**: first generate each task's **brief** (see Definitions), then make one call per task to the worker agent for its current tier (see Definitions), all in a single message, so they run concurrently. Each gets exactly:
   ```
   Brief: <the path task-brief printed>
   Report: <worktree>/<report file>
   Worktree: <absolute worktree path>
   ```
   plus the line `Failures: <worktree>/<failure log>` when that file exists. In a parallel wave the report path is under the task's worktree, since the worker never writes in the main checkout. Note the agent ID each dispatch returns, for a resume.
3. **Containment check**, when the batch's workers have returned, and again whenever resumed workers have replied (item 5). In MAIN, `git status --porcelain` must print nothing, `git branch --show-current` must print the plan's Branch, and `git rev-parse HEAD` must print BASE. If any of these fails, a worker wrote outside its worktree. Don't go to **Stop**:
   - If `git branch --show-current` doesn't print the plan's Branch, run `git switch --force <Branch>`. Then run `git reset --hard <BASE>` and `git clean -fd`.
   - Discard every worktree of this wave: for each, `git worktree remove --force "<worktree>"` and `git branch -D <task branch>`.
   - Tell the user, in one line: `Parallel mode is off for the rest of this run: a worker in wave <n> wrote outside its worktree.`
   - Run the rest of this run serially, as if `--serial` had been given, starting with this whole wave set, which runs again through the serial wave (**3d**).
4. **Check each report**, in task ID order, inside the task's worktree:
   - First apply the checks of 3d item 2 to the worktree, against BASE: `git -C "<worktree>" branch --show-current` must print the task branch (otherwise go to **Stop** with reason STRAY), and `bash "${CLAUDE_PLUGIN_ROOT}/scripts/push-check" "<worktree>" <BASE>` must print `OK` (anything else → **Stop** with reason PUSHED, listing those lines).
   - No `STATUS:` line in the reply → the worker returned no report: a **failed attempt in the wave** (item 5), with the description `no report (turn limit reached)`.
   - `RED: PASSED-EARLY` on a task with `- Fails first: yes` → record the task for **Block with GAP**, with block reason `VACUOUS`.
   - `DONE` or `DONE_WITH_CONCERNS` on a task with `- Fails first: yes`, with the RED line missing or `N/A`, or with no **RED evidence** in the report file under the worktree (see Definitions) → failed attempt in the wave, with the description `RED not confirmed`.
   - Any other `BLOCKED` / `GAP` → record the task for **Block with GAP**.
   - `BLOCKED` / `STUCK` → failed attempt in the wave, with the description `STUCK: <NOTE>`.
   - Any other `DONE` or `DONE_WITH_CONCERNS` → check scope with `bash "${CLAUDE_PLUGIN_ROOT}/scripts/scope-check" "<worktree>" <BASE> "<path>" ...`, passing each path in the task's Files, then the task's report file, failure log and review files (see Definitions), each as its own double-quoted argument. Anything but `OK` → failed attempt in the wave, with the description `scope violation: <the printed paths, comma-separated>`. Otherwise verify in the worktree as in 3d item 5, with the worktree as the directory: the command, `review`, or both, and the reviewer after `DONE_WITH_CONCERNS`. The reviewer also gets the `Worktree:` line, its `Output:` line names the review file under the worktree, `<worktree>/<review file>`, and after `DONE_WITH_CONCERNS` its `Report:` line names the report file under the worktree. Validate its review in that review file, as 3d item 5 says. A failure → failed attempt in the wave, with the description 3d item 5 gives it. On success, commit what the worker left, for the worker, since integration cherry-picks only commits: run `git -C "<worktree>" add -A -- ":(exclude)<report file>" ":(exclude)<failure log>" ":(exclude)<plan dir>/notes/reviews"`, which stages every uncommitted path except those two and the task's review files. The scope check passed, so each staged path is in the task's Files, including any in the plan directory, such as an investigate task's note, which would otherwise be lost when the worktree is removed. If `git -C "<worktree>" diff --cached --name-only` then prints anything, run `git -C "<worktree>" commit -m '<task ID>: <the task's Commit message>'`, writing each `'` in the message as `'\''`. The report file, failure log and review files stay uncommitted: the task's status commit carries them (item 10). The task is then **ready to integrate**.
5. **Failed attempt in the wave.** Find the attempt number `<n>` as Definitions says, but counted in the failure log inside the worktree, `<worktree>/<failure log>`, and find the task's current tier and rung (see Definitions). Every **failure-log entry** for this task goes in that file.
   - **Resume** when the last entry of the worktree's failure log doesn't say `- Then: resumed`. For a scope violation, first reset the worktree, keeping the report, the failure log and the review files: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" save "<plan dir>" <task ID> "<worktree>" "<report file>" "<failure log>" "<review file>" ...`; run `git -C "<worktree>" reset --hard <BASE>` and `git -C "<worktree>" clean -fd`; then run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" restore "<plan dir>" <task ID> "<worktree>" "<report file>" "<report file>" "<failure log>" "<failure log>" "<review file>" "<review file>" ...`, which copies them back to where they came from. Then append the failure-log entry, with Then `resumed`. Once item 4 has checked every report of the batch, send all of the batch's resumes at once, one SendMessage call per task in a single message, each addressed to the agent ID its dispatch returned, with the message **Failed attempt** item 1 gives, except that its `Report:` line is `Report: <worktree>/<report file>`. If a call returns an error, change that entry's Then line to `resume failed (<error>), escalated to <next tier>`, or to `resume failed (<error>), blocked (STUCK)` when the rung is 3 or the current tier is `specialist`, and the task leaves the wave. When the resumed workers have replied, run the containment check (item 3), then check each resumed task's report as in item 4.
   - Otherwise the task **leaves the wave**. Append its failure-log entry, with Then `escalated to <next tier>` when the rung is below 3 and the current tier isn't `specialist` (the next tier is one up the ladder, see **Failed attempt**), or `blocked (STUCK)` otherwise. Leave its worktree: item 11 or item 12 settles the task once the wave is integrated.
6. Once every task of the batch is ready to integrate, has left the wave, or is recorded for a block, go on with the next batch.

When every batch is done, first remove the wave's task worktrees, so that no Verify in MAIN (items 8 and 9, and the Milestone and Final verify) sees nested copies of the source. For each task of the wave, in task ID order:

- Hold its report file, failure log and review files: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" save "<plan dir>" <task ID> "<worktree>" "<report file>" "<failure log>" "<review file>" ...`.
- If it is recorded for **Block with GAP** (item 4), or left the wave with Then `blocked (STUCK)` (item 5), keep its attempt. Its attempt number `<n>` is, for a GAP or VACUOUS task, 1 plus the number of lines starting `## Attempt ` in the failure log inside its worktree, and for a STUCK task, the failed attempt's number, which is that count. Run `git rev-parse <task branch>` and note the sha it prints, then run `git update-ref refs/orcastrat/discarded/<task ID>-<n> <task branch>`. Item 12 names both in the task's `- Blocked:` line.
- Run `git worktree remove --force "<worktree>"`. If removal fails (on Windows a process can hold a file lock), leave it, mention it in your report, and continue.

Keep every task branch: the items below delete each one once its task is settled.

7. **Integrate** each task that is ready to integrate, one at a time, in task ID order, onto the plan branch in MAIN. First run `git rev-parse HEAD` in MAIN and note the sha as the task's PRE. Then run `cd "<MAIN>" && bash "${CLAUDE_PLUGIN_ROOT}/scripts/integrate" <task branch> <BASE>`. It cherry-picks every commit in `<BASE>..<task branch>`, so a task may have several commits.
   - `OK` → the task is integrated.
   - `CONFLICT`, then the conflicted files, one per line → the cherry-pick is left in progress: resolve it with the merger (item 8).
8. **Merger.** Generate the task's **brief** again, and the brief of each task of this wave already integrated whose Files include a conflicted file (see Definitions). Invoke the agent `orcastrat:merger` with exactly:
   ```
   Merge: <task ID>
   Brief: <the path task-brief printed for the task>
   ```
   plus one line `Merged: <the path task-brief printed for it>` for each of those integrated tasks, in task ID order, and one line `Conflicted: <MAIN>/<conflicted file>` for each conflicted file. The merge has failed when any of these holds:
   - its reply says `STATUS: UNRESOLVED`, or has no `STATUS:` line;
   - `git diff --name-only` in MAIN prints a path that isn't a conflicted file;
   - `git ls-files --others --exclude-standard` in MAIN prints anything;
   - Grep finds the pattern `^(<<<<<<<|>>>>>>>) ` in a conflicted file.

   Otherwise continue the cherry-pick in MAIN: `git add -- "<conflicted file>" ...`, naming every conflicted file, then `git -c core.editor=true cherry-pick --continue`. If it stops on another conflict in the same range, `git diff --name-only --diff-filter=U` lists the new conflicted files: invoke a new merger for them, the same way. If it fails without a conflict (for example, a commit became empty), the merge has failed. Once the cherry-pick has completed, Verify the task's Verify command in MAIN (see Definitions), if it has one; a failure means the merge has failed. Otherwise the task is integrated: note the line `merge-resolved <UTC> <task ID>` (see **After every agent returns**).

   When the merge has failed, run `git cherry-pick --abort`; if that fails because no cherry-pick is in progress, run `git reset --hard <PRE>` instead. Then run `git clean -fd`. The task is **merge-failed**. That isn't a failed attempt, and it doesn't stop the run: go on with the next task in item 7.
9. **Re-verify the combined result.** If two or more tasks were integrated, Verify each integrated task's Verify command again in MAIN (see Definitions), deduplicated. A task can pass alone and fail once its wave-mates land. On failure, don't roll back: the user decides. But settle the wave before you go to **Stop**, so that the next run can resume from git. In this order:
   - **Record** each integrated task whose Verify command passed, or that has no command, as item 10 says, in task ID order. Each gets its status commit with the `Orcastrat-Task:` trailer, so `recover` finds it `done`.
   - For each task that left the wave to be escalated (item 5), in task ID order, do what item 11's first bullet says, up to and including its commit, but don't run the task through **3d**: the next run dispatches it at the next tier.
   - For each **merge-failed** task (item 8), in task ID order, write back its held failure log and delete its branch, as item 11's second bullet says, but don't Verify or rerun it. It stays `todo`, and the next run reruns it.
   - For each integrated task whose Verify command failed, in task ID order, write back its held report file and failure log and delete its branch, as item 10 says, without setting it `done` or committing. Then mark it `blocked` with `- Blocked: VERIFY — failed after wave integration`. Its commits stay on the plan branch: say so in the Stop report.
   - Write the wave's blocks (item 12), then go to **Stop**. Stop's commit records the VERIFY blocks, with their reports and failure logs.
10. **Record** each integrated task, in task ID order. Write back its held report file, failure log and review files: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" restore "<plan dir>" <task ID> "<MAIN>" "<report file>" "<report file>" "<failure log>" "<failure log>" "<review file>" "<review file>" ...`. Set the task's Status to `done`. Then `git add -A` and `git commit -m "chore(plan): <task ID> done" -m "Orcastrat-Task: <task ID>"`. Then delete its branch: `git branch -D <task branch>`.
11. **Escalations and merge failures**, in task ID order:
    - A task that **left the wave** with Then `escalated to <next tier>` (item 5): write back its held files: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" restore "<plan dir>" <task ID> "<MAIN>" "<report file>" "<plan dir>/notes/reports/<task ID>-attempt<n>.md" "<failure log>" "<failure log>" "<review file>" "<review file>" ...`, where `<n>` is the failed attempt's number; then delete its branch as in item 10. Add `- Escalated: <current tier> → <next tier> (<the description>)` under the task, below its other lines, leaving its Tier field unchanged. Then `git add -A` and `git commit -m "chore(plan): <task ID> attempt <n> failed"`, with no `Orcastrat-Task:` trailer. Then run the task through the serial wave (**3d**) from item 1, without checking the limits: it dispatches a fresh worker at the next tier, with the `Failures:` line.
    - A **merge-failed** task (item 8): write back its held failure log: run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hold" restore "<plan dir>" <task ID> "<MAIN>" "<failure log>" "<failure log>"`; then delete its branch as in item 10. If its Verify includes a command, Verify it in MAIN (see Definitions). If that passes, its changes are already in the integrated result: set its Status to `done`, add `- Process: already integrated` under it, append the line `already-integrated <UTC> <task ID>` to `<plan dir>/notes/run-log.md`, with the current UTC time from `date -u +%Y-%m-%dT%H:%M:%SZ`, then `git add -A` and `git commit -m "chore(plan): <task ID> done" -m "Orcastrat-Task: <task ID>"`, and dispatch no worker. Otherwise note the line `merge-rerun <UTC> <task ID>` (see **After every agent returns**), and rerun it through the serial wave (**3d**) from item 1, without checking the limits, on top of the integrated result, at the tier that succeeded in its worktree, which is its current tier. The rerun adds no `- Escalated:` line and no failure-log entry.
12. **Blocks**, in task ID order, once item 11 is done, or just before any **Stop** that item 9 or item 11 reaches, so that Stop's commit records them:
    - A task recorded for **Block with GAP** (item 4, reason `GAP` or `VACUOUS`): write back its held report file and failure log and delete its branch, as item 11's first bullet does, with the attempt number `<n>` noted when its worktree was removed. Then write its block as **Block with GAP** says for parallel mode.
    - A task that **left the wave** with Then `blocked (STUCK)` (item 5): write back its held report file and failure log and delete its branch, as item 11's first bullet does, with the attempt number `<n>` noted when its worktree was removed. Mark the task `blocked` with `- Blocked: STUCK — <the description>; discarded attempt <sha>, kept at refs/orcastrat/discarded/<task ID>-<n>`, with the sha noted then.

    If any task of the wave ended blocked, go to **Stop**, reporting each blocked task with its reason.

### 3f. Finish the milestone

1. Verify the Milestone verify command in MAIN (see Definitions), if any, unless the `next:` line of **next** says `review <ID>`: the review note is then already committed, so this ran before it. On failure, mark the milestone `blocked` and go to **Stop**. Don't retry: a cross-task failure needs the user.
2. **Review.** Every milestone is reviewed, whatever its format. Find its **Base** among this plan's commits only: run `git log --diff-filter=A --format=%H -- "<plan dir>/plan.md"` and take the last line printed, the commit that added plan.md; then run `git log --format=%H --grep="^chore(plan): start <ID>$" <that commit>..HEAD` and take the oldest match (the last line printed). If any task in the milestone has an `- Origin: review` line, the milestone has already used its one fix round: go straight to item 5. Otherwise, if the `next:` line of **next** says `review <ID>`, the review is already committed from an earlier session: don't invoke the reviewer again, take its **committed review result** (see Definitions), and go on to item 3. Otherwise invoke the agent `orcastrat:milestone-reviewer` with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Base: <Base>
   Output: <plan dir>/notes/<ID>-review.md
   ```
   If it reports `FINDINGS` with `BLOCKING` above 0, **validate the review** (see Definitions) in its `## Blocking` section, with those four lines as the lines you sent the reviewer, before you commit it. Read nothing else of the report: it's for the planner. The review's result is then `BLOCKING: <the number of validated findings>`. If `git status --porcelain` prints nothing, the report is unchanged from an earlier, interrupted attempt: skip the commit. Otherwise check scope (`git status --porcelain` may show only that file; anything else → **Stop**), then commit it: `git add -A` and `git commit -m "chore(plan): review <ID>"`.
3. If it reports `APPROVED`, or the review's result is `BLOCKING: 0`, after validation or as the committed review result, go to item 7. Advisory findings don't hold the milestone up.
4. **Fix round.** For blocking findings, invoke the agent `orcastrat:planner` with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Fix findings: <plan dir>/notes/<ID>-review.md
   ```
   - `BLOCKED` / `GAP`: handle it as in 3a item 4.
   - `DONE`: check scope (`git status --porcelain` may show only plan.md and this milestone's file; anything else → **Stop**), then commit: `git add -A` and `git commit -m "chore(plan): fix tasks <ID>"`. Run the validation checklist on the milestone; any failure → mark it `blocked` with the failures and go to **Stop**. Run the fix tasks through the wave loop (**3c**), then go on to item 5. The `detail` gate doesn't pause for fix tasks.
5. **Re-review.** If `git ls-files "<plan dir>/notes/<ID>-review-2.md"` prints that path, the re-review is already committed from an earlier session: take its **committed review result** (see Definitions) and go on to item 6. Otherwise verify the Milestone verify command in MAIN again (see Definitions), if any, handling a failure as in item 1. Then invoke `orcastrat:milestone-reviewer` with the same Base and exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   Base: <Base>
   Output: <plan dir>/notes/<ID>-review-2.md
   Re-review: fixes only
   ```
   If it reports `BLOCKING` above 0, **validate the review** (see Definitions) in its `## Blocking` section, with those five lines as the lines you sent the reviewer, before you commit it. Read nothing else of the report. Skip the commit, or check scope and commit, as in item 2, with `git commit -m "chore(plan): re-review <ID>"`.
6. If the re-review's result is `BLOCKING` above 0, after validation or as the committed review result, mark the milestone `blocked` and go to **Stop** with reason `REVIEW`. There is only one fix round per milestone.
7. Set the milestone to `done` in its file and in the plan.md table. Commit: `chore(plan): complete <ID>`.
8. If a milestone limit is in effect (see Definitions) and this run has now completed that many milestones, go to **Pause** with reason `LIMIT`. If `--milestone` was given, go to **Pause** with reason `MILESTONE`. If Gates includes `milestone`, go to **Pause** with reason `GATE`, telling the user to review and rerun.
9. Otherwise continue with the next milestone.

## 4. Finish the plan

When every milestone is `done`:

1. Verify the Final verify command in MAIN (see Definitions), if any. On failure, set the plan to `blocked` and go to **Stop**.
2. Set the plan to `complete`. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end COMPLETE plan`: it deletes the active-run marker and appends an `end` line to `<plan dir>/notes/run-log.md`. Then append the run-log lines you have noted (see **After every agent returns**), and write the **run report** (see Definitions). Then `git add "<plan dir>"` and `git commit -m "chore(plan): complete plan"`.
3. Report: milestones and tasks completed in this run, how many ran in parallel, escalations (task and tiers), the commit range for this run, and the path `run-report` printed.

## Failed attempt

An attempt at a serial task failed: its Verify failed, the reviewer returned FAIL and a finding survived validation, the worker reported STUCK or returned no report, RED wasn't confirmed, or the scope check printed paths. 3d gives each failure its description for the failure log: `Verify failed`, `reviewer FAIL: <validated findings>`, `STUCK: <NOTE>`, `no report (turn limit reached)`, `RED not confirmed`, or `scope violation: <paths>`; a second interruption (2c item 3) has `interrupted attempt`. A task in a parallel wave follows 3e item 5 instead, until it leaves the wave; from then on it runs serially and follows this section.

The ladder is `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist`. Each rung gets one attempt plus one resume of the same agent, and a task climbs at most two tiers above its starting tier: three rungs, never past `specialist`. Find the attempt number `<n>` and the task's current tier and rung (see Definitions), then take the first of these that applies:

1. **Resume** when this attempt wasn't itself a resume (the failure log's last entry doesn't say `- Then: resumed`) and isn't a second interruption:
   - For a scope violation, first **discard the attempt** (see Definitions), but in its step 3 give the held report the destination `"<report file>"` instead of `-attempt<n>.md`, so it goes back to the report file itself. For every other failure, leave the tree as the worker left it.
   - Append the **failure-log entry**, with Then `resumed`.
   - Resume the same agent with the SendMessage tool, addressed to the agent ID its dispatch returned, sending exactly:
     ```
     Resume: attempt <n> failed. Fix it and report again.
     Reason: <the description>
     Report: <MAIN>/<report file>
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

The plan left a decision open. **Never retry or escalate a GAP**: a higher tier would just make the decision. In serial mode, **keep the blocked attempt** (see Definitions) with reason `GAP` and the question as its detail, then add the question to plan.md's Open questions tagged with the task ID, then go to **Stop**. Keeping the attempt resets the tree, which would revert an Open question added before it. In parallel mode, 3e item 4 records the task, and 3e item 12 writes the block once the wave's other tasks are integrated and settled: add the question to plan.md's Open questions tagged with the task ID, and mark the task `blocked` with `- Blocked: GAP — <question>; discarded attempt <sha>, kept at refs/orcastrat/discarded/<task ID>-<n>`, with the sha and `<n>` 3e noted when it removed the task's worktree. Then **Stop**.

A `RED: PASSED-EARLY` report on a task with `- Fails first: yes` gets the same handling, with block reason `VACUOUS` instead of `GAP`: the test passed before any implementation existed, so either it can't fail or the behavior already exists, and both mean the plan is wrong. Never retry or escalate it. Block and stop exactly as for a GAP, with reason `VACUOUS`, the worker's NOTE as the detail, and the Open question `Verify passed before implementation: <worker's NOTE>` tagged with the task ID: in serial mode, keep the blocked attempt, then add the Open question to plan.md; in parallel mode, 3e item 12 adds the Open question to plan.md and marks the task `blocked` with `- Blocked: VACUOUS — <worker's NOTE>; discarded attempt <sha>, kept at refs/orcastrat/discarded/<task ID>-<n>`, as for a GAP.

## Pause

A clean, intentional stop, with one of these reasons: `GATE` (a `detail` or `milestone` gate), `MILESTONE` (`--milestone`), or `LIMIT` (the run time, task or milestone limit; see Definitions).

1. If 2c item 6 has written this run's marker, run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end PAUSE <reason>`. It deletes the active-run marker and appends an `end` line to `<plan dir>/notes/run-log.md`. Then append the run-log lines you have noted (see **After every agent returns**), and write the **run report** (see Definitions). A Pause before 2c item 6 (the `detail` gate in 2c item 2) skips this step and leaves any marker alone: it isn't this run's.
2. Commit the pending plan-file changes, that line and the run report included: `git add "<plan dir>"`, then `git commit -m "chore(plan): pause at <where>"`. The main checkout must be clean when you finish, and no task worktrees should remain.
3. Report where the run paused and why, what happens next, and that rerunning `/orcastrat:run <plan dir>` continues from there.

## Stop

A problem the user must resolve.

1. If 2c item 6 has written this run's marker, run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" end STOP <reason>`, with the reason you report in item 3. It deletes the active-run marker and appends an `end` line to `<plan dir>/notes/run-log.md`. Then append the run-log lines you have noted (see **After every agent returns**), and write the **run report** (see Definitions). A Stop before 2c item 6 (a failed preflight check, or a Stop in 2c items 1 to 5) skips this step and leaves any marker alone: it isn't this run's.
2. Plan-file changes (blocked statuses, open questions, a blocked task's report and failure log, that `end` line, and the run report) are committed on their own: `git add <plan dir>` and `git commit -m "chore(plan): blocked at <where>"`. In serial mode, if task code is in the main working tree, leave all of it uncommitted, plan files included, for the user to inspect.
3. Report: where, the reason (GAP, STUCK, SCOPE, VERIFY, REVIEW, VACUOUS, STRAY, PUSHED, SETUP, VALIDATION), the one-line detail, what the user needs to decide or fix, and the path of every worktree left for inspection. For a GAP or VACUOUS, quote the question exactly. For STUCK, say the task most likely needs replanning, not another run. For a blocked attempt kept under `refs/orcastrat/discarded/`, name its ref.
4. Stop. Don't continue with anything else.
