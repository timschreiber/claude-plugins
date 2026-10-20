# WP-04 · Approval table and planner rules

```text
Work package WP-04 · Approval table and planner rules
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read plugins/tierminator/scripts/lib/tasks.js (renderSection), plugins/tierminator/rules/tiering.md, plugins/tierminator/scripts/h1-plan-rules.js and the tests that cover them.

Goal: the plan shown for approval lists waves, dependencies, setup and verify, and the planner is taught when and how to declare independent tasks.

Depends on: WP-03.
Spec sections: The plan (The approval table, Planner rules); Concepts.

Scope:
- renderSection: for a graph plan only, add Wave and After columns, then the lines "Setup: <command>" for each setup command, "Verify (after each parallel wave): <command>", and "Waves: 1: T01, T02, T03 · 2: T04". A serial plan's table must stay byte-for-byte what it is today. The commands are shown verbatim, since approving the plan makes tierminator run them.
- rules/tiering.md: a new section "Dependencies and parallel tasks" covering the after field, its default (the previous task), when to write after [] or a list, that parallel tasks must read and change different files and share no build output and each give their own Files to change: line, that a task also waits for the whole wave of its dependencies, that shared groundwork goes in an earlier wave, and the optional setup and verify fields (what each is for, that setup runs in each fresh worktree and verify runs after a parallel wave is integrated). Update the field table and the example. Replace the line "A task can depend only on earlier tasks". Keep the text short: it is injected into the model.
- Whatever H1 injects from the rules file stays consistent with it.
- Tests for the table (graph and serial) and for the rules file containing the new section and fields.

Out of scope: the overlap review flag (WP-05), the README and reference (WP-17), execution.

Acceptance criteria:
- Tests: a serial plan's table is unchanged; a graph plan's table shows waves, After, setup and verify; commands with a pipe character are escaped in the table.
- node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
