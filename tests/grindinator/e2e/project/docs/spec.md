# textkit: specification

`textkit` collects small, pure text functions. Each lives in its own module in `src/` and is tested in `test/`.

## Modules

- `src/words.js`: `wordCount(text)` returns the number of words in a string, where a word is a run of non-whitespace characters.

Work packages add further modules; each package states its own requirements.

## Constraints

- No dependencies. Everything, including the tests, uses only Node's built-in modules (`node:test`, `node:assert`).
- A function throws a `TypeError` when an argument has the wrong type.
