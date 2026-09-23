# M02 survey: Change 1 — Interfaces per task (spec §3)

## Outline bullet 1: `reference/plan-format.md`

File: `plugins/orchestratinator/reference/plan-format.md` (238 lines).

- **Task template** — milestone-file template is a fenced ```markdown block at lines 87-140. "Read first" section is at lines 127-131:
  ```
  **Read first**

  - `docs/spec.md` §4.2 (the requirement this task implements)
  - `path/to/ExistingPattern.java` (pattern to copy)
  ```
  followed directly by `**Steps**` at line 132. The Interfaces block must be inserted between "Read first" and "Steps" (spec §3: "New required block in every `change` task, after Read first"). Insert the spec's four-line example verbatim (spec lines 30-37) as a new `**Interfaces**` fenced section between line 131 and line 132.

- **Task fields table** — lines 148-163, one Markdown table row per field, e.g. line 158: `| Verify | A command, ... |`. Add a new `| Interfaces | ... |` row. Its content must state spec §3 rules 1-5 (lines 39-45 of the spec) and D11 (plan.md line 52: "A Consumes entry for a symbol produced by a format 1 task ... cites it as `existing` with a `path:line`"). Natural placement: after the `Read first` row (line 161) and before `Steps` (line 162), mirroring the template's Read-first-then-Interfaces-then-Steps order — but the table's row order isn't semantically required to match the template's block order, so exact placement is a task-detailing decision.

- **Validation checklist** — lines 220-236, a flat list of `- [ ]` items ending at line 236 (`Every investigate task's Files is exactly its own note...`), then line 237: `Items marked *(format 2)* apply only to format 2 milestones...`. No item currently carries the `*(format 2)*` tag anywhere in the file (confirmed: no other occurrence of `*(format 2)*` in the file besides line 237's definition sentence). M02 is the first milestone to add tagged items. New items for §3 rules 1-5 must each end with `*(format 2)*` per that governing sentence, and should be added near the existing per-task-field checklist items (line 230: `Every task has Kind, Tier, Status, Wave, Depends on, Files, Verify, Commit, Objective, Read first, Steps, and Done when, with valid values.` — this line does not yet mention Interfaces).

- **Format detection anchor** — `### Format` subsection at lines 142-144 defines what `*(format 2)*` means and where `- Format: 2` goes (directly after Status). No changes needed here; it already exists (added in M01). Reader list at top of file: file's own header/intro (lines 1-10) lists readers as `plan`, `run`, `planner`, workers, `reviewer` — no `milestone-reviewer` / `plan-reviewer` yet (those are D24, out of scope for M02, belongs to M06/M07).

## Outline bullet 2: worker agents (`worker-light.md`, `worker.md`, `worker-heavy.md`, `specialist.md`)

