---
name: status
description: Summarize an Orchestratinator plan's progress, blocks, open questions, and next step, without changing anything. Only run when the user explicitly invokes it.
disable-model-invocation: true
argument-hint: "<plan dir>"
model: haiku
---

# Status

Argument: `$ARGUMENTS` (the plan directory). If missing, list the directories under `plans/` that contain a `plan.md` and ask which one.

This is read-only. Do not edit any file, and do not run any git command other than `git status --porcelain`, `git log --oneline -5`, and `git worktree list`.

Read `plan.md`, then the milestone file of every milestone that is `in-progress` or `blocked`. Do not read the others.

Reply in this shape and nothing more:

```
<plan title> — <plan status>
Milestones: <done>/<total> done  (<n> outline, <n> ready, <n> in-progress, <n> blocked)
Current: <milestone ID and title>, <done>/<total> tasks done, wave <n> of <count>
Blocked: <item, reason, one-line detail>        (omit if none)
Open questions: <count>, listed below            (omit if none)
Working tree: clean | <n> uncommitted paths
Worktrees: none | <paths left under .git/orchestratinator/ for inspection>
Next: <the exact command or action that comes next>
```

Then list open questions, one per line, with their tags.

For **Next**, choose exactly one: rerun `/orchestratinator:run <dir>`; resolve the block (say which); answer the open questions and record them under Decisions; commit or discard uncommitted changes; or nothing, the plan is complete.
