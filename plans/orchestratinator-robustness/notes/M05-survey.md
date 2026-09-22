# M05 survey: Change 4, Review Focus (spec §6)

Governing spec text: `docs/orchestratinator-robustness-spec.md:97-111` ("## 6. Change 4: Review Focus").

- `docs/orchestratinator-robustness-spec.md:101`: "Every detailed milestone gains a `## Review Focus` section: up to five inputs or failure modes the sources imply but no task's tests exercise, most likely first."
- `docs/orchestratinator-robustness-spec.md:103-105`: each line gives the input/condition, the expected behavior with its source (spec section or Decision), and the test that pins it plus the task that owns that test; "That task's Steps include writing the test."
- `docs/orchestratinator-robustness-spec.md:107`: "If nothing qualifies, the section says `None found:` plus what was checked. An empty section is never just blank."
- `docs/orchestratinator-robustness-spec.md:109`: "The expected behavior must come from the sources or Decisions. If it doesn't, it's a design decision: an ambiguity question for the user in `plan`, or a GAP in `planner`."
- `docs/orchestratinator-robustness-spec.md:111`: Acceptance — "section in the milestone template, built by `plan` and `planner`, with the sourcing rule and the question/GAP rule stated."
- `docs/orchestratinator-robustness-spec.md:264-267` (reader table) lists exactly the three files named in the Outline as needing this change: `reference/plan-format.md` (§3,4,5,6,9,10,11,13), `skills/plan/SKILL.md` (§6), `agents/planner.md` (§6). The README is not in that table but the Outline still requires a README bullet (consistent with D15: "each also making its own README changes from spec §14").

