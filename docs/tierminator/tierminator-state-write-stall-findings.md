# tierminator: runs stall when a state write fails

A tiered run can stop advancing after a background worker finishes. The worker's commit lands, but Claude never
gets the note that names the next task, so the run sits idle until the user does something. This was seen in
the Grindinator WP-01 run (T07 finished, T08 was never dispatched) and has left traces in two earlier sessions.
The fix is proposed here, not built.

Measured on Claude Code 2.1.289 (Windows), 2026-10-05.

Evidence: `probes/evidence/tierminator-state-write-orphans.json`, read from the sessions directory
(`~/.claude/plugins/data/tierminator-timschreiber/sessions`) and from the run's telemetry file. It holds the six
orphaned `<session>.json.<pid>.tmp` files (their fields, not their prompts) and the T07 telemetry record.

## Result

| Question | Answer |
|---|---|
| What did the user see? | T07's worker reported `STATUS: DONE`. Unlike T01 to T06, the hand-back arrived with no "T07 done ... Call the Agent tool now ... T08" note, and nothing was dispatched. |
| Did the work finish? | **Yes.** T07 committed `e0ae220`, its self-test passed, the tree was clean, and its telemetry record says `outcome: done`, `stopReason: report` (`t07Telemetry`). |
| Where did the note go? | Into an orphaned temp file, `dcf7c769-....json.24196.tmp`. It holds phase `running`, task index 7, `inFlight: false`, `noticeByNotification: true`, and a `notice` that begins "tierminator: T07 done (commit e0ae220, sonnet-high). Call the Agent tool now ... T08" (`orphans`). The saved state file never received it. |
| How closely do the times match? | The orphan's modification time, 01:47:26.213Z, is 2 ms after the telemetry record, 01:47:26.211Z. The write came straight after the attempt was recorded. |
| Is it a one-off? | **No.** The sessions directory holds six orphans: one for this run and five from two earlier sessions. Two hold an unsent notice (`hasNotice: true`); four hold none (`notice: null`). |
| Does a later prompt fix it? | **No, it ends the run.** After a typed prompt, tierminator reported T07 as not done and the run as stopped. Only `/tierminator:execute <plan> --from Txx` resumes it. |

## How the notice is lost

A background worker's completion reaches `H4 stop` (the `SubagentStop` hook) and `H1` (the hand-back, an
`<agent-message>` prompt) close together and in either order. A claim file decides which one judges the attempt
(`state.claimAttempt`, commits `6e66d87` and `c7671b1`). The winner then saves the settled state, notice included, with
`state.write`:

```js
// plugins/tierminator/scripts/lib/state.js:36-49
function write(sessionId, state) {
  try {
    ...
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
    fs.renameSync(tmp, file)
    return true
  } catch {
    return false
  }
}
```

If `renameSync` throws, the `catch` returns `false`, keeps no error and leaves the temp file behind. Both callers
then lose the note without a trace:

- **`H4 stop`** (`h4-dispatch.js:93`) ignores the return value. The claim is already held, so no other hook will
  judge the attempt, and the notice that `H1` waits for was never saved.
- **`H1` hand-back** (`h1-plan-rules.js:75`) does `if (!state.write(...)) return`, so it stops before `emitText`
  and prints nothing. This is also true on the hand-back path, where the claim is held by `H1` itself.
- **`awaitNotice`** (`h1-plan-rules.js:89-100`), when `H1` lost the claim, polls `state.read` every 50 ms for up
  to 10 seconds, finds no notice and returns silently. The "finished" notification that follows starts no turn,
  so the notice is never delivered another way.

## Not yet established

- **Why the rename fails.** The error is swallowed, so it was not captured. The likely cause on Windows is a
  collision with another hook process holding the state file open: `awaitNotice` reads it every 50 ms for up to 10
  seconds, exactly when `H4 stop` renames over it. That is an inference. Another cause, such as antivirus or
  indexer access, or a hook killed at its 15-second timeout between the write and the rename, would leave the same
  orphan. The 2 ms gap between the telemetry record and the orphan's mtime favors a failed rename over a timeout,
  but does not prove it.
- **Whether the four orphans without a notice mark a lost message.** The hand-back path saves `notice: null`
  and prints its text only after a successful write, so a failed write there loses the note without leaving one in
  the orphan. The evidence does not show which hook wrote them, or whether those sessions stalled.
- **Whether other state writes are affected.** `state.write` is used by every hook, not only these two.

## Proposed fix

Nothing below is built. Each item has its own commit and test, in the order given.

1. **Retry the rename.** In `state.write`, retry `renameSync` on `EPERM`, `EBUSY` and `EACCES` with the short
   backoff `lib/git.js` already uses for lock errors (`LOCK_RETRY_MS = [100, 200, 400, 800, 1500]`, line 101),
   waiting the way its `sleep` does (`Atomics.wait`, synchronous, line 103). Keep the function's contract: it returns `true` when the state was saved.
2. **Clean up and say so.** When the retries run out, remove the temp file, and record the error code and the
   state's phase through `debug(...)`, which today logs only successes. Today the failure leaves no log line and
   no way to tell which write was lost.
3. **Do not lose the note when a write fails.** In `H1` `handBack`, emit `next.notice` even when `state.write`
   returns `false`: the claim is held, the attempt is settled, and the only thing lost would be the saved state.
   Skip the emit only if `settle` produced no notice. In `H4 stop`, when the write fails, the notice cannot reach `H1`,
   so write it to `<session>.<key>.notice` as a fallback that `awaitNotice` reads, or fail the claim so that `H1` judges
   the attempt.
4. **Poll less.** In `awaitNotice`, back off from the 50 ms interval (for example to 50, 100, 200 ms and then
   steady at 250 ms) so the reader does not hold the file open as often while `H4` settles.
5. **Tests.** In `tests/tierminator/state.test.js`, force `renameSync` to throw twice and then succeed, and check
   that `write` returns `true` and leaves no `.tmp`; force it to always throw and check that it returns `false`
   and leaves no `.tmp`. In `tests/tierminator/hooks.test.js`, check that a failed state write in `handBack` still
   prints the notice, and that a failed write in `H4 stop` still reaches `H1`.
6. **Orphan sweep.** `prune` (`state.js`, 7 days) already deletes `.tmp` files by age. Leave it, and use the
   orphans as the signal when a run stalls (below).

## Diagnosing a stall

- **Look for orphans first.** `ls ~/.claude/plugins/data/tierminator-timschreiber/sessions/*.tmp`. An orphan for the
  session that stalled holds the state that was lost; its `notice` field is the missing step.
- **Resume with the command, not a prompt.** Any typed prompt ends the run. Use
  `/tierminator:execute "<plan path>" --from Txx`, with `Txx` the first task that has no commit
  (`git log` shows `Tierminator-Task` trailers).
- **Check the tree first.** The run's own checks require a clean tree and the same branch.
