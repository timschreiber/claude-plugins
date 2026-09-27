// H6: keeps the state file honest.
//   launched  PostToolUse Workflow: the workflow started, so mark the state "launched", which
//             stands the guards down. This is the only place a launch is recorded: a call
//             rejected after H4 or declined at the review fires no event, and stays "approved".
//   failure   PostToolUseFailure Workflow: a launch that failed goes back to "approved", so the
//             guards apply again and the model must relaunch. Tasks are kept for the relaunch.
//   end       SessionEnd: delete the session's state file.
'use strict'

const state = require('./lib/state.js')
const { run, readInput } = require('./lib/hook.js')

const WORKFLOW = 'planandtier:execute-plan'

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  const mode = process.argv[2]

  if (mode === 'end') {
    state.remove(input.session_id)
    return
  }

  if (input.tool_input?.name !== WORKFLOW) return
  const current = state.read(input.session_id)

  if (mode === 'launched') {
    if (!current || current.phase === 'planning' || !Array.isArray(current.tasks) || current.tasks.length === 0) return
    state.write(input.session_id, {
      ...current,
      phase: 'launched',
      launchedAt: new Date().toISOString(),
      guardDenials: 0,
    })
    return
  }

  if (mode === 'failure' && current?.phase === 'launched') {
    state.write(input.session_id, { ...current, phase: 'approved', guardDenials: 0 })
  }
})
