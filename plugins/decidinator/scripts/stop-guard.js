// Stop hook: while an oracle dispatch is due and not yet made (a new question, or an escalation to
// the next rung), blocks the main thread from ending its turn, with the dispatch to make. The guard
// only sees tool calls, so a model that reads an oracle's report and just answers would otherwise
// skip the next rung. It does not block while the dispatch is in flight (waiting is right then). It
// counts its blocks with the guard's counter and steps aside after guardMaxBlocks, telling the user
// once.
'use strict'

const { runArmed, emit, notify, debug } = require('./lib/hook.js')
const state = require('./lib/state.js')
const config = require('./lib/config.js')
const reasons = require('./lib/reasons.js')
const Q = require('./lib/questions.js')

runArmed(async input => {
  if (input.agent_id) return
  const sid = input.session_id
  const s = state.read(sid)
  if (!s) return
  const cfg = config.forInput(input).config
  const cur = Q.due(s, cfg.rungs)
  if (!cur || Q.inFlight(cur.q, cur.rung)) return
  const key = Q.guardKey(cur.id, cur.rung, false)
  let step = null
  const saved = state.update(sid, latest => {
    if (!latest) return null
    step = Q.guardStep(latest, key, cfg.guardMaxBlocks)
    return step.state
  })
  if (!step || step.action === 'pass' || !saved) return
  if (step.action === 'deny') {
    emit({ decision: 'block', reason: reasons.stopDue(Q.dueDispatch(s, cfg)) })
    return
  }
  debug(`stop-guard: stepped aside for ${cur.id} rung ${cur.rung} after ${step.blocks} blocks`)
  notify(reasons.guardSteppedAside(cur.id, cur.rung, step.blocks))
})
