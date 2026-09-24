# M07 survey: Parallel waves and dispatch order

Governing spec: `docs/orcastrat-execution-spec.md` §6 (lines 107-133, Change 5), §22 items 2-3 (lines 471-505, Change 21 — merger's allowlist/sections), §23 (lines 507-521, Change 22).

## Outline bullet 1 — `agents/merger.md`

Does not exist yet (`Glob plugins/orcastrat/agents/*.md` has no `merger.md`).

- Frontmatter per D68/spec §22.3 (`docs/orcastrat-execution-spec.md:491,495`): `tools: Read, Glob, Grep, Edit`, no shell. M07 Context (line 20) also fixes `model: sonnet`, `effort: high`, no `maxTurns`.
- Template to copy structure from: `plugins/orcastrat/agents/plan-reviewer.md` (closest no-shell, write/edit-restricted agent). Its shape: frontmatter → role paragraph → `## No prototyping or duplicate work` → `## Search and command bounds` → "no Agent/Task/Skill/Artifact" line → `## Before anything else` (input contract + reads) → role-specific section → `## Report`.
- `## No prototyping or duplicate work` and `## Search and command bounds` exact required text is in `tests/orcastrat/agent-files.bats:56-74` (`write_bounds`, `write_no_prototyping` helper functions) — copy those lines verbatim; merger's own first/last bullets of "No prototyping" differ per agent (plan-reviewer's last bullet is "You have no shell. Read files with Read, Glob and Grep." — merger likely needs the same, since it also has no shell).
- Spec input contract (`docs/orcastrat-execution-spec.md:117`): "both task blocks (the Objective, Steps, and Interfaces of the task being merged and of each already-merged task touching the same files) and the conflicted files. It may edit only the conflicted files."
- M06's 20-line reply rule text (exact string, must match `tests/orcastrat/agent-files.bats:310`): `Your reply is at most 20 lines. Anything longer goes in a file under the plan directory's \`notes/\`, and your reply gives its path.`
- **`tests/orcastrat/agent-files.bats` does NOT yet list `merger`.** `NON_WORKER_AGENTS='scout scout-heavy reviewer milestone-reviewer plan-reviewer planner'` (line 9) and `NO_SHELL_AGENTS='plan-reviewer planner'` (line 10) both omit it, and the `"non-worker agents allow exactly the tools of their role"` test's case statement (lines 193-207) has no `merger)` case. M07 Context (line 14) says "`tests/orcastrat/agent-files.bats` checks all three" (the two invariant sections and the no-Agent/Task/Skill/Artifact rule) — so a task must add `merger` to `NON_WORKER_AGENTS`, `NO_SHELL_AGENTS`, and the tools-matching case statement (expected `Read, Glob, Grep, Edit`), or the new agent file won't actually be checked.
- D21 (rubric) applies only to `reviewer`, `milestone-reviewer`, `plan-reviewer`, `validator` — merger is not a reviewer and scores nothing, so it gets no rubric copy.

## Outline bullet 2 — `run`: rewrite the parallel section

Current 3e ("Parallel wave") is `plugins/orcastrat/skills/run/SKILL.md:228-267`, to be fully replaced. Current mechanics (pre-M07, per D82):

- Item 1 (worktrees, `:232`): `git worktree add -b <task branch> "<WT_ROOT>/<task ID>" <BASE>` — matches spec item 1, keep.
- Item 2 (dispatch, `:233-239`): dispatches all of a batch "in task ID order" (implicit) — no tier grouping yet (see bullet 3 below re: dispatch order).
- Item 3 (per-report checks, `:240-247`): does 3d-item-2-style STRAY/PUSHED checks per worktree, then on success **commits directly in the worktree** with a single commit (`git -C "<worktree>" commit ...`) — no resume, no failure log, no ladder (that's D82's "today's mechanics", to be replaced per bullet 3).
- Item 4 (containment, `:248`): currently **Stops** with reason STRAY on any stray write in MAIN — must become the non-stopping downgrade-to-serial recovery (M07 Context lines 24-29): reset MAIN to the wave's starting commit and clean; discard the wave's worktrees; rerun the wave's tasks serially; switch the rest of the run to serial; report in one line; no Stop.
- Item 5 (retries, `:249-259`): today's "at most one retry, one tier up, fresh worktree, no resume" — replaced per bullet 3.
- Item 6 (integrate, `:261-263` numbered 6): currently does **manual** `git log --oneline <BASE>..<task branch>` + `git cherry-pick <task branch>` + `git cherry-pick --abort` on conflict, immediately blocking the task `MERGE` — must be replaced with the `integrate` script (`plugins/orcastrat/scripts/integrate`, signature `integrate <task-branch> <base>`, D05) plus `merger` dispatch and the D23/D51 fallback. D46 (`plan.md:131`) explicitly flags this block as "replaced in M07 (integrate)".
- Items 7-9 (`:264-266`, re-verify / record / cleanup): "Keep the combined re-verify after each wave and the cleanup of integrated worktrees" per M07 Context line 30 — these stay largely as-is.

