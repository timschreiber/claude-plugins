// PreToolUse hook on Agent: while a question is due for oracle research, the model may start only
// the exact oracle dispatch. The Agent call for the due rung and question ID passes (and is recorded
// on the question); any other Agent call is refused with the dispatch to make instead. When nothing is
// due, an Agent call that is an import judgment (/decidinator:import) is only marked dispatched. Silent
// when nothing is due, when the session has no state, and for subagent calls; never denies then.
// Headless sessions (lib/headless.js) have no AskUserQuestion to open a question, so while nothing is
// due, a first-rung dispatch whose prompt opens a question ('Decidinator question NEW ...') mints its
// ID and adds it to the session state; the call is then refused once with the dispatch to make
// (reasons.openedHeadless). A question already known is refused as settled.
'use strict'

const { runArmed, deny } = require('./lib/hook.js')
const state = require('./lib/state.js')
const config = require('./lib/config.js')
const reasons = require('./lib/reasons.js')
const Q = require('./lib/questions.js')
const importer = require('./lib/importer.js')
const headless = require('./lib/headless.js')
const ids = require('./lib/ids.js')

// Marks the waiting import judgment this call dispatches, found by its question ID in the prompt.
function markJudgment(sessionId, s, cfg, toolInput) {
  const waiting = importer.waitingItems(s)
  const prompt = typeof toolInput?.prompt === 'string' ? toolInput.prompt : ''
  if (waiting.length === 0 || toolInput?.subagent_type !== cfg.rungs[0] || !prompt.includes(importer.JUDGMENT_MARK)) return
  const item = waiting.find(i => new RegExp(`\\b${i.id}\\b`).test(prompt))
  if (item) state.update(sessionId, cur => cur && importer.markDispatched(cur, item.id))
}

// Headless only: a first-rung dispatch whose prompt opens a question (lib/headless.js) while nothing is due. Mints the ID and adds the question to the session state. Returns {deny}, {opened}, or null (not an opening, or a failure: fail open).
function openQuestion(input, s, cfg) {
  const call = headless.parseOpening(input.tool_input, cfg.rungs[0])
  if (!call) return null
  const known = Q.findByHash(s ?? Q.emptyState(), call.hash)
  if (known) return { deny: reasons.settled([known.id]) }
  const minted = ids.mint(1, { projectDir: config.projectDir(input), decisionLog: cfg.decisionLog, sidecar: cfg.sidecar })
  if (!minted) return null
  const saved = state.update(input.session_id, cur => Q.addQuestions(cur ?? Q.emptyState(), [call], minted, new Date().toISOString()))
  return saved ? { opened: minted[0] } : null
}

runArmed(async input => {
  if (input.agent_id) return
  const id = input.session_id
  const cfg = config.forInput(input).config
  let s = state.read(id)
  let opened = false
  if (headless.is() && !(s && Q.due(s, cfg.rungs))) {
    const o = openQuestion(input, s, cfg)
    if (o && o.deny) {
      deny(o.deny)
      return
    }
    if (o) {
      opened = true
      s = state.read(id)
    }
  }
  if (!s) return
  const d = Q.dueDispatch(s, cfg)
  if (!d) {
    markJudgment(id, s, cfg, input.tool_input)
    return
  }
  const problem = Q.checkDispatch(d, input.tool_input)
  if (problem) {
    deny(opened ? reasons.openedHeadless(d) : reasons.refused(problem, d))
    return
  }
  state.update(id, cur => cur && Q.recordDispatch(cur, d.id, d.rung, input.tool_use_id, new Date().toISOString(), Q.dispatchContext(input.tool_input?.prompt)))
})
