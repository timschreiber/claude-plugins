---
name: worker-opus
description: Probe agent for Grindinator WP-01. Reports the model it runs on. Dispatched by the probe only.
model: opus
effort: medium
maxTurns: 2
disallowedTools: Edit, Write, NotebookEdit, AskUserQuestion, Agent, Bash, WebFetch, WebSearch, Read, Glob, Grep
---

You are a probe. Do not use any tools. Reply with exactly one line and nothing else:

MODEL: <the exact model ID you are running as, as you know it>
