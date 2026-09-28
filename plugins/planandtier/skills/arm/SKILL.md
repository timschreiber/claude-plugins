---
name: arm
description: Turn planandtier on for this session and switch to plan mode, so a plan made there is split into tiered tasks and approving it runs them. Only the user runs this.
disable-model-invocation: true
---

planandtier's hook has already handled this command. It added a note that starts with "planandtier:".

If the note tells you to switch to plan mode, do exactly what it says: call the EnterPlanMode tool (loading
it with ToolSearch first if it is only listed as deferred), then tell the user in one line what the note
says. Otherwise, tell the user in one line what the note says happened.

If there is no such note, tell the user that planandtier did not respond, so it is not armed: the plugin
may not be installed or enabled in this session.

Do nothing else.
