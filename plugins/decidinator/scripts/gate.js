// PreToolUse hook on AskUserQuestion: holds every main-thread question until oracle research has
// settled it (see reasons.js for what the model is told). Fails open: a subagent call, an unusable
// tool_input, an active pass-through, or a failure to mint IDs or save state all emit nothing and let
// the call through. It never sets permissionDecision to allow, and never changes a status on allow.
'use strict'

const { runArmed, deny, debug } = require('./lib/hook.js')
const state = require('./lib/state.js')
const config = require('./lib/config.js')
const ids = require('./lib/ids.js')
const Q = require('./lib/questions.js')

runArmed(async (input, arming) => {
  if (input.agent_id) return
  const calls = Q.fromCall(input.tool_input)
  if (!calls) return
  const id = input.session_id
  if (Q.passThroughActive(state.read(id) ?? Q.emptyState(), input.prompt_id)) return

  const cfg = config.forInput(input).config
  const project = config.projectDir(input)
  let outcome = null
  const saved = state.update(id, cur => {
    let s = cur ?? Q.emptyState()
    const fresh = Q.classify(s, calls).filter(c => c.kind === 'new').map(c => c.call)
    if (fresh.length > 0) {
      const minted = ids.mint(fresh.length, { projectDir: project, decisionLog: cfg.decisionLog, sidecar: cfg.sidecar })
      if (!minted) return null
      s = Q.addQuestions(s, fresh, minted, new Date().toISOString())
    }
    outcome = Q.decideGate(s, Q.classify(s, calls), arming.mode, cfg)
    return s
  })
  if (!saved || !outcome) {
    debug('gate: could not mint IDs or save state; letting the call through')
    return
  }
  if (outcome.deny) deny(outcome.deny)
})
