// PostToolUse hook on AskUserQuestion: in ask mode, records the user's answer to each question the
// oracles left unresolved as a `user` decision, and marks the question answered. Ignores subagent
// calls and review/confirm pass-throughs (WP-09 records those). Prints nothing, ever.
'use strict'

const { runArmed } = require('./lib/hook.js')
const state = require('./lib/state.js')
const config = require('./lib/config.js')
const resolution = require('./lib/resolution.js')
const Q = require('./lib/questions.js')

runArmed(async (input, arming) => {
  if (input.agent_id || arming.mode !== 'ask') return
  const calls = Q.fromCall(input.tool_input)
  if (!calls) return
  const sid = input.session_id
  const s0 = state.read(sid)
  if (!s0 || Q.passThroughActive(s0, input.prompt_id)) return
  const cfg = config.forInput(input).config
  state.update(sid, cur => {
    if (!cur) return null
    let s = cur
    let changed = false
    for (const call of calls) {
      const q = Q.findByHash(s, call.hash)
      if (!q || q.status !== Q.STATUS.FINAL_UNRESOLVED) continue
      const answer = resolution.userAnswer(input, call.question)
      if (answer === null) continue
      s = resolution.onUserAnswer(s, q.id, answer, { cfg, input })
      changed = true
    }
    return changed ? s : null
  })
})
