# Grindinator WP-01 probe

Development-time verification for `docs/grindinator/WP-01 · Headless verification spike.md`. Nothing here ships. Each cell runs one headless `claude -p` session in a fresh Git repository under the OS temp directory and writes its evidence to `probes/evidence/grindinator-<cell>-*`. The findings are in `docs/grindinator/grindinator-verification.md`.

## Running

```
node probes/grindinator/run.js --list            # every cell and the items it covers
node probes/grindinator/run.js --dry-run <cell>  # set the cell up and print the claude arguments; no session
node probes/grindinator/run.js <cell>            # run one cell
node probes/grindinator/summarize.js             # merge every cell into grindinator-verification-results.json
```

Run one cell per command; a cell takes up to 9 minutes. `run.js` exits 0 whenever the cell ran, even if the Claude session failed, was refused or timed out: that is a result, not a probe failure. It exits 2 when the probe itself threw and 64 on a usage error.

Cautions:

- Cells spend real tokens on your login, except `error` and the `limit-*` cells, whose requests never leave the machine.
- `limit-oauth`, `limit-oauth-noretry` and `pass` send your login's credential to the local mock on 127.0.0.1. The mock never logs request header values. `pass` forwards every request unchanged to `https://api.anthropic.com`.
- `v7-plan-new`, `v7-plan-tracked` and `v7-excluded` leave unattended plan files in `~/.claude/plans`.
- `PROBE_TAG=<tag>` appends `-<tag>` to the cell's evidence name. To rerun V9 on Bedrock, set `CLAUDE_CODE_USE_BEDROCK=1` and the AWS variables, then run `PROBE_TAG=bedrock node probes/grindinator/run.js models`. On a Pro login, run `PROBE_TAG=pro node probes/grindinator/run.js models`.

## Files

| File | Role |
|---|---|
| `lib.js` | Shared helpers |
| `probe-plugin/` | Plugin `grindinator-probe`: logs every hook input, can write a file to dirty the tree, checks Decidinator's arming flag, and has five model-report agents |
| `stopfailure-plugin/` | Plugin `grindinator-probe-stopfailure`: registers only `StopFailure`, so an unknown event cannot disable the main probe plugin |
| `mock-api.js` | A local stand-in for the Anthropic API, with `limit`, `error` and `pass` modes |
| `fixtures/plan.md` | The two-task plan the `/tierminator:execute` cells run |
| `run.js` | The CLI; runs one cell |
| `cells-api.js`, `cells-tierminator.js`, `cells-decidinator.js` | The cell definitions |
| `summarize.js` | Writes `probes/evidence/grindinator-verification-results.json` |

## lib.js

CommonJS for Node 20, no dependencies. It exports:

