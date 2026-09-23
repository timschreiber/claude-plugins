# M04 survey: Change 3, Fails first (spec §5, §12)

## Governing spec text (verbatim)

docs/orchestratinator-robustness-spec.md:72-96 (§5):
- New task field: `- Fails first: yes | no`.
- `yes` for any task that adds or changes tests. "Its Steps put the test-writing steps first, then a step 'Run Verify and confirm it fails', then the implementation steps."
- `no` for tasks with no test that can fail beforehand: docs, config, pure renames, refactors covered by passing tests. Tasks with `no` need a one-line reason.
- Workers: for `Fails first: yes`, write the tests, run Verify, confirm it fails before implementation. Report gains: `RED: CONFIRMED <first failing line> | PASSED-EARLY | N/A`. If Verify passes early, stop with `BLOCKED` / `GAP` and `RED: PASSED-EARLY`.
- `run`: `RED: CONFIRMED` → continue. `PASSED-EARLY` → GAP handling, with new block reason `VACUOUS`. Missing or `N/A` → treat as failed attempt, go to Retry.
- Acceptance: field, rules, worker behavior present; `run` handles all three RED values; `VACUOUS` added to Stop reasons.

docs/orchestratinator-robustness-spec.md:239-247 (§12, combined report format):
```
STATUS: DONE | BLOCKED
REASON: GAP | STUCK | -
FILES: <comma-separated paths changed or created>
VERIFY: PASS | FAIL | NOT RUN | REVIEW ONLY
RED: CONFIRMED <first failing line> | PASSED-EARLY | N/A
NOTE: <one line. For GAP, the exact question.>
```

## Outline bullet 1: reference/plan-format.md

Task template block: `plugins/orchestratinator/reference/plan-format.md:124-159`. Current Verify/Commit lines:
```
132	- Verify: `<targeted, quiet command>`
133	- Commit: `<type>(<scope>): <message>`
```
Per D08, `- Fails first:` goes directly after `- Verify:` (line 132), before Commit (line 133).

Task fields table: `reference/plan-format.md:180-196`. Verify row is line 190, Commit row is line 191:
```
190	| Verify | A command, `review`, or both (`<command>` + review). ... |
191	| Commit | Conventional-commit message, used verbatim. ... |
```
New "Fails first" row belongs between them, matching D08 rules: `yes` for tasks adding/changing tests, Steps ordering (test steps → "Run Verify and confirm it fails" → implementation); `no (<reason>)` format (D08); `investigate` tasks omit the field (mirrors existing Interfaces-row wording at line 194: "`investigate` tasks omit it"); a task whose Verify is `review` alone must be `no` (D08).

Steps ordering rule for `yes`: no existing paragraph states step-ordering rules outside the Task fields table; the Steps field row itself is line 195: `| Steps | Numbered. Each step is one concrete action. At most about seven steps. |`. The milestone's outline text ("Add the Steps ordering rule for yes") most naturally extends either the new Fails first row or the Steps row — no separate subsection exists for step-ordering rules elsewhere in the file (checked the "Tasks are prompts" section at lines 203-210 and "Sizing rules" at 240-250; neither currently states ordering rules, so this would be new prose in the Fails first row or a short paragraph near it).

`- Blocked:` reasons list: `reference/plan-format.md:198-201`:
```
198	run appends these lines under a task when they apply:
199	
200	- `- Escalated: <from> → <to> (<one-line reason>)`
201	- `- Blocked: GAP | STUCK | SCOPE | VERIFY | REVIEW — <one line>`
```
`VACUOUS` needs appending to line 201's list.

Validation checklist, format-2 items: `reference/plan-format.md:253-277`. Interfaces items are lines 269-272, Coverage items 273-275, closing note at 277. No existing Fails-first checklist item. Pattern to copy (line 269): `- [ ] Every \`change\` task has an Interfaces block directly after Read first, with at least one Consumes line and one Produces line (\`none\` allowed for either), and no \`investigate\` task has one. *(format 2)*` — an analogous line for Fails first (field present after Verify, `no` has a reason, investigate omits it, `review`-only Verify forces `no`) would go after line 275, keeping spec-numbered order (Interfaces=Change1, Coverage=Change2, Fails first=Change3).

## Outline bullet 2: worker agents

All four agent files share byte-identical "## Rules" and "## Report" sections modulo line offsets from frontmatter length. Exact anchors:

**plugins/orchestratinator/agents/worker.md**
- Rules section: lines 34-47. Test-related rule: line 44 `- Never delete, skip, or weaken a test to get a pass.`
- Report header: line 49 `## Report`; block: lines 51-59.

**plugins/orchestratinator/agents/worker-light.md**
- Rules: lines 33-46. Test rule: line 43 (same text).
- Report header: line 48; block: lines 50-58.

**plugins/orchestratinator/agents/worker-heavy.md**
- Rules: lines 34-47. Test rule: line 44.
- Report header: line 49; block: lines 51-59.

**plugins/orchestratinator/agents/specialist.md**
- Rules: lines 34-48 (has one extra rule at line 48: "You may use judgment on implementation details that stay inside the task's Files ... Anything visible outside those files ... is a GAP"). Test rule: line 44.
- Report header: line 50; block: lines 52-60.

Current Report block (identical across all four, e.g. worker.md:51-59):
```
STATUS: DONE | BLOCKED
REASON: GAP | STUCK | -
FILES: <comma-separated paths you changed or created>
VERIFY: PASS | FAIL | NOT RUN | REVIEW ONLY
NOTE: <one line. For GAP, the exact question that needs an answer.>
```
Must become the §12 six-line block (add `RED:` line between VERIFY and NOTE), verbatim per spec §12 quoted above.

Fails-first rule to add (per spec §5 workers paragraph): write tests, run Verify, confirm it fails before implementation; if Verify passes early, stop `BLOCKED`/`GAP` with `RED: PASSED-EARLY`. Natural anchor is right after each file's "Never delete, skip, or weaken a test to get a pass." rule (worker.md:44, worker-light.md:43, worker-heavy.md:44, specialist.md:44), since it's the other test-related rule.

None of the four files currently mention "Fails first" or "RED" anywhere (confirmed via full-file reads).

## Outline bullet 3: skills/run/SKILL.md

File section map (grep of `^#`): 3d "Serial wave" is lines 138-159; 3e "Parallel wave" is lines 161-186; "Retry" is lines 202-213; "Block with GAP" is lines 215-217; "Stop" is lines 226-233.

**3d step 3** (`skills/run/SKILL.md:150-153`), current:
```
150	3. **Read the report** (`STATUS`, `REASON`, `FILES`, `VERIFY`, `NOTE`):
151	   - `BLOCKED` / `GAP` → **Block with GAP** (see below).
152	   - `BLOCKED` / `STUCK` → **Retry**.
153	   - `DONE` → continue.
```
Needs: parenthetical list gains `RED`; and for `Fails first: yes` tasks, branch on RED value (`CONFIRMED` → continue as today; `PASSED-EARLY` → Block-with-GAP flow but block reason `VACUOUS`; missing/`N/A` → Retry, per D20, with retry reason line `Reason: RED not confirmed (Fails first: yes)`). Format-1 milestones/tasks with no Fails-first field, or `Fails first: no`, ignore RED entirely (per milestone Context: "A task in a format 1 milestone has no Fails first field and is handled as `no`: `run` ignores its RED line.").

**3e step 3** (`skills/run/SKILL.md:171-175`), current:
```
171	3. **For each report**, in task ID order, working inside that task's worktree:
172	   - First, in that worktree, apply the same stray-commit and branch check as in 3d, using BASE as the recorded HEAD and the task branch as the expected branch.
173	   - `BLOCKED` / `GAP` → record it for **Block with GAP**. Leave its worktree for inspection.
174	   - `BLOCKED` / `STUCK` → queue a **Retry**.
175	   - `DONE` → check scope with ... . Otherwise verify in the worktree ... Failure → queue a **Retry**. Success → commit the task in the worktree.
```
Same RED handling needs mirroring here (parallel wave), since PASSED-EARLY/missing/N/A must be caught before scope-check/commit.

**Block with GAP** section (`skills/run/SKILL.md:215-217`):
```
215	## Block with GAP
216	
217	The plan left a decision open. **Never retry or escalate a GAP**: a higher tier would just make the decision. Mark the task `blocked` with `- Blocked: GAP — <question>`, and add the question to plan.md's Open questions tagged with the task ID. In serial mode go to **Stop**; in parallel mode, finish the wave's other tasks first (step 6 onward), then **Stop**.
```
This section currently hardcodes `- Blocked: GAP — <question>` and "add the question to plan.md's Open questions." The milestone outline's "Block with GAP handling with block reason VACUOUS" implies reusing this stop-flow but with `- Blocked: VACUOUS — <one line>` instead of GAP, and it's not clear from the spec/outline whether a PASSED-EARLY case should also add an Open-questions entry (spec §5 only says "GAP handling, with the new block reason VACUOUS" — no mention of Open questions specifically for this case). Flagged under Unconfirmed below.

