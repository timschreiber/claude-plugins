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

### D-0002 · Tie order

- **Question:** When two open todos have the same due date, in what order should `tally list` print them?
- **Answer:** Print open todos that share a due date in the order they were added. src/list.js already does this: it sorts by due date only, and JavaScript's sort is stable (guaranteed since ES2019, so in Node 20). Write the rule into docs/spec.md, covering the undated group too, and add a tie test with node:test. Write `tally add` so it appends to list.todos.
- **Rationale:** The spec is silent on ties, and the current code already keeps ties and the undated group in stored order. JSON keeps array order through saving (D-0001, RFC 8259), so one rule covers the whole listing with no new sort key and no choice of locale. This matches Taskwarrior, which breaks remaining ties with a stable sort; todo.txt's alphabetical default shows practice varies, and rung 1's argument about `tally done` numbering only partly holds because docs/spec.md:9 doesn't say whether n counts in display order.
- **Provenance:** oracle-unconfirmed
- **Confidence:** medium
- **Rung:** 2
- **Sources:** docs/spec.md:8; docs/spec.md:9; src/list.js:5; src/list.js:6; src/list.js:7; docs/decisions.md#D-0001; https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort; https://www.rfc-editor.org/rfc/rfc8259#section-1; https://github.com/GothenburgBitFactory/taskwarrior/blob/develop/src/sort.cpp; https://github.com/GothenburgBitFactory/taskwarrior/blob/develop/src/Context.cpp; https://github.com/GothenburgBitFactory/taskwarrior/blob/develop/ChangeLog; https://github.com/todotxt/todo.txt-cli/blob/master/todo.cfg
- **Assumptions:** `tally add` (not implemented yet) will append new todos to the end of list.todos, so stored order is the order they were added.; Users care more about same-date todos keeping a predictable place than about seeing them sorted by name.
- **Flags:** spec-silent
- **Question ID:** Q-0002
- **Context:** e2e-6
- **Date:** 2026-10-01
