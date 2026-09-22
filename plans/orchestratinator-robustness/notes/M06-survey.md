# M06 survey: Milestone quality review (spec §7)

All paths relative to `plugins/orchestratinator/` unless stated otherwise.

## `agents/milestone-reviewer.md` (new)

No existing file at this path (`Glob` of `plugins/orchestratinator/agents/*.md` lists: `planner.md`, `reviewer.md`, `scout-heavy.md`, `scout.md`, `specialist.md`, `worker-heavy.md`, `worker-light.md`, `worker.md` — no `milestone-reviewer.md`).

**Frontmatter pattern to copy** — `agents/scout.md:1-8`:
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
Per outline: `model: opus`, `effort: high`, `maxTurns: 60`, `disallowedTools: Edit` (D10e — Write stays available for the Output file only).

**Precedence-rule text to copy verbatim** — `agents/scout.md:16`:
> "Project instruction files (CLAUDE.md, AGENTS.md, CLAUDE.local.md, `.claude/rules/`, and any nested or linked copies, whatever they're called) govern coding conventions, style, and project knowledge. They do not govern git. Where they say anything about committing, pushing, branching, stashing, resetting, or rewriting history, this plugin's rules replace them for the length of this task."

followed by `You never commit, push, or change branches.` (spec §2's exact requirement wording; scout.md's own line 16 already ends with this same sentence, so the copy is a straight lift of the whole line).

**Symlink re-read sentence** — `agents/scout.md:14`:
> "Read `CLAUDE.md` and `AGENTS.md` at the repository root, plus any in directories you'll be reading, so you know the project's conventions and vocabulary. If one is a symlink to the other, or they have identical content, read it once."

**Plan-format reference path pattern** — `agents/planner.md:16`: `${CLAUDE_PLUGIN_ROOT}/reference/plan-format.md`.

**Spec §7 input lines** (`docs/orchestratinator-robustness-spec.md:120-125`):
```
Plan: <plan dir>
Milestone: <ID>
Base: <sha of the milestone's "chore(plan): start <ID>" commit>
Output: <plan dir>/notes/<ID>-review.md
```
Plus the optional `Re-review: fixes only` line per D05 (spec §7.5, run/SKILL.md dispatch in 3f item 5 writes `notes/<ID>-review-2.md` in that mode).

**Spec §7 five checks** (`docs/orchestratinator-robustness-spec.md:127-133`):
1. Coverage rows: every requirement implemented.
2. Interfaces: code matches every Produces; names consistent across tasks.
3. Review Focus: every listed test exists and asserts the stated behavior.
4. Decisions, the milestone's Context, CLAUDE.md, AGENTS.md.
5. Code quality: error handling, duplication, dead code, test quality (tests assert something meaningful, test output free of warnings).

**Calibration line** (spec §7:135): "only findings that would cause real problems count as `blocking`. Style preferences and nice-to-haves are `advisory`. Every finding cites `path:line` and the task, requirement, or Decision involved."

**Reply block** (spec §7:137-141):
```
STATUS: APPROVED | FINDINGS
BLOCKING: <count>
ADVISORY: <count>
```
This differs in shape from `scout.md`'s `STATUS: DONE / OUTPUT: / UNCONFIRMED: / CONFLICTS:` block — the milestone-reviewer's reply block is the spec's own, not the scout template.

