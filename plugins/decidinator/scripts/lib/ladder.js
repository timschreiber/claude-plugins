// The oracle ladder rules. Pure: decides from a question's recorded verdicts what happens next
// (escalate to the next rung, resolved, or final-unresolved). Never touches files or state.
'use strict'

const { fallback } = require('./verdict.js')

const ESCALATING_FLAGS = ['spec-silent', 'spec-contradiction', 'cross-cutting']

function next(verdicts, rungs) {
  const N = rungs.length
  const entries = (Array.isArray(verdicts) ? verdicts : []).filter((e) => e !== null && typeof e === 'object' && Number.isInteger(e.rung))
  if (entries.length === 0) return { outcome: 'escalate', rung: 1 }
  let latest = entries[0]
  for (const e of entries) {
    if (e.rung >= latest.rung) latest = e
  }
  const v = latest.ok === false || !latest.verdict || typeof latest.verdict !== 'object' ? fallback() : latest.verdict
  const r = latest.rung
  const flags = Array.isArray(v.flags) ? v.flags : []
  if (v.kind === 'human-only') {
    return { outcome: v.status === 'resolved' ? 'resolved' : 'final-unresolved', rung: r }
  }
  const escalates = v.confidence === 'low' || v.status !== 'resolved' || flags.some((f) => ESCALATING_FLAGS.includes(f))
  if (escalates && r < N) return { outcome: 'escalate', rung: r + 1 }
  return { outcome: v.status === 'resolved' ? 'resolved' : 'final-unresolved', rung: r }
}

module.exports = { ESCALATING_FLAGS, next }
