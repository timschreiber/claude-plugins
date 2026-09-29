# WP-03 · File formats library

```text
Work package WP-03 · File formats library
Spec: docs/decidinator-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/decidinator-spec.md in full, even if you have read them earlier in this session.

Goal: one library that reads and writes the decision log, the sidecar, and verdict blocks exactly as the spec defines them, so every hook and command shares a single implementation.

Depends on: WP-02 (complete).
Spec sections: Decision log; Questions sidecar; Oracle research (verdict block fields).

Scope:
- Decision log: parse, append an entry with the next D- ID, mark an entry superseded, and preserve hand edits and unknown lines when rewriting.
- Sidecar: parse, append an entry with the next Q- ID, add a Depends on label, set Status, and read filled Answer fields.
- Version markers: write them on file creation; refuse to write a file with a different major version, naming the file and version.
- Verdict block: extract the last fenced decidinator-verdict block from a reply, validate every field, and return the spec's fallback (unresolved, low) for a missing or invalid block, with the reason.
- Question normalization (case, whitespace, punctuation) and a stable hash, used for deduplication and gate matching.
- File writes are atomic (write to a temp file, then rename) and serialized with a lock file, since hooks can run close together.

Out of scope: deciding what to write; that belongs to the recorder and commands.

Acceptance criteria:
- Round-trip tests: parse then write leaves an unchanged file byte-for-byte, including a file with hand edits.
- Tests for each verdict field's validation, and for the fallback on a missing block, a malformed block, and two blocks (the last wins).
- A concurrency test: two simultaneous appends both land with distinct IDs.
- The version check refuses a v2 file.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
