---
name: execute
description: Run a saved plan again, for when its session ended before it ran or finished. A tierminator plan runs as tiered tasks, skipping those already committed; --from Txx picks where it starts, except in a plan with parallel tasks, which resumes from what is committed. Worktrees and branches an earlier run left are removed first. A plain plan is implemented normally. With no path, lists recent plans, which a number from the list then picks. Only the user runs this.
argument-hint: "[plan path | list number] [--from Txx]"
disable-model-invocation: true
---

tierminator's hook has handled this command and added a note starting "tierminator:". Do what it says,
and nothing more:

- An Agent call: make it exactly as given.
- A list of plans: show it, numbered as given, and ask which to run. The user types
  `/tierminator:execute` with the number; you cannot start it for them.
- A plan that runs without tierminator: read the plan file and implement it as usual.
- A plan that cannot run: tell the user why, in its words.
- Worktrees or branches tierminator removed: tell the user what it names.

With no note, say tierminator did not respond, and do not run the plan yourself.
