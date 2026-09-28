# Plan: notes.md from quote.txt, README heading update

## Context

The repo (`tier-sidecar`) has two staged files: `README.md` (one line, `# Sidecar test` + CRLF) and
`quote.txt` (5000 bytes, a single line with no trailing newline: the 16-word NATO phrase
"alpha … papa" repeated 51 times, followed by the fragment `al`; 817 words). The user wants:

- **T01** — a new `notes.md` whose content is exactly the text of `quote.txt`. Per the user, the
  task prompt carries the full quote text verbatim on one line (not a file reference). The worker
  writes it with no trailing newline so the file is byte-identical to `quote.txt`.
- **T02** — change the README heading line from `# Sidecar test` to `# Sidecar test (see notes.md)`.
  The match `# Sidecar test` occurs exactly once in `README.md` (the file's only line); the CRLF
  ending is left untouched.

## Verification

- T01: `cmp quote.txt notes.md` exits 0 (byte-identical, 5000 bytes).
- T02: `grep -cx '# Sidecar test (see notes.md)' <(tr -d '\r' < README.md)` prints `1`.

## Tasks

<!-- planandtier:tasks -->
Tasks file: `C:\Users\timsc\.claude\plans\plan-two-tasks-t01-glimmering-leaf.tasks.json` (sha256 `899932a0de2b3a06`)

| ID | Title | Model | Effort | Prompt |
|---|---|---|---|---|
| T01 | Create notes.md containing exactly the quote text | sonnet | medium | 5,757 chars |
| T02 | Change README heading to '# Sidecar test (see notes.md)' | sonnet | low | 413 chars |

Open the tasks file to read each prompt before approving.
<!-- /planandtier:tasks -->
