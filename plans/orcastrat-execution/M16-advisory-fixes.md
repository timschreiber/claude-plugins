# M16: Resolve the advisory review findings (M01–M14)

- Status: outline
- Format: 2
- Goal: Every advisory finding in the `## Advisory` sections of `notes/M01-review.md` … `notes/M09-review.md` that is still present at HEAD is fixed, with a test wherever a script or bats file is involved, or is explicitly scheduled in a named later milestone (D180), as is every advisory finding of the M10–M14 reviews that affects behavior, correctness or shipped content (D188). Findings that are fixed or obsolete need no work. `./scripts/Validate-All.ps1` and the bats tests pass.
- Depends on: M14
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout-heavy

## Context

Governing sources: the `## Advisory` sections of `notes/M01-review.md` through `notes/M09-review.md`; `notes/M16-survey.md` (the triage of all 44 findings against HEAD `e88074c`, with current `path:line` citations, fixes and tests); Decisions D55, D73, D78, D86, D99, D121, D139, D140, D174, D180, and D185–D197, which settle the findings that needed a decision.

- The survey's finding IDs (`A-M<nn>-<n>`, the finding's position in that review's Advisory list) name each finding. Every task names the IDs it resolves in its Objective.
- Correction to the survey: it lists A-M07-4 and A-M09-2 as one finding. They are separate. A-M07-4 is the literal `Then` match in 3e items 11 and 12. A-M09-2 is M09-review Advisory item 2: in 3e, item 11 needs the attempt number `<n>` of a task that left the wave to be escalated, but the worktree removal step (`plugins/orcastrat/skills/run/SKILL.md`, "When every batch is done") notes `<n>` only for GAP, VACUOUS and STUCK tasks, and the worktree's failure log is gone by item 11. The fix notes `<n>` for every task that left the wave, as the removal step already does for blocked ones.
- Not in this milestone, already scheduled: A-M02-5 (M15 re-verifies every `path:line` of M02's inventory when it copies it into the CHANGELOG), A-M05-2 (M14 fixes plan-format's "planned Tier" wording when it adds `Re-tiered:`), A-M01-3 (M15 adds the version and trigger conditions to the README's upgrade paragraph). Each is a bullet in that milestone's Outline.
- No finding needs work: A-M01-1 and A-M03-4 (fixed), A-M05-1 (obsolete).
- `plugins/orcastrat/README.md` and `CHANGELOG.md` are M15's (D26, D125).
- The run executing this plan is the installed, pre-rename plugin (D37). No task runs `run` or `plan`, installs the plugin or starts Claude Code.

## Outline

- `plugins/orcastrat/skills/run/SKILL.md`: A-M01-2 (2a item 6 checks `git worktree list` before saying the old directory can be deleted), A-M05-4 (the "Never push" exception names blocked attempts, as D99), A-M07-4 (items 11 and 12 match a `Then` that ends in `escalated to <tier>` or `blocked (STUCK)`), A-M09-1 (3e item 5's stale "Leave its worktree"), A-M09-2 (`<n>` noted for escalated tasks at worktree removal), A-M09-3 (`cd "<MAIN>" &&` on the removal step's commands), A-M08-4 (a SETUP stop from `run-state` quotes `active-run.released` when it exists); A-M05-3 (D191), A-M07-2 (D186), A-M07-3 (D193), A-M08-5 (D197); A-M08-3 (D187): every agent dispatch is in the foreground, never in the background, and a parallel batch is several Agent calls in one message.
- Scripts, each with a bats test: `run-bats.sh` A-M02-1 (reclone when `bin/bats` is missing); `Validate-All.ps1` and `no-powershell.bats` A-M02-2, A-M02-3; `verify` A-M03-2, A-M03-3; `next` A-M06-3, A-M06-5, and A-M06-4 (D185), and the `mode:` line (D186); `recover` A-M03-1 (D189); `stop-guard` A-M08-1, and A-M08-2 (D196); `instructions-ack` A-M09-4; `hold` A-M09-5; the fence helpers A-M06-7 (D192).
- Tests: `verify.bats` A-M03-5 (the one-line single-quoted form `run` builds, run through `bash -c`); `agent-files.bats` A-M04-3 (a fixture agent with no `tools` line); `task-brief.bats` A-M06-1, A-M06-2 (`run !` instead of a mid-test `!`); `skill-files.bats` A-M09-6 (`basename`).
- Agents: `plan-reviewer` A-M02-4 (PowerShell's `-and`/`-or`/`-not`, not `find`'s); `planner` A-M04-4 (five-tier `TASKS:` example); `merger` A-M07-1 (drop the notes-file overflow sentence); the six worker agents A-M06-6 ("your report file", not "your note") and A-M04-5 (D195); `scout-heavy` A-M04-1 (D190); `worker-heavy` A-M04-2 (D194).
- Advisory findings of the M10–M14 reviews, added here by the orchestrator after each review (D188), one bullet per finding with its ID `A-M<nn>-<n>` and its `notes/M<nn>-review.md` citation.
- A-M10-1 (`notes/M10-review.md` Advisory 1): `plan-reviewer` checks 3, 6, 9 and 10 and its Calibration paragraph still call their findings "an issue", contradicting its `## Findings` section and D183 (check 10 is always advisory); align the wording so only D183-category findings scored 80 or higher go under `## Issues`.
- A-M10-2 (`notes/M10-review.md` Advisory 2): `run`'s **Validate a review** step 5 reads `## Advisory` (to check `None.`, append, renumber), but the call sites in 3a item 5 and 3f items 2 and 5 say "Read nothing else of the report"; make the two instructions agree.
- A-M10-3 (`notes/M10-review.md` Advisory 3): `run` 3e item 10 restores an integrated task's review files after its worktree (and its failure log) is gone, so the attempt count `<n>` has no source; note `<n>` at worktree removal, as items 11 and 12 do.
- A-M10-4 (`notes/M10-review.md` Advisory 4): `run` 3d item 7 says the status commit carries the report file and failure log; name the review files too.
- A-M10-5 (`notes/M10-review.md` Advisory 5): on a re-review, the `validator` can't read `notes/<ID>-review.md`, so `milestone-reviewer` must restate the first-review finding's text in full in any "not fixed" candidate.
- A-M10-6 (`notes/M10-review.md` Advisory 6): `review-rubric.bats`'s `a copy that differs by one character is caught` never runs the agent-comparison loop against a drifted agent copy; make it do so.
- A-RUN-1 (D210, the M11 stop): `run` checks a commit subject taken from a task field before committing; an empty or missing subject stops with SETUP naming the task, never a commit with no subject line. A bats or fixture test covers a missing or empty Commit field.
