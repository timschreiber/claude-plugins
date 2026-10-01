<!-- decidinator-sidecar v1 -->

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
- **Status:** imported
- **Answer:**

### Q-0003 · Equal due dates order

- **Question:** When two open todos have the same due date, in what order should `tally list` print them?
- **Context:** Writing the ordering tests for src/list.js.
- **Options:**
  - **Added:** Stable and predictable; matches the undated todos.
  - **Alphabetical:** Easier to scan, but reorders todos when their text changes.
- **Provisional answer:** In the order they were added.
- **Provisional decision:** D-0003
- **Depends on:** e2e-seed
- **Status:** imported
- **Answer:**
