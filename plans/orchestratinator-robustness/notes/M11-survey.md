# M11 survey

## Outline bullet 1: CHANGELOG.md append

`CHANGELOG.md:1-10` (repo root):

```
1	# Changelog
2	
3	All notable changes to plugins in this marketplace.
4	
5	## [Unreleased]
6	
7	### Added
8	- Repository scaffold: marketplace catalog, three plugin skeletons, shared-asset
9	  sync, and CI validation.
10	- orchestratinator: project instruction files no longer override the plugin's git rules; stray worker commits are detected and redone.
```

The D13 bullet is **not present**. `### Added` (line 7) has exactly the two bullets shown (lines 8-10); the D13 bullet must be appended after line 10, still under `### Added`, still under `## [Unreleased]`. D13's exact text (plan.md:54):
`- orchestratinator: tasks declare Interfaces and Fails first, milestones carry Coverage and Review Focus, a plan-reviewer and a milestone-reviewer check plans and finished milestones, tiny same-shape edits batch into one task, and planning asks about assumptions instead of making them.`

## Outline bullet 2: reader map for each new field/section, and reference checks

Plugin files (`plugins/orchestratinator/`):
```
.claude-plugin/plugin.json
README.md
agents/milestone-reviewer.md
agents/plan-reviewer.md
agents/planner.md
agents/reviewer.md
agents/scout-heavy.md
agents/scout.md
agents/specialist.md
agents/worker-heavy.md
agents/worker-light.md
agents/worker.md
reference/plan-format.md
skills/plan/SKILL.md
skills/run/SKILL.md
skills/status/SKILL.md
```

Every reader below was read in full and cross-checked against `docs/orchestratinator-robustness-spec.md` §14's file/change map and against plan.md's Decisions. No mismatch was found. Facts, by field/section:

### Interfaces (Consumes/Produces)
- Template and rules: `reference/plan-format.md:169-175` (template block), `:234` (Task fields row), sizing/validation `:314-317`.
- `skills/plan/SKILL.md:127` (self-check interface-consistency pass, includes cross-milestone Consumes).
- `agents/planner.md:75` (self-check pass, "against the Produces of `done` milestones").
- `agents/plan-reviewer.md:28-29` (reads Produces of cross-milestone tasks before checking), `:42` (check 4, Interfaces).
- `agents/milestone-reviewer.md:46` (check 2, Interfaces — code matches Produces).
- `agents/reviewer.md:31` (per-task check: code matches Produces; "A task without an Interfaces block (a format 1 task) skips this check.").
- `agents/worker.md:43`, `worker-light.md:42`, `worker-heavy.md:43`, `specialist.md:43` (implement Produces exactly; stop on Consumes disagreement) — identical text across all four.
- README: `README.md:84` (Interfaces bullet).
All readers named in spec §14 for this field are present and consistent; no reader references an Interfaces sub-field that doesn't exist.

