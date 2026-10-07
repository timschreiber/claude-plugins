# WP-01 · Add a greeting

Add `src/greet.js`, exporting `greet(name)`, which returns `Hello, <name>!` for a non-empty string: `greet('Ada')` returns `Hello, Ada!`. A non-string name throws a `TypeError`, as `docs/spec.md` requires. Test it in `test/greet.test.js` with `node:test`, and add the module to the Modules list in `docs/spec.md`.

One behavior is deliberately left open: what `greet('')` does with the empty string. It could return `Hello, world!`, return `Hello, !`, or throw a `RangeError`. Neither this package nor `docs/spec.md` decides it. Treat it as an open decision: resolve it the way your session's instructions say open decisions are resolved, not by choosing yourself, then implement and test the answer.

Acceptance: `node --test` passes, and `docs/spec.md` states the empty-name behavior.
