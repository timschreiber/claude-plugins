# M04: Change 3: Fails first (spec §5, §12)

- Status: in-progress
- Goal: Format 2 tasks carry `- Fails first: yes | no`. Workers write tests first and confirm Verify fails before implementing, and report a RED line in the combined report format. `run` handles `RED: CONFIRMED`, `PASSED-EARLY` (block reason `VACUOUS`), and missing or `N/A` (Retry). The README describes it.
- Depends on: M03
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1`

## Context

- Governing source: `docs/orchestratinator-robustness-spec.md` §5 and §12, plus D01, D08, D16, D17, D20, D29, D30, D31 in plan.md.
- The files under `plugins/orchestratinator/` are the plugin being changed, not the format this plan is written in (D16). This milestone file gets no Coverage section. Never modify Change 0 text (D17): in the worker agents, the precedence-rule line and `The orchestrator commits your work. If you commit, your work can be lost.`; in `run`, 3d step 2 and the first bullet of 3e step 3 (the stray-commit checks) and the `PUSHED` Stop reason.
- Insert the text in each Step exactly as written, character for character, including backticks, asterisks, arrows (`→`), em dashes (`—`), and section signs (`§`). Change nothing else in the file: no rewording, no reformatting, no other lines. When a Step says "insert a new line after X", the new line goes on its own line directly below X, with no blank line between them unless the Step says so.
- Don't touch `agents/planner.md`, `agents/reviewer.md`, `skills/plan/SKILL.md`, the README's cast table, or anything about Review Focus, reviews, batching, or assumptions (later milestones). The plan-reviewer's Fails first check belongs to M07.
- Every task edits a different file, so all seven run in one wave.

Waves: 1 (widths 7)

## Tasks

### M04-T01: Define Fails first in the plan format

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/reference/plan-format.md`
- Verify: `grep -qF -e "- Fails first: yes" plugins/orchestratinator/reference/plan-format.md && grep -qF "| Fails first | Format 2 milestones only." plugins/orchestratinator/reference/plan-format.md && grep -qF "REVIEW | VACUOUS — <one line>" plugins/orchestratinator/reference/plan-format.md && grep -qF "task has a Fails first line directly after Verify" plugins/orchestratinator/reference/plan-format.md && grep -qF 'then the step "Run Verify and confirm it fails", then its implementation Steps' plugins/orchestratinator/reference/plan-format.md`
- Commit: `feat(orchestratinator): define Fails first in the plan format`

**Objective**

`plan-format.md` shows `- Fails first:` in the task template, defines it in a Task fields row, lists `VACUOUS` among the block reasons, and has two new validation checklist items.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §5, from "**Plan format.**" through the end of the "**Workers.**" paragraph (the requirement this task implements)
- plan.md Decisions D08 and D30

**Steps**

1. In `plugins/orchestratinator/reference/plan-format.md`, in the milestone file template (the code block under `## Milestone file`), find the line ``- Verify: `<targeted, quiet command>` ``. Directly after it (before the `- Commit:` line), insert this line:

   ```
   - Fails first: yes
   ```
2. In the `### Task fields` table, find the row that begins `| Verify |`. Directly after it (before the row that begins `| Commit |`), insert this row as one line:

   ```
   | Fails first | Format 2 milestones only. Required in every `change` task, directly after Verify; `investigate` tasks omit it. `yes` for any task that adds or changes tests: its Steps put the test-writing steps first, then the step "Run Verify and confirm it fails", then the implementation steps. The worker runs Verify after writing the tests and confirms it fails before writing any implementation code. If Verify passes early, either the test can't fail or the behavior already exists, and both mean the plan is wrong: the worker stops, and run blocks the task as `VACUOUS`. `no` for a task with no test that can fail beforehand (docs, config, pure renames, refactors covered by passing tests), always with a one-line reason: `- Fails first: no (<reason>)`. A task whose Verify is `review` alone is always `no`. A task in a format 1 milestone has no Fails first field and is handled as `no`. |
   ```
