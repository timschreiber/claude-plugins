# Parallel task execution — work packages

Oct 19, 2026 · @Tim · Branch `parallelism`

Seventeen packages build the feature in `../tierminator-parallel-spec.md`, in dependency order. Each file is one paste-ready prompt: run it as one plan, by typing `/tierminator:plan ` and pasting the fenced block. Each cites the spec by section name.

| Package | Title | Depends on | Spec phase |
| --- | --- | --- | --- |
| WP-01 | Worktree placement probes (P1, P2) | none | 1 |
| WP-02 | Concurrency and hook-duration probes (P3, P4, P5) | WP-01 | 1 |
| WP-03 | Plan format and waves | none | 2 |
| WP-04 | Approval table and planner rules | WP-03 | 2 |
| WP-05 | Overlap review flag (decision O6) | WP-03, WP-04 | 2 |
| WP-06 | Git helpers and the Git probe (P6) | WP-01, WP-02 | 3 |
| WP-07 | State lock | WP-02 | 3 |
| WP-08 | Parallel wave engine (pure functions) | WP-03, WP-07 | 4 |
| WP-09 | Dispatch hooks for parallel waves | WP-01, WP-06, WP-07, WP-08 | 4 |
| WP-10 | Starting waves and the hand-back and guard hooks | WP-09 | 4 |
| WP-11 | Integration | WP-06, WP-09, WP-10 | 4 |
| WP-12 | Conflict resolver (and probe P7) | WP-11 | 5 |
| WP-13 | Plan-level verify | WP-12 | 5 |
| WP-14 | Resume and cleanup | WP-10, WP-11 | 6 |
| WP-15 | Usage limit, result file and headless (and probe P8) | WP-10, WP-11, WP-14 | 6 |
| WP-16 | Telemetry and display | WP-10, WP-12 | 6 |
| WP-17 | End-to-end run and docs | all | 7 |

Run them in number order; WP-03 to WP-05 do not depend on the probes and may run before WP-01 and WP-02.

## Before running them

- **Commit the spec and these files first.** Tierminator needs a clean working tree and commits to the current branch, so run every package on `parallelism`. Nothing here pushes.
- **Run them with a tierminator that the packages do not edit.** The packages change `plugins/tierminator`. A session that loaded the plugin from this branch (`--plugin-dir ./plugins/tierminator`) would run its own work under code that is half rewritten. Use the installed copy, or one from `main`, and check which one is loaded before WP-09.
- **WP-01, WP-02, WP-06, WP-12 and WP-15 write and run probes** (headless `claude -p` sessions that cost real tokens). Interactive-only cells cannot be automated; those packages list them as pending with hand-run steps, as the Decidinator verification did.
- **Findings can change later packages.** Read `../tierminator-parallel-findings.md` after WP-01 and WP-02. If a probe refutes an assumption, apply the spec's fallback (M2 instead of M1, or stop) and edit the affected prompts before running them, as the Decidinator work did.
- **Open decision: how an isolated worktree gets the wave base.** WP-01 and its re-runs (`../tierminator-parallel-findings.md`) chose M1, the Agent tool's `isolation: "worktree"`, for tasks, and M2 (a `Worktree:` line with the `cd`-prefix rules) for the conflict resolver. By default Claude Code bases an isolated worktree on the remote's default branch, not the run branch, so something must supply the wave base. The findings recommend `worktree.baseRef: "head"` supplied through `--settings`, but that is not settled: only the `--settings` flag was measured, which tierminator cannot pass to a user's session, so the real mechanism is a `worktree.baseRef` key in the user's or project's settings (documented, unmeasured, and a precondition tierminator would have to check); a plugin's own `settings.json` did not work; the `WorktreeCreate` hook and a `SubagentStart` reset also passed but rest on behavior the Claude Code docs do not state (plugin-registered `WorktreeCreate` hooks, `SubagentStart` finishing before the first turn). A second round of probes is planned to settle it. Until its findings are written, WP-09 (`lib/worktree-base.js`) and WP-10 (the start check) are blocked, and WP-02's isolated run of P3a uses the `--settings` setup and may need redoing. WP-03 to WP-08 and WP-11 to WP-17 are written to hold whichever mechanism wins.
- **Serial plans must not change.** Every package says so in its acceptance criteria: the existing tests pass, and no existing test is edited except to add cases.

## Choices made while splitting the spec

- The approval table shows the Wave and After columns, and the setup and verify lines, **for a graph plan only**, so a serial plan's table stays byte-for-byte as it is (WP-04).
- WP-09 ends with a stub that halts a run when a parallel wave closes ("integration is not built yet"), so each package is testable alone. WP-11 replaces it. The branch is not released between them.
- After the WP-01 re-runs, WP-02, WP-06, WP-08, WP-09, WP-10, WP-11, WP-12 and WP-14 were edited to follow the findings: isolated worktrees (M1) for tasks, the `cd`-prefix rules (M2) for the resolver, the `.claude/worktrees/` exclude entry, drive-letter worktree paths, a fatal "WORKTREE BASE:" failure, the integration worktree inside `.claude/worktrees/`, and cleanup that never touches the user's own worktrees. The spec itself (`../tierminator-parallel-spec.md`) still reads as before the probes; update it once the open decision above is settled.
- The probes P7 and P8 sit inside the packages that need them (WP-12 and WP-15) instead of in the first phase, because they need the resolver and the limit handling to exist.
