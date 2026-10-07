# Grindinator Loop and Tierminator Integration: Spec and Work Packages

Oct 4, 2026 · @Tim

## Purpose and scope

This spec covers the work needed to run a folder of work packages unattended through Tierminator and Decidinator, driven by a Node runner (Grindinator) that starts one fresh headless Claude Code session per package.

Three components are involved:

- **Grindinator (new tool):** the outer loop. It orders the packages, launches sessions, runs gates, records progress, and sleeps through usage limits.
- **Tierminator (existing):** plans one package and executes it as tiered, committed tasks. It needs a run-result file, limit capture, and verified headless resume.
- **Decidinator (existing):** resolves questions through oracle subagents and logs decisions. It needs a headless path, because it does not work in `claude -p` today.

**Decisions already made:** the loop stays an outer script, not nested subagents. Each package gets a fresh session. The limit-handling logic is written in-house, with `agent-limit-retry` used only as a reference. Tierminator and Decidinator stay inert until armed. Workers run on Sonnet and Opus only.

**Confirmed:** the runner is written in Node 20, matching both existing plugins and the repo's no-`pwsh` rule for hooks. The tool is named Grindinator and lives in this repo under `tools/grindinator/`, outside `plugins/`.

**Out of scope:** Interviewinator, parallel packages, pushing to a remote, and any stakeholder workflow beyond Decidinator's sidecar export and import.

## Current state

Most of the in-session machinery exists; the gaps are the caller-facing pieces and Decidinator's headless path. This table comes from reading the repo at commit c7671b1 (Oct 4, 2026), not from running it.

WP-01 then ran the headless rows on Claude Code 2.1.289 (Oct 5, 2026) and corrected them below; its findings and evidence are in `docs/grindinator/grindinator-verification.md`. Its usage-limit results come from a mock API's 429, not a real limit.

| Capability | Status | Basis |
| --- | --- | --- |
| Headless detection | Exists | Tierminator reads `CLAUDE_CODE_ENTRYPOINT` (`sdk-cli`); Decidinator's verification also records `CLAUDE_CODE_SESSION_ATTENDED=0` |
| Unattended plan and run via `claude -p "/tierminator:plan ..."` | Exists | The plan is the final message, saved to a `tierminator-unattended-*.md` plan file, then run with no approval |
| Plan-mode `TIERMINATOR_AUTOPILOT` arming | Not needed | The headless `/tierminator:plan` command arms the session; no environment variable exists |
| Worker turn-limit resume (max 2) | Exists | README, `h4-dispatch.js` |
| Resume a saved plan: `/tierminator:execute [path or number] [--from Txx]` | Exists, verified headless with a path | WP-01 V5: the path form runs with no approval and `--from T02` skips T01. A list number does not resolve in a fresh session. It refuses a dirty tree (an untracked file counts) and plan mode. WP-05 added the result file for a headless execute that does not start (`declined` with the reason, or `complete` when every task is already committed) and headless tests; the runner always passes the plan path |
| Run result a caller can read | Missing | Session state is deleted at `SessionEnd`; only the plan, tasks and telemetry files persist |
| Usage-limit capture (`StopFailure`) | Missing; the event fires headless | No such hook in `hooks.json`, and no limit handling in plugin code. WP-01 V1: `StopFailure` fires in `-p` on a limit with `error: "rate_limit"` and no reset field |
| Decidinator arming by `DECIDINATOR_MODE`, labels by `DECIDINATOR_CONTEXT` | Exists, verified headless | `session-start.js`, README. WP-01 V6: `DECIDINATOR_MODE=sidecar` arms a `-p` session |
| Decidinator question interception in headless sessions | Does not work | `AskUserQuestion` does not exist headless; README lists this as out of scope. WP-01 V6: a direct `oracle-1` dispatch through `Agent` runs, `SubagentStop` fires and the verdict parses, but nothing is recorded WP-04 added the headless consult path: a rule at session start, a question opened from a first-rung oracle dispatch, and the recorder writing the log and sidecar; covered by unit tests, live run pending (Decidinator runbook scenario 8). |
| Decidinator log, sidecar, export, import | Exists; not written headless | Commands and file formats are built. WP-01 V6: the recorder acts only on a question the `AskUserQuestion` gate opened, so a headless session writes no log or sidecar WP-04 added the headless consult path: a rule at session start, a question opened from a first-rung oracle dispatch, and the recorder writing the log and sidecar; covered by unit tests, live run pending (Decidinator runbook scenario 8). |
| Oracle rung models | Honored outside plan mode on a first-party login | WP-01 V6 and V9: each rung ran on its configured model and effort under `acceptEdits`, rung 3 on `claude-fable-5-1`; untested on Bedrock and Pro |

