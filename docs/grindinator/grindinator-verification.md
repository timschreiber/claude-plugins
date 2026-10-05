# Grindinator verification (WP-01)

Measured 2026-10-05 (03:51 to 03:58 UTC) on Claude Code 2.1.289 (Windows 11), on one first-party
claude.ai login. Method: one headless `claude -p --output-format stream-json --verbose` session per
cell, each in a fresh Git repository under the OS temp directory, launched by
`node probes/grindinator/run.js <cell>` with the plugins under test and the hook-logging probe
plugin loaded through `--plugin-dir` (cell definitions in `probes/grindinator/README.md`). Twenty
cells ran. The cells that test limits and errors (`error`, `limit-oauth`, `limit-oauth-noretry`,
`limit-apikey`) point `ANTHROPIC_BASE_URL` at a local mock API (`probes/grindinator/mock-api.js`), so
their results are simulated; `pass` forwards through the mock to the real API.

Evidence: `probes/evidence/grindinator-verification-results.json` (every cell's analysis, written
by `probes/grindinator/summarize.js`) and, per cell, `probes/evidence/grindinator-<cell>-*`:
`-stream.jsonl` (raw stdout), `-hooks.jsonl` (raw hook inputs with an environment snapshot),
`-agents.json` (one row per `SubagentStop`), `-transcript.jsonl` (the main session transcript),
`-run.json` (arguments, exit code, stderr, Git state), `-analysis.json`, and `-mock.jsonl` when a
mock ran. Secrets never appear in the evidence: the mock logs header names only, and the hook
records redact `CLAUDE_CODE_MESSAGING_TOKEN`.

## Results

| Item | What | Observed | Result | Evidence | Fallback if not a pass |
|---|---|---|---|---|---|
| V1 | `StopFailure` on a usage limit in `-p` | Fired in all three limit cells with `error: "rate_limit"`, and in the 400 cell with `error: "unknown"`. Keys: `session_id`, `transcript_path`, `cwd`, `prompt_id`, `effort`, `hook_event_name`, `error`, `last_assistant_message`. No reset field; on OAuth the reset is only clock text in `last_assistant_message` | pass (simulated) | `grindinator-limit-oauth-hooks.jsonl`, `grindinator-limit-apikey-hooks.jsonl`, `grindinator-error-hooks.jsonl` | Read `resetsAt` from the transcript at `transcript_path` (see V3); if none, a fixed five-hour wait |
| V2 | stream-json shapes and exit codes | `system/init` first, one `result` per turn; `session_id` on every message type. Exit 0 on success, 1 on an API error, 1 on a limit. Errors and limits still have `subtype: "success"`, with `is_error: true`, `api_error_status` and `terminal_reason: "api_error"` | pass (limit exit code simulated) | `grindinator-success-stream.jsonl`, `grindinator-error-stream.jsonl`, `grindinator-limit-oauth-stream.jsonl`, `grindinator-*-run.json` | n/a |
| V3 | Where a reset time can be read | Stream: `rate_limit_event.rate_limit_info.resetsAt` (Unix seconds). Transcript: `quotaLimits.resetsAt` on the error message. Result text: `resets 1:51am (America/New_York)`. All three only with an OAuth login; with an API key, none found | pass (simulated) | `grindinator-limit-oauth-stream.jsonl`, `grindinator-limit-oauth-transcript.jsonl`, `grindinator-limit-apikey-stream.jsonl`, `grindinator-pass-mock.jsonl` | API-key login: fixed five-hour wait plus grace |
| V4 | `SessionEnd` when a limit ends the session | Fired once in every limit cell, `reason: "other"`, the same reason as every successful cell | pass (simulated) | `grindinator-limit-oauth-analysis.json`, `grindinator-success-analysis.json` | n/a; the reason does not tell a limit from a normal end, so use `StopFailure` for that |
| V5 | Headless `/tierminator:execute <plan> [--from Txx]` | Path form ran both tasks with no approval, each committed; `--from T02` skipped T01 and ran T02. A list number (`1`) does not resolve in a fresh session. Refused on an untracked file and in plan mode | pass | `grindinator-execute-bypass-*`, `grindinator-execute-from-*`, `grindinator-execute-number-*`, `grindinator-execute-dirty-*`, `grindinator-execute-plan-mode-*` | n/a; the runner always passes the plan path |
| V6 | Decidinator in `-p` with `DECIDINATOR_MODE=sidecar` | Armed by env; oracle dispatched through `Agent`; `SubagentStop` fired with the report; a valid verdict. No decision log or sidecar written, because the recorder acts only on a question the gate opened. Rung models applied outside plan mode, rung 3 on Fable | partial | `grindinator-decide-sidecar-*`, `grindinator-models-agents.json`, `grindinator-models-hooks.jsonl` | WP-04 (R-D1, R-D2): the headless consult path must open the question record so the recorder writes the log and sidecar |
| V7 | Decision-log writes versus Tierminator's clean tree | A write during unattended planning blocked the run start, both for a new and a tracked `docs/decisions.md`; the plan was saved. A write during the run was swept into T01's commit by the worker's `git add -A`, leaving the tree clean. A write under an excluded `.grindinator/` path did not block, and the run completed clean | fail | `grindinator-v7-plan-new-*`, `grindinator-v7-plan-tracked-*`, `grindinator-v7-run-*`, `grindinator-v7-excluded-*` | Keep decision files out of the tracked tree while a package runs: write them under a path in `.git/info/exclude`, and the runner commits them to their configured paths after the package |
| V8 | Minimal headless permissions | `bypassPermissions`: workers ran and committed. `acceptEdits`, with or without `Bash(git:*)`/`Bash(node:*)` allow rules: every worker was denied `Read` (and `Bash cat`) of the tasks file outside the repository, and the run halted at T01. `acceptEdits` was enough for the oracle (in-repo `Glob` and `Read` only) | partial | `grindinator-execute-bypass-*`, `grindinator-execute-accept-edits-stream.jsonl`, `grindinator-execute-allow-rules-stream.jsonl`, `grindinator-decide-strict-*` | Workers: `bypassPermissions` on the runner branch. An `acceptEdits` set (adding the plan directory with `--add-dir`) is untested |
| V9 | Model pinning, rung models, web search: Pro and Bedrock | This first-party login: each probe agent ran on its configured model and effort, and `WebSearch` returned results. Bedrock and Pro: not testable here; rerun with `PROBE_TAG=bedrock node probes/grindinator/run.js models` (with `CLAUDE_CODE_USE_BEDROCK=1` and the AWS variables) and `PROBE_TAG=pro node probes/grindinator/run.js models` on a Pro login | partial; Bedrock and Pro not testable here | `grindinator-models-agents.json`, `grindinator-models-hooks.jsonl`, `grindinator-models-stream.jsonl` | Run the `models` cell on each setup before relying on the rungs there; on Bedrock, plan for the Serper MCP (WP-11) if `WebSearch` is missing |

