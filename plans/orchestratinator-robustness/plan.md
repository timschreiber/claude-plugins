# Plan: Orchestratinator robustness changes

- Goal: `plugins/orchestratinator/` implements every change in `docs/orchestratinator-robustness-spec.md` (§3–§13): format 2 milestones with Interfaces, Coverage, Fails first, Review Focus, and Batch tasks; the new `milestone-reviewer` and `plan-reviewer` agents, dispatched by `run` and `plan`; tier calibration and escalation feedback; assumptions treated as questions. Every reader of the plan format matches it, format 1 milestones still validate, Change 0 is intact, the README and CHANGELOG describe the changes, and `./scripts/Validate-All.ps1` passes with only the expected missing-`version` warnings.
- Sources: `docs/orchestratinator-robustness-spec.md`
- Branch: robustness-changes
- Final verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`
- Detailing: rolling
- Gates: detail
- Parallel: auto
- Max parallel: 3
- Worktree setup: none
- Status: in-progress

## Milestones

| ID | Title | Status | File |
|---|---|---|---|
| M01 | Format versioning (spec §13) | done | M01-format-versioning.md |
| M02 | Change 1: Interfaces per task (spec §3) | done | M02-interfaces.md |
| M03 | Change 2: Spec coverage check (spec §4) | done | M03-coverage.md |
| M04 | Change 3: Fails first (spec §5, §12) | done | M04-fails-first.md |
| M05 | Change 4: Review Focus (spec §6) | done | M05-review-focus.md |
| M06 | Change 5: Milestone quality review (spec §7) | ready | M06-milestone-review.md |
| M07 | Change 6: Fresh-eyes plan review (spec §8) | outline | M07-plan-review.md |
| M08 | Change 7: Tier calibration (spec §9) | outline | M08-tier-calibration.md |
| M09 | Change 8: Batching (spec §10) | outline | M09-batching.md |
| M10 | Change 9: Assumptions are questions (spec §11) | outline | M10-assumptions.md |
| M11 | CHANGELOG and read-through (spec §14, §16) | outline | M11-changelog-and-read-through.md |

## Decisions

- D01: Ground rule 1 (spec §1.1, "every reader in the same commit") applies per milestone: each milestone changes the format and every reader of what it changes, so the plugin is consistent at the end of every milestone. Tasks still commit one at a time and keep the plan format's sizing rules. Nothing is pushed until the branch is done. (source: user)
- D02: `- Batch: yes` also relaxes the "at most about seven Steps" sizing rule to one Step per file. (source: user)
- D03: `plugins/orchestratinator/reference/plan-format.md` gains `- Origin: review` in its Task fields, and its directory tree lists the review notes files: `notes/<milestone-id>-review.md`, `notes/<milestone-id>-review-2.md`, and `notes/<milestone-id>-plan-review.md`. (source: user)
- D04: Plan-level Coverage completeness (one row per section of every source) is checked only when every milestone in the plan is format 2. Otherwise validation checks only that each format 2 milestone has its plan-level rows and that they are mapped. (source: user)
- D05: A re-review (`Re-review: fixes only`, spec §7.5) uses the same Base as the first review. The milestone-reviewer reads `notes/<ID>-review.md`, checks that each blocking finding in it is fixed, and checks that the fix tasks introduced no new blocking problem. (source: user)
- D06: "Escalates repeatedly" (spec §9) means the same tier escalated two or more times on the same kind of task. (source: user)
- D07: `plan-format.md` gains an "Assumptions" subsection under "Decisions and open questions", holding spec §11's **Definition** paragraph with its bullet list and its **Not assumptions** sentence, verbatim, plus the Open-questions tag `[assumption]`. The `plan` skill, `planner`, and `plan-reviewer` point to that subsection instead of restating it. (source: user)
- D08: Placements and line formats (source: user):
  - Milestone file: `- Format: 2` directly after `- Status:`. `## Coverage` and `## Review Focus`, in that order, after Context (and its Waves line) and before Outline or Tasks.
  - plan.md: `## Coverage` between `## Milestones` and `## Decisions`.
  - Task fields: `- Batch: yes` directly after `- Tier:`; `- Fails first:` directly after `- Verify:`; `- Origin: review` directly after `- Commit:`.
  - Review Focus line: ``- <input or condition> → <expected behavior> (source: <§ or D<nn>>). Test: `<test name>` in <task ID>.``
  - Fails first with `no`: `- Fails first: no (<reason>)`. `investigate` tasks omit the Fails first field. A task whose Verify is `review` alone must be `no`.
