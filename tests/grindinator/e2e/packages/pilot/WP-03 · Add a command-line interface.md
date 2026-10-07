# WP-03 · Add a command-line interface

Add `bin/textkit.js`, a command-line interface over the library, and `"bin": { "textkit": "bin/textkit.js" }` in `package.json`. This package depends on WP-01 (`src/slug.js`) and WP-02 (`src/wrap.js`).

Commands:

- `textkit count [file ...]` prints the word count, from `wordCount`, of each file, or of standard input when no file is given.
- `textkit slug <text ...>` joins its arguments with spaces and prints `slugify` of the result.
- `textkit wrap --width <n> [file ...]` prints `wrap` of each file's text, or of standard input, at the given width. `--width` is required.
- `textkit --help` and `textkit help` print a usage text to standard output and exit 0.

Exit codes: 0 on success; 1 when a file cannot be read, after printing `textkit: cannot read <file>` to standard error and going on with the other files; 2 for a usage error (an unknown command, a missing or invalid `--width`, `slug` with no text), after printing the error and the usage text to standard error. Parse arguments with `parseArgs` from `node:util`; no dependencies.

Two behaviors are left open, and `docs/spec.md` does not settle them: what `count` prints when it is given more than one file (one count per file, a total, or both, and in what format), and whether `wrap` separates the output of several files with a blank line. Treat both as open decisions: resolve them the way your session's instructions say open decisions are resolved, not by choosing yourself, then implement and test the answers.

Test the CLI in `test/cli.test.js` by spawning `process.execPath` with `bin/textkit.js`: every command, standard input, `--help`, each exit code, and an unreadable file. Document the commands in `docs/spec.md`.

Acceptance: `node --test` passes.
