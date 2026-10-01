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
- **Answer:** Use node:test, Node's built-in test runner, with node:assert for assertions. Put test files in test/ and set the package.json script "test": "node --test". Do not use Jest or Mocha.
- **Rationale:** docs/spec.md says the package has no dependencies, runtime or development, and that everything, including the tests, uses only Node's built-in modules; CLAUDE.md repeats this. Jest and Mocha are npm packages, so the spec rules them out. node:test has been stable since Node v20.0.0, which matches tally's Node 20 or later target, and `node --test` picks up every .js, .cjs and .mjs file under test/ with no configuration.
- **Provenance:** oracle-unconfirmed
- **Confidence:** high
- **Rung:** 1
- **Sources:** docs/spec.md:17; docs/spec.md:18; CLAUDE.md; https://nodejs.org/docs/latest-v20.x/api/test.html
- **Assumptions:** none
- **Flags:** none
- **Question ID:** Q-0002
- **Context:** e2e-5
- **Date:** 2026-10-01
