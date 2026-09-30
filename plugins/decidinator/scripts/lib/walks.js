// Review and confirm walks: which sidecar entries or decisions /decidinator:review and
// /decidinator:confirm put to the user, the AskUserQuestion calls that carry them, and how each
// answer is classified. Pure: no file access, and no function mutates its input.
'use strict'

const { oneLine } = require('./mdfile.js')
const { questionHash, normalizeQuestion } = require('./normalize.js')
const { NO_ANSWER, UNCONFIRMED } = require('./resolution.js')

const KEEP = 'Keep provisional'
const SKIP = 'Skip'
const TYPE = 'Type an answer'
const CONFIRM = 'Confirm'
const NO_TRADEOFFS = 'No tradeoffs recorded.'
const MAX_ITEMS = 12
const PER_CALL = 4
const CONF_RANK = { low: 1, medium: 2, high: 3 }
const RESERVED = [KEEP, SKIP, TYPE, CONFIRM].map((l) => l.toLowerCase())

const idNum = (id) => Number(String(id).slice(2))
const isReserved = (label) => RESERVED.includes(oneLine(label).toLowerCase())
const isBlank = (v) => typeof v !== 'string' || v.trim() === ''

function short(text) {
  const t = oneLine(text)
  return t.length > 250 ? `${t.slice(0, 247).trimEnd()}...` : t
}

function hasProvisional(q) {
  return /^D-\d{4,}$/.test(q.provisionalDecision ?? '') && !isBlank(q.provisionalAnswer) && q.provisionalAnswer !== NO_ANSWER
}

const describe = (o) => ({ label: oneLine(o.label), description: short(o.tradeoffs) || NO_TRADEOFFS })

function reviewItems(sideModel) {
  return sideModel.entries
    .map((e) => e.question)
    .filter((q) => q.status === 'open')
    .sort((a, b) => idNum(a.id) - idNum(b.id))
    .map((q) => {
      const options = []
      if (hasProvisional(q)) options.push({ label: KEEP, description: short(q.provisionalAnswer) })
      for (const o of q.options) {
        if (options.length >= 3) break
        if (!isReserved(o.label)) options.push(describe(o))
      }
      if (options.length === 0) options.push({ label: TYPE, description: 'Choose Other and type your answer.' })
      options.push({ label: SKIP, description: 'Leave this question open for now.' })
      const text = `${q.id}: ${oneLine(q.question)}`
      return { kind: 'review', key: q.id, text, hash: questionHash(text), header: q.id, options }
    })
}

function confirmItems(logModel, sideModel) {
  const sidecars = new Map(sideModel.entries.map((e) => [e.question.id, e.question]))
  return logModel.entries
    .map((e) => e.decision)
    .filter((d) => UNCONFIRMED.includes(d.provenance) && !d.supersededBy)
    .map((d) => {
      const entry = d.sidecar ? (sidecars.get(d.sidecar) ?? null) : null
      const labels = entry ? entry.dependsOn : isBlank(d.context) ? [] : [d.context]
      return { d, entry, labels }
    })
    .sort((a, b) => {
      const ka = [-a.labels.length, a.d.flags.includes('cross-cutting') ? 0 : 1, CONF_RANK[a.d.confidence] ?? 0, idNum(a.d.id)]
      const kb = [-b.labels.length, b.d.flags.includes('cross-cutting') ? 0 : 1, CONF_RANK[b.d.confidence] ?? 0, idNum(b.d.id)]
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]
      return 0
    })
    .map(({ d, entry }) => {
      const options = [{ label: CONFIRM, description: short(d.answer) }]
      const answer = normalizeQuestion(d.answer)
      const alternatives = (entry?.options ?? []).filter((o) => !isReserved(o.label) && normalizeQuestion(o.label) !== answer)
      for (const o of alternatives.slice(0, 2)) options.push(describe(o))
      options.push({ label: SKIP, description: 'Leave it unconfirmed for now.' })
      const text = `${d.id}: ${oneLine(d.question)}`
      return { kind: 'confirm', key: d.id, text, hash: questionHash(text), header: d.id, options }
    })
}

// AskUserQuestion calls of at most PER_CALL questions each.
function calls(items) {
  const out = []
  for (let i = 0; i < items.length; i += PER_CALL) {
    out.push(
      items.slice(i, i + PER_CALL).map((it) => ({ question: it.text, header: it.header, options: it.options, multiSelect: false }))
    )
  }
  return out
}

function walkState(by, promptId, items, now) {
  return {
    by,
    promptId,
    createdAt: now,
    items: items.map((i) => ({ kind: i.kind, key: i.key, hash: i.hash, text: i.text, done: false }))
  }
}

function classifyChoice(kind, raw) {
  if (raw === SKIP || raw === TYPE) return 'skip'
  if (kind === 'review') return raw === KEEP ? 'keep' : 'answer'
  return raw === CONFIRM ? 'confirm' : 'override'
}

module.exports = {
  KEEP,
  SKIP,
  TYPE,
  CONFIRM,
  NO_TRADEOFFS,
  MAX_ITEMS,
  PER_CALL,
  short,
  hasProvisional,
  reviewItems,
  confirmItems,
  calls,
  walkState,
  classifyChoice
}
