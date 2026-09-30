// User-facing text for Decidinator's command and start-up hooks. Kept in one place so the
// wording is exact and testable. `w` is an array of configuration warnings.
'use strict'

const MODE_TEXT = {
  ask: 'Questions the oracles cannot settle go to the user.',
  sidecar: 'Questions the oracles cannot settle get a provisional answer and wait in the sidecar for stakeholders.'
}

const warnSuffix = w => (w.length ? ` Configuration problems, ignored: ${w.join('; ')}.` : '')

const armed = mode => `decidinator: armed in ${mode} mode. ${MODE_TEXT[mode]} /decidinator:disarm turns it off.`
const already = mode => `decidinator: already armed in ${mode} mode; nothing changed.`
const switched = (from, to) => `decidinator: switched from ${from} to ${to} mode.`
const badMode = arg => `decidinator: "${arg}" is not a mode; use ask or sidecar. Nothing changed.`

const FLAG_FAILED = 'decidinator: not armed: its flag file could not be written.'
const MODE_FAILED = 'decidinator: nothing changed: its flag file could not be written.'
const DISARMED = 'decidinator: disarmed. Pending questions were dropped; the decision log and sidecar are unchanged.'
const NOT_ARMED = 'decidinator: not armed; nothing changed.'
const STATUS_UNARMED = 'decidinator: not armed. /decidinator:arm turns it on.'

const statusArmed = a =>
  `decidinator: armed in ${a.mode} mode, by ${a.by === 'env' ? 'DECIDINATOR_MODE' : '/decidinator:arm'} at ${a.armedAt}.`
const envArmed = (mode, w) => `decidinator: armed in ${mode} mode by DECIDINATOR_MODE.` + warnSuffix(w)
const envBad = raw => `decidinator: not armed: DECIDINATOR_MODE is "${raw}"; use ask or sidecar.`

module.exports = {
  MODE_TEXT,
  warnSuffix,
  armed,
  already,
  switched,
  badMode,
  FLAG_FAILED,
  MODE_FAILED,
  DISARMED,
  NOT_ARMED,
  STATUS_UNARMED,
  statusArmed,
  envArmed,
  envBad
}
