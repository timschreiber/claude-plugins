# Orchestratinator robustness changes

Spec for eight changes inspired by Superpowers (obra/superpowers), and one change that turns assumptions into questions. All changes are to `plugins/orchestratinator/`, which is Markdown only: skills, agents, `reference/plan-format.md`, and the README.

## 1. Ground rules

1. **The plan format is a contract.** `reference/plan-format.md` is read by the `plan` and `run` skills and by every agent. Any change to the format changes every reader in the same commit. Never one side only.
2. **Plans already in progress must keep working** (for example `plans/advanced-scanner/` in MPRUVD_PDF, mid-run). See §13, Compatibility.
3. **No new design decisions below the plan.** Every change here keeps that rule: new checks either catch problems or surface them as questions, never let a worker or the orchestrator decide.
4. **Keep the orchestrator's context small.** New reviewers write their findings to files under the plan's `notes/` and reply with a short status block, like the scouts.
5. **Frontmatter must parse as YAML.** Quote any value containing `: ` or starting with `<`, `[`, `{`, `*`, `&`, `!`, `|`, `>`, `%`, `@`, or a backtick.

## 2. Already applied: Change 0 (don't redo)

Change 0 was applied by hand before this spec was planned, and is **not part of this work**. It's described here only so new work stays consistent with it:

- Every skill and agent contains the **precedence rule**: project instruction files govern conventions, style, and project knowledge, not git, and the plugin's git rules replace anything they say about committing, pushing, branching, stashing, resetting, or rewriting history. Search for "They do not govern git" to find the exact text.
- Every re-read of CLAUDE.md and AGENTS.md reads a symlinked or identical pair only once.
- The four worker agents set `omitClaudeMd: true`.
- `run` checks for stray worker commits and branch changes after every dispatch, and confirms each parallel task branch has exactly one commit with its trailer before cherry-picking. `PUSHED` is a Stop reason.

**Requirement for this work:** the two new agents in this spec (`milestone-reviewer`, `plan-reviewer`) include the precedence rule, copied verbatim from an existing agent, plus `You never commit, push, or change branches.` Their CLAUDE.md / AGENTS.md re-read uses the symlink sentence. No existing file's Change 0 text is modified.

## 3. Change 1: Interfaces per task

**Why.** A worker sees only its own task, and parallel workers can't see each other at all. Names and types that cross task boundaries have to be written down once and matched exactly.

**Plan format.** New required block in every `change` task, after Read first:

```markdown
**Interfaces**

- Consumes: `CandidateSelector.select(PDDocument doc): List<Candidate>` (M01-T03)
- Consumes: `WcagThresholds.LARGE_TEXT_PT` (existing, `core/.../WcagThresholds.java:14`)
- Produces: `FigureWithAlternateText implements CandidateSelector`
- Produces: `static boolean isLargeText(float fontSizePt, boolean bold)`
```

Rules, added to "Task fields" and the validation checklist:

1. Each entry is an exact signature or exact name: method signatures with parameter and return types, class and interface names, constants with their values, JSON or file shapes, CLI flags, config keys.
2. Each **Consumes** names its source: a task ID, or `existing` with a `path:line`.
3. Every Consumes from a task matches that task's Produces **character for character**. The consuming task also lists that task in Depends on, so it's in a later wave.
4. No symbol is produced by two tasks with different signatures.
5. `none` is allowed for either line. `investigate` tasks omit the block.

**Workers.** Implement every Produces entry exactly as written. Never change the signature of anything consumed. If the code disagrees with a Consumes entry, stop with `BLOCKED` / `GAP`.

**`plan` and `planner`.** In the self-check, add an interface-consistency pass across all tasks of every milestone being detailed, and against the Produces of `done` milestones when detailing later ones.

**Reviewers.** The per-task `reviewer` and the new milestone reviewer (§7) check that the code matches Produces.

