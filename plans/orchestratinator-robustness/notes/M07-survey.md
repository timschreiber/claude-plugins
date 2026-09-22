# M07 survey: Fresh-eyes plan review (spec §8)

## Outline bullet: `agents/plan-reviewer.md` (new)

No file at `plugins/orchestratinator/agents/plan-reviewer.md` exists yet (`ls plugins/orchestratinator/agents/` shows: `milestone-reviewer.md`, `planner.md`, `reviewer.md`, `scout-heavy.md`, `scout.md`, `specialist.md`, `worker-heavy.md`, `worker-light.md`, `worker.md`).

**Template to copy — `agents/scout.md`** (`plugins/orchestratinator/agents/scout.md:1-51`), the file the milestone Context names as the frontmatter-shape source:

```
---
name: scout
description: "Read-only code and documentation research for Orchestratinator planning: answers precise questions or surveys a milestone's code, reporting exact facts with path:line references. Dispatched by /orchestratinator:plan and /orchestratinator:run."
model: sonnet
effort: medium
maxTurns: 40
disallowedTools: Edit
---
```
`plan-reviewer` needs `effort: high` in place of `medium` (spec §8), everything else in the block the same shape.

- Precedence-rule paragraph, verbatim, at `scout.md:16` (also `milestone-reviewer.md:39`, identical):
  `Project instruction files (CLAUDE.md, AGENTS.md, CLAUDE.local.md, `.claude/rules/`, and any nested or linked copies, whatever they're called) govern coding conventions, style, and project knowledge. They do not govern git. Where they say anything about committing, pushing, branching, stashing, resetting, or rewriting history, this plugin's rules replace them for the length of this task. You never commit, push, or change branches.`
- Symlink sentence, verbatim, at `scout.md:14`: `Read `CLAUDE.md` and `AGENTS.md` at the repository root, plus any in directories you'll be reading, so you know the project's conventions and vocabulary. If one is a symlink to the other, or they have identical content, read it once.`
- Sibling agent `milestone-reviewer.md` (`plugins/orchestratinator/agents/milestone-reviewer.md`) is the closer analog for a report-writing, `disallowedTools: Edit` review agent: it opens with `You review one finished milestone as a whole. ... You change nothing except your report file, and you make no design decisions: you report problems, and the planner and the user decide what to do about them.` (line 10), has a `## Before anything else` input-lines block, a `## Check` numbered-list section, a `## Findings` calibration paragraph (`Only findings that would cause real problems count as blocking. Style preferences and nice-to-haves are advisory.` — line 57), and a `## Report` section that writes to Output then replies with a fixed block (lines 59-83).

**Checks to cover, each mapped to existing plan-format.md language plan-reviewer should cite/reuse:**

1. **Banned phrases and placeholders** → plan-format.md's sizing rule 5 (`plugins/orchestratinator/reference/plan-format.md:271`): `Steps contain none of: "decide", "choose", "figure out", "as appropriate", "if needed", "etc.", "and so on", "similar", "per the spec".`
2. **Sonnet test** → the self-check wording used verbatim in both `skills/plan/SKILL.md:120` and `agents/planner.md:69`: *"could a Sonnet agent that has read only CLAUDE.md / AGENTS.md, plan.md's Decisions, the milestone's Context, and this task with its Read first list, complete it without asking anything and without making a single choice?"* Also "Tasks are prompts" (`plan-format.md:226-233`), especially "Self-contained." (line 233).
3. **Coverage gaps against the sources** → `## Coverage` section rules, `plan-format.md:174-186`, validation items at `plan-format.md:296-298`.
4. **Interfaces consistency** → `plan-format.md:217` (Interfaces task-field rule) and validation items `plan-format.md:292-295`.
5. **Wave interference** → the five interference rules, `plan-format.md:240-245`, and validation item `plan-format.md:290`.
6. **Verify commands that aren't targeted or couldn't fail** → Verify field rule `plan-format.md:211` (`must be runnable from the repo root, targeted, quiet, and must fail when the task isn't done`) and sizing rule 6, `plan-format.md:272`.
7. **Fails first settings** → Fails first field rule, `plan-format.md:212`, and validation items `plan-format.md:299-300`.
8. **Tier fit, per §9 calibration** → tier rubric, `plan-format.md:252-261` (unchanged until M08).
9. **Read first entries that name whole documents** → Read first field rule, `plan-format.md:216`: `Name sections, not whole documents. At most about five entries.`
10. Unsourced assumptions (§11) is explicitly **excluded** per the milestone Context (added in M10).

