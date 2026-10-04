// H6: SessionEnd deletes the session's state file, its activation flag and telemetry cursor, and its saved plan
// listing. A run does not outlive its session; the tasks
// that finished are already committed.
'use strict'

const state = require('./lib/state.js')
const { run, readInput } = require('./lib/hook.js')

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  if (process.argv[2] !== 'end') return
  state.remove(input.session_id)
  state.deactivate(input.session_id)
  state.clearListing(input.session_id)
  // The approved plan H3 saved beside the state when the plan file could not be read.
  try {
    const plan = state.fileFor(input.session_id)?.replace(/\.json$/, '.plan.md')
    if (plan) require('fs').rmSync(plan, { force: true })
  } catch {}
})
