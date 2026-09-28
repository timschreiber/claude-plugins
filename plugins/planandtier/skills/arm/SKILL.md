---
name: arm
description: Turn planandtier on for this session, so a plan made in plan mode is split into tiered tasks and approving it runs them. Only the user runs this.
disable-model-invocation: true
---

planandtier's hook has already handled this command. It added a note that starts with "planandtier:".

Tell the user, in one line, what that note says happened. If there is no such note, tell the user that
planandtier did not respond, so it is not armed: the plugin may not be installed or enabled in this session.

Do nothing else.