## V1: StopFailure

`StopFailure` exists and fires in `claude -p`. The probe registers it in a separate plugin, so an
unknown event could not have disabled the main probe plugin; it was known. Each limit cell has
exactly one `StopFailure` record and one `SessionEnd` record, after `UserPromptSubmit`
(`hookEventCounts` in `grindinator-limit-oauth-analysis.json`, `grindinator-limit-oauth-noretry-analysis.json`
and `grindinator-limit-apikey-analysis.json`). No `Stop` fired in those cells.

Payload keys (`stopFailureKeys`): `session_id`, `transcript_path`, `cwd`, `prompt_id`, `effort`,
`hook_event_name`, `error`, `last_assistant_message`. There is no reset field. `error` is
`rate_limit` on a 429 and `unknown` on a 400 (`grindinator-error-hooks.jsonl`), so the hook can tell
a limit from another API error by `error` alone.

Sample, OAuth login (`grindinator-limit-oauth-hooks.jsonl`, paths trimmed):

```json
{
  "session_id": "232d6957-45aa-465f-968e-824a5ff69f1c",
  "transcript_path": "C:\\Users\\timsc\\.claude\\projects\\...\\232d6957-45aa-465f-968e-824a5ff69f1c.jsonl",
  "cwd": "C:\\Users\\timsc\\AppData\\Local\\Temp\\...\\limit-oauth\\repo",
  "prompt_id": "75f46ad6-f8be-42e9-a5a0-96416effcbec",
  "effort": { "level": "low" },
  "hook_event_name": "StopFailure",
  "error": "rate_limit",
  "last_assistant_message": "You've hit your session limit · resets 1:51am (America/New_York)"
}
```

With an API key (`grindinator-limit-apikey-hooks.jsonl`) the same 429 gives
`last_assistant_message: "API Error: Request rejected (429) · This request would exceed your account rate limit. Please try again later."`,
with no reset time.

