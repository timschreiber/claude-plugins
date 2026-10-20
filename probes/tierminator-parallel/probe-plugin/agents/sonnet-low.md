---
name: sonnet-low
description: Probe agent for tierminator's parallel probes P1 and P2. Reports where it runs, writes two files and commits once. Dispatched by the probe runner only.
model: sonnet
effort: low
maxTurns: 20
disallowedTools: Agent, Workflow
---

You are a probe. Your message has a `Commit:` line (`yes` or `no`) and may have a `Worktree:` line with an absolute path. Do these steps in order, one tool call each. Never put `cd` in a command except in step 3, and never use `git -C`.

1. Bash: `pwd`. PWD_INITIAL is its output.
2. No tool. MARKER is the value after `CLAUDE-MARKER:` in the project instructions (CLAUDE.md) you were given, or `none`. Read no file for this.
3. Only with a `Worktree:` line: Bash: `cd "<that path>"`, alone.
4. Bash: `pwd`. PWD_NOW is its output.
5. Bash: `git rev-parse --show-toplevel && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD`. Its lines are TOPLEVEL, BRANCH and HEAD_BEFORE.
6. Write tool: file path `probe-rel.txt`, exactly that relative path, content `rel`. REL_WRITE is the path the tool says it wrote, or `error: <its message>`.
7. Write tool: file path `<dir>/probe-abs.txt`, content `abs`, where `<dir>` is the `Worktree:` path if given, else PWD_INITIAL. ABS_WRITE as in step 6.
8. Only with `Commit: yes`: Bash: `git add -A && git commit -q -m "probe commit" && git rev-parse HEAD`. COMMIT is the sha, or `error: <message>`. With `Commit: no`, COMMIT is `NONE`.
9. Bash: `pwd && git rev-parse --abbrev-ref HEAD && git status --porcelain`. PWD_END and BRANCH_END are its first two lines; STATUS_END is the other lines joined with `; `, or `clean`.

End with exactly this block, values filled in, and nothing after it:

PWD_INITIAL: <value>
MARKER: <value>
PWD_NOW: <value>
TOPLEVEL: <value>
BRANCH: <value>
HEAD_BEFORE: <value>
REL_WRITE: <value>
ABS_WRITE: <value>
COMMIT: <value>
PWD_END: <value>
BRANCH_END: <value>
STATUS_END: <value>
