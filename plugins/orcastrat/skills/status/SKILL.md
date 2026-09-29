---
name: status
description: Summarize an Orcastrat plan's progress, blocks, open questions, and next step, without changing anything. Only run when the user explicitly invokes it.
disable-model-invocation: true
argument-hint: "<plan dir>"
---

# Status

Argument: `$ARGUMENTS` (the plan directory, optional).

This is read-only, and you do none of the reading yourself: a Haiku subagent does it, so this skill never switches your session's model.

1. Invoke the agent `orcastrat:status-reader` with exactly one line: `Plan: <plan dir>`, with the directory the argument names, or `Plan: none` when there is no argument.
2. Relay its reply to the user verbatim, as your whole reply: add nothing, drop nothing, and don't reformat it.

Read no file and run no command yourself.