No retry happened in any limit cell: `apiRetryErrors` is empty and each mock log has one
`/v1/messages` request (`grindinator-limit-oauth-mock.jsonl`), so `CLAUDE_CODE_MAX_RETRIES=0` changed
nothing. The mock answered `x-should-retry: false`, which may be why; a real limit's retry behavior
is unverified. Every limit cell ended within 4 seconds (`durationMs` in
`grindinator-verification-results.json`).

This is simulated: the 429 came from the mock, with the headers listed in
`probes/grindinator/README.md`. Claude Code turned them into its own limit message, so the
headers were read as a usage limit, but a limit on the real API was not triggered.

## V2: stream-json shapes and exit codes

`system/init` keys (`initKeys` in `grindinator-success-analysis.json`): `type`, `subtype`, `cwd`,
`session_id`, `tools`, `mcp_servers`, `model`, `permissionMode`, `slash_commands`,
`terminal_slash_commands`, `apiKeySource`, `claude_code_version`, `output_style`, `agents`,
`skills`, `plugins`, `capabilities`, `analytics_disabled`, `product_feedback_disabled`, `uuid`,
`memory_paths`, `messaging_socket_path`, `fast_mode_state`, `fast_mode_disabled_reason`,
`per_turn_effort_active`, `view_mode`, `powershell_path`. `apiKeySource` is `none` on the OAuth
login and `ANTHROPIC_API_KEY` in `limit-apikey` (`grindinator-limit-apikey-stream.jsonl`).

`result` keys (`resultKeys`): `duration_api_ms`, `stop_reason`, `session_id`, `total_cost_usd`,
`usage`, `modelUsage`, `permission_denials`, `terminal_reason`, `fast_mode_state`,
`fast_mode_disabled_reason`, `subagent_stats`, `is_error`, `num_turns`, `subtype`,
`api_error_status`, `result`, `ttft_ms`, `type`, `duration_ms`, `uuid`, `ttft_stream_ms`,
`time_to_request_ms`, `first_content_frame_ms`, `queued_turn_count`, `result_index`. The error and
limit results lack the four timing keys `ttft_ms`, `ttft_stream_ms`, `time_to_request_ms` and
`first_content_frame_ms` (`grindinator-error-stream.jsonl`).

`session_id` is on every message type seen: `system/init`, `system/hook_started`,
`system/hook_response`, `assistant`, `user`, `rate_limit_event`, the `system/task_*` events and
`result` (`sessionIdIn` in `grindinator-decide-sidecar-analysis.json`).

| Cell | Exit code | `subtype` | `is_error` | `api_error_status` | `terminal_reason` | `result` |
|---|---|---|---|---|---|---|
| `success` | 0 | `success` | false | null | `completed` | `OK` |
| `error` (mock 400) | 1 | `success` | true | 400 | `api_error` | `API Error: 400 probe: invalid request` |
| `limit-oauth` (mock 429) | 1 | `success` | true | 429 | `api_error` | `You've hit your session limit · resets 1:51am (America/New_York)` |
| `limit-apikey` (mock 429) | 1 | `success` | true | 429 | `api_error` | `API Error: Request rejected (429) · ...` |

Sources: `exitCode` in `grindinator-success-run.json`, `grindinator-error-run.json`,
`grindinator-limit-oauth-run.json` and `grindinator-limit-apikey-run.json`; the `result` lines of
the matching `-stream.jsonl` files. So `subtype` does not signal failure; `is_error` and
`api_error_status` do. A limit and another API error share exit code 1. The error and limit
`assistant` messages carry `"model": "<synthetic>"` and a top-level `error` field (`unknown`,
`rate_limit`).

**A session can emit several `result` messages.** In `execute-bypass` the workers ran in the
background, and each task notification started a new turn: three `system/init` and three `result`
messages in one process, with `result_index` 0, 1 and 2, all with the same `session_id`
(`grindinator-execute-bypass-stream.jsonl`). The first result says T01 is running; only the last
reports the finished run. A caller must read the last `result`, not the first.

Trimmed sample, the limit `result` (`grindinator-limit-oauth-stream.jsonl`):

```json
{"type":"result","subtype":"success","is_error":true,"api_error_status":429,
 "terminal_reason":"api_error","num_turns":1,"total_cost_usd":0,
 "session_id":"232d6957-45aa-465f-968e-824a5ff69f1c",
 "result":"You've hit your session limit · resets 1:51am (America/New_York)", "...": "..."}
```

