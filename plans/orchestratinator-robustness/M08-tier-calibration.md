# M08: Change 7: Tier calibration (spec §9)

- Status: in-progress
- Goal: The tier rubric restricts `worker-light` to tasks whose Steps contain the literal final content, with the turn-count rationale under the rubric. The planner raises a kind of task one tier after repeated escalations, and records that in Context.
- Depends on: M07
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §9, plus D01, D06, D16, D17, D23, and D43–D46 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). This milestone file gets no Coverage or Review Focus section. Never modify Change 0 text (D17), including `omitClaudeMd: true` in `agents/worker-light.md` and the precedence-rule paragraph under the planner's `## Write`.
- Insert the text in each Step exactly as written, character for character, including backticks, asterisks, arrows (`→`), and angle brackets. Change nothing else in the file: no rewording, no reformatting, no other lines. When a Step says "insert ... directly after X", the new text starts on its own line directly below X; blank lines are exactly as the Step describes.
- Literal text to write sits in a fenced block that starts at column 0, directly below the Step that uses it. Write the block's content exactly, without its outer fence and with no added indentation.
- Agent frontmatter must parse as YAML (spec §1.5). The description line in M08-T03 is already valid; copy it exactly.
- The README cast table row for `worker-light` ("No-logic edits.") doesn't contradict the new rubric and stays unchanged (D46). Don't touch `README.md`, `agents/plan-reviewer.md`, `skills/run/SKILL.md`, or `skills/plan/SKILL.md`.
- Don't run `git commit` or any other git command that changes history or branches: run commits each task for you.
- Every task edits a different file and no task reads another task's file, so all three run in one wave.

Waves: 1 (widths 3)

## Tasks

### M08-T01: Narrow worker-light in the tier rubric and add its notes

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/reference/plan-format.md`
- Verify: `grep -qF "| Haiku | Only tasks whose Steps contain the **literal final content** to write: complete lines of code or config, exact file text. The work is transcription plus verification." plugins/orchestratinator/reference/plan-format.md && grep -qxF "The cheapest models often take two to three times as many turns on multi-step work described in prose, which can cost more overall." plugins/orchestratinator/reference/plan-format.md && grep -qF "Tasks of that kind in that milestone take the tier the line names, one tier above the one that escalated." plugins/orchestratinator/reference/plan-format.md && ! grep -qF "boilerplate copied from a named file" plugins/orchestratinator/reference/plan-format.md`
- Commit: `feat(orchestratinator): narrow worker-light in the tier rubric`
- Process: worker committed on its own; reset and recommitted

**Objective**

The plan format's tier rubric limits `worker-light` to tasks whose Steps contain the literal final content, has the turn-count rationale directly under its table, and notes that a `- Tier adjustment:` line in a milestone's Context raises a kind of task one tier.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §9, the **Why** sentence and the **Plan format, tier rubric** bullets
- plan.md Decisions D06, D23, D45, D46

**Steps**

1. In `plugins/orchestratinator/reference/plan-format.md`, under `## Tier rubric`, find the table row that begins ``| `worker-light` | Haiku |``. Replace that whole line with this line:

```
| `worker-light` | Haiku | Only tasks whose Steps contain the **literal final content** to write: complete lines of code or config, exact file text. The work is transcription plus verification. If any step requires composing code from a prose description, the floor is `worker`. |
```