- `ROOT`, the repository root (`path.join(__dirname, '..', '..')`), and `EVIDENCE`, `ROOT/probes/evidence`.
- `PLUGINS`: `tierminator` is `ROOT/plugins/tierminator`, `decidinator` is `ROOT/plugins/decidinator`, `probe` is `__dirname/probe-plugin`, `stopFailure` is `__dirname/stopfailure-plugin`.
- `STRIP`: `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`, `CLAUDE_ENV_FILE`, `CLAUDE_CODE_SSE_PORT`, `DECIDINATOR_MODE`, `DECIDINATOR_CONTEXT`, `DECIDINATOR_DEBUG`, `TIERMINATOR_RESULT_FILE`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, `CLAUDE_CODE_MAX_RETRIES`, `CLAUDE_CODE_RETRY_WATCHDOG`.
- `cellEnv(extra)` returns `{ env, stripped }`: a copy of `process.env` without the `STRIP` names, with `extra` assigned over it. `stripped` lists the `STRIP` names that were set.
- `makeRepo(dir, files)` writes each entry of `files` (a relative path mapped to its string content, parent directories created), then runs, in `dir`: `git init -q`, `git config user.name 'Grindinator Probe'`, `git config user.email probe@example.invalid`, `git config core.autocrlf false`, `git add -A`, `git commit -q -m fixture`. It throws if a git command exits non-zero.
- `writeSettings(dir)` writes `dir/settings.json` holding `enabledPlugins` with `tierminator@timschreiber` and `decidinator@timschreiber` set to false, and returns its path. The cells pass it with `--settings`, so installed copies of the plugins do not load beside the `--plugin-dir` copies.
- `runClaude({ cwd, args, env, timeoutMs })` runs `child_process.spawn('claude', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })` with no shell. It resolves to `{ exitCode, signal, timedOut, stdout, stderr, durationMs, spawnError }` and never rejects. On timeout it kills the child and sets `timedOut` to true.
- `readJsonLines(file)` returns the parsed lines, skipping blank and unparseable ones, and `[]` for a missing file. `parseStream(text)` does the same for a string.
- `streamSummary(events)` returns `{ typeCounts, init, result, sessionIdIn, apiRetries, plugins }`. `typeCounts` counts events by `type`, or by `type/subtype` when there is a subtype. `init` is the first `system/init` event, with its `tools` array replaced by the array's length. `result` is the last event of type `result`. `sessionIdIn` lists the distinct `type` or `type/subtype` keys of events that carry `session_id`. `apiRetries` is every `system/api_retry` event. `plugins` is `init.plugins`, or null.
- `hookRecords(outDir)` concatenates every `*.jsonl` file in `outDir`, sorted by `at` (stable).
- `agentRows(records)` returns one row per `SubagentStop` record: `{ agent_id, agent_type, effort, models, resolvedModel, last_assistant_message }`. `models` lists the distinct `message.model` values in the file at `agent_transcript_path`. `resolvedModel` comes from the `PostToolUse` record for tool `Agent` whose `tool_response.agentId` equals the row's `agent_id`, else null.
- `gitInfo(repo)` returns null when `repo` is not a Git work tree, else `{ head, status, commits }`. `status` is the `git status --porcelain` output. `commits` lists every commit newest first as `{ sha, subject, task, files }`: `task` is the `Tierminator-Task` trailer value or null, and `files` comes from `git show --name-only --format= <sha>`.
- `writeEvidence(cell, suffix, content)` writes `EVIDENCE/grindinator-<cell>-<suffix>`: a string as it is, anything else as JSON with a two-space indent and a final newline.
- `claudeVersion()` returns the trimmed output of `claude --version`, or null.
- `findText(haystacks, needles)` takes an object of named strings and returns an object holding, for each name with at least one case-insensitive match, the needles it matched.

`node probes/grindinator/lib.js --self-test` creates a repository with one file in the OS temp directory and checks that `gitInfo` reports one commit and an empty status. It then runs `parseStream` and `streamSummary` on a two-line stream: a `system/init` event with `session_id` `s1` and `tools` `['a', 'b']`, then a `result` event with subtype `success`. It checks that `init.tools` is 2, `result.subtype` is `success` and `sessionIdIn` is `['system/init']`. On success it prints `self-test ok` and exits 0; otherwise it prints the failed check and exits 1.

## Probe plugins

`probe-plugin/scripts/probe.js` is `probes/decidinator/probe-plugin/scripts/probe.js` without the `PROBE_DENY` branch, plus two behaviors:

- **Dirty write.** When `PROBE_DIRTY_FILE` and `PROBE_DIRTY_ON` are set and `OUT/dirty.done` does not exist, the first hook that qualifies writes `OUT/dirty.done`, appends the line `- probe write <ISO time>` to `path.resolve(input.cwd, PROBE_DIRTY_FILE)` (creating its directories), and logs `{ at, run, event: 'DirtyWrite', file, trigger }` to `OUT/DirtyWrite.jsonl`. A hook qualifies when its event equals `PROBE_DIRTY_ON` and, for `PreToolUse`, it has no `agent_id` (the main thread), or, for `SubagentStart`, its `agent_type` starts with `tierminator:`.
- **Armed check.** On `UserPromptSubmit` with `PROBE_ARMED_CHECK=1`, it looks for `<session_id>.armed` in the `sessions` directory of every sibling of `path.dirname(process.env.CLAUDE_PLUGIN_DATA)`, and in `os.tmpdir()/decidinator/sessions`. It logs `{ at, run, event: 'ArmedCheck', found }` to `OUT/ArmedCheck.jsonl`, where `found` lists `{ path, content }` for each file found.

Both are wrapped in try/catch, so the script still never throws and always exits 0.

`probe-plugin/hooks/hooks.json` registers the script, with the same command and timeout as `probes/decidinator/probe-plugin/hooks/hooks.json`. It does so on `SessionStart`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, `Stop`, `SessionEnd`, `Notification` and `PreCompact`, and with matcher `*` on `PreToolUse`, `PostToolUse` and `PostToolUseFailure`.

