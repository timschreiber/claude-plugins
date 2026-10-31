# Tierminator parallel run: end-to-end

This runbook proves parallel execution on real runs (the Rollout "Done means" of `tierminator-parallel-spec.md`): independent tasks finish in about the time of the slowest, a serial plan is unchanged, a forced conflict is integrated by re-running the task serially, a failed task retries in place while its siblings run, an exhausted task and a failed plan verify each halt the run with the passers kept, and the same holds headless in `auto` and `bypassPermissions` mode with the permission restriction documented. A person runs it in a PowerShell window outside any Claude Code session. Each scenario builds a scratch repo with `tests/tierminator/e2e/setup.js`, runs it, and `tests/tierminator/e2e/check.js` prints each check as ok or FAIL and writes `tests/tierminator/e2e/results/scenario-N/`. Record each run in Results and commit the results directory.

## Before you start

- You need Node 20+, Git, and `claude` on the PATH.
- Run from a clone of this repo. Change `$repoRoot` below if it is elsewhere.
- The runs call the real model and spend usage.
- The harness loads `plugins/tierminator` from the clone with `--plugin-dir` and `--setting-sources project`, so an installed copy does not load beside it.
- Scenarios 1 to 6 and 8 are headless: a detached worker runs `claude -p "/tierminator:execute <plan>"` and you wait for it. Scenario 7 needs a person in an interactive session, so it is hand-run.

```powershell
$repoRoot = 'C:/Users/timsc/Source/Repos/GitHub/timschreiber/claude-plugins'
```

## Scenarios

| Scenario | What it proves | Mode | Run |
| --- | --- | --- | --- |
| 1 | Three independent tasks run at once and finish in about the time of the slowest. | `bypassPermissions` | Headless |
| 2 | A forced conflict is integrated by running the conflicting task again, serially. | `bypassPermissions` | Headless |
| 3 | A failed task retries in place a tier up while its siblings keep running. | `bypassPermissions` | Headless |
| 4 | An exhausted task halts the wave with the passers integrated, and a second run finishes the rest. | `bypassPermissions` | Headless |
| 5 | A failed plan verify halts the run with the verify named, and a second run finishes the rest. | `bypassPermissions` | Headless |
| 6 | A serial plan runs one task at a time, in order. | `bypassPermissions` | Headless |
| 7 | The start notice states the permission restriction, and each worker commit can be approved. | `default` | Hand-run |
| 8 | The same parallel plan runs headless with `auto`. | `auto` | Headless |

Every headless scenario below uses the same three commands. Run the detach command, then repeat the wait command while it exits 3 (still running), then run the check.

## Scenario 1: three independent tasks

Three tasks that each wait 45 seconds before their Verify, with no dependencies between them.

```powershell
node "$repoRoot/tests/tierminator/e2e/run-headless.js" 1 --detach
# prints: base: <path>
$base = '<path>'
node "$repoRoot/tests/tierminator/e2e/run-headless.js" --wait $base
# repeat while it exits 3
node "$repoRoot/tests/tierminator/e2e/check.js" 1 $base
```

Expect the run to complete with three task commits and the three attempts overlapping.

Pass conditions:

- `sessions finished`: one claude session ran and it did not time out.
- `result outcome`: the result file says `complete`.
- `clean tree`: nothing is left uncommitted.
- `on run branch`: the repo is back on `main`.
- `linear history`: no merge commits.
- `one commit per task`: T01, T02 and T03 each have exactly one task commit.
- `one plan id`: every task commit carries the same `Tierminator-Plan` id.
- `no leftovers`: no slot branches remain and only the main worktree is left.
- `three done attempts`: telemetry holds three attempt records, one per task, all `done`.
- `ran at once`: the three attempts overlapped in time.
- `about the slowest`: the whole wall time is within 1.6 times the longest single attempt.

## Scenario 2: a forced conflict

Two tasks both replace the `// REGISTER-HERE` line in `src/registry.js`, so their patches conflict.

```powershell
node "$repoRoot/tests/tierminator/e2e/run-headless.js" 2 --detach
$base = '<path>'
node "$repoRoot/tests/tierminator/e2e/run-headless.js" --wait $base
node "$repoRoot/tests/tierminator/e2e/check.js" 2 $base
```

Expect the run to complete, with T02 run a second time after T01 was integrated.

Pass conditions: the eight common checks of scenario 1 (`sessions finished` for one run, `result outcome` `complete`, `clean tree`, `on run branch`, `linear history`, `one commit per task` for T01 and T02, `one plan id`, `no leftovers`), and:

- `T01 ran once`: T01 has one attempt record.
- `T02 ran twice`: T02 has two attempt records, both `done`, by two different workers.
- `registry has both`: `src/registry.js` registers alpha and beta and still has one `// REGISTER-HERE` marker.

