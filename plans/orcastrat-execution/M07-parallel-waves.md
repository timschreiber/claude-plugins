# M07: Parallel waves and dispatch order (Changes 5, 22)

- Status: in-progress
- Format: 2
- Goal: Parallel waves follow Change 5's mechanism. Workers commit in worktrees under `<git-common-dir>/orcastrat/<plan-slug>/worktrees/`. `run` checks each task branch, then integrates in task order with `integrate` (multi-commit). A new `merger` agent handles conflicts, falling back to a serial rerun at the tier that succeeded. A containment failure downgrades the run to serial without stopping it. The default for plans written from now on is `Max parallel: 2`. The plan format says tiny tasks are batched rather than parallelized. Same-tier tasks are dispatched back to back within a wave.
- Depends on: M06
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout-heavy

## Context

Governing sources: spec §6 (Change 5), §23 item 1 (Change 22), §22 items 1–3 (the `merger` file and allowlist); Decisions D05, D12, D13, D17, D18, D29, D50, D62, D82, D83, D117, D119–D135.

- D62: no task in this milestone is `worker-light`; `worker` is the floor.
- Tier adjustment: test-first tasks whose Steps give the literal test file and the literal code → worker (worker-light escalated 2 times in M02)
- D48, D66: the new agent file gets the `## Search and command bounds` section and the `## No prototyping or duplicate work` section (both added in M04), and its `tools` line names no `Agent`, `Task`, `Skill` or `Artifact`; `tests/orcastrat/agent-files.bats` checks all three once `merger` is in its lists (M07-T02).
- Worktrees: `git worktree add -b <task branch> <path> BASE`, at `<WT_ROOT>/worktrees/<task ID>`, where WT_ROOT is `<git-common-dir>/orcastrat/<plan-slug>` (D119). The task branch is `orcastrat/<plan-slug>/<task-id>` (D18). Worktree setup sets `ORCASTRAT_MAIN` and `ORCHESTRATINATOR_MAIN` (D17). The dispatch carries `Worktree: <path>`, and workers keep the "cd into it for every command" rules.
- Per task, in its worktree: `scope-check`, `verify` and `push-check` (M03 scripts, directory argument per D05, the wave's BASE per D50).
- Integration: `integrate <task-branch> <BASE>`, run from MAIN, in task ID order, onto the plan branch. The old "exactly one commit" check is removed, since tasks may have several commits. Each integrated task gets its own status commit (D120, D131).
- `merger`:
  - Frontmatter: `model: sonnet`, `effort: high`, `tools: Read, Glob, Grep, Edit`. No shell; `run` does all git steps. The spec gives no `maxTurns`, so the file sets none.
  - Input and reply: D128. It edits only the conflicted files.
  - Its reply follows M06's 20-line rule.
- Merge failure: D123, D124, D130. Parallel failed attempts: D127. Containment: D122, D133. Blocks in a parallel wave: D132. Worktree removal: D134.
- Dispatch order: D129. Serial execution and commit order follow the grouping; parallel batches are cut from it; parallel integration stays in task ID order.
- `worker-mini` in a parallel wave dispatches `worker-mini-parallel` (M04).
- The bats files run slowly on Windows. Give a Verify command that runs bats a Bash timeout of 600000 ms. On this machine git prints `LF will be replaced by CRLF` warnings while tests build fixtures; they are expected.
- Every block a Step gives in a fence is its literal final content: the fenced block in that Step, with the three-space list indentation removed from each line. Blank lines stay empty. Copy it exactly; don't reformat, reorder or "improve" it.
- **Replacing text.** "Replace A with B" means: find A, which occurs exactly once in the file unless the Step gives another count (as a whole line, or as the part of a line quoted), and put B in its place, changing nothing around it. If A isn't found that many times, stop and report `BLOCKED` / `GAP` quoting A.
- **Inserting a line.** "Directly below the line L, insert X" means: put X on its own line right after L, with no empty line between them.
- Skill and agent text contains no `$(`: every command they tell Claude to run is one line (spec §20 item 3).
- The run executing this plan is the installed, pre-rename plugin (D37). Editing the repository's `run` skill and agent files changes nothing in that run. No task in this milestone runs `run` or dispatches an agent.

Waves: 6 (widths 4, 2, 2, 1, 1, 1)

## Coverage

- `docs/orcastrat-execution-spec.md` §6 item 1: `run` creates each task's worktree with `git worktree add -b <task branch> <path> BASE` under `<git-common-dir>/orcastrat/<plan-slug>/worktrees/`, and runs Worktree setup there; `next` counts leftover worktrees there (D119) → M07-T01, M07-T06, M07-T07
- `docs/orcastrat-execution-spec.md` §6 item 2: workers work and commit inside their worktree; the dispatch carries `Worktree: <path>` and the report path under the worktree, and the "cd into it" rules stay (D117) → M07-T03, M07-T07
- `docs/orcastrat-execution-spec.md` §6 item 3: per task, `run` checks the task branch in its worktree: scope, Verify and the push check, and commits what the worker left (D50, D121) → M07-T07
- `docs/orcastrat-execution-spec.md` §6 item 4: integration in task order, cherry-picking `BASE..<task branch>` with `integrate`, multi-commit, with a status commit per task (D120, D131) → M07-T08
- `docs/orcastrat-execution-spec.md` §6 item 5: a conflict dispatches `merger` (Sonnet, high effort, read and edit, no git) with both tasks' Objective, Steps and Interfaces and the conflicted files; it edits only those files; `run` continues the cherry-pick and re-verifies (D124, D128) → M07-T02, M07-T08
- `docs/orcastrat-execution-spec.md` §6 item 5: when the merger can't resolve it or the re-verify fails, `run` aborts the cherry-pick, discards the task branch and reruns the task serially on the integrated result at the tier that succeeded; not a failed attempt, no Stop (D123, D130) → M07-T08
- `docs/orcastrat-execution-spec.md` §6 item 6: combined re-verify after each wave → M07-T08
- `docs/orcastrat-execution-spec.md` §6 item 7: after each worker returns, MAIN must be clean and on the plan branch; otherwise reset it to the wave's starting commit and clean it, discard the wave's worktrees, rerun the wave serially, switch the rest of the run to serial with a one-line report, no Stop (D122, D133) → M07-T03, M07-T07, M07-T09
- `docs/orcastrat-execution-spec.md` §6 item 8: cleanup of integrated tasks (D134) → M07-T08
- `docs/orcastrat-execution-spec.md` §6 Defaults: `Parallel: auto` with `Max parallel: 2` as the new default (D29) → M07-T04, M07-T05
- `docs/orcastrat-execution-spec.md` §6 Defaults: waves with only tiny tasks are batched by the planner rather than parallelized, and the plan format says so (D126) → M07-T04, M07-T05
- D82, D83, D127: resume, the three-rung ladder, the failure log and escalation commits reach parallel tasks, and a parallel scope violation is a failed attempt → M07-T07, M07-T08, M07-T09
- `docs/orcastrat-execution-spec.md` §22 item 1: the `merger` file holds no dates, paths, plan names or per-run content → M07-T02
- `docs/orcastrat-execution-spec.md` §22 item 2: `merger`'s invariant instructions, bounds section and reply cap live in its file; a worker dispatch carries only task-unique lines, so the parallel `Retry:` lines and the workers' "retry context" go (D135) → M07-T02, M07-T03, M07-T07
- `docs/orcastrat-execution-spec.md` §22 item 3: `merger` gets `Read, Glob, Grep, Edit`, no shell, and the no-prototyping section (D68) → M07-T02
- `docs/orcastrat-execution-spec.md` §23 item 1: same-tier tasks are dispatched back to back; serial execution and commit order follow the grouping; parallel dispatch follows it and integration stays in task order (D129) → M07-T04, M07-T06, M07-T07, M07-T08
- `docs/orcastrat-execution-spec.md` §1.1: known mechanisms only (git worktrees, cherry-pick, SendMessage resumes) → M07-T07, M07-T08
- `docs/orcastrat-execution-spec.md` §1.2: the plan format, `plan`, `planner` and `run` agree on the new defaults, batching and dispatch order → M07-T04, M07-T05, M07-T06
- `docs/orcastrat-execution-spec.md` §1.4: the `merger` frontmatter is valid YAML, with its description quoted → M07-T02
- `docs/orcastrat-execution-spec.md` §29 item 6: Changes 5 and 22, parallel waves, `merger` and dispatch order, are built in this step (D28) → M07-T02, M07-T06, M07-T07, M07-T08
- `docs/orcastrat-execution-spec.md` §31: `merger` is a kebab-case name, frontmatter is valid, and `Validate-All.ps1` passes → M07-T02
- `docs/orcastrat-execution-spec.md` §32 items 3, 6, 7, 45, 46, 47, 52 and 55: `Max parallel: 2`; conflicts go to `merger` and a failed merge reruns serially; containment downgrades to serial; task-unique dispatch lines; explicit allowlists; same-tier dispatch order; worktrees inside `.git`; a failed merge reruns at the tier that succeeded → M07-T01, M07-T02, M07-T03, M07-T04, M07-T06, M07-T07, M07-T08
- `docs/orcastrat-execution-spec.md` preamble: parallel waves come back, rebuilt from known parts → M07-T07, M07-T08

## Review Focus

- A task worktree left directly under WT_ROOT by a run from before this change, and a directory without a `.git` file inside `<WT_ROOT>/worktrees/` → `next` counts neither; only directories directly under `<WT_ROOT>/worktrees/` that hold a `.git` file count (source: D119). Test: `worktrees counts only task worktrees in the plan's worktrees directory` in M07-T01.
- `merger.md` is written with a `maxTurns` line, or with another model or effort → the agent is Sonnet / high with no `maxTurns` (source: spec §6 item 5, "Sonnet, high effort"; M07 Context, "The spec gives no `maxTurns`, so the file sets none"). Test: `merger has its model, effort, no maxTurns, its input lines and its reply block` in M07-T02.
- `run` parses the merger's reply for `STATUS: RESOLVED` or `UNRESOLVED` → the agent file gives exactly that reply block and the `Merge:` / `Conflicted:` input lines `run` sends (source: D128). Test: `merger has its model, effort, no maxTurns, its input lines and its reply block` in M07-T02.
- A worker agent still expects `Retry:` lines once parallel retries resume and escalate like serial ones → no worker agent mentions "retry context" (source: D92, D100, D135; spec §22 item 2). Test: `worker agents expect no retry context and describe the serial fallback` in M07-T03.
- A worker agent still says a stray write stops the whole run → it says the wave's work is discarded and the run goes on one task at a time (source: spec §6 item 7; D135). Test: `worker agents expect no retry context and describe the serial fallback` in M07-T03.

## Tasks

### M07-T01: next counts task worktrees in the plan's worktrees directory

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: M06-T02, M06-T03
- Files: `plugins/orcastrat/scripts/next`, `tests/orcastrat/next.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/next.bats`
- Fails first: yes
- Commit: `feat(orcastrat): next counts task worktrees in the plan's worktrees directory`

**Objective**

`next`'s `worktrees:` line counts the directories directly under `<WT_ROOT>/worktrees/` that hold a `.git` file, and nothing directly under WT_ROOT itself (D119).

**Read first**

- plan.md Decisions D113 and D119
- `plugins/orcastrat/scripts/next` lines 20–31 (header comment) and 226–241 (the worktree count)
- `tests/orcastrat/next.bats` lines 1–30 (helpers) and the test `worktrees counts only task worktrees under the plan's worktree root`

**Interfaces**

- Consumes: `next stdout lines 7-9: recover: <recover lines joined by "; ">, worktrees: <count>, marker: none, marker: active <n>m or marker: stale` (M06-T03)
- Consumes: next.bats helpers `run_script <args...>`, `out_line <key>`, `write_plan <plan status> <M01 status> <M02 status> [<open-question line>...]`, `write_milestone <file> <status> [<task ID>:<status>:<wave>:<tier>...]`, `commit_all <message>`, `fresh_plan`, `mid_wave_plan` (M06-T02)
- Produces: `next stdout line 8: worktrees: <count of directories directly under <WT_ROOT>/worktrees/ that hold a .git file>`

**Steps**

1. In `tests/orcastrat/next.bats`, replace the whole `@test "worktrees counts only task worktrees under the plan's worktree root"` block with a test named `worktrees counts only task worktrees in the plan's worktrees directory`. It runs `fresh_plan`; sets `WT="$REPO/.git/orcastrat/demo plan"`; runs `git -C "$REPO" worktree add --quiet -b task-one "$WT/worktrees/M01-T01"`, then the same with `-b task-two "$WT/worktrees/M01-T02"`, then with `-b task-three "$WT/M01-T03"` (where runs before this change put worktrees); runs `mkdir -p "$WT/logs" "$WT/hold" "$WT/briefs" "$WT/worktrees/stray dir"`; runs `git -C "$REPO" worktree add --quiet -b other "$BATS_TEST_TMPDIR/other tree"`; then `run_script "$PLAN"` and expects exit status 0, an empty `$stderr`, and `out_line worktrees` equal to `worktrees: 2`.
2. Run Verify and confirm it fails (the script counts `M01-T03` and not the two under `worktrees/`, so it prints `worktrees: 1`).
3. In `plugins/orcastrat/scripts/next`, keep `wt_root="$common_abs/orcastrat/$slug"`, and directly below it add `wt_dir="$wt_root/worktrees"`. Change the counting block so it tests `[ -d "$wt_dir" ]` and loops over `"$wt_dir"/*` instead of `"$wt_root"/*`; the two `continue` checks inside the loop stay as they are.
4. Replace the comment above the count (lines 226–228) with one saying: `worktrees: the number of directories directly under WT_ROOT/worktrees that hold a .git file, where WT_ROOT is <common>/orcastrat/<slug> (verify's slug and common-dir resolution, with <plan-dir> in place of <dir>).` In the header comment, replace the two `worktrees:` lines with: `worktrees: <count> of leftover task worktrees in the plan's worktrees directory, WT_ROOT/worktrees (directories directly under it that hold a .git file)`, wrapped at the same width as the lines around it.
5. Run Verify and confirm all 28 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/next.bats` reports 28 tests and no failure.
- `next` counts only directories directly under `<WT_ROOT>/worktrees/` that hold a `.git` file.

### M07-T02: Add the merger agent

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: M04-T02, M06-T05
- Files: `plugins/orcastrat/agents/merger.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats`
- Fails first: yes
- Commit: `feat(orcastrat): add the merger agent`

**Objective**

`plugins/orcastrat/agents/merger.md` exists (Sonnet / high, `Read, Glob, Grep, Edit`, no `maxTurns`), with the bounds and no-prototyping sections, the 20-line reply rule, the input lines of D128 and the `RESOLVED` / `UNRESOLVED` reply, and `tests/orcastrat/agent-files.bats` checks it with the other non-worker, no-shell agents.

**Read first**

- `docs/orcastrat-execution-spec.md` §6 item 5, and §22 item 3, the `merger` bullets
- plan.md Decisions D68, D73 and D128
- `plugins/orcastrat/agents/plan-reviewer.md` lines 1–35 (the structure of a no-shell agent)
- `tests/orcastrat/agent-files.bats`

**Interfaces**

- Consumes: `NON_WORKER_AGENTS`, a space-separated list of agent names (M04-T02)
- Consumes: `NO_SHELL_AGENTS`, a space-separated list of agent names (M04-T02)
- Consumes: `field <file> <key>` (M04-T02)
- Consumes: `has_line <file> <text>` (M04-T02)
- Consumes: `write_bounds <file>` (M04-T02)
- Consumes: `write_no_prototyping <file>` (M04-T02)
- Consumes: the agent line `Your reply is at most 20 lines. Anything longer goes in a file under the plan directory's `notes/`, and your reply gives its path.` (M06-T05)
- Produces: `plugins/orcastrat/agents/merger.md`, agent `orcastrat:merger`
- Produces: merger dispatch lines `Merge: <task ID>`, `Brief: <path>`, one `Merged: <path>` per already-merged task whose Files include a conflicted file, one `Conflicted: <path>` per conflicted file
- Produces: merger reply `STATUS: RESOLVED | UNRESOLVED` and `NOTE: <one line; for UNRESOLVED, why>`
- Produces: `@test "merger has its model, effort, no maxTurns, its input lines and its reply block"`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, make three edits. Replace `NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer planner'` with `NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer planner merger'`. Replace `NO_SHELL_AGENTS='plan-reviewer planner'` with `NO_SHELL_AGENTS='plan-reviewer planner merger'`. In the test `non-worker agents allow exactly the tools of their role`, directly below the line `      planner) expected='Read, Glob, Grep, Write, Edit' ;;`, insert the line `      merger) expected='Read, Glob, Grep, Edit' ;;`.
2. At the end of the same file, add the test `merger has its model, effort, no maxTurns, its input lines and its reply block`. With `f="$AGENTS/merger.md"`, it asserts: `field "$f" name` prints `merger`; `field "$f" model` prints `sonnet`; `field "$f" effort` prints `high`; `field "$f" maxTurns` prints nothing; and `has_line` succeeds for each of the four lines `Merge: <task ID>`, `Conflicted: <path>`, `STATUS: RESOLVED | UNRESOLVED` and `NOTE: <one line; for UNRESOLVED, why>`.
3. Run Verify and confirm it fails (`merger.md` doesn't exist yet).
4. Create `plugins/orcastrat/agents/merger.md` with exactly this content:

   ````markdown
   ---
   name: merger
   description: "Resolves one cherry-pick conflict while /orcastrat:run integrates a parallel wave. Reads the briefs of the task being merged and of the already-merged tasks that touch the same files, and edits only the conflicted files. No shell: run does every git step. Dispatched by /orcastrat:run only."
   model: sonnet
   effort: high
   tools: Read, Glob, Grep, Edit
   ---

   You resolve one merge conflict. The orchestrator is integrating a wave of tasks that ran in parallel, and cherry-picking one task's commits onto the plan branch conflicted with the tasks it had already merged. You edit the conflicted files so that each holds the work of every task involved. The orchestrator does every git step, before and after you. You make no design decisions: when the tasks can't all have what their Steps require, you say so instead of choosing.

   ## No prototyping or duplicate work

   - Don't implement anything beyond the merge. Never write or run trial code, scripts, tests or fixtures, in the repository, the scratchpad or any temp directory. Never create git worktrees, branches or commits. Edit nothing except the files the `Conflicted:` lines name. Building and testing is the workers' job, and the orchestrator re-verifies the merged task.
   - Don't redo another agent's work: don't re-survey what the milestone's survey note covers; don't re-run a task's Verify, a Milestone verify or a Final verify; don't re-check facts a Decision or a cited note already records.
   - Settle uncertainty in the plan, not by experiment: a detail only running something would settle becomes an exact Step or Done-when for the worker; an unknown fact becomes an `investigate` task; a design choice is a GAP.
   - You have no shell. Read files with Read, Glob and Grep.

   ## Search and command bounds

   - Search only inside the repository, or paths named in your brief or task. Never search from a filesystem root or home directory (`find /`, `find ~`, `find /c`, `find C:\`). Prefer the Glob and Grep tools over `find`.
   - Never start a background command, and never run a command that may not finish within the Bash time limit. If you need information a long command would give, report the question instead of running it.
   - Don't verify environment facts (installed tools, versions) that a task's own Verify or scripts establish. For example, `run-bats.sh` clones bats itself.

   You have no Agent, Task, Skill or Artifact tool, so you can't start subagents, run skills or create artifacts.

   ## Before anything else

   You receive exactly these lines:

   ```
   Merge: <task ID>
   Brief: <path>
   Merged: <path>
   Conflicted: <path>
   ```

   `Merge:` names the task being merged, and `Brief:` gives its brief. There is one `Merged:` line, with that task's brief, for each task already merged whose Files include a conflicted file, and there may be none. There is one `Conflicted:` line for each conflicted file, with its absolute path. Read these now:

   1. `CLAUDE.md` and `AGENTS.md` at the repository root. If one is a symlink to the other, or they have identical content, read it once.
   2. In the brief at the `Brief:` path, the block of the task the `Merge:` line names: its Objective, Steps and Interfaces.
   3. In the brief at each `Merged:` path, the same three parts of that brief's task.
   4. Each file at a `Conflicted:` path, in full.

   ## Resolving

   - In a conflicted file, each conflict starts with a line `<<<<<<< HEAD`, followed by the lines of the tasks already merged, then a line `=======`, then the lines of the task being merged, and ends with a line starting `>>>>>>> `. If a line starting `||||||| ` appears, the lines from it to the `=======` line are the common base: use them to see what each side changed, and remove them too.
   - For each conflict, write lines that give every task involved what its Objective, Steps and Interfaces require, and remove the marker lines. Keep everything outside the conflicts as it is.
   - Edit only the files the `Conflicted:` lines name. Never create a file, and never touch another file, even if the merged result would need it.
   - When you're done, no conflicted file may contain a line starting `<<<<<<< ` or `>>>>>>> `.
   - If the tasks can't all have what they require (they need the same lines to say different things, or one task's Steps contradict another's), don't choose between them: leave that file as it is, and report `UNRESOLVED`, naming the conflict in NOTE. The orchestrator then undoes this merge and reruns the task on top of the merged result.

   ## Report

   Your reply is at most 20 lines. Anything longer goes in a file under the plan directory's `notes/`, and your reply gives its path.

   Reply with exactly this block and nothing else:

   ```
   STATUS: RESOLVED | UNRESOLVED
   NOTE: <one line; for UNRESOLVED, why>
   ```
   ````

5. Run Verify and confirm all 19 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats` reports 19 tests and no failure.
- `merger` is in `NON_WORKER_AGENTS` and `NO_SHELL_AGENTS`, and the tools test expects `Read, Glob, Grep, Edit` for it.

### M07-T03: Workers expect no retry context and describe the serial fallback

- Kind: change
- Tier: worker
- Batch: yes
- Status: done
- Wave: 2
- Depends on: M07-T02, M04-T02, M05-T02
- Files: `plugins/orcastrat/agents/worker-mini-serial.md`, `plugins/orcastrat/agents/worker-mini-parallel.md`, `plugins/orcastrat/agents/worker-light.md`, `plugins/orcastrat/agents/worker.md`, `plugins/orcastrat/agents/worker-heavy.md`, `plugins/orcastrat/agents/specialist.md`, `tests/orcastrat/agent-files.bats`
- Verify: `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats`
- Fails first: yes
- Commit: `refactor(orcastrat): workers expect no retry context and describe the serial fallback`

**Objective**

No worker agent mentions retry context, since every retry now arrives as a `Resume:` message or a fresh dispatch with a `Failures:` line, and each says a stray write outside its worktree discards the wave's work and makes the run serial (D135).

**Read first**

- plan.md Decisions D100 and D135
- `docs/orcastrat-execution-spec.md` §6 item 7
- `plugins/orcastrat/agents/worker.md` lines 21–44
- `tests/orcastrat/agent-files.bats` lines 76–92 (`write_worker_rules`) and 263–272

**Interfaces**

- Consumes: `write_worker_rules <file>` (M05-T02)
- Consumes: `WORKER_AGENTS`, a space-separated list of agent names (M04-T02)
- Consumes: `has_line <file> <text>` (M04-T02)
- Produces: `@test "worker agents expect no retry context and describe the serial fallback"`

**Steps**

1. In `tests/orcastrat/agent-files.bats`, in `write_worker_rules`, replace its first heredoc line, ``The orchestrator sends you a `Brief:` path and a `Report:` path, and sometimes a `Worktree:` path, retry context, or a `Failures:` line. Re-read these now, in this order, even if you think you know them:``, with ``The orchestrator sends you a `Brief:` path and a `Report:` path, and sometimes a `Worktree:` path or a `Failures:` line. Re-read these now, in this order, even if you think you know them:``.
2. At the end of the same file, add the test `worker agents expect no retry context and describe the serial fallback`. For each name in `$WORKER_AGENTS`, it adds the name to a `bad` list when `grep -qF 'retry context' "$AGENTS/$name.md"` succeeds, or when `has_line "$AGENTS/$name.md"` fails for the line ``- Never read or write anything in the main checkout or in another worktree. The orchestrator checks: a stray write discards the work of every worker in the wave, and the rest of the run goes one task at a time.``; it then echoes the list and asserts it is empty, as the other list tests do.
3. Run Verify and confirm it fails.
4. Apply these three edits, the same in each of the six worker agent files in Files (every file but `agent-files.bats`):
   - Replace ``and sometimes a `Worktree:` path, retry context, or a `Failures:` line.`` with ``and sometimes a `Worktree:` path or a `Failures:` line.``
   - Delete the line `If retry context is present, a previous attempt at this task failed and the working tree has been reset. Read the reason and verify tail before starting, and don't repeat the same approach.` and the empty line directly below it.
   - Replace `The orchestrator checks, and a stray write stops the whole run.` with `The orchestrator checks: a stray write discards the work of every worker in the wave, and the rest of the run goes one task at a time.`
5. Run Verify and confirm all 20 tests pass.

**Done when**

- `bash scripts/run-bats.sh tests/orcastrat/agent-files.bats` reports 20 tests and no failure.
- No file under `plugins/orcastrat/agents/` contains `retry context`.

### M07-T04: Describe the Max parallel default, tiny-task batching and dispatch order in the plan format

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orcastrat/reference/plan-format.md`
- Verify: `grep -qF -- '- Max parallel: 2' plugins/orcastrat/reference/plan-format.md && ! grep -qF -- '- Max parallel: 3' plugins/orcastrat/reference/plan-format.md && grep -qF '| Max parallel | Most tasks run at once. Default 2:' plugins/orcastrat/reference/plan-format.md && ! grep -qF 'Default 3' plugins/orcastrat/reference/plan-format.md && grep -qF 'is planned as one batch task' plugins/orcastrat/reference/plan-format.md && grep -qF 'run dispatches same-tier tasks back to back' plugins/orcastrat/reference/plan-format.md && ! grep -qF 'task ID order is the execution order for serial runs' plugins/orcastrat/reference/plan-format.md`
- Fails first: no (reference text with no test; the Verify greps fail until the edits are made)
- Commit: `docs(orcastrat): plan format gives Max parallel 2, batching of tiny waves and dispatch order`

**Objective**

The plan format gives `Max parallel: 2` as the default for new plans (D29), says a wave of only tiny tasks is one batch task (D126), and describes same-tier dispatch order (D129).

**Read first**

- `docs/orcastrat-execution-spec.md` §6 Defaults and §23 item 1
- plan.md Decisions D29, D126 and D129
- `plugins/orcastrat/reference/plan-format.md` lines 36–42, 75 and 260–276

**Interfaces**

- Consumes: none
- Produces: `- Max parallel: 2`

**Steps**

1. In `plugins/orcastrat/reference/plan-format.md`, replace the line `- Max parallel: 3` with `- Max parallel: 2`.
2. Replace the line `| Max parallel | Most tasks run at once. Default 3. Each concurrent task runs its own builds and tests, so size this to the machine. |` with this line:

   ```text
   | Max parallel | Most tasks run at once. Default 2: two concurrent workers roughly halve the wall-clock time of wide waves while keeping setup, re-verify and machine load modest. Raise it for more speed; each concurrent task runs its own builds and tests, so size this to the machine. |
   ```

3. Directly below the line that starts `- Waves still apply to a batch task`, insert this line:

   ```text
   - A wave whose tasks are all tiny, same-kind edits with no logic is planned as one batch task (`- Batch: yes`) rather than as parallel tasks.
   ```

4. Replace the line `- Within a wave, task ID order is the execution order for serial runs, and the order in which parallel results are merged.` with this line:

   ```text
   - Within a wave, run dispatches same-tier tasks back to back, so each tier's cached prefix stays warm: it groups the wave's tasks by the tier each runs at, puts the groups in the order their first task appears in task ID order, and keeps task ID order within a group. That is the execution and commit order of a serial wave and the dispatch order of a parallel one. Parallel results are still merged in task ID order.
   ```

5. Run Verify.

**Done when**

- The header template says `- Max parallel: 2`, and the Max parallel row says `Default 2`.
- "Sequence and parallelism" has the batching bullet and the dispatch-order bullet, and no longer says task ID order is the serial execution order.
- Nothing else in the file changed.

### M07-T05: plan and planner default Max parallel to 2 and batch tiny waves

- Kind: change
- Tier: worker
- Status: done
- Wave: 3
- Depends on: M07-T04
- Files: `plugins/orcastrat/skills/plan/SKILL.md`, `plugins/orcastrat/agents/planner.md`
- Verify: `grep -qE 'default to .auto. with Max parallel .2., so waves' plugins/orcastrat/skills/plan/SKILL.md && ! grep -qE 'with Max parallel .3.' plugins/orcastrat/skills/plan/SKILL.md && grep -qF 'plan each such wave as one batch task' plugins/orcastrat/skills/plan/SKILL.md && grep -qF '6. Record the wave shape' plugins/orcastrat/skills/plan/SKILL.md && grep -qF 'make them one batch task' plugins/orcastrat/agents/planner.md`
- Fails first: no (skill and agent text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): plan defaults Max parallel to 2, and tiny waves become batch tasks`

**Objective**

`plan` writes `Max parallel: 2` by default (D29), and both `plan` and `planner` plan a wave of only tiny, same-kind edits as one batch task (D126).

**Read first**

- plan.md Decisions D29 and D126
- `plugins/orcastrat/skills/plan/SKILL.md` line 75 and section `## 7. Sequence the tasks and find the parallelism`
- `plugins/orcastrat/agents/planner.md` section `## Sequence and find the parallelism`

**Interfaces**

- Consumes: `- Max parallel: 2` (M07-T04)
- Produces: none

**Steps**

1. In `plugins/orcastrat/skills/plan/SKILL.md`, replace ``default to `auto` with Max parallel `3`,`` with ``default to `auto` with Max parallel `2`,``.
2. In section `## 7. Sequence the tasks and find the parallelism`, replace the line ``5. Record the wave shape in the milestone's Context: `Waves: <count> (widths ...)`.`` with these two lines:

   ```text
   5. Look for waves whose tasks are all tiny, same-kind edits with no logic, and plan each such wave as one batch task (`- Batch: yes`) rather than as parallel tasks, as the plan format's "Sequence and parallelism" says.
   6. Record the wave shape in the milestone's Context: `Waves: <count> (widths ...)`.
   ```

3. In `plugins/orcastrat/agents/planner.md`, section `## Sequence and find the parallelism`, replace `make the registration its own small task after the others. Record the wave shape` with this text:

   ```text
   make the registration its own small task after the others. If a wave's tasks are all tiny, same-kind edits with no logic, make them one batch task (`- Batch: yes`) rather than parallel tasks, as the plan format's "Sequence and parallelism" says. Record the wave shape
   ```

4. Run Verify.

**Done when**

- `plan` defaults Max parallel to `2`, and its step 7 has the batching item as item 5 and the wave-shape item as item 6.
- `planner`'s sequencing section has the batching sentence before "Record the wave shape".
- Nothing else in either file changed.

### M07-T06: run defines task worktrees under worktrees/ and the same-tier dispatch order

- Kind: change
- Tier: worker
- Status: done
- Wave: 1
- Depends on: M05-T07, M06-T09
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'Task worktrees live in its' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'the task worktrees left in' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'the task worktrees left under WT_ROOT' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'WT_ROOT holds task worktrees' plugins/orcastrat/skills/run/SKILL.md && grep -qF -- '- **Dispatch order** of a wave set:' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'Then put the wave set in **dispatch order**' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'keeping its first tasks in dispatch order' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'For each task in the wave set, in dispatch order (see Definitions)' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'For each task in the wave set, in order,' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run keeps task worktrees under worktrees/ and dispatches same-tier tasks together`

**Objective**

`run`'s Definitions put task worktrees at `<WT_ROOT>/worktrees/<task ID>` (D119) and define the **dispatch order** of a wave set (D129), and the wave loop and serial wave take tasks in that order.

**Read first**

- `docs/orcastrat-execution-spec.md` §23 item 1
- plan.md Decisions D119 and D129
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions`, section 2a item 4, and sections 3c and 3d

**Interfaces**

- Consumes: `**Next**` (M06-T09)
- Consumes: `**Current tier and rung**` (M05-T07)
- Produces: `**Dispatch order**`
- Produces: `<WT_ROOT>/worktrees/<task ID>`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section `## Definitions`, replace ``Task worktrees live under it, inside `.git`, so they never show up in the main checkout's status.`` with ``Task worktrees live in its `worktrees/` directory, as `<WT_ROOT>/worktrees/<task ID>`, inside `.git`, so they never show up in the main checkout's status.``
2. In the **Next** entry, replace `the task worktrees left under WT_ROOT;` with ``the task worktrees left in `<WT_ROOT>/worktrees/`;``. In section 2a, item 4, replace `WT_ROOT holds task worktrees from an earlier run` with this text:

   ```text
   `<WT_ROOT>/worktrees/` holds task worktrees from an earlier run
   ```

3. In `## Definitions`, directly below the line that starts `- **Current tier and rung**`, insert this line:

   ```text
   - **Dispatch order** of a wave set: its tasks grouped by the tier each will be dispatched at, its current tier (see above), so that same-tier tasks run back to back and each tier's cached prefix stays warm. The groups go in the order their first task appears in task ID order, and each group keeps task ID order. For example, `M01-T01:worker M01-T02:worker-light M01-T03:worker M01-T04:worker-light` runs as M01-T01, M01-T03, M01-T02, M01-T04. Wave tasks don't interfere, so this order is safe. Serial tasks run and commit in this order, and parallel batches are cut from it, but parallel integration stays in task ID order (3e).
   ```

4. In section 3c, replace ``If any dependency of a task in the set isn't `done`, go to **Stop**.`` with ``If any dependency of a task in the set isn't `done`, go to **Stop**. Then put the wave set in **dispatch order** (see Definitions), reading each task's current tier from its task block: 3d and 3e take its tasks in that order.``
5. In section 3c, replace `trim the wave set to the number of tasks still allowed in this run.` with `trim the wave set to the number of tasks still allowed in this run, keeping its first tasks in dispatch order.`
6. In section 3d, replace `For each task in the wave set, in order, first **check the limits**` with `For each task in the wave set, in dispatch order (see Definitions), first **check the limits**`.
7. Run Verify.

**Done when**

- WT_ROOT, **Next** and 2a item 4 name `<WT_ROOT>/worktrees/` as the place of task worktrees.
- `## Definitions` has the **Dispatch order** entry below **Current tier and rung**, and 3c and 3d use it.
- Nothing else in the file changed.

### M07-T07: run's parallel wave dispatches, checks, contains and resumes in worktrees

- Kind: change
- Tier: worker
- Status: done
- Wave: 2
- Depends on: M07-T06, M03-T02, M03-T03, M05-T07, M06-T12, M06-T13
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF '"<WT_ROOT>/worktrees/<task ID>" <BASE>' plugins/orcastrat/skills/run/SKILL.md && grep -qF '3. **Containment check**' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'Parallel mode is off for the rest of this run' plugins/orcastrat/skills/run/SKILL.md && grep -qF '4. **Check each report**, in task ID order' plugins/orcastrat/skills/run/SKILL.md && grep -qF '5. **Failed attempt in the wave.**' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'no containment failure has switched this run to serial' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'When every task in the wave set has either committed in its worktree or ended in a block:' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'Retry: previous attempt by' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'reset --soft' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'record a SCOPE block' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '$(' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run resumes and escalates parallel tasks in their worktrees and falls back to serial on a containment failure`

**Objective**

`run`'s parallel wave (3e items 1–6) creates worktrees under `<WT_ROOT>/worktrees/`, dispatches batches in dispatch order, checks containment after workers return without stopping on a failure, checks each task in its worktree with commits allowed, and resumes a failed attempt once in its worktree before the task leaves the wave (D82, D83, D117, D121, D122, D127, D133).

**Read first**

- `docs/orcastrat-execution-spec.md` §6 items 1–3 and 7
- plan.md Decisions D121, D122, D127 and D133
- `plugins/orcastrat/skills/run/SKILL.md` section 3c, and section 3e up to the line `When every task in the wave set has either committed in its worktree or ended in a block:`
- `plugins/orcastrat/skills/run/SKILL.md` section `## Failed attempt`, item 1

**Interfaces**

- Consumes: `**Dispatch order**` (M07-T06)
- Consumes: `<WT_ROOT>/worktrees/<task ID>` (M07-T06)
- Consumes: `scope-check <dir> <base> <files...>` (M03-T02)
- Consumes: `push-check <dir> <base>` (M03-T03)
- Consumes: `**Failure-log entry**` (M05-T07)
- Consumes: `**RED evidence**` (M06-T13)
- Consumes: `**Brief**` (M06-T12)
- Produces: `**ready to integrate**`
- Produces: `**leaves the wave**`
- Produces: `5. **Failed attempt in the wave.**`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section 3c, replace ``- **Parallel** if the wave set has two or more tasks, the plan's Parallel is `auto`, and `--serial` wasn't given.`` with ``- **Parallel** if the wave set has two or more tasks, the plan's Parallel is `auto`, `--serial` wasn't given, and no containment failure has switched this run to serial (3e item 3).``
2. Delete every line from the line `### 3e. Parallel wave` up to, but not including, the line `When every task in the wave set has either committed in its worktree or ended in a block:`, and put this block in their place, so that one empty line separates it from that line:

   ````markdown
   ### 3e. Parallel wave

   Let **BASE** be `git rev-parse HEAD` in MAIN now: the wave's starting commit. Cut the wave set, in **dispatch order** (see Definitions), into batches of at most Max parallel tasks (or `--max-parallel`). Every batch starts from BASE, and nothing in MAIN changes until item 7: the workers work and commit in their worktrees, and each task's failure-log entries go in the failure log inside its worktree. Before each batch, **check the limits** (see Definitions). For each batch:

   1. **Create worktrees.** Each task's worktree is `<WT_ROOT>/worktrees/<task ID>`. For each task: `git worktree add -b <task branch> "<WT_ROOT>/worktrees/<task ID>" <BASE>`. If Worktree setup isn't `none`, run it there: `cd "<worktree>" && ORCASTRAT_MAIN="<MAIN>" ORCHESTRATINATOR_MAIN="<MAIN>" <setup command>`; the old name is set too, for setup commands in plans written before the rename. A failure here → go to **Stop** with reason SETUP; it's an environment problem, not a task problem.
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
      - Any other `DONE` or `DONE_WITH_CONCERNS` → check scope with `bash "${CLAUDE_PLUGIN_ROOT}/scripts/scope-check" "<worktree>" <BASE> "<path>" ...`, passing each path in the task's Files, then the task's report file and failure log (see Definitions), each as its own double-quoted argument. Anything but `OK` → failed attempt in the wave, with the description `scope violation: <the printed paths, comma-separated>`. Otherwise verify in the worktree as in 3d item 5, with the worktree as the directory: the command, `review`, or both, and the reviewer after `DONE_WITH_CONCERNS`. The reviewer also gets the `Worktree:` line, and after `DONE_WITH_CONCERNS` its `Report:` line names the report file under the worktree. A failure → failed attempt in the wave, with the description 3d item 5 gives it. On success, if `git -C "<worktree>" status --porcelain` lists a path outside the plan directory, commit those paths for the worker: `git -C "<worktree>" add -A -- ":(exclude)<plan dir>"`, then `git -C "<worktree>" commit -m '<task ID>: <the task's Commit message>'`, writing each `'` in the message as `'\''`. The task is then **ready to integrate**.
   5. **Failed attempt in the wave.** Find the attempt number `<n>` as Definitions says, but counted in the failure log inside the worktree, `<worktree>/<failure log>`, and find the task's current tier and rung (see Definitions). Every **failure-log entry** for this task goes in that file.
      - **Resume** when the last entry of the worktree's failure log doesn't say `- Then: resumed`. For a scope violation, first reset the worktree, keeping the report and the failure log: run `mkdir -p "<WT_ROOT>/hold"`; with `cp`, copy `<worktree>/<report file>` to `"<WT_ROOT>/hold/<task ID>.md"` and `<worktree>/<failure log>` to `"<WT_ROOT>/hold/<task ID>-failures.md"`; run `git -C "<worktree>" reset --hard <BASE>` and `git -C "<worktree>" clean -fd`; run `mkdir -p "<worktree>/<plan dir>/notes/reports"`, copy both held files back to where they came from, and run `rm -rf "<WT_ROOT>/hold"`. Then append the failure-log entry, with Then `resumed`. Once item 4 has checked every report of the batch, send all of the batch's resumes at once, one SendMessage call per task in a single message, each addressed to the agent ID its dispatch returned, with the message **Failed attempt** item 1 gives, except that its `Report:` line is `Report: <worktree>/<report file>`. If a call returns an error, change that entry's Then line to `resume failed (<error>), escalated to <next tier>`, or to `resume failed (<error>), blocked (STUCK)` when the rung is 3 or the current tier is `specialist`, and the task leaves the wave. When the resumed workers have replied, run the containment check (item 3), then check each resumed task's report as in item 4.
      - Otherwise the task **leaves the wave**. Append its failure-log entry, with Then `escalated to <next tier>` when the rung is below 3 and the current tier isn't `specialist` (the next tier is one up the ladder, see **Failed attempt**), or `blocked (STUCK)` otherwise. Leave its worktree: item 11 or item 12 settles the task once the wave is integrated.
   6. Once every task of the batch is ready to integrate, has left the wave, or is recorded for a block, go on with the next batch.
   ````

3. Run Verify.

**Done when**

- 3c's Parallel bullet names the containment fallback.
- 3e starts with the paragraph and items 1–6 of Step 2, and the line `When every task in the wave set has either committed in its worktree or ended in a block:` and everything below it are unchanged.
- The old `Retry:` dispatch lines, the soft-reset and the SCOPE block are gone from 3e.

### M07-T08: run integrates with integrate, merges conflicts with the merger, and settles the wave

- Kind: change
- Tier: worker
- Status: done
- Wave: 3
- Depends on: M07-T02, M07-T07, M03-T05, M05-T09
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'scripts/integrate" <task branch> <BASE>' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'orcastrat:merger' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'git -c core.editor=true cherry-pick --continue' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'already-integrated <UTC> <task ID>' plugins/orcastrat/skills/run/SKILL.md && grep -qF '12. **Blocks**' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'git update-ref refs/orcastrat/discarded/<task ID>-<n> <task branch>' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'shows exactly one commit' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'wave <n> done (<task IDs>)' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'When every task in the wave set has either committed' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '$(' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run integrates parallel tasks with integrate and the merger, and reruns failed merges serially`

**Objective**

`run`'s parallel wave (3e items 7–12) integrates ready tasks in task ID order with `integrate`, resolves conflicts with the `merger`, reruns merge failures serially, records each task with its own status commit, escalates tasks that left the wave through 3d, and writes the wave's blocks last (D120, D123, D124, D127, D128, D130, D131, D132, D134).

**Read first**

- `docs/orcastrat-execution-spec.md` §6 items 4–6 and 8
- plan.md Decisions D120, D123, D124, D128, D130, D131, D132 and D134
- `plugins/orcastrat/skills/run/SKILL.md` section 3e, from the line `When every task in the wave set has either committed in its worktree or ended in a block:` to the line `### 3f. Finish the milestone`
- `plugins/orcastrat/agents/merger.md` (its input lines and reply)

**Interfaces**

- Consumes: `integrate <task-branch> <base>` (M03-T05)
- Consumes: `integrate stdout: OK, or CONFLICT then one conflicted file per line through print_path, with the cherry-pick left in progress` (M03-T05)
- Consumes: merger dispatch lines `Merge: <task ID>`, `Brief: <path>`, one `Merged: <path>` per already-merged task whose Files include a conflicted file, one `Conflicted: <path>` per conflicted file (M07-T02)
- Consumes: merger reply `STATUS: RESOLVED | UNRESOLVED` and `NOTE: <one line; for UNRESOLVED, why>` (M07-T02)
- Consumes: `**ready to integrate**` (M07-T07)
- Consumes: `**leaves the wave**` (M07-T07)
- Consumes: `chore(plan): <task ID> done` with the trailer `Orcastrat-Task: <task ID>` (M05-T09)
- Consumes: `chore(plan): <task ID> attempt <n> failed` (M05-T09)
- Produces: `**merge-failed**`
- Produces: `- Process: already integrated`
- Produces: `already-integrated <UTC> <task ID>` line in `notes/run-log.md`
- Produces: `12. **Blocks**`

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, delete every line from the line `When every task in the wave set has either committed in its worktree or ended in a block:` up to, but not including, the line `### 3f. Finish the milestone`, and put this block in their place, followed by one empty line:

   ````markdown
   When every batch is done:

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

      Otherwise continue the cherry-pick in MAIN: `git add -- "<conflicted file>" ...`, naming every conflicted file, then `git -c core.editor=true cherry-pick --continue`. If it stops on another conflict in the same range, `git diff --name-only --diff-filter=U` lists the new conflicted files: invoke a new merger for them, the same way. If it fails without a conflict (for example, a commit became empty), the merge has failed. Once the cherry-pick has completed, Verify the task's Verify command in MAIN (see Definitions), if it has one; a failure means the merge has failed. Otherwise the task is integrated.

      When the merge has failed, run `git cherry-pick --abort`; if that fails because no cherry-pick is in progress, run `git reset --hard <PRE>` instead. Then run `git clean -fd`. The task is **merge-failed**. That isn't a failed attempt, and it doesn't stop the run: go on with the next task in item 7.
   9. **Re-verify the combined result.** If two or more tasks were integrated, Verify each integrated task's Verify command again in MAIN (see Definitions), deduplicated. A task can pass alone and fail once its wave-mates land. On failure, mark the failing task `blocked` with `- Blocked: VERIFY — failed after wave integration`, write the wave's blocks (item 12), and go to **Stop** without rolling back: the user decides.
   10. **Record** each integrated task, in task ID order. Run `mkdir -p "<MAIN>/<plan dir>/notes/reports"`. With `cp`, copy `<worktree>/<report file>` to `<MAIN>/<report file>`, and `<worktree>/<failure log>` to `<MAIN>/<failure log>`. Set the task's Status to `done`. Then `git add -A` and `git commit -m "chore(plan): <task ID> done" -m "Orcastrat-Task: <task ID>"`. Then clean it up: `git worktree remove --force "<worktree>"` and `git branch -D <task branch>`. If removal fails (on Windows a process can hold a file lock), leave it, mention it in your report, and continue.
   11. **Escalations and merge failures**, in task ID order:
       - A task that **left the wave** with Then `escalated to <next tier>` (item 5): run `mkdir -p "<MAIN>/<plan dir>/notes/reports"`; with `cp`, copy `<worktree>/<report file>` to `<MAIN>/<plan dir>/notes/reports/<task ID>-attempt<n>.md`, where `<n>` is the failed attempt's number, and `<worktree>/<failure log>` to `<MAIN>/<failure log>`; then remove its worktree and branch as in item 10. Add `- Escalated: <current tier> → <next tier> (<the description>)` under the task, below its other lines, leaving its Tier field unchanged. Then `git add -A` and `git commit -m "chore(plan): <task ID> attempt <n> failed"`, with no `Orcastrat-Task:` trailer. Then run the task through the serial wave (**3d**) from item 1, without checking the limits: it dispatches a fresh worker at the next tier, with the `Failures:` line.
       - A **merge-failed** task (item 8): with `cp`, copy `<worktree>/<failure log>` to `<MAIN>/<failure log>`, then remove its worktree and branch as in item 10. If its Verify includes a command, Verify it in MAIN (see Definitions). If that passes, its changes are already in the integrated result: set its Status to `done`, add `- Process: already integrated` under it, append the line `already-integrated <UTC> <task ID>` to `<plan dir>/notes/run-log.md`, with the current UTC time from `date -u +%Y-%m-%dT%H:%M:%SZ`, then `git add -A` and `git commit -m "chore(plan): <task ID> done" -m "Orcastrat-Task: <task ID>"`, and dispatch no worker. Otherwise rerun it through the serial wave (**3d**) from item 1, without checking the limits, on top of the integrated result, at the tier that succeeded in its worktree, which is its current tier. The rerun adds no `- Escalated:` line and no failure-log entry.
   12. **Blocks**, in task ID order, once item 11 is done, or just before any **Stop** that item 9 or item 11 reaches, so that Stop's commit records them:
       - A task recorded for **Block with GAP** (item 4, reason `GAP` or `VACUOUS`): write its block as **Block with GAP** says for parallel mode, and leave its worktree for the user.
       - A task that **left the wave** with Then `blocked (STUCK)` (item 5): run `git rev-parse <task branch>` and note the sha it prints. Run `git update-ref refs/orcastrat/discarded/<task ID>-<n> <task branch>`, where `<n>` is the failed attempt's number. Copy its report and failure log into MAIN, and remove its worktree and branch, as in item 11. Mark the task `blocked` with `- Blocked: STUCK — <the description>; discarded attempt <sha>, kept at refs/orcastrat/discarded/<task ID>-<n>`.

       If any task of the wave ended blocked, go to **Stop**, reporting each blocked task with its reason.
   ````

2. Run Verify.

**Done when**

- 3e continues after item 6 with `When every batch is done:` and items 7–12 of Step 1, directly followed by one empty line and `### 3f. Finish the milestone`.
- The old single-commit check, the `MERGE` block on a conflict and the one `wave <n> done` commit are gone.

### M07-T09: run's failed-attempt, GAP, Stop and history rules match the new parallel wave

- Kind: change
- Tier: worker
- Status: done
- Wave: 4
- Depends on: M07-T08, M05-T09
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'the reset that undoes a failed merge and the reset after a containment failure' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'follows 3e item 5 instead, until it leaves the wave' plugins/orcastrat/skills/run/SKILL.md && grep -qF '3e item 12 writes the block' plugins/orcastrat/skills/run/SKILL.md && grep -qF '3e item 12 adds the Open question' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'MERGE' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'finish the wave' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'Parallel tasks follow 3e item 5 instead.' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edits are made)
- Commit: `feat(orcastrat): run's failure, GAP and Stop rules follow the rebuilt parallel wave`

**Objective**

`run`'s history rule, **Failed attempt** intro, **Block with GAP** parallel text and Stop reasons match 3e as M07-T07 and M07-T08 rewrote it: the merge and containment resets are allowed, parallel blocks are written by 3e item 12, and `MERGE` is no longer a Stop reason (D123, D130, D132, D133).

**Read first**

- plan.md Decisions D123, D132 and D133
- `plugins/orcastrat/skills/run/SKILL.md` section `## Operating rules for long runs`, the `**Never push.**` bullet
- `plugins/orcastrat/skills/run/SKILL.md` sections `## Failed attempt` (its first paragraph), `## Block with GAP` and `## Stop`

**Interfaces**

- Consumes: `12. **Blocks**` (M07-T08)
- Consumes: `## Failed attempt` (M05-T09)
- Produces: none

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, in the `**Never push.**` bullet, replace `that discards a failed or interrupted attempt (see Definitions).` with `that discards a failed or interrupted attempt (see Definitions), and, in a parallel wave (3e), the reset that undoes a failed merge and the reset after a containment failure.`
2. In `## Failed attempt`, replace `Parallel tasks follow 3e item 5 instead.` with `A task in a parallel wave follows 3e item 5 instead, until it leaves the wave; from then on it runs serially and follows this section.`
3. In `## Block with GAP`, replace ``In parallel mode, add the question to plan.md's Open questions tagged with the task ID, mark the task `blocked` with `- Blocked: GAP — <question>`, finish the wave's other tasks first (item 6 of 3e, Integrate, onward), then **Stop**.`` with this text:

   ```text
   In parallel mode, 3e item 4 records the task, and 3e item 12 writes the block once the wave's other tasks are integrated and settled: add the question to plan.md's Open questions tagged with the task ID, and mark the task `blocked` with `- Blocked: GAP — <question>`. Its worktree stays for the user. Then **Stop**.
   ```

4. In `## Block with GAP`, replace ``in parallel mode, add the Open question to plan.md and mark the task `blocked` with `- Blocked: VACUOUS — <worker's NOTE>`.`` with ``in parallel mode, 3e item 12 adds the Open question to plan.md and marks the task `blocked` with `- Blocked: VACUOUS — <worker's NOTE>`.``
5. In `## Stop`, item 3, replace `VACUOUS, MERGE, STRAY` with `VACUOUS, STRAY`.
6. Run Verify.

**Done when**

- The history rule names the merge and containment resets; **Failed attempt** says a parallel task follows 3e item 5 until it leaves the wave; **Block with GAP** says 3e item 12 writes parallel GAP and VACUOUS blocks; `MERGE` appears nowhere in the file.
- Nothing else in the file changed.

### M07-T10: run commits every in-scope path a parallel worker left, plan directory included

- Kind: change
- Tier: worker
- Status: todo
- Wave: 5
- Depends on: M07-T07, M07-T09
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'add -A -- ":(exclude)<report file>" ":(exclude)<failure log>"' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'diff --cached --name-only' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'such as an investigate task' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '"<worktree>" add -A -- ":(exclude)<plan dir>"' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '$(' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edit is made)
- Commit: `fix(orcastrat): run commits every in-scope path a parallel worker left, plan directory included`
- Origin: review

**Objective**

In `run`'s parallel wave, 3e item 4 commits every uncommitted path in the task's worktree except its report file and failure log, so an in-scope path in the plan directory, such as an investigate task's note, is integrated instead of deleted with the worktree (D136).

**Read first**

- plan.md Decisions D121, D131 and D136
- `plugins/orcastrat/skills/run/SKILL.md` section `## Definitions`, the **Report file** and **Failure log** entry
- `plugins/orcastrat/skills/run/SKILL.md` section 3e, item 4 (its last bullet) and item 10

**Interfaces**

- Consumes: `**ready to integrate**` (M07-T07)
- Produces: none

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section 3e, item 4, last bullet (the one starting ``- Any other `DONE` or `DONE_WITH_CONCERNS` → check scope``), replace this text, which is the end of that bullet's line:

   ```text
   On success, if `git -C "<worktree>" status --porcelain` lists a path outside the plan directory, commit those paths for the worker: `git -C "<worktree>" add -A -- ":(exclude)<plan dir>"`, then `git -C "<worktree>" commit -m '<task ID>: <the task's Commit message>'`, writing each `'` in the message as `'\''`. The task is then **ready to integrate**.
   ```

   with this text, on the same line:

   ```text
   On success, commit what the worker left, for the worker, since integration cherry-picks only commits: run `git -C "<worktree>" add -A -- ":(exclude)<report file>" ":(exclude)<failure log>"`, which stages every uncommitted path except those two. The scope check passed, so each staged path is in the task's Files, including any in the plan directory, such as an investigate task's note, which would otherwise be lost when the worktree is removed. If `git -C "<worktree>" diff --cached --name-only` then prints anything, run `git -C "<worktree>" commit -m '<task ID>: <the task's Commit message>'`, writing each `'` in the message as `'\''`. The report file and failure log stay uncommitted: the task's status commit carries them (item 10). The task is then **ready to integrate**.
   ```

2. Run Verify.

**Done when**

- 3e item 4 stages with the two `:(exclude)` pathspecs for the report file and failure log, and commits only when `git -C "<worktree>" diff --cached --name-only` prints anything.
- The worktree command `git -C "<worktree>" add -A -- ":(exclude)<plan dir>"` is gone; 3d item 6's `git add -A -- ":(exclude)<plan dir>"` in MAIN is unchanged.
- Nothing else in the file changed.

### M07-T11: run records the integrated tasks and settles the wave when the combined re-verify fails

- Kind: change
- Tier: worker
- Status: todo
- Wave: 6
- Depends on: M07-T07, M07-T08, M07-T10
- Files: `plugins/orcastrat/skills/run/SKILL.md`
- Verify: `grep -qF 'But settle the wave before you go to **Stop**, so that the next run can resume from git.' plugins/orcastrat/skills/run/SKILL.md && grep -qF '**Record** each integrated task whose Verify command passed, or that has no command' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'up to and including its commit' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'integrated task whose Verify command failed, in task ID order' plugins/orcastrat/skills/run/SKILL.md && grep -qF 'Its commits stay on the plan branch: say so in the Stop report.' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF 'On failure, mark the failing task' plugins/orcastrat/skills/run/SKILL.md && ! grep -qF '$(' plugins/orcastrat/skills/run/SKILL.md`
- Fails first: no (skill text with no test; the Verify greps fail until the edit is made)
- Commit: `fix(orcastrat): run records integrated tasks and settles the wave before a re-verify Stop`
- Origin: review

**Objective**

When 3e item 9's combined re-verify fails, `run` records every integrated task whose Verify passed with its own status commit, settles the wave's escalated and merge-failed tasks without dispatching them, and blocks each failing task with its report and failure log in MAIN before it goes to Stop, so the next run can resume from git (D137).

**Read first**

- `docs/orcastrat-execution-spec.md` §6 item 6
- plan.md Decisions D120, D132 and D137
- `plugins/orcastrat/skills/run/SKILL.md` section 3e, items 9 to 12

**Interfaces**

- Consumes: `**leaves the wave**` (M07-T07)
- Consumes: `**merge-failed**` (M07-T08)
- Consumes: `12. **Blocks**` (M07-T08)
- Produces: none

**Steps**

1. In `plugins/orcastrat/skills/run/SKILL.md`, section 3e, replace this whole line, item 9:

   ```text
   9. **Re-verify the combined result.** If two or more tasks were integrated, Verify each integrated task's Verify command again in MAIN (see Definitions), deduplicated. A task can pass alone and fail once its wave-mates land. On failure, mark the failing task `blocked` with `- Blocked: VERIFY — failed after wave integration`, write the wave's blocks (item 12), and go to **Stop** without rolling back: the user decides.
   ```

   with these six lines, which keep item 9's place directly above the line starting `10. **Record**`. Each of the last five lines starts with three spaces, which are part of the literal content:

   ```text
   9. **Re-verify the combined result.** If two or more tasks were integrated, Verify each integrated task's Verify command again in MAIN (see Definitions), deduplicated. A task can pass alone and fail once its wave-mates land. On failure, don't roll back: the user decides. But settle the wave before you go to **Stop**, so that the next run can resume from git. In this order:
      - **Record** each integrated task whose Verify command passed, or that has no command, as item 10 says, in task ID order. Each gets its status commit with the `Orcastrat-Task:` trailer, so `recover` finds it `done`.
      - For each task that left the wave to be escalated (item 5), in task ID order, do what item 11's first bullet says, up to and including its commit, but don't run the task through **3d**: the next run dispatches it at the next tier.
      - For each **merge-failed** task (item 8), in task ID order, copy its failure log into MAIN and remove its worktree and branch, as item 11's second bullet says, but don't Verify or rerun it. It stays `todo`, and the next run reruns it.
      - For each integrated task whose Verify command failed, in task ID order, copy its report file and failure log into MAIN and remove its worktree and branch, as item 10 says, without setting it `done` or committing. Then mark it `blocked` with `- Blocked: VERIFY — failed after wave integration`. Its commits stay on the plan branch: say so in the Stop report.
      - Write the wave's blocks (item 12), then go to **Stop**. Stop's commit records the VERIFY blocks, with their reports and failure logs.
   ```

2. Run Verify.

**Done when**

- 3e item 9 ends with the five bullets of Step 1, in that order, directly followed by the line starting `10. **Record**`.
- The sentence `On failure, mark the failing task` is gone, and items 10 to 12 are unchanged.
- Nothing else in the file changed.
