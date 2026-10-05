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

| Capability | Status | Basis |
| --- | --- | --- |
| Headless detection | Exists | Tierminator reads `CLAUDE_CODE_ENTRYPOINT` (`sdk-cli`); Decidinator's verification also records `CLAUDE_CODE_SESSION_ATTENDED=0` |
| Unattended plan and run via `claude -p "/tierminator:plan ..."` | Exists | The plan is the final message, saved to a `tierminator-unattended-*.md` plan file, then run with no approval |
| Plan-mode `TIERMINATOR_AUTOPILOT` arming | Not needed | The headless `/tierminator:plan` command arms the session; no environment variable exists |
| Worker turn-limit resume (max 2) | Exists | README, `h4-dispatch.js` |
| Resume a saved plan: `/tierminator:execute [path or number] [--from Txx]` | Exists, headless unverified | Documented interactively; the README's headless section covers only `/tierminator:plan` |
| Run result a caller can read | Missing | Session state is deleted at `SessionEnd`; only the plan, tasks and telemetry files persist |
| Usage-limit capture (`StopFailure`) | Missing | No such hook in `hooks.json`, and no limit handling in plugin code |
| Decidinator arming by `DECIDINATOR_MODE`, labels by `DECIDINATOR_CONTEXT` | Exists | `session-start.js`, README |
| Decidinator question interception in headless sessions | Does not work | `AskUserQuestion` does not exist headless; README lists this as out of scope |
| Decidinator log, sidecar, export, import | Exists | Commands and file formats are built |
| Oracle rung models | Honored outside plan mode | Unattended planning runs outside plan mode, so the rungs should apply; untested on Bedrock and Pro |

Two integration facts matter for the runner. First, Decidinator writes its decision log and sidecar into the repository, while Tierminator requires a clean working tree at start. Second, Tierminator's own failure cleanup runs `git reset --hard` and `git clean -fd`, which is safe only on a branch the runner owns.

## Architecture

Grindinator owns sequencing and recovery, Tierminator owns one package's planning and execution, and Decidinator owns questions. They meet at four points only: environment variables going in, a Tierminator result file coming out, Decidinator's decision log and sidecar in the repo, and Git.

For one package the lifecycle is:

1. Check preconditions: clean tree, the runner's own branch, no `.done` marker for this package.
2. Launch `claude -p` with the package prompt behind `/tierminator:plan`, with Decidinator armed through the environment and the result-file path set.
3. Tierminator plans read-only, consults oracles for open decisions, saves the plan, and runs the tasks as committed worker attempts.
4. When the session ends, read the result file.
5. If the outcome is `complete`: commit Decidinator's log and sidecar changes, run the gate, write the `.done` marker.
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
| O-3 | Headless `/tierminator:execute` and `--from` resume are unverified | Tierminator | Verify, then gap | WP-01, WP-05 |
| O-4 | Decidinator does nothing in headless sessions, so open decisions go unresolved | Decidinator | Gap | WP-04 |
| O-5 | No runner: discovery, state, gates, failure policy, summary | Grindinator | Gap | WP-06 to WP-10 |
| O-6 | Headless unknowns: `StopFailure` payload, exit codes, stream-json result shape, `SessionEnd` on a limit, oracle dispatch and recorder in `-p` | All | Verify | WP-01 |
| O-7 | Oracle writes to the decision log leave a dirty tree; Tierminator needs a clean one | Grindinator, Decidinator | Verify, then gap | WP-01, WP-10 |
| O-8 | Recovery after an interrupted run needs a discard-and-relaunch policy on a runner-owned branch | Grindinator | Decision | WP-08, WP-09 |
| O-9 | Headless permissions for workers and oracles (`bypassPermissions` in a sandbox, or `acceptEdits` plus allow rules) | Grindinator | Decision | WP-06, WP-11 |
| O-10 | Bedrock versus Pro differences: Serper MCP, model pinning, Fable usage credits, rung models untested | All | Verify | WP-01, WP-11 |
| O-11 | Package input contract until Interviewinator exists | Grindinator | Decision | WP-06 |
| O-12 | Docs: README, reference, e2e runbook, repo `CLAUDE.md` | All | Docs | WP-11 |

