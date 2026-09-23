# M11: CHANGELOG and read-through (spec §14, §16)

- Status: in-progress
- Goal: The repo-root CHANGELOG has the D13 entry. A read-through confirms that every reader of each new field and section was updated, that no reader references a field or section that doesn't exist, and that Change 0 is intact. Any problem the read-through finds is fixed.
- Depends on: M10
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §14 (the CHANGELOG row and the reader map) and §16 (Verification), plus D12, D13, D16, D17, D54, and D55 in plan.md.
- The §16 smoke test is not part of this plan (D12). This milestone file gets no Coverage or Review Focus section (D16).
- Change 0 intact means (spec §16, D54): the precedence rule ("They do not govern git") appears in the 10 skills and agents that had it plus `milestone-reviewer` and `plan-reviewer`, and `omitClaudeMd: true` is still set on the four workers (`worker-light`, `worker`, `worker-heavy`, `specialist`). `skills/status/SKILL.md` never had the precedence rule and isn't expected to (D54).
- M11-T01 is the only `change` task. M11-T02 to M11-T07 are `investigate` tasks: each writes only its own note, `plans/orchestratinator-robustness/notes/<task ID>.md`, and changes nothing else. Don't fix anything you find; record it (D55).
- Inside the investigate tasks' Steps, a path with no leading directory named in the Steps (for example `agents/planner.md`, `skills/run/SKILL.md`, `README.md`, `reference/plan-format.md`) is under `plugins/orchestratinator/`.
- Every investigate note has this layout. One `## ` section per check group, with the exact headings the task's last Step lists, then `## Problems` as the last section:

```
# <task ID>: <task title>

## <check group heading>

- `<path>:<line>` — <what the passage says or does, in one line> — OK
- `<path>` — <what the check expected> — PROBLEM: <what is missing or wrong>
- `<path>` — <what the check expected> — UNCONFIRMED: <why the files don't settle it>

## Problems

1. `<path>:<line>` — <problem> (<check group>; <spec § or D<nn>>)
```

- A check is `OK` when the passage exists and agrees with the spec section or Decision the Step cites; `PROBLEM` when the passage is missing or disagrees; `UNCONFIRMED` when you can't tell from the files. Copy every `PROBLEM` and every `UNCONFIRMED` line into `## Problems` as a numbered item (start an `UNCONFIRMED` item's text with `Unconfirmed:`). With none, `## Problems` holds the single line `None.`
- `plans/orchestratinator-robustness/notes/M11-survey.md` is a scout's map with `path:line` starting points. Use it to find passages; confirm each one yourself by reading it, and cite the line numbers you read, not the survey's.
- Verify commands are `grep` or `test` checks run from the repo root, with no backticks inside the command.
- Don't run `git commit` or any other git command that changes history or branches: run commits each task for you.
- T01 to T06 each write a different file and read no other task's file, so they all run in wave 1. T07 reads the notes of T02 to T06, so it runs in wave 2.

Waves: 2 (widths 6, 1)

## Tasks

### M11-T01: Add the robustness entry to the CHANGELOG

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `CHANGELOG.md`
- Verify: `grep -A1 -F "stray worker commits are detected and redone." CHANGELOG.md | grep -qxF -e "- orchestratinator: tasks declare Interfaces and Fails first, milestones carry Coverage and Review Focus, a plan-reviewer and a milestone-reviewer check plans and finished milestones, tiny same-shape edits batch into one task, and planning asks about assumptions instead of making them." && test "$(wc -l < CHANGELOG.md)" -eq 11`
- Commit: `docs(changelog): add the orchestratinator robustness changes`

**Objective**

The repo-root `CHANGELOG.md` has the D13 bullet as the last bullet under `## [Unreleased]` → `### Added`.

**Read first**

- plan.md Decision D13
- `CHANGELOG.md` (the whole file, 10 lines)

**Steps**

1. In `CHANGELOG.md`, directly after line 10 (the line that begins `- orchestratinator: project instruction files no longer override`), add this one line, with no blank line before it, ending with a newline:

```
- orchestratinator: tasks declare Interfaces and Fails first, milestones carry Coverage and Review Focus, a plan-reviewer and a milestone-reviewer check plans and finished milestones, tiny same-shape edits batch into one task, and planning asks about assumptions instead of making them.
```

**Done when**