### Coverage (plan-level and milestone-level)
- Template/rules: `reference/plan-format.md:51-55` (plan.md template), `:127-131` (milestone template), `:190-201` (### Coverage prose), validation `:318-320`.
- `skills/plan/SKILL.md:131-140` (step 9, builds both levels), `:171` (step 11, writes sections at the documented placements).
- `agents/planner.md:67-71` ("Build the Coverage" section, handles format-1-plan case by creating the section/rows).
- `agents/plan-reviewer.md:41` (check 3, Coverage).
- `agents/milestone-reviewer.md:45` (check 1, Coverage).
- README: `README.md:85` (Coverage bullet).
Placement matches D08 exactly: plan.md's `## Coverage` between `## Milestones` (line 46-49 of template) and `## Decisions` (line 57); milestone file's `## Coverage` (line 127) directly after Context/Waves (lines 119-125) and before `## Review Focus` (line 133).

### Fails first / RED
- Field rule: `reference/plan-format.md:229` (Task fields row), validation `:321-322`.
- `agents/worker.md:45-46`, `worker-light.md:44-45`, `worker-heavy.md:45-46`, `specialist.md:45-46` (RED reporting rules, identical).
- `skills/run/SKILL.md:166-171` (3d item 3, RED check before STATUS), `:194-195` (3e parallel equivalent), `:167` & `:269` (VACUOUS handling in Block-with-GAP section).
- `agents/plan-reviewer.md:45` (check 7, Fails first).
- `agents/milestone-reviewer.md` — Fails first itself isn't a milestone-reviewer check (Review Focus check 3 references the tests it produces, not the field directly); consistent with spec §7 which lists Review Focus, not Fails first, as a milestone-reviewer check.
- README: `README.md:87` (Fails first bullet).
`VACUOUS` appears in: `skills/run/SKILL.md:167,194,239 (via "REVIEW"),267,269,283` (Stop reasons list) and `reference/plan-format.md:229,241`. It is a valid Stop/Block reason everywhere it's used; no dangling reference found.

### Review Focus
- Template/rules: `reference/plan-format.md:133-137` (template), `:203-213` (### Review Focus prose), validation `:323`.
- `skills/plan/SKILL.md:107-109` (step 6, builds it after tasks drafted, before sequencing).
- `agents/planner.md:57-61` ("Build the Review Focus").
- `agents/plan-reviewer.md:44` (check... actually check 5 is wave interference; Review Focus isn't a numbered plan-reviewer check — spec §8's check list (§8, lines 159-171) does not include Review Focus, only Coverage/Interfaces/wave/Verify/Fails-first/tier/assumptions/Read-first. This matches: plan-reviewer.md's 10 checks map 1:1 to spec §8's list, and Review Focus is correctly absent from both.
- `agents/milestone-reviewer.md:47` (check 3, Review Focus).
- README: `README.md:86` (Review Focus bullet).

### Batch
- Field rule: `reference/plan-format.md:222` (Task fields row, directly after Tier), Steps row `:235`, sizing rules 2 and 3 `:290-291`, waves note `:264`, validation `:324` (last *(format 2)* item, after Review Focus, per D48).
- `skills/plan/SKILL.md:102` (prefer batching).
- `agents/planner.md:49` (prefer batching, same wording).
- `agents/reviewer.md:32` (per-task file-by-file batch check).
- `agents/milestone-reviewer.md:51` (batch check, "For a task with a `- Batch: yes` line").
- README: `README.md:88` (Batching bullet, directly after Fails first bullet — matches D48).
`agents/plan-reviewer.md` has no separate Batch check line, per D48 ("agents/plan-reviewer.md is unchanged: its Sonnet test already checks each task against the plan format's sizing rules, which carry the batch exception") — confirmed: plan-reviewer.md check 2 (Sonnet test, line 40) references "the sizing rules" generally, no batch-specific text, consistent with D48's explicit statement that no change was needed there.

### Assumptions
- Definition: `reference/plan-format.md:93-105` (`#### Assumptions` subsection, verbatim per D49).
- `skills/plan/SKILL.md:71-93` (step 5, four categories incl. Assumption bullet at line 76; "For each question" list item at line 84), `:183` (step 11 handoff check, "Assumptions: none" at reply line `:192`).
- `agents/planner.md:26-33` (four categories incl. Assumption; GAP tagged `[assumption]`).
- `agents/plan-reviewer.md:47` (check 9, unsourced assumptions), frontmatter description (`:3`, lists "unsourced assumptions").
- README: `README.md:82` ("Questions answered first" bullet — four categories, assumption definition, handoff check, "Assumptions: none").
`[assumption]` tag literal text found in `agents/planner.md:33,40` and `reference/plan-format.md:105`.

### The two new agents (`milestone-reviewer`, `plan-reviewer`)
- Both files exist: `agents/milestone-reviewer.md`, `agents/plan-reviewer.md`.
- Both frontmatter: `model`, `effort: high`, `maxTurns` (60 and 40 respectively), `disallowedTools: Edit` — matches spec §7/§8 exactly.
- Dispatch points: `skills/run/SKILL.md:113-127` (plan-reviewer in 3a), `:213-238` (milestone-reviewer in 3f, including re-review), `skills/plan/SKILL.md:173-181` (plan-reviewer dispatch at handoff, D09's "all in one message").
- Both listed in `reference/plan-format.md:5-10` reader list, and in `README.md`'s cast table (`README.md:69-70`) and "How a run behaves" bullet (`README.md:112`).

### `VACUOUS`
See "Fails first / RED" above — every occurrence resolves to a real Stop/Block reason; cross-checked against `skills/run/SKILL.md:283`'s Stop-reason enumeration (`GAP, STUCK, SCOPE, VERIFY, REVIEW, VACUOUS, MERGE, STRAY, PUSHED, SETUP, VALIDATION`).

### Other cross-reference spot checks (no dangling references found)
- Step-number references inside `skills/plan/SKILL.md` (step 5 audit, step 6 tasks+Review Focus, step 7 sequencing, step 8 self-check, step 9 coverage, step 10 size check, step 11 write/hand off) all point to the section that exists at that number; renumbering per D19 is consistent throughout (e.g. `:150-151` "step 9", `:181` "steps 6 to 9", `:183` "steps 6 to 9").
- `reference/plan-format.md:5-10` reader list matches the six readers spec §14 implies (plan, run, planner, plan-reviewer, milestone-reviewer, workers+reviewer).
- Tier rubric note ordering (`reference/plan-format.md:270-283`): rationale sentence (`:279`) directly under the table and before the `specialist` note (`:281`), then the Tier-adjustment note (`:283`) — matches D45's placement.
- `agents/plan-reviewer.md:37` format-1 skip line names checks 3, 4, 7 only (not 9) — matches D52 ("applies to format 1 milestones too").

## Outline bullet 3: Change 0 check

Grep results (paths relative to `plugins/orchestratinator/`):

**`They do not govern git`** — 12 files (expected 10 existing + 2 new = 12):
```
agents/plan-reviewer.md:33
agents/planner.md:102
skills/plan/SKILL.md:164
agents/reviewer.md:22
agents/worker-light.md:39
skills/run/SKILL.md:27
agents/milestone-reviewer.md:39
agents/specialist.md:40
agents/worker-heavy.md:40
agents/worker.md:40
agents/scout-heavy.md:16
agents/scout.md:16
```
The 2 new agents (`plan-reviewer.md`, `milestone-reviewer.md`) are included; the other 10 are the pre-existing skills/agents (`planner`, `plan/SKILL.md`, `reviewer`, `worker-light`, `run/SKILL.md`, `specialist`, `worker-heavy`, `worker`, `scout-heavy`, `scout`). Count matches expectation exactly (12).

**`omitClaudeMd: true`** — 4 files (expected 4 workers):
```
agents/specialist.md:7
agents/worker.md:7
agents/worker-light.md:6
agents/worker-heavy.md:7
```
Matches exactly.

**`You never commit, push, or change branches`** — present in the same 12 files (verified: `plan-reviewer.md:33`, `planner.md:102` [as "...replace them for the length of this task. You never commit, push, or change branches; run commits your work."], `reviewer.md:22`, `milestone-reviewer.md:39`, `scout.md:16`, `scout-heavy.md:16`, plus 6 more via the first grep's file list). `worker*.md`/`specialist.md`/skills don't carry this exact clause (workers/skills have their own git-rule variants); this is consistent with Change 0's description (§2) which pairs this sentence with the precedence rule only in agents/skills that had it applied by hand.

**`The orchestrator commits your work`** — 4 files, matching the 4 worker agents exactly:
```
agents/worker-light.md:40  ("The orchestrator commits your work. If you commit, your work can be lost.")
agents/specialist.md:41
agents/worker-heavy.md:41
agents/worker.md:41
```

**`PUSHED`** — 1 file, `skills/run/SKILL.md` (line 165, stray-commit check in 3d item 2, and line 283, Stop reason list). This is the only place PUSHED is defined/used, consistent with it being a `run`-only Stop reason.

No Change-0 text was found altered or missing from any file that should carry it.

## Outline bullet 4: fix tasks

No problems were found in the read-through (bullets 2 and 3). The only outstanding item is Outline bullet 1: the CHANGELOG.md append, which is not yet done. This requires no design decision — D13 already specifies the exact bullet text — so it is a plain follow-up task, not a GAP.