**Acceptance:** template, field rules, validation items, worker rules, and self-check passes all present.

## 4. Change 2: Spec coverage check

**Why.** A requirement that falls between tasks is the failure a plan is least likely to catch any other way.

**Plan format.**

- `plan.md` gains a `## Coverage` section: one row per section of every source (heading or numbered item), mapped to the milestone(s) that implement it, or `out of scope` with the Decision that says so.
- Every **detailed** milestone file gains a `## Coverage` section: one row per requirement the milestone implements, mapped to the task ID(s) that implement it.
- A requirement is any normative statement: must, shall, should, a numbered acceptance criterion, or an explicit behavior. Trivially related statements may share a row.
- Row format: `- <source> <location>: <requirement, briefly> → <task IDs | milestone ID | out of scope (D<nn>)>`.

**`plan` skill.** New step after the self-check: build both coverage levels. A requirement with no task or milestone gets one added. If it seems deliberately out of scope, that's a question for the user, never a silent drop. **`planner`:** when detailing a milestone, build its Coverage section from the plan-level rows pointing at it; a row it can't map is a GAP.

**Validation checklist:** plan.md has a Coverage section with no unmapped row; every detailed milestone has a Coverage section with no unmapped row; every task ID in a Coverage row exists.

**Acceptance:** both levels specified in the format; built by `plan` and `planner`; checked by validation.

## 5. Change 3: Watch the test fail first

**Why.** The format already says Verify must fail when the task isn't done. Nothing checks it, so a test that can't fail passes as evidence.

**Plan format.** New task field: `- Fails first: yes | no`.

- `yes` for any task that adds or changes tests. Its Steps put the test-writing steps first, then a step "Run Verify and confirm it fails", then the implementation steps.
- `no` for tasks with no test that can fail beforehand: docs, config, pure renames, refactors covered by passing tests. Tasks with `no` need a one-line reason.

**Workers.** For `Fails first: yes`: write the tests, run Verify, and confirm it fails **before** writing implementation code. The report gains a line:

```
RED: CONFIRMED <first failing line> | PASSED-EARLY | N/A
```

If Verify passes before implementation, stop with `BLOCKED` / `GAP` and `RED: PASSED-EARLY`: either the test can't fail or the behavior already exists, and both mean the plan is wrong.

**`run` skill.** For a `Fails first: yes` task:

- `RED: CONFIRMED` → continue.
- `PASSED-EARLY` → GAP handling, with the new block reason `VACUOUS`.
- Missing or `N/A` → treat as a failed attempt and go to **Retry**.

**Acceptance:** field, rules, and worker behavior present; `run` handles all three RED values; `VACUOUS` added to the Stop reasons.

## 6. Change 4: Review Focus

**Why.** Specs describe what software must do, not every input it will meet. Silence on an input is not permission for that input to break the program.

**Plan format.** Every detailed milestone gains a `## Review Focus` section: up to five inputs or failure modes the sources imply but no task's tests exercise, most likely first. Each line gives:

- the input or condition,
- the expected behavior, with its source (a spec section or Decision),
- the test that pins it, and the task that owns that test. That task's Steps include writing the test.

If nothing qualifies, the section says `None found:` plus what was checked. An empty section is never just blank.

**The expected behavior must come from the sources or Decisions.** If it doesn't, it's a design decision: an ambiguity question for the user in `plan`, or a GAP in `planner`. This is the rule that keeps Review Focus from becoming a back door for decisions.

**Acceptance:** section in the milestone template, built by `plan` and `planner`, with the sourcing rule and the question/GAP rule stated.

## 7. Change 5: Milestone quality review

**Why.** Per-task checks catch per-task problems. Cross-task inconsistency and code quality need a view of the whole milestone.

**New agent `milestone-reviewer`** (Opus, high effort, read-only except its output file, `maxTurns: 60`). Input:

