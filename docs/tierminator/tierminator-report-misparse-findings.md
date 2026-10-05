# tierminator: a worker's prose can be read as its report

`parseReport` reads a worker's `STATUS`, `COMMIT`, `VERIFY` and `NOTE` from the first line anywhere in its final
message that starts with that field name. A worker that writes `**Verify:** ...` in a summary before its closing
block therefore has the summary read as its verification result. The run then judges a good attempt as failed,
resets the tree with `git reset --hard`, and discards the worker's commit. This happened to T16 of the Grindinator
WP-01 run. The fix is proposed here, not built.

Measured on Claude Code 2.1.289 (Windows), 2026-10-05, against `plugins/tierminator/scripts/lib/run.js` as of
commit `694e33f`.

Evidence:
- `probes/evidence/tierminator-report-misparse-t16-report.txt`: the T16 worker's hand-back report, as the session
  received it, with the harness's two-space indent. The middle of the results list is abbreviated, as marked in
  the file; the lines that matter (the `**Verify:**` summary line and the closing block) are verbatim.
- `probes/evidence/tierminator-report-misparse-results.json`: that text run through `parseReport` and `judge`
  from `run.js`, the same text with only its closing block, the run's telemetry record for the T16 attempt, and
  the reflog entries.

## Result

| Question | Answer |
|---|---|
| What did the worker report? | A summary paragraph, then the closing block `STATUS: DONE`, `COMMIT: fa87b5d...`, `VERIFY: PASS`, `NOTE: ...`. The block is what the agent file asks for (`agents/opus-medium.md:46-55`). |
| What did tierminator read? | `verify: "** the V1–V9 row count is 9. A node script found that all 90 ..."`. `parseReport` on the whole report returns that (`parseReportOnWholeReport`). On the closing block alone it returns `verify: "PASS"` (`parseReportOnClosingBlockOnly`). |
| Which line caused it? | Line 5 of the report, `**Verify:** the V1–V9 row count is 9. ...` (`linesContainingVerify`). Line 22, `VERIFY: PASS`, is the real one. |
| What did `judge` do with it? | `{ ok: false, reason: "the worker reported DONE but VERIFY was ** the V1–V9 row count is 9. ..." }` (`judgeOnWholeReport`), identical to the reason the run showed and to the telemetry record's `reason` (`t16Telemetry`). |
| What was the damage? | The attempt was recorded `outcome: retry`. `settle` reset the tree to `c077163`, which removed the worker's commit `fa87b5d` from the branch, and a retry was dispatched one tier up, at opus-high. The first attempt had cost $1.67 (`costUsd`) and 5 minutes (`durationMs`). |
| Was the work lost? | **No, but only by luck of the reflog.** `fa87b5d` stayed in `git reflog` (`gitReflog`). It was recovered with `git cherry-pick fa87b5d` as `8eeb2dc`, after the retry worker was stopped. |

## Where it goes wrong

```js
// plugins/tierminator/scripts/lib/run.js:161-168
function parseReport(text) {
  const s = String(text ?? '')
  const field = name => new RegExp(`^[ \\t>*\`]*${name}:[ \\t]*(.*)$`, 'im').exec(s)?.[1].replace(/`+$/, '').trim()
  const status = field('STATUS')?.toUpperCase().match(/^(DONE|FAILED)\b/)?.[1]
  if (!status) return null
  return { status, commit: field('COMMIT') ?? 'NONE', verify: field('VERIFY') ?? 'NOT RUN', note: field('NOTE') ?? '' }
}
```

- **First match wins.** `exec` returns the first line of the whole text that fits. The `m` flag makes `^` match at
  every line, and the `i` flag makes `Verify:` match `VERIFY:`.
- **Markdown prefixes are allowed on the left but not on the right.** The pattern skips spaces, `>`, `*` and
  backticks before the field name, so `**Verify:**` matches. The value starts after the colon, so the closing `**`
  becomes the first characters of the value.
- **Every field has the same problem, not only `VERIFY`.** A prose line that starts with `Note:`, `Commit:` or
  `Status:` would be read the same way, and a `STATUS: DONE` line in quoted output would decide the status.
- **`judge` accepts only `PASS`.** `/^PASS\b/i.test(report.verify)` (line 177) fails on any other value, including
  garbage, and any failure that is not fatal is a retry. `advance` then retries a tier up, and `settle` resets the
  tree first (`settle.js:55-58`).
- **All three read paths share the parser.** `H4 stop` (`h4-dispatch.js:74`) reads `last_assistant_message`, `H1`
  hand-back (`h1-plan-rules.js:65`) reads the whole `<agent-message>` prompt, and `reportFromTranscript`
  (`settle.js:15-34`) reads each assistant message and tool-call `message`. Each calls `parseReport` on text that can
  hold prose before the block.
- **The tests do not cover it.** `tests/tierminator/run.test.js:124` is named "parseReport reads the closing
  block, fenced or not", but its cases are a bare block, a block in a fence, and text with no valid status. None
  has a field name earlier in the text.

## Not yet established

- **Which hook judged T16.** The telemetry record does not say. Both parse the same text the same way, so the
  outcome is the same either way.
- **How often workers do this.** In this run, the other 16 hand-backs I read had a closing block with no earlier
  line that starts with a field name. T16 was the only one with a bold `**Verify:**` summary line, and it ran on
  Opus, which writes longer reports. Whether Sonnet workers or other prompts do it more often is untested.
- **The worker prompt allows it.** The agent files say "End with exactly this block and nothing after it". They do
  not forbid prose before the block, and the block is at the end, as asked.

## Proposed fix

Nothing below is built. Each item has its own commit and test, in the order given.

1. **Read the closing block, not the first match.** In `parseReport`, find the last line that matches
   `STATUS:`, and read `COMMIT`, `VERIFY` and `NOTE` from that line onward. Earlier text is ignored. Keep the
   case-insensitive match and the tolerated prefixes, so the existing lowercase test still passes.
2. **Strip emphasis from the value.** After the colon, drop leading `*` and backtick characters, so a worker that
   writes `**VERIFY:** PASS` is still read as `PASS`.
3. **Do not reset on a value that is not a verdict.** `VERIFY` should be `PASS`, `FAIL` or `NOT RUN`. If `judge`
   gets anything else from a `DONE` report, treat it as unreadable: re-read the report from the transcript, and
   if it is still unreadable, stop the run with a fatal reason (a halt never resets) rather than reset and retry.
   A real `FAIL` and a real `NOT RUN` keep their current retry behavior.
4. **Tests.** In `tests/tierminator/run.test.js`:
   - the T16 report text (a trimmed copy of the evidence) parses to `verify: 'PASS'`;
   - prose lines that start with `Verify:`, `Note:`, `Commit:` and `Status:` before the block are ignored;
   - `**VERIFY:** PASS` parses to `PASS`;
   - a `DONE` report with `VERIFY: maybe` is stopped, not retried, and the tree is not reset.

   In `tests/tierminator/hooks.test.js`, check the same through the hand-back path.
5. **Tell the worker.** In the four agent files (`agents/*.md`, section "Report"), add one sentence: no line before
   the block may start with `STATUS:`, `COMMIT:`, `VERIFY:` or `NOTE:`. This is a hint only; the parser must not
   depend on it.

## Recovering a reset commit

- `git reflog` lists the commit the reset moved away from. `git cherry-pick <sha>` restores it on top of the
  current head. Do this before the retried worker commits, and stop that worker first
  (an unfinished retry leaves its working-tree changes in place).
- A reset keeps the old commit for as long as the reflog does (90 days by default), but a `git gc` after the
  reflog expires can delete it.
