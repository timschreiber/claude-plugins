# M08: Stop hook (Change 8)

- Status: outline
- Format: 2
- Goal: The plugin ships a `Stop` hook, `hooks/hooks.json` plus the bash script `hooks/stop-guard`, with bats tests. While this checkout has an active-run marker, the hook blocks Claude from ending its turn, with the spec's reason text. It exits immediately when there is no marker, releases after 3 blocks without a heartbeat change, and fails open on any error. `run` keeps the marker's heartbeat fresh, removes stale markers in preflight, and refuses a second active run in the same checkout.
- Depends on: M07
- Milestone verify: `pwsh -NoProfile -File ./scripts/Validate-All.ps1 && bash scripts/run-bats.sh`
- Survey: scout

## Context

Governing sources: spec §9 (Change 8), §20 item 5 (hooks), §1.6; Decisions D04, D06, D11.

- `hooks/hooks.json` registers one `Stop` hook with the command `bash "${CLAUDE_PLUGIN_ROOT}/hooks/stop-guard"`, path quoted.
- `stop-guard` behavior:
  1. Fast path (D06): locate the marker from `$CLAUDE_PROJECT_DIR` with only a file test, before reading stdin or running git. When `.git` is a directory, test `$CLAUDE_PROJECT_DIR/.git/orcastrat/active-run`. When `.git` is a file, read its `gitdir:` line with `sed`. With no marker, exit 0.
  2. With a marker, block the stop with the reason `An Orcastrat run is in progress for <plan dir>. Re-read plan.md and the current milestone file, then continue the run from where the files say it is. If you meant to pause or stop, follow run's Pause or Stop section, which removes the marker.`
  3. Loop guard: count consecutive blocks in the marker (`blocks`, `block_heartbeat`). Reset the count when `heartbeat` has advanced since the last block. After 3 blocks with no heartbeat change, allow the stop, delete the marker, and write `active-run.released` with one line giving the reason (D06).
  4. Fail open: any error allows the stop.
  4a. Source `lib/common` (D44) only after the fast exit, so an idle session never loads it.
  5. Normalize Windows paths from the JSON input: unescape `\\`, and use `cygpath -u` when present.
- The marker's format and the `run-state` script are D06 (built in M05). Block counting may extend `run-state`'s marker keys only as D06 lists them.
- `run`:
  - Heartbeat (`run-state beat`) on every dispatch, every returned agent, and every commit.
  - Preflight: a marker whose heartbeat is more than an hour old is removed, with a one-line mention. A marker with a fresher heartbeat stops preflight, saying another run is active in this checkout.
  - The marker is written at the end of preflight. The toolchain, instruction-file and model checks come before it (M09).
- `claude plugin validate` checks `hooks.json` when pointed at the plugin directory, which `Validate-All.ps1` does.
- README notes on one run per checkout are written in M15.

## Outline

- `hooks/stop-guard` and `tests/orcastrat/stop-guard.bats`. The tests cover: no marker (fast exit, stdin not read), a marker present (block JSON with the reason), the loop guard releasing after 3 and resetting on heartbeat advance, a worktree `.git` file, Windows-escaped paths, and fail-open cases (unreadable marker, unparseable input).
- `hooks/hooks.json`.
- `run`: heartbeat calls at each dispatch, return and commit; the stale-marker and one-run-per-checkout checks in preflight.