`probe-plugin/agents/` holds five copies of `probes/decidinator/probe-plugin/agents/model-probe.md`, each with its own `name`, `model` and `effort`. `rung-1` (`claude-opus-5-5`, `high`), `rung-2` (`claude-opus-5-5`, `xhigh`) and `rung-3` (`claude-fable-5-1`, `high`) match Decidinator's three oracle rungs. `worker-sonnet` (`sonnet`, `medium`) and `worker-opus` (`opus`, `medium`) match Tierminator worker models.

`stopfailure-plugin/hooks/hooks.json` registers only `StopFailure`, with no matcher, running `node` on `${CLAUDE_PLUGIN_ROOT}/../probe-plugin/scripts/probe.js`.

## mock-api.js

`startMock({ mode, logFile, resetEpoch })` resolves to `{ url, close }`, where `close()` returns a promise. The server listens on 127.0.0.1 on a free port, and `url` is `http://127.0.0.1:<port>`.

Every request appends one JSON line to `logFile`: `{ at, n, method, url, headerNames, authKind, model, stream, bodyBytes }`.

- `n` counts requests from 1.
- `headerNames` are the sorted lowercase request header names.
- `authKind` is `bearer` when an `authorization` header is present, else `x-api-key` when that header is present, else `none`.
- `model` and `stream` come from the JSON body when it parses, else null.

Request header values are never logged. In `pass` mode the line is written when the upstream response headers arrive, and it also holds `status`, `responseHeaderNames` and `rateHeaders`. `rateHeaders` holds the name and value of each response header whose name starts with `anthropic-ratelimit` or is `retry-after` or `x-should-retry`.

For a request whose path starts with `/v1/messages`:

- `limit` answers 429 with these headers:
  - `content-type: application/json`
  - `retry-after`: the larger of 1 and `resetEpoch` minus now, in seconds
  - `x-should-retry: false`
  - `request-id: req_probe_<n>`
  - `anthropic-ratelimit-unified-status: rejected`
  - `anthropic-ratelimit-unified-reset: <resetEpoch>`
  - `anthropic-ratelimit-unified-representative-claim: five_hour`
  - `anthropic-ratelimit-unified-5h-status: rejected`
  - `anthropic-ratelimit-unified-5h-reset: <resetEpoch>`
  - `anthropic-ratelimit-unified-5h-utilization: 1.0`

  Its body is `{ type: 'error', error: { type: 'rate_limit_error', message: 'This request would exceed your account rate limit. Please try again later.' }, request_id: 'req_probe_<n>' }`.
- `error` answers 400 with `content-type: application/json`, `x-should-retry: false`, and the same body shape with error type `invalid_request_error` and message `probe: invalid request`.
- `pass` forwards the method, path with query, headers (with `host` set to `api.anthropic.com`) and body to `https://api.anthropic.com`. It streams the upstream status, headers and body back unchanged.

In `limit` and `error` modes any other path answers 404 with error type `not_found_error`. In `pass` mode every path is forwarded.

`node probes/grindinator/mock-api.js --self-test` starts `limit` mode and posts `{}` to `/v1/messages` with the header `authorization: Bearer probe-secret-123`. It checks that the status is 429, that `anthropic-ratelimit-unified-reset` equals the `resetEpoch` given, that the log line has `authKind` `bearer`, and that the log file does not contain `probe-secret-123`. It then starts `error` mode and checks for a 400. It prints `self-test ok` and exits 0, or prints the failed check and exits 1. It does not test `pass`.

## run.js

`node probes/grindinator/run.js <cell>`:

1. `name` is the cell name, plus `-<PROBE_TAG>` when that variable is set. `base` is `os.tmpdir()/grindinator-probe/<name>`, removed and recreated. `outDir` is `base/out`.
2. `spec = await def.setup(base)`, where `def` is the cell's definition. `spec` is `{ cwd, prompt, flags, plugins, env, mock, timeoutMs }`.
3. When `spec.mock` is set, `resetEpoch` is the current Unix time in seconds plus 7200, and the mock starts in mode `spec.mock` with `logFile` `base/mock.jsonl`.
4. The arguments are `-p`, `spec.prompt`, `--output-format`, `stream-json`, `--verbose`, `--settings` with `writeSettings(base)`, then `--plugin-dir PLUGINS[key]` for each key in `spec.plugins`, then `spec.flags` (one array element per argument).
5. The environment is `cellEnv` of `PROBE_RUN` (the name), `PROBE_OUT` (`outDir`) and `spec.env`, plus `ANTHROPIC_BASE_URL` set to the mock's url when a mock runs.
6. `runClaude` runs with `spec.timeoutMs`, then the mock closes.
7. The context `ctx` is `{ name, base, cwd, outDir, spec, run, events, summary, records, agents, git, mockLog, resetEpoch }`:
   - `run` is the `runClaude` result;
   - `events` is its parsed stdout;
   - `summary` is their `streamSummary`;
   - `records` is `hookRecords(outDir)`;
   - `agents` is their `agentRows`;
   - `git` is `gitInfo(cwd)`;
   - `mockLog` is the parsed `base/mock.jsonl`, or `[]`.