All four files are structurally identical (worker-heavy/specialist/worker/worker-light differ only in frontmatter model/effort/maxTurns and specialist's extra bullet). Each has a `## Rules` section as an unordered list.

- `plugins/orchestratinator/agents/worker.md:34-46` — Rules list, 12 bullets. Relevant existing bullets:
  - Line 42: `- If the Steps, Decisions, and sources leave a choice open (a name, a type, a signature, a behavior, an error case), don't choose. Stop and report `BLOCKED` / `GAP` with the specific question.`
  - Line 43: `- Never delete, skip, or weaken a test to get a pass.`
- `plugins/orchestratinator/agents/worker-light.md:33-45` — identical Rules list (same line offsets, file is 2 lines shorter overall due to `effort` line absence in frontmatter).
- `plugins/orchestratinator/agents/worker-heavy.md:34-46` — identical Rules list, same content/line numbers as worker.md.
- `plugins/orchestratinator/agents/specialist.md:34-47` — identical Rules list plus one extra bullet at line 47: `- You may use judgment on implementation details that stay inside the task's Files... Anything visible outside those files... is a `GAP`...`

New bullet per spec §3 "Workers" paragraph (line 47 of spec): "Implement every Produces entry exactly as written. Never change the signature of anything consumed. If the code disagrees with a Consumes entry, stop with `BLOCKED` / `GAP`." This must be added to the Rules list in all four files identically (same wording each place, since the milestone's Outline explicitly says "add a Rules bullet from the §3 'Workers' paragraph" for all four). No existing bullet already covers Produces/Consumes — the closest is line 42 (choice left open) which is about missing specs, not interface mismatches.

Report format block (`## Report`, e.g. `worker.md:48-58`) is unchanged by M02 — the combined report format with `RED:` line belongs to §12/M04, not M02.

## Outline bullet 3: `skills/plan/SKILL.md` step 8 and `agents/planner.md` "Self-check"

- `plugins/orchestratinator/skills/plan/SKILL.md` — steps are `##`-level headings numbered 1-10. Step 8 is `## 8. Self-check` at line 114:
  ```
  ## 8. Self-check

  For every task, apply this test: *could a Sonnet agent that has read only CLAUDE.md / AGENTS.md, plan.md's Decisions, the milestone's Context, and this task with its Read first list, complete it without asking anything and without making a single choice?* If not, split the task or add the missing specifics.

  For every outlined milestone, check that its Goal, Context, and Outline give the planner enough to detail it later without asking what the user meant.

  Then run the validation checklist from the plan format and fix every failure.
  ```
  (lines 114-120). Spec §3 says: "`plan` and `planner`. In the self-check, add an interface-consistency pass across all tasks of every milestone being detailed, and against the Produces of `done` milestones when detailing later ones." New paragraph must be added inside step 8, before "Then run the validation checklist..." (line 120).

  Note: D19 (plan.md line 60) says the *new Coverage step* (M03, spec §4) is inserted directly after Self-check, which will renumber steps 9 (Size check, line 122) and 10 (Write and hand off, line 148), and require updating every step-number cross-reference in the file. **That renumbering is out of scope for M02** — M02 only edits the content of step 8 itself, not its number or the numbers after it (M03 does the renumbering). Confirmed no other line in SKILL.md currently cross-references "step 8" by number (checked file for "step 8" / "Step 8" occurrences — none besides the heading itself).

- `plugins/orchestratinator/agents/planner.md` — `## Self-check` section at lines 55-57:
  ```
  ## Self-check

  For every task: *could a Sonnet agent that has read only CLAUDE.md / AGENTS.md, plan.md's Decisions, this milestone's Context, and this task with its Read first list, complete it without asking anything and without making a single choice?* If not, split it or add the specifics. Then run the validation checklist for this milestone and fix every failure.
  ```
  This is a single paragraph (no sub-bullets), unlike SKILL.md's multi-paragraph step 8. The new interface-consistency-pass sentence must be inserted before "Then run the validation checklist..." within this paragraph (or as a new sentence/paragraph — task-detailing decision).

  Planner's "Before anything else" step 6 (line 20) already says: "The `done` milestones this one depends on: their Goals, Context, and task titles, and every `notes/` file their investigate tasks wrote." — it does **not** currently instruct the planner to read `done` milestones' Produces/Interfaces blocks (only "task titles"). Spec §3 requires checking "against the Produces of `done` milestones when detailing later ones" — this may need the planner to actually read task Interfaces blocks of done milestones, which is not covered by the current step 6 wording. Flagging as a potential gap for the detailer.

## Outline bullet 4: `agents/reviewer.md` "Check"

`plugins/orchestratinator/agents/reviewer.md:24-33` — `## Check` section, 4 bullets (lines 28-31):
```
- The Objective is met, and every Step was done as written.
- Every Done-when criterion holds.
- Nothing contradicts Decisions, the milestone's Context, or CLAUDE.md / AGENTS.md.
- For an `investigate` task: the note answers every question the Steps ask, backs its facts with `path:line` references, and marks what it couldn't confirm. Spot-check at least two references.
```
No existing bullet checks Produces. Spec §3: "The per-task `reviewer` ... check[s] that the code matches Produces." Milestone's Outline bullet 4 text: "the code matches every Produces entry of the task. A task without an Interfaces block (format 1) skips this check." New bullet must be added to this list, gated on format (format 1 tasks — those without an Interfaces block — skip it). The reviewer agent has no existing format-1/format-2 branching logic anywhere in the file; this will be the first such conditional check.

Reviewer's "Before anything else" reads the task block "in full" (line 18: "your task block in the milestone file, in full") which would already include any Interfaces block, so no change needed there — only the `## Check` list needs the new bullet.

## Outline bullet 5: `README.md` "What a plan contains"

`plugins/orchestratinator/README.md:78-82` — `### What a plan contains` section, 3 bullets:
- Line 80: `- **Questions answered first.** ...`
- Line 81: `- **Tasks that are prompts.** ...` (mentions Objective, Read first, Steps, Done-when — no Interfaces)
- Line 82: `- **Sequence and parallelism.** ...`

New `- **Interfaces...**` bullet needed here per Outline. This section is also where later milestones (M03 Coverage, M04 Fails first) will add their own bullets — bullet ordering among them is a detailing decision, not fixed by any source read.

Also checked `### Opus reasons, cheaper models read` (README.md:74-76) and the cast table (README.md:57-72) — neither mentions Interfaces and neither is named in the Outline, so out of scope for M02 (cast-table changes belong to M06/M07 per spec §14).

## Cross-cutting notes

- No file in the repo currently contains the literal string `Interfaces` (checked plan-format.md, all four worker agents, planner.md, reviewer.md, SKILL.md, README.md — zero matches), confirming this is wholly new vocabulary introduced by M02.
- Plan.md D11 (line 52) is the only Decision that specifically targets Interfaces wording; it must be reflected in the new Task-fields table row in `reference/plan-format.md` (Outline bullet 1).
- Spec §12 (combined worker report format, `RED:` line) explicitly says "After change 3" (Fails first, M04) — the M02 worker-agent edits must NOT touch the `## Report` block in any of the four worker files; only `## Rules`.
- Validate-All.ps1 (the milestone's own Verify/Milestone-verify command) was not read in this survey (out of scope — Outline bullets are all Markdown-file edits with no code changes); confirmed via `plans/orchestratinator-robustness/M02-interfaces.md:6` that Milestone verify is exactly `pwsh -NoProfile -File ./scripts/Validate-All.ps1`, i.e. it validates frontmatter/marketplace structure, not the prose content of these edits — grep-based Done-when checks (per M02's Context "Steps should give the exact anchor line and literal text to insert... Verify commands are `grep -qF` checks") will be the actual per-task verification mechanism.

## Unconfirmed

- Whether the planner's "Before anything else" reading list (planner.md step 6, line 20) needs an explicit edit to read done milestones' Interfaces/Produces blocks, or whether "task titles" is deemed sufficient context for the self-check's interface-consistency pass — this is a design/detailing decision, not resolved by the spec text or existing Decisions.
- Exact wording/placement order of the new Task-fields table row (before or after existing rows) — spec doesn't dictate table row order beyond template block order.

## Conflicts

None found.
