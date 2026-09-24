# M06 survey: task briefs and report files

No `task-brief`, `next`, `run-report` scripts or `hooks/` dir exist yet. Existing scripts: `plugins/orcastrat/scripts/{scope-check,push-check,verify,integrate,recover,run-state,lib/common}`. Existing tests: `tests/orcastrat/{scope-check,push-check,verify,integrate,recover,run-state,lib-common,agent-files,no-powershell,test-helper}.bats`.

## `task-brief` script + `task-brief.bats`

- Signature `task-brief <plan-dir> <task-id>` (D05, `plan.md:90`). Output: `$(git rev-parse --git-common-dir)/orcastrat/<plan-slug>/briefs/<task-id>.md` (spec `:158`) — same `orcastrat/<slug>/` root as `verify`'s `logs/` (`scripts/verify:42`) and `run`'s WT_ROOT (`skills/run/SKILL.md:36`, worktrees at `<WT_ROOT>/<task ID>`); `briefs/` is a new sibling, which matters for `next`'s worktree count.
- Copy `verify`'s slug/common-dir resolution verbatim (`scripts/verify:37-41`): `slug=$(printf '%s\n' "$plan_dir" | sed -e 's#\\#/#g' -e 's#/*$##' -e 's#.*/##')`, then `git -C "$dir" rev-parse --git-common-dir` + `cd`/`pwd`.
- Prints only the absolute path via `print_path`, nothing else on success (D43, `plan.md:128`); usage/dir errors: `error: <message>` on stderr, exit 2 (D55, `plan.md:140`), matching `recover`'s `fail()` (`scripts/recover:25-28`). Sources `scripts/lib/common` (`scripts/lib/common:8-14`).
- Content: `plan.md`'s `## Decisions` section (`plan.md:84-186`, next heading `## Open questions`); the milestone's whole `## Context`; the task block (`### M<nn>-T<nn>: ...` through Done when, bounded by next `### `/`## `). Task-heading regex `^### M[0-9]+-T[0-9]+:` and fenced-code-block skip logic already exist in `recover`'s `todo_awk` (`scripts/recover:59-96`) as a reusable pattern.
- Conventions block (D32, `plan.md:117`) lives inside Context already — no special-casing needed.
- Bash rules to follow (M02, `M02-portable-runtime.md:14,21`): bash 3.2 only, no associative arrays/`mapfile`/`${var,,}`; scripts may use `$(...)` internally.
- No `task-brief.bats` exists; model on `tests/orcastrat/recover.bats` (`make_fixture_repo`, `write_plan`, milestone fixture writer, `run_script` = `run --separate-stderr env PATH=<stub-cygpath-dir>:$PATH bash "$SCRIPT" ...`) and `test_helper.bash` (`make_fixture_repo`, `make_cygpath_stub`).

## `next` script + `next.bats`

- D79 (`plan.md:164`) / spec §25a item 1 (`:578-588`) fix the output lines/order: `plan:`, `milestone:`, `next:` (`survey <ID>|detail <ID>|start <ID>|wave <n>|milestone-verify <ID>|review <ID>|final-verify|complete|blocked`), `wave:`, `blocked:`, `open-questions:`, `recover:`, `worktrees:`, `marker:`. Reads only plan.md header, Milestones table, `## Open questions`, and each milestone/task `- Status:`/`- Wave:`/`- Tier:` line — never Decisions/Context/Steps/notes.
- `wave: <n> <task ID>:<tier> ...` needs each `todo` task's *current* tier, which today only exists as `run`'s in-context "Current tier and rung" logic (`skills/run/SKILL.md:44`: accounts for `- Escalated:` lines below the last `- Blocked:` line and any `- Re-tiered:` line) — `next` must replicate this from the file alone.
- `recover:` — shell out to the existing `recover` script (`scripts/recover`), consistent with D44's "scripts may use `$(...)` internally".
- `worktrees:` count under WT_ROOT (`skills/run/SKILL.md:36`); that directory also holds `logs/`, `hold/`, and (once built) `briefs/`, so a naive dir listing over-counts — prefer `git worktree list --porcelain` filtered to WT_ROOT, or explicit exclusion.
- `marker:` reads the per-checkout marker `run-state` already writes: `<git-dir>/orcastrat/active-run` (D06, `plan.md:91`; per-checkout git-dir, not common-dir), lines `plan=`, `started=`, `heartbeat=`, `blocks=`, `block_heartbeat=` (`scripts/run-state:2-22`). "stale" = spec §9's "more than an hour old" (`:179`). `run-state` has no age/stale subcommand today (confirmed reading the whole script) — `next` must compute the age itself from `heartbeat=`.
- Tests: bats fixtures for each spec §25a item 5 state (`:597`): fresh (outline M01), survey committed, detailed but uncommitted, mid-wave, interrupted attempt, blocked with open questions, milestone done awaiting review, plan complete.

