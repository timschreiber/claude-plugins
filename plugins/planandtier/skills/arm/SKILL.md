---
name: arm
description: Turn planandtier on for this session and switch to plan mode, so a plan made there is split into tiered tasks and approving it runs them. Only the user runs this.
disable-model-invocation: true
---

planandtier's hook has handled this command and added a note starting "planandtier:".

If the note says to call EnterPlanMode, call it (load it with ToolSearch first if it is deferred). Then
tell the user in one line what the note says. With no note, say planandtier did not respond, so it is
not armed.

Do nothing else.