## V3: reset time

The mock's 429 set `anthropic-ratelimit-unified-reset` and `anthropic-ratelimit-unified-5h-reset`
to `1791179511` (2026-10-05T05:51:51Z) in `limit-oauth`. The reset surfaced in three places
(`resetFound` in `grindinator-limit-oauth-analysis.json`, and the raw lines):

1. **Stream:** a `rate_limit_event` before the error (`grindinator-limit-oauth-stream.jsonl`):

   ```json
   {"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1791179511,
    "rateLimitType":"five_hour","isUsingOverage":false,
    "unifiedWindows":{"five_hour":{"utilization":1,"resetsAt":1791179511}}},
    "session_id":"232d6957-45aa-465f-968e-824a5ff69f1c"}
   ```

2. **Transcript:** the error message line has `"quotaLimits":{"status":"rejected","resetsAt":1791179511,"unifiedRateLimitFallbackAvailable":false,"rateLimitType":"five_hour","isUsingOverage":false}`,
   beside `"error":"rate_limit"` and `"apiErrorStatus":429` (`grindinator-limit-oauth-transcript.jsonl`).
   A `StopFailure` hook can read this through its `transcript_path`.
3. **Result text and `last_assistant_message`:** `resets 1:51am (America/New_York)`, local clock
   time with a time zone and no date. (The `1am` match in `resetFound.StopFailure` is a substring of
   `1:51am`, not a separate value.)

`limit-oauth-noretry` agrees (`resetsAt` `1791179500`, `grindinator-limit-oauth-noretry-stream.jsonl`).
With an API key, none found: no `rate_limit_event`, no `quotaLimits` and no reset text
(`grindinator-limit-apikey-stream.jsonl`, `grindinator-limit-apikey-transcript.jsonl`;
`resetFound` is empty).

**Mock versus real headers.** The `pass` cell forwarded to the real API and logged the response's
rate headers (`grindinator-pass-mock.jsonl`, request 2, status 200):

| Header | Mock 429 | Real 200 (`pass`) |
|---|---|---|
| `anthropic-ratelimit-unified-status` | `rejected` | `allowed` |
| `anthropic-ratelimit-unified-reset` | reset epoch | `1791177000` |
| `anthropic-ratelimit-unified-representative-claim` | `five_hour` | `five_hour` |
| `anthropic-ratelimit-unified-5h-status` | `rejected` | `allowed` |
| `anthropic-ratelimit-unified-5h-reset` | reset epoch | `1791177000` |
| `anthropic-ratelimit-unified-5h-utilization` | `1.0` | `0.09` |
| `anthropic-ratelimit-unified-7d-status` / `-7d-reset` / `-7d-utilization` | absent | `allowed` / `1791392400` / `0.09` |
| `anthropic-ratelimit-unified-overage-status` / `-overage-reset` / `-overage-utilization` | absent | `allowed` / `1793491200` / `0.0` |
| `anthropic-ratelimit-unified-fallback-percentage` | absent | `0.5` |
| `retry-after`, `x-should-retry` | present | absent |

Every header name the mock sent that the real API also sends matches it. The real API adds the
seven-day, overage and fallback headers, and on a 200 sends no `retry-after` or `x-should-retry`;
a real 429's headers were not observed. On the real response, `success` streamed
`rate_limit_event` with `resetsAt: 1791177000`, the same value as the real header, plus
`seven_day` and overage fields (`grindinator-success-stream.jsonl`). So Claude Code fills
`rate_limit_event` from these headers on every request, not only on a limit.

## V4: SessionEnd on a limit

`SessionEnd` fired once in each limit cell, after `StopFailure`, with `reason: "other"`
(`sessionEndReasons` in `grindinator-limit-oauth-analysis.json`, `grindinator-limit-oauth-noretry-analysis.json`,
`grindinator-limit-apikey-analysis.json`). Every other cell's `SessionEnd` also has `reason: "other"`
(`grindinator-success-analysis.json`), so `SessionEnd` cannot tell a limit from a normal end.
Payload keys: `session_id`, `transcript_path`, `cwd`, `prompt_id`, `hook_event_name`, `reason`.
Simulated, as V1.

## V5: headless `/tierminator:execute`