## Runner contract

The runner and the plugins agree on environment variables, one result file per session, a Git branch, and a state directory. Field names below are proposals; WP-01 confirms the Claude Code payloads they depend on.

### Environment

| Variable | Set by | Read by | Meaning |
| --- | --- | --- | --- |
| `DECIDINATOR_MODE=sidecar` | Runner | Decidinator | Arms every session at start in sidecar mode |
| `DECIDINATOR_CONTEXT=<package id>` | Runner | Decidinator | Labels log and sidecar entries with the package |
| `TIERMINATOR_RESULT_FILE=<absolute path>` | Runner | Tierminator (new) | Where the session writes its result; default is beside the plan file |
| `GRINDINATOR_CLAUDE_BIN` | Tests | Runner | Replaces `claude` with a stub that emits canned stream-json |
| `GRINDINATOR_DEBUG=1` | User | Runner | Debug log in the temp directory, never stdout |

### Result file

Tierminator writes one JSON file when a run ends, with `version: 1` and these fields: `sessionId`, `outcome`, `planFile`, `tasksFile`, `tasksDone`, `tasksNotRun`, `haltedAt`, `reason`, `limit`, `headCommit`, and `endedAt`. The `limit` field is `null` or `{detectedAt, resetsAt, raw}`, with `resetsAt` null when unknown.

| Outcome | Meaning | Runner action |
| --- | --- | --- |
| `complete` | Every task finished and committed | Commit decision files, run the gate, write the marker |
| `halted` | A task failed past its retries or a worker exceeded its resumes | Stop the run and report `haltedAt` |
| `limit` | A usage limit ended the session | Wait, then recover by phase |
| `no-plan` | Planning ended without a valid plan after three tries | Stop the run |
| `declined` | Preconditions failed (dirty tree, plan mode, no commit identity) | Stop the run and report `reason` |

If the process exits and no result file exists, the runner treats the attempt as `crashed`. With no plan file created, it retries once from planning. Otherwise it stops.

### Limits and recovery

The reset time comes from the first available source: the result file's `limit.resetsAt`, a field WP-01 finds in the transcript or stream, then a fixed five-hour wait. A grace of five minutes is added. The runner sleeps in chunks of at most 60 seconds and compares the wall clock to the target, so a machine that slept through the reset resumes promptly. A reset more than 24 hours away (a weekly limit) stops the run cleanly unless `--wait-weekly` is set.

| Phase when the limit hit | Recovery |
| --- | --- |
| No plan file saved yet | Discard uncommitted changes, rerun the package from planning |
| Plan saved, tasks pending | Discard uncommitted changes, launch `/tierminator:execute <planFile> --from <first unfinished task>` |
| All tasks committed | Treat as `complete` |

A limit is never counted as a failed package. The default is at most three consecutive limit waits per package.

### Git and state

The runner creates `grindinator/<run name>` from the current `HEAD`, refuses to start on a dirty tree, and never pushes. Discard-and-relaunch recovery is allowed only on that branch. Runner state lives in `.grindinator/`, excluded through `.git/info/exclude` so the tree stays clean:

- `state.json`: per-package status (`pending`, `running`, `done`, `failed`), attempts, session IDs, timestamps.
- `done/<id>.done`: written only after the gate passes; re-running skips these packages.
- `runs/<id>/attempt-<n>`: the stream log, result file, and gate output.
- `summary.md`: written at the end of every run, including open sidecar questions.