Two integration facts matter for the runner. First, Decidinator writes its decision log and sidecar into the repository, while Tierminator requires a clean working tree at start. Second, Tierminator's own failure cleanup runs `git reset --hard` and `git clean -fd`, which is safe only on a branch the runner owns.

## Architecture

Grindinator owns sequencing and recovery, Tierminator owns one package's planning and execution, and Decidinator owns questions. They meet at four points only: environment variables going in, a Tierminator result file coming out, Decidinator's decision log and sidecar in the repo, and Git.

For one package the lifecycle is:

1. Check preconditions: clean tree, the runner's own branch, no `.done` marker for this package.
2. Launch `claude -p` with the package prompt behind `/tierminator:plan`, with Decidinator armed through the environment and the result-file path set.
3. Tierminator plans read-only, consults oracles for open decisions, saves the plan, and runs the tasks as committed worker attempts.
4. When the session ends, read the result file.
5. If the outcome is `complete`: copy Decidinator's log and sidecar to their repo paths and commit them (R-D5), run the gate, write the `.done` marker.
6. If the outcome is `limit`: sleep until the reset, discard uncommitted changes on the branch, then relaunch by phase (rerun planning, or `/tierminator:execute` from the first unfinished task).
7. If the outcome is `halted` or anything else: stop the run, write the summary, and exit non-zero.

## Repository layout

Grindinator lives in the same repo as the plugins it drives, in its own directories, so one set of docs, tests and probes covers the pipeline. It is a tool, not a plugin: nothing under `plugins/` and no `marketplace.json` entry.

| Item | Path |
| --- | --- |
| Runner code and CLI | `tools/grindinator/` (`bin/grindinator`, `package.json`) |
| Runner README | `tools/grindinator/README.md` |
| Runner tests | `tests/grindinator/*.test.js`, run with `node --test` |
| Stub `claude` and test fixtures | `tests/grindinator/fixtures/` |
| Verification probe | `probes/grindinator/` |
| Probe evidence | `probes/evidence/grindinator-*` |
| Spec, verification findings, e2e runbook, reference, work package prompts | `docs/grindinator/` |
| Runner state in the target project | `.grindinator/`, excluded through `.git/info/exclude` |

To start a run, `cd` to the target project's root and run `grindinator run <packages directory>`, after `npm link` in `tools/grindinator/` or by calling `node tools/grindinator/bin/grindinator`.

## Open items

Twelve items remain: four code gaps, four that start with verification, three decisions, and one documentation task.

