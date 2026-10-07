# WP-02 · Add word wrapping

Add `src/wrap.js`, exporting `wrap(text, width)`, which wraps text to lines of at most `width` characters and returns the result as one string, its lines joined with `\n`.

- Words are runs of non-whitespace characters, as in `src/words.js`. Lines are filled greedily: a word goes on the current line if the line, one space and the word fit within `width`; otherwise it starts a new line.
- A word longer than `width` stands alone on its own line and is not broken.
- Paragraphs are separated by one or more blank lines in the input. Each paragraph is wrapped on its own, and the output separates paragraphs with exactly one blank line. Any other whitespace inside a paragraph, including a single newline, is a word break.
- Leading and trailing blank lines are dropped; an empty or blank text returns the empty string.
- A non-string `text` throws a `TypeError`; a `width` that is not an integer of at least 1 throws a `RangeError`.

Test each rule in `test/wrap.test.js`, including a word exactly `width` long, a word longer than `width`, three paragraphs, and Windows line endings (`\r\n`) in the input. Add the module to the Modules list in `docs/spec.md`.

Acceptance: `node --test` passes.
