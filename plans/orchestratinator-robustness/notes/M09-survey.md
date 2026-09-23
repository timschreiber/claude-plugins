# M09 survey: batching tiny, same-shape tasks (spec §10)

Governing source: `docs/orchestratinator-robustness-spec.md` §10 (lines 198-213), plan.md D02, D08, D16, D17.

Spec §10 text (verbatim, key lines):
- Line 202: "New optional task field `- Batch: yes`. A batch task:"
- Line 204: "groups edits of the **same kind with no logic**: the same constant change, field addition, import fix, or rename across files;"
- Line 205: "relaxes the three-production-file sizing limit to about ten files;"
- Line 206: "has one Step per file, each with the literal edit;"
- Line 207: "is one commit, and is usually `worker-light`."
- Line 209: "`plan` and `planner` prefer one batch task over several tiny same-shape tasks. Waves still apply: a batch touching many files interferes with more tasks, so place it accordingly."
- Line 211 (Reviewers): "For a batch, check file by file that every listed file has its edit. A listed file with no change is a failure."

D02 (plan.md:33): "`- Batch: yes` also relaxes the 'at most about seven Steps' sizing rule to one Step per file."
D08 (plan.md:42): "Task fields: `- Batch: yes` directly after `- Tier:`".

## Outline bullet 1: `reference/plan-format.md`

File: `plugins/orchestratinator/reference/plan-format.md` (309 lines).

### Task template (add `- Batch: yes` after Tier, D08)

Template block at lines 132-169. Current field order (lines 134-143):
```
134	- Kind: change
135	- Tier: worker
136	- Status: todo
137	- Wave: 1
138	- Depends on: none
139	- Files: `path/to/Thing.java`, `path/to/ThingTest.java`
140	- Verify: `<targeted, quiet command>`
141	- Fails first: yes
142	- Commit: `<type>(<scope>): <message>`
143	- Origin: review
```
`- Batch: yes` must be inserted as a new line directly after line 135 (`- Tier: worker`) and before line 136 (`- Status: todo`), per D08's "Task fields: `- Batch: yes` directly after `- Tier:`". Since the field is optional, the template line should show it is optional — compare how `- Origin: review` (line 143) is already shown in the template despite being "Only on a fix task" per the Task fields table (line 215); the template shows it unconditionally as an example. Follow that pattern: add `- Batch: yes` as a template line the same way.

### Task fields table (add a Batch row with §10 rules)

Table at lines 200-220 (`| Field | Rule |`). Current rows in order: ID (204), Kind (205), Tier (206), Why this tier (207), Status (208), Wave (209), Depends on (210), Files (211), Verify (212), Fails first (213), Commit (214), Origin (215), Objective (216), Read first (217), Interfaces (218), Steps (219), Done when (220).

New `Batch` row goes directly after the `Tier` row (206) — matching the template placement and D08 — or after `Why this tier` (207) since that's the row that logically follows Tier. The milestone outline text (bullet 1) says "Add `- Batch: yes` to the task template (after Tier, D08) and a Task fields row with the §10 rules: same kind, no logic; about ten files; one Step per file with the literal edit; one commit; usually `worker-light`." Row content should state, verbatim from spec: "groups edits of the same kind with no logic … relaxes the three-production-file sizing limit to about ten files … one Step per file, each with the literal edit … is one commit, and is usually `worker-light`."

Existing "Why this tier" row (line 207): `| Why this tier | Required line for \`worker-heavy\` and \`specialist\` only. One sentence. |` — no interaction with Batch expected, but note `worker-light` is the usual tier for a batch task, which is unaffected by the Why-this-tier rule (only required for worker-heavy/specialist).

### Sizing rules section (update for batch tasks, D02)

Section "Sizing rules" at lines 268-279:
```
270	A task is correctly sized when:
271	
272	1. It is one commit.
273	2. It touches at most about three production files, plus their tests.
274	3. It has at most about seven Steps and five Read first entries.
274	4. It needs **no new reasoning or design decisions**. ...
```
Rule 2 (line 273: "at most about three production files, plus their tests") must be qualified for batch tasks per spec line 205 ("relaxes the three-production-file sizing limit to about ten files").
Rule 3 (line 274: "at most about seven Steps and five Read first entries") must be qualified per D02 ("relaxes the 'at most about seven Steps' sizing rule to one Step per file") and spec line 206 ("has one Step per file, each with the literal edit").
Rule 1 (line 272: "It is one commit") already matches spec line 207 ("is one commit") — no change needed for batch, since a batch task already is one commit like any task.

