# Parallel task execution — work packages

Oct 19, 2026 · revised Oct 20, 2026 · @Tim · Branch `parallelism`

Seventeen packages describe the feature in `../tierminator-parallel-spec.md`, in dependency order; **eleven are the first release and six are deferred** (decided 2026-10-20, after a design review looked for simplifications). Each file is one paste-ready prompt: run it as one plan, by typing `/tierminator:plan ` and pasting the fenced block. Each cites the spec by section name. A deferred package starts with a note saying so and why; do not run it without re-planning it.

| Package | Title | Depends on | Release |
| --- | --- | --- | --- |
| WP-01 | Worktree placement probes (P1, P2) | none | first (done: option C chosen) |
| WP-02 | Concurrency and hook-duration probes (P3 background, P4, P5) | WP-01 | first |
| WP-03 | Plan format and waves | none | first |
| WP-04 | Approval table and planner rules | WP-03 | first |
| WP-05 | Overlap review flag (decision O6) | WP-03, WP-04 | **deferred** |
| WP-06 | Git helpers | WP-01 | first |
| WP-07 | State lock | none | first |
| WP-08 | Parallel wave engine (pure functions) | WP-03 | first |
| WP-09 | Dispatch hooks for parallel waves (and the audit of readers of `state.current`) | WP-01, WP-06, WP-07, WP-08 | first |
| WP-10 | Starting waves and the hand-back and stop-guard hooks | WP-09 | first |
| WP-11 | Integration (main tree, conflicts re-run serially, halt-only verify) | WP-06, WP-09, WP-10 | first |
| WP-12 | Conflict resolver (and probe P7) | WP-11 | **deferred** |
| WP-13 | Plan-level verify: repair with the resolver | WP-12 | **deferred** (the halt-only part is in WP-11) |
| WP-14 | Resume and cleanup | WP-10, WP-11 | first |
| WP-15 | Usage limit, result file and headless (and probe P8) | WP-10, WP-11, WP-14 | **deferred** |
| WP-16 | Telemetry and display | WP-10 | **mostly deferred** (the spend fix is in WP-09) |
| WP-17 | End-to-end run and docs | WP-01 to WP-04, WP-06 to WP-11, WP-14 | first |

Run the first-release packages in number order; WP-03 and WP-04 do not depend on the probes and may run before WP-01 and WP-02.

## Before running them

- **Commit the spec and these files first.** Tierminator needs a clean working tree and commits to the current branch, so run every package on `parallelism`. Nothing here pushes.
- **Run them with a tierminator that the packages do not edit.** The packages change `plugins/tierminator`. A session that loaded the plugin from this branch (`--plugin-dir ./plugins/tierminator`) would run its own work under code that is half rewritten. Use the installed copy, or one from `main`, and check which one is loaded before WP-09.
- **WP-02 writes and runs probes** (headless `claude -p` sessions that cost real tokens). Interactive-only cells cannot be automated; it lists them as pending with hand-run steps, as the Decidinator verification did.
- **Findings can change later packages.** Read `../tierminator-parallel-findings.md` after WP-02. If a probe refutes an assumption, edit the affected prompts before running them, as the Decidinator work did.
- **Serial plans must not change.** Every package says so in its acceptance criteria: the existing tests pass, and no existing test is edited except to add cases.

## What was decided

- **Option C, tierminator makes the worktrees (2026-10-20).** WP-01 and its re-runs (`../tierminator-parallel-findings.md`) compared M1 (the Agent tool's `isolation: "worktree"`, which by default bases the worktree on the remote's default branch and needs `worktree.baseRef: "head"`) with M2 (a `Worktree:` line with the `cd`-prefix rules, the worktree made by tierminator). Option C was tested with realistic work (38 runs, the "Option C" findings section) and chosen: H4's `pre` hook makes each slot's worktree at the wave base, the worker is not isolated and follows the M2 rules, and a guard hook denies calls that would reach the main tree. The earlier M1 decisions (the `baseRef` setting, writing it, the pause, the one-slot gate, the serial fallback) stay in the findings as the record and are not built.
- **Restriction.** In the default and `acceptEdits` permission modes every worker command asks for approval and a `cd ... && git ...` command offers no permanent rule, so unattended and headless runs need `--permission-mode auto` or `bypassPermissions`; this is documented as a restriction of unattended mode (WP-10 adds one line to the start notice; WP-17 documents it).
- **Simplifications (2026-10-20).** Three design reviewers looked for overcomplication, and the user adopted: conflicts are not resolved by a model but the conflicting task is run again serially after the wave (WP-11; the resolver is WP-12, deferred); integration cherry-picks in the main tree with no integration worktree (WP-11); waves stay (a ready-queue is a possible later optimization); plan-level verify halts on failure and nothing repairs it (WP-11; the repair is WP-13, deferred); the overlap flag is deferred (WP-05); and the first release is the packages marked "first" above.
- **Spec O8, decided 2026-10-20** (the user delegated the call): a failed verify leaves the picks on the run branch instead of resetting to the wave base.

## Choices made while splitting the spec

- The approval table shows the Wave and After columns, and the setup and verify lines, **for a graph plan only**, so a serial plan's table stays byte-for-byte as it is (WP-04).
- WP-09 ends with a stub that halts a run when a parallel wave closes ("integration is not built yet"), so each package is testable alone. WP-11 replaces it. The branch is not released between them.
- WP-09 includes an audit of every reader of `state.current` (`h1-plan-rules.js`, `h4-dispatch.js`, `h5-guard.js`, `h7-limit.js`, `lib/result.js`, `lib/spend.js`): they assume a serial run, and `lib/spend.js` would silently drop a wave's attempts.
- WP-08 depends on WP-03 alone (it is pure), WP-07 depends on nothing (the lost-update probe P3b was dropped; its concurrent-process test proves the race), and WP-06 depends on WP-01 only (the P6 probe was dropped; its real-repository tests cover Git on Windows).
- The probes P7 and P8 go with the deferred packages (WP-12 and WP-15).
- The deferred packages were written for the earlier design (an integration worktree, `worktree-agent-*` leftovers, a resolver agent); each says so and needs re-planning before it is run.
