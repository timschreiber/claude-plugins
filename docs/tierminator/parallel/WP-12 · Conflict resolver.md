# WP-12 · Conflict resolver

```text
Work package WP-12 · Conflict resolver
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md (P1, P2 and the recommendation on where the resolver runs), lib/integrate.js, lib/h4-wave.js, lib/settle.js, lib/turnlimit.js, lib/spend.js, lib/prices.js, the agent files in plugins/tierminator/agents/ and tests/tierminator/agents.test.js.

Goal: a conflicting pick is handed to a new opus-high agent that resolves it, and the run halts if it cannot.

Depends on: WP-11.
Spec sections: The conflict resolver; Integration; Notices; Telemetry and display (the resolver's spend row).

Scope:
- agents/resolver.md: name resolver, model opus, effort high, maxTurns 150 (revisit after the probe below), disallowedTools Agent and Workflow. Its rules are the spec's: resolve conflicts by editing with the file tools (no heredocs), never delete or weaken a test, run the Verify: steps of the tasks involved, git add and git cherry-pick --continue keeping the original message and its Tierminator lines, never abort the pick, reset, switch branches, rebase or push, and end with the same STATUS, COMMIT, VERIFY, NOTE block as a worker. It is not one of the six tiers: it is never in the ladder, never chosen by a plan. agents.test.js must expect it (the six tier agents and their shared body are unchanged).
- lib/resolver.js: the prompt the hook writes (the conflicting task's id, title and prompt; the id, title and prompt of each task already picked in this wave; the conflicting files; the Verify: lines of the tasks involved; the instruction to keep the intent of both), the expected dispatch, and the judging: the pick is no longer in progress, the tree is clean, exactly one new commit sits on the integration tip with the task's trailers, and the report says VERIFY PASS. Turn-limit resume and the missing-report request work as for workers.
- H4 accepts only the expected resolver dispatch. After the resolver succeeds, integration goes on with the remaining picks. If the resolver fails, the run halts with the integration worktree left as it was; there is no retry and no second resolver.
- Placement follows the findings (in the integration worktree, or in its own worktree with the result fast-forwarded in).
- Spend is recorded under the tier resolver and priced as opus (prices.js).
- P7, a probe: a fixture repository with a seeded two-task conflict, and a runner that starts a headless session to resolve it. Record turns, tokens, cost and whether the report block and the continue come out right. Evidence probes/evidence/tierminator-parallel-p7-*.json and a P7 section in the findings; set maxTurns from it.
- Tests for the pure parts and, with real repositories and a simulated resolver, for success, failure, and a second conflict in the same wave.

Out of scope: plan-level verify (WP-13) and display (WP-16).

Acceptance criteria:
- A forced conflict between two fixture tasks is resolved in the hook tests and the history is linear with one commit per task; a failing resolver halts and leaves the worktree.
- Serial plans: node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
