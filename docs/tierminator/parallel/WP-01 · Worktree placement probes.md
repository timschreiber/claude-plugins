# WP-01 · Worktree placement probes

```text
Work package WP-01 · Worktree placement probes
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-agent-dispatch-findings.md and probes/planandtier/agent-probe.js, whose runner and probe-plugin structure you will reuse.

Goal: find out how a plugin subagent can be placed in a Git worktree, with evidence, so the spec's choice between M1 (the Agent tool's isolation) and M2 (worktrees made by tierminator) can be made.

Depends on: none.
Spec sections: The dispatch of one task; Probes (P1, P2); Risks.

Scope:
- A throwaway probe plugin under probes/tierminator-parallel/probe-plugin/, outside plugins/ so it never ships. One probe agent whose frontmatter mirrors a tier agent (model sonnet, low effort, disallowedTools Agent and Workflow) and whose job is: create a file, run pwd, git rev-parse --show-toplevel, git branch --show-current and git rev-parse HEAD in Bash, commit once, and report those values. Hooks on PreToolUse (Agent), PostToolUse (Agent) and SubagentStop that append their raw JSON input to a log, as agent-probe.js does.
- A runner, probes/tierminator-parallel/p1-p2-runner.js, that makes a fresh temporary Git repository for each cell, starts one headless claude -p session with the probe plugin, and writes the evidence.
- P1 cells: (a) an Agent call that passes isolation "worktree" for the plugin agent: does it apply, where do the worktree path and branch appear (which hook and field), which commit is the worktree based on, and what is left afterwards when the worker committed and when it did not; (b) a call without isolation where a PreToolUse hook adds isolation through updatedInput: does the parameter take effect, and does the hook output set no permissionDecision.
- P2 cells: no isolation; the runner makes a worktree itself (git worktree add) and the prompt carries a Worktree: <absolute path> line. Record whether the worker's Bash cwd, its file tools (with relative and with absolute paths), its git commands and its CLAUDE.md lookup hold to the worktree, on which branch the commit lands, and whether the main tree stays clean.
- Interactive-only variants cannot be automated: list them as pending with exact hand-run steps.
- Evidence files: probes/evidence/tierminator-parallel-p1-*.json and tierminator-parallel-p2-*.json (raw hook logs and a summary each).
- Create docs/tierminator/tierminator-parallel-findings.md with a P1 section and a P2 section: a table of question, answer and evidence file, then a recommendation (M1, M2 or neither) and where the conflict resolver should run. Add its row to docs/README.md.

Out of scope: any change under plugins/tierminator, and probes P3 to P8.

Acceptance criteria:
- Every question in the spec's P1 and P2 rows is answered in the findings, or marked not determinable with the reason, each with an evidence file.
- The findings end with a recommendation that the later packages can follow without re-deciding.
- The probe is re-runnable from the runner alone.
- node --test tests/tierminator/*.test.js still passes (no plugin file changed).

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
