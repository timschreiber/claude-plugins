# WP-11 · End-to-end pilot and docs

```text
Work package WP-11 · End-to-end pilot and docs
Spec: docs/grindinator/Grindinator — Specification.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/grindinator/Grindinator — Specification.md in full, even if you have read them earlier in this session. Also read docs/grindinator/grindinator-verification.md from WP-01.

Goal: the whole pipeline is proven on real runs and documented.

Depends on: all earlier packages.
Spec sections: Rollout; Risks and unverified assumptions; Open items; Repository layout.

Scope:
- A runbook `docs/grindinator/grindinator-e2e-run.md` covering the harness check, the three-package pilot, and the first unattended batch, with expected results at each step.
- Real runs recorded on Pro and on Bedrock, including the permission settings, model pinning, and web-search setup each needs.
- A README at `tools/grindinator/README.md` and a reference doc at `docs/grindinator/grindinator-reference.md`, covering every command, flag, configuration key, file, variable and exit code.
- An update to the repo's root `CLAUDE.md` describing `tools/grindinator/`, no `marketplace.json` entry (it is not a plugin), and a passing `./scripts/Validate-All.ps1`.
- A known-limitations list; every open item O-1 to O-12 is marked closed or listed there.

Out of scope: new features found during the pilot; record them as follow-ups.

Acceptance criteria:
- The runbook has been executed on at least one setup, and its results are recorded.
- `./scripts/Validate-All.ps1` passes, and so do the test suites of the three plugins and `tests/grindinator/`.
- The docs describe the built behavior, with no leftover statement that headless sessions are unsupported by Decidinator.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