`integrate` script facts (`plugins/orcastrat/scripts/integrate:1-63`):
- Signature `integrate <task-branch> <base>` — **no directory argument** (unlike `scope-check`/`push-check`/`verify`); it cherry-picks onto "the current branch of the repository in the current directory" (comment line 4), so `run` must invoke it with MAIN as the cwd (or `git -C`-style wrapping isn't supported — the script itself has no `-C`).
- Empty range → prints `OK`, changes nothing (D58; script lines 36-39).
- Success → prints `OK` (lines 41-44).
- Conflict → prints `CONFLICT` then each conflicted file via `print_path`, **leaves the cherry-pick in progress** (does not abort) (D51; lines 46-56).
- Any other failure → aborts any in-progress cherry-pick and exits 2 with `error: cherry-pick of $base..$branch failed; nothing was applied` (D55/D58; lines 58-62).

**Unconfirmed / open mechanism**: after the merger edits the conflicted files, `run` must resolve and continue the cherry-pick itself (D51: "`run` then continues the cherry-pick or aborts it"; spec line 117: "Then `run` continues the cherry-pick and re-verifies"). Neither the spec nor any Decision states the exact non-interactive continuation command. Plain `git cherry-pick --continue` opens `$EDITOR` for the commit message, which will hang a headless script; nothing in the plan/spec pins `GIT_EDITOR=true`, `--no-edit`, or `-c core.editor=true`. This looks like a fact the M07 task must pin down (an exact Step), not something to leave to the worker.

## Outline bullet 3 — resume, ladder, failure log, and scope-violation-as-failed-attempt in parallel

D82 (`plan.md:167`): "M07 brings resume, the three-rung ladder and the failure log to parallel tasks." D83 (`plan.md:168`): once done, a parallel scope violation follows the same failed-attempt path as serial (no longer an immediate `SCOPE` Stop).

The serial machinery to port is defined in `plugins/orcastrat/skills/run/SKILL.md`:
- **Definitions** section (`:35-73`): `Discard an attempt` (`:54-57`), `Keep a blocked attempt` (`:58`), `Failure-log entry` (`:59-71`), `Attempt number` (`:51`), `Current tier and rung` (`:52`), `Hold directory` (`:53`) — all written for **MAIN** ("Run `git reset --hard <BASE>`", "in MAIN"). Parallel attempts live in worktrees, not MAIN, so these need worktree-scoped equivalents (discard by resetting the worktree, not MAIN; the hold directory is already `<WT_ROOT>/hold`, shared).
- **Failed attempt** section (`:311-337`): the resume/escalate/block ladder itself, addressed with SendMessage to the dispatch's agent ID (`:320-330`), which should work unchanged in a worktree since the worktree persists across a resume (only a scope-violation resume resets the tree, `:318`).
- **Block with GAP** (`:339-343`) already has an explicit parallel-mode branch: "In parallel mode, add the question to plan.md's Open questions tagged with the task ID, mark the task `blocked` with `- Blocked: GAP — <question>`, finish the wave's other tasks first ... then Stop." Same pattern for VACUOUS.
- Serial's SCOPE handling before this bring-up: D83 says "Until M07, SCOPE stays a Stop reason in parallel waves" — current 3e item 3 (`:247`) does exactly that ("record a SCOPE block ... and leave the worktree"). Post-M07 it becomes a queued retry through the ladder like any other failed attempt.
- Current parallel retry dispatch lines (`:253-259`) carry `Retry:`, `Reason:`, `Verify tail:` — D92 (`plan.md:177`) says these stay **only for parallel retries** until M07 (i.e., serial dispatch never used them; after M07 the parallel path should converge on the same escalation/resume dispatch shape as serial, which uses `Failures: <path>` on a fresh dispatch (3d item 1, `:200-205`) and a `Resume:` message on a resume, `:320-327`).

## Outline bullet 4 — `Max parallel` default 2 and tiny-task batching

Current default-3 text, all to change per D29 (`plan.md:114`, "The `Max parallel` default of 2 applies only to plans written after the change"):
- `plugins/orcastrat/reference/plan-format.md:40` — example header `- Max parallel: 3`.
- `plugins/orcastrat/reference/plan-format.md:75` — field table row: `| Max parallel | Most tasks run at once. Default 3. ... |`.
- `plugins/orcastrat/skills/plan/SKILL.md:75` — `**Parallel:** default to \`auto\` with Max parallel \`3\`, ...`.
- `planner.md` never sets `Max parallel` (it's a plan.md header field, written once by `plan`, not touched when detailing a milestone) — grep of `planner.md` for "Max parallel" found no hits; its only parallelism-related section is "Sequence and find the parallelism" (`agents/planner.md:83-85`), which doesn't reference Max parallel.
- Also stale but **not named in the Outline**: `plugins/orcastrat/README.md:119` ("up to Max parallel at once (default 3)") and `:146` ("Start at the default Max parallel of 3 and adjust") — flagged under Conflicts below.
- This plan's own `plan.md:10` header (`- Max parallel: 3`) is this build's own plan and is explicitly unaffected by D29 (existing plans keep their value).

Tiny-task batching guidance ("waves with only tiny tasks are batched (`Batch: yes`) rather than parallelized", spec line 131) is **new text — nothing like it exists today**:
- `reference/plan-format.md`'s "Sequence and parallelism" section (`:260-276`) has no such rule; its only Batch-adjacent line is `:272` ("Waves still apply to a batch task ... A batch touching many files interferes with more tasks").
- The existing "prefer one batch task" guidance (`plan/SKILL.md:112`, `agents/planner.md` step 6 area) is about **merging several same-shape edits into one multi-file task**, not about batching an already-planned wave of small distinct tasks instead of running them in parallel worktrees — this is a different, additional rule.
- No definition of "tiny task" exists anywhere in `plan-format.md`'s Sizing rules (`:298-309`) or elsewhere; the term is undefined. Flagged under Unconfirmed.
- Three places likely need the new sentence: `reference/plan-format.md` (Sequence and parallelism section, and/or the Batch field row at `:225`), `plugins/orcastrat/skills/plan/SKILL.md` step 7 ("Sequence the tasks and find the parallelism", `:123-131`), and `agents/planner.md`'s "Sequence and find the parallelism" section (`:83-85`).

## Outline bullet 5 — dispatch order in serial and parallel modes

Spec §23 item 1 (`docs/orcastrat-execution-spec.md:509-511`): same-tier tasks dispatch back to back; in serial mode execution/commit order follows that grouping (wave tasks don't interfere by definition); in parallel mode dispatch follows the grouping but **integration stays in task order**.

Current code has plain task-ID order everywhere in the wave, with no tier grouping:
- Serial: `plugins/orcastrat/skills/run/SKILL.md:198` — "For each task in the wave set, in order" (task ID order, per `next`'s `wave:` line, `:42`, and plan-format.md:273 "task ID order is the execution order for serial runs").
- Parallel: `run/SKILL.md:230` — "Process the wave set in batches of at most Max parallel tasks ..., in task ID order."
- `next`'s `wave:` line already carries each task's planned Tier (`run/SKILL.md:42`; D102, `plan.md:187`, confirms `next` prints the task's *planned* tier even though `run` dispatches at the task's *current* tier, D84).
- Parallel integration order is explicitly `:263` "in task order" already, matching Change 22's "integration is still in task order" — this part needs no change.
- No existing rule anywhere states how to order *between* tier groups (e.g., whether lower or higher tiers go first, or whether grouping is a stable sort preserving first-occurrence task-ID order) — spec text only says same-tier tasks are contiguous. Flagged under Unconfirmed.

## Outline bullet 6 — worker worktree rules already present; confirm Change 21.2

Confirmed already present, identically, in every worker agent file (`worker.md`, `worker-mini-parallel.md`, `worker-mini-serial.md`, and — spot-checked via grep — `worker-heavy.md`, `worker-light.md`, `specialist.md`):
- `## Search and command bounds` section with the three bullets plus "You have no Agent, Task, Skill or Artifact tool..." line (e.g. `worker.md:13-19`).
- `## If you were given a Worktree` section, conditional on a `Worktree:` line, with the four cd/absolute-path/no-cross-worktree/Verify-from-worktree-root rules (e.g. `worker.md:36-44`).

These already match Change 21.2 verbatim across all six tier agents — no changes indicated by this outline bullet beyond confirmation.

## Conflicts

1. `plugins/orcastrat/README.md:119` and `:146` state "default 3" for Max parallel; the Outline for this milestone names only `reference/plan-format.md`, `plan` and `planner` as the files to update for D29's new default of 2. Not clear whether the README is intentionally deferred (e.g. to M15 docs, D26) or is a gap in the Outline.

## Unconfirmed

1. The exact non-interactive git incantation `run` should use to continue a cherry-pick after the merger resolves conflicts (e.g. `GIT_EDITOR=true git cherry-pick --continue` vs `git -c core.editor=true cherry-pick --continue`) — not specified in spec or any Decision.
2. Definition of "tiny task" for the new wave-batching guidance — undefined anywhere in the plan format.
3. Ordering rule *between* tier groups when dispatching same-tier tasks back to back (which tier's tasks go first within a wave) — spec only requires same-tier contiguity, not a total order.
4. Merger's own notes-file naming convention when its reply exceeds 20 lines (spec §10 says it "write[s] anything long to a file under `plans/<slug>/notes/`" but names no filename pattern, unlike reviewers' `<ID>-review.md` etc.).
