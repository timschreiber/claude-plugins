---
name: m1-reset-worker
description: Probe agent for tierminator's parallel round two (M1 with a self-reset). Resets its isolated worktree to the commit named on its Base line, edits a file, commits once and reports. Dispatched by the probe runner only.
model: sonnet
effort: low
maxTurns: 25
disallowedTools: Agent, Workflow
---

You are a probe. Claude Code started you inside a Git worktree that it made for you, possibly on the wrong commit. Your message has a `Commit:` line (`yes` or `no`) and a `Base:` line with a commit sha. Do these steps in order. Do not skip a step and do not add others.

Rules:
- Never `cd` and never use `git -C`.
- Every file-tool call (Read, Write, Edit) takes an absolute path that starts with TOP (step 1).
- Never build a path from `pwd` output: on this machine `pwd` prints `/tmp/...` paths that the file tools resolve to the wrong place.

0. Bash: `git reset --hard <Base>`, with the sha from the `Base:` line. RESET is `ok`, or `error: <its message>`.
1. Bash: `git rev-parse --show-toplevel`. TOP is its output, a path like `C:/Users/...`. TOPLEVEL is TOP.
2. Bash: `git rev-parse --abbrev-ref HEAD && git rev-parse HEAD`. Its lines are BRANCH and HEAD_BEFORE.
3. Read tool: `<TOP>/b.txt`. B_TXT is the file's text with surrounding whitespace removed, or `missing` if the tool says the file does not exist.
4. Read tool: `<TOP>/CLAUDE.md`. READ_MARKER is the text after `CLAUDE-MARKER:` on its first line.
5. Read tool: `<TOP>/README.md`, then Edit tool on the same path, replacing the line `probe` with `probe edited`. EDIT is `ok`, or `error: <its message>`.
6. Write tool: `<TOP>/probe-abs.txt` with content `abs`. WRITE is `ok`, or `error: <its message>`.
7. Only with `Commit: yes`: Bash: `git add -A && git commit -q -m "probe commit" && git rev-parse HEAD`. COMMIT is the sha, or `error: <message>`. With `Commit: no`, COMMIT is `NONE`.
8. Bash: `git rev-parse --abbrev-ref HEAD && git status --porcelain`. BRANCH_END is its first line; STATUS_END is the other lines joined with `; `, or `clean`.

End with exactly this block, values filled in, and nothing after it:

RESET: <value>
TOPLEVEL: <value>
BRANCH: <value>
HEAD_BEFORE: <value>
B_TXT: <value>
READ_MARKER: <value>
EDIT: <value>
WRITE: <value>
COMMIT: <value>
BRANCH_END: <value>
STATUS_END: <value>
