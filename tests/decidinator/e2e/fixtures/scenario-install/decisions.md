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
- **Answer:** Use node:test, the test runner built into Node, with node:assert for assertions; put tests in test/ and run them with an npm test script of "node --test".
- **Rationale:** docs/spec.md and CLAUDE.md forbid all dependencies, development ones included, and say the tests must use only Node's built-in modules, which rules out Jest and Mocha. node:test has been Stable since Node v20.0.0, matching the project's Node 20+ requirement, and node --test runs every .js file under test/ by default.
- **Provenance:** oracle-unconfirmed
- **Confidence:** high
- **Rung:** 1
- **Sources:** docs/spec.md; CLAUDE.md; docs/decisions.md#D-0001; package.json; https://nodejs.org/docs/latest-v20.x/api/test.html
- **Assumptions:** none
- **Flags:** none
- **Question ID:** Q-0002
- **Context:** session 652e060f-8b25-455d-af7e-dcdced44ae8e on master
- **Date:** 2026-10-01