| ID | Item | Component | Kind | Package |
| --- | --- | --- | --- | --- |
| O-1 | No run result a caller can read after the session ends | Tierminator | Gap | WP-02 |
| O-2 | No usage-limit capture or reset time | Tierminator | Gap | WP-03 |
| O-3 | Headless `/tierminator:execute <plan> --from Txx` runs (WP-01 V5); it still writes no result file and has no headless tests or docs | Tierminator | Gap; closed by WP-05 (the result file, tests and docs) | WP-01, WP-05 |
| O-4 | Decidinator does nothing in headless sessions, so open decisions go unresolved | Decidinator | Gap; closed by WP-04 (live run pending) | WP-04 |
| O-5 | No runner: discovery, state, gates, failure policy, summary | Grindinator | Gap; discovery, state and session launch built in WP-06 and WP-07 | WP-06 to WP-10 |
| O-6 | Headless unknowns: `StopFailure` payload, exit codes, stream-json result shape, `SessionEnd` on a limit, oracle dispatch and recorder in `-p`. Measured by WP-01; the limit items rest on a mock 429, and a real limit is unverified | All | Verify | WP-01 |
| O-7 | Oracle writes to the decision log during planning block Tierminator's run start, and during a run land in an unrelated task commit (WP-01 V7); a write under an excluded `.grindinator/` path does neither (Decidinator side done in WP-04; runner side is WP-10) | Grindinator, Decidinator | Gap | WP-01, WP-04, WP-10 |
| O-8 | Recovery after an interrupted run needs a discard-and-relaunch policy on a runner-owned branch | Grindinator | Decision; closed by WP-09 | WP-08, WP-09 |
| O-9 | Headless permissions for workers and oracles (`bypassPermissions` in a sandbox, or `acceptEdits` plus allow rules) | Grindinator | Decision | WP-06, WP-11 |
| O-10 | Bedrock versus Pro differences: Serper MCP, model pinning, Fable usage credits, rung models. WP-01 verified model pinning, rung models and `WebSearch` on a first-party login only; Bedrock and Pro are untested | All | Verify | WP-01, WP-11 |
| O-11 | Package input contract until Interviewinator exists | Grindinator | Decision; closed by WP-06 | WP-06 |
| O-12 | Docs: README, reference, e2e runbook, repo `CLAUDE.md` | All | Docs | WP-11 |

## Runner contract

The runner and the plugins agree on environment variables, one result file per session, a Git branch, and a state directory. Field names below are proposals; the Claude Code payloads they depend on are the ones WP-01 measured.

The runner can rely on these `claude -p --output-format stream-json --verbose` facts (WP-01 V2):

- The process exits 0 on success and 1 on an API error or a usage limit; the exit code alone does not tell a limit from another error.
- `system/init` comes first, and `session_id` is on every message type.
- A session can emit several `result` messages, numbered by `result_index`, when background workers start new turns. The runner reads the last one.
- A failed `result` still has `subtype: "success"`. Failure shows as `is_error: true`, with `api_error_status` (429 on a limit, 400 on a bad request) and `terminal_reason: "api_error"`.
- A permission denial is a `system/permission_denied` stream event; `result.permission_denials` stays empty (V8).

### Environment

| Variable | Set by | Read by | Meaning |
| --- | --- | --- | --- |
| `DECIDINATOR_MODE=sidecar` | Runner | Decidinator | Arms every session at start in sidecar mode |
| `DECIDINATOR_CONTEXT=<package id>` | Runner | Decidinator | Labels log and sidecar entries with the package |
| `TIERMINATOR_RESULT_FILE=<absolute path>` | Runner | Tierminator (new) | Where the session writes its result; default is beside the plan file |
| `DECIDINATOR_LOG` | Runner | Decidinator | The decision log path during a run (R-D5) |
| `DECIDINATOR_SIDECAR` | Runner | Decidinator | The sidecar path during a run (R-D5) |
| `GRINDINATOR_CLAUDE_BIN` | Tests | Runner | Replaces `claude` with a stub that emits canned stream-json |
| `GRINDINATOR_PACKAGE=<package id>` | Runner | Gate command | The package the gate is checking (WP-08) |
| `GRINDINATOR_DEBUG=1` | User | Runner | Debug log in the temp directory, never stdout |

### Result file

Tierminator writes one JSON file when a run ends, with `version: 1` and these fields: `sessionId`, `outcome`, `planFile`, `tasksFile`, `tasksDone`, `tasksNotRun`, `haltedAt`, `reason`, `limit`, `headCommit`, and `endedAt`. The `limit` field is `null` or `{detectedAt, resetsAt, raw}`. `raw` is the `StopFailure` payload, which has no reset field. `resetsAt` comes from `quotaLimits.resetsAt` (Unix seconds) on the error message in the transcript at the payload's `transcript_path`, and is null when that is absent, as on an API-key login (WP-01 V1, V3).

