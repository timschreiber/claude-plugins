# M10: Change 9: Assumptions are questions (spec §11)

- Status: in-progress
- Goal: The plan format defines assumptions in an "Assumptions" subsection with the `[assumption]` tag. `plan` audits four categories, and replaces the handoff's assumptions line with a pre-handoff assumption check that ends in `Assumptions: none`. The planner treats an unsourceable assumption as a GAP tagged `[assumption]`. `plan-reviewer` checks for unsourced assumptions. The README describes four question categories.
- Depends on: M09
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §11 and the §8 bullet "unsourced assumptions, per §11"; plus D01, D07, D16, D17, D24, and D49 to D53 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). This milestone file gets no Coverage or Review Focus section. Never modify Change 0 text (D17).
- The definition of an assumption lives only in `reference/plan-format.md` (D07, D49). `plan`, the planner, and `plan-reviewer` point to it and don't restate it; the Steps give the exact pointer text.
- Insert the text in each Step exactly as written, character for character, including backticks, asterisks, brackets, quotes, and parentheses. Change nothing else in the file: no rewording, no reformatting, no other lines. When a Step says "insert ... directly after X", the new text starts on its own line directly below X, with no blank line between them unless the Step says otherwise. When a Step says "replace that whole line", only that one line changes. When a Step says "in that line, change A to B", only that substring of that line changes.
- Literal text to write sits in a fenced block that starts at column 0, directly below the Step that uses it. Write the block's content exactly, without its outer fence and with no added indentation.
- Don't touch `agents/milestone-reviewer.md`, `skills/run/SKILL.md`, the worker agents, `agents/reviewer.md`, or the repo-root `CHANGELOG.md` (M11).
- Don't run `git commit` or any other git command that changes history or branches: run commits each task for you.
- Every task edits a different file and reads no other task's file, so all five run in wave 1.

Waves: 1 (widths 5)

## Tasks

### M10-T01: Add the Assumptions subsection to the plan format

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/reference/plan-format.md`
- Verify: `grep -B2 -xF "#### Assumptions" plugins/orchestratinator/reference/plan-format.md | grep -qF "Open questions are tagged with the milestone or task they block." && grep -qF "An assumption is any choice or conclusion the plan depends on that isn't stated in the sources, a Decision, or CLAUDE.md / AGENTS.md" plugins/orchestratinator/reference/plan-format.md && grep -qF "a structural choice not dictated by the sources, such as splitting one source phase into several milestones." plugins/orchestratinator/reference/plan-format.md && grep -qF "**Not assumptions:** the plugin's own documented defaults for plan settings" plugins/orchestratinator/reference/plan-format.md && grep -qF "In Open questions, it is tagged" plugins/orchestratinator/reference/plan-format.md`
- Commit: `feat(orchestratinator): define assumptions in the plan format`

**Objective**

`reference/plan-format.md` has a `#### Assumptions` subsection under "Decisions and open questions" holding spec §11's definition verbatim and the `[assumption]` Open-questions tag.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §11, the **Definition** paragraph, its bullets, and the **Not assumptions** sentence
- plan.md Decisions D07 and D49

**Steps**