Milestone outline bullet 1 also says: "Update the Sizing rules for batch tasks (D02), and add the waves note: a batch touching many files interferes with more tasks." This waves note derives from spec line 209: "Waves still apply: a batch touching many files interferes with more tasks, so place it accordingly." The "Sequence and parallelism" section (lines 236-251) is where wave/interference rules live, not "Sizing rules" — the outline bullet groups both edits together but they may land in different sections. The "Sequence and parallelism" section's five interference rules are at lines 241-246; rule 1 is "Their Files overlap" (line 242), which already covers a batch's many files implicitly, but the milestone outline wants an explicit note about batch tasks specifically ("a batch touching many files interferes with more tasks"). No existing text names batch tasks in that section.

### Validation checklist item (format 2): one Step per file

Checklist at lines 281-308. Format-2-tagged items are individually marked `*(format 2)*` (e.g. lines 297-306). The outline (bullet 1, third sub-bullet) says: "Add a *(format 2)* checklist item: every batch task has one Step per file in its Files." No existing checklist item mentions Batch. New item should go among the other format-2 items, likely near the Fails first / Interfaces items (lines 297-306) since Batch is a per-task line like those. Wording should follow the existing checklist item style, e.g. pattern from line 304: "- [ ] Every `change` task has a Fails first line directly after Verify, either `yes` or `no (<reason>)` with a one-line reason, and no `investigate` task has one. *(format 2)*".

### Reader list at top of file

Lines 3-10 list plan.md/run/planner/plan-reviewer/milestone-reviewer/workers-and-reviewer as readers of the format. `reviewer` is already listed (line 10: "**workers** and **reviewer** (agents), which read their task from it"). No new reader needs adding for M09 (unlike D24, which was for M06/M07 adding milestone-reviewer/plan-reviewer — already done).

## Outline bullet 2: `skills/plan/SKILL.md` and `agents/planner.md` — prefer batching

### `skills/plan/SKILL.md`

Step 6, "Write the tasks as prompts" (lines 93-106 of `plugins/orchestratinator/skills/plan/SKILL.md`). Current bullet list (lines 97-100):
```
97	- Translate the sources into concrete steps. Don't forward prose for the worker to interpret.
98	- Write down every value: names, signatures, types, constants, messages, paths, test names, test cases.
99	- One action per step, at most about seven steps, at most about three production files.
100	- Read first names the exact source sections and pattern files the task needs, not whole documents.
```
No mention of batching anywhere in this file currently (confirmed no "batch" hits when reading the whole SKILL.md). The outline requires this step to state a preference: "one batch task over several tiny same-shape tasks" (spec line 209, D02 sizing relaxation applies once `Batch: yes` is used).

### `agents/planner.md`