```
Plan: <plan dir>
Milestone: <ID>
Base: <sha of the milestone's "chore(plan): start <ID>" commit>
Output: <plan dir>/notes/<ID>-review.md
```

It reviews `git diff <Base>..HEAD` against:

1. The milestone's Coverage rows: every requirement implemented.
2. Interfaces: the code matches every Produces, and names stay consistent across tasks.
3. Review Focus: every listed test exists and asserts the stated behavior.
4. Decisions, the milestone's Context, CLAUDE.md, and AGENTS.md.
5. Code quality: error handling, duplication, dead code, and test quality. Tests must assert something meaningful, and test output should be free of warnings.

Calibration: only findings that would cause real problems count as `blocking`. Style preferences and nice-to-haves are `advisory`. Every finding cites `path:line` and the task, requirement, or Decision involved. It writes the report to Output and replies:

```
STATUS: APPROVED | FINDINGS
BLOCKING: <count>
ADVISORY: <count>
```

**`run` skill, in 3f** (finish the milestone), after Milestone verify passes and before marking the milestone `done`:

1. Dispatch `milestone-reviewer`. Don't read the report yourself.
2. `APPROVED`, or only advisory findings → commit the report and continue.
3. Blocking findings → invoke `planner` with the extra line `Fix findings: <plan dir>/notes/<ID>-review.md`. The planner appends fix tasks to the milestone, with the next task IDs, waves after the current last wave, and an `- Origin: review` line each. A finding that needs a design decision becomes a GAP.
4. Validate and execute the fix tasks through the normal wave loop. The `detail` gate does not pause for fix tasks.
5. Re-run Milestone verify, then dispatch `milestone-reviewer` once more with the extra line `Re-review: fixes only`, writing `notes/<ID>-review-2.md`.
6. Still blocking → go to **Stop** with reason `REVIEW`. Only one fix round per milestone.

**`planner`.** Handles the `Fix findings:` mode: it reads the review, writes fix tasks under all the usual rules, and edits only the milestone file and plan.md.

**Acceptance:** agent exists with correct frontmatter; `run` 3f includes the review, one fix round, and the re-review; planner fix mode specified; README cast table updated.

## 8. Change 6: Fresh-eyes plan review

**Why.** The planner can't see its own blind spots. One cheap, independent pass catches placeholders, gaps, and vague tasks before anything executes.

**New agent `plan-reviewer`** (Sonnet, high effort, read-only except its output file, `maxTurns: 40`). Input: the plan directory, the milestone ID(s) to review, and an Output path. It checks the milestone(s) against the plan format:

- banned phrases and placeholders;
- tasks that fail the Sonnet test (a choice left to the worker);
- Coverage gaps against the sources;
- Interfaces consistency;
- wave interference;
- Verify commands that aren't targeted or couldn't fail;
- `Fails first` settings;
- tier fit, per the calibration in §9;
- unsourced assumptions, per §11;
- Read first entries that name whole documents.

Calibration: approve unless there are real gaps. Output file, then:

```
STATUS: APPROVED | ISSUES
ISSUES: <count>
```

**`plan` skill.** After writing the plan directory and before the handoff reply, dispatch `plan-reviewer` on every detailed milestone. Fix each issue yourself, once. There is no re-review loop. Mention in the handoff how many issues were found and fixed.

**`run` skill, in 3a.** After the planner reports `DONE` and before validation, dispatch `plan-reviewer` on the milestone, writing `notes/<ID>-plan-review.md`. On `ISSUES`, invoke the planner once more with the extra line `Plan review: <path>`; the planner fixes the issues and reports as usual. Then validate as before.

**Acceptance:** agent exists; both skills dispatch it; one fix pass each, no loop.

## 9. Change 7: Tier calibration

**Why.** The cheapest models often take two to three times as many turns on multi-step work described in prose, which can cost more overall.

**Plan format, tier rubric:**

