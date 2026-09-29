# M05 survey: worker commits, resume, runaway guard

Scope: Changes 1, 2, 3 (spec `docs/orcastrat-execution-spec.md` §2–§4, §1.3, §1.5) in `plugins/orcastrat/skills/run/SKILL.md`, all six worker agents, `plugins/orcastrat/scripts/`, `plugins/orcastrat/reference/plan-format.md`, and `plugins/orcastrat/skills/status/SKILL.md`. Organized by the milestone's Outline bullets.

## Governing spec text (verbatim, for reference)

- §1.3 (`docs/orcastrat-execution-spec.md:15`): "No design decisions below the plan. Workers and the orchestrator still stop on GAPs rather than making rulings. The `decider` (Change 12) recommends; only `local` recommendations under `Auto-decide: local` are applied without the user."
- §1.5 (`:17`): "Cost is display-only. Nothing gates, pauses or stops on spend. Limits exist only for non-progress (Change 3) and opt-in pauses (`LIMIT`)."
- §2 Change 1 (`:20`-`:44`), §3 Change 2 (`:46`-`:54`), §4 Change 3 (`:56`-`:70`) are quoted piecemeal below against the current code.

## Outline bullet 1 — `run` 3f item 2: milestone Base via D78

Current text, `plugins/orcastrat/skills/run/SKILL.md:217`:
```
2. **Review.** Every milestone is reviewed, whatever its format. Find its **Base**: `git log --format=%H --grep="^chore(plan): start <ID>$"`, taking the oldest match (the last line printed). ...
```
This is exactly the pre-D78 form the Decision describes as buggy (it can match another plan's `chore(plan): start <ID>` if IDs collide across plans).

D78 (`plans/orcastrat-execution/plan.md:161`) gives the exact two commands to splice in first:
1. `git log --diff-filter=A --format=%H -- "<plan dir>/plan.md"` — take the **last line** (oldest = the commit that added `plan.md`).
2. `git log --format=%H --grep="^chore(plan): start <ID>$" <that commit>..HEAD` — take the oldest match (last line printed), same as today, but now scoped to `<that commit>..HEAD`.

D78 also says: "The installed plugin was patched the same way for this build (D67)." The patched original is at `~/.claude/plugins/orchestratinator-agents-backup-2026-09-24/skills-run/` (outside the repo, for reference only — not something to read/copy from, per D66/D67 they're a hand patch of the *installed* plugin, not of this repo).

## Outline bullet 2 — `run-state` script and `tests/orcastrat/run-state.bats`

Neither exists yet: `plugins/orcastrat/scripts/` currently has only `integrate`, `lib/`, `push-check`, `recover`, `scope-check`, `verify` (no `run-state`); `tests/orcastrat/` has no `run-state.bats`. Nothing in the repo references `run-state`, `active-run`, or `run-log.md` yet (grep of `plugins/orcastrat/` and `tests/orcastrat/` for those three strings returns nothing) — this is new work with D06 as its only governing source.

D06 (`plans/orcastrat-execution/plan.md:89`), verbatim spec of the script:
- `run-state start <plan-dir>` writes `<git-dir>/orcastrat/active-run` (per-checkout `git rev-parse --git-dir`) as `key=value` lines: `plan=<plan-dir>`, `started=<UTC epoch seconds>`, `heartbeat=<UTC epoch seconds>`, `blocks=0`, `block_heartbeat=`.
- `run-state beat` updates `heartbeat`.
- `run-state elapsed` prints whole minutes since `started`.
- `run-state end <PAUSE|STOP|COMPLETE> <reason>` deletes the marker.
- `start` and `end` also append one line each to `plans/<slug>/notes/run-log.md`, which `run-report` (M11) reads.
- When the Stop hook's loop guard releases (M08), it replaces the marker with `<git-dir>/orcastrat/active-run.released`, one line holding the reason.
- The hook's fast path (M08) tests `$CLAUDE_PROJECT_DIR/.git/orcastrat/active-run` directly when `.git` is a directory, and reads the `gitdir:` line of `.git` with `sed` when `.git` is a file (worktree); it never runs git on that path.

D07 (`plan.md:90`): "`run` appends one line per returned agent to `plans/<slug>/notes/run-log.md` (task or milestone, agent, tokens, duration, from the task notification), and `run-report` sums them in its usage section." — this is a separate line format from `start`/`end`'s lines; both land in the same file. M05 only needs the `start`/`end` lines; the per-agent lines are D07/M05's leftover-background rule (bullet 3) and other per-dispatch bookkeeping the milestone will need to spell out exactly (D07 doesn't give the literal line format, only its fields).

Build conventions to follow (from M02, `plans/orcastrat-execution/M02-portable-runtime.md:14`, and the existing scripts):
- Bash 3.2 compatible: no associative arrays, `mapfile`, `${var,,}`.
- Extensionless name under `plugins/orcastrat/scripts/` (D04), invoked as `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" ...`.
- Source `plugins/orcastrat/scripts/lib/common` for `print_path` (`plugins/orcastrat/scripts/lib/common:8`) and print any path it emits through it (D43/D44).
- D55 exit-code convention (`plan.md:138`): exit 0 after printing the fixed-format result; exit 2 with one `error: <message>` line on stderr and nothing on stdout for a usage/environment error (wrong arg count, not-a-directory, not-inside-a-work-tree, unresolvable commit-ish). `run-state` will need its own equivalent list (e.g., `<plan-dir>` not a directory for `start`; no active marker for `beat`/`elapsed`/`end`).
- Existing scripts' header comment style: a `#!/usr/bin/env bash` block describing signature, behavior, exit codes, "Bash 3.2 compatible," then `. "$(dirname "${BASH_SOURCE[0]}")/lib/common"`, then a local `fail()` helper (see `plugins/orcastrat/scripts/push-check:1`-`21` for the full pattern).
- Bats convention (`tests/orcastrat/push-check.bats:1`-`16`): `bats_require_minimum_version 1.5.0`; `setup()` loads `test_helper`, builds a fixture repo via `make_fixture_repo` (`tests/orcastrat/test_helper.bash:9`) under `$BATS_TEST_TMPDIR/fixture repo` (space in the name, deliberately); a `run_script` helper runs the script with a stub `cygpath` first on `PATH` (`make_cygpath_stub`, `test_helper.bash:25`) via `run --separate-stderr env PATH=...`. Usage-error tests assert `status -eq 2`, empty stdout, exact `stderr`.

## Outline bullet 3 — leftover background work (D49)

Not present anywhere in `plugins/orcastrat/skills/run/SKILL.md` today — no mention of "background," "Stop Task," or a stop-task tool call. This is new text.

D49 (`plan.md:132`) / spec §4 (`docs/orcastrat-execution-spec.md:67`): "After every agent returns, if its completion notice reports background work still running, `run` stops it with the Stop Task tool. If that fails, `run` appends a warning line to `plans/<slug>/notes/run-log.md` naming the agent and quoting the notice, and continues. `run` never kills processes by PID."

The Context bullet (`M05-commits-resume-runaway-guard.md:14`) gives the exact log-line format: `background-warning <UTC> <agent> <task or milestone ID> "<notice text>"`.

A `TaskStop` tool is available to the session (listed among the deferred tools this conversation was given); this is presumably what "the Stop Task tool" refers to, but its exact schema/behavior wasn't loaded/inspected in this survey (see Unconfirmed).

Per the Context bullet, this rule applies after **every** agent return (workers, reviewers, scouts, planner, and every later-milestone agent), stated once in `run`'s dispatch section rather than repeated at each dispatch point — i.e., a single generic rule, not a per-agent-type addition to 3a/3d/3e/3f's individual dispatch steps.

## Outline bullet 4 — Worker agents: commit/precedence rules, breaker, Failures-log reading

All six worker agent files are **byte-identical in body** (only frontmatter name/model/effort/maxTurns differ): `worker.md`, `worker-light.md`, `worker-heavy.md`, `specialist.md`, `worker-mini-serial.md`, `worker-mini-parallel.md`. Each has the same `## Rules` list at the same relative line (line 48 in every file, e.g. `plugins/orcastrat/agents/worker.md:48`):

```
- Don't edit plan.md or milestone files. Don't commit, stash, reset, switch branches, or push.
- Project instruction files (CLAUDE.md, AGENTS.md, CLAUDE.local.md, `.claude/rules/`, and any nested or linked copies, whatever they're called) govern coding conventions, style, and project knowledge. They do not govern git. Where they say anything about committing, pushing, branching, stashing, resetting, or rewriting history, this plugin's rules replace them for the length of this task.
- The orchestrator commits your work. If you commit, your work can be lost.
```
(lines 48–50 in every file). Change 1 requires, per spec §2 (`docs/orcastrat-execution-spec.md:24`-`28`) and the milestone Context (`M05-commits-resume-runaway-guard.md:16`-`20`):
- Add: "Commit your changes when the task is done and its Verify passes. Every commit subject starts with the task ID: `<task ID>: <message>`. Multiple commits per task are fine."
- Remove "Don't commit, ... or push" 's commit part, keep "stash, reset, switch branches, or push" forbidden (still never push/branch/rebase/reset/stash/rewrite-history — Change 1: "Still never push, switch branches, rebase, reset, stash, or rewrite history").
- Reword the precedence bullet (line 49) to add: "Committing your task's changes is expected," per Change 1 and the Context bullet's "The precedence rule, reworded."
- Delete line 50 entirely ("The orchestrator commits your work. If you commit, your work can be lost.") — Context bullet: "Remove the 'don't commit' rules and 'your work can be lost'."

The worker breaker and Failures-log-reading rules are **not present anywhere** in the current worker body — genuinely new text. Exact wording to add, from the milestone Context (`:34`) and spec §4 (`docs/orcastrat-execution-spec.md:62`, `:64`):
- Breaker: "stop after the 3rd failed Verify run after implementation, where the expected red run doesn't count, and report `BLOCKED` / `STUCK` with one-line `HYPOTHESIS:` and `FIXES TRIED:`." The current `## Report` block (e.g. `worker.md:60`-`71`) has no `HYPOTHESIS:`/`FIXES TRIED:` lines — these need to be added to the reply template, at least conditionally for `STUCK`.
- Failures-log reading: "When a `Failures: <path>` line is present, read the failure log and the preserved reports, don't repeat those approaches, and report a GAP if they show the Steps can't be followed." This corresponds to spec §4's "Escalation context" (`docs/orcastrat-execution-spec.md:64`): a fresh worker at the next tier gets `Failures: <path>` in its dispatch, reads the failure log and `notes/reports/<task-id>-attempt<n>.md` (never the failed transcript).

`agent-files.bats` (`tests/orcastrat/agent-files.bats`) checks tools/model/effort/maxTurns per tier (test at `:114`), the `## Search and command bounds` section verbatim (`:163`, `:185`), and forbidden tools (`:104`) — none of it inspects the `## Rules` prose, `## Before anything else`, or `## Report` block, so these edits won't collide with that bats file's assertions as long as frontmatter, the bounds section, and tool list are untouched.

## Outline bullet 5 — `run` preflight: clean-tree SETUP, `run-state start`

Current preflight (`plugins/orcastrat/skills/run/SKILL.md:51`-`61`), item 1: "**Working tree is clean.** `git status --porcelain` prints nothing. If it prints anything, stop: the user must commit or discard first." No `SETUP` reason is named here (Stop reasons list at `:287` already includes `SETUP` generically), and no rationale for `git clean -fd` is given. Change 1 (`docs/orcastrat-execution-spec.md:32`): "**Clean tree required.** ... Failed attempts are cleaned with `git clean -fd`, which would otherwise delete the user's untracked files. A dirty tree stops the run with `SETUP`, listing the files." So item 1 needs: explicit `SETUP` reason, list the files (not just "stop"), and state the `git clean -fd` rationale.

`2c. Prepare` (`:82`-`87`) currently ends at item 4 ("Commit any of these changes: `chore(plan): start run`.") with no `run-state start` call. Per D06 ("`start` runs at the end of preflight, after 'Proceed?'") and Outline bullet 25/35, a step 5 needs to call `bash "${CLAUDE_PLUGIN_ROOT}/scripts/run-state" start "<plan dir>"` at the very end of 2c (i.e., after 2c's existing commit, since 2b's "Proceed?" already precedes 2c entirely).

## Outline bullet 6 — `run` per task

**BASE recording**: already present. Serial: `plugins/orcastrat/skills/run/SKILL.md:164`, "Record `git rev-parse HEAD` before dispatching," inside 3d item 1. Parallel: `:187`, "Let **BASE** be `git rev-parse HEAD` on the plan branch now," at the top of 3e (once per batch, not per task — see Conflicts).

**scope-check with Files + report file + failure log**: current call, 3d item 4 (`:178`): `bash "${CLAUDE_PLUGIN_ROOT}/scripts/scope-check" "<MAIN>" <recorded HEAD> "<path>" ...`, passing **only** the task's Files paths. Per Change 1 (`docs/orcastrat-execution-spec.md:34`) and the milestone Context (`:22`-`23`), the argument list must also include the report file (`plans/<slug>/notes/reports/<task-id>.md`, not written until M06 but still in scope from now) and the failure log (`plans/<slug>/notes/<task ID>-failures.md`). `scope-check`'s own signature (`plugins/orcastrat/scripts/scope-check:1`-`2`, D05) is `scope-check <dir> <base> <files...>` and already accepts an arbitrary file list — no script change needed, only the call site.

**On success, status commit with trailer**: see Conflicts — the current "Commit a task" definition (`:38`-`39`) and 3d item 6 ("Code and status land in one commit") implement the **pre-Change-1** model (run makes the one and only commit, using the task's Commit field as the subject). Change 1 replaces this with: worker commits its own code (`<task ID>: <message>`, no trailer, possibly several commits); `run` then makes a **separate** bookkeeping-only commit, subject `chore(plan): <task ID> done`, trailer `Orcastrat-Task: <task ID>` (spec §2, `docs/orcastrat-execution-spec.md:36`).

**push-check after every attempt**: already present, 3d item 2 (`:167`): `bash "${CLAUDE_PLUGIN_ROOT}/scripts/push-check" "<MAIN>" <recorded HEAD>` → anything but `OK` → **Stop** `PUSHED`. Change 1's "after every attempt" phrasing implies this must also run after a *failed* attempt (before discarding/resetting), not only on the path to success — worth flagging: the current placement (item 2, before the report is even read in item 3) already runs unconditionally for every dispatch outcome, so it already satisfies "after every attempt" as placed. No structural gap found here, but note it precedes the RED/STATUS branching (items 3+), so it already covers both success and failure paths as written.

**Remove the soft-reset part of the stray-commit guard**: 3d item 2 (`:168`), currently: "Run `git log --oneline <recorded HEAD>..HEAD`. If it prints any commit, run `git reset --soft <recorded HEAD>` and remember to add `- Process: worker committed on its own; reset and recommitted` under the task." D23 (`plan.md:106`): "remove only the soft-reset. The branch check and `STRAY` stay." So the `git branch --show-current` / `STRAY` check (the first bullet of item 2) stays; this whole second bullet (the `git log --oneline` + `git reset --soft` + `- Process:` note) is deleted outright, since under Change 1 the worker committing on its own is now the *expected* behavior, not a stray to undo.

## Outline bullet 7 — `run` failed attempts (resume, escalation ladder)

The current `## Retry` section (`plugins/orcastrat/skills/run/SKILL.md:256`-`267`) implements a **single retry, one tier up, always a fresh dispatch** — no resume-same-agent step at all. This is the biggest rewrite in the milestone. Current text:
- "Each task gets at most one retry, one tier up the ladder... If the task has already been retried in this run, or its tier is already `specialist`: mark it `blocked`..."
- "Otherwise, discard the attempt: in serial mode, `git reset --hard HEAD` and `git clean -fd`... Add `- Escalated: <from> → <to> (<one-line reason>)`... Commit those lines in MAIN... `chore(plan): <task ID> attempt 1 failed`, with no `Orcastrat-Task:` trailer. Then dispatch again..." with a `Retry:`/`Reason:`/`Verify tail:` block appended to the next dispatch.

Per Change 2 (`docs/orcastrat-execution-spec.md:46`-`54`) and Change 3 (`:56`-`70`), and Outline bullets 41-47, this needs replacing with:
1. **Triggers** (Outline `:42`): Verify fails, reviewer FAIL, `STUCK` or no report, `RED not confirmed`. (Matches spec §4's "Failed attempt" definition, `:61`, and the existing per-branch handling already scattered through 3d items 2-5 that route to "Retry" — those branch points stay, but the target section they jump to needs the full rewrite below.)
2. **Resume once, same agent, via SendMessage** (Outline `:43`): "with the Verify tail, the REASONS, or 'turn limit reached'. Reset first only for a scope violation." — i.e., the tree is left as the worker left it unless the failure was `SCOPE`; only then does `run` reset to `BASE` before resuming.
3. **Resume-call failure fallback** (`:44`): "If the resume errors, fall back to a fresh dispatch at the next tier, and record which happened [in the failure log]."
4. **Escalation sequence, in order** (`:45`, matching spec §2 `:39` exactly): preserve the report (copy to `notes/reports/<task-id>-attempt<n>.md`, "skip preservation when the file doesn't exist" per the Context bullet since the report file doesn't exist until M06); `git reset --hard BASE` and `git clean -fd`; restore the preserved report and append the failure-log entry; commit both with subject `chore(plan): <task ID> attempt <n> failed`, **no** `Orcastrat-Task:` trailer; set `BASE = HEAD`.
5. **Cap at three rungs from the planned Tier, never past `specialist`** (`:46`): one attempt per rung plus one resume per rung (spec §4 `:60`). Current code caps at "one retry" total — needs to become up to 3 rungs × (1 attempt + 1 resume) = up to 6 attempts, with the ladder `worker-mini` → `worker-light` → `worker` → `worker-heavy` → `specialist` (already stated at `:258` and in `plan-format.md:280`), climbing at most two tiers above the planned Tier. Third-rung failure → `Blocked: STUCK`, with "the replanning note" (Outline `:46`; spec §4 `:60`: "the task most likely needs replanning, not another run: a task no three consecutive tiers can execute is a planning problem, not an execution problem").
6. **Fresh escalation dispatch carries `Failures: <path>`** (`:47`), consumed by the worker per Outline bullet 4 above.

The failure log itself: `notes/<task ID>-failures.md` (Context `:23`), one entry per failed attempt (**resumes included** — spec §4 `:63`), fields: attempt, tier, UTC timestamp, description, error (≤ last 40 lines of the Verify log — matches `verify`'s own `tail -n 40` behavior, `plugins/orcastrat/scripts/verify:51`-`53`), hypothesis, fixes tried.

`GAP` handling (`## Block with GAP`, `:269`-`273`) is untouched by this rewrite: spec §4 doesn't change it, and GAPs are still never retried/escalated (a higher tier "would just make the decision," per §1.3).

## Outline bullet 8 — `run` recovery

Current text, 2a item 6 (`plugins/orcastrat/skills/run/SKILL.md:60`): "**Interrupted-run recovery.** Run `recover`. It prints `OK`, or one line per affected `todo` task. A `done <task ID>` line means... Note those tasks; you'll mark them `done` in 2c. **Take no action on `interrupted <task ID>` lines.**"

`recover`'s actual output (`plugins/orcastrat/scripts/recover:1`-`20`, D57): `interrupted <task ID>` means a worker committed (subject `<task ID>:`) after the last trailer commit (or, if none, any commit at all on the branch) but no trailer commit exists for it — i.e., exactly an "interrupted attempt" left mid-flight by a crashed session under the new Change-1 commit model. `recover` does **not** print which tier that attempt was at.

Outline bullet 48: "treat `recover`'s interrupted-attempt list as failed attempts at their recorded tier, handled per Change 1." Since `recover` gives no tier, `run` must derive the "recorded tier" itself from the milestone file: the task's `Tier` field, adjusted by its most recent `- Escalated: <from> → <to>` line if present (the milestone file already records escalation history under the task, per `plan-format.md:240`). This derivation isn't spelled out anywhere in spec or Decisions — the milestone will need to state it explicitly as a Step, not leave it implicit.

## Outline bullet 9 — `run` limits

**Not present in the skill at all today** beyond the existing `--max-tasks` flag (`plugins/orcastrat/skills/run/SKILL.md:15`, `:147`, `:152`): "pause cleanly once N tasks have been committed in this run" / 3c: "If `--max-tasks` is in effect, trim the wave set... If `--max-tasks` is now used up, go to **Pause**." No `Max run time`, `Max milestones` handling, no header-field reading for these, no `--max-run-time`/`--max-milestones` flags in the Arguments list (`:11`-`18`).

Per spec §4 (`docs/orcastrat-execution-spec.md:65`) and Outline bullet 49:
- New header fields `Max run time: none | <n>m | <n>h`, `Max tasks: none | <n>`, `Max milestones: none | <n>` (defaults all `none`, D29).
- New flags `--max-run-time`, `--max-tasks` (already exists, "keeps its meaning" per Context `:26`), `--max-milestones`. Flag beats header field.
- Time and task limits checked **before each serial task or parallel batch** (i.e., inside 3c/3d's per-task loop and 3e's per-batch loop); milestone limit checked **after each milestone completes, including its review** (i.e., after 3f item 7, before "continue with the next milestone" at item 9).
- `Max run time` uses `run-state elapsed` (whole minutes since start).
- Hitting any limit → **Pause**, reason `LIMIT` (new — the current `## Pause` section, `:275`-`280`, only names "gates, `--milestone`, `--max-tasks`" as pause causes; `LIMIT` needs adding, and `--max-tasks` there is really the special case of the new `Max tasks`/`--max-tasks` limit).
- `run-state end` must be called at every Pause/Stop/completion (Outline `:49` last sentence) — none of `## Pause` (`:275`-`280`), `## Stop` (`:282`-`288`), or `4. Finish the plan` (`:248`-`254`) currently call it (the script doesn't exist yet either, bullet 2).

## Outline bullet 10 — `reference/plan-format.md`

Current header table (`plugins/orcastrat/reference/plan-format.md:66`-`77`) has 8 rows: Sources, Final verify, Detailing, Gates, Parallel, Max parallel, Worktree setup, Status. No `Max run time`, `Max tasks`, or `Max milestones` rows. Per D29 (`plan.md:112`) these three take defaults `none` and are optional (missing field = default; "in-progress plans keep validating"). `Auto-decide`/`Max auto-decisions` are also part of D29 but are Change 12/M12's fields (plan.md Coverage: "§13: Change 12... → M12"), so out of scope here — only the three Change-3 fields belong to M05's edit (worth the planner double-checking against D29's full list so the two milestones don't each claim/duplicate the same rows, or both skip a row).

Current `Commit` field row (`:230`): "Conventional-commit message, used verbatim. run adds the trailer `Orcastrat-Task: <task ID>` to the commit, so progress can be recovered from git history. ..." This describes the **old** single-commit model. Per Outline bullet 50 it needs to describe: the worker's own commit(s), subject `<task ID>: <message>` (worker's choice of message, prefixed); and separately, `run`'s status commit, which is where the Commit field's text and the trailer actually land now (`chore(plan): <task ID> done` — note this literal subject is fixed, not the task's Commit field value; the Commit field's relationship to the status-commit subject needs to be stated precisely, since spec §2 fixes the status-commit subject to `chore(plan): <task ID> done` regardless of the task's own Commit field text — see Conflicts).

No existing row for the failure-log path (`notes/<task ID>-failures.md`) or the report-file path pattern in scope rules — Outline bullet 50 asks for "the failure log path" to be documented; the closest existing hook is the `Files` field row (`:227`, "Every path the task may create or modify... Nothing else may change") and the `run` appended-lines list (`:238`-`241`, currently only `- Escalated:` and `- Blocked:` — will need `- Process:` if that's kept for other cases, though the stray-commit `- Process:` case is removed per bullet 6 above; check whether any other `- Process:` use survives, none found elsewhere in the skill file).

## Outline bullet 11 — `status` skill

Current shape (`plugins/orcastrat/skills/status/SKILL.md:17`-`28`):
```
<plan title> — <plan status>
Milestones: ...
Current: ...
Blocked: <item, reason, one-line detail>        (omit if none)
Open questions: <count>, listed below            (omit if none)
Working tree: clean | <n> uncommitted paths
Worktrees: none | <paths left under .git/orcastrat/ for inspection>
Next: <the exact command or action that comes next>
```
No `Failures:` line. Per Outline bullet 51 and spec §4 (`docs/orcastrat-execution-spec.md:66`, "`status` gains a `Failures:` line"), a line needs inserting — most naturally after `Blocked:` (`:23`) and before `Open questions:` (`:24`), following the same `(omit if none)` convention, listing tasks with failure logs (i.e., a `notes/<task ID>-failures.md` file present). `status` is currently read-only and restricted to `git status --porcelain`, `git log --oneline -5`, `git worktree list` (`:13`) plus reading `plan.md` and in-progress/blocked milestone files (`:15`) — it does **not** currently read `notes/` at all, so the milestone will need to add "check for `notes/<task ID>-failures.md`" (a file-existence/listing operation, not a git command) to its read set. `status-reader` (Change 20, M09) later takes this whole responsibility over — the Context bullet (`:51`) already notes M05's version is temporary.

## Conflicts

1. **The "Commit a task" shared definition is obsolete under Change 1.** `plugins/orcastrat/skills/run/SKILL.md:38`-`39`:
   ```
   - **Commit a task** in a directory D: `git -C "D" add -A`, then
     `git -C "D" commit -m "<task's Commit message>" -m "Orcastrat-Task: <task ID>"`.
   ```
   and its two call sites — 3d item 6 (`:183`, "**Record and commit.** ... then commit the task in MAIN. Code and status land in one commit.") and 3e item 3 (`:202`, "...verify in the worktree... Success → commit the task in the worktree.") and item 8 (`:210`, "**Record.** ... commit: `chore(plan): <milestone ID> wave <n> done (<task IDs>)`.") — all assume `run` makes the single code+status commit itself, using the task's Commit field as the message and attaching the trailer directly to it. Change 1 (spec §2, `docs/orcastrat-execution-spec.md:26`, `:36`) instead has the **worker** commit its own code (subject `<task ID>: <message>`, no trailer, possibly multiple commits), and `run` make a **separate** bookkeeping-only commit (`chore(plan): <task ID> done`, with the trailer). The serial path (3d) is squarely in this milestone's scope and must be rewritten. The parallel path (3e) is Change 5's territory (M07, plan.md Coverage `:47`) and explicitly out of scope for M05 — but 3e's item 3/6/8 as written will be stale/contradictory the moment 3d changes, since both currently share the one "Commit a task" definition. Whether M05 should also touch 3e's wording (even just to stop it citing the definition being removed) or leave it entirely to M07 is a design choice for the planner, not resolved by any Decision found.

2. **`Max run time`/`Max tasks`/`Max milestones` vs. `--max-tasks`'s existing meaning.** The plan.md header already needs no `Max tasks` field to exist for `--max-tasks` to work today (`:15`, `:147`, `:152` all read only the flag). D29 (`plan.md:112`) makes `Max tasks: none` the header default and Context bullet `:26` says "`--max-tasks` already exists and keeps its meaning" — so no functional conflict, but the milestone will need to specify precisely how the flag and the (new) header field combine (flag beats header field, per spec §4 `:65`, already quoted above) since the current skill text has no header-field-vs-flag precedence logic to model this on.
