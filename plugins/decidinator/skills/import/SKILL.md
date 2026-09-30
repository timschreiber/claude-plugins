---
name: import
description: Import stakeholder answers from a filled-in copy of Decidinator's open questions, and report which decisions they confirmed or changed. Only the user runs this.
argument-hint: "<path>"
disable-model-invocation: true
---

Decidinator's hook has handled this command and added a note starting "decidinator:".

Show the user the note's report as written. If the note also gives Agent calls for oracle judgments, make them exactly as given and end your turn: each oracle reports in the background, and after the last report Decidinator gives you a final report. Show that final report to the user as written.

With no note, say Decidinator did not respond, so nothing was imported.

Do not edit the decision log or the sidecar, and do not act on changed decisions unless the user asks.
