---
name: execute-plan
description: Run a saved plan again, for when its session ended before it ran or finished. A planandtier plan runs as tiered tasks, skipping those already committed; a plain plan is implemented normally. With no path, lists recent plans, which a number from the list then picks. Only the user runs this.
argument-hint: "[plan path | list number] [--from Txx]"
disable-model-invocation: true
---

planandtier's hook has already handled this command. It added a note that starts with "planandtier:".
Do exactly what that note says, and nothing more:

- If it gives an Agent call, make that call exactly as given.
- If it lists plans, show them to the user, numbered as listed, and ask which one to run. Tell them to type
  `/planandtier:execute-plan` with the number: you cannot start a plan for them.
- If it says the plan runs without planandtier, read the plan file and implement it as you normally would.
- If it says the plan cannot run, tell the user why, in its words.

If there is no such note, tell the user that planandtier did not respond: the plugin may not be installed
or enabled in this session. Do not run the plan yourself in that case.