2. Find the table row that begins ``| `specialist` | Opus / high |`` (the table's last row). It is followed by one blank line and then the line that begins `If more than about one task in ten is`. Between that blank line and the `If more than about one task in ten is` line, insert this line followed by one blank line (so the table, a blank line, this line, a blank line, and the `If more than about one task in ten is` line follow each other in that order):

```
The cheapest models often take two to three times as many turns on multi-step work described in prose, which can cost more overall.
```

3. Find the line that begins `If more than about one task in ten is`. Directly after it, insert one blank line and then this line (the existing blank line before `## Sizing rules` stays, so exactly one blank line separates this new line from `## Sizing rules`):

```
A milestone's Context can hold `- Tier adjustment:` lines, which the planner writes when the same tier escalated two or more times on the same kind of task in `done` milestones. Tasks of that kind in that milestone take the tier the line names, one tier above the one that escalated.
```

**Done when**

- The `worker-light` row's third cell is the Step 1 text; the `worker`, `worker-heavy`, and `specialist` rows are unchanged.
- Under the table, in order and separated by single blank lines: the Step 2 rationale line, the existing `If more than about one task in ten is` line, the Step 3 note, then `## Sizing rules`.
- No other line in the file changed (`git diff` shows only these three edits).

### M08-T02: planner raises tiers after repeated escalations

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/planner.md`
- Verify: `grep -qF "milestone of the plan, not only the ones this milestone depends on, and the title and Objective of each task that has one." plugins/orchestratinator/agents/planner.md && grep -qF "When you detail a milestone, calibrate tiers against past escalations." plugins/orchestratinator/agents/planner.md && grep -qF "escalated <n> times in <milestone IDs>)" plugins/orchestratinator/agents/planner.md && grep -qF "this way gives that adjustment as its Why this tier line." plugins/orchestratinator/agents/planner.md`
- Commit: `feat(orchestratinator): planner raises tiers after repeated escalations`

**Objective**

When detailing a milestone, the planner reads the `- Escalated:` lines in every `done` milestone, raises a kind of task one tier when the same tier escalated two or more times on it, and records each raise as a `- Tier adjustment:` line in the milestone's Context.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §9, the **`planner`, escalation feedback** paragraph
- plan.md Decisions D06, D23, D43, D44

**Steps**

1. In `plugins/orchestratinator/agents/planner.md`, under `## Before anything else`, find the numbered item that begins `7. The survey notes for this milestone`. Directly after that line, insert this line, with no blank line between them (the blank line that followed item 7 now follows this line):

```
8. The `- Escalated:` lines in every `done` milestone of the plan, not only the ones this milestone depends on, and the title and Objective of each task that has one.
```

2. Under `## Write the tasks as prompts`, find the paragraph line that begins `Write a task list in which`. Directly after that line, insert one blank line and then this paragraph as a single line (so one blank line separates it from the `Write a task list in which` paragraph above and one blank line from the `If the milestone needs facts nobody has established yet` paragraph below):

```
When you detail a milestone, calibrate tiers against past escalations. For each `- Escalated:` line you read in `done` milestones, judge the kind of task it escalated from that task's title, Objective, and the line's reason. If the same tier (the line's `<from>`) escalated two or more times on the same kind of task, give every task of that kind in this milestone the next tier up from that one, on the ladder `worker-light` → `worker` → `worker-heavy` → `specialist`, and add one bullet to this milestone's Context for each kind you raise: `- Tier adjustment: <kind of task> → <tier> (<tier> escalated <n> times in <milestone IDs>)`. A task raised to `worker-heavy` or `specialist` this way gives that adjustment as its Why this tier line.
```

**Done when**

- `## Before anything else` has items 1 through 8, with the Step 1 line as item 8, directly below item 7.
- The Step 2 paragraph sits between the `Write a task list in which` paragraph and the `If the milestone needs facts nobody has established yet` paragraph, with one blank line on each side, and is one line.
- The frontmatter, the `## Fix findings mode` and `## Plan review mode` sections, the Change 0 paragraph under `## Write`, the `## Report` block, and every other line are unchanged (`git diff` shows only these two insertions).

### M08-T03: Describe worker-light as literal-content work

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/worker-light.md`
- Verify: `grep -qxF "description: Executes one Orchestratinator task whose Steps contain the literal final content to write (complete lines of code or config, exact file text). Dispatched by /orchestratinator:run only." plugins/orchestratinator/agents/worker-light.md && grep -qxF "omitClaudeMd: true" plugins/orchestratinator/agents/worker-light.md && ! grep -qF "boilerplate from a named file" plugins/orchestratinator/agents/worker-light.md`
- Commit: `feat(orchestratinator): describe worker-light as literal-content work`

**Objective**

The `worker-light` agent's frontmatter description matches the narrowed rubric instead of listing "boilerplate from a named file".

**Read first**

- `docs/orchestratinator-robustness-spec.md` §9, the first **Plan format, tier rubric** bullet
- plan.md Decision D46

**Steps**

1. In `plugins/orchestratinator/agents/worker-light.md`, in the frontmatter, find the line that begins `description: Executes one no-logic Orchestratinator task`. Replace that whole line with this line:

```
description: Executes one Orchestratinator task whose Steps contain the literal final content to write (complete lines of code or config, exact file text). Dispatched by /orchestratinator:run only.
```

**Done when**

- The frontmatter's `description:` line is the Step 1 line.
- The `name`, `model`, `maxTurns`, and `omitClaudeMd: true` lines, and the whole body below the frontmatter, are unchanged (`git diff` shows only the one replaced line).
