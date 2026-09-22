# M03 survey: Change 2 — Spec coverage check (spec §4)

State surveyed is the repo after M02 (Interfaces per task, `done`). Confirmed via `grep -rn "Coverage" plugins/orchestratinator` (no matches, before this survey's own writes): the word "Coverage" (the term, capitalized) does not exist anywhere in `plugins/orchestratinator/` yet — wholly new vocabulary, same as "Interfaces" was for M02.

## Outline bullet 1: `reference/plan-format.md`

File: `plugins/orchestratinator/reference/plan-format.md` (250 lines).

### plan.md template — add `## Coverage` between Milestones and Decisions

The template code block (`## plan.md`, fenced ```markdown` block) has the Milestones table and Decisions heading at:

```
42	## Milestones
43	
44	| ID | Title | Status | File |
45	|---|---|---|---|
46	| M01 | <title> | ready | M01-<slug>.md |
47	| M02 | <title> | outline | M02-<slug>.md |
48	
49	## Decisions
50	
51	- D01: <decision> (source: <spec § / sources/prompt.md / user / GAP in M01-T04>)
```

Per D08, `## Coverage` goes directly after the Milestones table (line 47) and directly before `## Decisions` (line 49) — i.e., a new section inserted into the blank-line gap at line 48.

### Milestone file template — add `## Coverage` after Context/Waves, before Outline/Tasks

The milestone-file template's Context section ends, and Outline begins, at:

```
97	## Context
98	
99	<Constraints every task in this milestone must respect: packages, naming, patterns to copy
100	(by file path), things not to touch, and the source sections that govern this milestone.
101	Every worker reads this section before its task. Keep it short.>
102	
103	Waves: <count> (widths <w1>, <w2>, ...)
104	
105	## Outline
106	
107	<Only while Status is outline: bullet list of intended scope, for the planner.
108	Removed when the milestone is detailed.>
109	
110	## Tasks
```

Per D08 ("after Context (and its Waves line) and before Outline or Tasks"), `## Coverage` goes between line 103 (`Waves: ...`) and line 105 (`## Outline`).

### Row format and "requirement" definition

Spec §4 gives the row format verbatim (spec `docs/orchestratinator-robustness-spec.md:64`):
```
- <source> <location>: <requirement, briefly> → <task IDs | milestone ID | out of scope (D<nn>)>
```
and the definitions (spec lines 61-63):
- Line 61: `plan.md` gains a `## Coverage` section: one row per section of every source (heading or numbered item), mapped to the milestone(s) that implement it, or `out of scope` with the Decision that says so.
- Line 62: Every **detailed** milestone file gains a `## Coverage` section: one row per requirement the milestone implements, mapped to the task ID(s) that implement it.
- Line 63: A requirement is any normative statement: must, shall, should, a numbered acceptance criterion, or an explicit behavior. Trivially related statements may share a row.

No existing subsection in `plan-format.md` defines "requirement" or a row format today (confirmed: no matches for "row format" or "normative" in the file). The nearest analogous subsections are `### Format` (`plugins/orchestratinator/reference/plan-format.md:149-151`) and `### Survey` (`plugins/orchestratinator/reference/plan-format.md:71-73`) — both are short prose subsections placed after the code block whose behavior they explain. Where exactly a new `### Coverage` explanatory subsection goes (after `### Decisions and open questions`, line 84, vs. after `### Format`/`### Task fields`, lines 151/172) is not fixed by any source — task-detailing decision.

### Validation checklist — three new items

Current checklist tail, `plugins/orchestratinator/reference/plan-format.md:243-249`:
```
243	- [ ] Every investigate task's Files is exactly its own note, `plans/<plan-slug>/notes/<task-id>.md`.
244	- [ ] Every `change` task has an Interfaces block directly after Read first, with at least one Consumes line and one Produces line (`none` allowed for either), and no `investigate` task has one. *(format 2)*
245	- [ ] Every Interfaces entry is an exact signature or exact name, and every Consumes names its source: a task ID, or `existing` with a `path:line`. *(format 2)*
246	- [ ] Every Consumes that cites a task matches that task's Produces character for character, and the consuming task lists that task in Depends on. *(format 2)*
247	- [ ] No symbol is produced by two tasks with different signatures. *(format 2)*
248	
249	Items marked *(format 2)* apply only to format 2 milestones (see [Format](#format)). Format 1 milestones validate as before, so plans already in progress keep running.
```
Spec §4 (line 68): "plan.md has a Coverage section with no unmapped row; every detailed milestone has a Coverage section with no unmapped row; every task ID in a Coverage row exists." Plan.md's D04 narrows the plan-level item: "Plan-level Coverage completeness (one row per section of every source) is checked only when every milestone in the plan is format 2. Otherwise validation checks only that each format 2 milestone has its plan-level rows and that they are mapped." (plan.md:35)

The natural anchor, matching M02's insertion pattern (M02 added its four `*(format 2)*` items directly after the investigate-task item, line 243, and before the closing sentence, line 249), is directly after line 247 and before line 248. Exact wording of the three items (especially how to phrase D04's conditional plan-level check) is a task-detailing decision; the milestone-level item and the task-ID item are milestone-scoped and should carry `*(format 2)*` like the Interfaces items, since spec §13 says the new checklist items (including Coverage) apply "only to format 2 milestones." The plan-level plan.md item is not itself scoped to one milestone, so whether it also needs the `*(format 2)*` tag (vs. being conditioned on "every milestone is format 2" per D04, which is a different condition than "this milestone is format 2") is unresolved by the sources — flagged below.

