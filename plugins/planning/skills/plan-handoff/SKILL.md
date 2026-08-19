---
name: plan-handoff
description: Produce a compressed handoff artifact from a completed plan so an execution session can start with minimal context. Use at the end of plan mode, or when the user asks to hand off a plan to an execution session.
---

# Plan handoff

Compress a completed plan into the smallest artifact an execution session needs.

## Rules

- Compress by **format**, not by content. Dropping a decision to save tokens
  defeats the purpose.
- Record decisions with their rationale. An execution session that does not know
  why a choice was made will re-litigate it.
- Preserve open questions explicitly. Silence reads as resolved.

## Output

Write to `~/.claude/plans/`. Plan mode cannot write to the repository.