| Outcome | Meaning | Runner action |
| --- | --- | --- |
| `complete` | Every task finished and committed | Commit decision files, run the gate, write the marker |
| `halted` | A task failed past its retries or a worker exceeded its resumes | Stop the run and report `haltedAt` |
| `limit` | A usage limit ended the session | Wait, then recover by phase |
| `no-plan` | Planning ended without a valid plan after three tries | Stop the run |
| `declined` | Preconditions failed (dirty tree, plan mode, no commit identity, missing plan file, unknown task id) | Stop the run and report `reason` |

If the process exits and no result file exists, the runner reads the last `result` in the stream log first: `is_error: true` with `api_error_status: 429` is a `limit`. Otherwise it treats the attempt as `crashed`. With no plan file created, it retries once from planning. Otherwise it stops.

### Limits and recovery

The reset time comes from the first available source (WP-01 V1, V3):

1. The result file's `limit.resetsAt`, which Tierminator reads from the transcript's `quotaLimits.resetsAt`.
2. `rate_limit_info.resetsAt` (Unix seconds) on the last `rate_limit_event` in the stream log before the limit `result`. Claude Code emits this event on every request, not only on a limit, so an earlier one can hold an older reset.
3. A fixed five-hour wait.

Sources 1 and 2 exist only on an OAuth login; an API-key login reports no reset time, so it always falls to the fixed wait. The `resets 1:51am (America/New_York)` text in the result and in `last_assistant_message` has no date, so the runner does not parse it. A grace of five minutes is added. The runner sleeps in chunks of at most 60 seconds and compares the wall clock to the target, so a machine that slept through the reset resumes promptly. A reset more than 24 hours away (a weekly limit) stops the run cleanly unless `--wait-weekly` is set.

| Phase when the limit hit | Recovery |
| --- | --- |
| No plan file saved yet | Discard uncommitted changes, rerun the package from planning |
| Plan saved, tasks pending | Discard uncommitted changes, launch `/tierminator:execute <planFile> --from <first unfinished task>` |
| All tasks committed | Treat as `complete` |

A limit is never counted as a failed package. The default is at most three consecutive limit waits per package.

### Git and state

The runner creates `grindinator/<run name>` from the current `HEAD`, refuses to start on a dirty tree, and never pushes. Discard-and-relaunch recovery is allowed only on that branch. Runner state lives in `.grindinator/`, excluded through `.git/info/exclude` so the tree stays clean:

- `state.json`: per-package status (`pending`, `running`, `done`, `failed`), attempts, session IDs, timestamps, each limit attempt's wait, and the relaunch point after a limit (`resume`).
- `done/<id>.done`: written only after the gate passes; re-running skips these packages.
- `runs/<id>/attempt-<n>`: the stream log (`stream.jsonl`, `stderr.txt`), the result file (`result.json`), and the gate output (`gate.stdout.txt`, `gate.stderr.txt`).
- `summary.md`: written at the end of every run, including open sidecar questions.
- `decisions/decisions.md` and `decisions/open-questions.md`: Decidinator's decision log and sidecar while a package runs (R-D5).

WP-01 V7 found that an oracle write to a repo path during planning blocks Tierminator's run start, and a write during the run lands in an unrelated task commit. A write under the excluded `.grindinator/` does neither. So during a run Decidinator writes under `.grindinator/decisions/`, through `DECIDINATOR_LOG` and `DECIDINATOR_SIDECAR`. Before the first package the runner seeds both files from the configured repo paths when those exist. After each complete package it copies them over the repo paths and commits them, so the repo copies stay current and the next package starts clean.

### Runner exit codes

| Code | Meaning |
| --- | --- |
| 0 | Every package is done |
| 1 | A package failed its gate or halted |
| 2 | Preconditions failed |
| 3 | Stopped on a limit it would not wait out |
| 4 | Interrupted by the user; state is intact and a re-run resumes |

## Component requirements

Each component changes in a small, testable way, and every change keeps the repo's existing conventions: Node 20 scripts, hooks that never fail loudly, no activity in an inactive session, and findings docs backed by evidence files.