### Task fields table — not touched by this milestone

The `### Task fields` table (`plugins/orchestratinator/reference/plan-format.md:153-172`) defines per-task fields (Interfaces is a row there, line 169). Coverage is a milestone/plan-level section, not a task field, so the Outline for M03 does not call for a Task fields row, and spec §4 doesn't describe one.

## Outline bullet 2: `skills/plan/SKILL.md`

File: `plugins/orchestratinator/skills/plan/SKILL.md` (162 lines, `## 1` through `## 10`).

### Insertion point: new step directly after Self-check

```
114	## 8. Self-check
115	
116	For every task, apply this test: *could a Sonnet agent that has read only CLAUDE.md / AGENTS.md, plan.md's Decisions, the milestone's Context, and this task with its Read first list, complete it without asking anything and without making a single choice?* If not, split the task or add the missing specifics.
117	
118	For every outlined milestone, check that its Goal, Context, and Outline give the planner enough to detail it later without asking what the user meant.
119	
120	Run an interface-consistency pass across all tasks of every milestone you detailed, including Consumes that cite a task in another milestone: every Interfaces entry is an exact signature or exact name; every Consumes names its source, a task ID or `existing` with a `path:line`; every Consumes that cites a task matches that task's Produces character for character, and that task is in the consuming task's Depends on; and no symbol is produced by two tasks with different signatures. Fix every mismatch.
121	
122	Then run the validation checklist from the plan format and fix every failure.
123	
124	## 9. Size check: do small jobs directly
```
D19: "The new Coverage step in the `plan` skill comes directly after the Self-check step" — i.e. inserted between line 122 and line 124, as a new `## 9. <title>` heading. This pushes the current `## 9. Size check: do small jobs directly` (line 124) to `## 10.` and the current `## 10. Write and hand off` (line 150) to `## 11.`.

Spec content for this step (spec `docs/orchestratinator-robustness-spec.md:66`): "New step after the self-check: build both coverage levels. A requirement with no task or milestone gets one added. If it seems deliberately out of scope, that's a question for the user, never a silent drop."

### D18 — direct-mode (size check) behavior