3. Find the line ``- `- Blocked: GAP | STUCK | SCOPE | VERIFY | REVIEW — <one line>` ``. In that line only, change `REVIEW — <one line>` to `REVIEW | VACUOUS — <one line>`.
4. In `## Validation checklist`, find the line `- [ ] Every task ID in a Coverage row exists. *(format 2)*`. Directly after it (before the blank line and the sentence that begins `Items marked *(format 2)*`), insert these two lines:

   ```
   - [ ] Every `change` task has a Fails first line directly after Verify, either `yes` or `no (<reason>)` with a one-line reason, and no `investigate` task has one. *(format 2)*
   - [ ] Every task that adds or changes tests has `Fails first: yes`, with its test-writing Steps first, then the step "Run Verify and confirm it fails", then its implementation Steps; every task whose Verify is `review` alone has `no`. *(format 2)*
   ```

**Done when**

- The template's task block has `- Fails first: yes` between its `- Verify:` and `- Commit:` lines.
- The Task fields table has the `Fails first` row between the `Verify` and `Commit` rows.
- The `- Blocked:` line lists `VACUOUS` after `REVIEW`.
- The two checklist items sit directly after the `Every task ID in a Coverage row exists.` item, and the `Items marked *(format 2)*` sentence still follows the checklist after one blank line.
- No other line in the file changed.

### M04-T02: worker confirms the test fails first and reports RED

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/worker.md`
- Verify: `grep -qF "and confirm it fails, before you write any implementation code." plugins/orchestratinator/agents/worker.md && grep -qF "or stopping before you ran Verify), report" plugins/orchestratinator/agents/worker.md && grep -qF "RED: CONFIRMED <first failing line> | PASSED-EARLY | N/A" plugins/orchestratinator/agents/worker.md && ! grep -qF "the exact question that needs an answer" plugins/orchestratinator/agents/worker.md`
- Commit: `feat(orchestratinator): worker confirms the test fails first`

**Objective**

`agents/worker.md` has the Fails first rules and replies with spec §12's combined report, which includes the RED line.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §5, the "**Workers.**" paragraph, and §12 (the requirements this task implements)
- plan.md Decision D29

**Steps**

1. In `plugins/orchestratinator/agents/worker.md`, under `## Rules`, find the line `- Never delete, skip, or weaken a test to get a pass.`. Directly after it, insert these two lines:

   ```
   - If the task has `- Fails first: yes`: do its test-writing Steps first, then run the Verify command and confirm it fails, before you write any implementation code. Report `RED: CONFIRMED <first failing line>`, quoting the first failing line of Verify's output. If Verify passes before you have written implementation code, stop: either the test can't fail or the behavior already exists, and both mean the plan is wrong. Report `BLOCKED` / `GAP` with `RED: PASSED-EARLY`, and say in NOTE which check passed early.
   - In every other case (`- Fails first: no`, no Fails first line, or stopping before you ran Verify), report `RED: N/A`.
   ```
2. Under `## Report`, inside the code block, replace the five lines from `STATUS: DONE | BLOCKED` through the line that begins `NOTE:` with these six lines (the opening and closing fences stay):

   ```
   STATUS: DONE | BLOCKED
   REASON: GAP | STUCK | -
   FILES: <comma-separated paths changed or created>
   VERIFY: PASS | FAIL | NOT RUN | REVIEW ONLY
   RED: CONFIRMED <first failing line> | PASSED-EARLY | N/A
   NOTE: <one line. For GAP, the exact question.>
   ```

**Done when**

- The two new rules sit directly after the `Never delete, skip, or weaken a test` rule.
- The Report code block holds exactly the six lines from Step 2.
- The frontmatter, the Change 0 lines, and every other line are unchanged.

### M04-T03: worker-light confirms the test fails first and reports RED