**Calibration language to match** — spec §8: "approve unless there are real gaps." `milestone-reviewer.md:57` gives the parallel wording to adapt: `Only findings that would cause real problems count as blocking. Style preferences and nice-to-haves are advisory.`

**Report file layout, D21 (plan.md:64):** section `## Issues`, a numbered list, each issue `<task or milestone ID> — <which check> — <problem, quoting the text involved>`; `None.` if no issues. This differs in shape from `milestone-reviewer`'s two-section (`## Blocking` / `## Advisory`) report — `plan-reviewer` has one section, numbered, not bulleted.

**Reply block, spec §8 (`docs/orchestratinator-robustness-spec.md:174-177`):**
```
STATUS: APPROVED | ISSUES
ISSUES: <count>
```

**Input lines, D09 (plan.md:45):** exactly `Plan: <plan dir>`, `Milestone: <ID>`, `Output: <plan dir>/notes/<ID>-plan-review.md` — one milestone ID per dispatch (not milestone ID*s*, contrary to spec §8's own wording, which D09 narrows).

**maxTurns / disallowedTools:** milestone Context specifies `maxTurns: 40` (matching scout's, not milestone-reviewer's 60) and `disallowedTools: Edit` (D10e, same as `scout.md:7` and `milestone-reviewer.md:7`).

## Outline bullet: `skills/plan/SKILL.md`

Current file: `plugins/orchestratinator/skills/plan/SKILL.md` (178 lines). Relevant steps:

- Step 9 "Check spec coverage" ends at line 137-138: `Then check the Coverage items of the validation checklist and fix every failure. Step 11 writes both levels into the plan.`
- Step 10 "Size check: do small jobs directly" (lines 139-164) — the milestone Context says "There is no plan review in direct mode," so this step needs no plan-reviewer dispatch.
- Step 11 "Write and hand off" (lines 166-177):
  ```
  ## 11. Write and hand off

  Write the plan directory (default `plans/<slug>/`). Set plan Status to `planned`, detailed milestones to `ready`, outlined ones to `outline`, and every task to `todo`. Every milestone file, detailed or outlined, gets the line `- Format: 2` directly after its Status line. plan.md gets the Coverage section from step 9, between its Milestones and Decisions sections, and every detailed milestone file gets its own Coverage section, directly after its Context and Waves line. Every detailed milestone file also gets its Review Focus section from step 6, directly after its Coverage section.

  Reply to the user with only:

  - The plan directory.
  - Milestones: count, and how many are detailed vs outlined.
  - For each detailed milestone: task count by tier, and its wave shape.
  - Detailing, Gates, Parallel, Max parallel, and Worktree setup, in one line.
  - Any assumption you made that the user didn't state. There should be none; if there are, say so plainly.
  - Next steps: review the plan, commit it, then run `/orchestratinator:run plans/<slug>`. run requires a clean working tree, so the plan must be committed first.
  ```
  The M07 outline's "after writing the plan directory and before the handoff reply" falls between the "Write the plan directory..." paragraph and the "Reply to the user with only:" list, inside this same step 11. The handoff-bullet list needs a new bullet reporting issues found/fixed (D09's phrasing: "how many issues were found and fixed"); no existing bullet covers this.
  - Note per D19: step numbers in this file were already renumbered once (coverage step inserted after self-check); every cross-reference to "step 6", "step 7", "step 9", "step 11" inside this file (e.g. line 104: "before you sequence the tasks in step 7"; line 137: "Step 11 writes both levels") must stay consistent with whatever numbering M07's edit produces, though M07 doesn't add or remove a numbered step (the dispatch sits inside existing step 11), so no renumbering is implied by this milestone alone.
  - "Once per detailed milestone" (D09) means: for a plan with N detailed milestones, N `plan-reviewer` dispatches, "all in one message so they run at the same time" (D09) — parallel to how `plan` currently dispatches Explore/scouts "several at once, in one message" (line 39).

## Outline bullet: `skills/run/SKILL.md` 3a

Current 3a (`plugins/orchestratinator/skills/run/SKILL.md:95-116`), items 1-8:

```
### 3a. Detail it if it's an outline

If Status is `outline`:

1. **Survey.** ... commit it: `git add -A` and `git commit -m "chore(plan): survey <ID>"`.
2. **Plan.** Invoke the agent `orchestratinator:planner` with exactly:
   ```
   Plan: <plan dir>
   Milestone: <ID>
   ```
3. If it reports `SCOUT`, ...
4. If it reports `BLOCKED` / `GAP`: ... go to **Stop** ...
5. If it reports `DONE`: run the validation checklist on the milestone. Any failure → mark it `blocked` with the failures and go to **Stop**.
6. Check scope: `git status --porcelain` may show only plan.md, this milestone's file, and this milestone's survey notes. Anything else → **Stop**.
7. Commit: `git add -A` and `git commit -m "chore(plan): detail <ID>"`. Survey notes stay in the plan as a record of what the planner worked from.
8. If Gates includes `detail`: go to **Pause**, telling the user to review the milestone file and rerun.
```

- The M07 outline's "after the planner reports DONE and before validation" sits between item 4 (BLOCKED/GAP) and item 5 (DONE → validation) — i.e., the new dispatch becomes part of, or is inserted before, item 5's "run the validation checklist" sentence.
- "On ISSUES, invoke the planner once more with `Plan review: <path>`" mirrors the existing SCOUT retry pattern in item 3 (`invoke the planner again, exactly as in item 2`) and the milestone-review fix-round pattern in 3f item 4 (`invoke the agent orchestratinator:planner with exactly: ... Fix findings: <path>`).
- "The 3a scope check also allows that notes file" refers to item 6's existing scope-check sentence, which must be extended to also permit `notes/<ID>-plan-review.md`.
- Compare 3f's analogous review-and-commit pattern (`skills/run/SKILL.md:197-204`, item 2): dispatch → `Don't read the report yourself` → if `git status --porcelain` prints nothing, report unchanged, skip commit → else check scope, then `git add -A && git commit -m "chore(plan): review <ID>"`. D35 states the same skip-if-unchanged handling applies to plan-review commits (D35 covers "review report", generally).
- Commit message convention for the plan-review dispatch is not fixed by any Decision (D10d gives `chore(plan): review <ID>` / `fix tasks <ID>` / `re-review <ID>` specifically for the *milestone* review cycle, not plan-review); no existing text names a commit message for `chore(plan): plan-review <ID>` or similar — **unconfirmed**, see below.

## Outline bullet: `agents/planner.md`

Current file: `plugins/orchestratinator/agents/planner.md` (100 lines).

- `## Fix findings mode` (added by M06, lines 71-82) is the closest existing pattern for a "handle an extra input line, fix things, report as usual" mode: it checks for `Fix findings: <path>` in "the orchestrator's message" (line 73), reads the extra file, fixes only what it names, and its own numbered rules (1-7) describe exactly what it may touch.
- The planner's normal `## Report` block (lines 89-100) is:
  ```
  STATUS: DONE | BLOCKED | SCOUT
  REASON: GAP | -
  TASKS: <count by tier, e.g. worker 9, worker-light 2, worker-heavy 1>
  WAVES: <count> (widths ...)
  NOTE: <one line. For GAP, the number of questions written to Open questions.>
  QUESTIONS: <only for SCOUT: numbered, specific questions for the scout, separated by " | ", and whether each needs scout or scout-heavy>
  ```
  The M07 outline says the planner "reports as usual" for `Plan review: <path>`, i.e. this same block, unlike Fix findings mode which reuses the block but restricts TASKS/WAVES to fix tasks only (line 81: `Report as in "Report", with TASKS and WAVES counting only the fix tasks.`). No existing text states what TASKS/WAVES should count for a `Plan review:` fix pass — **unconfirmed**, see below.