- D09: The `plan` skill dispatches `plan-reviewer` once per detailed milestone, all in one message so they run at the same time, each with exactly the lines `Plan: <plan dir>`, `Milestone: <ID>`, `Output: <plan dir>/notes/<ID>-plan-review.md` (the same shape `run` uses in 3a). (source: user)
- D10: Milestone review fix round (source: user):
  - (a) A milestone that has any task with `- Origin: review` has used its one fix round. On resume, `run` goes straight to the re-review (`Re-review: fixes only`, writing `notes/<ID>-review-2.md`).
  - (b) Fix tasks are not sent to `plan-reviewer`.
  - (c) Fix tasks follow the milestone's own Format (format 1 fix tasks in a format 1 milestone).
  - (d) Commit messages: `chore(plan): review <ID>` for the first review's report, `chore(plan): fix tasks <ID>` for the planner's fix tasks, `chore(plan): re-review <ID>` for the re-review's report.
  - (e) `milestone-reviewer` and `plan-reviewer` both use `disallowedTools: Edit` in frontmatter, as `scout` does, so Write is available only for their Output file.
- D11: A Consumes entry for a symbol produced by a format 1 task (which has no Produces) cites it as `existing` with a `path:line`. (source: user)
- D12: The spec §16 smoke test is not a plan task; the user runs it after the plan completes. Final verify is `./scripts/Validate-All.ps1`, which also checks agent and skill frontmatter. (source: user)
- D13: The CHANGELOG entry (M11), appended under `## [Unreleased]` → `### Added` in the repo-root `CHANGELOG.md`, is exactly: `- orchestratinator: tasks declare Interfaces and Fails first, milestones carry Coverage and Review Focus, a plan-reviewer and a milestone-reviewer check plans and finished milestones, tiny same-shape edits batch into one task, and planning asks about assumptions instead of making them.` (source: user)
- D14: The plan runs on branch `robustness-changes`. (source: user)
- D15: Milestone layout: M01 is spec §13 (format versioning); M02–M10 are Changes 1–9 in spec order, each also making its own README changes from spec §14; spec §12 (combined worker report) belongs to M04; M11 is the CHANGELOG entry and the §16 read-through. Detailing rolling, Gates detail, Parallel auto, Max parallel 3, Worktree setup none. (source: user)
- D16: This plan is itself written in, and run by, the installed Orchestratinator's current plan format (format 1): its own milestone files have no Format line and its tasks have no Interfaces, Coverage, Fails first, or Review Focus. The files under `plugins/orchestratinator/` are what the plan changes; they are not the format the plan is written in. (source: the plan is executed by the installed plugin, whose `reference/plan-format.md` is the current, unchanged format)
- D17: Change 0 text in existing files (every line containing "They do not govern git", "If one is a symlink to the other, or they have identical content, read it once.", "You never commit, push, or change branches", "The orchestrator commits your work. If you commit, your work can be lost.", `omitClaudeMd: true`, the stray-commit check in `run` 3d/3e, and the `PUSHED` Stop reason) is never modified or removed. (source: spec §2)
- D18: When the `plan` skill does a small job directly (its size-check step), it still checks that every requirement maps to a drafted task, and writes no Coverage anywhere. (source: user)
- D19: The new Coverage step in the `plan` skill comes directly after the Self-check step, so the size check and write-and-hand-off steps are renumbered, and every step-number reference inside `skills/plan/SKILL.md` is updated to match. (source: user)
- D20: When a `Fails first: yes` task's report has a missing or `N/A` RED line, `run` retries it with the retry line `Reason: RED not confirmed (Fails first: yes)`. (source: user)
- D21: Report file layouts (source: user):
  - `milestone-reviewer`: sections `## Blocking` and `## Advisory`; each finding is one line ``- `path:line` — <problem> (<task ID, Coverage row, or D<nn>>)``; a section with no findings says `None.`
  - `plan-reviewer`: section `## Issues`, a numbered list; each issue is `<task or milestone ID> — <which check> — <problem, quoting the text involved>`; with no issues it says `None.`