D18 (plan.md:59): "When the `plan` skill does a small job directly (its size-check step), it still checks that every requirement maps to a drafted task, and writes no Coverage anywhere." This must land inside what becomes step 10 (`Size check: do small jobs directly`, currently lines 124-148):
```
124	## 9. Size check: do small jobs directly
125	
126	Orchestration has fixed costs: this plan, a fresh context for every worker, and independent verification of every task. For a small job, those cost more than they save.
127	
128	Do the job directly, instead of writing a plan, when **all** of these hold:
129	
130	- The whole job came out at `--direct-max` tasks or fewer (default 5), in a single milestone.
131	- `--always-plan` wasn't given, and the user didn't ask for a plan in so many words.
132	- Every question from step 5 has been answered. The size check never skips the questions.
133	
134	To do it directly:
...
146	6. Don't write a plan directory. Reply with only: what you did (one line per task), the verify results, and the commits you made, or that the changes are uncommitted.
147	
148	Otherwise, write the plan.
149	
150	## 10. Write and hand off
```
No existing line in this step mentions "requirement" or coverage-mapping; exact insertion point for D18's rule (a new bullet near line 132, or a new sub-step near line 134-146) is a task-detailing decision.

### Step-number renumbering (D19) — every reference to "step 9" / "step 10"

Grepped all occurrences of `step 9` / `step 10` / `(step` in this file (`plugins/orchestratinator/skills/plan/SKILL.md`):

| Line | Text | Current referent | New number |
|---|---|---|---|
| 13 | `...which you do yourself (step 9).` | Size check | → step 10 |
| 19 | `` `--yes`: approval given in advance for doing a small job directly (step 9). `` | Size check | → step 10 |
| 50 | `Write these files when you write the plan directory in step 10.` | Write and hand off | → step 11 |
| 50 | `If the job turns out small enough to do directly (step 9), there is no plan directory...` | Size check | → step 10 |
| 132 | `Every question from step 5 has been answered.` | Find every problem (step 5, unaffected) | stays step 5 |
| 139 | `If they say "plan it", skip the rest of this step and write the plan (step 10).` | Write and hand off | → step 11 |
| 143 | `Do the tasks you drafted in step 6, in the order from step 7...` | Write tasks / Sequence (steps 6-7, unaffected) | stays step 6, step 7 |

Every "step 9" reference means the size check and becomes "step 10"; every "step 10" reference means write-and-hand-off and becomes "step 11". No other file in the plugin references `plan`'s step numbers (checked `plugins/orchestratinator/skills/run/SKILL.md` — its own "step 6 onward" references are to `run`'s own steps, unrelated).

Section headings to rename: `## 9. Size check: do small jobs directly` (line 124) → `## 10. ...`; `## 10. Write and hand off` (line 150) → `## 11. ...`.

## Outline bullet 3: `agents/planner.md`

File: `plugins/orchestratinator/agents/planner.md` (76 lines).

### Building the milestone's Coverage section

Spec (`docs/orchestratinator-robustness-spec.md:66`): "**`planner`:** when detailing a milestone, build its Coverage section from the plan-level rows pointing at it; a row it can't map is a GAP."

No existing section in `planner.md` currently handles building a new milestone-level section from plan-level data; the closest analogous work (interface-consistency pass, added by M02) lives in `## Self-check` (`plugins/orchestratinator/agents/planner.md:55-57`):
```
55	## Self-check
56	
57	For every task: *could a Sonnet agent that has read only CLAUDE.md / AGENTS.md, plan.md's Decisions, this milestone's Context, and this task with its Read first list, complete it without asking anything and without making a single choice?* If not, split it or add the specifics. Run an interface-consistency pass across all tasks in this milestone and against the Produces of `done` milestones: every Interfaces entry is an exact signature or exact name; every Consumes names its source, a task ID or `existing` with a `path:line`; every Consumes that cites a task matches that task's Produces character for character, and that task is in the consuming task's Depends on; and no symbol is produced by two tasks, in this milestone or a `done` one, with different signatures. Fix every mismatch in this milestone's tasks. Then run the validation checklist for this milestone and fix every failure.
```
Other candidate sections: `## Write the tasks as prompts` (lines 43-49), `## Sequence and find the parallelism` (lines 51-53). None of these, nor the spec, dictates exactly where "build the Coverage section" belongs relative to task-writing, sequencing, or self-check — task-detailing decision.