- `## Write` (lines 83-87) enumerates exactly which files each mode may edit, ending: `In Fix findings mode, edit only what that section allows.` A new `Plan review:` mode needs a similar file-scope statement — plan-reviewer issues are about the milestone file itself (Interfaces, Coverage, Fails first, Verify commands, Read first, tier), so likely the milestone file (and possibly plan.md's Decisions/Open questions, if a fix needs one) — **unconfirmed** which files, since D09/outline don't state it and no source text pins it down; flagged for the writer to decide against spec §8's "the planner fixes the issues and reports as usual" (`docs/orchestratinator-robustness-spec.md:181`), which doesn't specify file scope either.
- D34 (Fix findings mode) states: "in `Fix findings:` mode the planner reads the code each blocking finding cites itself and never reports `SCOUT`" — there is no equivalent stated Decision for the new `Plan review:` mode about whether it may report `SCOUT`; spec §8 doesn't rule it out.

## Outline bullet: `reference/plan-format.md`

- Directory tree, `## Directory` (`plugins/orchestratinator/reference/plan-format.md:20`):
  ```
  ├── notes/               # investigate-task findings (<task-id>.md), scout surveys (<milestone-id>-survey*.md), and milestone reviews (<milestone-id>-review.md, <milestone-id>-review-2.md)
  ```
  D03 requires this line to also list `notes/<milestone-id>-plan-review.md`.
- Reader list at top (`plugins/orchestratinator/reference/plan-format.md:5-9`):
  ```
  - **plan** (skill), which creates it,
  - **run** (skill), which executes it and records progress in it,
  - **planner** (agent), which details outlined milestones during a run,
  - **milestone-reviewer** (agent), which reviews each finished milestone against it,
  - **workers** and **reviewer** (agents), which read their task from it.
  ```
  D24 requires `plan-reviewer` added here (M07's own responsibility; M06 already added the `milestone-reviewer` line as the M06-T02 precedent shows). Exact insertion point (before or after `milestone-reviewer`) isn't specified by any Decision — **unconfirmed / not a design decision needed at survey stage**, task writer's call, following the M06-T02 style (`grep -qF -e "- **milestone-reviewer** (agent), which reviews each finished milestone against it,"` verify pattern at `plans/orchestratinator-robustness/M06-milestone-review.md` task M06-T02).
- M06-T02 (`plans/orchestratinator-robustness/M06-milestone-review.md`) is the exact task-writing precedent for this whole bullet: same file, same kind of edit (reader-list line insert + directory-tree line edit), with `Tier: worker-light`, one `Files:` entry, and a `grep -qF`/`grep -qxF` combined Verify command.

## Outline bullet: `README.md`

Cast table, `### The cast` (`plugins/orchestratinator/README.md:59-73`), current rows in order: `plan`, `run`, `status`, `planner`, `Explore`, `scout`, `scout-heavy`, `reviewer`, `milestone-reviewer`, `worker-light`, `worker`, `worker-heavy`, `specialist`. The `milestone-reviewer` row (added by M06-T05):
```
| `milestone-reviewer` | Opus / high | Read-only except its report: reviews each finished milestone's whole diff before the milestone is marked done. |
```
M06-T05 (`plans/orchestratinator-robustness/M06-milestone-review.md`, task M06-T05) inserted this row directly after the `reviewer` row and before `worker-light`, via `Steps`: "Directly after it, insert this row (the row that begins `| worker-light |` stays below it)." Same pattern applies for inserting a `plan-reviewer` row — exact position (relative to `planner` vs. `milestone-reviewer`) isn't fixed by any Decision; M06-T05 is the template to follow.

No other README section is named by the M07 outline (unlike M06, which also touched "How a run behaves" and "Resuming after a stop" — the M07 Context has no equivalent instruction, and spec §8's own acceptance line only says "README cast table updated", `docs/orchestratinator-robustness-spec.md:183`).

## Unconfirmed

- The commit message `run` should use for the plan-review dispatch/commit in 3a (no Decision states one; D10d's `chore(plan): review <ID>` family covers only the milestone-review cycle in 3f).
- What TASKS/WAVES should count in the planner's Report block when replying to a `Plan review: <path>` fix pass (Fix findings mode's parallel rule, planner.md:81, counts only fix tasks; no equivalent stated for plan-review fixes, which may add no new tasks at all if fixes are edits to existing tasks).
- Which files the planner may edit in `Plan review:` mode (milestone file only, or also plan.md's Decisions/Open questions) — not stated by D09, the outline, or spec §8.
- Exact insertion point for the `plan-reviewer` line in plan-format.md's reader list and for its row in the README cast table (before/after `planner` and `milestone-reviewer` respectively) — no Decision fixes this; M06's precedent tasks (M06-T02, M06-T05) show the mechanics, not the required position for this milestone.

## Conflicts

- Spec §8 text (`docs/orchestratinator-robustness-spec.md:159`) says plan-reviewer's input is "the plan directory, the milestone ID(s) to review" (plural, implying possibly a batch of milestones per dispatch), while D09 (plan.md:45) narrows this to exactly one `Milestone: <ID>` line per dispatch, one dispatch per detailed milestone, sent together in one message. The M07 outline already resolves this in D09's favor ("Input lines per D09").