- Kind: change
- Tier: worker-light
- Status: done
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/worker-light.md`
- Verify: `grep -qF "and confirm it fails, before you write any implementation code." plugins/orchestratinator/agents/worker-light.md && grep -qF "or stopping before you ran Verify), report" plugins/orchestratinator/agents/worker-light.md && grep -qF "RED: CONFIRMED <first failing line> | PASSED-EARLY | N/A" plugins/orchestratinator/agents/worker-light.md && ! grep -qF "the exact question that needs an answer" plugins/orchestratinator/agents/worker-light.md`
- Commit: `feat(orchestratinator): worker-light confirms the test fails first`

**Objective**

`agents/worker-light.md` has the Fails first rules and replies with spec §12's combined report, which includes the RED line.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §5, the "**Workers.**" paragraph, and §12 (the requirements this task implements)
- plan.md Decision D29

**Steps**

1. In `plugins/orchestratinator/agents/worker-light.md`, under `## Rules`, find the line `- Never delete, skip, or weaken a test to get a pass.`. Directly after it, insert these two lines:

   ```
   - If the task has `- Fails first: yes`: do its test-writing Steps first, then run the Verify command and confirm it fails, before you write any implementation code. Report `RED: CONFIRMED <first failing line>`, quoting the first failing line of Verify's output. If Verify passes before you have written implementation code, stop: either the test can't fail or the behavior already exists, and both mean the plan is wrong. Report `BLOCKED` / `GAP` with `RED: PASSED-EARLY`, and say in NOTE which check passed early.
   - In every other case (`- Fails first: no`, no Fails first line, or stopping before you ran Verify), report `RED: N/A`.
   ```
2. Under `## Report`, inside the code block, replace the five lines from `STATUS: DONE | BLOCKED` through the line that begins `NOTE:` with these six lines (the opening and closing fences stay):

   ```
   STATUS: DONE | BLOCKED
   REASON: GAP | STUCK | -
   FILES: <comma-separated paths changed or created>
   VERIFY: PASS | FAIL | NOT RUN | REVIEW ONLY
   RED: CONFIRMED <first failing line> | PASSED-EARLY | N/A
   NOTE: <one line. For GAP, the exact question.>
   ```

**Done when**

- The two new rules sit directly after the `Never delete, skip, or weaken a test` rule.
- The Report code block holds exactly the six lines from Step 2.
- The frontmatter, the Change 0 lines, and every other line are unchanged.

### M04-T04: worker-heavy confirms the test fails first and reports RED

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/worker-heavy.md`
- Verify: `grep -qF "and confirm it fails, before you write any implementation code." plugins/orchestratinator/agents/worker-heavy.md && grep -qF "or stopping before you ran Verify), report" plugins/orchestratinator/agents/worker-heavy.md && grep -qF "RED: CONFIRMED <first failing line> | PASSED-EARLY | N/A" plugins/orchestratinator/agents/worker-heavy.md && ! grep -qF "the exact question that needs an answer" plugins/orchestratinator/agents/worker-heavy.md`
- Commit: `feat(orchestratinator): worker-heavy confirms the test fails first`

**Objective**

`agents/worker-heavy.md` has the Fails first rules and replies with spec §12's combined report, which includes the RED line.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §5, the "**Workers.**" paragraph, and §12 (the requirements this task implements)
- plan.md Decision D29

**Steps**

1. In `plugins/orchestratinator/agents/worker-heavy.md`, under `## Rules`, find the line `- Never delete, skip, or weaken a test to get a pass.`. Directly after it, insert these two lines:

   ```
   - If the task has `- Fails first: yes`: do its test-writing Steps first, then run the Verify command and confirm it fails, before you write any implementation code. Report `RED: CONFIRMED <first failing line>`, quoting the first failing line of Verify's output. If Verify passes before you have written implementation code, stop: either the test can't fail or the behavior already exists, and both mean the plan is wrong. Report `BLOCKED` / `GAP` with `RED: PASSED-EARLY`, and say in NOTE which check passed early.
   - In every other case (`- Fails first: no`, no Fails first line, or stopping before you ran Verify), report `RED: N/A`.
   ```