- `worker-light` is only for tasks whose Steps contain the **literal final content** to write: complete lines of code or config, exact file text. The work is transcription plus verification. If any step requires composing code from a prose description, the floor is `worker`.
- Add the turn-count note as a one-line rationale under the rubric.

**`planner`, escalation feedback.** When detailing a milestone, read the `- Escalated:` lines in `done` milestones. If one tier escalates repeatedly for a kind of task, assign that kind one tier higher in this milestone. Say so in one line in the milestone's Context.

**Acceptance:** rubric updated; planner escalation feedback specified.

## 10. Change 8: Batching tiny, same-shape tasks

**Why.** Several identical small edits across files cost one worker, not several.

**Plan format.** New optional task field `- Batch: yes`. A batch task:

- groups edits of the **same kind with no logic**: the same constant change, field addition, import fix, or rename across files;
- relaxes the three-production-file sizing limit to about ten files;
- has one Step per file, each with the literal edit;
- is one commit, and is usually `worker-light`.

`plan` and `planner` prefer one batch task over several tiny same-shape tasks. Waves still apply: a batch touching many files interferes with more tasks, so place it accordingly.

**Reviewers.** For a batch, check file by file that every listed file has its edit. A listed file with no change is a failure.

**Acceptance:** field and rules present; planning skills prefer batching; reviewer rule present.

## 11. Change 9: Assumptions are questions

**Why.** The planning audit asks about three kinds of problem: insufficient information, ambiguity, and contradictions. In the first real run, `plan` still ended its handoff with a list of "assumptions": a branch choice, a hashing rule, a new tag name, a duplicated helper, and a licensing conclusion. Each was a decision made below the user. An assumption is a fourth kind of problem, and gets the same treatment as the other three.

**Definition.** An assumption is any choice or conclusion the plan depends on that isn't stated in the sources, a Decision, or CLAUDE.md / AGENTS.md, and isn't a fact read directly from code or docs with a citation. Typical forms:

- a default filled in where the sources are silent (a branch, a location, a name, a threshold, a tag);
- a convention extrapolated from existing code to new code;
- an algorithm or format detail the sources don't specify;
- a factual conclusion drawn from evidence rather than stated anywhere, such as "these fixtures were licensed under X on date Y". The evidence is attached, but the conclusion still needs the user's confirmation;
- a structural choice not dictated by the sources, such as splitting one source phase into several milestones.

**Not assumptions:** the plugin's own documented defaults for plan settings (Detailing, Gates, Parallel, Max parallel), and facts a scout or Explore reported with a `path:line` or URL citation.

**`plan` skill, step 5.** The audit covers four categories: insufficient information, ambiguity, contradiction, and **assumption**. For an assumption, the question states what `plan` would assume, why the plan needs it, and the recommended value, plus the evidence for a factual conclusion. Answers become Decisions with source `user`, like the rest.

**`plan` skill, handoff.** The line "any assumption you made that the user didn't state" is replaced. Before handing off, `plan` checks the finished plan for assumptions. If it finds any, it doesn't hand off: it asks them as one more round of questions, records the answers, and then hands off. The handoff states `Assumptions: none`.

**`planner`.** The same four categories apply. An assumption the planner can't source is a GAP, written to Open questions with the tag `[assumption]` in the same format as the other three categories.

**`plan-reviewer`.** Checks for unsourced assumptions: any value or choice in a task that no source, Decision, or cited fact supports. Each one found is an issue.

**Acceptance:** four categories in `plan` step 5 and in the planner; the handoff check replaces the assumptions list; plan-reviewer checks for assumptions.

## 12. Worker report format (combined)

After change 3, workers reply with exactly:

```
STATUS: DONE | BLOCKED
REASON: GAP | STUCK | -
FILES: <comma-separated paths changed or created>
VERIFY: PASS | FAIL | NOT RUN | REVIEW ONLY
RED: CONFIRMED <first failing line> | PASSED-EARLY | N/A
NOTE: <one line. For GAP, the exact question.>
```