The plan is `probes/grindinator/fixtures/plan.md` (T01 adds `hello.txt`, T02 adds `world.txt`),
copied outside the repository. No cell asked for approval.

| Cell | Prompt and mode | Preconditions observed | Outcome |
|---|---|---|---|
| `execute-bypass` | `/tierminator:execute "<plan>"`, `bypassPermissions` | Clean tree, a commit identity, not in plan mode | Ran. Two `sonnet-low` workers, commits `Add hello.txt` and `Add world.txt`, tree clean, tasks and telemetry files written beside the plan |
| `execute-from` | `... --from T02`, `bypassPermissions` | As above | Ran T02 only: one worker, one commit `Add world.txt`; `hello.txt` absent; result: "T01 was skipped because of `--from T02`" |
| `execute-number` | `/tierminator:execute 1`, `bypassPermissions` | No plan list shown earlier in the session | Did not run: "tierminator has no plan list in this session yet, so it couldn't resolve "1"", followed by the recent-plans list from `~/.claude/plans` |
| `execute-dirty` | path form, untracked `scratch.txt` | Dirty tree (an untracked file counts) | Refused: "the working tree has uncommitted changes: the untracked file `scratch.txt`"; no tasks file |
| `execute-plan-mode` | path form, `--permission-mode plan` | Plan mode | Refused: "Tierminator can't run this plan while plan mode is on"; no tasks file |

Evidence: `committedTasks`, `commits`, `files`, `clean`, `tasksFile`, `telemetryFile`, `refusals`
and `workerDispatches` in `grindinator-execute-bypass-analysis.json`, `grindinator-execute-from-analysis.json`,
`grindinator-execute-number-analysis.json`, `grindinator-execute-dirty-analysis.json` and
`grindinator-execute-plan-mode-analysis.json`; the result text in each `-stream.jsonl`.

Two probe readings need correcting:

- `activated` is false in every execute cell because the probe looked for
  `tierminator: running the plan`, which only the `/tierminator:plan` path prints (it is in
  `grindinator-v7-excluded-stream.jsonl`). The execute runs did run: the stream has
  `tierminator: T01 on sonnet-low done: ...` lines (`grindinator-execute-bypass-stream.jsonl`).
