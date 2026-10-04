# tierminator: tier sweep run

The sweep runs the same five fixed tasks on every tier agent (`tierminator:<model>-<effort>`) a few
times and records, per run, the turns, tool calls, cost, duration, whether Verify passed and whether the
worker hit its turn limit. The data is for two decisions:
- each tier's `maxTurns` (`agents/<tier>.md`, mirrored in `MAX_TURNS` in `scripts/lib/tasks.js`);
- whether `sonnet-high` or `opus-medium` is the better rung for the same work.

The turn-usage table in `tierminator-agent-dispatch-findings.md` comes from whatever tasks happened to
run; the sweep gives the same numbers on fixed tasks, so tiers can be compared directly.

## What it runs

| What | Where |
|---|---|
| The harness | `probes/planandtier/tier-sweep.js` |
| The tasks | `probes/planandtier/tier-sweep-fixtures/tasks.json`: `rename` (find-and-replace rename across four files), `new-file` (a new module plus its tests), `parser` (a CSV line parser with edge cases, against a given test file), `cross-file` (a behavior change in `format.js`, `report.js` and their tests), `debug` (a seeded failing test with two bugs) |
| The fixture repo | `tier-sweep-fixtures/base`, plus `tier-sweep-fixtures/overlays/<task>` where the task has one. Rebuilt from scratch for every run at `%TEMP%\tierminator-tier-sweep\run-<n>\repo` and committed once, so the worker starts from a clean tree. |
| The session | One `claude -p` per run, in the fixture repo, on `sonnet` at `low` effort, with `plugins/tierminator` loaded by `--plugin-dir`. It calls the Agent tool once, in the foreground, with the tier's `subagent_type` and the prompt tierminator gives a worker (`Tasks file:`, `Plan:`, `Task:` lines). The tasks file sits next to the repo (`--add-dir`). tierminator's hooks stay silent, since nothing arms them; a worker that hits its limit is not resumed. |
| Verify | Run by the harness after the session, in the fixture repo: the task's `node --test` files must pass, the patterns it names must have no `git grep` match, and the test files it names must be byte-equal to the fixture. |
| The output | `probes/evidence/planandtier-tier-sweep-<timestamp>.jsonl` |

The worker's turns, tool calls and cost come from its transcript under
`~/.claude/projects/<slug>/<session>/subagents/` (or `CLAUDE_CONFIG_DIR`), counted as `lib/usage.js`
counts them: a turn is one distinct assistant message id, and cost is priced with `lib/prices.js`.

## Running it

From the repo root, with `claude` signed in and on `PATH`:

```
node probes/planandtier/tier-sweep.js --dry-run
node probes/planandtier/tier-sweep.js
```

`--dry-run` lists the planned runs (50 by default: 5 tasks x 5 tiers x 2 repetitions) and spends
nothing. The flags narrow a sweep:

| Flag | Default | Example |
|---|---|---|
| `--tiers` | all five, from `TIERS` in `lib/tasks.js` | `--tiers sonnet-high,opus-medium` |
| `--tasks` | all five | `--tasks parser,debug` |
| `--reps` | 2 | `--reps 4` |

The runs are serial. Each prints one line as it finishes, and its record is appended at once, so a
stopped sweep keeps the runs it finished. A run gives up after 30 minutes.

To compare only the contested rung with more samples:

```
node probes/planandtier/tier-sweep.js --tiers sonnet-high,opus-medium --reps 5
```

## What it costs

From the smoke test (Claude Code 2.1.289, 2026-10-04): `rename` on `sonnet-low` took 4 turns, 4 tool
calls and 16 to 20 seconds; the worker cost $0.04 to $0.06 and the whole session (worker plus the
dispatching session) $0.10 to $0.13. So the dispatching session adds about $0.06 per run.

A full sweep has not been run. Scaled from that one run (inferred, not measured): the other tasks take
more turns, the higher sonnet efforts more turns again, and opus costs twice sonnet per token and used
about twice the turns in the findings' table, so expect roughly $0.10 to $0.30 per sonnet run and $0.50 to
$1.50 per opus run, or about $15 to $40 and one to two hours for the default 50 runs. The summary's
`whole-session cost` line gives the real figure; put it here after the first full sweep.

## Reading the output

Each run is one `{"type": "run"}` line:

| Field | Meaning |
|---|---|
| `task`, `tier`, `rep` | Which run |
| `maxTurns` | The tier's limit at the time (`MAX_TURNS`) |
| `turns`, `toolCalls` | Distinct assistant messages and tool calls in the worker's transcript (`countSource: "stream"` when the transcript was not found and they were counted from the session's stream) |
| `costUsd` | The worker's cost; `sessionCostUsd` adds the dispatching session |
| `durationMs` | Wall time of the whole session |
| `verifyPassed`, `verifyFailures` | The harness's Verify, and what failed |
| `hitTurnLimit` | The Agent result said `stopped at its N-turn limit`, or `turns` reached `maxTurns` |
| `reportedStatus`, `workerCommits` | What the worker reported (`DONE`, `FAILED` or null) and how many commits it made |
| `repo`, `sessionId` | Where to look at a run by hand; the repo is overwritten by the next sweep |

The last line is `{"type": "summary"}`, also printed as a table, with one row per tier: runs, passes,
`maxTurns`, turns p50, p90 and max (nearest-rank), tool calls per turn, mean and total cost, mean
duration, and how many runs hit the limit.

## Picking turn limits

- **A limit is too low** when any run of a tier hit it (`hit limit` above 0), or its max turns are within
  about 80% of `maxTurns`. A run that hit the limit also failed Verify unless it had already committed;
  check `workerCommits`.
- **Set a limit from the p90 and max, not the p50.** A limit at about twice the tier's max over the sweep,
  and at least three times its p90, leaves room for real tasks, which are larger than these five.
- **Don't lower a limit from one sweep.** The fixtures are small, so a sweep shows how tiers compare and
  where a limit is clearly too low; it does not show how much headroom real tasks need. Compare with the
  turn-usage table in `tierminator-agent-dispatch-findings.md` before lowering one.
- **For `sonnet-high` vs `opus-medium`**, compare the two rows on pass rate first, then on cost per pass
  (`cost total / passed`), then turns. If `opus-medium` passes more for little more cost per pass, it is the
  better rung above `sonnet-medium`; if they pass alike, the cheaper one is.
- Any change to `maxTurns` goes in both `agents/<tier>.md` and `MAX_TURNS`, with the sweep's file added as
  evidence in the findings doc.