### Tierminator

- **R-T1, result file (O-1):** write the result file at every run end: completion, halt, a typed prompt interrupting the run, no valid plan, a declined start. `SessionEnd` writes a `halted` record with reason `session ended during run` if the state still says running. The path is `TIERMINATOR_RESULT_FILE` when set, else `<plan>.result.json`. Writing happens only for sessions Tierminator has activated.
- **R-T2, limit capture (O-2):** register a `StopFailure` hook that is inert unless the session is active. WP-01 V1 found that it fires in `-p` with `error: "rate_limit"` on a usage limit and `error: "unknown"` on another API error, and that its payload has no reset field. On `rate_limit` the hook records `limit.detectedAt`, reads the reset time from `quotaLimits.resetsAt` on the error message in the transcript at `transcript_path` (null when absent), keeps the raw payload, then writes the result file with outcome `limit`. `SessionEnd` fires after `StopFailure` with `reason: "other"`, the same as a normal end (V4), so R-T1's `SessionEnd` record must not overwrite a `limit` result. The plan, tasks and telemetry files stay in place.
- **R-T3, headless execute (O-3):** WP-01 V5 found that `/tierminator:execute <plan> [--from Txx]` already runs in a headless session with no approval: each task committed, and `--from` skipped the earlier tasks. It refuses a dirty tree, where an untracked file counts, and plan mode. A list number does not resolve in a fresh session, so the runner always passes the plan path. This package shrinks to the result file, tests and docs. Workers write `Tierminator-Task:` and `Tierminator-Plan:` as separate `-m` paragraphs, so Git does not read them as trailers; anything that finds a commit's task reads the message body, or the worker writes both lines in one paragraph. Built in WP-05: the `declined` and `complete` results for a headless execute that does not start, tests in tests/tierminator/execute-headless.test.js, README and reference updated. Decided in WP-05: workers keep the two lines as separate paragraphs; anything that finds a task's commit reads the message body (`git log --grep` and a line match), as Tierminator does, documented in the Tierminator reference's 'The worker'. A one-paragraph form would not help, since the Co-Authored-By paragraph follows it.

### Decidinator

- **R-D1, headless consult (O-4):** in an armed headless session, `SessionStart` injects a rule saying `AskUserQuestion` is unavailable, and that every open decision goes to `oracle-1` with the standard dispatch, escalating by the ladder. In sidecar mode the highest-confidence answer is recorded as provisional and the session continues; it never stops to wait for a person. Built in WP-04: a headless session is always armed in sidecar mode (DECIDINATOR_MODE=ask runs as sidecar), and the rule asks for a prompt starting Decidinator question NEW.
- **R-D2, recording:** the existing `SubagentStop` recorder must write the decision log and sidecar in headless sessions. WP-01 V6 found that it writes nothing for a direct oracle dispatch: it records a verdict only for a question that is due and in flight in the session state, and today only `gate.js` creates that record, on `AskUserQuestion`. A headless dispatch is never recorded. This is a required WP-04 change: the headless consult path opens the question record, so the recorder writes the log and sidecar. Built in WP-04: dispatch-check.js opens the question record from the headless dispatch; the recorder is unchanged.
- **R-D3, enforcement (decide in the WP-04 plan):** the baseline is the injected rule alone. A stronger option is a `Stop` check that blocks once if the final message lists open questions absent from the log. Decided in WP-04: no Stop check. The baseline is the injected rule plus a headless variant of the plain-text-question nudge; add the log-matching Stop check only if the pilot shows few oracle calls on a substantial package.
- **R-D4, docs:** replace the README's headless limitation with the new behavior, and update the specification, reference and verification docs. Done in WP-04 (README, specification, reference, runbook).
- **R-D5, decision file paths (O-7):** Decidinator reads `DECIDINATOR_LOG` and `DECIDINATOR_SIDECAR` (relative to the project root, or absolute) ahead of the `decisionLog` and `sidecar` configuration keys. The runner sets them to `.grindinator/decisions/decisions.md` and `.grindinator/decisions/open-questions.md`, which `.git/info/exclude` hides, so oracle writes during a package never dirty the tree and survive Tierminator's `git clean -fd`. Before the first package the runner seeds both files from the configured repo paths when those exist; after each complete package it copies them over the repo paths and commits them (WP-10). Built in WP-04 (config.js reads the variables; seeding and copying the files stays WP-10).

