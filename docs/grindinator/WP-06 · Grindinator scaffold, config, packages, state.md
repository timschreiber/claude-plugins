# WP-06 · Grindinator scaffold, config, packages, state

```text
Work package WP-06 · Grindinator scaffold, config, packages, state
Spec: docs/grindinator/Grindinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/grindinator/Grindinator — Specification.md in full, even if you have read them earlier in this session. Also read the decidinator plugin's scaffold, configuration loader and CLAUDE.md as the convention reference.

Goal: a standalone Grindinator CLI that discovers work packages, loads configuration, checks Git preconditions, and keeps resumable state, without launching Claude yet.

Depends on: WP-01.
Spec sections: Runner contract (Git and state, Runner exit codes); Component requirements (R-G1, R-G2, R-G4); Repository layout.

Scope:
- A standalone tool at `tools/grindinator/`, not a plugin: no plugin manifest, no skill, and no `marketplace.json` entry. It has a `package.json` with a `bin` entry for a Node 20 CLI (`bin/grindinator`) and follows the repo's Node and test conventions.
- Modules for configuration (defaults, `~/.claude/grindinator.json`, `.claude/grindinator.json`, flags, with every key validated and named in errors), package discovery (`WP-NN · Title.md`, filename order, optional preamble file), and state (`state.json`, `done/<id>.done`, atomic writes).
- Git helpers: refuse a dirty tree (exit 2), create `grindinator/<run name>`, add `.grindinator/` to `.git/info/exclude`.
- Commands: `run` (stops after preconditions in this package), `status`, and `reset <id>` to clear one package's marker.
- A stub `claude` executable in `tests/grindinator/fixtures/`, used by all later runner tests and selected by `GRINDINATOR_CLAUDE_BIN`.

Out of scope: launching sessions, gates, limit handling, Decidinator integration, and any plugin packaging.

Acceptance criteria:
- Tests cover configuration precedence, an invalid key (rejected with the key named), discovery order, atomic state writes, a dirty tree giving exit 2, branch creation, and a re-run skipping done markers.
- `status` prints one row per package with its state.
- `npm link` in `tools/grindinator/` puts `grindinator` on the PATH, `grindinator --help` runs, and `node --test tests/grindinator/*.test.js` passes.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