## `run`: use `next`; stop reading plan.md's Decisions

- Replace `skills/run/SKILL.md:26`: "re-read plan.md and the current milestone file before your next action" (before each wave / after possible compaction) with `next` calls at start, before each wave, after compaction, and on Stop-hook return (Stop hook is M08, not built) — spec item 2 (`:589`).
- Section "1. Re-read the ground truth" (`SKILL.md:66-72`) reads `plan.md` whole at start (item 3) — becomes a `next` call.
- `run` still Greps the current task's block for fields `next` doesn't print (Verify, Files, Commit, Fails first) — dispatch already sends only `Plan:`/`Milestone:`/`Task:` without inlining task content (`SKILL.md:188-193`), consistent with this.

## `run`: resume-from-git checks for every bookkeeping step

- Spec item 3 (`:590-595`): committed notes skip their agent; detailed-but-uncommitted milestone → validate+commit instead of re-planning; `recover` results applied; uncommitted Files = failed attempt.
- Partially present already: survey-note skip (`SKILL.md:135`), review-note skip (`SKILL.md:264`), `recover` results applied in 2a/2c (`SKILL.md:85,110-113`). M06 should make these driven by `next`'s printed state rather than ad hoc re-derivation.

## `run`: generate brief before each dispatch; `Brief:` line

- Serial dispatch sends only `Plan:`/`Milestone:`/`Task:` (+`Failures:`) today (`SKILL.md:188-193`); parallel adds `Worktree:` (`SKILL.md:220-224`). Both need a `task-brief` call first and a `Brief: <path>` line (spec `:159`).
- Reviewer dispatch on `review` Verify (`SKILL.md:210` serial, `:232` parallel: "same three lines... plus `Base: <BASE>`") also needs `Brief:`, reusing the worker's brief (Outline bullet 7).
- "Reuse on resumes/retries; regenerate when Decisions changed since generated" (spec `:161`) — no existing hash/mtime/versioning mechanism in the repo detects this; unresolved by any current script or Decision.

## `run`: read only plan.md header + current task block

- Same underlying change as the `next`-integration bullet above; no code currently restricts *reads* to header-only, beyond `SKILL.md:22`'s general "only edit plan.md, milestone files..." statement (which is about writes, not reads).

## Worker agents (all six) + `reviewer`: brief instead of plan files; report file; `DONE_WITH_CONCERNS`; RED evidence

- All six worker files identically say (confirmed via `tests/orcastrat/agent-files.bats:76-92` `write_worker_rules`/`missing_lines`, which treats this wording as shared): "2. `plan.md`... the Decisions section. 3. The milestone file: its Context section. 4. Your task block..." (`agents/worker.md:26-28`). Replace with reading the `Brief:` path (spec `:160`); CLAUDE.md/AGENTS.md and Read first stay direct reads.
- `agents/reviewer.md:29-35` reads plan.md header+Decisions and "milestone file: its Context, then your task block in full" — same replacement, keeping Read first + diff-since-Base as direct reads.
- Current worker Report block (`agents/worker.md:65-78`, all six identical) is `STATUS/REASON/FILES/VERIFY/RED/HYPOTHESIS/FIXES TRIED/NOTE` (8 lines) — no report-file path, no `DONE_WITH_CONCERNS`, no instruction to write a report file. Spec Change 9 (`:184-197`) needs: written `plans/<slug>/notes/reports/<task-id>.md` (implementation, files changed, RED/GREEN evidence, self-review, concerns); reply ≤10 lines = status block + report path; new status `DONE_WITH_CONCERNS`; `RED: CONFIRMED` valid only if the *file* has the RED evidence.
- Plumbing already anticipates the report file: plan-format.md's Files field note (`reference/plan-format.md:230`), `run`'s scope-check call (`SKILL.md:207`), `run`'s Definitions (`SKILL.md:42`) — only the worker's *writing* of the file and the reply format are missing.
- `agents/reviewer.md:52-59` Report block is `VERDICT: PASS|FAIL` + `REASONS:` (2 lines) — no notes-file requirement, and spec's "other agents" notes-file bullet doesn't explicitly name a reviewer notes file (see Unconfirmed).
- Today's RED reply already quotes the first failing line (`worker.md:59-60`); this needs to additionally land in the written report file.

## `run`: `DONE_WITH_CONCERNS`; RED-not-confirmed from the report; failure log points at report