Already-existing reading instructions that may already cover the inputs needed: item 3 of "Before anything else" (`plugins/orchestratinator/agents/planner.md:17`): `` 3. `plan.md`: the whole file, including Decisions and Open questions. `` — this already reads the whole `plan.md`, which will include its new `## Coverage` section once M03 lands, so the plan-level rows pointing at this milestone are already in scope without an edit to item 3. Not confirmed whether the Outline intends an explicit callout (compare item 6, `plugins/orchestratinator/agents/planner.md:20`, which M02 extended with an explicit sentence about Produces even though item 3 doesn't mention plan.md's Decisions read implies task Interfaces).

### GAP for an unmappable row

Existing GAP-writing format (`plugins/orchestratinator/agents/planner.md:35-41`):
```
35	You can't ask the user directly. If anything remains open, **don't guess, don't resolve it yourself, and don't write tasks.** Report `BLOCKED` / `GAP`, and write every question into plan.md's Open questions, tagged with this milestone, in this form:
36	
37	```
38	- (M03) [insufficient | ambiguous | contradiction] <question>
39	  Where: <passage locations; for a contradiction, quote both sides>
40	  Options: <the readings or choices you see>; recommended: <one, with a one-line reason, or "none">
41	```
```
Spec says a Coverage row the planner "can't map is a GAP" but doesn't say which of the three existing tags (`insufficient | ambiguous | contradiction`) applies, or whether a fourth tag is needed. `insufficient` reads as the closest fit (no task covers a stated requirement) — not settled by any source; flagged below.

### `## Write` — what the planner may edit in plan.md

```
59	## Write
60	
61	Project instruction files (...) govern coding conventions, style, and project knowledge. They do not govern git. ... You never commit, push, or change branches; run commits your work.
62	
63	Edit only two files: this milestone's file (replace the Outline section with Tasks, update Context if needed, set Status to `ready`, and put `- Format: 2` directly after the Status line, adding it if it's missing, even in a plan created under format 1) and plan.md (Decisions, Open questions, and this milestone's table row set to `ready`). On a GAP, edit only plan.md's Decisions and Open questions and leave the milestone as `outline`. On a SCOUT, edit nothing. Don't commit.
```
Outline bullet 3's last clause — "Coverage is part of what the planner may edit in plan.md" — means line 63's parenthetical list `(Decisions, Open questions, and this milestone's table row set to `ready`)` needs `Coverage` added. The same line's milestone-file edit list ("replace the Outline section with Tasks, update Context if needed, ...") doesn't currently mention adding a `## Coverage` section to the milestone file either, though the milestone template (per Outline bullet 1) places `## Coverage` before `## Outline`/`## Tasks` — so building the milestone's Coverage section is also an edit to "this milestone's file," not mentioned in line 63 today.

### Format-1 plans: adding plan-level Coverage rows

