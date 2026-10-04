// H6: SessionEnd deletes the session's state file, its arming flag and telemetry cursor, and its saved plan
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
})