### Grindinator

- **R-G1, packages (O-11):** a package is a Markdown file named `WP-NN · Title.md` in a directory, ordered by filename. Its text is the prompt, behind an optional preamble file that tells the agent to re-read `CLAUDE.md`, `AGENTS.md` and the spec, and to produce a mechanical task list. Built in WP-06 (`tools/grindinator/lib/packages.js`): the id is `WP-` and two or more digits; packages run in number order, then filename order; a near-miss name (starting `WP-` but not matching) is skipped with a warning; two packages with one id stop the run; the preamble is the `preamble` configuration key or `--preamble`, placed before the package text with a blank line between.
- **R-G2, configuration (O-9):** defaults, then `~/.claude/grindinator.json`, then `.claude/grindinator.json`, then flags. Keys cover the permission mode, allowed tools, planning model and effort, gate command, turn cap, limit wait rules, and continue-or-stop on failure. The default permission mode is `bypassPermissions`, used only on the runner branch: WP-01 V8 found that under `acceptEdits`, with or without `Bash(git:*)` and `Bash(node:*)` allow rules, every worker was denied reading the tasks file Tierminator writes beside the plan outside the repository, and the run halted at T01. `acceptEdits` was enough for an oracle that read only the repository. A smaller worker set, `acceptEdits` plus `--add-dir` for the plan directory, is untested. Built in WP-06 (`tools/grindinator/lib/config.js`): the keys are `permissionMode`, `allowedTools`, `model` (default `opus`), `effort` (default `medium`), `maxTurns`, `gate`, `onFailure`, `maxLimitWaits`, `waitWeekly` and `preamble`, each with a `run` flag. WP-07 added `maxSessionMinutes` (`--max-session-minutes`, default 480), the wall-clock cap on one session. WP-08 added `maxGateMinutes` (`--max-gate-minutes`, default 60), the wall-clock cap on the gate; a gate past it fails. Unlike Decidinator's loader it is strict: an unknown key or invalid value in either file or a flag stops `run` with exit 2, naming the file or flag and the key.
- **R-G3, runner:** exactly the lifecycle, contract, state and exit codes above, with a stub `claude` for tests. Built in WP-07: `lib/session.js` runs `claude -p "/tierminator:plan <preamble and package>" --output-format stream-json --verbose` with `--model`, `--effort`, `--permission-mode`, `--max-turns` and `--allowedTools` from the configuration, sets the five contract variables, and removes the variables an enclosing Claude Code session sets (`CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT` and the like). `lib/stream.js` reads the stream tolerantly: the session ID from `system/init`, the last `result`, the `system/permission_denied` events, and the reset on the last `rate_limit_event`. `lib/outcome.js` maps an attempt in this order: interrupted, a valid result file, a failed start (`crashed`), the wall-clock cap (`crashed`), a last `result` with `api_error_status: 429` (`limit`), else `crashed`. `lib/attempt.js` writes `runs/<id>/attempt-<n>/` (`stream.jsonl`, `stderr.txt`, `result.json`) and the attempt record in `state.json`. Until WP-08, `complete` writes the done marker and the run goes on; `halted`, `no-plan`, `declined` and `crashed` mark the package `failed` and exit 1. Until WP-09, `limit` leaves it `pending` and exits 3. SIGINT stops the session, leaves the package `pending` and exits 4. Built in WP-08: after a `complete` session the runner checks that the session stayed on the run branch and that `HEAD` advanced from the package's start commit, else the outcome is `unverified`. It then runs the gate through the shell in the project root (`lib/gate.js`), with `GRINDINATOR_PACKAGE` set and its output in the attempt directory, and writes the done marker only when the gate passes or none is configured; a failing gate is `gate-failed`. A failed package stops the run with exit 1 unless `onFailure` is `continue`, which discards uncommitted changes (`git.discard`, refused off the run branch), keeps the failed package's commits, runs the rest and exits 1. `lib/summary.js` writes `summary.md` at the end of every run that reached its packages: each package's status, attempts, last outcome, commits and gate result, and the stop reason; open sidecar questions are WP-10. Built in WP-09 (`lib/limit.js`): after a `limit` attempt the runner discards uncommitted changes at once, so a stop leaves the tree clean, then takes the reset from the result file's `limit.resetsAt`, then the stream's last `rate_limit_event`, then a fixed five hours (a reset not after the current time is skipped as stale), adds five minutes of grace, and sleeps in chunks of at most 60 seconds on an injectable clock. The phase comes from the result file and the plan file on disk, found by session ID in the plans directory when there is no result file: no plan file reruns planning; a saved plan launches `/tierminator:execute "<plan>" --from <first task not run>`, with no `--from` when the tasks are unknown, so Tierminator skips the committed ones; every task committed is treated as `complete`. The package's `resume` in `state.json` keeps the relaunch point across runs, and each limit attempt's `wait` records the source, reset, wake time and status, listed under Limit waits in `summary.md`. More than `maxLimitWaits` limits in a row for one package within one run, or a reset more than 24 hours away without `--wait-weekly`, stops with exit 3. SIGINT during a wait exits 4, and a re-run relaunches at once.
- **R-G4, packaging:** a standalone Node 20 tool at `tools/grindinator/` with a `package.json` `bin` entry, run from a terminal with `npm link` or by path. It is not a plugin and is not listed in `marketplace.json`; it does nothing until the user starts it. Built in WP-06: `grindinator run` (the precondition checks; WP-07 added the session launch), `status` and `reset <id>`; state in `tools/grindinator/lib/state.js`, Git checks in `lib/git.js`, and the stub `claude` at `tests/grindinator/fixtures/claude-stub.js`, selected by `GRINDINATOR_CLAUDE_BIN` (a `.js` path runs under Node).