Spec §13 (`docs/orchestratinator-robustness-spec.md:256`): "For a format 1 plan, it also adds the plan-level Coverage rows for its own milestone, creating the section if needed." Outline bullet 3, second line: "In a plan created under format 1, also add the plan-level Coverage rows for its own milestone, creating plan.md's `## Coverage` section if needed (§13)." No existing planner.md text distinguishes format 1 vs format 2 *plans* (as opposed to milestones) — the only format-related planner text is in `## Write`, line 63: "put `- Format: 2` directly after the Status line ... even in a plan created under format 1" (which is about the *milestone's* own format line, added by M01). D16/D16-adjacent format-1-plan handling for Coverage rows is new to M03.

## Outline bullet 4: `README.md`

File: `plugins/orchestratinator/README.md` (138 lines).

### "What a plan contains" — current bullets

```
78	### What a plan contains
79	
80	- **Questions answered first.** ...
81	- **Tasks that are prompts.** ...
82	- **Interfaces.** Every `change` task lists what it consumes and what it produces: ...
83	- **Sequence and parallelism.** Every task has dependencies and a Wave. ...
```
No Coverage bullet exists. M02 inserted its Interfaces bullet directly after "Tasks that are prompts" (line 81 at the time) and before "Sequence and parallelism," per `plans/orchestratinator-robustness/M02-interfaces.md:240` ("Directly after it, insert this bullet as a new line (before the bullet that begins `- **Sequence and parallelism.**`)"). The spec's own files-changed list orders these features as "Interfaces, Coverage, Review Focus, Fails first, batching" (`docs/orchestratinator-robustness-spec.md:272`), consistent with inserting the new Coverage bullet directly after the current Interfaces bullet (line 82) and before Sequence and parallelism (line 83) — matching M02's insertion pattern one bullet later. Exact position isn't otherwise fixed by any source; task-detailing decision.

## Cross-cutting notes

- Confirmed (grep) no file in `plugins/orchestratinator/` currently contains the string `Coverage`; this is new vocabulary end to end.
- D04 (plan.md:35) is the only source narrowing the plan-level "no unmapped row" checklist item; it is stated as a plan-wide condition ("every milestone in the plan is format 2"), which is a different scope than the per-milestone `*(format 2)*` tag used by every other conditional checklist item so far (M01/M02's tag conditions on the *milestone's own* format, not the *whole plan's*). How to express that distinction in the checklist wording/tagging is unresolved by the sources.
- D18 (plan.md:59) and D19 (plan.md:60) both target `skills/plan/SKILL.md` only; neither mentions `agents/planner.md` needing a "direct mode" concept (the planner is never invoked for jobs small enough to be done directly — that path is entirely inside `plan`).
- Milestone-reviewer's and plan-reviewer's Coverage checks are explicitly out of scope for M03 (belong to M06/M07 per M03's Context note, and per spec `docs/orchestratinator-robustness-spec.md:128` and `:163`, which are governing sources for those later milestones, not this one).
- `reference/plan-format.md`'s reader list at the top of the file (`plugins/orchestratinator/reference/plan-format.md:3-8`) is unaffected by M03 (D24 assigns adding `milestone-reviewer`/`plan-reviewer` to that list to M06/M07).

## Unconfirmed

- Exact placement of the new `### Coverage` explanatory subsection in `plan-format.md` (near `### Format`/`### Task fields`, or near `### Decisions and open questions`) — not fixed by any source, task-detailing decision.
- Exact wording of the three new validation-checklist items in `plan-format.md`, in particular how D04's plan-wide (not per-milestone) condition should be expressed relative to the existing `*(format 2)*` tag convention.
- Exact anchor/wording for D18's "size check still checks requirement mapping, writes no Coverage" rule inside what becomes step 10 of `skills/plan/SKILL.md`.
- Exact placement, within `agents/planner.md`, of the logic that builds the milestone's Coverage section from plan-level rows (Self-check, a new dedicated section, or elsewhere) — no source specifies this.
- Whether an unmappable Coverage row uses the existing `insufficient` GAP tag or needs a new tag/form in `agents/planner.md`'s GAP template (lines 35-41) — not stated by the spec or any Decision.
- Whether `agents/planner.md`'s "Before anything else" reading list (items 3, 5, 6) needs an explicit new sentence calling out reading the plan-level Coverage rows that point at this milestone, or whether the existing "the whole file, including Decisions and Open questions" (item 3) is deemed sufficient — compare how M02 added an explicit sentence to item 6 for Produces even though a broader instruction already existed.
- Exact bullet position for the new README "Coverage" bullet (inferred as directly after the Interfaces bullet, by analogy with M02 and the spec's file-changed ordering, but not stated outright).

## Conflicts

None found.
