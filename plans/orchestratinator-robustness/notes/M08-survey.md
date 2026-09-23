# M08 survey: Tier calibration (spec §9)

## Outline bullet 1 — `reference/plan-format.md` "Tier rubric": change the `worker-light` row, add rationale

- File: `plugins/orchestratinator/reference/plan-format.md`.
- The `## Tier rubric` section is at `plugins/orchestratinator/reference/plan-format.md:253-262`:
  ```
  253: ## Tier rubric
  254:
  255: | Tier | Model / effort | Use for |
  256: |---|---|---|
  257: | `worker-light` | Haiku | No logic: renames, constants, config edits, doc comments, boilerplate copied from a named file. |
  258: | `worker` | Sonnet / medium | **The default.** Fully specified work: names, signatures, behavior, and test cases all given in Steps. Most investigate tasks. |
  259: | `worker-heavy` | Sonnet / high | Fully specified but intricate: numeric or geometric code, parsers, state machines, concurrency, many edge cases. |
  260: | `specialist` | Opus / high | No design decisions, but the implementation needs judgment the plan can't pin down: unfamiliar library internals, debugging a known failure, poorly documented APIs. |
  261:
  262: If more than about one task in ten is `specialist`, the milestone is under-specified: split or specify those tasks instead.
  ```
- Only line 257 (the `worker-light` row) is in scope per the Outline; the other three rows are untouched.
- Spec §9's first bullet (the exact text the row must reflect), from `docs/orchestratinator-robustness-spec.md:191`:
  > `worker-light` is only for tasks whose Steps contain the **literal final content** to write: complete lines of code or config, exact file text. The work is transcription plus verification. If any step requires composing code from a prose description, the floor is `worker`.
- The **Why** rationale sentence, quoted verbatim in the milestone's Context (M08-tier-calibration.md:13) and matching spec §9's opening line (`docs/orchestratinator-robustness-spec.md:187`):
  > The cheapest models often take two to three times as many turns on multi-step work described in prose, which can cost more overall.
