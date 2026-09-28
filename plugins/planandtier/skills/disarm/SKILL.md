---
name: disarm
description: Turn planandtier off for this session. Plans are no longer tiered, and a run in progress stops dispatching. Only the user runs this.
disable-model-invocation: true
---

planandtier's hook has already handled this command. It added a note that starts with "planandtier:".

Tell the user what that note says happened. If it stopped a run, also give what it lists as done and not
done, and do exactly what it says. If there is no such note, tell the user that planandtier did not
respond: the plugin may not be installed or enabled in this session.

Do nothing else.
