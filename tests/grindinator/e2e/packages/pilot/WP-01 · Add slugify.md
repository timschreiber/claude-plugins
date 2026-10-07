# WP-01 · Add slugify

Add `src/slug.js`, exporting `slugify(text)`, which turns a title into a URL slug:

- Lowercase the text.
- Every run of characters other than `a` to `z` and `0` to `9` becomes a single `-`.
- Remove any `-` at the start or end.
- A non-string throws a `TypeError`.

Examples: `slugify('Hello, World!')` is `hello-world`; `slugify('  Node 20 -- ready ')` is `node-20-ready`; `slugify('!!!')` is the empty string.

Test every rule and example in `test/slug.test.js`, and add the module to the Modules list in `docs/spec.md`.

Acceptance: `node --test` passes.
