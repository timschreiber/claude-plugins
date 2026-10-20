# WP-13 · Plan-level verify

> **Partly deferred 2026-10-20.** Running verify after the picks and halting on a failure moved into WP-11 (and `TIERMINATOR_VERIFY_TIMEOUT` is dropped in favor of the hook timeout). What remains here, sending the resolver in once to repair a failed verify, goes with WP-12 and is deferred; it assumed the integration worktree and the resolver.

```text
Work package WP-13 · Plan-level verify
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md (P5), lib/integrate.js, lib/resolver.js and plugins/tierminator/hooks/hooks.json.

Goal: after the picks of a parallel wave, the plan's verify command runs in the integration worktree before the run branch moves, and a failure sends the resolver in once.

Depends on: WP-12.
Spec sections: Plan-level verify; Integration; The conflict resolver.

Scope:
- lib/integrate.js: runVerify(cwd, command, timeoutSeconds) runs the command through the platform shell, returns the exit status and the bounded tail of the output (at most 4,000 characters), and kills the process on the timeout. TIERMINATOR_VERIFY_TIMEOUT sets the timeout in seconds (default 900; an invalid value means the default).
- Integration runs verify only for a parallel wave and only when the plan has one; a serial wave never runs it. It runs after all picks and before the fast-forward, so a failure leaves the run branch untouched.
- A failed verify dispatches the resolver once, with the verify command, its output and the prompts of the whole wave. Its fix is one commit with the trailers "Tierminator-Task: W<n>" and the plan line (committedTasks ignores it; add a test that proves it). If the resolver fails, or verify still fails after its fix, the run halts, the integration worktree left in place with the output named in the halt reason.
- Use the hook timeout the findings recommend, in hooks.json, for the hook that runs verify.
- Tests with real repositories: a passing verify moves the branch; a failing one leads to the resolver and then passes; a failing one that stays failing halts with the branch untouched; the timeout kills a long command; no verify means nothing runs; a serial wave never runs it.

Out of scope: the display of verify in run lines (WP-16).

Acceptance criteria:
- The behavior above is covered by tests; the run branch never moves on a failed verify.
- Serial plans: node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
