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
- **Answer:** Added: open todos with the same due date print in the order they were added, which is what src/list.js already does because Array.prototype.sort keeps equal items in their original order in Node 20; tally add must append new todos to the end, and a test should pin this order.
- **Rationale:** The spec sets only the main order (due date first, undated last) and says nothing about ties. The current code already keeps the stored order for both same-date and undated todos, and Taskwarrior likewise falls back to the original order, whereas todo.txt-cli's alphabetical sort is its main order rather than a tie-break. Rung 1's argument that numbers for `tally done` would not shift rests on an unconfirmed reading of spec.md:9 and is minor; the deciding points are no code change, one rule for the whole list, and no new case or locale questions.
- **Provenance:** oracle-unconfirmed
- **Confidence:** medium
- **Rung:** 2
- **Sources:** docs/spec.md:8; docs/spec.md:9; src/list.js:6; src/list.js:7; docs/decisions.md#D-0001; https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort; https://v8.dev/features/stable-sort; https://github.com/GothenburgBitFactory/taskwarrior/blob/develop/src/sort.cpp; https://github.com/GothenburgBitFactory/taskwarrior/blob/develop/src/Context.cpp; https://github.com/todotxt/todo.txt-cli/blob/master/todo.sh
- **Assumptions:** tally add, not yet written, appends new todos to the end of list.todos, so the stored order is the order todos were added.; No other command reorders list.todos, for example, tally done marks a todo done where it is instead of moving it.; No product preference for alphabetical order exists outside the project documents.
- **Flags:** spec-silent; cross-cutting
- **Question ID:** Q-0002
- **Context:** e2e-6
- **Date:** 2026-10-01