2. Under `## Report`, inside the code block, replace the five lines from `STATUS: DONE | BLOCKED` through the line that begins `NOTE:` with these six lines (the opening and closing fences stay):

   ```
   STATUS: DONE | BLOCKED
   REASON: GAP | STUCK | -
   FILES: <comma-separated paths changed or created>
   VERIFY: PASS | FAIL | NOT RUN | REVIEW ONLY
   RED: CONFIRMED <first failing line> | PASSED-EARLY | N/A
   NOTE: <one line. For GAP, the exact question.>
   ```

**Done when**

- The two new rules sit directly after the `Never delete, skip, or weaken a test` rule.
- The Report code block holds exactly the six lines from Step 2.
- The frontmatter, the Change 0 lines, and every other line are unchanged.

### M04-T05: specialist confirms the test fails first and reports RED

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/agents/specialist.md`
- Verify: `grep -qF "and confirm it fails, before you write any implementation code." plugins/orchestratinator/agents/specialist.md && grep -qF "or stopping before you ran Verify), report" plugins/orchestratinator/agents/specialist.md && grep -qF "RED: CONFIRMED <first failing line> | PASSED-EARLY | N/A" plugins/orchestratinator/agents/specialist.md && ! grep -qF "the exact question that needs an answer" plugins/orchestratinator/agents/specialist.md`
- Commit: `feat(orchestratinator): specialist confirms the test fails first`

**Objective**

`agents/specialist.md` has the Fails first rules and replies with spec §12's combined report, which includes the RED line.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §5, the "**Workers.**" paragraph, and §12 (the requirements this task implements)
- plan.md Decision D29

**Steps**

1. In `plugins/orchestratinator/agents/specialist.md`, under `## Rules`, find the line `- Never delete, skip, or weaken a test to get a pass.`. Directly after it, insert these two lines:

   ```
   - If the task has `- Fails first: yes`: do its test-writing Steps first, then run the Verify command and confirm it fails, before you write any implementation code. Report `RED: CONFIRMED <first failing line>`, quoting the first failing line of Verify's output. If Verify passes before you have written implementation code, stop: either the test can't fail or the behavior already exists, and both mean the plan is wrong. Report `BLOCKED` / `GAP` with `RED: PASSED-EARLY`, and say in NOTE which check passed early.
   - In every other case (`- Fails first: no`, no Fails first line, or stopping before you ran Verify), report `RED: N/A`.
   ```
2. Under `## Report`, inside the code block, replace the five lines from `STATUS: DONE | BLOCKED` through the line that begins `NOTE:` with these six lines (the opening and closing fences stay):

   ```
   STATUS: DONE | BLOCKED
   REASON: GAP | STUCK | -
   FILES: <comma-separated paths changed or created>
   VERIFY: PASS | FAIL | NOT RUN | REVIEW ONLY
   RED: CONFIRMED <first failing line> | PASSED-EARLY | N/A
   NOTE: <one line. For GAP, the exact question.>
   ```

**Done when**

- The two new rules sit directly after the `Never delete, skip, or weaken a test` rule, and the specialist's last rule (`- You may use judgment on implementation details ...`) is still the last line of `## Rules`.
- The Report code block holds exactly the six lines from Step 2.
- The frontmatter, the Change 0 lines, and every other line are unchanged.

### M04-T06: run handles the RED line and the VACUOUS block