**Retry section** (`skills/run/SKILL.md:202-213`), current reason-line template at line 210:
```
207	- Otherwise, discard the attempt: ... Add `- Escalated: <from> → <to> (<one-line reason>)` under the task ... and dispatch again to the next tier with these lines appended:
208	  ```
209	  Retry: previous attempt by <tier> failed. You are starting from a clean state.
210	  Reason: <worker's NOTE, reviewer's REASONS, or "Verify failed">
211	  Verify tail:
212	  <last 40 lines of the verify log, if a command failed>
213	  ```
```
D20's retry reason line (`Reason: RED not confirmed (Fails first: yes)`) is a fourth alternative for line 210's `Reason:` value, alongside worker's NOTE / reviewer's REASONS / "Verify failed".

**Stop reasons list** (`skills/run/SKILL.md:231`):
```
231	2. Report: where, the reason (GAP, STUCK, SCOPE, VERIFY, REVIEW, MERGE, STRAY, PUSHED, SETUP, VALIDATION), the one-line detail, ...
```
`VACUOUS` needs appending to this parenthetical list.

No existing text in SKILL.md mentions `RED`, `Fails first`, `VACUOUS`, or `PASSED-EARLY` (confirmed by grep over the whole file for those terms — no matches besides what's quoted above).

## Outline bullet 4: README.md "What a plan contains"

`plugins/orchestratinator/README.md:78-85`, the bullet list:
```
78	### What a plan contains
79	
80	- **Questions answered first.** ...
81	- **Tasks that are prompts.** ...
82	- **Interfaces.** ...
83	- **Coverage.** ...
84	- **Sequence and parallelism.** ...
```
No existing bullet mentions Fails first, RED, or test-first order. Spec-numbered order (Interfaces=§3, Coverage=§4, Fails first=§5, Sequence/parallelism has no §-number but is listed last) suggests the new "**Fails first.**" bullet goes between the Coverage bullet (line 83) and the Sequence-and-parallelism bullet (line 84).

## Decisions consulted (plan.md)

- D08 (line 39-44): exact placements — Fails first directly after Verify in task fields; `no (<reason>)` format; investigate tasks omit it; Verify of `review` alone forces `no`.
- D16/D17 (lines 57-58): this plan's own files (M-files under plans/) are format 1 and never touched; Change 0 text must never be modified — none of the M04 outline's target lines overlap Change 0 markers (verified: none of the Rules/Report/3d/3e anchors above contain the D17-listed strings).
- D20 (line 61): retry reason line for missing/N/A RED.
- D01 (line 32): every reader of what M04 changes must be updated in this milestone: plan-format, four worker agents, run (3d and 3e), confirmed as the full reader set — no other file references the worker report format or Fails first (checked `agents/*.md`, `skills/*/SKILL.md`, `README.md` via grep for "STATUS: DONE" and "Fails first" repo-wide; only the four agent files and reference/plan-format.md's template contain report/field text).

## Unconfirmed

1. Exact wording/placement of the Steps-ordering rule for `yes` (plan-format.md) — no dedicated "Steps ordering" subsection exists; must be new prose, likely appended to the new Fails-first table row or as a sentence near the Steps row (line 195). Checked "Tasks are prompts" (203-210) and "Sizing rules" (240-250): neither is a fit.
2. Whether the PASSED-EARLY→VACUOUS block flow (SKILL.md) also writes an Open-questions entry as GAP does today (line 217), or skips that step since it's not really an ambiguity question. Spec §5 says only "GAP handling, with the new block reason VACUOUS" — doesn't clarify.
3. Exact insertion point for the new Fails-first checklist item in plan-format.md's validation checklist (253-277) — recommended after line 275 (end of Coverage items) based on spec-section ordering, but this is inference, not stated anywhere.

## Conflicts

None found between spec, Decisions, and current code — the current worker/run text simply doesn't yet mention Fails first/RED/VACUOUS at all, so there's nothing contradicting the change; only the two Unconfirmed placement ambiguities above.