- D22: `run` finds a milestone's review Base with `git log --format=%H --grep="^chore(plan): start <ID>$"`, taking the oldest match. (source: user)
- D23: When the planner assigns a kind of task one tier higher because of escalations (spec §9), it writes this line in the milestone's Context: `- Tier adjustment: <kind of task> → <tier> (<tier> escalated <n> times in <milestone IDs>)`. (source: user)
- D24: Beyond spec §14: M10 updates the README's "How to use" item 1 and its "Questions answered first" bullet to the four question categories; M06 and M07 add `milestone-reviewer` and `plan-reviewer`, respectively, to the reader list at the top of `plan-format.md`. (source: user)
- D25: An Interfaces block always has at least one `- Consumes:` line and at least one `- Produces:` line; an empty side is written `- Consumes: none` or `- Produces: none`. (source: spec §3 rule 5, "`none` is allowed for either line")
- D26: The planner's reading list ("Before anything else" item 6) also reads the Produces lines of the `done` milestones' tasks that have an Interfaces block, because its self-check checks against them. (source: spec §3, "against the Produces of `done` milestones when detailing later ones"; M02 survey)
- D27: D04's "each format 2 milestone has its plan-level rows and that they are mapped" is checked as: every format 2 milestone has at least one row in plan.md's `## Coverage` mapped to it, and no row there is unmapped. A row is mapped when its target is one or more task IDs (milestone level), one or more milestone IDs (plan level), or `out of scope (D<nn>)` citing the Decision that says so. The plan-level checklist item carries its own condition, not the per-milestone *(format 2)* mark. (source: D04; spec §4 row format)
- D28: The planner recognizes a plan created under format 1 by the milestone it is detailing having no `- Format: 2` line when it starts, because `plan` writes that line into every milestone file, outlined ones included. (source: spec §13, "`plan` always writes format 2"; `reference/plan-format.md` ### Format)
- D29: The four worker agents' Report blocks become spec §12's block verbatim, placeholder text included (`FILES: <comma-separated paths changed or created>`, `NOTE: <one line. For GAP, the exact question.>`). (source: spec §12, "workers reply with exactly"; M04 outline)
- D30: Spec §5's "GAP handling, with the new block reason `VACUOUS`" is `run`'s Block with GAP handling in full (never retried or escalated, the task blocked, an Open question added tagged with the task ID, then Stop), with `- Blocked: VACUOUS — <worker's NOTE>` in place of `- Blocked: GAP — <question>`; the Open question is `Verify passed before implementation: <worker's NOTE>`. (source: spec §5; spec §17 item 4, "stops the run as `VACUOUS`, rather than being retried")
- D31: `run` checks RED only for a task with `- Fails first: yes`, before reading STATUS: `RED: PASSED-EARLY` (any STATUS) → `VACUOUS` (D30); `DONE` with the RED line missing or `N/A` → Retry (D20); anything else goes on to STATUS as today, so a `BLOCKED` / `GAP` report with RED `N/A` is still a GAP and is never retried. Workers report `RED: N/A` for `Fails first: no`, for a task with no Fails first line, and when they stop before running Verify. (source: spec §1 ground rule 3 and `run`'s "Never retry or escalate a GAP"; spec §5; M04 Context, format 1 tasks handled as `no`)
- D32: `plan` builds a milestone's Review Focus at the end of step 6 (Write the tasks as prompts), once its tasks are drafted and before step 7 sequences them, so the owning tasks' test-writing Steps and test files are in place before waves are assigned; there is no new step and no renumbering. The planner does the same in a new `## Build the Review Focus` section directly before `## Sequence and find the parallelism`. Step 11 writes the section after each detailed milestone's Coverage section. The size check (step 10) is unchanged: a job done directly runs the drafted tasks, test-writing Steps included, and writes no plan directory. (source: spec §6, which, unlike §4's "New step after the self-check", adds no step; M05 Outline, "when detailing a milestone, build its Review Focus"; D08 placement)
- D33: Review Focus details (source: spec §6 and §14; plan-format Fails first rule): an unsourced expected behavior is asked in `plan` as an ambiguity question (step 5's Ambiguity heading) and written by the planner as an Open question tagged `[ambiguous]`; a section with nothing qualifying is the single line `None found: <what was checked>`; the task that owns a Review Focus test adds tests, so it is `Fails first: yes`; the README bullet goes between Coverage and Fails first, in §14's order.
- D34: In `Fix findings:` mode the planner reads the code each blocking finding cites itself and never reports `SCOUT`, so `run` 3f handles only its `DONE` and `BLOCKED` / `GAP` reports, a GAP as in 3a item 4. It fixes only the findings under `## Blocking`, and changes nothing in the milestone file except appending fix tasks and updating the Waves line (Status stays `in-progress`). (source: spec §7, whose `run` steps have no scout round and send the planner only blocking findings; D21, every finding cites `path:line`)
- D35: `run` commits the first review's report (`chore(plan): review <ID>`) as soon as the reviewer replies, whatever its status, after a scope check that allows only that file, as 3a item 1 does for a survey; if the report is unchanged from an interrupted attempt, there is nothing to commit and it skips the commit. The planner's fix tasks are a separate commit, and the re-review's report is committed the same way. (source: D10d; `skills/run/SKILL.md` 3a item 1)
- D36: A re-review that still has blocking findings marks the milestone `blocked` before the `REVIEW` stop, as a Milestone verify failure in 3f item 1 does. The README's resume step 3 names `outline` only for a GAP the planner hit while detailing a milestone; a milestone blocked in 3f (including a fix-mode GAP) goes back to `ready`, so the next run re-enters 3f, and D10a sends it to the re-review once the fix round is used. (source: `skills/run/SKILL.md` 3f item 1 and 3a item 4; D01; D22's oldest match covers the repeated start commit)
- D37: The milestone-reviewer sees test output for spec §7 check 5 ("test output should be free of warnings") by running each distinct Verify command of the milestone's tasks that runs tests, once, from the repository root. Running a command is not an edit, so it stays read-only except its Output file. (source: spec §7 check 5)
- D38: The milestone-reviewer carries spec §10's reviewer rule: for a task with `- Batch: yes`, every file in its Files has its edit, and a listed file with no change is a blocking finding. M06's outline puts it there and M09's outline updates only `agents/reviewer.md`; until M09 defines the field, no task has the line. (source: M06 outline; spec §10 "Reviewers")

## Open questions
