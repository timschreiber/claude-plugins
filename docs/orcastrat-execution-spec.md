# Orcastrat execution changes

Orcastrat is the new name for Orchestratinator (Change 24).

Replaces `orchestratinator-isolation-spec.md` and the draft `orchestratinator-best-practices-spec.md`.

The isolation spec tried to *enforce* worker discipline through Claude Code features we couldn't confirm (`disallowedTools` pattern rules, harness worktrees, `worktree.baseRef`), and its experiments kept turning up new unknowns. This spec uses only mechanisms that are already proven, either in Orcastrat's own runs, in the Superpowers plugin's production use, or as built-in Claude Code behavior. Nothing here needs an experiment first. From the best-practices draft, it keeps the items that meet that bar and don't overlap with the execution changes; the rest are dropped or deferred (§27).

**Goal:** balance time and usage. Serial execution is the proven core. Parallel waves come back, rebuilt from known parts, because finishing faster lets people do more. Both modes get cheaper: fewer wasted attempts, fewer Opus tokens spent on bookkeeping, less repeated context, better questions before planning.

## 1. Ground rules

1. **Known mechanisms only.** Every change uses git operations, Claude Code behavior already observed working in real runs, or documented built-in Claude Code features (such as AskUserQuestion and plugin hooks). If something turns out not to work, the fallback is serial execution or omitting the feature, never an experiment.
2. **The plan format is a contract.** Format changes update every reader, consistent at each milestone boundary.
3. **No design decisions below the plan.** Workers and the orchestrator still stop on GAPs rather than making rulings. The `decider` (Change 12) recommends; only `local` recommendations under `Auto-decide: local` are applied without the user.
4. **Frontmatter is valid YAML.** Quote values containing `: `.
5. **Cost is display-only.** Nothing gates, pauses or stops on spend. Limits exist only for non-progress (Change 3) and opt-in pauses (`LIMIT`).
6. **Shipped runtime is portable.** Everything the plugin ships and runs follows Change 19.

## 2. Change 1: Workers commit their own work

**Why.** Workers kept committing despite every prompt rule. Their project's CLAUDE.md and Claude Code's own commit guidance both push them to. Superpowers makes committing part of the worker's job and has the controller review a commit range. We do the same and stop fighting the harness.

**Workers** (every worker agent from Change 4):

- Commit your changes when the task is done and its Verify passes. Every commit subject starts with the task ID: `M03-T02: <message>`. Multiple commits per task are fine.
- Still never push, switch branches, rebase, reset, stash, or rewrite history. The precedence rule stays, reworded: project instruction files don't govern pushing, branching, or history. Committing your task's changes is expected.
- Remove the "don't commit" rules and the "your work can be lost" warning.

**`run`:**

- **Clean tree required.** `run`'s preflight requires a clean working tree: no uncommitted changes and no untracked files outside `.gitignore`. Failed attempts are cleaned with `git clean -fd`, which would otherwise delete the user's untracked files. A dirty tree stops the run with `SETUP`, listing the files.
- Record `BASE = git rev-parse HEAD` before every dispatch.
- Scope check: `git diff --name-only BASE..HEAD` plus `git status --porcelain` must list only the task's Files, its report file (Change 9), and its failure log (Change 3).
- Verify runs on the resulting tree, as today.
- On success, `run` makes one bookkeeping commit: the plan status update, with subject `chore(plan): <task ID> done` and the `Orcastrat-Task: <task ID>` trailer. Recovery keeps working, because it looks for the trailer. It accepts both `Orcastrat-Task:` and the pre-rename `Orchestratinator-Task:` (Change 24).
- **On a failed attempt,** follow Change 2 and Change 3:
  - **Before a resume** (Change 2), the tree is left as the worker left it, unless the failure was a scope violation.
  - **Before escalating to a fresh worker,** in this order: copy the attempt's report file to `notes/reports/<task-id>-attempt<n>.md`; `git reset --hard BASE` and `git clean -fd`; write the preserved report and the failure-log entry back; commit them with subject `chore(plan): <task ID> attempt <n> failed` and **no** `Orcastrat-Task:` trailer; set `BASE` to the new `HEAD`.
  - Only the success commit carries the trailer, so recovery never mistakes a failed attempt for a finished task.
- **Push check:** after every attempt, confirm no commit in `BASE..HEAD` is on a remote (`git branch -r --contains`). If one is, go to **Stop** with reason `PUSHED`.
- Remove the stray-commit soft-reset guard. Its job is gone.

**Acceptance:** the worker prompts allow commits with the task ID prefix and forbid push, branch, and history changes; `run` verifies `BASE..HEAD`, commits the status with the trailer, and checks for pushes.

## 3. Change 2: Resume before escalating

**Why.** A worker that failed still holds all the context it read. Superpowers resumes the same implementer for early fix rounds and brings in a fresh, more capable one only later. In a real run, Claude Code offered exactly this when a worker hit its turn limit ("SendMessage to task-id to continue").

- On a failed attempt (the triggers in Change 3), `run` first **resumes the same worker once**, sending the failure: the Verify tail, the reviewer's REASONS, or "turn limit reached". Only if that also fails does the task escalate one tier, with a fresh worker.
- Before resuming, reset the tree to `BASE` only if the failure was a scope violation. Otherwise the worker continues from its own work. The reset before escalation is described in Change 1.
- If resuming isn't available (an error from the resume call), fall back to a fresh dispatch at the next tier. Record which happened in the failure log.

**Acceptance:** one resume per rung before escalation, with the fallback.

## 4. Change 3: Runaway guard

These are the decisions already made during the isolation planning (answers 32–46), carried over, plus one added limit:

