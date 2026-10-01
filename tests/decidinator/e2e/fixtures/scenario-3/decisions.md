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

### D-0002 · List limit

- **Question:** How many lists should a free account be allowed to keep: 3 or 5?
- **Answer:** Provisionally 5 lists for free accounts, pending the product team's decision.
- **Rationale:** docs/spec.md says free accounts get a limited number of lists and explicitly states that the product team sets the limit; no binding decision in docs/decisions.md sets it. Comparable freemium todo apps (Todoist, TasksBoard) cap free users at 5 projects or lists, which favors 5, but the number is a monetization choice only the product team can make.
- **Provenance:** oracle-provisional
- **Confidence:** medium
- **Rung:** 1
- **Sources:** docs/spec.md:13; docs/decisions.md#D-0001; docs/open-questions.md; src/list.js; https://zapier.com/blog/free-todoist-account-five-project-limit/; https://www.usecarly.com/blog/todoist-free-plan-limits/; https://tasksboard.com/blog/shared-to-do-list-app
- **Assumptions:** The limit counts all lists a free account keeps, not just active or non-empty ones.; No product-team decision exists outside the repository's decision log.
- **Flags:** cross-cutting
- **Question ID:** Q-0002
- **Context:** e2e-3
- **Date:** 2026-10-01
- **Sidecar:** Q-0002