Decisions in scope: D01 (every reader in the same commit), D08 (placement + line format, quoted below), D16 (this plan's own files are format 1, not touched), D17 (never touch Change 0 text).

D08 exact placement/format text relevant to M05 (`plans/orchestratinator-robustness/plan.md:39-44`):
- "Milestone file: `- Format: 2` directly after `- Status:`. `## Coverage` and `## Review Focus`, in that order, after Context (and its Waves line) and before Outline or Tasks."
- "Review Focus line: ``- <input or condition> → <expected behavior> (source: <§ or D<nn>>). Test: `<test name>` in <task ID>.``"

## Outline bullet 1: `reference/plan-format.md`

File: `plugins/orchestratinator/reference/plan-format.md` (282 lines).

**Milestone template** (the fenced markdown block): currently has, in order —
- `## Coverage` at lines 111-115 (comment placeholder + example row)
- `## Outline` at lines 117-121
- `## Tasks` at line 122 onward

Per D08 the new `## Review Focus` section goes between the existing `## Coverage` block (ends line 115) and `## Outline` (starts line 117). No line in the template currently mentions Review Focus.

**`### Coverage` prose subsection** at lines 166-177 is the closest existing model to imitate: it states where each level lives, defines what counts as a requirement, gives the row format, and states who builds it (`plan` builds both levels; the planner builds the milestone level). A parallel `### Review Focus` subsection does not yet exist and needs:
- The up-to-five-items-most-likely-first rule (spec §6 line 101).
- The D08 line format, verbatim: ``- <input or condition> → <expected behavior> (source: <§ or D<nn>>). Test: `<test name>` in <task ID>.``
- That the owning task's Steps include writing the test (spec §6 line 105) — this constrains the **Steps** field of whatever task is cited, described in the Task fields table at line 197 (`Steps | Numbered. Each step is one concrete action. At most about seven steps.`) — no field-table edit is dictated by the Outline, but the new subsection's prose should state the Steps-inclusion rule explicitly since Steps' own row doesn't mention it.
- The `None found:` fallback (spec §6 line 107): "the section says `None found:` plus what was checked. An empty section is never just blank" — the outline calls this "never blank."
- The sourcing rule stated at spec §6 line 109 (unsourced expected behavior = design decision → ambiguity question in `plan` / GAP in `planner`).

**Format 2 checklist bullet**: Outline explicitly asks for "a *(format 2)* checklist item: every detailed milestone has a non-empty Review Focus section." The existing `## Validation checklist` at lines 255-281 is the anchor; Coverage's own checklist items are the closest pattern:
- `plugins/orchestratinator/reference/plan-format.md:276`: `- [ ] A detailed milestone has a \`## Coverage\` section, directly after Context, with one row per requirement it implements and no unmapped row. *(format 2)*`
- `plugins/orchestratinator/reference/plan-format.md:277`: `- [ ] Every task ID in a Coverage row exists. *(format 2)*`

No existing checklist item mentions Review Focus, sourcing, item count, or the `None found:` fallback — all net-new.

**Format section** at line 164 (`### Format`) states what a format-2 marker (`- Format: 2`) means and that "Validation applies the checklist items marked *(format 2)* only to format 2 milestones" — the new checklist item(s) should carry that same tag, matching the pattern of every other format-2-only line (12 existing occurrences of `*(format 2)*` in the file, all in Task-fields rows or checklist items).

Directory/reader-list header at lines 1-10 ("A plan is a directory. It is the contract between...") lists `plan`, `run`, `planner`, `workers and reviewer` — this list is not touched by M05 per D24 (only M06/M07 add `milestone-reviewer`/`plan-reviewer` to it).

## Outline bullet 2: `skills/plan/SKILL.md`

File: `plugins/orchestratinator/skills/plan/SKILL.md` (174 lines). Numbered steps currently:

1. Re-read the ground truth — line 21
2. Capture the sources — line 43
3. Find the structure — line 52
4. Choose detailing and gates — line 61
5. Find every problem and ask about it — line 69
6. Write the tasks as prompts — line 93
7. Sequence the tasks and find the parallelism — line 104
8. Self-check — line 114
9. Check spec coverage — line 124
10. Size check: do small jobs directly — line 135
11. Write and hand off — line 162

Step 5 (`## 5. Find every problem and ask about it`, lines 69-91) already defines the three question categories (Insufficient information / Ambiguity / Contradiction) and the numbering/format for user-facing questions (lines 79-84). The Outline's line "An unsourced expected behavior is an ambiguity question in step 5" means: wherever SKILL.md is edited to build Review Focus, an item whose expected behavior has no source is routed into this existing step-5 machinery (ask before writing the plan, one message, grouped/numbered under the three headings) rather than creating a new question category.

Step 9 (`## 9. Check spec coverage`, lines 124-134) is the closest structural analog: it is the step that currently builds the milestone-level Coverage section, states the row format, and says "A requirement with no task or milestone gets one added... If a requirement seems deliberately out of scope, that is a question for the user, asked as in step 5" (line 131) — i.e. it already has a precedent of "build a milestone-level section, and route unsourced/unmappable items back to step 5." No existing step currently builds Review Focus; a new step (or an addition to step 9 or a new step 9a) is where the Outline's instruction ("when detailing a milestone, build its Review Focus") would land — the Outline does not say which, so this is unresolved by the milestone text itself.

Step 11 (`## 11. Write and hand off`, lines 162-173) is where the final plan-directory write happens today; line 164 already says "Every milestone file, detailed or outlined, gets the line `- Format: 2`... plan.md gets the Coverage section from step 9... and every detailed milestone file gets its own Coverage section." No mention of Review Focus yet — this line would need updating if the new Review Focus content is written at this stage too (D01: "every reader... in the same commit").

Step-numbering precedent from D19 (`plans/orchestratinator-robustness/plan.md:60`): "the new Coverage step in the `plan` skill comes directly after the Self-check step, so the size check and write-and-hand-off steps are renumbered, and every step-number reference inside `skills/plan/SKILL.md` is updated to match" — this is exactly what happened for M03 (Coverage becoming step 9, pushing size-check to 10 and write-and-hand-off to 11). The current numbering (1-11) already reflects that renumbering. Any similarly-placed new step for M05 would trigger the same renumbering obligation, and every cross-reference to a step number elsewhere in the file must be checked. Existing internal step-number references found: line 131 ("asked for in step 5"), line 133 ("Step 11 writes both levels"), line 144 ("The size check never skips... (step 9)" — twice, lines 143-144), line 151 ("skip the rest of this step and write the plan (step 11)"). Any renumbering must update all of these.

Step 10 (Size check, lines 135-160) item 4 (line 144): "Every requirement maps to a drafted task (step 9). The size check never skips the coverage check, but a job done directly writes no Coverage anywhere." D18 (plan.md:59) states the parallel rule for Review Focus is not explicit, but by analogy a size-check job likely also "writes no Review Focus anywhere" — this is not stated anywhere in Context or Decisions and is Unconfirmed/a gap in the sources.

## Outline bullet 3: `agents/planner.md`

File: `plugins/orchestratinator/agents/planner.md` (83 lines). Section order:

- Before anything else — line 11 (7 numbered reading items)
- Find every problem — line 25 (defines Insufficient/Ambiguous/Contradictory categories and the GAP-writing format, lines 35-41)
- Write the tasks as prompts — line 43
- Sequence and find the parallelism — line 51
- Build the Coverage — line 55
- Self-check — line 61
- Write — line 65
- Report — line 71

"Build the Coverage" (lines 55-59) is the direct structural analog for where "Build the Review Focus" would go: it handles format-1-vs-format-2 provenance (line 57), builds the milestone's own section "from the plan-level rows that point at this milestone" (line 59), and explicitly routes unmappable rows to GAP: "A row you can't map to this milestone's tasks is a GAP: report `BLOCKED` / `GAP` and write the question to Open questions, as in 'Find every problem'" (line 59). Building Review Focus with an unsourced expected behavior would need the equivalent routing to "Find every problem" (lines 25-41), per the Outline's instruction.

"Find every problem" (lines 25-41) is the section the Outline says an unsourced expected behavior becomes a GAP against; the exact GAP-writing template is at lines 37-41:
```
- (M03) [insufficient | ambiguous | contradiction] <question>
  Where: <passage locations; for a contradiction, quote both sides>
  Options: <the readings or choices you see>; recommended: <one, with a one-line reason, or "none">
```

"Write" (lines 65-69) states exactly which files the planner may edit: "Edit only two files: this milestone's file (replace the Outline section with Tasks, add its `## Coverage` section, update Context if needed, set Status to `ready`...) and plan.md (Decisions, Open questions, Coverage, and this milestone's table row set to `ready`)." Line 65-69 does not mention Review Focus — must be added ("add its `## Coverage` section" → needs "and `## Review Focus` section" or similar) for the milestone-file edit to be complete and consistent, per D01.

"Self-check" (lines 61-63) runs "the validation checklist for this milestone" at the end — this already picks up whatever checklist items M05 adds to `reference/plan-format.md`, with no planner.md wording change needed for that part specifically (the checklist is referenced generically, not enumerated).

"Report" block (lines 73-82) has fixed fields `STATUS`, `REASON`, `TASKS`, `WAVES`, `NOTE`, `QUESTIONS` — no field currently reports Review Focus item counts; the Outline does not ask for one, so no change indicated here. (Compare: `TASKS` and `WAVES` report counts for their respective concerns, but Coverage — already added by M03 — also has no dedicated report field, so the precedent is that Review Focus likely needs none either.)

## Outline bullet 4: `README.md` "What a plan contains"

File: `plugins/orchestratinator/README.md`. The "What a plan contains" section is at lines 78-86, a bullet list:
- **Questions answered first.** (line 80)
- **Tasks that are prompts.** (line 81)
- **Interfaces.** (line 82)
- **Coverage.** (line 83)
- **Fails first.** (line 84)
- **Sequence and parallelism.** (line 85)

Format of each bullet: bold short label, then 1-4 sentences summarizing the mechanism and its payoff, matching the tone/length of the spec's Acceptance text rather than quoting the format file verbatim. The Fails first bullet (line 84) is the most recently added one (from M04) and is a good length/tone model: "Every task that adds or changes tests is marked `Fails first: yes`... A worker that reports done without confirming the failure gets a retry. Tasks with no test that can fail beforehand... are `Fails first: no`, with a one-line reason."

No existing bullet mentions Review Focus. The Outline does not specify exact wording or position among the six bullets (only "add a Review Focus bullet").

The cast table (`plugins/orchestratinator/README.md:59-72`) and the "Opus reasons, cheaper models read" section are not named in the Outline and are not touched by M05 (D24 assigns `milestone-reviewer`/`plan-reviewer` additions to M06/M07, not M05).

## Cross-cutting facts

- `scripts/Validate-All.ps1` has zero references to "orchestratinator", "Coverage", or "Review Focus" (confirmed by grep — no matches). Per `CLAUDE.md`, it validates only `claude plugin validate .`, each `plugins/*/` directory (manifests/frontmatter), and `Sync-Shared.ps1 -Check`; it does not semantically validate plan-format content. This means "Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`" (the milestone's own verify command, M05-review-focus.md:6) only checks that frontmatter/manifests still parse — it cannot itself confirm the Review Focus prose was added correctly. Tasks' own Verify commands (per the milestone Context's stated convention: `grep -qF` checks with no backticks inside the command, M05-review-focus.md:15) are what will confirm literal text insertion.
- The four files named in the Outline are exactly the reader set spec's table lists for §6 (`docs/orchestratinator-robustness-spec.md:264-267`), plus README (required by D15's "each also making its own README changes from spec §14," consistent with M02/M03/M04 each having added a README bullet: Interfaces, Coverage, Fails first respectively).
- No occurrences of the string "Review Focus" exist anywhere yet in `plugins/orchestratinator/` (confirmed by reading all four target files in full — none contain it).

## Unconfirmed

- Exact step number/placement within `skills/plan/SKILL.md` for building Review Focus (new step vs. extending step 9) — the Outline text doesn't specify, and no Decision addresses it.
- Whether the size-check path (SKILL.md step 10, "do small jobs directly") writes "no Review Focus anywhere," by analogy to D18's rule for Coverage — not stated in Context, Decisions, or the milestone Outline.
- Exact wording/position of the new README bullet among the existing six — Outline only says "add a Review Focus bullet."
- Whether `agents/planner.md`'s Report block needs a new field for Review Focus — no Decision or spec line addresses it; Coverage (M03) added none, suggesting precedent for none, but this is inference, not a confirmed rule.

## Conflicts

None found.