Section "Write the tasks as prompts" (lines 44-52 of `plugins/orchestratinator/agents/planner.md`). Current text (line 46): "Write a task list in which **every task is small, simple, and mechanical**... Default to `worker`; justify each `worker-heavy` and `specialist` with a Why this tier line. Number tasks from `T01`." No mention of batching currently. The outline names this exact section: `agents/planner.md` ("Write the tasks as prompts")`. Same preference statement needed here.

Both files' step/section are the task-drafting step, so the added guidance should read consistently between them (SKILL.md step 6 and planner.md's "Write the tasks as prompts" section have near-identical prose already, e.g. compare SKILL.md lines 95-100 to planner.md line 46 — they are worded in parallel).

## Outline bullet 3: `agents/reviewer.md` — Check section, per-file batch check

File: `plugins/orchestratinator/agents/reviewer.md`. "Check" section at lines 24-32:
```
24	## Check
25	
26	Judge only against what the task asks. Not your own preferences, not improvements you would make.
27	
28	- The Objective is met, and every Step was done as written.
29	- Every Done-when criterion holds.
30	- Nothing contradicts Decisions, the milestone's Context, or CLAUDE.md / AGENTS.md.
31	- For a task with an Interfaces block: the code matches every Produces entry exactly as written (names, parameter and return types, constant values). A task without an Interfaces block (a format 1 task) skips this check.
32	- For an `investigate` task: the note answers every question the Steps ask, backs its facts with `path:line` references, and marks what it couldn't confirm. Spot-check at least two references.
```
No batch-related bullet currently exists. D38 (plan.md:81) confirms: "The milestone-reviewer carries spec §10's reviewer rule ... M06's outline puts it there and M09's outline updates only `agents/reviewer.md`; until M09 defines the field, no task has the line." So `milestone-reviewer.md` already has this exact sentence at line 51: "For a task with a `- Batch: yes` line, also check file by file that every file in its Files has its edit. A listed file with no change is a blocking finding." — placed directly after its numbered Check list (lines 43-49) and before the re-review paragraph (line 53).

`reviewer.md`'s equivalent placement is directly after its own Check bullet list (after line 32, before the closing of the "## Check" section at line 33 which is blank, then "## Report" at line 36). The wording should mirror milestone-reviewer.md's phrasing but adapted to reviewer's per-task, non-blocking vocabulary (reviewer.md has no "blocking"/"advisory" distinction — its outcome is `VERDICT: PASS | FAIL`, per its Report block at lines 38-43: `VERDICT: PASS | FAIL` / `REASONS: <for FAIL, up to three specific failures...>`). Spec line 211 says "A listed file with no change is a failure" (not "blocking finding" — reviewer.md's vocabulary is PASS/FAIL, matching "failure" already).

reviewer.md has no `Batch` mention anywhere currently (confirmed by the full-file read above — only 44 lines total).

## Outline bullet 4: `README.md` — "What a plan contains", batching bullet

File: `plugins/orchestratinator/README.md`, section "What a plan contains" at lines 80-88. Current bullets in order: Questions answered first (82), Tasks that are prompts (83), Interfaces (84), Coverage (85), Review Focus (86), Fails first (87), Sequence and parallelism (88). No batching bullet exists yet.

Spec line 272 (Files changed table, README.md row): "Cast table (two new agents), how a run behaves (milestone review), what a plan contains (Interfaces, Coverage, Review Focus, Fails first, **batching**)" — confirms batching belongs in "What a plan contains", consistent with the milestone outline.

D33 (plan.md:76) states the general ordering rule already used for Review Focus/Fails first: "the README bullet goes between Coverage and Fails first, in §14's order." Spec's Files-changed README row lists items in order: Interfaces, Coverage, Review Focus, Fails first, batching — so batching's README bullet goes **after** the existing Fails first bullet (line 87) and before Sequence and parallelism (line 88), per that same ordering convention (each new bullet added at the position matching §14's list order; batching is listed last, after Fails first).

Existing bullet style to match (e.g. line 87 opening): "**Fails first.** Every task that adds or changes tests is marked `Fails first: yes`: ..." — new bullet should open "**Batching.**" and state the §10 rule and the reviewer check, in the same declarative, spec-citing style as the others (no explicit path:line citations used in this file's prose bullets — they cite behavior, not code).

## Cross-file consistency notes

- `Batch: yes` is a task-level field, like `Fails first` and `Origin`, both format-agnostic in the sense that Batch is not listed under D13/spec §13 compatibility as a format-2-only field — spec §10 doesn't gate Batch behind format 2, unlike Interfaces/Fails first/Review Focus. Confirm: spec line 255 lists "the new checklist items (Interfaces, Coverage, Fails first, Review Focus, **Batch**)" as applying "only to format 2 milestones" — so the *validation checklist item* for Batch is format-2-only (per the milestone outline's own instruction: "Add a *(format 2)* checklist item"), but the field itself (`- Batch: yes`) is not stated to be restricted to format 2 milestones in the Task fields table description (unlike `Fails first`, whose table row (plan-format.md:213) explicitly says "Format 2 milestones only" and "A task in a format 1 milestone has no Fails first field and is handled as `no`"). No such format-1 fallback sentence exists in spec §10 for Batch — this is a candidate ambiguity/gap the planner may need to resolve (whether a format 1 milestone's task can use `- Batch: yes` at all, since format 1 predates this milestone).

## Unconfirmed

- Whether `- Batch: yes`'s Task fields table row should be marked "Format 2 milestones only" like Fails first, or left available to format 1 tasks too — spec §10 and plan.md's Decisions (D02, D08) don't say. Checked: `docs/orchestratinator-robustness-spec.md` §10 and §13, plan.md Decisions D01-D46, `reference/plan-format.md`'s existing Fails first/Interfaces rows for the contrasting pattern.
- Exact final wording planner will choose for the new Sizing rules text and the README "Batching" bullet — not determined by any source verbatim; only the facts each must contain are confirmed above.

## Conflicts

None found. D38 and M06's existing `milestone-reviewer.md` line 51 are consistent with spec §10's Reviewers paragraph and with this milestone's outline bullet 3 (which explicitly scopes M09's reviewer.md change to not duplicate M06's already-done milestone-reviewer.md change).
