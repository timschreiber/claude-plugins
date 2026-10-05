// SessionStart hook: arms the session when DECIDINATOR_MODE is set (ask or sidecar), but only for
// source startup, resume or clear. It never arms for compact, so a compaction can't undo
// /decidinator:disarm. A session that is already armed is left as it is. A headless session
// (claude -p) is armed in sidecar mode whatever DECIDINATOR_MODE says, and gets the headless rule
// once, when it is armed; compact never arms or injects.
'use strict'

const { readInput, emit, run } = require('./lib/hook.js')
const state = require('./lib/state.js')
const config = require('./lib/config.js')
const msg = require('./lib/messages.js')
const headless = require('./lib/headless.js')

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  if (!['startup', 'resume', 'clear'].includes(input.source)) return
  const raw = String(process.env.DECIDINATOR_MODE ?? '').trim()
  if (raw === '') return
  const id = input.session_id
  if (state.readArming(id)) return
  const mode = raw.toLowerCase()
  if (!state.MODES.includes(mode)) return emit({ systemMessage: msg.envBad(raw) })
  const { warnings } = config.forInput(input)
  const unattended = headless.is()
  if (!state.arm(id, unattended ? 'sidecar' : mode, 'env')) return emit({ systemMessage: msg.FLAG_FAILED })
  state.prune(state.PRUNE_DAYS)
  if (unattended) {
    return emit({
      systemMessage: msg.envArmedHeadless(mode, warnings),
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: msg.HEADLESS_RULE }
    })
  }
  emit({ systemMessage: msg.envArmed(mode, warnings) })
})
