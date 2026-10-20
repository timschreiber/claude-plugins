# WP-15 · Usage limit, result file and headless

> **Deferred 2026-10-20: not part of the first release.** The headless start and the permission restriction are covered by WP-10 and WP-17; H7 and the result file are made to handle a wave state in WP-09's audit. What waits here: the rule for the other slots when a usage limit hits mid-wave (until then the leftovers are removed by name at the next start), the result file's new optional fields, and probe P8.

```text
Work package WP-15 · Usage limit, result file and headless
Spec: docs/tierminator/tierminator-parallel-spec.md

Before planning, re-read CLAUDE.md, AGENTS.md if present, and docs/tierminator/tierminator-parallel-spec.md in full, even if you have read them earlier in this session. Also read docs/tierminator/tierminator-parallel-findings.md, plugins/tierminator/scripts/h7-limit.js, lib/limit.js, lib/result.js, lib/unattended.js, tests/tierminator/result.test.js, result-hooks.test.js, limit-hooks.test.js and execute-headless.test.js, and the mock API used by tests/grindinator (find it first).

Goal: a usage limit that hits mid-wave ends the run once and resumes cleanly, the result file reports parallel runs, and headless runs work in parallel.

Depends on: WP-10, WP-11, WP-14.
Spec sections: Usage limit; Headless; Telemetry and display (the result file).

Scope:
- P8, a probe: with the mock API from the Grindinator tests (write a minimal one if it cannot be reused), a headless session with several workers in flight when a limit is returned. Record which hooks fire, whether the other in-flight workers fail with the same limit, and the transcripts. Evidence probes/evidence/tierminator-parallel-p8-*.json and a P8 section in the findings.
- H7 and the run: a limit ends the run once, as today (outcome limit with its reset time). Attempts of other slots that end because of the limit are not judged: no reset, no retry, no ladder step. Their worktrees are discarded, and a later /tierminator:execute re-runs the wave; tasks already integrated are skipped.
- The result file keeps schema version 1 and gains the optional fields waves, parallelPeak and wallClockSeconds, if result.test.js shows an existing reader is unaffected; otherwise stop and report why instead of bumping the version. Serial runs may omit the fields.
- Headless: a parallel plan run by claude -p executes waves in parallel and writes the result file, the telemetry file and the summary as an interactive run does. A headless run has no one to answer permission requests, so a parallel plan needs `--permission-mode auto` or `bypassPermissions` (the WP-01 findings, option C): in the default mode its workers finish the work and cannot commit, because a shell command that starts with `cd` cannot be allowed permanently. State it in the headless documentation text of this package; no new check is added, and the start notice of WP-10 already carries the line. Grindinator is a caller (changing it is out of scope here): note in the findings of this package that its runs must use one of those modes. Add a headless fixture test with a parallel plan if the existing headless tests make that practical, else document the gap for WP-17's end-to-end run.
- Tests for the limit rule (several slots in flight), the result fields and the headless case.

Out of scope: display lines and the summary text (WP-16).

Acceptance criteria:
- A limit during a wave of three leaves no judged failure, no retry and no leftover worktree, and a resume re-runs the wave.
- Serial plans: node --test tests/tierminator/*.test.js passes, with no existing test changed except to add cases.

Your plan:
1. Write a plan with a detailed task list. Every task must need no new reasoning or design decisions and must be small and mechanical enough for Sonnet to execute. Make every design decision in the plan, never inside a task.
2. Ask open questions through AskUserQuestion before finishing the plan; do not guess.
```
