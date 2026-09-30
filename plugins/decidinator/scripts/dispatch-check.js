// PreToolUse hook on Agent: while a question is due for oracle research, the model may start only
// the exact oracle dispatch. The Agent call for the due rung and question ID passes (and is recorded
// on the question); any other Agent call is refused with the dispatch to make instead. When nothing is
// due, an Agent call that is an import judgment (/decidinator:import) is only marked dispatched. Silent
// when nothing is due, when the session has no state, and for subagent calls; never denies then.
'use strict'

const { runArmed, deny } = require('./lib/hook.js')
const state = require('./lib/state.js')
const config = require('./lib/config.js')
const reasons = require('./lib/reasons.js')
const Q = require('./lib/questions.js')
const importer = require('./lib/importer.js')

// Marks the waiting import judgment this call dispatches, found by its question ID in the prompt.
function markJudgment(sessionId, s, cfg, toolInput) {
  const waiting = importer.waitingItems(s)
  const prompt = typeof toolInput?.prompt === 'string' ? toolInput.prompt : ''
  if (waiting.length === 0 || toolInput?.subagent_type !== cfg.rungs[0] || !prompt.includes(importer.JUDGMENT_MARK)) return
  const item = waiting.find(i => new RegExp(`\\b${i.id}\\b`).test(prompt))
  if (item) state.update(sessionId, cur => cur && importer.markDispatched(cur, item.id))
}

runArmed(async input => {
  if (input.agent_id) return
  const id = input.session_id
  const s = state.read(id)
  if (!s) return
  const cfg = config.forInput(input).config
  const d = Q.dueDispatch(s, cfg)
  if (!d) {
    markJudgment(id, s, cfg, input.tool_input)
    return
  }
  const problem = Q.checkDispatch(d, input.tool_input)
  if (problem) {
    deny(reasons.refused(problem, d))
    return
  }
  state.update(id, cur => cur && Q.recordDispatch(cur, d.id, d.rung, input.tool_use_id, new Date().toISOString(), Q.dispatchContext(input.tool_input?.prompt)))
})