## Work package index

Eleven packages build this in dependency order, and each runs as one plan-mode session starting with WP-01. WP-01's findings can change later packages, so apply its fallbacks to this spec before running them.

| Package | Title | Depends on | Closes |
| --- | --- | --- | --- |
| WP-01 | Headless verification spike | none | O-3 (part), O-6, O-7 (part), O-10 (part) |
| WP-02 | Tierminator result file | WP-01 | O-1 |
| WP-03 | Tierminator limit capture | WP-01, WP-02 | O-2 |
| WP-04 | Decidinator headless consult mode | WP-01 | O-4 |
| WP-05 | Tierminator headless execute and resume | WP-01, WP-02 | O-3 |
| WP-06 | Grindinator scaffold, config, packages, state | WP-01 | O-9 (part), O-11 |
| WP-07 | Session launch and stream parsing | WP-02, WP-06 | O-5 (part) |
| WP-08 | Gates, Git policy, failure policy, summary | WP-07 | O-5 (part), O-8 (part) |
| WP-09 | Limit recovery | WP-03, WP-05, WP-08 | O-8 |
| WP-10 | Decidinator integration in the runner | WP-04, WP-08 | O-5 (part), O-7 |
| WP-11 | End-to-end pilot and docs | all | O-9, O-10, O-12 |

WP-02, WP-04 and WP-06 can run in any order after WP-01, since they touch different plugins. Run the packages serially in a single working tree to avoid merge conflicts.

## Work packages

Each package is a self-contained prompt in its own file, named `WP-NN · Title.md`, one per row of the index above. Save this document as `docs/grindinator/Grindinator — Specification.md` in the marketplace repo before running WP-01, because every prompt cites it by section name.

## Rollout

Build first, then prove the pipeline attended, then widen to unattended batches; no stage starts until the previous one passes.