- Kind: change
- Tier: worker
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/skills/run/SKILL.md`
- Verify: `grep -qE "For a task with .- Fails first: yes., check RED first:" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "skips the RED check. Then, for every task, read STATUS:" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "record it for **Block with GAP**, with block reason" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "queue a **Retry**, with the reason" plugins/orchestratinator/skills/run/SKILL.md && grep -qE -e "- Any other .BLOCKED. / .GAP. " plugins/orchestratinator/skills/run/SKILL.md && grep -qE -e "- Any other .DONE. " plugins/orchestratinator/skills/run/SKILL.md && grep -qF 'Verify failed", or "RED not confirmed (Fails first: yes)"' plugins/orchestratinator/skills/run/SKILL.md && grep -qF "Verify passed before implementation: <worker" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "REVIEW, VACUOUS, MERGE" plugins/orchestratinator/skills/run/SKILL.md && grep -qF "For a GAP or VACUOUS, quote the question exactly." plugins/orchestratinator/skills/run/SKILL.md`
- Commit: `feat(orchestratinator): run checks the RED line and blocks vacuous tests`

**Objective**

`run` reads the RED line of every `Fails first: yes` task in both serial (3d) and parallel (3e) waves, blocks `PASSED-EARLY` as `VACUOUS` with GAP handling, retries a `DONE` with a missing or `N/A` RED line, and lists `VACUOUS` among the Stop reasons.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §5, the "**`run` skill.**" paragraph (the requirement this task implements)
- plan.md Decisions D20, D30, D31

**Steps**

1. In `plugins/orchestratinator/skills/run/SKILL.md`, under `### 3d. Serial wave`, replace these four lines (step 3):

   ```
   3. **Read the report** (`STATUS`, `REASON`, `FILES`, `VERIFY`, `NOTE`):
      - `BLOCKED` / `GAP` → **Block with GAP** (see below).
      - `BLOCKED` / `STUCK` → **Retry**.
      - `DONE` → continue.
   ```

   with these nine lines (the blank line in the middle is part of them; step 4 still follows directly after the last line):

   ```
   3. **Read the report** (`STATUS`, `REASON`, `FILES`, `VERIFY`, `RED`, `NOTE`). For a task with `- Fails first: yes`, check RED first:
      - `RED: PASSED-EARLY` → **Block with GAP** (see below), with block reason `VACUOUS`.
      - `DONE` with the RED line missing or `N/A` → **Retry**, with the reason `RED not confirmed (Fails first: yes)`.
      - Otherwise (`RED: CONFIRMED <first failing line>`, or a `BLOCKED` report with RED missing or `N/A`) → go on to STATUS.

      A task without `- Fails first: yes` (Fails first `no`, or no Fails first line, as in format 1 milestones and `investigate` tasks) skips the RED check. Then, for every task, read STATUS:
      - `BLOCKED` / `GAP` → **Block with GAP** (see below).
      - `BLOCKED` / `STUCK` → **Retry**.
      - `DONE` → continue.
   ```
2. Under `### 3e. Parallel wave`, in step 3, find the line ``   - `BLOCKED` / `GAP` → record it for **Block with GAP**. Leave its worktree for inspection.``. Directly before it (after the bullet that begins `   - First, in that worktree, apply the same stray-commit`, which stays unchanged), insert these two lines:

   ```
      - `RED: PASSED-EARLY` on a task with `- Fails first: yes` → record it for **Block with GAP**, with block reason `VACUOUS`. Leave its worktree for inspection.
      - `DONE` on a task with `- Fails first: yes`, with the RED line missing or `N/A` → queue a **Retry**, with the reason `RED not confirmed (Fails first: yes)`.
   ```
