// SessionEnd hook: deletes every file of the session and sweeps files older than 7 days. It runs
// whether or not the session is armed and never prints.
'use strict'

const { readInput, run } = require('./lib/hook.js')
const state = require('./lib/state.js')

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  state.removeSession(input.session_id)
  state.prune(state.PRUNE_DAYS)
})
