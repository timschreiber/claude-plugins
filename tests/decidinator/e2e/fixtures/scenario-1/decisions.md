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

### D-0002 · Test runner

- **Question:** Which test framework should tally's tests use?
- **Answer:** Use node:test, Node's built-in test runner, with node:assert/strict for assertions; tests go in test/ and npm test runs `node --test`.
- **Rationale:** docs/spec.md and CLAUDE.md both forbid runtime and development dependencies and require the tests to use only Node's built-in modules, which rules out Jest and Mocha. node:test is marked stable in Node's documentation as of v20.0.0, the project's minimum version, and `node --test` picks up the files in test/ by default.
- **Provenance:** oracle-unconfirmed
- **Confidence:** high
- **Rung:** 1
- **Sources:** docs/spec.md:17; docs/spec.md:18; CLAUDE.md; docs/decisions.md#D-0001; https://nodejs.org/docs/latest-v20.x/api/test.html
- **Assumptions:** none
- **Flags:** none
- **Question ID:** Q-0002
- **Context:** e2e-1
- **Date:** 2026-10-01