Decidinator's log and sidecar stay in the repo at their configured paths. The runner commits them after each package so the next package starts clean.

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
- **R-T2, limit capture (O-2):** register a `StopFailure` hook that is inert unless the session is active. On a usage-limit failure it records `limit.detectedAt`, the reset time if the payload carries one, and the raw payload, then writes the result file with outcome `limit`. The plan, tasks and telemetry files stay in place.
- **R-T3, headless execute (O-3):** `/tierminator:execute <plan> [--from Txx]` works in a headless session with no approval, under the same preconditions as headless planning, and writes a result file. If WP-01 shows it already works, this package shrinks to tests and docs.

### Decidinator

- **R-D1, headless consult (O-4):** in an armed headless session, `SessionStart` injects a rule saying `AskUserQuestion` is unavailable, and that every open decision goes to `oracle-1` with the standard dispatch, escalating by the ladder. In sidecar mode the highest-confidence answer is recorded as provisional and the session continues; it never stops to wait for a person.
- **R-D2, recording:** the existing `SubagentStop` recorder must write the decision log and sidecar in headless sessions. WP-01 verifies this; WP-04 fixes it if it fails.
- **R-D3, enforcement (decide in the WP-04 plan):** the baseline is the injected rule alone. A stronger option is a `Stop` check that blocks once if the final message lists open questions absent from the log.
- **R-D4, docs:** replace the README's headless limitation with the new behavior, and update the specification, reference and verification docs.

### Grindinator

- **R-G1, packages (O-11):** a package is a Markdown file named `WP-NN · Title.md` in a directory, ordered by filename. Its text is the prompt, behind an optional preamble file that tells the agent to re-read `CLAUDE.md`, `AGENTS.md` and the spec, and to produce a mechanical task list.
- **R-G2, configuration (O-9):** defaults, then `~/.claude/grindinator.json`, then `.claude/grindinator.json`, then flags. Keys cover the permission mode, allowed tools, planning model and effort, gate command, turn cap, limit wait rules, and continue-or-stop on failure.
- **R-G3, runner:** exactly the lifecycle, contract, state and exit codes above, with a stub `claude` for tests.
- **R-G4, packaging:** a standalone Node 20 tool at `tools/grindinator/` with a `package.json` `bin` entry, run from a terminal with `npm link` or by path. It is not a plugin and is not listed in `marketplace.json`; it does nothing until the user starts it.

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

The biggest risk is that this spec rests on a read of the repo and on Claude Code behaviors nobody has run headless yet; WP-01 exists to retire that.

| Risk | Why it matters | Mitigation or fallback |
| --- | --- | --- |
| `StopFailure` is missing, does not fire in `-p`, or carries no reset time | Limit recovery depends on it | Read the reset time from another source WP-01 finds, else wait a fixed five hours plus grace |
| The injected consult rule is not followed in headless sessions | Open decisions would be made silently | Add the R-D3 `Stop` check; review the log and sidecar between batches |
| Oracle writes to the decision log dirty the tree during planning | Tierminator needs a clean tree at start | The runner commits decision files after each package; if WP-01's V7 shows a run-start failure, move or defer those writes |
| Discard-and-relaunch deletes work | `git reset --hard` plus `git clean -fd` is destructive | Allowed only on the runner's own branch, and refused anywhere else |
| A runner crash leaves the branch dirty | The next start would be refused | Start refuses a dirty tree and says so; the user discards or commits, then re-runs |
| Fifty packages hit Pro limits repeatedly | Long wall-clock time and many waits | Cap consecutive waits, stop on weekly limits, and keep `.done` markers so any re-run continues |
| Fable escalations bill separately on Pro | Cost surprises on the top rung | Watch `oracle-3` traffic during the pilot |
| Bedrock lacks built-in web search, and rung models are untested on Bedrock and Pro | Oracle research quality and model resolution | WP-01 V9 and the Serper MCP setup documented in WP-11 |
| Broad headless permissions | `bypassPermissions` lets workers run anything | Use it only in a sandbox on the runner branch; otherwise `acceptEdits` plus allow rules |
| Claude Code changes headless behavior in a later release | Findings go stale | Record the version in the verification doc and rerun the probe after upgrades |