- `CHANGELOG.md` has 11 lines, and line 11 is exactly the Step 1 line.
- Lines 1 to 10 are unchanged (`git diff` shows only the one added line).

### M11-T02: Read-through of the Format, Interfaces, Coverage, and Review Focus readers

- Kind: investigate
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plans/orchestratinator-robustness/notes/M11-T02.md`
- Verify: `test -s plans/orchestratinator-robustness/notes/M11-T02.md && grep -qx "## Format" plans/orchestratinator-robustness/notes/M11-T02.md && grep -qx "## Review Focus" plans/orchestratinator-robustness/notes/M11-T02.md && grep -qx "## Problems" plans/orchestratinator-robustness/notes/M11-T02.md` + review
- Commit: `chore(plan): M11 read-through of the Format, Interfaces, Coverage, and Review Focus readers`

**Objective**

`notes/M11-T02.md` records, with `path:line`, whether every reader of `- Format: 2`, Interfaces, Coverage, and Review Focus handles it as the spec and Decisions say, and lists every problem found.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §3, §4, §6, §13
- plan.md Decisions D04, D08, D11, D18, D25 to D28, D32, D33, D52
- `plugins/orchestratinator/reference/plan-format.md` (the milestone template, `### Format`, `### Coverage`, `### Review Focus`, Task fields, and Validation checklist)
- `plans/orchestratinator-robustness/notes/M11-survey.md` (sections "Interfaces", "Coverage", "Review Focus")

**Steps**

1. **Format** (spec §13; D08, D28, D52). Check each file for the passage named, one note line per bullet:
   - `reference/plan-format.md`: the milestone template has `- Format: 2` directly after `- Status:`; `### Format` says a milestone without that line is format 1; the Validation checklist marks the Interfaces, Coverage, Fails first, Review Focus, and Batch items as applying to format 2 milestones only.
   - `skills/plan/SKILL.md`: every milestone file it writes, outlined ones included, gets `- Format: 2`.
   - `agents/planner.md`: it writes `- Format: 2` into the milestone it details; a milestone with no Format line when it starts marks a plan created under format 1 (D28), and then it adds its own milestone's plan-level Coverage rows to plan.md, creating `## Coverage` if it is missing (spec §13).
   - `skills/run/SKILL.md`: what it says about format 1 milestones (they still validate and run).
   - `agents/plan-reviewer.md`: a format 1 milestone skips checks 3, 4, and 7 and gets every other check (D52).
   - `agents/milestone-reviewer.md`: it reviews a milestone whatever its format (spec §13), and what it says a format 1 milestone skips.
   - `agents/reviewer.md`: a task with no Interfaces block skips the Interfaces check.