1. **Build in package order.** WP-01 first; then WP-02, WP-04 and WP-06 in any order; then WP-03, WP-05 and WP-07; then WP-08; then WP-09 and WP-10; then WP-11. Gate: each package's tests pass and the verification doc reflects any fallback.
2. **Harness check.** Run one trivial package attended and confirm four things: the headless plan runs to commits, the result file is written, a forced open decision reaches an oracle and lands in the log, and the tree is clean for the next package. Also run the stub limit scenario end to end.
3. **Pilot.** Run three real packages attended: an easy one, a typical one, and the hardest. Read each plan and the decision log closely. Then rerun them with the planner at `high` effort and compare.
4. **First unattended batch.** Run about 10 packages. Gate: review `summary.md`, the decision log, the sidecar and any failures before continuing.
5. **The rest,** in batches, with a summary skim between them.

Signals to tune on during the pilot and the first batch:

- **Tasks that still contain decisions** mean the planner effort is too low.
- **Few oracle calls on a substantial package** suggest the planner is deciding silently; consider the R-D3 enforcement.
- **Heavy `oracle-3` traffic** points to gaps in the packages, which are cheaper to fix than to keep paying the top rung for.
- **Turn-cap hits or gate failures** point to a plan or acceptance-criteria problem, not an effort problem.

## Risks and unverified assumptions

WP-01 ran the headless behaviors this spec rests on (`docs/grindinator/grindinator-verification.md`). The biggest remaining risk is that its limit results came from a mock 429, not a real usage limit.

| Risk | Why it matters | Mitigation or fallback |
| --- | --- | --- |
| A real limit behaves unlike the mock: WP-01 V1, V3 and V4 used a mock 429, so a real 429's headers, Claude Code's retries on it, and a weekly limit's report are unverified. `StopFailure` fires in `-p` but carries no reset field, and an API-key login reports no reset time | Limit recovery depends on detecting the limit and its reset | Detect the limit from `StopFailure` or the last `result`'s `api_error_status: 429`; read the reset from the transcript's `quotaLimits.resetsAt`, then the stream's `rate_limit_event`, else wait a fixed five hours plus grace |
| The injected consult rule is not followed in headless sessions | Open decisions would be made silently | Add the R-D3 `Stop` check; review the log and sidecar between batches |
| Oracle writes to the decision log dirty the tree. WP-01 V7: a write during planning blocked the run start, for a new and a tracked log; a write during the run was swept into an unrelated task commit | Tierminator needs a clean tree at start, and a discarded task would undo the decision with it | R-D5: during a run Decidinator writes under the excluded `.grindinator/decisions/`, which V7 showed neither blocks the run nor gets committed; the runner commits the files to their repo paths after each package. V7 used a probe stand-in, not a real oracle write |
| Discard-and-relaunch deletes work | `git reset --hard` plus `git clean -fd` is destructive | Allowed only on the runner's own branch, and refused anywhere else |
| A runner crash leaves the branch dirty | The next start would be refused | Start refuses a dirty tree and says so; the user discards or commits, then re-runs |
| Fifty packages hit Pro limits repeatedly | Long wall-clock time and many waits | Cap consecutive waits, stop on weekly limits, and keep `.done` markers so any re-run continues |
| Fable escalations bill separately on Pro | Cost surprises on the top rung | Watch `oracle-3` traffic during the pilot |
| Bedrock lacks built-in web search, and rung models are untested on Bedrock and Pro; WP-01 V9 verified them on a first-party login only | Oracle research quality and model resolution | Run the probe's `models` cell on each setup before relying on the rungs there, and the Serper MCP setup documented in WP-11 if `WebSearch` is missing |
| Broad headless permissions: WP-01 V8 found workers need `bypassPermissions`, because under `acceptEdits` they cannot read the tasks file outside the repository | `bypassPermissions` lets workers run anything | Use it only in a sandbox on the runner branch; `acceptEdits` plus `--add-dir` for the plan directory is an untested alternative |
| Claude Code changes headless behavior in a later release | Findings go stale | The verification doc records Claude Code 2.1.289; rerun the probe after upgrades |
