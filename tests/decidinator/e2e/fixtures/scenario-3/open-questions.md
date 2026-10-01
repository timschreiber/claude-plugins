<!-- decidinator-sidecar v1 -->

### Q-0002 · List limit

- **Question:** How many lists should a free account be allowed to keep: 3 or 5?
- **Context:** Testing the Decidinator plugin in the `tally` repo (a Node 20 command-line todo list, no dependencies, source in src/, tests in test/; docs/spec.md describes the product). No files are being edited. The question came up as a scripted test: the free-account list limit needs settling before anything else proceeds.
- **Options:**
  - **3 lists:** Pushes free users to upgrade sooner, which may raise conversion; it feels tight for common setups (work, personal, shopping, and so on) and is stricter than competitors like Todoist, so users may leave.
  - **5 lists:** Matches common practice (Todoist free plan, TasksBoard) and covers most personal use; fewer free users hit the cap, so upgrades may come more slowly.
- **Provisional answer:** Provisionally 5 lists for free accounts, pending the product team's decision.
- **Provisional decision:** D-0002
- **Depends on:** e2e-3
- **Status:** open
- **Answer:**
