<!-- decidinator-log v1 -->

### D-0001 · Storage format
- **Question:** Should tally store its lists in JSON or SQLite?
- **Answer:** JSON, in one file at ~/.tally.json.
- **Rationale:** No dependencies are allowed, and one small file is enough for personal todo lists.
- **Provenance:** user
- **Confidence:** none
- **Rung:** none
- **Sources:** docs/spec.md
- **Assumptions:** none
- **Question ID:** Q-0001
- **Context:** setup
- **Date:** 2026-09-30

### D-0002 · Free-plan list limit

- **Question:** How many lists should a free account be allowed to keep: 3 or 5?
- **Answer:** Five lists, held in one named constant.
- **Rationale:** Provisional: the product team sets the limit.
- **Provenance:** oracle-provisional
- **Confidence:** medium
- **Rung:** 1
- **Sources:** docs/spec.md
- **Assumptions:** none
- **Flags:** none
- **Question ID:** Q-0002
- **Context:** Implementing the free-plan list limit in tally add.
- **Date:** 2026-09-30
- **Sidecar:** Q-0002
- **Superseded by:** D-0004

### D-0003 · Equal due dates order

- **Question:** When two open todos have the same due date, in what order should `tally list` print them?
- **Answer:** In the order they were added.
- **Rationale:** A stable sort on the due date keeps insertion order, as the undated todos already do.
- **Provenance:** oracle-provisional
- **Confidence:** medium
- **Rung:** 1
- **Sources:** docs/spec.md; src/list.js
- **Assumptions:** none
- **Flags:** none
- **Question ID:** Q-0003
- **Context:** Writing the ordering tests for src/list.js.
- **Date:** 2026-09-30
- **Sidecar:** Q-0003
- **Superseded by:** D-0005

### D-0004 · Free-plan list limit

- **Question:** How many lists should a free account be allowed to keep: 3 or 5?
- **Answer:** five lists held in one named constant
- **Rationale:** Product team answered in docs/stakeholders.md.
- **Provenance:** stakeholder
- **Confidence:** none
- **Rung:** none
- **Sources:** none
- **Assumptions:** none
- **Flags:** none
- **Question ID:** Q-0002
- **Context:** Implementing the free-plan list limit in tally add.
- **Date:** 2026-10-01
- **Supersedes:** D-0002
- **Sidecar:** Q-0002

### D-0005 · Equal due dates order

- **Question:** When two open todos have the same due date, in what order should `tally list` print them?
- **Answer:** Alphabetically, by their text.
- **Rationale:** A stakeholder answered in docs/stakeholders.md.
- **Provenance:** stakeholder
- **Confidence:** none
- **Rung:** none
- **Sources:** none
- **Assumptions:** none
- **Flags:** none
- **Question ID:** Q-0003
- **Context:** Writing the ordering tests for src/list.js.
- **Date:** 2026-10-01
- **Supersedes:** D-0003
- **Sidecar:** Q-0003
