// H6: keeps the state file honest.
//   failure  PostToolUseFailure Workflow: a launch that failed goes back to "approved", so the
//            guards apply again and the model must relaunch. Tasks are kept for the relaunch.
//   end      SessionEnd: delete the session's state file.
'use strict'

const state = require('./lib/state.js')
const { run, readInput } = require('./lib/hook.js')

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return

  if (process.argv[2] === 'end') {
    state.remove(input.session_id)
    return
  }

  if (input.tool_input?.name !== 'planandtier:execute-plan') return
  const current = state.read(input.session_id)
  if (current?.phase === 'launched') {
    state.write(input.session_id, { ...current, phase: 'approved', guardDenials: 0 })
  }
})
