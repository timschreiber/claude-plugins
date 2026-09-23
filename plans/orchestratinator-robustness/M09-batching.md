# M09: Change 8: Batching tiny, same-shape tasks (spec §10)

- Status: in-progress
- Goal: The plan format has an optional `- Batch: yes` task field with its rules and relaxed sizing limits. `plan` and the planner prefer one batch task over several tiny same-shape tasks. The per-task reviewer checks a batch file by file. The README describes batching.
- Depends on: M08
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §10, plus D01, D02, D08, D16, D17, D47, and D48 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). This milestone file gets no Coverage or Review Focus section. Never modify Change 0 text (D17).
- `- Batch: yes` is a format 2 field (D47). The milestone-reviewer already checks batches file by file (`agents/milestone-reviewer.md`, added in M06); this milestone adds the same check to the per-task `reviewer` and leaves `agents/milestone-reviewer.md` unchanged.
- Insert the text in each Step exactly as written, character for character, including backticks, asterisks, pipes, and parentheses. Change nothing else in the file: no rewording, no reformatting, no other lines. When a Step says "insert ... directly after X", the new text starts on its own line directly below X, with no blank line between them unless the Step says otherwise. When a Step says "replace that whole line", only that one line changes.
- Literal text to write sits in a fenced block that starts at column 0, directly below the Step that uses it. Write the block's content exactly, without its outer fence and with no added indentation.
- Don't touch `agents/plan-reviewer.md`, `agents/milestone-reviewer.md`, `skills/run/SKILL.md`, the worker agents, or anything about assumptions (M10).
- Don't run `git commit` or any other git command that changes history or branches: run commits each task for you.
- M09-T01 and M09-T02 both edit `reference/plan-format.md`, so M09-T02 runs after M09-T01. Every other task edits a different file and reads no other task's file.

Waves: 2 (widths 5, 1)

## Tasks

### M09-T01: Add the Batch field to the plan format's task template and fields

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/reference/plan-format.md`
- Verify: `grep -A1 -xF -e "- Tier: worker" plugins/orchestratinator/reference/plan-format.md | grep -qxF -e "- Batch: yes" && grep -qF "| Batch | Format 2 milestones only. Optional: a batch task has the line" plugins/orchestratinator/reference/plan-format.md && grep -qF "It is one commit, like every task, and is usually" plugins/orchestratinator/reference/plan-format.md && grep -qxF "| Steps | Numbered. Each step is one concrete action. At most about seven steps, except in a batch task, which has one Step per file in its Files. |" plugins/orchestratinator/reference/plan-format.md`
- Commit: `feat(orchestratinator): add the Batch task field to the plan format`

**Objective**

The plan format's task template shows `- Batch: yes` directly after Tier, its Task fields table has a Batch row with spec §10's rules, and the Steps row allows one Step per file in a batch task.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §10, the **Plan format** paragraph and its bullets
- plan.md Decisions D02, D08, D47, D48

**Steps**

1. In `plugins/orchestratinator/reference/plan-format.md`, find the task template under `## Tasks` inside the milestone-file template: the line that is exactly `- Tier: worker` (directly after `- Kind: change`). Directly after that line, insert this line:

```
- Batch: yes
```

2. Under `### Task fields`, find the table row that begins ``| Tier | `worker-light`, `worker`, `worker-heavy`, or `specialist`. |``. Directly after that line (and before the row that begins `| Why this tier |`), insert this line:

```
| Batch | Format 2 milestones only. Optional: a batch task has the line `- Batch: yes`, directly after Tier; any other task has no Batch line. A batch task groups edits of the **same kind with no logic**: the same constant change, field addition, import fix, or rename across files. It relaxes two sizing rules: it may touch about ten files instead of about three production files, and it has one Step per file in its Files, each with the literal edit for that file, instead of at most about seven Steps. It is one commit, like every task, and is usually `worker-light`. Waves still apply: a batch touching many files interferes with more tasks, so place it accordingly. |
```

3. In the same table, find the row that is exactly `| Steps | Numbered. Each step is one concrete action. At most about seven steps. |`. Replace that whole line with this line:

```
| Steps | Numbered. Each step is one concrete action. At most about seven steps, except in a batch task, which has one Step per file in its Files. |
```

**Done when**

- In the task template, `- Batch: yes` is the line directly after `- Tier: worker` and directly before `- Status: todo`.
- The Batch row is the Task fields row directly after the Tier row and before the Why this tier row, and its text is the Step 2 line.
- The Steps row is the Step 3 line.
- No other line in the file changed (`git diff` shows only these three edits).