- Line 262 (`If more than about one task in ten is specialist...`) is the closest existing example of a one-line rubric note placed directly under the table with a blank line above it — a pattern the new rationale line can follow (add the rationale after line 262, or immediately under the table before line 262; the milestone file doesn't specify exact position beyond "under the rubric").
- No other file's tier-rubric table exists; the rubric text is defined only in `plan-format.md` and is not duplicated elsewhere. (`Grep` for `worker-light`/`Tier rubric` in the plugin found only this file and `agents/worker-light.md`'s frontmatter description and `README.md`'s cast table row.)

### README cast table / worker-light frontmatter check (Context bullet 4)

- README cast table row for `worker-light`, `plugins/orchestratinator/README.md:71`:
  ```
  | `worker-light` | Haiku | No-logic edits. |
  ```
  This does not contradict the new rubric wording (both describe "no logic" work); the new rubric only narrows *which* no-logic tasks qualify (literal final content vs. composing from prose). Nothing here states or implies the opposite of the new rule.
- `worker-light` agent frontmatter description, `plugins/orchestratinator/agents/worker-light.md:3`:
  ```
  description: Executes one no-logic Orchestratinator task (renames, constants, config edits, boilerplate from a named file). Dispatched by /orchestratinator:run only.
  ```
  Also consistent with, not contradicting, the new rubric (renames/constants/config/boilerplate are literal-content edits). No factual claim here conflicts with "literal final content" / "floor is worker if composing from prose".
- Conclusion available to the planner: neither needs a wording change under the Context instruction ("Only change them if they contradict the rubric") — but this is not this survey's call to make.

## Outline bullet 2 — `agents/planner.md`: escalation feedback

- File: `plugins/orchestratinator/agents/planner.md`.
- Escalation lines are written by `run`, format defined at `plugins/orchestratinator/reference/plan-format.md:224`:
  ```
  - `- Escalated: <from> → <to> (<one-line reason>)`
  ```
  Written under a task when `run` retries it at a higher tier (`plugins/orchestratinator/skills/run/SKILL.md:257`, in the retry/discard step). The line has no explicit "kind of task" field — only `<from>`, `<to>` tiers and a free-text one-line reason. D06 defines "escalates repeatedly" as "the same tier escalated two or more times on the same kind of task"; "kind of task" is not a defined/structured field anywhere in the plan format — the planner would need to judge task-kind similarity itself (e.g., from Objective/title text), since no existing mechanism tags tasks by kind.
- No existing `- Escalated:` lines exist yet in any committed milestone in this plan (only the rubric quote itself appears in `notes/M04-survey.md`, not a real escalation).
- Planner's current reading list, item 6, `plugins/orchestratinator/agents/planner.md:20`:
  ```
  6. The `done` milestones this one depends on: their Goals, Context, and task titles, and every `notes/` file their investigate tasks wrote. For each of their tasks that has an Interfaces block, also read its Produces lines.
  ```
  This currently scopes "done milestones" to **dependencies only**. Spec §9's escalation-feedback bullet (`docs/orchestratinator-robustness-spec.md:194`) and the Outline bullet both say "read the `- Escalated:` lines in `done` milestones" with no "depends on" qualifier — i.e., potentially all done milestones in the plan, not just this milestone's dependencies. This is a scope question the planner/task-writer will need to resolve (see Conflicts).
- D23 (plan.md:66), the exact Context line the planner must write when it raises a tier:
  ```
  - Tier adjustment: <kind of task> → <tier> (<tier> escalated <n> times in <milestone IDs>)
  ```
- Where to add the escalation-feedback instruction in `agents/planner.md`: the most analogous existing section is "Write the tasks as prompts" (`plugins/orchestratinator/agents/planner.md:43-49`), which is where tier defaults are set today (`Default to \`worker\`; justify each \`worker-heavy\` and \`specialist\` with a Why this tier line.` — line 45). This is also where the tier rubric is applied, so escalation-feedback logic (checking done-milestone Escalated lines and raising a kind's tier before/while assigning tiers) fits most naturally as an addition to this section or as a new subsection near it, ahead of "Build the Review Focus" (line 51) and "Sequence and find the parallelism" (line 57). No section is currently reserved for this purpose.
- The Context section of a milestone file (where the D23 line is written) is populated during detailing; other Context lines added by the planner in this plan's prior milestones (e.g., "Governing source: ...") appear directly under `## Context` as bullet lines — the D23 line would be one more such bullet, per D23's own text with no further placement rule specified in plan.md.
- `agents/planner.md`'s own opening line (`plugins/orchestratinator/agents/planner.md:9`) already lists the planner's two special modes ("Fix findings mode" and "Plan review mode") in one sentence, each parenthetically pointing to its own `##` section — the pattern M07-T04 used to add "Plan review mode" (see `plans/orchestratinator-robustness/M07-plan-review.md:264-291`) is a close template for how a new capability is threaded into this file's opening paragraph and into a dedicated section, if the planner (task-writer) chooses a dedicated section for escalation feedback instead of an inline addition to "Write the tasks as prompts".

## Unconfirmed

- Whether "kind of task" (D06) should be inferred from Task titles/Objectives, from Kind (`change`/`investigate`), or some other signal — no field in the plan format currently labels a task's "kind" beyond `Kind: change | investigate`, which is clearly not what D06 means (that's too coarse). Not stated anywhere in spec, plan.md Decisions, or existing code.
- Whether "read the `- Escalated:` lines in `done` milestones" (spec §9, Outline bullet 2) means all `done` milestones in the plan or only ones this milestone depends on (the planner's existing reading-list item 6 is scoped to dependencies only). No Decision addresses this.
- Exact insertion point for the rationale line under the tier rubric (before or after the existing "more than about one task in ten is specialist" note) — the milestone file only says "under the rubric", not more precisely.

## Conflicts

- Planner's "Before anything else" item 6 (`plugins/orchestratinator/agents/planner.md:20`) scopes `done` milestones to "this one depends on", but spec §9 (`docs/orchestratinator-robustness-spec.md:194`) and the M08 Outline (`plans/orchestratinator-robustness/M08-tier-calibration.md:20`) say to read Escalated lines in `done` milestones with no such qualifier. Not resolved here.