## 13. Compatibility

- Each milestone file gains `- Format: 2`. Milestones without it are format 1.
- Validation applies the new checklist items (Interfaces, Coverage, Fails first, Review Focus, Batch) **only to format 2 milestones**. Format 1 milestones validate as before, so in-progress plans keep running.
- When the planner details an outlined milestone, it always writes format 2, even in a plan created under format 1. For a format 1 plan, it also adds the plan-level Coverage rows for its own milestone, creating the section if needed.
- The milestone review (§7) and the plan review (§8) apply to every milestone, whatever its format.
- `plan` always writes format 2.

## 14. Files changed

| File | Changes |
|---|---|
| `reference/plan-format.md` | §3, §4, §5, §6, §9, §10, §11, §13: fields, sections, rules, checklist, rubric |
| `skills/plan/SKILL.md` | §3 self-check, §4 coverage step, §6, §8 plan review, §10 batching preference, §11 assumption category and handoff check |
| `skills/run/SKILL.md` | §5 RED handling, §7 milestone review, §8 plan review in 3a, new Stop reason `VACUOUS` |
| `agents/planner.md` | §3, §4, §6, §7 fix mode, §8 plan-review fixes, §9 escalation feedback, §10, §11 assumption GAPs |
| `agents/worker*.md`, `agents/specialist.md` | §3 Interfaces rules, §5 red check, §12 report |
| `agents/reviewer.md` | §3, §10 |
| `agents/milestone-reviewer.md` | New (§7), including the precedence rule per §2 |
| `agents/plan-reviewer.md` | New (§8), with the §11 assumption check, including the precedence rule per §2 |
| `README.md` | Cast table (two new agents), how a run behaves (milestone review), what a plan contains (Interfaces, Coverage, Review Focus, Fails first, batching) |
| `CHANGELOG.md` (repo root) | One entry summarizing the changes |

## 15. Out of scope

- A whole-plan review at the end of a run. Milestone reviews cover it.
- Reviewing every task for quality. Too costly; the milestone review replaces it.
- Superpowers' "rulings instead of stops". It conflicts with Orchestratinator's rule that no one below the plan makes design decisions.
- Change 0 (§2), already applied.

## 16. Verification

- `./scripts/Validate-All.ps1` passes, with only the expected missing-`version` warnings.
- Every skill and agent frontmatter block parses as YAML, per ground rule 5.
- A read-through confirms every reader of each new field (§14) was updated, and no reader references a field or section that doesn't exist.
- Change 0 is still intact: the precedence rule appears in every skill and agent, including the two new ones, and `omitClaudeMd: true` is still set on the four workers.
- Smoke test: plan a small throwaway feature with `--always-plan` in a scratch repo and confirm the plan has format 2 milestones with Interfaces, Coverage, Fails first, and Review Focus, and that `plan-reviewer` ran. Then run it and confirm the milestone review runs before the milestone is marked done.

## 17. Decisions made in this spec

Review these before planning. Each is a choice, not a given:

1. **Milestone review on Opus, plan review on Sonnet.** The milestone review needs judgment across a whole milestone's diff; the plan review is checklist work.
2. **One fix round** after a blocking milestone review, and one fix pass after a plan review. Then stop or proceed.
3. **Fix tasks don't pause at the `detail` gate.** They are small and come from a review.
4. **A test that passes before implementation stops the run** as `VACUOUS`, rather than being retried, because it means the plan is wrong.
5. **Coverage at two levels:** plan-level by source section, milestone-level by requirement.
6. **Format versioning per milestone**, so in-progress plans keep working and upgrade as they're detailed.
7. **Batch tasks may touch up to about ten files.**
8. **Assumptions block the handoff.** `plan` asks one more round rather than handing off with assumptions listed, and plugin setting defaults don't count as assumptions.
