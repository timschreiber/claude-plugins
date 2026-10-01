<!-- decidinator-sidecar v1 -->

# Open questions

Exported 2026-10-01 from docs/open-questions.md: 2 open questions. Write each answer after "Answer:", on that line or the lines below it, and send this file back. Leave an Answer blank to skip that question.

## Stakeholder: Product team

### Q-0002 · Free-plan list limit

- **Question:** How many lists should a free account be allowed to keep: 3 or 5?
- **Context:** Implementing the free-plan list limit in tally add.
- **Options:**
  - **3 lists:** Pushes more users to paid plans sooner.
  - **5 lists:** A friendlier free tier, with fewer upgrades.
- **Provisional answer:** Five lists, held in one named constant.
- **Provisional decision:** D-0002
- **Depends on:** e2e-seed
- **Stakeholder:** Product team
- **Status:** open
- **Answer:** five lists held in one named constant

## Topic: Equal due dates order

### Q-0003 · Equal due dates order

- **Question:** When two open todos have the same due date, in what order should `tally list` print them?
- **Context:** Writing the ordering tests for src/list.js.
- **Options:**
  - **Added:** Stable and predictable; matches the undated todos.
  - **Alphabetical:** Easier to scan, but reorders todos when their text changes.
- **Provisional answer:** In the order they were added.
- **Provisional decision:** D-0003
- **Depends on:** e2e-seed
- **Status:** open
- **Answer:** Alphabetically, by their text.
