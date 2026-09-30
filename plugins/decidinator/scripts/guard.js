// PreToolUse hook on every tool: while an oracle dispatch is due, denies the main thread's other tool
// calls with the dispatch to make, and while it is in flight, with an instruction to wait for the
// report; after guardMaxBlocks denials in a row for the same due dispatch it steps aside, tells the
// user once and lets calls run. It also captures a rung agent's SubagentHandback message for the
// recorder. Agent and AskUserQuestion belong to the dispatch check and the gate; subagent calls are
// never denied.
'use strict'

const { runArmed, deny, notify, debug } = require('./lib/hook.js')
const state = require('./lib/state.js')
const config = require('./lib/config.js')
const reasons = require('./lib/reasons.js')
const Q = require('./lib/questions.js')

const OWNED = ['Agent', 'AskUserQuestion']

runArmed(async input => {
  const sid = input.session_id
  const cfg = config.forInput(input).config
  if (input.agent_id) {
    if (input.tool_name === 'SubagentHandback' && cfg.rungs.includes(input.agent_type) && typeof input.tool_input?.message === 'string') {
      state.update(sid, cur => cur && Q.setHandback(cur, input.agent_id, input.tool_input.message))
    }
    return
  }
  if (OWNED.includes(input.tool_name)) return
  const s = state.read(sid)
  if (!s) return
  const cur = Q.due(s, cfg.rungs)
  if (!cur) return
  const running = Q.inFlight(cur.q, cur.rung)
  const key = Q.guardKey(cur.id, cur.rung, running)
  let step = null
  const saved = state.update(sid, latest => {
    if (!latest) return null
    step = Q.guardStep(latest, key, cfg.guardMaxBlocks)
    return step.state
  })
  if (!step || step.action === 'pass' || !saved) return
  const d = Q.dueDispatch(s, cfg)
  if (step.action === 'deny') {
    deny(running ? reasons.guardWaiting(d) : reasons.guardDue(d))
    return
  }
  debug(`guard: stepped aside for ${cur.id} rung ${cur.rung} after ${step.blocks} blocks`)
  notify(reasons.guardSteppedAside(cur.id, cur.rung, step.blocks))
})