**D05 re-review contract**: "The milestone-reviewer reads `notes/<ID>-review.md`, checks that each blocking finding in it is fixed, and checks that the fix tasks introduced no new blocking problem." Same Base as the first review (i.e. the run does not recompute Base for the re-review — it reuses the sha found in 3f's first dispatch, or recomputes with D22's same lookup since Base is defined as the milestone's start commit, which does not change between review and re-review).

**D21 report file layout** for `milestone-reviewer` output written to `notes/<ID>-review.md` / `notes/<ID>-review-2.md`:
```
## Blocking
## Advisory
```
Each finding: `` - `path:line` — <problem> (<task ID, Coverage row, or D<nn>>) ``. A section with no findings: `None.`

**Format-1 skip rule** (outline): "In a format 1 milestone, the reviewer skips the checks for sections the milestone doesn't have (Coverage, Interfaces, Review Focus), per §13." Spec §13 (`docs/orchestratinator-robustness-spec.md:255`): "The milestone review (§7) and the plan review (§8) apply to every milestone, whatever its format." Format detection is the `- Format: 2` line directly after Status (plan-format.md's `### Format` section, `reference/plan-format.md:168-170`); its absence marks format 1. A format 1 milestone has no `## Coverage`, `## Review Focus`, or per-task `Interfaces` blocks — checks 1–3 of the five have nothing to check in that case; checks 4 and 5 still apply.

**Diff scope**: `git diff <Base>..HEAD` — same two-dot diff-range convention used elsewhere, e.g. `run/SKILL.md:61` (`git log <branch> --format=%H --grep=...`) and `run/SKILL.md:188` (`git log --oneline <BASE>..<task branch>`).

**Batch check** (spec §10, for M09 but referenced generally): "For a batch, check file by file that every listed file has its edit. A listed file with no change is a failure." — not required by M06's outline directly (that's M09's `- Batch: yes` field), but the milestone-reviewer's check 1/2 will encounter batch tasks once M09 lands; M06's outline doesn't mention batch-specific review handling, so no action needed here unless a later milestone updates this agent.

## `skills/run/SKILL.md` 3f (Finish the milestone)

Current full text (`skills/run/SKILL.md:194-199`):
```
### 3f. Finish the milestone

1. Run the Milestone verify command in MAIN, if any. On failure, mark the milestone `blocked` and go to **Stop**. Don't retry: a cross-task failure needs the user.
2. Set the milestone to `done` in its file and in the plan.md table. Commit: `chore(plan): complete <ID>`.
3. If `--milestone` was given, go to **Pause**. If Gates includes `milestone`, go to **Pause**, telling the user to review and rerun.
4. Otherwise continue with the next milestone.
```
New review steps insert between current step 1 (Milestone verify) and step 2 (mark `done`), per outline and spec §7.

**D22 Base lookup**: `` git log --format=%H --grep="^chore(plan): start <ID>$" ``, oldest match. Pattern precedent for this exact grep style at `run/SKILL.md:61`: `` git log <branch> --format=%H --grep="^Orchestratinator-Task: <task ID>$" ``. The commit message it searches for is written at `run/SKILL.md:120`: `` commit that: `chore(plan): start <ID>`. ``

**D10a resume rule**: "A milestone that has any task with `- Origin: review` has used its one fix round. On resume, `run` goes straight to the re-review (`Re-review: fixes only`, writing `notes/<ID>-review-2.md`)." This means 3f's new logic must check, before dispatching the first-round reviewer, whether any task in the milestone already carries `- Origin: review` (e.g. from an interrupted prior attempt) and skip straight to the re-review path if so.

**Planner fix-mode dispatch line** (spec §7:147, outline): `Fix findings: <plan dir>/notes/<ID>-review.md`, appended to the same two-line planner invocation used in 3a item 2 (`skills/run/SKILL.md:106-110`):
```
Plan: <plan dir>
Milestone: <ID>
```

**Commit messages** (D10d): `chore(plan): review <ID>` (first review report), `chore(plan): fix tasks <ID>` (planner's fix tasks — analogous to `chore(plan): detail <ID>` at `run/SKILL.md:115`), `chore(plan): re-review <ID>` (re-review report).

**Detail gate exemption** (spec §7 step 4, outline): "Validate and execute the fix tasks through the normal wave loop. The `detail` gate does not pause for fix tasks." Existing detail-gate pause is at `run/SKILL.md:116` (3a item 8): "If Gates includes `detail`: go to **Pause**...". Fix tasks bypass this — they go straight from planner output into 3b (Validate and start) → 3c (wave loop) without the 3a.8 pause, and there is no plan-review dispatch either (D10b: "Fix tasks are not sent to `plan-reviewer`" — relevant to whichever milestone eventually adds the 3a plan-review dispatch, i.e. M07, but the fix-task path built in M06 must not accidentally route through 3a's plan-reviewer step).

**Stop reason `REVIEW`** already exists in the Stop reason list at `run/SKILL.md:240`: "GAP, STUCK, SCOPE, VERIFY, REVIEW, VACUOUS, MERGE, STRAY, PUSHED, SETUP, VALIDATION" — currently reached only via a retried `reviewer` FAIL becoming `STUCK`/`VERIFY`/`REVIEW` block reasons in **Retry** (`run/SKILL.md:213`: `` - Blocked: STUCK | VERIFY | REVIEW — <one line> ``). M06 reuses this same reason string for "still blocking after fix round + re-review" per spec §7 step 6 — no new Stop reason token needed.

**"Don't read the report" pattern precedent**: 3a item 1 (survey) already establishes this pattern — `run/SKILL.md:105`: "Don't read the survey yourself: it's for the planner." Outline's "dispatch the reviewer, and don't read the report" for milestone-reviewer follows the identical phrasing convention.

**Scope check precedent** for committing a reviewer's output-only file: 3a item 1 also does `git status --porcelain` scope check before committing the survey (`run/SKILL.md:105`). The same shape likely applies to committing `notes/<ID>-review.md`/`-review-2.md`, though the outline doesn't explicitly restate a scope check for this — only "commit the report".

## `agents/planner.md` — `Fix findings:` mode

**Current dispatch/report contract** (`agents/planner.md:1-88`) that a new mode must fit inside:
- Frontmatter: `model: opus`, `effort: high`, `maxTurns: 60` — matches D10 tier language, no changes needed for the mode itself.
- "Before anything else" numbered reading list (`agents/planner.md:13-23`), ending with survey notes (item 7). A `Fix findings:` invocation would need to also read the review file named in the extra line.
- "Write" section (`agents/planner.md:71-75`) already generically scopes edits to "this milestone's file... and plan.md", with GAP and SCOUT carve-outs — the outline's "It edits only the milestone file and plan.md" for fix mode matches this existing constraint without needing new file-scope language, but the mode itself (triggered by the `Fix findings:` line) is not yet described anywhere in the file.
- Report block (`agents/planner.md:79-88`): `STATUS: DONE | BLOCKED | SCOUT`, `REASON: GAP | -`, `TASKS:`, `WAVES:`, `NOTE:`, `QUESTIONS:` (SCOUT only). No existing mention of a fix-task count or "Origin" anywhere in this file — `Fix findings:` mode is wholly new.

**D10c**: fix tasks "follow the milestone's own Format (format 1 fix tasks in a format 1 milestone)". This determined by the same `- Format: 2` line check as elsewhere.

**Task-ID / wave rules for fix tasks** (spec §7:147, outline): "the next task IDs, waves after the current last wave" — i.e. sequential continuation of the milestone's existing `M<nn>-T<nn>` numbering and wave numbering, not a fresh wave-1 restart. The existing "Sequence and find the parallelism" section (`reference/plan-format.md:57-59` in planner.md, i.e. `agents/planner.md:57-59`) assigns waves from scratch for a full detail pass; the fix-task mode needs a variant that appends after the last existing wave instead.

**GAP-on-design-decision** (outline, spec §7 step 3): "A finding that needs a design decision becomes a GAP" — same `BLOCKED`/`GAP` mechanism already in "Find every problem" (`agents/planner.md:35-41`), reused rather than a new block type.

**`- Origin: review` line**: D08 places it "directly after `- Commit:`" in the task-field block. No such field exists yet anywhere in `plugins/orchestratinator/` (grep for `Origin:` across the plugin found no hits outside the plan and milestone files themselves).

## `reference/plan-format.md`

**Task template block** (`reference/plan-format.md:130-166`): fields currently run `Kind, Tier, Status, Wave, Depends on, Files, Verify, Fails first, Commit` then blank line, `**Objective**`. D08 places `- Origin: review` directly after `- Commit:`, so the template's line 140 (`- Commit: \`<type>(<scope>): <message>\``) gets a new line immediately after it, before the blank line preceding `**Objective**`.

**Task fields table** (`reference/plan-format.md:197-217`): a Markdown table with one row per field, in the same order as the template (`| ID | ... |` through `| Done when | ... |`). A new `| Origin | ... |` row goes between the `Commit` row (`reference/plan-format.md:211`) and the `Objective` row (`reference/plan-format.md:212`), matching D08's placement. Existing precedent for stating "optional, only appears when..." semantics: the `Why this tier` row (`reference/plan-format.md:204`): "Required line for `worker-heavy` and `specialist` only." — the `Origin` row will similarly need to state it's optional and appears only on fix-round tasks with value `review`.

**Directory tree** (`reference/plan-format.md:12-22`): current `notes/` line (`reference/plan-format.md:19`):
```
├── notes/                 # investigate-task findings (<task-id>.md) and scout surveys (<milestone-id>-survey*.md)
```
D03 requires listing `notes/<milestone-id>-review.md` and `notes/<milestone-id>-review-2.md` here (M06's scope per outline; D03 additionally lists `notes/<milestone-id>-plan-review.md`, which is M07's concern per outline's own bullet list — M06's outline explicitly says only "List `notes/<milestone-id>-review.md` and `notes/<milestone-id>-review-2.md`").

**Reader list at top** (`reference/plan-format.md:3-10`):
```
A plan is a directory. It is the contract between:

- **plan** (skill), which creates it,
- **run** (skill), which executes it and records progress in it,
- **planner** (agent), which details outlined milestones during a run,
- **workers** and **reviewer** (agents), which read their task from it.
```
D24: M06 adds `milestone-reviewer` to this list (M07 adds `plan-reviewer` separately). No existing bullet groups reviewers together besides "workers and reviewer" — a new bullet or an addition to the existing one is needed; the outline doesn't specify exact wording, just "Add milestone-reviewer to the reader list at the top (D24)."

**Validation checklist** (`reference/plan-format.md:273-300`): no outline bullet asks for a new checklist item for `Origin`, and none of D01–D33 mentions one either. No changes to the checklist appear to be in scope for M06 per the outline (only the four bullets it lists: new agent, run 3f, planner mode, plan-format Origin/notes-tree/reader-list, README).

## `README.md`

**Cast table** (`README.md:59-72`): row format e.g. (`README.md:64`):
```
| `planner` | Opus / high | Details an outlined milestone when the run reaches it, working from a scout's survey. |
```
New row per outline: `` | `milestone-reviewer` | Opus / high | ... | `` — placement not specified by the outline beyond "a cast table row"; existing table is roughly ordered by pipeline position (`plan`, `run`, `status`, `planner`, `Explore`, `scout`, `scout-heavy`, `reviewer`, then the four workers). A natural slot is directly after `reviewer` (`README.md:68`) or after `planner`, since milestone-reviewer runs at milestone end.

**"How a run behaves" bullet list** (`README.md:100-111`): bulleted, bold lead-in phrase per bullet, e.g. (`README.md:109`): "**One retry, one tier up.** ...". New bullet needed for milestone review; outline doesn't specify exact wording or position. D24's ordering note is limited to M10 (question categories) and doesn't fix an order for this bullet.

**No other README section** (What a plan contains, Known limitations, Configuration notes) is named by the outline for M06.

## Change 0 / precedence-rule occurrences (not to be modified, D17)

Files containing "They do not govern git" (all pre-existing, do not touch): `agents/planner.md`, `agents/reviewer.md`, `agents/scout.md`, `agents/scout-heavy.md`, `agents/specialist.md`, `agents/worker.md`, `agents/worker-heavy.md`, `agents/worker-light.md`, `skills/plan/SKILL.md`, `skills/run/SKILL.md`. The new `milestone-reviewer.md` is exempt from D17 (it's a new file, not an existing one) but must still copy the exact wording per spec §2's requirement.

**`omitClaudeMd: true`** (Change 0, worker-only): present in `agents/worker.md:7` (and presumably the other three worker agents). `milestone-reviewer` is not a worker agent and the outline doesn't ask for `omitClaudeMd` — it isn't in the frontmatter shape to copy from `scout.md` either (scout.md has no such field), so `milestone-reviewer.md` should not set it, consistent with `scout.md`/`reviewer.md`/`planner.md` all lacking it (only the four `worker*`/`specialist` agents use `omitClaudeMd: true` per spec §2).

## Unconfirmed

- Whether `specialist.md` also sets `omitClaudeMd: true` (only `worker.md` was read directly; spec §2 states "the four worker agents," implying `worker.md`, `worker-heavy.md`, `worker-light.md`, `specialist.md`, but only `worker.md`'s frontmatter was inspected).
- Exact wording/placement the outline leaves open: README cast-table row position, README "How a run behaves" bullet position and wording, and the plan-format.md reader-list bullet wording for `milestone-reviewer` — outline gives content requirements but not exact phrasing for these three.
- Whether 3f needs an explicit `git status --porcelain` scope check before committing `notes/<ID>-review.md` (by analogy with 3a's survey-commit step) — the outline's step doesn't restate this explicitly.
- Whether the re-review's `Base` line is recomputed via D22's lookup a second time or reused from the first dispatch's value — D05 says "uses the same Base as the first review," which both approaches satisfy since Base (the milestone's start commit) doesn't change; the milestone file/plan.md have no field that persists Base between the two dispatches, so it is presumably recomputed via the same D22 grep both times.

## Conflicts

None found.