- Serial 3d item 3 (`SKILL.md:198-206`) branches on `BLOCKED/GAP`, `BLOCKED/STUCK`, `DONE` only; it already has a "RED missing/N/A on a `DONE`" → Failed attempt "RED not confirmed" branch (`:200`), but driven by the reply line, not report-file content — M06 moves this check to the file. `DONE_WITH_CONCERNS` is new: treat like `DONE` (items 4-7), then dispatch `orcastrat:reviewer` with the concerns even when Verify is command-only (spec `:191`); a reviewer FAIL is a Failed attempt (`SKILL.md:296-321`). Parallel equivalent (`SKILL.md:227-232`) has the same gap.
- "Failure log and resume messages point to the report file" (spec `:193`) — today's failure-log entry (`SKILL.md:51-62`) and resume message (`SKILL.md:305-312`) have `Reason:`/`Verify tail:` but no report-path line.

## Other agents: write long output to notes files; reply ≤20 lines

- `agents/scout.md` and `agents/scout-heavy.md` **already fully implement this** — "How to report" (`scout.md:47-64`, identical in `scout-heavy.md`): facts with `path:line`, **Unconfirmed**, **Conflicts**, ~10KB cap, and for a briefed/survey request: write to Output path, reply `STATUS: DONE / OUTPUT: <path> / UNCONFIRMED: <count> / CONFLICTS: <count>` (4 lines). (This is the exact instruction set this survey operated under.)
- `agents/milestone-reviewer.md` and `agents/plan-reviewer.md` **already** write findings to `notes/<ID>-review*.md`/`notes/<ID>-plan-review.md` and reply with short status blocks (`milestone-reviewer.md:76-88`: `STATUS/BLOCKING/ADVISORY`; `plan-reviewer.md:72-`: `STATUS/ISSUES/ADVISORY`) — no explicit "≤20 lines" wording but well within it.
- `agents/planner.md` edits milestone/plan.md files directly rather than writing notes; replies with short tokens (`DONE`/`SCOUT`/`BLOCKED`+`GAP`, confirmed via grep at `planner.md:75,81,91`) — full Report block not read.
- `agents/reviewer.md` is the exception: short reply but no notes file at all, unlike the other four.
- `merger`, `validator`, `decider`, `status-reader` don't exist yet (built in later milestones, D28 `plan.md:113`) — nothing to check now.

## `run`: commit notes files before next dispatch

- Pattern exists narrowly already: survey-note commit before planner dispatch (`SKILL.md:135`), review-note commit before fix-round/completion (`SKILL.md:264`). D60 (`plan.md:145`) states the general principle and explicitly ties it to Change 9. Report file + failure log are already folded into the task's own status commit (`SKILL.md:213`). M06 extends the general commit-before-next-dispatch discipline to any other notes file a report-writing agent produces.

## Record "after" dispatch sizes (D14)

- `plans/orcastrat-execution/notes/dispatch-sizes.md` already has the "Before (M04)" table for exactly two tasks: `worker-light`/`M01-T01` in `plans/orchestratinator-robustness/M01-format-versioning.md` (125 lines), `worker`/`M04-T06` in `.../M04-fails-first.md`; that plan directory and both files exist and are committed (D69, `plan.md:154`).
- D14 (`plan.md:99`) + D69: "after" = dispatch message (now 4 lines: `Plan:`/`Milestone:`/`Task:`/`Brief:`) + the brief `task-brief` generates for those same two tasks, chars via `LC_ALL=C.UTF-8 wc -m` on committed content (`git show HEAD:<path>`). Requires running `task-brief` against `plans/orchestratinator-robustness` for `M01-T01`/`M04-T06` once the script exists, then appending an "After (M06)" table in the same format.

## Unconfirmed

- Whether `next`'s current-tier computation must exactly replicate `run`'s Escalated/Re-tiered/Blocked logic or a simplified version — spec gives no further detail than `wave: <n> <task ID>:<tier>`.
- Whether `reviewer` needs its own notes file under Change 9, or its existing short reply already satisfies the rule without one — no spec line names a reviewer notes file.
- Mechanism for detecting "Decisions changed since brief was generated" (spec `:161`) — no existing convention.
- `run-state` has no stale/age subcommand (confirmed reading the whole script); `next` (or an extended `run-state`) must compute it.
- Full content of `worker-heavy.md`/`worker-light.md`/`worker-mini-*.md`/`specialist.md`'s numbered "Before anything else" lists and `planner.md`'s Report block wasn't individually re-read beyond `worker.md`; `agent-files.bats`'s shared-wording check (`:76-92`) is why `worker.md`'s citations are treated as representative of all six worker files.

## Conflicts

None found.