1. In `plugins/orchestratinator/reference/plan-format.md`, under `### Decisions and open questions`, find the line that begins `Open questions are tagged with the milestone or task they block.`. Directly after that line, insert one blank line, then this block (the file's existing blank line before `## Milestone file` stays after it):

```
#### Assumptions

**Definition.** An assumption is any choice or conclusion the plan depends on that isn't stated in the sources, a Decision, or CLAUDE.md / AGENTS.md, and isn't a fact read directly from code or docs with a citation. Typical forms:

- a default filled in where the sources are silent (a branch, a location, a name, a threshold, a tag);
- a convention extrapolated from existing code to new code;
- an algorithm or format detail the sources don't specify;
- a factual conclusion drawn from evidence rather than stated anywhere, such as "these fixtures were licensed under X on date Y". The evidence is attached, but the conclusion still needs the user's confirmation;
- a structural choice not dictated by the sources, such as splitting one source phase into several milestones.

**Not assumptions:** the plugin's own documented defaults for plan settings (Detailing, Gates, Parallel, Max parallel), and facts a scout or Explore reported with a `path:line` or URL citation.

An assumption is asked as a question, like the other three kinds of problem: insufficient information, ambiguity, and contradiction. In Open questions, it is tagged `[assumption]`.
```

**Done when**

- `#### Assumptions` sits two lines below the line that begins `Open questions are tagged`, with one blank line between them, and the Step 1 block ends directly before the blank line that precedes `## Milestone file`.
- The Definition paragraph, the five bullets, and the Not assumptions sentence match spec §11 character for character.
- No other line in the file changed (`git diff` shows only this insertion).

### M10-T02: Add the assumption category and the pre-handoff assumption check to the plan skill

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/skills/plan/SKILL.md`
- Verify: `grep -qF "the existing code for four kinds of problem:" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "grouped under those four headings and numbered" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF -e "- **Assumption.** A choice or conclusion the plan depends on" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF -e "- For an assumption, state what you would assume" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "Before you hand off, check the finished plan" plugins/orchestratinator/skills/plan/SKILL.md && grep -qF "Assumptions: none" plugins/orchestratinator/skills/plan/SKILL.md && ! grep -qF "Any assumption you made that the user" plugins/orchestratinator/skills/plan/SKILL.md`
- Commit: `feat(orchestratinator): plan asks about assumptions and checks for them before handoff`

**Objective**

`skills/plan/SKILL.md` step 5 audits four categories including **Assumption**, and step 11 checks the finished plan for assumptions before handing off and states `Assumptions: none` instead of listing assumptions.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §11, the paragraphs "`plan` skill, step 5" and "`plan` skill, handoff"
- plan.md Decisions D07, D49, D50, and D51

**Steps**

1. In `plugins/orchestratinator/skills/plan/SKILL.md`, under `## 5. Find every problem and ask about it`, find the line that is exactly `Before writing any task, audit the sources, CLAUDE.md / AGENTS.md, and the existing code for three kinds of problem:`. In that line, change `three kinds of problem` to `four kinds of problem`.

2. Find the bullet line that begins `- **Contradiction.** Two passages conflict:`. Directly after that line, insert this line:

```
- **Assumption.** A choice or conclusion the plan depends on that the plan format defines as an assumption, in the Assumptions subsection of its "Decisions and open questions" section. Ask about it instead of filling it in yourself.
```

3. Find the line that begins `**Ask before you write the plan.**`. In that line, change `grouped under those three headings` to `grouped under those four headings`.

4. Find the line that is exactly `- For an ambiguity, state each reading.`. Directly after that line, insert this line:

```
- For an assumption, state what you would assume, why the plan needs it, and your recommended value, plus the evidence for a factual conclusion.
```

5. Under `## 11. Write and hand off`, find the line that is exactly `Reply to the user with only:`. Directly before that line, insert this paragraph followed by one blank line, so that the paragraph has a blank line above it (the existing one) and below it:

```
Before you hand off, check the finished plan (plan.md and every milestone file, detailed or outlined) for assumptions, as the plan format's Assumptions subsection defines them. If you find any, don't hand off yet: ask them as one more round of questions, as in step 5, and record every answer under Decisions with source `user`. Then update every part of the plan an answer changes, under the same rules you wrote it by in steps 6 to 9, run the validation checklist again on every milestone you changed, and fix every failure. Then hand off.
```

6. Find the line that is exactly `- Any assumption you made that the user didn't state. There should be none; if there are, say so plainly.`. Replace that whole line with this line:

```
- `Assumptions: none`, on its own line.
```

**Done when**

- Step 5's intro says `four kinds of problem`, the **Assumption** bullet is directly below the **Contradiction** bullet, and the grouping sentence says `those four headings`.
- The `- For an assumption` line is directly below `- For an ambiguity, state each reading.` and directly above the `- Give the options you see` line.
- In step 11, the Step 5 paragraph sits directly before `Reply to the user with only:`, separated from it and from the paragraph above it by one blank line each.
- The reply list's line before `- Next steps:` is the Step 6 line, and the old assumption line is gone.
- No other line in the file changed (`git diff` shows only these six edits).

### M10-T03: Add the assumption category and tag to the planner

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/planner.md`
- Verify: `grep -qF -e "- **An assumption**: a choice or conclusion this milestone depends on" plugins/orchestratinator/agents/planner.md && grep -qF "[insufficient | ambiguous | contradiction | assumption] <question>" plugins/orchestratinator/agents/planner.md && ! grep -qF "[insufficient | ambiguous | contradiction] <question>" plugins/orchestratinator/agents/planner.md`
- Commit: `feat(orchestratinator): planner treats unsourced assumptions as GAPs`

**Objective**

`agents/planner.md`'s "Find every problem" section lists assumption as a fourth category, makes an unsourceable one a GAP tagged `[assumption]`, and its Open-questions template's bracket list includes `assumption`.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §11, the paragraph "**`planner`.**"
- plan.md Decisions D07 and D49

**Steps**

1. In `plugins/orchestratinator/agents/planner.md`, under `## Find every problem`, find the bullet line that begins `- **Contradictory**: two passages conflict,`. Directly after that line, insert this line:

```
- **An assumption**: a choice or conclusion this milestone depends on that the plan format defines as an assumption, in the Assumptions subsection of its "Decisions and open questions" section. An assumption you can't source is a GAP, tagged `[assumption]`.
```

2. In the fenced Open-questions template in the same section, find the line that is exactly `- (M03) [insufficient | ambiguous | contradiction] <question>`. Replace that whole line with this line:

```
- (M03) [insufficient | ambiguous | contradiction | assumption] <question>
```

**Done when**

- The **An assumption** bullet is directly below the **Contradictory** bullet and directly above the blank line before `Answer what the sources, Decisions, notes, or code settle`.
- The template's first line is the Step 2 line; its `Where:` and `Options:` lines are unchanged.
- No other line in the file changed (`git diff` shows only these two edits).

### M10-T04: Add the unsourced-assumptions check to plan-reviewer

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/plan-reviewer.md`
- Verify: `grep -qF "Fails first, tier fit, unsourced assumptions, and Read first. Read-only" plugins/orchestratinator/agents/plan-reviewer.md && grep -A1 -F "8. **Tier fit.**" plugins/orchestratinator/agents/plan-reviewer.md | grep -qF "9. **Unsourced assumptions.** Any value or choice in a task" && grep -qF "10. **Read first.** Every entry names a section" plugins/orchestratinator/agents/plan-reviewer.md && grep -qF "make two tasks collide, rest on an unsourced assumption, or break a rule of the plan format." plugins/orchestratinator/agents/plan-reviewer.md && grep -qF "skip checks 3, 4, and 7 for it" plugins/orchestratinator/agents/plan-reviewer.md`
- Commit: `feat(orchestratinator): plan-reviewer checks for unsourced assumptions`

**Objective**

`agents/plan-reviewer.md` has check 9, Unsourced assumptions, pointing to the plan format's Assumptions subsection; Read first becomes check 10; and the frontmatter description and Calibration name unsourced assumptions.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §11, the paragraph "**`plan-reviewer`.**"
- plan.md Decisions D07, D49, and D52

**Steps**

1. In `plugins/orchestratinator/agents/plan-reviewer.md`, find the frontmatter line that begins `description: "Reviews one detailed Orchestratinator milestone`. In that line, change `tier fit, and Read first.` to `tier fit, unsourced assumptions, and Read first.`. Keep the line's opening and closing double quotes.

2. Under `## Check`, find the line that begins `9. **Read first.** Every entry names a section`. In that line, change the leading `9. **Read first.**` to `10. **Read first.**`.

3. Find the line that begins `8. **Tier fit.**`. Directly after that line (and before the `10. **Read first.**` line from Step 2), insert this line:

```
9. **Unsourced assumptions.** Any value or choice in a task that no source, Decision, or cited fact supports is an issue; report each one found as its own issue. What is and isn't an assumption is defined in the Assumptions subsection of the plan format's "Decisions and open questions" section.
```

4. Under `## Calibration`, find the line that begins `Approve unless there are real gaps.`. In that line, change `make two tasks collide, or break a rule of the plan format.` to `make two tasks collide, rest on an unsourced assumption, or break a rule of the plan format.`.

**Done when**

- The Check list runs 1 to 10 with no gaps, check 9 is the Step 3 line, and check 10 is Read first with its text otherwise unchanged.
- The description line is still one double-quoted YAML string and now lists `unsourced assumptions` before `and Read first`.
- The Calibration line has the Step 4 wording.
- The format 1 line under `## Check` (the one that begins `A milestone file without a`) is unchanged and still says `skip checks 3, 4, and 7 for it`.
- No other line in the file changed (`git diff` shows only these four edits).

### M10-T05: Describe the four question categories in the README

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/README.md`
- Verify: `grep -qF "audits the sources for missing information, ambiguity, contradictions, and assumptions, and asks you" plugins/orchestratinator/README.md && grep -qF "groups its questions as insufficient information, ambiguity, contradiction, or assumption," plugins/orchestratinator/README.md && grep -qF "so the handoff says" plugins/orchestratinator/README.md && ! grep -qF "missing information, ambiguity, and contradictions" plugins/orchestratinator/README.md`
- Commit: `docs(orchestratinator): describe assumption questions in the README`

**Objective**

The README's "How to use" item 1 and its "Questions answered first" bullet name four question categories, and the bullet explains assumption questions and the pre-handoff check.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §11, the **Definition** paragraph and the "`plan` skill, step 5" and "`plan` skill, handoff" paragraphs
- plan.md Decisions D24 and D53

**Steps**

1. In `plugins/orchestratinator/README.md`, under `## How to use`, find the line that begins `1. **Plan.**`. In that line, change `audits the sources for missing information, ambiguity, and contradictions, and asks you` to `audits the sources for missing information, ambiguity, contradictions, and assumptions, and asks you`.

2. Under `### What a plan contains`, find the line that begins `- **Questions answered first.**`. Replace that whole line with this line:

```
- **Questions answered first.** `plan` groups its questions as insufficient information, ambiguity, contradiction, or assumption, quotes the passages involved, lists the options, and recommends one when it can. An assumption is any choice or conclusion the plan depends on that no source, Decision, or CLAUDE.md / AGENTS.md states and that isn't a fact cited from the code or docs, such as a default branch, a name, or splitting one source phase into several milestones. For one, `plan` says what it would assume, why the plan needs it, and what it recommends, plus the evidence for a factual conclusion. It never resolves a contradiction or ambiguity, or fills in an assumption, on its own, and it writes nothing until you answer. Before handing off, it checks the finished plan for assumptions and asks about any it finds, so the handoff says `Assumptions: none`. The planner stops with a question for an assumption it can't source, and the plan-reviewer reports any it finds in a task. Your answers become recorded Decisions.
```

**Done when**

- Item 1 names four categories, with the rest of its line unchanged.
- The "Questions answered first" bullet is the Step 2 line, still directly above the `- **Tasks that are prompts.**` bullet.
- No other line in the file changed (`git diff` shows only these two edits).
