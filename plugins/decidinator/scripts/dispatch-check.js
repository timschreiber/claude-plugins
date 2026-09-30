// PreToolUse hook on Agent: while a question is due for oracle research, the model may start only
// the exact oracle dispatch. The Agent call for the due rung and question ID passes (and is recorded
// on the question); any other Agent call is refused with the dispatch to make instead. Silent when
// nothing is due, when the session has no state, and for subagent calls.
'use strict'

const { runArmed, deny } = require('./lib/hook.js')
const state = require('./lib/state.js')
const config = require('./lib/config.js')
const reasons = require('./lib/reasons.js')
const Q = require('./lib/questions.js')

runArmed(async input => {
  if (input.agent_id) return
  const id = input.session_id
  const s = state.read(id)
  if (!s) return
  const cfg = config.forInput(input).config
  const d = Q.dueDispatch(s, cfg)
  if (!d) return
  const problem = Q.checkDispatch(d, input.tool_input)
  if (problem) {
    deny(reasons.refused(problem, d))
    return
  }
  state.update(id, cur => cur && Q.recordDispatch(cur, d.id, d.rung, input.tool_use_id, new Date().toISOString(), Q.dispatchContext(input.tool_input?.prompt)))
})
