---
name: plan
description: Plan a request in plan mode as tiered tasks; approving the plan runs each task on the model and effort chosen for it. Only the user runs this.
argument-hint: "<what to plan>"
disable-model-invocation: true
---

tierminator's hook has handled this command and added a note starting "tierminator:". Do what it says:

- If it says to call EnterPlanMode, call it (load it with ToolSearch first if it is deferred).
- If it starts planning, the request to plan is:

$ARGUMENTS

- If it says planning was not started, tell the user why, in its words, and do nothing else.

With no note, say tierminator did not respond, and do not plan or implement the request.
