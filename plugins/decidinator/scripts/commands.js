// UserPromptSubmit hook: handles /decidinator:arm [ask|sidecar], /decidinator:disarm and
// /decidinator:status (which also reports the open sidecar and unconfirmed decision-log counts). Commands work whether or not the session is armed, so this uses run()
// rather than runArmed(). Configuration problems are reported in the reply, never a reason to refuse.
'use strict'

const { readInput, emitText, run } = require('./lib/hook.js')
const state = require('./lib/state.js')
const config = require('./lib/config.js')
const msg = require('./lib/messages.js')
const resolution = require('./lib/resolution.js')

const COMMAND = /^\s*\/decidinator:(arm|disarm|status)(?![\w-])([\s\S]*)$/

function arm(input, arg) {
  const id = input.session_id
  const existing = state.readArming(id)
  if (arg !== '' && !state.MODES.includes(arg.toLowerCase())) return msg.badMode(arg)
  const { config: cfg, warnings } = config.forInput(input)
  const mode = arg ? arg.toLowerCase() : existing ? existing.mode : cfg.mode
  if (existing) {
    if (mode === existing.mode) return msg.already(mode) + msg.warnSuffix(warnings)
    if (!state.setMode(id, mode)) return msg.MODE_FAILED
    return msg.switched(existing.mode, mode) + msg.warnSuffix(warnings)
  }
  if (!state.arm(id, mode, 'command')) return msg.FLAG_FAILED
  state.prune(state.PRUNE_DAYS)
  return msg.armed(mode) + msg.warnSuffix(warnings)
}

function disarm(input) {
  const id = input.session_id
  const wasArmed = !!state.readArming(id)
  state.disarm(id)
  return wasArmed ? msg.DISARMED : msg.NOT_ARMED
}

function status(input) {
  const a = state.readArming(input.session_id)
  const { config: cfg, warnings } = config.forInput(input)
  const c = resolution.counts(config.projectDir(input), cfg)
  return (a ? msg.statusArmed(a) : msg.STATUS_UNARMED) + msg.statusCounts(c, cfg) + msg.warnSuffix(warnings)
}

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  const m = COMMAND.exec(String(input.prompt ?? ''))
  if (!m) return
  const text = m[1] === 'arm' ? arm(input, m[2].trim()) : m[1] === 'disarm' ? disarm(input) : status(input)
  emitText(text)
})