### M09-T02: Relax the sizing rules for batch tasks and add the waves note and checklist item

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 2
- Depends on: M09-T01
- Files: `plugins/orchestratinator/reference/plan-format.md`
- Verify: `grep -qF "2. It touches at most about three production files, plus their tests. A batch task (" plugins/orchestratinator/reference/plan-format.md && grep -qxF "3. It has at most about seven Steps and five Read first entries. A batch task has one Step per file in its Files, each with the literal edit for that file, instead of at most about seven Steps." plugins/orchestratinator/reference/plan-format.md && grep -qF "so check it against every other task in its wave by the five rules above, and move one of any interfering pair to a later wave." plugins/orchestratinator/reference/plan-format.md && grep -qF "has one Step per file in its Files, each with the literal edit for that file. *(format 2)*" plugins/orchestratinator/reference/plan-format.md`
- Commit: `feat(orchestratinator): relax sizing rules for batch tasks`

**Objective**

The plan format's Sizing rules relax the file and Step limits for a batch task, Sequence and parallelism notes that a batch interferes with more tasks, and the validation checklist has a format 2 item requiring one Step per file in a batch task.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §10, the **Plan format** bullets and the "Waves still apply" sentence
- plan.md Decisions D02, D47, D48

**Steps**

1. In `plugins/orchestratinator/reference/plan-format.md`, under `## Sizing rules`, find the line that is exactly `2. It touches at most about three production files, plus their tests.`. Replace that whole line with this line:

```
2. It touches at most about three production files, plus their tests. A batch task (`- Batch: yes`) may touch about ten files.
```

2. Find the line that is exactly `3. It has at most about seven Steps and five Read first entries.`. Replace that whole line with this line:

```
3. It has at most about seven Steps and five Read first entries. A batch task has one Step per file in its Files, each with the literal edit for that file, instead of at most about seven Steps.
```

3. Under `## Sequence and parallelism`, find the bullet line that begins `- When in doubt, put the tasks in different waves.`. Directly after that line, insert this line:

```
- Waves still apply to a batch task (`- Batch: yes`). A batch touching many files interferes with more tasks, so check it against every other task in its wave by the five rules above, and move one of any interfering pair to a later wave.
```

4. Under `## Validation checklist`, find the checklist line that begins ``- [ ] A detailed milestone has a `## Review Focus` section``. Directly after that line (and before the blank line that precedes the paragraph beginning `Items marked *(format 2)*`), insert this line:

```
- [ ] Every task with `- Batch: yes` has one Step per file in its Files, each with the literal edit for that file. *(format 2)*
```

**Done when**

- Sizing rules 2 and 3 are the Step 1 and Step 2 lines; rules 1, 4, 5, and 6 are unchanged.
- The Step 3 bullet sits directly below the `- When in doubt` bullet and directly above the `- Within a wave, task ID order` bullet.
- The Step 4 item is the last checklist item, directly below the Review Focus item.
- No other line in the file changed (`git diff` shows only these four edits).

### M09-T03: plan prefers batch tasks when writing tasks

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/skills/plan/SKILL.md`
- Verify: `grep -qF "over several tiny same-shape tasks. Edits of the same kind with no logic" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "so place it accordingly in step 7." plugins/orchestratinator/skills/plan/SKILL.md`
- Commit: `feat(orchestratinator): plan prefers batch tasks`
- Process: worker committed on its own; reset and recommitted

**Objective**

Step 6 of the `plan` skill tells it to prefer one batch task over several tiny same-shape tasks.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §10, the paragraph beginning "`plan` and `planner` prefer one batch task"
- plan.md Decisions D02, D47

**Steps**

1. In `plugins/orchestratinator/skills/plan/SKILL.md`, under `## 6. Write the tasks as prompts`, find the bullet line that is exactly `- One action per step, at most about seven steps, at most about three production files.`. Directly after that line (and before the bullet that begins `- Read first names the exact source sections`), insert this line:

```
- Prefer one batch task (`- Batch: yes`) over several tiny same-shape tasks. Edits of the same kind with no logic, such as the same constant change, field addition, import fix, or rename across files, go in one batch task of up to about ten files, with one Step per file giving the literal edit for that file, usually on `worker-light`, as the plan format's Batch field defines it. Waves still apply: a batch touching many files interferes with more tasks, so place it accordingly in step 7.
```

**Done when**

- The Step 1 bullet is the bullet directly after `- One action per step, at most about seven steps, at most about three production files.` and directly before `- Read first names the exact source sections and pattern files the task needs, not whole documents.`
- The frontmatter, every step heading and number, and every other line are unchanged (`git diff` shows only the one inserted line).

