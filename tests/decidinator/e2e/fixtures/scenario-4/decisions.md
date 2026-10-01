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
- **Answer:** Provisionally 3 lists for free accounts, pending a decision by the product team, which the spec names as the owner of this limit.
- **Rationale:** docs/spec.md (Plans) says free accounts get a limited number of lists and that the product team sets the limit, so this is a product and pricing decision that research cannot settle. Neither the decision log nor the code sets a number. 3 is the more conservative provisional choice because raising a free-tier cap later is easier for users to accept than lowering it.
- **Provenance:** oracle-provisional
- **Confidence:** medium
- **Rung:** 1
- **Sources:** docs/spec.md; docs/decisions.md; docs/open-questions.md; src/list.js
- **Assumptions:** The limit counts lists per account, including lists created implicitly by `tally add`.; Choosing the number is up to the product team, as docs/spec.md says, and no product-team decision exists outside the repo.
- **Flags:** spec-silent; cross-cutting
- **Question ID:** Q-0002
- **Context:** e2e-4
- **Date:** 2026-10-01
- **Sidecar:** Q-0002