- `committedTasks` is empty and every commit's `task` is null, although the workers wrote the
  trailer. The worker's command was
  `git commit -q -m "Add hello.txt" -m "Tierminator-Task: T01" -m "Tierminator-Plan: 45f944a6e4413ef5" -m "Co-Authored-By: ..."`
  (`grindinator-execute-bypass-hooks.jsonl`). Each `-m` is its own paragraph, and Git reads only
  the last paragraph as the trailer block, so `%(trailers:key=Tierminator-Task)` finds nothing.
  Anything that reads the task from Git trailers (the runner, or Tierminator's result file) must
  parse the message body instead, or the worker must put the trailers in one paragraph.

## V6: Decidinator in `-p`

Cell `decide-sidecar`: `DECIDINATOR_MODE=sidecar`, `DECIDINATOR_CONTEXT=WP-PROBE`,
`--permission-mode acceptEdits`, main session told to dispatch `decidinator:oracle-1` with question
Q-0001 (`grindinator-decide-sidecar-run.json`).

- **Arming: yes.** `SessionStart` returned `{"systemMessage":"decidinator: armed in sidecar mode by DECIDINATOR_MODE."}`
  (`grindinator-decide-sidecar-stream.jsonl`), and the arming file held
  `{"mode":"sidecar","armedAt":"2026-10-05T03:53:02.907Z","by":"env"}` (`armed` in
  `grindinator-decide-sidecar-analysis.json`).
- **Oracle dispatch: yes, the oracle ran.** One main-thread `PreToolUse` for `Agent` with
  `subagent_type: "decidinator:oracle-1"`, `run_in_background: false`; the oracle then made four calls
  carrying `agent_id`: `Glob`, and `Read` of `docs/spec.md`, `notes.txt` and `README.md`
  (`grindinator-decide-sidecar-hooks.jsonl`). It made no web calls, because the spec settled the
  question.
- **`SubagentStop`: yes.** Keys: `session_id`, `transcript_path`, `cwd`, `prompt_id`,
  `permission_mode`, `agent_id`, `agent_type`, `effort`, `hook_event_name`, `stop_hook_active`,
  `agent_transcript_path`, `last_assistant_message`, `background_tasks`, `session_crons`. The report
  came from `last_assistant_message` (no `SubagentHandback`), and `parseVerdict` accepted it:
  `researchable`, `resolved`, confidence `high` (`report` and `verdict` in the analysis).
- **Decision log and sidecar: not written.** `decisionLog.exists` and `sidecar.exists` are false and
  the tree is clean (`status: ""`). This follows from `plugins/decidinator/scripts/recorder.js`: it
  records a verdict only when the question is due and in flight in the session state, and only the
  `AskUserQuestion` gate creates that record. A headless session has no `AskUserQuestion`, so a
  direct oracle dispatch is never recorded. R-D2 fails as the code stands; WP-04 must create the
  question record on the headless path.
- **Rung models outside plan mode: yes.** All runs were in `acceptEdits`. The oracle (`oracle-1`,
  `claude-opus-5-5`, `high`) ran on `claude-opus-5-5` at `high`
  (`grindinator-decide-sidecar-agents.json`). In `models`, the probe plugin's five agents:

| Agent | Configured | `effort` in `SubagentStop` | Transcript models | `resolvedModel` | Agent said |
|---|---|---|---|---|---|
| `rung-1` | `claude-opus-5-5`, `high` | `high` | `claude-opus-5-5` | `claude-opus-5-5` | `MODEL: claude-opus-5-5` |
| `rung-2` | `claude-opus-5-5`, `xhigh` | `xhigh` | `claude-opus-5-5` | `claude-opus-5-5` | `MODEL: claude-opus-5-5` |
| `rung-3` | `claude-fable-5-1`, `high` | `high` | `claude-fable-5-1` | `claude-fable-5-1` | `MODEL: claude-fable-5-1` |
| `worker-sonnet` | `sonnet`, `medium` | `medium` | `claude-sonnet-5-5` | `claude-sonnet-5-5` | `MODEL: claude-sonnet-5-5` |
| `worker-opus` | `opus`, `medium` | `medium` | `claude-opus-5-5` | `claude-opus-5-5` | `MODEL: claude-opus-5-5` |

Sources: `grindinator-models-agents.json` and `agents` in `grindinator-models-analysis.json`
(effort, transcript models, said). `resolvedModel` is null in those files because the probe's join
reads `tool_response.model`; the parent's `Agent` `PostToolUse` carries it as
`tool_response.resolvedModel`, with the values above (`grindinator-models-hooks.jsonl`). The main
session ran on Sonnet, so each Opus and Fable agent ran on its own model, not the session's.

## V7: decision-log writes versus the clean tree

The probe plugin stands in for an oracle: on the first qualifying hook it appends
`- probe write <time>` to the decision-log path (`DirtyWrite` records in each `-hooks.jsonl`). No
real oracle ran in these cells.

| Cell | Write | Outcome |
|---|---|---|
| `v7-plan-new` | New, untracked `docs/decisions.md`, on the first main-thread `PreToolUse` during unattended planning | Plan saved, run refused at start: "tierminator: the plan cannot run here: the working tree has uncommitted changes (docs/). Tell the user what to fix, then to type /tierminator:execute ..." (a `Stop` hook message). No worker, no commit; tree left dirty |
| `v7-plan-tracked` | Tracked `docs/decisions.md` (committed in the fixture), same trigger | The same refusal, naming `docs/decisions.md`; tree left dirty |
| `v7-run` | Tracked `docs/decisions.md`, on the first `tierminator:` `SubagentStart` during `/tierminator:execute` | Run completed. The T01 worker's `git add -A` swept the change into commit `Add hello.txt` (files `docs/decisions.md`, `hello.txt`); tree clean after. The main session's summary flagged it |
| `v7-excluded` | `.grindinator/decisions/decisions.md`, with `.grindinator/` in `.git/info/exclude`, same trigger as `v7-plan-new` | Run started and completed: one worker, commit `Add summary.txt with the first line of notes.txt`, tree clean; the file exists, untracked and never committed |

Evidence: `dirtyWrite`, `dirtyFile`, `commits`, `clean` and `refusals` in
`grindinator-v7-plan-new-analysis.json`, `grindinator-v7-plan-tracked-analysis.json`,
`grindinator-v7-run-analysis.json` and `grindinator-v7-excluded-analysis.json`; the refusal text in
`grindinator-v7-plan-new-stream.jsonl`.

So an oracle write during planning blocks Tierminator's run start, whether the log file is new or
tracked. A write during the run does not leave the tree dirty, but lands in an unrelated task
commit, which a discard of that task would also undo. A write to an excluded path does neither.

## V8: permissions

| Cell | Mode and rules | Permission denials | Outcome |
|---|---|---|---|
| `execute-bypass` | `bypassPermissions` | none | Both tasks committed |
| `execute-accept-edits` | `acceptEdits` | 5, all from workers: `Bash` `cat <base>/plan.tasks.json`, `Read` of it (3), `Bash` `head -c 20000 <base>/plan.tasks.json` | Halted at T01 after `sonnet-low`, `sonnet-medium` and `sonnet-high`; no commit |
| `execute-allow-rules` | `acceptEdits` plus `Bash(git:*)`, `Bash(node:*)`, `PowerShell(git:*)`, `PowerShell(node:*)` | 4, all from workers: `Bash` `cat <base>/plan.tasks.json`, `Read` of it (3) | Halted at T01 the same way; no commit |
| `decide-sidecar` | `acceptEdits` plus `WebFetch`, `WebSearch`, `Bash(gh search:*)`, `Bash(gh api:*)` | none | Oracle ran, valid verdict |
| `decide-strict` | `acceptEdits` | none | Oracle ran (`Glob`, `Read`), valid verdict |

Each denial is a stream event, not a `result` field: `result.permission_denials` is `[]` in every
cell, while the stream has `system/permission_denied` events with `agent_id`,
`decision_reason_type: "asyncAgent"` and `decision_reason: "Permission prompts are not available in this context"`
(`grindinator-execute-accept-edits-stream.jsonl`, `grindinator-execute-allow-rules-stream.jsonl`).
The denied file is the tasks file Tierminator writes beside the plan, outside the repository
(`<base>` is the cell's temp directory, and the repository is `<base>/repo`). Real plans live in
`~/.claude/plans`, also outside the repository, so this applies to the runner. The workers never
reached a write or `git` call, so whether `acceptEdits` plus the `git` allow rules would let a
worker commit is untested.

The decide cells' oracles stayed inside the repository and made no web calls, so `acceptEdits`
was enough for them, and the web allow rules were not exercised. In `models` the main session
called `WebSearch` with `--allowedTools WebSearch` and got results (`grindinator-models-hooks.jsonl`).

Minimal working set observed: workers need `--permission-mode bypassPermissions`; oracles that
read only the repository need `--permission-mode acceptEdits`. A smaller worker set, such as
`acceptEdits` plus `--add-dir` for the plan directory and allow rules for `git`, is a candidate to
probe, not a finding.

## V9: model resolution and web search

This first-party login only (`apiKeySource: "none"`, `modelUsage.*.provider: "firstParty"` in
`grindinator-success-stream.jsonl`). Each agent ran on its pinned model and effort, including
`claude-fable-5-1` for rung 3 and the `sonnet` and `opus` aliases for the workers (table in V6;
`grindinator-models-agents.json`). `ToolSearch select:WebSearch` loaded the deferred tool, and
`WebSearch` for `node:test runner` returned results; the session ended with `WEBSEARCH: OK`
(`webSearch` in `grindinator-models-analysis.json`; `grindinator-models-hooks.jsonl`).

Bedrock and Pro: not testable here; this machine has neither. Rerun commands, from
`probes/grindinator/README.md`:

```
CLAUDE_CODE_USE_BEDROCK=1 <AWS variables> PROBE_TAG=bedrock node probes/grindinator/run.js models
PROBE_TAG=pro node probes/grindinator/run.js models    # on a Pro login
node probes/grindinator/summarize.js
```

## Pending

- V9 on Bedrock and on a Pro login: model pinning, rung 3 on Fable, and `WebSearch` availability.
- A real usage limit: V1, V3 and V4 rest on the mock's 429. Unverified: a real 429's headers,
  whether Claude Code retries a real limit, and whether a weekly limit reports the same way.
- A worker permission set smaller than `bypassPermissions` (`acceptEdits` plus `--add-dir` for the
  plan directory and `git` allow rules).
- Oracle web research under `acceptEdits` with and without the web allow rules: neither decide
  cell's oracle made a web call.
- The decision log and sidecar writes in a headless session, after WP-04 adds the headless consult
  path.
- V7 with a real oracle write instead of the probe's stand-in.
- `/tierminator:execute <number>` after the plan list was shown in the same headless session.