- **Ladder, capped at three rungs:** one attempt per rung, plus one resume (Change 2), starting at the task's planned Tier and climbing at most two tiers above it (never past `specialist`). If the third rung fails too, the task stops as `Blocked: STUCK`. The stop report says the task most likely needs replanning, not another run: a task no three consecutive tiers can execute is a planning problem, not an execution problem.
- **Failed attempt** (the orchestrator's view): its own Verify fails, the reviewer returns FAIL, the worker reports STUCK or returns no report, or `RED not confirmed` on a `Fails first: yes` task.
- **Worker breaker:** inside one attempt, a worker stops after its 3rd failed Verify run after implementation (the expected red run doesn't count) and reports `BLOCKED` / `STUCK` with `HYPOTHESIS:` and `FIXES TRIED:`, one line each.
- **Failure log:** `notes/<task ID>-failures.md`, one entry per failed attempt (resumes included). Each entry has the attempt, tier, UTC timestamp, description, error (at most the last 40 lines of the Verify log), hypothesis, and fixes tried. `run` appends it; it's committed with the escalation commit (Change 1), the success commit, or the stop commit, and is always in the task's scope while uncommitted.
- **Escalation context:** a fresh worker at the next tier gets `Failures: <path>` in its dispatch and reads the failure log and the preserved reports of earlier attempts (`notes/reports/<task-id>-attempt<n>.md`, Change 1), never the failed transcript. Its agent prompt says: don't repeat the approaches in the failure log; if they show the Steps can't be followed as written, report a GAP instead of improvising.
- **Limits:** header fields `Max run time: none | <n>m | <n>h`, `Max tasks: none | <n>`, and `Max milestones: none | <n>`, plus the flags `--max-run-time`, `--max-tasks` and `--max-milestones`. The flag beats the header field. Time and task limits are checked before each serial task or parallel batch; the milestone limit after each milestone completes, including its milestone review. Hitting one is a **Pause** with reason `LIMIT`, never a Stop. `Max milestones: 1` gives a natural point to `/clear` between milestones.
- **`status`** gains a `Failures:` line.
- **Leftover background work:** after every agent returns, if its completion notice reports background work still running, `run` stops it with the Stop Task tool. If that fails, `run` records a warning line in `notes/run-log.md` naming the agent and quoting the notice, and continues. `run` never kills processes by PID. The run report counts these warnings (Change 11).
- **Resuming an exhausted task:** unchanged. You fix the problem, set the task back to `todo`, and rerun.

**Acceptance:** the ladder cap, breaker, failure log, escalation context, and the three limits behave as described.

## 5. Change 4: The worker tiers

Six worker agents, five plan tiers:

| Plan tier | Agent | Model / effort | Use for | `maxTurns` |
|---|---|---|---|---|
| `worker-mini` | `worker-mini-serial` | Haiku (no effort setting) | Transcription: Steps contain the literal final content | 50 |
| | `worker-mini-parallel` | Sonnet / low | The same tasks, when they run in a parallel wave | 50 |
| `worker-light` | `worker-light` | Sonnet / medium | **The default.** Fully specified work: names, signatures, behavior, and tests all in the Steps | 50 |
| `worker` | `worker` | Sonnet / high | Fully specified but intricate: numeric or geometric code, parsers, state machines, concurrency | 60 |
| `worker-heavy` | `worker-heavy` | Opus / medium | Bounded judgment the plan can't pin down: unfamiliar library internals, debugging a known failure | 80 |
| `specialist` | `specialist` | Opus / high | The hardest bounded implementation. Rare by design | 80 |

**`worker-mini` picks its agent by mode.** The plan says `worker-mini`. In serial execution, `run` dispatches `worker-mini-serial` (Haiku); in a parallel wave, `worker-mini-parallel` (Sonnet, low effort). Haiku's problems were committing (now the worker's job, per Change 1) and writing outside its worktree in parallel waves, and serial execution has no worktree to leave.

**Ladder:** `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist`, capped at three rungs per task (Change 3). A resume always goes to the same agent that made the attempt.

**Existing plans read the new meanings.** The tier names `worker-light`, `worker`, and `worker-heavy` already appear in written plans, and each now means one step up the ladder, so those tasks get a stronger model. That's accepted: no mapping and no format change. Only one existing plan is affected, and the higher cost for it is fine.

**Tier rubric (plan format), rewritten:**

- `worker-mini` only when Steps contain the literal final content.
- `worker-light` as the default.
- `worker` for intricate fully specified work.
- `worker-heavy` and `specialist` each need a Why this tier line.
- If more than about one task in ten is `worker-heavy` or `specialist`, the milestone is under-specified.
- Plan the tier where the task is expected to succeed. With a three-rung cap, starting too low wastes the rungs a task might need.

**Files:**

- Add `worker-mini-serial.md` and `worker-mini-parallel.md`.
- Update the four existing worker agents' models, efforts, and turn limits to the table.
- Update every place that names a worker tier: `run`, `plan`, `planner`, `plan-reviewer`, `milestone-reviewer`, `status` and `status-reader` (Change 20), the plan format, and the README cast table.
- A worker that returns no report counts as a failed attempt (Change 3).

## 6. Change 5: Parallel waves, rebuilt from known parts

**Why.** Parallel runs save wall-clock time, so users get more done. Every piece below has worked in real runs; what failed before was workers committing to the main checkout, which Change 1 turns into ordinary work inside the worktree.

**Mechanism:**

1. **Worktrees:** `git worktree add -b <task branch> <path> BASE` under `$(git rev-parse --git-common-dir)/orcastrat/<plan-slug>/worktrees/`, created by `run`, as today. Worktree setup runs there before dispatch, as today.
2. **Workers** work and commit inside their worktree. The dispatch includes `Worktree: <path>`, with the existing "cd into it for every command" rules.
3. **Per task**, `run` checks the task branch in its worktree: scope, Verify, and the push check.
4. **Integration:** in task order, `git cherry-pick BASE..<task branch>` onto the plan branch, which supports multi-commit tasks.
5. **Conflicts:** if a cherry-pick conflicts, dispatch a new **`merger`** agent (Sonnet, high effort, read and edit, never git history). It gets both task blocks (the Objective, Steps, and Interfaces of the task being merged and of each already-merged task touching the same files) and the conflicted files. It may edit only the conflicted files. Then `run` continues the cherry-pick and re-verifies.
   - If the merger reports it can't resolve the conflict, or the re-verify fails: abort the cherry-pick, discard that task's branch, and **rerun the task serially** on top of the integrated result, at the tier that succeeded in the worktree. It doesn't count as a failed attempt, and doesn't stop the run.
6. **Combined re-verify** after each wave, as today.
7. **Containment check:** after each worker returns, the main checkout must still be clean and on the plan branch. If a worker wrote outside its worktree:
   - reset the main checkout to the wave's starting commit and clean it;
   - discard the wave's worktrees;
   - rerun the wave's tasks serially;
   - switch the rest of this run to serial mode, reporting it in one line;
   - no Stop.
8. **Cleanup** of integrated tasks, as today.

**Defaults, balancing time and usage:**

- `Parallel: auto`, with `Max parallel: 2` as the new default. Two concurrent workers roughly halves the wall-clock time of wide waves, while keeping setup, re-verify, and machine load modest. Users raise it for more speed.
- Waves with only tiny tasks should be batched by the planner (the robustness spec's batching) rather than parallelized. The plan format says so.

**Acceptance:** parallel waves use the steps above; conflicts go through `merger` with the serial-rerun fallback; a containment failure downgrades the run to serial without stopping it; the defaults are updated.

## 7. Change 6: Bookkeeping scripts

**Why.** The orchestrator runs on Opus. Superpowers does its mechanical bookkeeping in small scripts, keeping the controller's tokens for coordination.

Add bash scripts under `plugins/orcastrat/scripts/`, written to Change 19's rules. Each prints a short, fixed-format result:

- `scope-check <base> <files...>`: prints `OK`, or the out-of-scope paths.
- `push-check <base>`: prints `OK`, or the commits found on a remote.
- `verify <dir> <command>`: runs the command with `bash -c` in `<dir>`, writing the full log under `$(git rev-parse --git-common-dir)/orcastrat/<plan-slug>/logs/`, so logs never dirty the tree or trip the scope check; prints `exit=<n>` and, on failure, the last 40 lines. `run` reads only this output, never the log itself.
- `integrate <task-branch> <base>`: runs the cherry-pick range; prints `OK`, or `CONFLICT` plus the conflicted files.
- `recover <plan-dir>`: lists `todo` tasks whose trailer (`Orcastrat-Task:`, or the pre-rename `Orchestratinator-Task:`) is already in history, and tasks with worker commits (subject prefix `<task ID>:`) after the last trailer commit but no trailer of their own. Those are interrupted attempts: `run` treats them as failed attempts at their recorded tier and handles them per Change 1.
- `task-brief <plan-dir> <task-id>`: Change 7.
- `run-report <plan-dir>`: Change 11.
- The Stop hook script: Change 8.

`run` calls these through `${CLAUDE_PLUGIN_ROOT}/scripts/` instead of reasoning through the git steps itself. Each script gets bash tests (Change 19).

**Acceptance:** the scripts exist, `run` uses them for these steps, and their tests pass in CI.

## 8. Change 7: Task briefs

**Why.** Every worker currently reads its whole milestone file to find its one task. In a 25-task milestone, that file gets read 25 times. Superpowers extracts each task into its own brief with a small script.

- A new script, `task-brief <plan-dir> <task-id>`, writes one file containing: `plan.md`'s Decisions, the milestone's Context (including its Conventions block, Change 17), and the task block (fields, Objective, Read first, Interfaces, Steps, Done when). The file goes in `$(git rev-parse --git-common-dir)/orcastrat/<plan-slug>/briefs/<task-id>.md`, inside `.git`, so it never dirties the tree and is readable from any worktree.
- `run` generates the brief before each dispatch, and the dispatch names it: `Brief: <path>`.
- Workers and the per-task `reviewer` read the brief **instead of** `plan.md` and the milestone file. They still re-read CLAUDE.md and AGENTS.md first, and still read everything in the task's Read first list, which always includes the spec sections the task implements.
- Resumes and retries reuse the same brief, unless `plan.md`'s Decisions changed since it was generated (for example, an auto-decided GAP, Change 12). Then `run` regenerates it before the retry.
- The orchestrator likewise reads only the header fields and the current task's block from plan files, except for a full read of `plan.md` at start and when the Stop hook sends it back (Change 8).

**Acceptance:** the script exists with tests; workers and the reviewer read the brief rather than plan files; the dispatch format includes `Brief:`.

## 9. Change 8: Keep a run going (Stop hook)

**Why.** An unattended run fails silently if the orchestrator ends its turn mid-run: asking a question it shouldn't, summarizing when it should dispatch, or losing its place after compaction. The official `ralph-loop` plugin uses a Stop hook (a bash script, which on Windows requires Git for Windows) to catch Claude ending its turn and send it back to work. That mechanism is proven.

- **Marker:** at the end of preflight, after the toolchain check (Change 19), the instruction-file check (Change 16), the model check (Change 20) and "Proceed?", `run` writes `$(git rev-parse --git-dir)/orcastrat/active-run`, containing the plan directory, a start timestamp, and a heartbeat. The per-checkout git dir (not the common dir) scopes the marker to one checkout, so sessions working in other worktrees of the same repository are never affected. `run` deletes the marker at every **Pause**, every **Stop**, and on completion.
- **Heartbeat:** `run` updates the marker's heartbeat on every dispatch, every returned agent, and every commit. The heartbeat, not the start time, is what the loop guard and stale detection use, so a long wave of workers running in parallel never looks like a stuck run.
- **Hook:** the plugin ships a `Stop` hook (`hooks/hooks.json` plus a bash script, invoked as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/<script>"` with the path quoted). The script locates the marker from `$CLAUDE_PROJECT_DIR`, not from the session's current directory, which can change. When Claude tries to end its turn, the hook:
  1. does nothing if no marker exists for this checkout;
  2. otherwise blocks the stop, with the reason `An Orcastrat run is in progress for <plan dir>. Re-read plan.md and the current milestone file, then continue the run from where the files say it is. If you meant to pause or stop, follow run's Pause or Stop section, which removes the marker.`
- **Compaction:** the block reason's re-read instruction is also the recovery path after auto-compaction. No separate compaction hook is needed.
- **Loop guard:** the hook counts consecutive blocks in the marker file and resets the count whenever the heartbeat has advanced since the last block. After 3 consecutive blocks with no heartbeat change, it allows the stop, deletes the marker, and leaves a note in the marker's place that says why. A run that's truly stuck ends instead of spinning.
- **Fast exit when idle:** the hook runs on every turn of every session where the plugin is enabled, so it checks for the marker first, using only `$CLAUDE_PROJECT_DIR` and a file test, and exits 0 immediately when there is none, before reading stdin or running git. (`ralph-loop` had a reported bug where reading stdin first delayed every response, even with no loop active.)
- **Fails open:** any error in the hook script (missing git, unreadable marker, unparseable input) allows the stop. A broken hook must never trap a session.
- **Preflight:** a marker whose heartbeat is more than an hour old is from a crashed session. It is removed, with a one-line mention.
- **Limit:** one active run per checkout. `run`'s preflight stops if this checkout's marker has a heartbeat less than an hour old, and says so. Runs in different worktrees of the same repository are independent.

**Acceptance:** the hook, its script with tests (including the fast exit with no marker), marker and heartbeat handling in `run`, the loop guard, fail-open behavior, and README notes on one run per checkout.

## 10. Change 9: Report files and "done with concerns"

**Why.** A worker's one-line claim that tests went red then green is weak evidence. Superpowers has implementers write a full report file with the actual test output, and return only a few lines. The same discipline keeps the orchestrator's own context small.

- **Report file:** every worker writes `plans/<slug>/notes/reports/<task-id>.md`. It covers what was implemented; files changed; RED evidence (the command, and the relevant failing output before implementation); GREEN evidence (the command, and the passing output); a self-review; and concerns. Resumes append to the same file.
- The report path is always in scope for the task, and `run` includes it in the status commit.
- **The reply stays short:** the status block plus the report path, at most 10 lines.
- **New status `DONE_WITH_CONCERNS`:** the work is done, but the worker has doubts about correctness or scope. `run` treats it like `DONE`, then also dispatches the `reviewer` with the concerns before accepting the task, even if Verify is only a command. A reviewer FAIL is a failed attempt (Change 3).
- **Fails first:** `RED: CONFIRMED` is accepted only if the report contains the RED evidence. If it's missing, the attempt fails with `RED not confirmed`.
- The failure log and resume messages point to the report file, so the next attempt can read what was tried.
- **Other agents follow the same shape.** Scouts, the planner, reviewers, the `merger` and the `decider` write anything long to a file under `plans/<slug>/notes/` and reply with a status block and the path, at most 20 lines. Reviewers' replies contain only the counts and the blocking findings (Change 10).
- **Notes are committed before the next dispatch.** Any notes file an agent or `run` wrote (reviews, surveys, decisions, suggestions) goes into `run`'s next bookkeeping commit, before the next task is dispatched, so the tree is clean for the next scope check and for parallel containment checks.

**Acceptance:** the report format is in the worker prompts; `DONE_WITH_CONCERNS` is handled in `run`; the RED evidence check is in place; other agents' replies respect the cap.

## 11. Change 10: Confidence-scored, independently validated review findings

**Why.** Every blocking finding from a review triggers a fix round or a failed attempt, so false positives cost real money. The `code-review` plugin in Anthropic's official marketplace has a separate agent score each issue from 0 to 100 against a fixed rubric and drops those below 80. (The newer version in the `claude-code` repository has since replaced numeric scores with per-issue validation agents.) A reviewer asked to find gaps also tends to report some even when the work is sound, and a reviewer scoring its own findings tends to be confident in them. So findings are scored against an anchored rubric, and any finding that would block is checked by a separate agent first.

**Rubric.** One rubric, defined once in the plugin and included in the agent file of every agent that scores findings (Change 21). The anchors, in Orcastrat's own words:

- **0:** a false positive. It doesn't survive a close look, or the problem existed before this work.
- **25:** possibly real, but unverified. For a style point, one no instruction file calls for.
- **50:** verified as real, but minor, rare in practice, or unimportant relative to the rest of the change.
- **75:** verified and likely to be hit in practice; it affects behavior, or it breaks a rule an instruction file states explicitly.
- **100:** certain. The evidence directly confirms it, and it will be hit.

**Reviewers** (`reviewer`, `milestone-reviewer`, `plan-reviewer`):

- Score every finding with the rubric and give it a short category tag (for example `nullable`, `naming`, `test-pattern`, `scope`), used by Change 18.
- A finding is a **blocking candidate** only if its score is 80 or higher, it cites `path:line` (or the plan section), and it falls in a blocking category:
  - **Work reviewers:** violates a Done when; a Coverage item not implemented; breaks a declared Interface (Consumes or Produces); a correctness bug with a concrete failing scenario; changes outside the task's or milestone's Files, or outside the plan's Out of scope (Change 14).
  - **Plan-reviewer:** a task that needs a design decision to execute; a Coverage gap; Wave interference; a Verify that can't fail first; a Verify that violates Change 13.
- Everything else is **advisory**.
- Reviewer inputs are the diff or detailed milestone plus the criteria (brief or task and milestone fields, Coverage, Interfaces, Out of scope), never worker transcripts.

**Independent validation.** A new agent, **`validator`** (Sonnet, medium effort, read-only, `maxTurns: 20`), checks every blocking candidate before it has any effect:

- `run` dispatches one `validator` per blocking candidate, in parallel. (`plan` does the same for plan-reviewer findings during planning.) Its input is the finding (the claim, the citation, the scenario or rule), the diff or plan section, the same criteria the reviewer had, and the paths of any instruction file the finding cites. It is **not** given the reviewer's score, so it can't anchor on it.
- The validator scores the finding with the same rubric, and for a finding that cites an instruction file, confirms that the file actually states that rule. It replies with its score and a one-line reason (at most 5 lines).
- **The finding blocks only if the validator also scores it 80 or higher.** Otherwise it's downgraded to advisory, with both scores recorded.
- Only validated findings trigger a fix round, a reviewer FAIL (a failed attempt, Change 3), or plan-review handling (including D42). The per-task `reviewer`'s FAIL becomes final only after validation; if no candidate survives, the task passes.

**Advisory findings** are recorded in the review's notes file with their scores and categories, counted in the run report, and never acted on automatically.

**Acceptance:** all three reviewers score with the rubric and tag categories; blocking candidates meet the score, citation and category rules; each candidate is validated by a `validator` that doesn't see the reviewer's score; only findings the validator also scores 80+ have any effect; a style-only finding never triggers a fix round; a planted false positive with a high reviewer score is downgraded by the validator.

## 12. Change 11: Run report

**Why.** Tuning needs numbers: which tiers escalate, how often runs resume, merge, or stop, and why.

- A new script, `run-report <plan-dir>`, builds `plans/<slug>/notes/run-report.md` from what's already recorded: task statuses, `Orcastrat-Task:` trailers, failure logs, escalation lines, merge and containment notes, review notes, and Pause or Stop records.
- It reports, per run invocation and for the plan so far:
  - tasks done;
  - attempts, resumes, and escalations per tier;
  - tasks that ended STUCK;
  - merges resolved and reruns after failed merges;
  - containment downgrades;
  - auto-decided questions, each with its Decision (Change 12);
  - advisory findings per milestone, and blocking candidates confirmed or downgraded by the `validator` (Change 10);
  - leftover-background-work warnings (Change 3);
  - stops and pauses by reason;
  - wall-clock time.
- Usage and cost are included only where Claude Code reports them to the orchestrator. Otherwise that section says "not available". They are display only (ground rule 5).
- `run` runs it at every Pause, Stop, and completion, and commits the report with the pause or stop commit.

**Acceptance:** the script with tests; `run` calls it at each end state.

## 13. Change 12: The decider (runs only)

**Why.** A GAP mid-run stops an unattended run until someone answers. Most GAPs have a clear best answer that Opus, reading the sources and code, can recommend. The orchestrator can't be trusted to make that call: `run` inherits the session's effort level, and orchestrating is a different job. So deciding goes to a dedicated agent.

**New agent `decider`** (Opus, high effort, `maxTurns: 40`). It's read-only, except for its one output file.

- **Input:** the plan directory, the question (with the task or milestone it came from), and an output path, `notes/decisions/<question-id>.md`.
- **It reads:** the question, the sources and `plan.md`'s Decisions, the milestone's Context, and the relevant code.
- **It returns:**
  - a recommendation with a one-line reason, or `no recommendation`;
  - a label: `local` (confined to one milestone's implementation, and easy to reverse) or `stop` (crosses milestones, or touches interfaces other milestones consume, data formats, public APIs, security, or licensing).

  It writes its full reasoning to the output file and replies with just a status block.
- **It answers only the question asked.** It never revises tasks, changes the plan's structure, or chains decisions. If answering needs another decision first, the answer is `no recommendation`.

**When `run` uses it:** for every GAP during a run, whether from a worker or from the planner.

- **`Auto-decide: local`** (plan header field, or `--auto-decide` on `run`): a `local` recommendation is recorded in `plan.md`'s Decisions with the source `auto-decided (<question-id>)`, and the run continues:
  - for a worker's GAP, the tree is reset to `BASE` (as before an escalation, Change 1, but without a failure-log entry), the brief is regenerated (Change 7), and the task is retried with a fresh worker at the same tier. It doesn't count as a failed attempt;
  - for the planner's GAP, the planner is invoked again.

  A `stop` label or `no recommendation` stops the run as a GAP, as today.
- **`Auto-decide: off`** (the default): the decider still runs, and the stop report includes its recommendation and label. Every question you're asked mid-run comes with a recommendation.
- **Limit:** `Max auto-decisions: <n>` (header field, default 5) per run invocation. When the limit is reached, the run **pauses** with reason `LIMIT` (auto-decisions), since that many automatic decisions means the plan was under-specified.
- **Visible:** auto-decided items get their own section in the run report (Change 11).

**Planning questions are always answered by the user.** See Change 14.

**Acceptance:** the agent exists; `run` dispatches it on every GAP; auto-decide and its limit work as described.

## 14. Change 13: Targeted Verify per task

**Why.** A task whose Verify is the whole-repo suite (for example, the MPRUVD_PDF plan's `verify.ps1` on every task) is slow and noisy, and it makes every fix cycle, resume and escalation expensive.

1. **Planning rule** (in `plan` and `planner`): a task's Verify is the narrowest command that fails before the task and passes after it. Typically that's a build of the affected project plus a test filter for the task's tests (for example, `dotnet test <project> --filter "FullyQualifiedName~<TestClass>"`).
2. The whole suite or a repo-wide verify script is not allowed as a task Verify. It belongs in Milestone verify and Final verify.
3. **Exception:** a task whose Files include shared build configuration (solution, project, package manifest, build scripts) may use a full build, still with targeted tests. The task states this in its Verify line with a short `# build config` comment.
4. **Plan-reviewer check (blocking, Change 10):** a task Verify equal to the Milestone verify or Final verify, or invoking a repo-wide verify script, without the exception comment.
5. **Existing plans:** applies to milestones detailed after this change. Already-detailed milestones are not rewritten.

**Acceptance:** a plan detailed after the change has no task Verify matching Milestone or Final verify, and the plan-reviewer flags an injected violation as blocking.

## 15. Change 14: Planning questions: interview, completeness, and tighter rounds

**Why.** A question answered before planning is the cheapest correction there is. The same gap found later costs a plan-review fix, a re-detail, a GAP stop, or a worker guessing and climbing the ladder. The current question audit finds gaps in the sources as written, but doesn't dig into what hasn't been considered yet, and its answers live only in `plan.md` Decisions, so the spec goes stale.

**Sequence in `plan`:**

1. Toolchain check (Change 19), instruction-file check (Change 16) and model check (Change 20).
2. Read the sources and survey the repo (existing behavior).
3. Size the job.
4. Interview phase.
5. Write the answers back into the spec.
6. Question audit.
7. Write back again.
8. Planning.

**Interview phase:**

- **Scaling:** on the ≤5-task direct path, ask only questions that would change the approach, and skip the phase when there are none. Larger jobs get the full interview. `--skip-interview` skips the phase entirely; the question audit still runs.
- **Coverage areas:** technical approach and interfaces; edge cases and failure modes; UI/UX, where there is one; data, migration and compatibility; security and operability; tradeoffs and concerns; non-goals; the end-to-end proof.
- Rounds continue until no material question remains, or the user says to move on.
- The question audit (insufficient information, ambiguity, contradiction, assumption) then runs on the updated spec and never re-asks anything the interview settled.

**Completeness checks** (asked in the interview when it runs, otherwise in the audit):

- **Out of scope:** the sources state no non-goals. Recommend a list inferred from the sources.
- **End-to-end proof:** the sources state no end-to-end verification. Recommend a concrete command or scenario.
- Answers become Decisions. `plan.md` gains an `## Out of scope` section after Coverage, which reviewers use (Change 10). The end-to-end answer becomes, or is appended to, the header's Final verify.
- Skip a check when the sources already answer it, recording the quoted passage in Decisions.

**Question rules** (both phases):

- **Format:** one message per round; numbered questions; the quoted passage (or "not stated"); options; a recommendation. Replies must be answerable as a single pasted block. Don't use the AskUserQuestion UI for question rounds; real runs found pasted answers work better. Define the format once in `plan`.
- **No answerable questions:** check the sources and the repo survey first. A question whose answer is found is not asked; the finding is recorded as a Decision with its quote or `path:line`.
- **No obvious questions.** Contradictions between the spec and the repo are always asked, quoting both.
- **Order:** questions that change structure (scope, interfaces, milestones) first, then behavior details, then minor ones.
- **Always answered by the user.** `plan` can run unattended while it reads, scouts, and drafts, but it never auto-decides and never uses the `decider`. When it has questions, it presents them and waits for the user's answers before writing the plan. Its `--yes` flag only skips the "Proceed?" prompt for a small job done directly, after its questions have been answered; it never skips questions.

**Write-back:**

- Answers go into the primary spec file: the single Markdown source file, or the one the user names when there are several. Inline input saved verbatim under `sources/` is never edited. With no file source, answers live only in `plan.md` Decisions.
- Answers are integrated into the relevant spec sections, not appended as a Q&A log. Each answer adds or updates an entry in the spec's final "Decisions made in this spec" section. The spec gains Out of scope and an end-to-end step if they were missing. No requirement the user wrote is removed unless an answer says to.
- `plan` shows a short summary of the spec changes. The spec edits are handled the same way `plan` handles its plan files.
- `plan.md` Decisions still records every answer, each citing the spec section it changed. The spec is authoritative if they ever disagree.
- The planner, scouts and reviewers read the updated spec when detailing later milestones.
- `plan` makes no design decisions of its own. Every substantive spec change traces to an answer.

**Fresh session:** `plan` ends by recommending `/clear` or a new session before `run`.

**Acceptance:** on a multi-milestone spec with a planted gap, a planted spec/repo contradiction, and a question the repo answers, the interview asks about the gap and the contradiction but not the answered question; the audit doesn't repeat them; the spec file contains the answers in its sections, with Decisions entries, Out of scope and an end-to-end step; `plan.md` Decisions cite the spec sections. A ≤5-task job with no approach-changing questions skips the interview; `--skip-interview` skips it; inline input is never modified.

## 16. Change 15: Batch pilot

**Why.** A flawed batch template gets multiplied across every task in the batch before the flaw shows.

1. For tasks sharing a `Batch` value, the first task in task order is the pilot. It runs alone, even in parallel mode, before any other member of that batch is dispatched.
2. **Pilot passes on its planned tier** (a resume at that tier counts as passing on it): release the rest of the batch normally.
3. **Pilot passes only after escalation:** raise every remaining member of that batch to the tier that passed. This is mechanical, not a design decision. Record it in the milestone file as a Decision (`Batch <id> re-tiered to <tier> after pilot <task id>`), then release.
4. **Pilot ends STUCK:** the run stops with `STUCK` as usual.
5. Tasks in other batches or with no batch are unaffected, and can share the pilot's wave if they don't interfere.

**Acceptance:** a batch of three whose pilot fails on `worker-mini` and passes on `worker-light` runs the other two on `worker-light`, with the Decision recorded.

## 17. Change 16: Instruction-file check

**Why.** Workers re-read CLAUDE.md on every task, and that content can't be shared from cache, so each task pays for every line. The best-practices guidance is to keep CLAUDE.md lean, because bloated files cause rules to be ignored. Instruction files can also carry rules that work against Orcastrat.

1. **When:** on every `/orcastrat:plan` and `/orcastrat:run`, right after the toolchain check (Change 19), before any survey, question or "Proceed?", and before `run` writes its marker (Change 8).
2. **What is checked:** every project instruction file Claude Code loads: root and nested CLAUDE.md files, CLAUDE.local.md, AGENTS.md, and files pulled in by `@` imports, resolved recursively. The implementing agent confirms the list against the docs' *CLAUDE.md files* page. The user-level `~/.claude/CLAUDE.md` is reported separately, as information only.
3. **Findings**, each citing `path:line`:
   - **Leanness**, each with an action:

     | Finding | Action |
     |---|---|
     | File trees, file-by-file descriptions, content Claude can derive from code | Run `/doctor`, which proposes these cuts. The check flags the location and does not repeat `/doctor`'s analysis. |
     | Detailed API reference | Replace with a link to the docs. |
     | Knowledge relevant only sometimes | Move to a skill (loaded on demand). |
     | A rule that must hold every time | Convert to a hook. |
     | Standard conventions, self-evident advice | Delete. |
     | Emphasis (`IMPORTANT`, caps) on many lines | Keep it on the one rule Claude actually skips. |
     | Content moved into `@` imports | Imports load too. Move it to a skill instead. |

   - **Conflicts:** rules that work against Orcastrat, such as pushing, switching branches or rewriting history (Change 1), "run the whole suite" after every change (Change 13), or skipping tests or verification. Committing is no longer a conflict. Action: remove, or scope to work outside Orcastrat runs.
4. **Threshold:** criteria only by default. An optional header field, `Instructions max lines: <n>`, adds a size finding when the total loaded line count exceeds it.
5. **Outputs**, in `$(git rev-parse --git-common-dir)/orcastrat/instructions/` (inside `.git`, like the briefs, so they never dirty the tree):
   - `review.md`: the findings with actions, then the general checks: `/doctor` for derivable content, `/context` to confirm what actually loaded, and the guidance's test for each line, "Would removing this cause Claude to make mistakes?"
   - `fix-prompt.md`: a paste-ready Claude Code prompt that performs the cleanup. It spells out in full: re-read CLAUDE.md, AGENTS.md and the review file; produce a plan with a detailed task list where each task needs no new reasoning or design decisions and is small and mechanical enough for Sonnet; then execute.
   - `ack`: the list of loaded files, a hash of their content (`git hash-object`), the findings summary, and the choice made.
6. **Prompt (interactive only):** when there are findings and the current hash isn't acknowledged, show a summary (finding counts by class, then each finding with its action, capped at about 10 lines, with the rest in the review) and the review's path, then ask through AskUserQuestion:
   - **Stop and fix it:** exit before anything starts. No plan files, no marker, no stop reason. Point to the fix prompt and `/doctor`.
   - **Continue:** record the acknowledgement for this hash and proceed.
7. **Don't nag:** an acknowledged hash with unchanged findings produces no prompt. Conflicts are still shown as one line on every invoke. A changed file or new findings prompts again.
8. **Unattended:** under `--yes`, never prompt. Write the review and fix prompt, show the one-line summary, and continue.
9. **Cost split:** `plan` does the full review. `run` finds the instruction files again (a quick file search for CLAUDE.md, CLAUDE.local.md and AGENTS.md, plus the imports recorded in `ack`), hashes them with `git hash-object`, and compares against `ack`. If the list and hash are unchanged, it shows only the conflicts line (if any). Otherwise it does the full review.
10. **No edits:** Orcastrat never edits instruction files.

**Acceptance:** a repo with a file tree, an API reference, an `@` import and a push rule produces findings with the matching actions and `path:line`, a review, a fix prompt with the standard prompt rules, and the prompt; Continue then `run` produces only the conflicts line; editing CLAUDE.md prompts again; `--yes` never prompts; nothing appears in `git status`.

## 18. Change 17: Conventions excerpt per milestone

1. When instruction files exist, the planner adds a `Conventions` block to each milestone's Context, quoting only the rules that apply to that milestone's tasks, each as a short quote with `path:line`. Task briefs carry it (Change 7).
2. Workers still read the full instruction files. The excerpt keeps the relevant rules salient.
3. **Plan-reviewer check (advisory):** a milestone whose tasks touch areas covered by instruction-file rules, but whose Conventions block is missing or omits them.

**Acceptance:** a milestone touching tests quotes the test-convention rules from CLAUDE.md with correct line references, and the brief contains them.

## 19. Change 18: Recurring findings suggest a rule or hook

1. When a finding category (Change 10) appears in the reviews of two or more milestones in a plan, the milestone-end step in `run` adds a suggestion:
   - a CLAUDE.md rule, with draft wording; or
   - a hook, when the rule must hold every time and can be checked by a script.
2. Suggestions are appended to `plans/<slug>/notes/instruction-suggestions.md` and listed in the run report. They are never applied.
3. A suggestion that would add to an instruction file already flagged for leanness (Change 16) says so, and prefers a hook or skill.

**Acceptance:** the same category in two milestone reviews produces one suggestion with draft wording.

## 20. Change 19: Portable runtime

**Why.** Anything that runs on a user's machine must work on Windows, macOS and Linux. PowerShell 7 isn't installed by default on macOS or Linux. On native Windows, Git for Windows is now optional for Claude Code itself: without it, Claude Code runs commands through its PowerShell tool, and command hooks fall back to PowerShell. So bash is **not** guaranteed on Windows unless Git for Windows is installed. Bash plus `git` covers every platform, given Git for Windows on native Windows.

**Rule:**

- Everything the plugin ships and executes at runtime (the Change 6 scripts, the Change 8 hook, and any command embedded in skills or agents) uses only bash, `git`, and standard utilities (`grep`, `sed`, `awk`, `tail`, `head`, `date`, `mkdir`, `rm`, `cat`).
- Bash must be **3.2-compatible**, since that's the macOS default: no associative arrays, `mapfile`, `${var,,}`, or other bash-4 features.
- Not allowed at runtime: `pwsh` or `powershell`, `jq`, Node, Python, or any other interpreter. JSON fields a script needs are extracted with `sed` or `grep`.
- Where the orchestrator or an agent can do a step through the platform's shell tool, prefer that over a new script.

**Changes:**

1. **Inventory:** list every script and embedded command under `plugins/orcastrat/`, including any command lines in `SKILL.md` and agent files that invoke `pwsh`, `powershell` or a `.ps1`. Classify each as runtime or dev tooling, and record the inventory in the CHANGELOG entry.
2. **Replace runtime PowerShell:** reimplement each runtime item in bash, or move the step into skill or agent instructions; delete the `.ps1`; update every reference (hooks, skills, agents, README, docs, CHANGELOG). When done, `plugins/orcastrat/` contains no `.ps1` file and no runtime reference to `pwsh` or `powershell`.
3. **Shell-neutral instructions:** skill and agent text describes commands by intent or in bash form, and doesn't assume a particular shell tool. Commands that skills and agents tell Claude to run are single-line calls to a script or to `git`, with no `$(...)` command substitution and no multi-line bash. Paths like `$(git rev-parse --git-dir)/…` in this spec describe what the scripts resolve internally. (`ralph-loop`'s command file was reported broken by Claude Code's permission check on multi-line bash and command substitution.)
4. **Verify commands** run with `bash -c` (through `verify`). The planner writes them to run from bash. A project whose tooling is PowerShell invokes it explicitly (for example `pwsh -NoProfile -File scripts/verify.ps1`); that is the project's own dependency. The plan-reviewer flags a Verify that relies on non-bash syntax (advisory).
5. **Hooks** are always invoked as `bash "${CLAUDE_PLUGIN_ROOT}/…"`, with the path quoted. Hook scripts normalize Windows paths from their JSON input (unescape `\\`; use `cygpath -u` when present) and fail open.
6. **Preflight toolchain check:** the first preflight step on every `plan` and `run`, on every platform, before the instruction-file check (Change 16):
   - **How it runs:** the skill runs these commands directly through whatever shell tool the platform provides (the PowerShell tool on Windows without Git Bash). It is never a shipped script, because it has to work when bash is missing.
   - **bash:** `bash --version` runs and reports 3.2 or later.
   - **git:** `git --version` runs and reports 2.17 or later, the oldest version with `git worktree remove`, which parallel-wave cleanup needs. (`git worktree add` and `--git-common-dir` date from 2.5.)
   - **Repository:** the current directory is inside a git work tree (`git rev-parse --is-inside-work-tree`), not a bare repository.
   - **Commit identity:** `git config user.name` and `git config user.email` both resolve. Workers commit (Change 1), so a missing identity would fail every task.
   - **Clean tree (`run` only):** see Change 1.
   - **On failure:** `run` stops with reason `SETUP`, and `plan` exits before surveying, since both depend on git. Exception: a missing or old bash only warns in `plan`, which doesn't run the scripts. Nothing is created in either case.
   - **The message** lists every failed item at once, with the fix for the platform: Git for Windows on native Windows (it provides both bash and git); the system package manager elsewhere (minimal Alpine-based containers, for example, ship `sh` without `bash`); `git init` for a directory that isn't a repository; and the `git config` commands for the identity.
7. **Tests:** bash tests (bats-core) for every shipped script, piping fixture inputs (including Windows-style escaped paths and fixture repos) and asserting output, exit code and files written. No test runs Claude Code.
8. **CI matrix:** a GitHub Actions workflow on `ubuntu-latest`, `macos-latest` and `windows-latest` (Git Bash) on every push and pull request: `shellcheck` on shipped scripts; the bats tests on all three; and a check that `plugins/orcastrat/` contains no `.ps1` and no runtime `pwsh` or `powershell` reference.
9. **Dev tooling stays PowerShell.** `Validate-All.ps1` and the other repo scripts run only when developing the plugin in `timschreiber/claude-plugins`, never while a plugin user works in their own repo. They live outside `plugins/orcastrat/`, so they aren't part of the installed plugin, and nothing the plugin ships may invoke them. `Validate-All.ps1` gains the same no-`.ps1`-in-plugin check, so the local gate matches CI.
10. **README:** the prerequisites and the toolchain check are documented in the README's Prerequisites section (Change 23).

**Acceptance:** no `.ps1` and no runtime `pwsh` reference in the plugin; CI green on all three OSes; `shellcheck` clean; inventory recorded.

## 21. Change 20: Skill model pins and `status` delegation

**Why.** Claude Code caches each request by exact prefix, and each model has its own cache. When a skill's frontmatter names a model other than the session's, that turn is a model switch: the whole conversation is re-read with no cache hits, and the session model resumes on the next prompt. `/orcastrat:status` is a skill pinned to Haiku, so every use inside a run session makes Haiku re-read the orchestrator's entire conversation uncached. If `plan` or `run` pin a model, the same happens at larger scale, and the turns after "Proceed?" run on the session model anyway.

1. **`status` delegates to a subagent:**
   - Remove `model:` from the `status` skill's frontmatter. Its body only dispatches the `status-reader` agent with the plan path (if given), then relays its report verbatim.
   - Add agent `status-reader`: Haiku, read-only (Change 21's read-only set), allowed read-only `git` commands (`git log`, `git status`). It reads `plan.md`, the milestone files' Status and task Status fields, the failure logs and the `Orcastrat-Task:` trailers, and returns a report of at most 20 lines, including the `Failures:` line (Change 3).
   - Don't use `context: fork` for this. A fork inherits the parent's conversation.
   - The skill stays invoked by name only, and its output format is unchanged for the user.
2. **No model pins on skills that run in the user's conversation:**
   - List every skill's `model:` frontmatter (a grep, recorded in the CHANGELOG). Remove any pin on `plan`, `run` or `status`. They run on the session model.
   - Opus as the session model is a documented requirement for `plan` and `run`. Effort is still inherited from the session.
   - At start, after the instruction-file check (Change 16), `plan` and `run` confirm they are running on an Opus model. If not, interactively, show one line (the session model, and that planning and orchestration are designed for Opus) and ask through AskUserQuestion: **Stop** (so you can restart the session on Opus) or **Continue on this model**. Under `--yes`, write the notice to the run report (`run`) or the plan summary (`plan`) and continue.
   - Agents keep their frontmatter model and effort pins. Subagents don't affect the parent's cache.

**Acceptance:** no skill has a `model:` pin; `status-reader` exists; `/orcastrat:status` in a run session causes no cache miss in the orchestrator's session (`/usage` shows no miss attributed to it); `plan` in a Sonnet session shows the notice and the choice, and logs it under `--yes`.

## 22. Change 21: Agent prefix hygiene

**Why.** Each subagent starts its own conversation. Its system prompt and tool definitions are the prefix shared from cache across every dispatch of that agent. Instructions repeated in every dispatch message are processed fresh for every task, and every unneeded tool definition adds to every request.

1. **Static agent files:** no dates, paths, plan names, or per-run content. All per-task content goes in the dispatch message.
2. **Invariant instructions live in agent files.** Everything that applies to every dispatch of an agent goes in its file, not the dispatch template: commit rules and the precedence rule (Change 1), resume behavior (Change 2), the breaker and escalation-context rules (Change 3), worktree rules (Change 5, conditional on a `Worktree:` line), brief reading (Change 7), the report format and reply cap (Change 9), fails first and RED evidence, GAP and no-design-decision rules, and each reviewer's findings format (Change 10). The same applies to scouts, the planner, reviewers, `validator`, `merger`, `decider` and `status-reader`. The scoring rubric (Change 10) is in the agent file of every reviewer and of `validator`.
   - **Search and command bounds, in every agent file** (workers, scouts, reviewers, the planner, `validator`, `merger`, `decider`, `status-reader`):
     - Search only inside the repository, or paths named in your brief or task. Never search from a filesystem root or home directory (`find /`, `find ~`, `find /c`, `find C:\`). Prefer the Glob and Grep tools over `find`.
     - Never start a background command, and never run a command that may not finish within the Bash time limit. If you need information a long command would give, report the question instead of running it.
     - Don't verify environment facts (installed tools, versions) that a task's own Verify or scripts establish. For example, `run-bats.sh` clones bats itself.
     - Why: in the build of this spec, a plan-reviewer ran `find / -iname bats` under Git Bash on Windows. The command outlived the Bash time limit, was moved to the background, and kept scanning the whole drive after the agent had finished.
   - The dispatch message then carries only task-unique lines: `Brief:`, `Failures:` when retrying, `Worktree:` in parallel waves, and the report path.
   - This is a standing rule: any later change that adds an every-dispatch instruction puts it in the agent file.
   - Record the before and after dispatch-message sizes for one task per tier in the CHANGELOG entry.
3. **Minimal tool sets:** every agent gets an explicit `tools` allowlist with only what its role needs.
   - **Workers** (`worker-mini-serial`, `worker-mini-parallel`, `worker-light`, `worker`, `worker-heavy`, `specialist`): read, edit, write, file search and content search, and the platform shell tool (needed for Verify and commits).
   - **Read-only agents that write notes** (`scout`, `scout-heavy`, `reviewer`, `plan-reviewer`, `milestone-reviewer`): read-only file tools, the shell tool for read-only commands, and write for their own notes file (Change 9). Web fetch and search only for `scout`, whose role includes library docs.
   - **`status-reader` and `validator`:** read-only file tools and the shell tool for read-only commands. They reply inline and write nothing.
   - **`planner`:** read-only file tools, plus write for the milestone file it details and its notes.
   - **`merger`:** read, search and edit. No shell; `run` does all git steps.
   - **`decider`:** read and search, plus write for its one output file.
   - **No agent below the orchestrator** gets the Agent (Task) tool, so there are no nested subagents. None gets the Skill tool or the Artifact tool either.
   - **`planner` and `plan-reviewer` get no shell:** `planner` gets `Read, Glob, Grep, Write, Edit` (it edits `plan.md` and the milestone file it details); `plan-reviewer` gets `Read, Glob, Grep, Write` (write for its report only). Reading is all either needs, and without a shell neither can run trial code or tests.
   - **No prototyping or duplicate work, in every non-worker agent file** (`planner`, `plan-reviewer`, `milestone-reviewer`, `reviewer`, `scout`, `scout-heavy`, `validator`, `decider`, `merger`, `status-reader`) and in the `plan` skill, as a section of its own:
     - Don't implement. Never write or run trial code, scripts, tests or fixtures, in the repository, the scratchpad or any temp directory. Never create git worktrees, branches or commits. Write nothing except your own output file. Building and testing is the workers' job, and each task's own tests catch mistakes.
     - Don't redo another agent's work: don't re-survey what the milestone's survey note covers; don't re-run a task's Verify, a Milestone verify or a Final verify; don't re-check facts a Decision or a cited note already records.
     - Settle uncertainty in the plan, not by experiment: a detail only running something would settle becomes an exact Step or Done-when for the worker; an unknown fact becomes an `investigate` task; a design choice is a GAP.
     - Agents that have a shell use it only for short read-only commands (`git log`, `git show`, `git diff`, `grep`, `ls`, `cat`).
     - Why: in the build of this spec, planners and a plan-reviewer wrote and ran trial versions of a milestone's scripts and test suites. One planner used 330k tokens and hit its turn limit, and the plan-reviewer created a git worktree and branch in a temp directory. Duplicating the workers' job is the waste Orcastrat exists to prevent.
   - Record each agent's allowlist in the README's cast table. The verification run (§30) confirms nothing is missing; any tool found missing is added to that agent, with the reason recorded.
4. **Workers still re-read CLAUDE.md as a file** on every task. That content can't be shared from cache, which is why Change 16 matters; the README says so.

**Acceptance:** agent files contain no per-run content; dispatch messages carry only task-unique lines, and the recorded sizes show the reduction; every agent has an explicit allowlist matching the sets above.

## 23. Change 22: Dispatch order and run guidance

1. **Dispatch order within a wave:** when a wave's tasks can run in any order, dispatch same-tier tasks back to back, so each tier's cached prefix stays warm.
   - In serial mode, execution and commit order follow this grouping. Wave tasks don't interfere by definition.
   - In parallel mode, dispatch follows the grouping, and integration is still in task order (Change 5).
2. **README "During a run":**
   - start the session on Opus before `plan` or `run` (Change 20);
   - don't switch models with `/model` during a run;
   - changing effort on Opus 5.5 with a subscription keeps the cache; on other models or providers, set effort before starting;
   - don't enable or disable plugins that provide MCP servers during a run;
   - `/orcastrat:status` is safe to use during a run (Change 20);
   - use `--max-milestones 1` and `/clear` between milestones for long plans, rather than letting the session compact (Change 3);
   - `/usage` shows the session's cache hit ratio and the likely cause of the last miss.

**Acceptance:** a wave mixing tiers dispatches same-tier tasks consecutively; parallel integration order is unchanged; the README section exists.

## 24. Change 23: README prerequisites

**Why.** The toolchain check (Change 19) stops a run on a machine that isn't set up, but users should learn the requirements before installing, not from a `SETUP` stop. The README currently has no prerequisites section.

Add a **Prerequisites** section to the README, placed before the install instructions. It contains:

1. **Claude Code:** the Claude Code version the verification run (§30) used, stated as "tested with". It's a recorded fact rather than a guessed minimum.
2. **Opus access:** `plan` and `run` are designed to run in an Opus session (Change 20), and several agents use Opus (`worker-heavy`, `specialist`, `decider`, `planner`, `milestone-reviewer`). State that the user's plan must include Opus, and how to start a session on it (`/model`, or `claude --model opus`).
3. **git 2.17 or later,** with `user.name` and `user.email` configured, and the project inside a git work tree. Include the `git config` commands, and note that workers commit their own work (Change 1), so the identity is used on every task. A remote isn't required. If there is one, nothing is ever pushed.
4. **bash 3.2 or later:**
   - **Windows:** install Git for Windows, which provides both git and bash. Without it, `run` stops at preflight.
   - **macOS:** the system bash (3.2) is enough.
   - **Linux:** bash is standard on most distributions. Minimal containers (Alpine, for example) need it installed.
5. **No other interpreters:** Orcastrat itself needs no PowerShell, Python, Node or `jq`.
6. **The project's own toolchain:** whatever the plan's Verify commands call (a .NET SDK, Node, `pwsh` for PowerShell-based projects) must be installed and on the PATH. Verify commands run through bash (Change 19).
7. **Machine resources for parallel waves:** disk space for one worktree per concurrent task, and memory for `Max parallel` concurrent builds. Link to the Windows notes (Defender exclusions, memory versus `Max parallel`).
8. **Recommended, not required:** a lean CLAUDE.md, since workers re-read it on every task (Change 16), and the "During a run" guidance (Change 22).
9. **The preflight check:** a short table of what `plan` and `run` check (bash, git, work tree, commit identity, and for `run` a clean tree), what happens when a check fails (`run` stops with `SETUP`; `plan` exits, or only warns for bash), and the fix for each item per platform. The wording matches the check's actual messages.
10. **Install and update:** the existing `claude plugin marketplace add` and `claude plugin install` commands follow the section, with the update commands and the rule to never update during a run.

**Acceptance:** the README has a Prerequisites section before the install instructions, covering items 1–10; its preflight table matches the check's messages; the "tested with" version matches the verification run.

## 25. Change 24: Rename to Orcastrat

**Why.** The mascot is an orca playing a Strat-style guitar. The plugin has one user (Tim) and hasn't been submitted to any directory, so this is the last cheap moment to rename it. After a public listing, the name is permanent.

**Identifiers.** The product name is **Orcastrat**; every identifier is **`orcastrat`**.

1. **Plugin:** move `plugins/orchestratinator/` to `plugins/orcastrat/` with `git mv`, so history follows. Set `name` in the plugin's `plugin.json` and its entry in the repo's `marketplace.json` to `orcastrat`.
2. **Everything namespaced by the plugin name** follows automatically: `/orcastrat:plan`, `/orcastrat:run`, `/orcastrat:status`, and agent types such as `orcastrat:worker`. Update every place that names them explicitly: skills, agents, the hook matcher and command, README, CHANGELOG, and the repo's own CLAUDE.md or docs if they mention the plugin.
3. **Paths inside `.git`:** `orcastrat/` in place of `orchestratinator/` (briefs, worktrees, logs, instruction-check outputs, the run marker).
4. **Commit trailer:** new commits use `Orcastrat-Task:`. `recover`, `run-report` and `status-reader` accept both `Orcastrat-Task:` and `Orchestratinator-Task:`, so plans started before the rename (such as MPRUVD_PDF) recover correctly. The old trailer is never written again.
5. **Leftovers in existing repos:** if `run`'s preflight finds an `orchestratinator/` directory in the git dir or common dir, it runs `git worktree prune` and mentions in one line that the old directory can be deleted. It never deletes it automatically.
6. **Text:** all prose, prompts, block reasons and messages say Orcastrat. The README keeps a one-line note, "Formerly Orchestratinator", for anyone searching the old name, and the name history (phase-runner → Deligatinator → Optimizinator → Orchestratinator → Orcastrat).
7. **Mascot:** file names and alt text reference Orcastrat. The generic-guitar version planned for a public listing is unaffected.
8. **CHANGELOG:** a *Changed* entry for the rename, with the migration steps below.

**Migration (Tim, after this merges):**

1. Finish or pause any active runs.
2. `claude plugin uninstall orchestratinator@timschreiber`
3. `claude plugin marketplace update timschreiber`
4. `claude plugin install orcastrat@timschreiber`
5. Restart Claude Code. Repeat on every machine where the plugin is installed.

The README carries the same steps under "Upgrading from Orchestratinator".

**Build note.** The build itself runs on the installed, pre-rename plugin, so the build plan's own commits carry `Orchestratinator-Task:`. That's expected, and is the reason `recover` accepts both trailers.

**Acceptance:** no `orchestratinator` identifier remains in `plugins/orcastrat/`, except where the old trailer and old directory name are accepted for compatibility, and in the "Formerly" note and name history; `claude plugin validate` passes; `recover` finds tasks under both trailers; the migration steps work on a machine with the old plugin installed.

## 26. Out of scope

- Rewriting or restructuring CLAUDE.md or AGENTS.md. Orcastrat checks and advises (Change 16) but never edits instruction files. A standalone CLAUDE.md-slimming tool is out of scope.
- Cache measurement and tuning (the cold-start cost of parallel waves in worktrees, per-agent cache TTLs), beyond what the run report already records.
- Any cost-based limit (ground rule 5).

## 27. What is dropped or deferred

**From the isolation spec (dropped):**

- Experiments E1 through E8, `disallowedTools` pattern rules, harness-managed worktrees, `worktree.baseRef`, `.worktreeinclude`, and the `ORCHESTRATINATOR_MAIN` removal.
- The stray-commit soft-reset guard and the "never commit" worker rules (replaced by Change 1).
- The `isolation-changes` branch stays as an archive; its evidence is real, but no work here depends on it. This spec starts on a fresh branch from `main`.

**From the best-practices draft:**

- **Merged into the execution changes:** escalation with a fresh prompt and the failure log (Changes 2, 3 and 9); Blocking vs Advisory findings (Change 10); lean orchestrator intake (Changes 6, 7 and 9); the compaction recovery hook (covered by the Stop hook's re-read instruction, Change 8); `Max milestones` (Change 3).
- **Dropped:** all probes (P1–P8), per ground rule 1.
- **Deferred to the backlog,** because each depends on Claude Code behavior not yet observed in real runs:
  - a mechanical SubagentStop Verify gate for workers (plugin `SubagentStop` hooks and transcript parsing);
  - a session-per-milestone driver for unattended runs through `claude -p`;
  - README guidance on permission modes for unattended runs;
  - recommending a code intelligence plugin inside workers;
  - workflow-backed milestone execution (only if tier model pinning inside workflows is proven).

## 28. Docs

- **README:**
  - how commits work now (workers commit, `run` verifies the range and records status);
  - resume before escalate, the ladder, the failure log, and LIMIT (including `Max milestones`);
  - parallel defaults, conflict handling, and the automatic serial fallback;
  - the Windows notes: Defender exclusions, and memory versus Max parallel;
  - task briefs, report files, `DONE_WITH_CONCERNS`, rubric-scored reviews with independent validation, and the run report;
  - the Stop hook: what it does, the heartbeat and loop guard, and one active run per checkout;
  - the decider, auto-decide, its limit, and that planning questions are always answered by the user;
  - the interview phase, write-back to the spec, and `--skip-interview`;
  - targeted Verify;
  - the instruction-file check and what to do about its findings;
  - "Prerequisites" (Change 23) and "During a run" (Change 22);
  - the cast table with models, efforts and tool allowlists;
  - "Formerly Orchestratinator", the name history, and "Upgrading from Orchestratinator" (Change 24).
- **CHANGELOG** (under Unreleased):
  - *Added:* resume before escalating, the failure log, the worker breaker, LIMIT with its fields and flags (including `Max milestones`), the `merger` agent, the `worker-mini` tier with its serial and parallel agents, the bookkeeping scripts, task briefs, the Stop hook, report files, `DONE_WITH_CONCERNS`, rubric-scored review findings with categories, the `validator` agent, the run report, the `decider` agent with auto-decide, the interview phase with spec write-back, completeness checks and Out of scope, targeted Verify, the batch pilot, the instruction-file check, conventions excerpts, rule and hook suggestions, the `status-reader` agent, tool allowlists, the three-OS CI matrix, the README Prerequisites section.
  - *Changed:* renamed to Orcastrat (with migration steps); workers commit their own work; every worker tier moves one step up the ladder (`worker-light` is now Sonnet / medium, `worker` Sonnet / high, `worker-heavy` Opus / medium); the ladder is capped at three rungs; the turn limits; the Max parallel default of 2; `status` delegates to a subagent; no skill pins a model; invariant instructions moved into agent files; shipped runtime is bash only.
  - *Removed:* the soft-reset guard; runtime PowerShell in the plugin (with the inventory).

## 29. Suggested build order

1. Change 24: the rename, first, so everything after it is built under the new name.
2. Change 19: inventory, removal of runtime PowerShell, the bats harness and the CI matrix. Everything later that ships a script is written against it.
3. Change 6's git scripts: `scope-check`, `push-check`, `verify`, `integrate`, `recover`. (`task-brief`, the Stop hook script and `run-report` are built with Changes 7, 8 and 11.)
4. Changes 4 and 21 together, since both rewrite every agent file: the new tiers, invariant instructions in agent files, tool allowlists.
5. Changes 1, 2, 3, 7 and 9: commits, resume, the runaway guard, briefs and reports.
6. Changes 5 and 22: parallel waves, `merger`, dispatch order.
7. Changes 8, 16 and 20: the Stop hook and the preflight checks, in their preflight order.
8. Changes 10, 11 and 18: reviews with the rubric and `validator`, the run report, suggestions.
9. Change 12, the decider.
10. Changes 13, 14, 15 and 17: the planning changes.
11. Docs, including Change 23.

Build it in serial mode (`Parallel: off`), since the installed plugin predates these changes.

## 30. Verification

- `./scripts/Validate-All.ps1` passes, with only the expected missing-`version` warnings, and all frontmatter parses.
- The script tests pass, and the CI matrix is green on all three OSes.
- **A real run in a scratch repo** exercises:
  - a serial task that commits;
  - a failed attempt that resumes, then escalates;
  - a two-task parallel wave that integrates cleanly, including a `worker-mini` task dispatched to `worker-mini-parallel`;
  - a task that exhausts three rungs and stops as STUCK;
  - a forced conflict resolved by `merger`, and a forced unresolvable conflict that reruns serially;
  - LIMIT pauses from `Max tasks` and `Max milestones`;
  - a worker reply of `DONE_WITH_CONCERNS` that triggers a review;
  - the orchestrator ending its turn mid-run, with the Stop hook sending it back, and the loop guard releasing it after 3 blocks without progress;
  - a worker GAP auto-decided as `local` and retried, and a `stop`-labelled GAP that stops the run with the decider's recommendation in the report;
  - a style-only review finding that doesn't trigger a fix round, and a high-scoring false positive that the `validator` downgrades;
  - a batch whose pilot escalates, re-tiering the rest;
  - the instruction-file check prompting on a bloated CLAUDE.md, then staying silent after Continue;
  - `run` started in a Sonnet session showing the model notice;
  - `/orcastrat:status` during the run with no cache miss in `/usage`;
  - `plan` on a spec with planted gaps, showing the interview, the audit, and the write-back;
  - the toolchain check failing on a repo with no commit identity, and `run` refusing a dirty tree;
  - a second Claude Code session in another worktree of the same repository ending its turns normally while a run is active;
  - a run interrupted after a worker commit but before the status commit, recovered as a failed attempt;
  - an escalated task whose fresh worker reads the preserved report of the earlier attempt;
  - `recover` on a plan with commits carrying the old `Orchestratinator-Task:` trailer;
  - the migration steps on a machine with the old plugin installed.

  Tim runs this after the build, before merging to `main`.

## 31. Repo conventions

- Apache-2.0; no `version` field in plugin manifests.
- Kebab-case names, permanent once the plugin is listed publicly (the rename in Change 24 happens before that): `worker-mini-serial`, `worker-mini-parallel`, `merger`, `decider`, `validator`, `status-reader`, the script names, and the hook script need care.
- Frontmatter and hooks JSON must be valid. Quote YAML values containing `: `.
- `./scripts/Validate-All.ps1` and `claude plugin validate` must pass.
- Shipped runtime is bash plus `git` only (Change 19). Dev tooling may stay PowerShell.
- CHANGELOG entries go under Unreleased.

## 32. Decisions made in this spec

Review these before planning.

**Execution**

1. **Workers commit, the Superpowers way.** `run` verifies `BASE..HEAD` and adds the status commit with the trailer.
2. **One resume per rung before escalating**, falling back to a fresh dispatch if resuming isn't available.
3. **Parallel stays, with `Max parallel: 2` as the default.**
4. **Five plan tiers, six agents:** `worker-mini` (Haiku serially, Sonnet / low in parallel waves), `worker-light` (Sonnet / medium, the default), `worker` (Sonnet / high), `worker-heavy` (Opus / medium), `specialist` (Opus / high). Existing plans read the new meanings; no mapping.
5. **The ladder is capped at three rungs per task.** A task that exhausts them is treated as a planning problem.
6. **Conflicts go to a `merger` agent (Sonnet / high).** A merge that fails reruns the task serially, never stops the run.
7. **A containment failure downgrades the run to serial** automatically, without stopping it.
8. **Bookkeeping moves into bash scripts**, written to the portability rules.
9. **The runaway-guard decisions from the isolation planning carry over**, except that the full ladder is now capped at three rungs.
10. **Start on a fresh branch from `main`.** `isolation-changes` is archived.
11. **Task briefs live inside `.git`**, generated per dispatch, and replace reading plan files for workers and the per-task reviewer.
12. **A Stop hook keeps runs going,** scoped by a per-checkout marker with a heartbeat, one active run per checkout, releasing after 3 blocks without a heartbeat change. It also covers recovery after compaction, and fails open.
13. **Workers write report files with RED and GREEN evidence,** and may reply `DONE_WITH_CONCERNS`, which triggers a review. Other agents write long output to files and reply in at most 20 lines.
14. **Review findings block only at 80+ on an anchored rubric, with a citation, in a blocking category, and only after an independent `validator` also scores them 80+.** Everything else is advisory. This applies to all three reviewers.
15. **A run report is generated by script** at every Pause, Stop, and completion; usage is included only where Claude Code reports it, and is display only.
16. **A `decider` agent (Opus, high effort) handles every GAP during a run.** With `Auto-decide: local`, it auto-accepts local, reversible recommendations, up to 5 per run; otherwise its recommendation appears in the stop report.
17. **Planning questions are always answered by the user.** `plan` may run unattended until it presents its questions, but it never auto-decides them.
18. **Cost never gates anything.** Limits are non-progress guards and opt-in `LIMIT` pauses only.
19. **`Max milestones` joins the LIMIT fields,** for clean `/clear` points in long plans.
20. **Escalation carries the failure log and the preserved reports of earlier attempts, never transcripts.**

**Planning**

21. **Task Verify must be targeted.** The whole suite runs only in Milestone and Final verify, with a build-config exception. Applies to milestones detailed after the change.
22. **The interview is a phase of `plan`, not a new command**, running before the question audit and scaling with job size; `--skip-interview` turns it off.
23. **Interview and audit answers are written back into the primary spec file.** `plan.md` Decisions cite the spec section; the spec wins if they disagree. Inline input is never edited.
24. **Question rounds use the paste-ready format, not AskUserQuestion.**
25. **Out of scope and end-to-end proof are explicit completeness checks**, stored as a `plan.md` section and in Final verify.
26. **An escalated batch pilot re-tiers the rest of its batch automatically**, recorded as a Decision.

**Instruction files**

27. **The instruction-file check runs on every `plan` and `run`, right after the toolchain check,** using AskUserQuestion for its single stop-or-continue choice, never under `--yes`.
28. **Leanness is criteria-only by default;** a line threshold is opt-in.
29. **For derivable content, the check defers to `/doctor`.** Its own findings cover skills, hooks, links, emphasis, imports and conflicts.
30. **Conflicts are always shown; leanness findings only when new or changed,** keyed by a content hash.
31. **Check outputs live inside `.git`,** like the briefs and the marker.
32. **Orcastrat never edits instruction files.** It writes a review and a paste-ready fix prompt.
33. **Conventions excerpts add salience; workers still read the full files.**
34. **Rule and hook suggestions are written, never applied.**

**Portability**

35. **Shipped runtime is bash (3.2-compatible) plus `git` and standard utilities only.** No `pwsh`, `jq`, Node or Python.
36. **All runtime PowerShell in the plugin is removed and replaced**, with the inventory recorded.
37. **Dev tooling stays PowerShell** and never runs for plugin users.
38. **Verify commands run through `bash -c`;** projects with PowerShell tooling invoke it explicitly.
39. **Every `plan` and `run` starts with a toolchain check, on every platform:** bash 3.2+, git 2.17+, a git work tree, and a commit identity. Any failure stops `run` with `SETUP` and ends `plan` before surveying, except a missing bash, which `plan` only warns about.
40. **Portability is proven by a three-OS CI matrix testing the scripts with bats**, not by running Claude Code in CI.
41. **Scripts target bash, not POSIX `sh`,** matching Change 6. Bash 3.2 compatibility keeps macOS working; the preflight check catches systems without bash.
42. **git is checked as strictly as bash,** including a work tree and a commit identity, since every part of the flow (commits, scope checks, briefs, the marker, recovery) depends on it.

**Cache**

43. **No skill that runs in the user's conversation pins a model.** `status` dispatches a Haiku `status-reader` subagent; Opus for `plan` and `run` is a session requirement, checked at start.
44. **`context: fork` is not used for delegation.**
45. **Every-dispatch instructions live in agent files; dispatch messages carry only task-unique lines.** This is a standing rule.
46. **Every agent gets an explicit, minimal tool allowlist.**
47. **Same-tier tasks are dispatched back to back within a wave when order is free.**

**Docs**

48. **The README gets a Prerequisites section before the install instructions,** stating a tested Claude Code version rather than a guessed minimum, and documenting the preflight check with its exact messages.

**Robustness (from verification)**

49. **`run` requires a clean working tree,** because failed attempts are cleaned with `git clean -fd`.
50. **Only the success commit carries the `Orcastrat-Task:` trailer.** Failure-log commits don't, so recovery can't mistake a failed attempt for a finished one.
51. **A failed attempt's report is preserved before the reset,** as `notes/reports/<task-id>-attempt<n>.md`, so the next tier can read what was tried.
52. **Verify logs, briefs and worktrees live inside `.git`;** notes written in the tree are committed before the next dispatch.
53. **`recover` treats worker commits without a trailer as an interrupted, failed attempt.**
54. **The run marker is per checkout, with a heartbeat,** so parallel sessions in other worktrees are unaffected and long waves never look stuck.
55. **A failed merge reruns the task at the tier that succeeded,** not its planned tier.
56. **Briefs are regenerated when Decisions change** before a retry.
57. **The git floor is 2.17,** for `git worktree remove`.

58. **The rubric is Orcastrat's own wording** of the anchored 0–100 scale, defined once and included in every scoring agent's file.
59. **`validator` is Sonnet / medium,** not Haiku: judging whether a correctness finding is real is more than transcription. It never sees the reviewer's score.
60. **Validation has no cap.** Blocking candidates are rare, and each false positive caught saves a fix round or a failed attempt.

61. **The plugin is renamed to Orcastrat (`orcastrat`)** before any public listing, with `git mv` so history follows.
62. **New commits use `Orcastrat-Task:`; recovery accepts both trailers,** so plans started before the rename keep working.
63. **Old `orchestratinator/` directories are pruned and reported, never deleted automatically.**

**Scope**

64. **Items that depend on unobserved Claude Code behavior are deferred to the backlog**, not probed: the SubagentStop gate, the `claude -p` driver, permission-mode guidance, code intelligence in workers, and workflow-backed execution.

**Robustness (from the build)**

65. **Every agent file bounds searches and commands:** search only inside the repository or paths the brief names, never from a filesystem root or home directory; never start a background command or one that may outlive the Bash time limit; don't verify environment facts that the task's own Verify or scripts establish. No agent below the orchestrator gets the Agent, Skill or Artifact tool (Change 21).
66. **`run` stops leftover background work** after every agent returns, with the Stop Task tool. When that fails, it logs a warning to `notes/run-log.md` and continues. It never kills processes by PID, and the run report counts the warnings (Changes 3 and 11).
67. **Planning and review agents never prototype or duplicate work.** Every non-worker agent file and the `plan` skill forbid writing or running trial code, scripts or tests, creating worktrees, branches or commits, and redoing another agent's survey, Verify or recorded facts. `planner` and `plan-reviewer` have no shell (Change 21).
