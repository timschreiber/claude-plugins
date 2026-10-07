# Grindinator: end-to-end run

This runbook proves the pipeline on real runs (the Grindinator specification, Rollout stages 2 to 4). A person runs it, in a PowerShell window outside any Claude Code session. Each step builds a scratch project under `%TEMP%/grindinator-e2e` with `tests/grindinator/e2e/setup.js` and runs Grindinator there. `tests/grindinator/e2e/check.js` then prints each check and PASS or FAIL, and writes `tests/grindinator/e2e/results/<step>-<setup>/` (`result.json` plus copies of `state.json`, `summary.md` and the decision files). Record each run in Results and commit the results directory.

## Before you start

- You need Node 20+, Git, and Claude Code, where `where.exe claude` lists `claude.exe`. Grindinator starts it without a shell, so an npm `claude.cmd` is not found (L-8).
- Grindinator drives the installed plugins, not `plugins/` (L-6). Push `main`, then run `claude plugin marketplace update timschreiber`, `claude plugin update tierminator@timschreiber` and `claude plugin update decidinator@timschreiber`. `claude plugin list` must show both enabled. The `plugins current` check fails while an installed copy predates the repo's last commit under its `plugins/<name>/`.
- Change `$repoRoot` if the repo is elsewhere. `$tag` names the setup: `firstparty`, `pro` or `bedrock`.
- Sessions run with `bypassPermissions` (the default), in the scratch repo on its own `grindinator/<run name>` branch. Plans land in `~/.claude/plans`.
- Steps 2 to 5 call the real model and spend usage. The times are estimates.

## Steps

| Step | What it proves | Model calls | Time |
| --- | --- | --- | --- |
| 1 stub limit | A limit, the wait, the `/tierminator:execute --from T02` relaunch and completion, on a real clock. | None | About 6 minutes |
| 2 harness check | The four Rollout stage-2 checks: the plan runs to commits, the result file is written, a forced open decision reaches an oracle and lands in the committed log, and the tree stays clean. | Yes | 15 to 45 minutes |
| 3 pilot at medium effort | Three real packages run attended. | Yes | 1 to 3 hours |
| 4 pilot at high effort, then the compare | The same packages with the planner at high effort, compared with step 3. | Yes | 1 to 3 hours |
| 5 first unattended batch | About 10 packages with no one attending. | Yes | Hours |

## Step 1: stub limit

Runs the whole limit path against the stub `claude` (no model calls): the first attempt hits a limit, Grindinator waits for the reset, then relaunches with `/tierminator:execute --from T02` and completes.

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
$base = Join-Path $env:TEMP ('grindinator-e2e/stub-limit-' + (Get-Date -Format 'yyyyMMddHHmmss'))
node "$repoRoot/tests/grindinator/e2e/setup.js" stub-limit $base
if ($LASTEXITCODE -ne 0) { throw 'setup failed; check $repoRoot' }
$savedConfigDir = $env:CLAUDE_CONFIG_DIR
Push-Location "$base/repo"
try {
    $env:GRINDINATOR_CLAUDE_BIN = "$repoRoot/tests/grindinator/fixtures/claude-stub.js"
    $env:GRINDINATOR_STUB_SCENARIO = "$base/scenario.json"
    $env:GRINDINATOR_STUB_LOG = "$base/stub-log.jsonl"
    $env:CLAUDE_CONFIG_DIR = "$base/claude-config"
    node "$repoRoot/tools/grindinator/bin/grindinator" run "$base/packages" --name stub-limit
    $code = $LASTEXITCODE
} finally {
    Pop-Location
    Remove-Item Env:GRINDINATOR_CLAUDE_BIN, Env:GRINDINATOR_STUB_SCENARIO, Env:GRINDINATOR_STUB_LOG -ErrorAction SilentlyContinue
    $env:CLAUDE_CONFIG_DIR = $savedConfigDir
}
node "$repoRoot/tests/grindinator/e2e/check.js" stub-limit "$base/repo" --tag stub --exit $code
```

Expected results:

- The warning `grindinator: no gate is configured, so a package is done once its session completes with new commits; set one with --gate or "gate".`
- The attempt-1 limit line: `WP-01: attempt 1 ended: limit.` (preceded by `WP-01: attempt 1 started; its stream is in .grindinator/runs/WP-01/attempt-1/stream.jsonl.`)
- The waiting line, naming the result file as the source: `WP-01: usage limit; waiting until <time> (reset <time>, from the result file).`
- About six minutes later, the relaunch line `WP-01: the wait is over; relaunching /tierminator:execute --from T02.` and the attempt-2 complete line `WP-01: attempt 2 ended: complete.`
- Exit code 0.
- `ok` for every stub-limit check: `state`, `exit code`, `all done`, `clean tree`, `on run branch`, `summary`, `limit then complete`, `relaunched by execute`, `waited on the result-file reset`, `execute from T02`, `limit waits in summary` and `leftovers discarded`.
- The last line `PASS: stub-limit (stub)`.

## Step 2: harness check

Runs one trivial package against the real model and checks the four stage-2 points. Passing this step closes L-4.

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
$tag = 'firstparty'
$base = Join-Path $env:TEMP ("grindinator-e2e/harness-$tag-" + (Get-Date -Format 'yyyyMMddHHmmss'))
node "$repoRoot/tests/grindinator/e2e/setup.js" harness $base
if ($LASTEXITCODE -ne 0) { throw 'setup failed; check $repoRoot' }
$savedConfigDir = $env:CLAUDE_CONFIG_DIR
Push-Location "$base/repo"
try {
    node "$repoRoot/tools/grindinator/bin/grindinator" run "$base/packages" --name "harness-$tag" --gate 'node --test' --preamble "$repoRoot/tests/grindinator/e2e/packages/preamble.md"
    $code = $LASTEXITCODE
} finally {
    Pop-Location
    $env:CLAUDE_CONFIG_DIR = $savedConfigDir
}
node "$repoRoot/tests/grindinator/e2e/check.js" harness "$base/repo" --tag $tag --exit $code
```

Expected results:

- Attempt 1 ends complete: `WP-01: attempt 1 ended: complete.`
- The gate passes: `WP-01: gate passed; its output is in .grindinator/<attempt dir>/.`
- Exit code 0.
- `ok` for every harness check: `state`, `exit code`, `all done`, `clean tree`, `on run branch`, `summary`, `result file`, `gate passed`, `decision logged`, `decisions committed` and `plugins current`.
- The last line `PASS: harness (firstparty)`.

What to read:

- The plan file (`planFile` in the attempt's `result.json`).
- In the scratch repo, the `docs/decisions.md` entry for the empty-name question (Context WP-01), and any provisional entry in `docs/open-questions.md`.