## Scenario 3: a failed task retries in place

T01 runs a gate that fails the first time. T02 and T03 take longer and run beside it.

```powershell
node "$repoRoot/tests/tierminator/e2e/run-headless.js" 3 --detach
$base = '<path>'
node "$repoRoot/tests/tierminator/e2e/run-headless.js" --wait $base
node "$repoRoot/tests/tierminator/e2e/check.js" 3 $base
```

Expect T01 to fail at `sonnet-medium`, retry at `sonnet-high`, and finish while T02 and T03 are still running or just after.

Pass conditions: the common checks (one run, `complete`, task commits T01 to T03, and the rest), and:

- `T01 retried in place`: T01 has two attempts, the first `retry` at `sonnet-medium` and the second `done` at `sonnet-high`.
- `siblings ran meanwhile`: T02 and T03 each have one `done` attempt that ended after T01's first attempt.

This scenario is timing-sensitive. If the check is inconclusive because the siblings finished before T01 failed, run it again.

## Scenario 4: an exhausted task halts the wave

T02 is an `opus-high` task whose gate fails, so no higher tier is left. Run 1 halts; the harness then fixes the gate and run 2 resumes.

```powershell
node "$repoRoot/tests/tierminator/e2e/run-headless.js" 4 --detach
$base = '<path>'
node "$repoRoot/tests/tierminator/e2e/run-headless.js" --wait $base
node "$repoRoot/tests/tierminator/e2e/check.js" 4 $base
```

Expect two sessions: the first halts at T02 with T01 and T03 integrated, the second completes T02 and T04.

Pass conditions: the common checks (two runs, outcomes `halted` then `complete`, task commits T01 to T04, and the rest), and:

- `halted at T02`: run 1 halted at T02, with T01 and T03 done and T02 and T04 not.
- `passers integrated`: after run 1 the repo holds the task commits of T01 and T03.
- `T02 exhausted at opus-high`: T02's first attempt was at `opus-high` and ended in `halt`.
- `run 2 finished the rest`: run 2 left no task unrun and the last task commit is T04.

## Scenario 5: a failed plan verify halts the run

All three tasks pass, then the plan-level verify fails. The harness fixes the gate between the runs.

```powershell
node "$repoRoot/tests/tierminator/e2e/run-headless.js" 5 --detach
$base = '<path>'
node "$repoRoot/tests/tierminator/e2e/run-headless.js" --wait $base
node "$repoRoot/tests/tierminator/e2e/check.js" 5 $base
```

Expect run 1 to halt after T01 and T02 are integrated, and run 2 to run T03 only.

Pass conditions: the common checks (two runs, `halted` then `complete`, task commits T01 to T03, and the rest), and:

- `verify named`: run 1's halt reason says the plan verify failed and names `gate.js`.
- `picks stayed`: after run 1 the task commits of T01 and T02 are in the history.
- `slot branches kept`: always ok; its detail says whether slot branches were kept after the halt.
- `run 2 ran T03 only`: run 2 finished T03 and the last task commit is T03.

## Scenario 6: a serial plan

Three tasks with no `after` field, so they run one after another as before.

```powershell
node "$repoRoot/tests/tierminator/e2e/run-headless.js" 6 --detach
$base = '<path>'
node "$repoRoot/tests/tierminator/e2e/run-headless.js" --wait $base
node "$repoRoot/tests/tierminator/e2e/check.js" 6 $base
```

Expect the run to complete with the tasks committed in order, never overlapping.

Pass conditions: the common checks (one run, `complete`, task commits T01 to T03, and the rest), and:

- `tasks in order`: the task commits appear as T01, T02, T03.
- `ran one at a time`: no attempt started before the previous one ended.

## Scenario 7: approval of each worker commit (hand-run)

Needs an interactive session in `default` permission mode.

```powershell
node "$repoRoot/tests/tierminator/e2e/setup.js" 7
# prints: ready: <base>
```

1. In a new PowerShell window, `Set-Location <base>/repo`.
2. Start Claude:

   ```powershell
   claude --permission-mode default --plugin-dir "$repoRoot/plugins/tierminator" --setting-sources project
   ```

3. Type `/tierminator:execute "<base>/plans/plan.md"`.
4. Read the start notice. It must carry the permission line: workers ask for approval of each commit; a `cd` command cannot be allowed permanently; use `auto` or `bypassPermissions` mode to run unattended. Note yes or no.
5. Answer every request until Claude says the run is complete, typing nothing else. Note whether every request was one you could answer (approve or deny).
6. Type `/exit`.
7. Check, with the two answers you noted:

   ```powershell
   node "$repoRoot/tests/tierminator/e2e/check.js" 7 <base> --permission-line yes --all-answerable yes
   ```

