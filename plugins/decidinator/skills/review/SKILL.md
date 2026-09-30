---
name: review
description: Walk the open questions in Decidinator's sidecar with the user and record each answer as the user's decision. Only the user runs this.
disable-model-invocation: true
---

Decidinator's hook has handled this command and added a note starting "decidinator:".

If the note gives AskUserQuestion calls, make them exactly as it says, one at a time and in order, and do nothing else between them: no research, no file edits, no other tools. Decidinator records each answer itself and tells you what it recorded. After the last call, tell the user in one or two lines what Decidinator recorded.

If the note gives no calls, tell the user in one or two lines what it says. With no note, say Decidinator did not respond, so nothing was recorded.

Do nothing else.