### M09-T04: planner prefers batch tasks when writing tasks

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/planner.md`
- Verify: `grep -qF "over several tiny same-shape tasks. Edits of the same kind with no logic" plugins/orchestratinator/agents/planner.md && grep -qF "so place it accordingly when you sequence the tasks." plugins/orchestratinator/agents/planner.md`
- Commit: `feat(orchestratinator): planner prefers batch tasks`

**Objective**

The planner's "Write the tasks as prompts" section tells it to prefer one batch task over several tiny same-shape tasks.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §10, the paragraph beginning "`plan` and `planner` prefer one batch task"
- plan.md Decisions D02, D47

**Steps**

1. In `plugins/orchestratinator/agents/planner.md`, under `## Write the tasks as prompts`, find the paragraph line that begins `Write a task list in which`. Directly after that line, insert one blank line and then this paragraph as a single line (so one blank line separates it from the `Write a task list in which` paragraph above and one blank line from the `When you detail a milestone, calibrate tiers against past escalations.` paragraph below):

```
Prefer one batch task (`- Batch: yes`) over several tiny same-shape tasks. Edits of the same kind with no logic, such as the same constant change, field addition, import fix, or rename across files, go in one batch task of up to about ten files, with one Step per file giving the literal edit for that file, usually on `worker-light`, as the plan format's Batch field defines it. Waves still apply: a batch touching many files interferes with more tasks, so place it accordingly when you sequence the tasks.
```

**Done when**

- The Step 1 paragraph sits between the `Write a task list in which` paragraph and the `When you detail a milestone, calibrate tiers against past escalations.` paragraph, with one blank line on each side, and is one line.
- The frontmatter, the `## Fix findings mode` and `## Plan review mode` sections, the Change 0 paragraph under `## Write`, the `## Report` block, and every other line are unchanged (`git diff` shows only this insertion).

### M09-T05: reviewer checks a batch task file by file

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/reviewer.md`
- Verify: `grep -qF "line: check file by file that every file in its Files has its edit, as that file's Step gives it. A listed file with no change is a failure." plugins/orchestratinator/agents/reviewer.md`
- Commit: `feat(orchestratinator): reviewer checks batch tasks file by file`

**Objective**

The per-task `reviewer` checks a task with `- Batch: yes` file by file and fails it when a listed file has no change.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §10, the **Reviewers** paragraph
- `plugins/orchestratinator/agents/milestone-reviewer.md` line 51 (the same rule, for the milestone review)

**Steps**

1. In `plugins/orchestratinator/agents/reviewer.md`, under `## Check`, find the bullet line that begins `- For a task with an Interfaces block:`. Directly after that line (and before the bullet that begins ``- For an `investigate` task:``), insert this line:

```
- For a task with a `- Batch: yes` line: check file by file that every file in its Files has its edit, as that file's Step gives it. A listed file with no change is a failure.
```

**Done when**

- The Step 1 bullet is directly after the Interfaces bullet and directly before the `investigate` bullet under `## Check`.
- The frontmatter, the Change 0 paragraph, the `## Report` block, and every other line are unchanged (`git diff` shows only the one inserted line).

### M09-T06: Describe batching in the README

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/README.md`
- Verify: `grep -qF -e "- **Batching.** Several identical small edits across files cost one worker, not several." plugins/orchestratinator/README.md && grep -qF "check a batch file by file, and a listed file with no change is a failure." plugins/orchestratinator/README.md`
- Commit: `docs(orchestratinator): describe batching in the README`

**Objective**

The README's "What a plan contains" section has a Batching bullet directly after the Fails first bullet.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §10, and the `README.md` row of the §14 table
- plan.md Decisions D47, D48

**Steps**

1. In `plugins/orchestratinator/README.md`, under `### What a plan contains`, find the bullet line that begins `- **Fails first.**`. Directly after that line (and before the bullet that begins `- **Sequence and parallelism.**`), insert this line:

```
- **Batching.** Several identical small edits across files cost one worker, not several. A task marked `Batch: yes` groups edits of the same kind with no logic, such as the same constant change, field addition, import fix, or rename across files: it may touch about ten files instead of about three, has one Step per file with the literal edit, is one commit, and usually runs on `worker-light`. `plan` and the planner prefer one batch task over several tiny same-shape tasks. Waves still apply: a batch touching many files interferes with more tasks, so it is sequenced like any other. The reviewer and the milestone-reviewer check a batch file by file, and a listed file with no change is a failure.
```

**Done when**

- The Step 1 bullet is directly after the Fails first bullet and directly before the Sequence and parallelism bullet under `### What a plan contains`.
- The cast table and every other line are unchanged (`git diff` shows only the one inserted line).