3. In the same 3e step 3, in the line ``   - `BLOCKED` / `GAP` → record it for **Block with GAP**. Leave its worktree for inspection.``, change ``- `BLOCKED` / `GAP` →`` to ``- Any other `BLOCKED` / `GAP` →``. Don't change the 3d line that begins ``   - `BLOCKED` / `GAP` → **Block with GAP**``.
4. In the same 3e step 3, in the line that begins ``   - `DONE` → check scope with``, change ``- `DONE` → check scope with`` to ``- Any other `DONE` → check scope with``. The rest of that line stays unchanged.
5. Under `## Retry`, in the line ``  Reason: <worker's NOTE, reviewer's REASONS, or "Verify failed">``, change `<worker's NOTE, reviewer's REASONS, or "Verify failed">` to `<worker's NOTE, reviewer's REASONS, "Verify failed", or "RED not confirmed (Fails first: yes)">`.
6. Under `## Block with GAP`, after the paragraph that begins `The plan left a decision open.`, insert one blank line followed by this paragraph as one line (the existing blank line and `## Pause` stay below it):

   ```
   A `RED: PASSED-EARLY` report on a task with `- Fails first: yes` gets the same handling, with block reason `VACUOUS` instead of `GAP`: the test passed before any implementation existed, so either it can't fail or the behavior already exists, and both mean the plan is wrong. Never retry or escalate it. Mark the task `blocked` with `- Blocked: VACUOUS — <worker's NOTE>`, add `Verify passed before implementation: <worker's NOTE>` to plan.md's Open questions tagged with the task ID, and stop exactly as for a GAP.
   ```
7. Under `## Stop`, in the line that begins `2. Report: where, the reason`, change `(GAP, STUCK, SCOPE, VERIFY, REVIEW, MERGE, STRAY, PUSHED, SETUP, VALIDATION)` to `(GAP, STUCK, SCOPE, VERIFY, REVIEW, VACUOUS, MERGE, STRAY, PUSHED, SETUP, VALIDATION)`, and change `For a GAP, quote the question exactly.` to `For a GAP or VACUOUS, quote the question exactly.`

**Done when**

- 3d step 3 is the nine lines from Step 1, and 3d steps 1, 2, 4, 5, and 6 are unchanged.
- 3e step 3's bullets read, in order: the unchanged stray-commit bullet, the two new bullets, `Any other BLOCKED / GAP`, the unchanged `BLOCKED / STUCK` bullet, and `Any other DONE`.
- The Retry reason line lists the four alternatives from Step 5; the Retry section is otherwise unchanged.
- `## Block with GAP` has the original paragraph, one blank line, then the new `VACUOUS` paragraph.
- The Stop reasons list has `VACUOUS` after `REVIEW`, and `PUSHED` is still in it.
- No other line in the file changed.

### M04-T07: README describes Fails first

- Kind: change
- Tier: worker-light
- Status: todo
- Wave: 1
- Depends on: none
- Files: `plugins/orchestratinator/README.md`
- Verify: `grep -qF -e "- **Fails first.** " plugins/orchestratinator/README.md`
- Commit: `docs(orchestratinator): describe Fails first in the README`

**Objective**

The README's "What a plan contains" list has a Fails first bullet.

**Read first**

- `docs/orchestratinator-robustness-spec.md` §5 (the feature the bullet describes)

**Steps**

1. In `plugins/orchestratinator/README.md`, under `### What a plan contains`, find the bullet that begins `- **Coverage.**`. Directly after it, insert this bullet as a new line (before the bullet that begins `- **Sequence and parallelism.**`):

   ```
   - **Fails first.** Every task that adds or changes tests is marked `Fails first: yes`: its Steps write the tests first, then run Verify and confirm it fails, then implement, and the worker reports the first failing line as proof. A test that passes before any implementation exists proves nothing: either it can't fail or the behavior already exists, and both mean the plan is wrong, so the run stops with `VACUOUS` and asks you instead of retrying. A worker that reports done without confirming the failure gets a retry. Tasks with no test that can fail beforehand (docs, config, pure renames, refactors covered by passing tests) are `Fails first: no`, with a one-line reason.
   ```

**Done when**

- The Fails first bullet sits between the `Coverage` and `Sequence and parallelism` bullets.
- No other line in the file changed.