2. **Interfaces** (spec §3; D11, D25, D26):
   - `reference/plan-format.md`: the task template's Interfaces block with `- Consumes:` and `- Produces:`; its Task fields row says format 2 only; an empty side is written `none` (D25); a Consumes of a format 1 task's symbol cites `existing` with a `path:line` (D11); a Validation checklist item for it.
   - `skills/plan/SKILL.md` step 8 and `agents/planner.md` "Self-check": the interface-consistency check (every Consumes matches an earlier task's Produces or an `existing` citation, across milestones too).
   - `agents/planner.md` "Before anything else" item 6: reads the Produces lines of the `done` milestones' tasks (D26).
   - `agents/worker.md`, `agents/worker-light.md`, `agents/worker-heavy.md`, `agents/specialist.md`: implement every Produces exactly, and report a GAP when a Consumes disagrees with the code. Record whether the four passages are word-for-word the same.
   - `agents/reviewer.md`: checks that the code matches every Produces.
   - `agents/plan-reviewer.md` (its Interfaces check), `agents/milestone-reviewer.md` (its check 2), and `README.md` (the Interfaces bullet under "What a plan contains").
3. **Coverage** (spec §4; D04, D08, D18, D27):
   - `reference/plan-format.md`: plan.md's `## Coverage` sits between `## Milestones` and `## Decisions`; the milestone file's `## Coverage` sits after Context and its Waves line and before `## Review Focus` (D08); the row format; the plan-level checklist item carries its own condition, not the *(format 2)* mark (D27).
   - `skills/plan/SKILL.md`: step 9 builds both levels; step 10 (a job done directly) writes no Coverage (D18); step 11 writes both sections at the D08 placements.
   - `agents/planner.md`: its "Build the Coverage" section.
   - `agents/plan-reviewer.md` (its Coverage check), `agents/milestone-reviewer.md` (its check 1), and `README.md` (the Coverage bullet).
4. **Review Focus** (spec §6; D08, D32, D33):
   - `reference/plan-format.md`: the template's `## Review Focus` directly after the milestone's `## Coverage`; the line format ``- <input or condition> → <expected behavior> (source: <§ or D<nn>>). Test: `<test name>` in <task ID>.`` (D08); the single line `None found: <what was checked>` when nothing qualifies (D33); a Validation checklist item.
   - `skills/plan/SKILL.md`: step 6 builds it at its end, before step 7 (D32); step 11 writes it after each milestone's Coverage section.
   - `agents/planner.md`: a `## Build the Review Focus` section directly before `## Sequence and find the parallelism` (D32); an unsourced expected behavior becomes an Open question tagged `[ambiguous]` (D33).
   - `agents/milestone-reviewer.md` (its check 3) and `README.md` (the Review Focus bullet, between the Coverage and Fails first bullets, D33).
5. Write `plans/orchestratinator-robustness/notes/M11-T02.md` in the layout in the milestone's Context, with title `M11-T02: Read-through of the Format, Interfaces, Coverage, and Review Focus readers` and exactly these sections, in this order: `## Format`, `## Interfaces`, `## Coverage`, `## Review Focus`, `## Problems`.

**Done when**

- The note has the five sections in order, and every file bullet in Steps 1 to 4 has at least one line, with a `path:line` for every `OK`.
- Every `PROBLEM` and `UNCONFIRMED` line is also a numbered item under `## Problems`, or `## Problems` is `None.` and no such line exists.
- No file other than the note changed.

### M11-T03: Read-through of the Fails first, Origin, Batch, tier calibration, and Assumptions readers

- Kind: investigate
- Tier: worker
- Status: done
- Wave: 1
- Depends on: none
- Files: `plans/orchestratinator-robustness/notes/M11-T03.md`
- Verify: `test -s plans/orchestratinator-robustness/notes/M11-T03.md && grep -qx "## Fails first and RED" plans/orchestratinator-robustness/notes/M11-T03.md && grep -qx "## Assumptions" plans/orchestratinator-robustness/notes/M11-T03.md && grep -qx "## Problems" plans/orchestratinator-robustness/notes/M11-T03.md` + review
- Commit: `chore(plan): M11 read-through of the Fails first, Origin, Batch, tier, and Assumptions readers`

**Objective**

`notes/M11-T03.md` records, with `path:line`, whether every reader of Fails first and RED (with `VACUOUS` and the §12 report), `- Origin: review`, `- Batch: yes`, tier calibration, and Assumptions handles it as the spec and Decisions say, and lists every problem found.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §5, §9, §10, §11, §12
- plan.md Decisions D02, D03, D10, D20, D23, D29 to D31, D43 to D53
- `plugins/orchestratinator/reference/plan-format.md` (Task fields, `#### Assumptions`, Sequence and parallelism, Tier rubric, Sizing rules, Validation checklist)
- `plans/orchestratinator-robustness/notes/M11-survey.md` (sections "Fails first / RED", "Batch", "Assumptions", "`VACUOUS`")

**Steps**

1. **Fails first and RED** (spec §5, §12; D08, D20, D29, D30, D31):
   - `reference/plan-format.md`: the Fails first row directly after the Verify row, format 2 only; the `- Fails first: no (<reason>)` form; `investigate` tasks omit it; a task whose Verify is `review` alone must be `no` (D08); a Validation checklist item; `VACUOUS` among the `- Blocked:` reasons.
   - `skills/plan/SKILL.md` and `agents/planner.md`: the task-writing passage that sets each task's Fails first line.
   - `agents/worker.md`, `agents/worker-light.md`, `agents/worker-heavy.md`, `agents/specialist.md`: for `Fails first: yes`, run Verify before implementing and report the RED line; report `RED: N/A` for `Fails first: no`, for a task with no Fails first line, and when stopping before Verify ran (D31); the Report block equals spec §12's block character for character (D29). Record whether the four Report blocks are identical to each other.
   - `skills/run/SKILL.md` 3d and 3e: RED is checked only for `Fails first: yes`, before STATUS (D31); `RED: PASSED-EARLY` with any STATUS goes to `VACUOUS` handling: never retried or escalated, `- Blocked: VACUOUS — <worker's NOTE>`, Open question `Verify passed before implementation: <worker's NOTE>`, then Stop (D30); `DONE` with RED missing or `N/A` is retried with `Reason: RED not confirmed (Fails first: yes)` (D20); `VACUOUS` is in the Stop section's reason list.
   - `agents/plan-reviewer.md` (its Fails first check) and `README.md` (the Fails first bullet).
2. **Origin** (D03, D10):
   - `reference/plan-format.md`: the `- Origin: review` Task fields row directly after the Commit row (D08); the directory tree lists `notes/<milestone-id>-review.md`, `notes/<milestone-id>-review-2.md`, and `notes/<milestone-id>-plan-review.md` (D03).
   - `agents/planner.md` "Fix findings mode": each fix task gets `- Origin: review`, and fix tasks follow the milestone's own Format (D10c).
   - `skills/run/SKILL.md` 3f: a milestone with any `- Origin: review` task goes straight to the re-review on resume (D10a).
   - `agents/milestone-reviewer.md`: what it says about `- Origin: review`, checked against D05 and D10.
3. **Batch** (spec §10; D02, D47, D48):
   - `reference/plan-format.md`: the Batch row directly after the Tier row, saying format 2 milestones only (D47, D48); the Steps row and Sizing rules 2 and 3 each carry the batch exception (one Step per file, D02; up to about ten files, spec §17 item 7); the waves bullet directly after the "When in doubt" bullet; the checklist item is the last *(format 2)* item, after Review Focus (D48); a non-batch task has no Batch line, never `- Batch: no` (D47).
   - `skills/plan/SKILL.md` and `agents/planner.md`: the preference for batching tiny same-shape edits.
   - `agents/reviewer.md` and `agents/milestone-reviewer.md`: for a `- Batch: yes` task, every file in Files has its edit (D38).
   - `README.md`: the Batching bullet directly after the Fails first bullet (D48).
4. **Tier calibration** (spec §9; D23, D43 to D46):
   - `reference/plan-format.md` Tier rubric: the `worker-light` row is spec §9's first bullet (D46); spec §9's rationale sentence directly under the table, then the `specialist` note, then the `- Tier adjustment:` note (D45).
   - `agents/planner.md`: "Before anything else" item 8 reads the `- Escalated:` lines in every `done` milestone (D43); the Context line `- Tier adjustment: <kind of task> → <tier> (<tier> escalated <n> times in <milestone IDs>)` (D23); a raise is one tier up run's ladder, only when detailing, not in Fix findings mode (D44).
   - `agents/worker-light.md`: its frontmatter description doesn't say "boilerplate copied from a named file" (D46).
   - `agents/plan-reviewer.md`: its tier-fit check reads the notes under the rubric's table (D45).
5. **Assumptions** (spec §11; D07, D24, D49 to D53):
   - `reference/plan-format.md`: `#### Assumptions` directly after the Open questions paragraph of `### Decisions and open questions`, holding the Definition paragraph, five bullets, the Not assumptions sentence, and the `[assumption]` tag sentence (D49).
   - `skills/plan/SKILL.md`: step 5 says four kinds of problem, with the **Assumption** bullet after the **Contradiction** bullet and the assumption question contents in the "For each question" list (D50); step 11 has the assumption check directly before "Reply to the user with only:", and the reply list has `Assumptions: none` (D51); both point to the plan format's subsection instead of restating it (D49).
   - `agents/planner.md`: four kinds of problem, an unsourceable assumption is a GAP tagged `[assumption]`, and it points to the plan format's subsection (D49).
   - `agents/plan-reviewer.md`: the assumption check is check 9 and Read first is check 10; the frontmatter description and the Calibration name unsourced assumptions (D52).
   - `README.md`: "How to use" item 1 and the "Questions answered first" bullet name the four categories (D24), and the bullet covers what D53 lists.
6. Write `plans/orchestratinator-robustness/notes/M11-T03.md` in the layout in the milestone's Context, with title `M11-T03: Read-through of the Fails first, Origin, Batch, tier calibration, and Assumptions readers` and exactly these sections, in this order: `## Fails first and RED`, `## Origin`, `## Batch`, `## Tier calibration`, `## Assumptions`, `## Problems`.

**Done when**

- The note has the six sections in order, and every file bullet in Steps 1 to 5 has at least one line, with a `path:line` for every `OK`.
- Every `PROBLEM` and `UNCONFIRMED` line is also a numbered item under `## Problems`, or `## Problems` is `None.` and no such line exists.
- No file other than the note changed.

### M11-T04: Read-through of the two new agents' dispatch contracts

- Kind: investigate
- Tier: worker
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plans/orchestratinator-robustness/notes/M11-T04.md`
- Verify: `test -s plans/orchestratinator-robustness/notes/M11-T04.md && grep -qx "## milestone-reviewer" plans/orchestratinator-robustness/notes/M11-T04.md && grep -qx "## Planner modes" plans/orchestratinator-robustness/notes/M11-T04.md && grep -qx "## Problems" plans/orchestratinator-robustness/notes/M11-T04.md` + review
- Commit: `chore(plan): M11 read-through of the milestone-reviewer and plan-reviewer contracts`

**Objective**

`notes/M11-T04.md` records, with `path:line`, whether `milestone-reviewer` and `plan-reviewer` match spec §7 and §8, whether what `run`, `plan`, and `planner` send and read matches what the two agents expect and reply, and lists every problem found.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §7, §8
- plan.md Decisions D05, D09, D10, D21, D22, D34 to D42
- `plugins/orchestratinator/skills/run/SKILL.md` sections 3a and 3f
- `plugins/orchestratinator/agents/planner.md` sections "Fix findings mode" and "Plan review mode"

**Steps**

1. **milestone-reviewer**, in `agents/milestone-reviewer.md`: frontmatter has `model: opus`, `effort: high`, `maxTurns: 60`, and `disallowedTools: Edit` (spec §7; D10e); its numbered checks cover spec §7's checks 1 to 5; check 5 runs each distinct test-running Verify command once from the repo root (D37); its report file has `## Blocking` and `## Advisory` in the D21 line format, with `None.` for an empty section; `Re-review: fixes only` reads `notes/<ID>-review.md` and checks only the blocking findings' fixes and new blocking problems from the fix tasks (D05); its reply block is spec §7's `STATUS` / `BLOCKING` / `ADVISORY` block.
2. **milestone-reviewer dispatch**, in `skills/run/SKILL.md` 3f: write in the note the exact lines 3f sends for the first review and for the re-review, and the exact lines `agents/milestone-reviewer.md` says it receives; they must have the same keys in the same order, with Output `notes/<ID>-review.md` for the first review and `notes/<ID>-review-2.md` for the re-review. Also check: Base is found with `git log --format=%H --grep="^chore(plan): start <ID>$"`, oldest match (D22); the reply keys 3f reads equal the agent's reply block; the commit messages `chore(plan): review <ID>`, `chore(plan): fix tasks <ID>`, `chore(plan): re-review <ID>` (D10d); the report is committed as soon as the reviewer replies, after a scope check allowing only that file (D35); a re-review still blocking marks the milestone `blocked` before the `REVIEW` stop (D36).
3. **plan-reviewer**, in `agents/plan-reviewer.md`: frontmatter has `model: sonnet`, `effort: high`, `maxTurns: 40`, and `disallowedTools: Edit` (spec §8; D10e); checks 1 to 10 follow spec §8's list in order (D52); its report file has `## Issues` as a numbered list in the D21 format, or `None.`; its reply block is spec §8's `STATUS` / `ISSUES` block.
4. **plan-reviewer dispatch**: write in the note the exact lines that `skills/run/SKILL.md` 3a sends, the exact lines `skills/plan/SKILL.md` sends, and the exact lines `agents/plan-reviewer.md` says it receives; all three must be `Plan: <plan dir>`, `Milestone: <ID>`, `Output: <plan dir>/notes/<ID>-plan-review.md` (D09). Also check: `plan` dispatches all detailed milestones in one message (D09), does one fix pass, revalidates changed milestones, and gives issue totals in the handoff (D41); `run` 3a's scope check allows `notes/<ID>-plan-review.md` and commits it in `chore(plan): detail <ID>` (D40); a plan-review fix pass that reports `BLOCKED` / `GAP` discards the uncommitted detailed milestone file (D42); fix tasks from a milestone review are not sent to `plan-reviewer` (D10b).
5. **Planner modes**: write in the note the exact extra line `run` 3f sends for fix mode and the exact extra line `run` 3a sends for plan-review fixes, and the line each `agents/planner.md` mode section expects; they must match (`Fix findings: <path>` and `Plan review: <path>`, spec §7 and §8). Also check Fix findings mode against D34 (fixes only `## Blocking` findings, never reports `SCOUT`, only appends fix tasks and updates the Waves line) and Plan review mode against D39 (fixes every issue under `## Issues`, never reports `SCOUT`, edits only the files detailing allows).
6. **Listings**: the reader list at the top of `reference/plan-format.md` names `milestone-reviewer` and `plan-reviewer` (D24); `README.md`'s cast table has a row for each; `README.md`'s "How a run behaves" describes the milestone review.
7. Write `plans/orchestratinator-robustness/notes/M11-T04.md` in the layout in the milestone's Context, with title `M11-T04: Read-through of the two new agents' dispatch contracts` and exactly these sections, in this order: `## milestone-reviewer`, `## milestone-reviewer dispatch`, `## plan-reviewer`, `## plan-reviewer dispatch`, `## Planner modes`, `## Listings`, `## Problems`.

**Done when**

- The note has the seven sections in order; the dispatch sections quote the sent and expected lines side by side; every check in Steps 1 to 6 has a line, with a `path:line` for every `OK`.
- Every `PROBLEM` and `UNCONFIRMED` line is also a numbered item under `## Problems`, or `## Problems` is `None.` and no such line exists.
- No file other than the note changed.

### M11-T05: Check that every cross-reference in the plugin resolves

- Kind: investigate
- Tier: worker
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plans/orchestratinator-robustness/notes/M11-T05.md`
- Verify: `test -s plans/orchestratinator-robustness/notes/M11-T05.md && grep -qx "## Step and item references" plans/orchestratinator-robustness/notes/M11-T05.md && grep -qx "## Field references" plans/orchestratinator-robustness/notes/M11-T05.md && grep -qx "## Problems" plans/orchestratinator-robustness/notes/M11-T05.md` + review
- Commit: `chore(plan): M11 check of the plugin's cross-references`

**Objective**

`notes/M11-T05.md` records every reference in the plugin's skills, agents, README, and plan format to a step, numbered item, section, field, or agent, whether its target exists, and every reference that doesn't resolve.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §16, the read-through bullet
- plan.md Decision D17
- `plugins/orchestratinator/reference/plan-format.md` (the templates, Task fields, and the lines run appends)

**Steps**

1. **Step and item references.** From the repo root, run `grep -nE "[Ss]teps? [0-9]+|\b[1-4][a-f]\b|[Ii]tems? [0-9]+" plugins/orchestratinator/skills/*/SKILL.md plugins/orchestratinator/agents/*.md plugins/orchestratinator/README.md plugins/orchestratinator/reference/plan-format.md`. For each match that refers to a step, section number, or numbered item, find the file it refers to (the same file, unless the text names another, such as "`run` 3a" or "`plan` step 5") and confirm the target exists there and is about what the reference says. The targets are: `skills/plan/SKILL.md` steps 1 to 11 (headings `## 1.` to `## 11.`); `skills/run/SKILL.md` sections `## 1.`, `## 2.`, `### 2a.` to `### 2c.`, `## 3.`, `### 3a.` to `### 3f.`, `## 4.`; numbered list items inside those sections; `agents/planner.md` "Before anything else" items 1 to 8; the numbered checks in `agents/milestone-reviewer.md` and `agents/plan-reviewer.md`. Skip a match that isn't a reference to a step, section number, or numbered item (for example `3a` inside a hex string or a word), and record nothing for it.
2. **Section references and links.** In the same files, find every reference to a section by name: bold names such as **Retry**, **Stop**, **Block with GAP**, **Pause**, and **Verify a command**; quoted names such as "Before anything else", "Decisions and open questions", "Tier rubric", "Sizing rules", "Validation checklist", "Build the Review Focus", "Fix findings mode", "Plan review mode"; and markdown links `](#<anchor>)` or `](<relative path>)`. For each, confirm a heading (or, for **Verify a command** and **Commit a task**, a Definitions bullet) with that text exists in the file it refers to, and that each relative link's path exists. Bold text that is emphasis, not a section name, is skipped.
3. **Field references.** From the repo root, run the command in the block below, and list each distinct field name it finds.

```
grep -rnoE '`- [A-Z][A-Za-z ]+:' plugins/orchestratinator
```

   The names it finds today are Batch, Blocked, Commit, Consumes, Escalated, Fails first, Format, Origin, Process, Produces, Status, Tier adjustment; record any other name too. For each, confirm `reference/plan-format.md` defines it: in the plan.md or milestone template, the Header fields or Task fields table, the list of lines run appends, or the Tier rubric's Tier adjustment note. `- Process:` is Change 0 text that `skills/run/SKILL.md` defines and writes itself (D17): record it as OK with its `run` line.
4. **Agent references.** Run `grep -rnoE 'orchestratinator:[a-z<>-]+' plugins/orchestratinator` and confirm each name is a directory under `skills/` or a file under `agents/` (`orchestratinator:<tier>` is OK when the text says the tier comes from the task). Then confirm `README.md`'s cast table (under "The cast") has exactly one row for each of the 3 directories in `skills/` and each of the 11 files in `agents/`, plus the `Explore (built in)` row, and no other row.
5. Write `plans/orchestratinator-robustness/notes/M11-T05.md` in the layout in the milestone's Context, with title `M11-T05: Check that every cross-reference in the plugin resolves` and exactly these sections, in this order: `## Step and item references`, `## Section references and links`, `## Field references`, `## Agent references`, `## Problems`. In each section, one line per distinct reference (group repeats of the same reference in one file on one line with all their line numbers).

**Done when**

- The note has the five sections in order, and every grep match from Steps 1, 3, and 4 is covered by a line.
- Every `PROBLEM` and `UNCONFIRMED` line is also a numbered item under `## Problems`, or `## Problems` is `None.` and no such line exists.
- No file other than the note changed.

### M11-T06: Check that Change 0 is intact and every frontmatter block quotes its values

- Kind: investigate
- Tier: worker
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plans/orchestratinator-robustness/notes/M11-T06.md`
- Verify: `test -s plans/orchestratinator-robustness/notes/M11-T06.md && grep -qx "## Change 0" plans/orchestratinator-robustness/notes/M11-T06.md && grep -qx "## Frontmatter" plans/orchestratinator-robustness/notes/M11-T06.md && grep -qx "## Problems" plans/orchestratinator-robustness/notes/M11-T06.md` + review
- Commit: `chore(plan): M11 check of Change 0 and frontmatter quoting`

**Objective**

`notes/M11-T06.md` records the Change 0 grep results against their expected file lists, whether any Change 0 line was altered since it was applied, and whether every skill and agent frontmatter value that needs quoting is quoted.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §1 ground rule 5, §2, §16
- plan.md Decisions D17 and D54

**Steps**

1. Run `grep -rlF "They do not govern git" plugins/orchestratinator | sort`. Expected, exactly these 12 files under `plugins/orchestratinator/`: `agents/milestone-reviewer.md`, `agents/plan-reviewer.md`, `agents/planner.md`, `agents/reviewer.md`, `agents/scout-heavy.md`, `agents/scout.md`, `agents/specialist.md`, `agents/worker-heavy.md`, `agents/worker-light.md`, `agents/worker.md`, `skills/plan/SKILL.md`, `skills/run/SKILL.md` (D54: `skills/status/SKILL.md` is not expected). Record the list and any missing or extra file.
2. Run `grep -rlF "omitClaudeMd: true" plugins/orchestratinator | sort`. Expected, exactly: `agents/specialist.md`, `agents/worker-heavy.md`, `agents/worker-light.md`, `agents/worker.md`. Then run `grep -rlF "If one is a symlink to the other, or they have identical content, read it once." plugins/orchestratinator | sort`; expected, the same 12 files as Step 1. Record both lists and any difference.
3. Confirm the two new agents copy Change 0 verbatim (spec §2): run `grep -hF "They do not govern git" plugins/orchestratinator/agents/scout.md`, then the same for `agents/milestone-reviewer.md` and `agents/plan-reviewer.md`; all three output lines must be identical, and each must contain `You never commit, push, or change branches.`
4. Confirm no Change 0 line was altered since it was applied in commit `7d43fa8` (D17): run `git diff 7d43fa8 HEAD -- plugins/orchestratinator | grep -E "^-[^-]" | grep -E "They do not govern git|If one is a symlink to the other|You never commit, push, or change branches|The orchestrator commits your work|omitClaudeMd: true|PUSHED|stray"`. Expected, exactly one removed line: the old `skills/run/SKILL.md` Stop-section line that begins `2. Report: where, the reason (GAP, STUCK, SCOPE, VERIFY, REVIEW, MERGE, STRAY, PUSHED,`. It is expected because spec §5 and §14 add `VACUOUS` to that list; confirm the current line in `skills/run/SKILL.md`'s Stop section still lists `PUSHED` and `STRAY` and now also lists `VACUOUS`. Any other removed line is a problem. Also run `grep -nF "Check for stray commits" plugins/orchestratinator/skills/run/SKILL.md` and record that the stray-commit check is still in 3d and 3e.
5. **Frontmatter** (spec §1 ground rule 5): for each of the 14 files `skills/plan/SKILL.md`, `skills/run/SKILL.md`, `skills/status/SKILL.md`, and the 11 files in `agents/`, read the block between the first two `---` lines. For every `key: value` line, the value must be quoted with `"` or `'` if it contains `: ` or starts with any of `<`, `[`, `{`, `*`, `&`, `!`, `|`, `>`, `%`, `@`, or a backtick. Record one line per file: `OK`, or `PROBLEM:` naming the key and the character or substring that needs quoting.
6. Write `plans/orchestratinator-robustness/notes/M11-T06.md` in the layout in the milestone's Context, with title `M11-T06: Check that Change 0 is intact and every frontmatter block quotes its values` and exactly these sections, in this order: `## Change 0`, `## Frontmatter`, `## Problems`. Under `## Change 0`, give each command from Steps 1 to 4 on its own line in a fenced block, followed by its output and `OK` or `PROBLEM:` with the difference from what was expected.

**Done when**

- `## Change 0` shows each Step 1 to 4 command, its output, and a verdict; `## Frontmatter` has one line for each of the 14 files.
- Every `PROBLEM` and `UNCONFIRMED` line is also a numbered item under `## Problems`, or `## Problems` is `None.` and no such line exists.
- No file other than the note changed.

### M11-T07: Collect the read-through's problems

- Kind: investigate
- Tier: worker-light
- Status: todo
- Wave: 2
- Depends on: M11-T02, M11-T03, M11-T04, M11-T05, M11-T06
- Files: `plans/orchestratinator-robustness/notes/M11-T07.md`
- Verify: `test -s plans/orchestratinator-robustness/notes/M11-T07.md && grep -qx "## Problems" plans/orchestratinator-robustness/notes/M11-T07.md && grep -qF "M11-T06" plans/orchestratinator-robustness/notes/M11-T07.md` + review
- Commit: `chore(plan): M11 read-through result`

**Objective**

`notes/M11-T07.md` lists every problem the five read-through notes found, and the run stops with a GAP if there is any, so fix tasks get planned (D55).

**Read first**

- plan.md Decision D55
- The `## Problems` section of each of `plans/orchestratinator-robustness/notes/M11-T02.md`, `M11-T03.md`, `M11-T04.md`, `M11-T05.md`, and `M11-T06.md`

**Steps**

1. Read the `## Problems` section of each of the five notes, in the order M11-T02, M11-T03, M11-T04, M11-T05, M11-T06.
2. Write `plans/orchestratinator-robustness/notes/M11-T07.md` with the title line `# M11-T07: Read-through result`, then a `## Sources` section with one line per note, ``- `plans/orchestratinator-robustness/notes/<task ID>.md` — <n> problems`` (`0 problems` when its section is `None.`), then a `## Problems` section. Under `## Problems`, copy every numbered item from the five notes, renumbered from 1 in the order read, each ending with ` [from <task ID>]`. If all five sections are `None.`, write the single line `None.`
3. If `## Problems` in your note is `None.`, report `STATUS: DONE` as usual.
4. If `## Problems` in your note has any item, still write the note, and report `STATUS: BLOCKED`, `REASON: GAP`, with `NOTE: The M11 read-through found <n> problems, listed in plans/orchestratinator-robustness/notes/M11-T07.md. Which of them should become fix tasks?`

**Done when**

- The note has `## Sources` with five lines and `## Problems` with every item from the five notes, or `None.`
- The report is `DONE` exactly when `## Problems` is `None.`, and `BLOCKED` / `GAP` otherwise.
- No file other than the note changed.