8. It writes the evidence through `writeEvidence(name, ...)`:
   - `stream.jsonl`: the raw stdout.
   - `hooks.jsonl`: one record per line.
   - `agents.json`.
   - `transcript.jsonl`: a copy of the file at the first record's `input.transcript_path`, when it exists.
   - `mock.jsonl`: when a mock ran.
   - `run.json`: `{ generated, claudeCodeVersion, cell: name, items, args, envSet, stripped, exitCode, signal, timedOut, durationMs, spawnError, stderr, git }`, with `envSet` the names in `spec.env` and `stderr` cut to 4000 characters.
   - `analysis.json`: `{ common, cell }`, where `cell` is `def.analyze(ctx)`, or `{ analyzeError: <message> }` if it throws.
9. It prints `<name>: exit=<exitCode> timedOut=<timedOut> hooks=<record count> result=<result subtype or none>` and exits 0.

`common` is `{ exitCode, timedOut, resultSubtype, isError, resultKeys, resultText, initKeys, sessionIdIn, typeCounts, apiRetries, permissionDenials, hookEventCounts, stopFailure, sessionEnd, pluginsLoaded, duplicatePlugins }`.

- `resultText` is the result's `result`, cut to 600 characters.
- `permissionDenials` is the result's `permission_denials`, or null.
- `hookEventCounts` counts records by `event`.
- `stopFailure` and `sessionEnd` are the `input` of each `StopFailure` and `SessionEnd` record.
- `pluginsLoaded` is `summary.plugins`.
- `duplicatePlugins` lists the plugin names that appear more than once in it.

`--list` prints one line per cell: its name and its items. `--dry-run <cell>` does steps 1, 2, 4 and 5 without starting a mock or Claude, using `http://127.0.0.1:0` as the mock url. It then prints the arguments as JSON and the names of the variables in `spec.env`.

A cell definition is `{ items, setup, analyze }`. `run.js` loads the cells from `cells-api.js`, `cells-tierminator.js` and `cells-decidinator.js`, skipping a module whose file does not exist. Any throw outside `def.analyze` prints the stack and exits 2. An unknown cell or a missing argument prints the usage and exits 64.

## Cells

Fixture `BASIC`: `README.md` with the line `# Probe repo`, and `notes.txt` with the lines `alpha` and `beta`.

### cells-api.js: V1 to V4

Repository `BASIC`. Plugins `probe` and `stopFailure`. Flags `--model sonnet --effort low`. Prompt: `Reply with the single word OK.`

| Cell | Items | Mock | `spec.env` | Timeout |
|---|---|---|---|---|
| `success` | V2 | none | none | 180 s |
| `error` | V2 | `error` | none | 300 s |
| `pass` | V3 | `pass` | none | 180 s |
| `limit-oauth` | V1, V2, V3, V4 | `limit` | none | 540 s |
| `limit-oauth-noretry` | V1, V2, V3, V4 | `limit` | `CLAUDE_CODE_MAX_RETRIES=0` | 300 s |
| `limit-apikey` | V1, V2, V3, V4 | `limit` | `ANTHROPIC_API_KEY=sk-ant-probe-dummy`, `CLAUDE_CODE_MAX_RETRIES=0` | 300 s |

Analysis, every cell: `mockRequests` (the length of `mockLog`) and `firstAuthKind`.

`pass` adds `rateHeaders`: `{ n, url, status, rateHeaders }` for each logged request.

The `limit-*` cells add:

- `stopFailureFired`: a boolean.
- `stopFailureKeys`: the union of the `StopFailure` inputs' keys.
- `sessionEndReasons`.
- `apiRetryErrors`: `{ error, error_status, attempt, retry_delay_ms }` for each `api_retry` event.
- `resetFound`: `findText` over the haystacks `stream` (stdout), `stderr`, `transcript` (the text of the copied transcript, or empty) and one per hook event name (the JSON of that event's records). Its needles are:
  - `String(resetEpoch)`;
  - the ISO time of `resetEpoch`, and that ISO time's first 16 characters;
  - the local hour of `resetEpoch` written as `3pm`, `3 pm` and `3:00` (12-hour, no leading zero), and as `15:00` (24-hour, two digits).

### cells-tierminator.js: V5, V7, V8

Plugins `tierminator` and `probe`. Timeout 540 s. The flags are `--model sonnet` and `--effort low` (`--effort medium` for `v7-plan-new`, `v7-plan-tracked` and `v7-excluded`), followed by the permission flags in the table. In the table, `bypass` means `--permission-mode bypassPermissions`.

`setup` copies `fixtures/plan.md` to `base/plan.md`, outside the repository. `P` is that path with every backslash replaced by a forward slash. `PLAN` is the prompt `/tierminator:plan Read notes.txt, then add a file summary.txt whose only line is the first line of notes.txt.`

| Cell | Items | Repository | Prompt | Permission flags | `spec.env` |
|---|---|---|---|---|---|
| `execute-bypass` | V5, V8 | `BASIC` | `/tierminator:execute "P"` | bypass | none |
| `execute-from` | V5 | `BASIC` | `/tierminator:execute "P" --from T02` | bypass | none |
| `execute-number` | V5 | `BASIC` | `/tierminator:execute 1` | bypass | none |
| `execute-dirty` | V5 | `BASIC`, then an untracked `scratch.txt` written after the commit | `/tierminator:execute "P"` | bypass | none |
| `execute-plan-mode` | V5 | `BASIC` | `/tierminator:execute "P"` | `--permission-mode plan` | none |
| `execute-accept-edits` | V8 | `BASIC` | `/tierminator:execute "P"` | `--permission-mode acceptEdits` | none |
| `execute-allow-rules` | V8 | `BASIC` | `/tierminator:execute "P"` | `--permission-mode acceptEdits --allowedTools Bash(git:*) Bash(node:*) PowerShell(git:*) PowerShell(node:*)` | none |
| `v7-plan-new` | V7 | `BASIC` | `PLAN` | bypass | `PROBE_DIRTY_FILE=docs/decisions.md`, `PROBE_DIRTY_ON=PreToolUse` |
| `v7-plan-tracked` | V7 | `BASIC` plus `docs/decisions.md` with the line `<!-- decidinator-log v1 -->` | `PLAN` | bypass | as `v7-plan-new` |
| `v7-run` | V7 | as `v7-plan-tracked` | `/tierminator:execute "P"` | bypass | `PROBE_DIRTY_FILE=docs/decisions.md`, `PROBE_DIRTY_ON=SubagentStart` |
| `v7-excluded` | V7 | `BASIC`, then the line `.grindinator/` appended to `.git/info/exclude` | `PLAN` | bypass | `PROBE_DIRTY_FILE=.grindinator/decisions/decisions.md`, `PROBE_DIRTY_ON=PreToolUse` |

Analysis, every cell:

- `commits`: `git.commits`.
- `committedTasks`: the `task` values, oldest first, with nulls dropped.
- `files`: for each of `hello.txt`, `world.txt` and `summary.txt`, whether `git cat-file -e HEAD:<file>` succeeds.
- `clean`: whether `git.status` is empty.
- `tasksFile` and `telemetryFile`: whether `base/plan.tasks.json` and `base/plan.telemetry.jsonl` exist.
- `activated`: whether stdout contains `tierminator: running the plan`.
- `refusals`: `findText` over stdout and `resultText`, with the needles `uncommitted changes`, `plan mode`, `no commits` and `Tell the user`.
- `workerDispatches`: the `tool_input.subagent_type` of each main-thread `PreToolUse` record for tool `Agent`.
- `unattendedPlanFile`: for `PLAN` cells, the path of the file in `CLAUDE_CONFIG_DIR/plans` (or `~/.claude/plans`) whose name starts with `tierminator-unattended-` and ends with `-<first 8 characters of the session id>.md`; else null.

Cells with `PROBE_DIRTY_FILE` add:

- `dirtyWrite`: the `DirtyWrite` records.
- `dirtyFile`: `{ exists, tracked, committedIn, hasProbeWrite }`. `tracked` is whether `git ls-files --error-unmatch <file>` succeeds. `committedIn` lists the subjects of the commits whose `files` include it. `hasProbeWrite` is whether the working-tree file contains `probe write`.

### cells-decidinator.js: V6, V8, V9

Fixture `DOCS`: `BASIC` plus `docs/spec.md` with the lines `# Probe spec`, an empty line, and `The project targets Node 20. Unit tests use node:test, the runner built into Node.`

`DISPATCH` is these lines:

```
Decidinator question Q-0001
Rung: 1
Decision log: docs/decisions.md
Sidecar: docs/open-questions.md
Question: Which test runner should the probe project's unit tests use?
Options:
- node:test: the runner built into Node
- Jest: a third-party runner
Context: I am adding the first unit test to the probe project.
```

The decide prompt is the one `mainPrompt(DISPATCH)` in `probes/decidinator/run-oracle.js` builds, with the agent `decidinator:oracle-1`.

The `models` prompt: `Call the Agent tool five times, one call at a time, with these subagent_type values in order: grindinator-probe:rung-1, grindinator-probe:rung-2, grindinator-probe:rung-3, grindinator-probe:worker-sonnet, grindinator-probe:worker-opus. For each call use the description probe and the prompt: Report your model. Then call ToolSearch with the query select:WebSearch, then call WebSearch with the query node:test runner. Finally reply with one line per agent, copying its reply, and then the line WEBSEARCH: OK if the search returned results, else WEBSEARCH: NOT-AVAILABLE.`

| Cell | Items | Repository | Plugins | Flags | `spec.env` |
|---|---|---|---|---|---|
| `decide-sidecar` | V6, V8 | `DOCS` | `decidinator`, `probe` | `--model sonnet --effort low --permission-mode acceptEdits --allowedTools WebFetch WebSearch Bash(gh search:*) Bash(gh api:*)` | `DECIDINATOR_MODE=sidecar`, `DECIDINATOR_CONTEXT=WP-PROBE`, `PROBE_ARMED_CHECK=1` |
| `decide-strict` | V8 | `DOCS` | `decidinator`, `probe` | `--model sonnet --effort low --permission-mode acceptEdits` | as `decide-sidecar` |
| `models` | V6, V9 | `BASIC` | `probe` | `--model sonnet --effort low --permission-mode acceptEdits --allowedTools WebSearch` | none |

The timeout is 540 s for all three.

Analysis, `decide-*`:

- `armed`: the `ArmedCheck` records' `found`.
- `armedMessageInStream`: whether stdout contains `decidinator: armed`.
- `oracleDispatches`: the main-thread `PreToolUse` records for `Agent` with `subagent_type` `decidinator:oracle-1`.
- `report`: `{ source, text }`, by the rule of `findReport` in `probes/decidinator/run-oracle.js`.
- `verdict`: `parseVerdict` from `plugins/decidinator/scripts/lib/verdict.js`, with `questionId` `Q-0001` and `rung` 1. It holds `ok`, `reason`, and, when ok, the verdict's `kind`, `status` and `confidence`.
- `oracle`: the `agents` row for `decidinator:oracle-1`: `effort`, `models` and `resolvedModel`.
- `decisionLog` and `sidecar`: `{ exists, head }` for `docs/decisions.md` and `docs/open-questions.md` in the repository, where `head` is the first 1000 characters.
- `status`: `git.status`.

Analysis, `models`:

- `agents`: for each of the five agent types, `{ effort, models, resolvedModel, said }`, where `said` is the line starting `MODEL:` in its `last_assistant_message`, else null.
- `webSearch`: `{ called, reported }`, where `called` is whether a `PostToolUse` record for `WebSearch` exists and `reported` is whether `resultText` contains `WEBSEARCH: OK`.

## summarize.js

`node probes/grindinator/summarize.js [--evidence <dir>] [--require <cell,cell,...>]`. `dir` defaults to `probes/evidence`.

It reads every `grindinator-<name>-analysis.json` in `dir`, with its `grindinator-<name>-run.json`, and writes `dir/grindinator-verification-results.json` as `{ generated, claudeCodeVersions, cells, items }`:

- `claudeCodeVersions` lists the distinct `claudeCodeVersion` values.
- `cells` maps each name to `{ items, exitCode, timedOut, durationMs, analysis }`.
- `items` maps each of `V1` to `V9` to the names of the cells that cover it (an empty array when none do).

It prints `<n> cells`. With `--require`, it then exits 1 and prints the missing names if any listed cell has no analysis file; otherwise it exits 0.
