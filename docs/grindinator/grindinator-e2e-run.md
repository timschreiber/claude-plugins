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

## Step 3: pilot at medium effort

Runs the three pilot packages against the real model, with the planner at medium effort, and checks each gate.

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
$tag = 'firstparty'
$base = Join-Path $env:TEMP ("grindinator-e2e/pilot-$tag-medium-" + (Get-Date -Format 'yyyyMMddHHmmss'))
node "$repoRoot/tests/grindinator/e2e/setup.js" pilot $base
if ($LASTEXITCODE -ne 0) { throw 'setup failed; check $repoRoot' }
$savedConfigDir = $env:CLAUDE_CONFIG_DIR
Push-Location "$base/repo"
try {
    node "$repoRoot/tools/grindinator/bin/grindinator" run "$base/packages" --name "pilot-$tag-medium" --effort medium --gate 'node --test' --preamble "$repoRoot/tests/grindinator/e2e/packages/preamble.md"
    $code = $LASTEXITCODE
} finally {
    Pop-Location
    $env:CLAUDE_CONFIG_DIR = $savedConfigDir
}
node "$repoRoot/tests/grindinator/e2e/check.js" pilot "$base/repo" --tag "$tag-medium" --exit $code
```

Expected results:

- Three packages complete in order: WP-01, WP-02, WP-03.
- Each gate passes.
- Exit code 0.
- The last line `PASS: pilot (firstparty-medium)`.

## Step 4: pilot at high effort

The same packages with the planner at high effort.

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
$tag = 'firstparty'
$base = Join-Path $env:TEMP ("grindinator-e2e/pilot-$tag-high-" + (Get-Date -Format 'yyyyMMddHHmmss'))
node "$repoRoot/tests/grindinator/e2e/setup.js" pilot $base
if ($LASTEXITCODE -ne 0) { throw 'setup failed; check $repoRoot' }
$savedConfigDir = $env:CLAUDE_CONFIG_DIR
Push-Location "$base/repo"
try {
    node "$repoRoot/tools/grindinator/bin/grindinator" run "$base/packages" --name "pilot-$tag-high" --effort high --gate 'node --test' --preamble "$repoRoot/tests/grindinator/e2e/packages/preamble.md"
    $code = $LASTEXITCODE
} finally {
    Pop-Location
    $env:CLAUDE_CONFIG_DIR = $savedConfigDir
}
node "$repoRoot/tests/grindinator/e2e/check.js" pilot "$base/repo" --tag "$tag-high" --exit $code
```

Expected results are those of step 3, ending `PASS: pilot (firstparty-high)`. Then compare the two runs:

```powershell
node "$repoRoot/tests/grindinator/e2e/check.js" compare "$repoRoot/tests/grindinator/e2e/results/pilot-$tag-medium/result.json" "$repoRoot/tests/grindinator/e2e/results/pilot-$tag-high/result.json"
```

## Reading the pilot

- Read each plan (`planFile` in result.json): tasks that still contain decisions mean the planner effort is too low.
- Read the decision log: WP-03 has two deliberate open decisions. Few oracle calls on it suggest silent deciding; consider the R-D3 Stop check (L-10).
- Heavy `oracle-3` traffic (Rung 3 entries) points to gaps in the packages.
- Turn-cap hits or gate failures point to a plan or acceptance-criteria problem.
- Use the compare table to choose the planner effort.

## Step 5: first unattended batch

Run about 10 real packages in your own project. Set `$project`, `$packages` and `$gate` (your test command).

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
$tag = 'firstparty'
$project = 'C:/path/to/your/project'
$packages = 'C:/path/to/your/packages'
$gate = 'your test command'
Push-Location $project
try {
    node "$repoRoot/tools/grindinator/bin/grindinator" run $packages --gate $gate
    $code = $LASTEXITCODE
} finally {
    Pop-Location
}
node "$repoRoot/tests/grindinator/e2e/check.js" batch $project --tag $tag --exit $code
```

Review gate: before the next batch, read `.grindinator/summary.md`, the decision log, the sidecar and any failed attempt's directory.

Exit 5 and exit 3 are not failures of the tool (see the exit codes in `docs/grindinator/grindinator-reference.md`):

- Exit 5: the run stopped after a package that added open questions, because of `--stop-on-open-questions`. Answer them, then re-run.
- Exit 3: the run stopped on a limit it would not wait out. Re-run after the reset, or with `--wait-weekly`.

## Other setups

Neither setup has been run: no Pro or Bedrock setup was available (L-2).

### Pro

Sign in with the Pro account. Run the `models` cell and confirm that each rung ran on its model and that `WebSearch` worked:

```powershell
$env:PROBE_TAG = 'pro'; node probes/grindinator/run.js models; node probes/grindinator/summarize.js
```

Then run steps 2 and 3 with `$tag = 'pro'`. Rung 3 runs on Fable, which bills usage credits on Pro, so count Rung 3 entries.

### Bedrock

Set `$env:CLAUDE_CODE_USE_BEDROCK = '1'`, `$env:AWS_REGION` and AWS credentials (`AWS_PROFILE`). Run the `models` cell with `PROBE_TAG=bedrock`.

- Model pinning: pass `--model` with a model the account enables. If the `opus` and `sonnet` aliases do not resolve, set Claude Code's `ANTHROPIC_DEFAULT_OPUS_MODEL` and `ANTHROPIC_DEFAULT_SONNET_MODEL` (untested here).
- Rung 3's `claude-fable-5-1` may not exist there (L-2).
- `WebSearch` may be missing and no substitute is provided (L-5).

Then run steps 2 and 3 with `$tag = 'bedrock'`.

Permissions on every setup: `bypassPermissions` on the runner branch, in a sandbox or a dedicated clone (L-3).

## When a step fails

| Check | Where to look |
| --- | --- |
| `plugins current` | Push and update the plugins. |
| `result file` | Tierminator (WP-02, WP-05); the attempt's `stream.jsonl` and `result.json`. |
| `decision logged` | Decidinator's headless consult (WP-04). |
| `decisions committed` | The runner (WP-10). |
| `gate passed` and `gates passed` | `gate.stdout.txt` and `gate.stderr.txt` in the attempt directory. |
| The stub-limit checks | Limit recovery (WP-09). |
| `clean tree` and `on run branch` | The Git policy (WP-08). |
| `exit code` and `all done` | `summary.md` Details. |

## Results

| Step | Setup | Date | Claude Code | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| stub-limit | stub | - | - | not run | `tests/grindinator/e2e/results/stub-limit-stub/result.json` |
| harness | firstparty | - | - | not run | `tests/grindinator/e2e/results/harness-firstparty/result.json` |
| pilot | firstparty-medium | - | - | not run | `tests/grindinator/e2e/results/pilot-firstparty-medium/result.json` |
| pilot | firstparty-high | - | - | not run | `tests/grindinator/e2e/results/pilot-firstparty-high/result.json` |
| batch | firstparty | - | - | not run | `tests/grindinator/e2e/results/batch-firstparty/result.json` |
| harness | pro | - | - | not run | `tests/grindinator/e2e/results/harness-pro/result.json` |
| pilot | pro-medium | - | - | not run | `tests/grindinator/e2e/results/pilot-pro-medium/result.json` |
| harness | bedrock | - | - | not run | `tests/grindinator/e2e/results/harness-bedrock/result.json` |
| pilot | bedrock-medium | - | - | not run | `tests/grindinator/e2e/results/pilot-bedrock-medium/result.json` |

After each run, fill its row from the check.js output and commit the results directory.