Pass conditions: the common checks (no sessions are counted for this scenario, the result file says `complete`, task commits T01 to T03, and the rest), and:

- `permission line shown`: you answered `--permission-line yes`.
- `every request answerable`: you answered `--all-answerable yes`.

## Scenario 8: the same plan headless with auto

Three independent tasks in `auto` mode.

```powershell
node "$repoRoot/tests/tierminator/e2e/run-headless.js" 8 --detach
$base = '<path>'
node "$repoRoot/tests/tierminator/e2e/run-headless.js" --wait $base
node "$repoRoot/tests/tierminator/e2e/check.js" 8 $base
```

Expect the run to complete with three task commits.

Pass conditions: the common checks (one run, `complete`, task commits T01 to T03, and the rest), and:

- `three done attempts`: three attempt records, one per task, all `done`.
- `ran at once`: always ok here; the detail says `yes` or `no`, recorded for information only.

## Where results go

`check.js` writes `tests/tierminator/e2e/results/scenario-N/result.json` (the checks, runs, result files, snapshots, final commit subjects, attempts, what you observed, the Claude Code version and a note) and a copy of the telemetry as `telemetry.jsonl` beside it. Commit these. `--note "<text>"` on the check command stores a free-text note in `result.json`.

## When a scenario fails

| Check name or symptom | Where to look |
| --- | --- |
| `sessions finished` fails, or `--wait` prints `worker died` or an error | `<base>/worker.log`, `<base>/status.json`, then `<base>/run-N/stderr.txt` and `meta.json`. A timeout or a missing `claude` is a runner problem, not the plugin. |
| `result outcome` fails | `<base>/result-run-N.json` for the reason, then the end of `<base>/run-N/stream.jsonl` for what Claude said. |
| `clean tree`, `on run branch`, `linear history`, `no leftovers` | `<base>/run-N/snapshot.json` (commits, branches, worktrees after each run) and `git log --graph` in `<base>/repo`. These are plugin bugs: integration left something behind. |
| `one commit per task`, `one plan id` | `git log` in `<base>/repo` for the trailers, and `stream.jsonl` for the worker's report. |
| Attempt checks (`three done attempts`, `T02 ran twice`, `T01 retried in place`, `T02 exhausted at opus-high`) | The telemetry copy in `results/scenario-N/telemetry.jsonl` (tier, outcome, agent id per attempt). |
| Timing checks (`ran at once`, `about the slowest`, `ran one at a time`, `siblings ran meanwhile`) | The `at` and `durationMs` of each attempt in the telemetry copy. Scenario 3 is timing-sensitive: rerun an inconclusive result before calling it a bug. |
| `registry has both` | `src/registry.js` in `<base>/repo` and the conflict handling in `stream.jsonl`. |
| `permission line shown`, `every request answerable` | What you saw in the session. These are your answers, not measurements: a `no` is a finding to record with `--note`. |

A failure in the fixture, the worker, the wait or the checks themselves (a bad plan text, a wrong path, a check that cannot be met) is a runner bug: fix it under `tests/tierminator/e2e/` and rerun. A failure in what the repo, branches or commits look like after the run is a plugin bug: leave the base directory in place, record it with `--note`, and report it.

## Results

| Scenario | Date | Claude Code | Result | Evidence |
| --- | --- | --- | --- | --- |
| Scenario 1 | 2026-10-31 | 2.1.316 (Claude Code) | PASS | `tests/tierminator/e2e/results/scenario-1/result.json` |
| Scenario 2 | 2026-10-31 | 2.1.316 (Claude Code) | PASS | `tests/tierminator/e2e/results/scenario-2/result.json` |
| Scenario 3 | 2026-10-31 | 2.1.316 (Claude Code) | PASS | `tests/tierminator/e2e/results/scenario-3/result.json` |
| Scenario 4 | 2026-10-31 | 2.1.316 (Claude Code) | PASS | `tests/tierminator/e2e/results/scenario-4/result.json` |
| Scenario 5 | 2026-10-31 | 2.1.316 (Claude Code) | PASS | `tests/tierminator/e2e/results/scenario-5/result.json` |
| Scenario 6 | 2026-10-31 | 2.1.316 (Claude Code) | PASS | `tests/tierminator/e2e/results/scenario-6/result.json` |
| Scenario 7 | - | - | pending hand run | `tests/tierminator/e2e/results/scenario-7/result.json` |
| Scenario 8 | 2026-10-31 | 2.1.316 (Claude Code) | PASS | `tests/tierminator/e2e/results/scenario-8/result.json` |

Scenarios 1, 2, 3, 4, 5, 6 and 8 ran headless on 2026-10-31 with Claude Code 2.1.316, and all seven passed every check. Scenario 7 needs an interactive session in `default` permission mode, so it awaits a hand run.
