// H6: SessionEnd deletes the session's state file. A run does not outlive its session; the tasks
// that finished are already committed.
'use strict'

const state = require('./lib/state.js')
const { run, readInput } = require('./lib/hook.js')

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  if (process.argv[2] === 'end') state.remove(input.session_id)
})
