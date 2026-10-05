// H7: StopFailure, which Claude Code fires instead of Stop when an API error ends the turn, a usage limit among them.
// A run that has already ended writes its own result, as H5's Stop would have. Otherwise a usage limit
// (error 'rate_limit') writes the result file with outcome `limit` and the reset time from the transcript
// (lib/limit.js), and any other error writes `halted`. The state is marked resultWritten, so SessionEnd, which
// follows, writes nothing more. Interactive planning (the `planning` phase) is left alone: plan mode goes on after
// the error. Nothing is deleted, and nothing is printed, since Claude Code ignores StopFailure output.
'use strict'

const state = require('./lib/state.js')
const resultFile = require('./lib/result.js')
const limit = require('./lib/limit.js')
const { run, readInput } = require('./lib/hook.js')

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id || !state.isActive(input.session_id)) return
  const s = state.read(input.session_id)
  if (s?.resultWritten || s?.phase === 'planning') return
  let written
  if (resultFile.endOf(s)) {
    written = resultFile.writeEnded(input, s)
  } else {
    const haltedAt = s?.phase === 'running' ? resultFile.currentId(s) : null
    written = limit.isLimit(input)
      ? resultFile.writeOutcome(input, s, 'limit', resultFile.REASONS.limit, {
          haltedAt,
          limit: { detectedAt: new Date().toISOString(), resetsAt: limit.resetsAtFrom(input.transcript_path), raw: input },
        })
      : resultFile.writeOutcome(input, s, 'halted', limit.apiErrorReason(input), { haltedAt })
  }
  if (written && s) state.write(input.session_id, { ...s, resultWritten: true })
})
