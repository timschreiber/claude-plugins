// Writes for the sidecar commands: a decision that answers a sidecar entry (review, import) and a
// confirm of an unconfirmed decision. Each appends one log entry that supersedes the one it replaces,
// supersedes the entry's other provisional decisions (duplicates), and sets the entry's status.
// Return {ok:true, id, supersedes, alsoSuperseded, warnings, ...} or {ok:false, error, skipped?}; never throw.
'use strict'

const md = require('./mdfile.js')
const decisionLog = require('./decision-log.js')
const sidecar = require('./sidecar.js')
const { debug } = require('./debug.js')

const UNCONFIRMED = ['oracle-unconfirmed', 'oracle-provisional']
const SIDECAR_ID = /^Q-\d{4,}$/

// The parsed file when it may be written, else {error}.
function load(read, file, kind) {
  const r = read(file)
  if (!r.ok) return { error: r.error }
  const check = md.checkWritable(file, r.model.lines, kind)
  return check.ok ? { model: r.model, fresh: check.fresh } : { error: check.error }
}

const decisionsOf = (model) => model.entries.map((e) => e.decision)

// Marks the other unsuperseded provisional decisions of a sidecar entry as superseded by newId.
function supersedeDuplicates(logFile, logModel, sidecarId, keepId, newId, warnings) {
  const done = []
  for (const d of decisionsOf(logModel)) {
    if (d.sidecar !== sidecarId || d.provenance !== 'oracle-provisional' || d.supersededBy || d.id === keepId) continue
    const r = decisionLog.markSuperseded(logFile, d.id, newId)
    if (r.ok) done.push(d.id)
    else warnings.push(r.error)
  }
  return done
}

function recordEntryAnswer({ logFile, sideFile, entryId, provenance, answer, rationale, status }) {
  try {
    const side = load(sidecar.read, sideFile, 'sidecar')
    if (side.error) return { ok: false, error: side.error }
    const found = side.fresh ? undefined : side.model.entries.find((e) => e.id === entryId)
    if (!found) return { ok: false, error: `${sideFile}: ${entryId} not found` }
    const q = found.question
    if (q.status !== 'open') return { ok: false, skipped: true, error: `${entryId} is already ${q.status}` }
    const log = load(decisionLog.read, logFile, 'log')
    if (log.error) return { ok: false, error: log.error }
    const prov = decisionsOf(log.model).find((d) => d.id === q.provisionalDecision && !d.supersededBy) ?? null

    const d = {
      title: q.topic,
      question: q.question,
      answer,
      rationale,
      provenance,
      confidence: null,
      rung: null,
      sources: [],
      assumptions: [],
      flags: [],
      questionId: q.id,
      context: prov?.context || q.dependsOn.join(', '),
      sidecar: q.id
    }
    if (prov) d.supersedes = prov.id
    const r = decisionLog.append(logFile, d)
    if (!r.ok) return { ok: false, error: r.error }

    const warnings = []
    const alsoSuperseded = supersedeDuplicates(logFile, decisionLog.read(logFile).model, q.id, prov?.id, r.id, warnings)
    const s = sidecar.setStatus(sideFile, q.id, status)
    if (!s.ok) warnings.push(s.error)
    return { ok: true, id: r.id, supersedes: prov?.id ?? null, alsoSuperseded, warnings, entry: q }
  } catch (e) {
    debug(`record: ${e?.stack ?? e}`)
    return { ok: false, error: String(e?.message ?? e) }
  }
}

function recordConfirm({ logFile, sideFile, decisionId, approve, answer, notes }) {
  try {
    const log = load(decisionLog.read, logFile, 'log')
    if (log.error) return { ok: false, error: log.error }
    const d = log.fresh ? undefined : decisionsOf(log.model).find((x) => x.id === decisionId)
    if (!d) return { ok: false, error: `${logFile}: ${decisionId} not found` }
    if (d.supersededBy) return { ok: false, skipped: true, error: `${decisionId} is already superseded by ${d.supersededBy}` }
    if (!UNCONFIRMED.includes(d.provenance)) {
      return { ok: false, skipped: true, error: `${decisionId} is ${d.provenance}, not unconfirmed` }
    }
    const sidecarId = SIDECAR_ID.test(d.sidecar ?? '') ? d.sidecar : undefined

    const n = {
      title: d.title,
      question: d.question,
      questionId: d.questionId,
      context: d.context,
      supersedes: d.id
    }
    if (sidecarId) n.sidecar = sidecarId
    if (approve) {
      Object.assign(n, {
        answer: d.answer,
        rationale: notes ? `${d.rationale}\nConfirmed with notes: ${notes}` : d.rationale,
        provenance: 'oracle-confirmed',
        confidence: d.confidence,
        rung: d.rung,
        sources: d.sources,
        assumptions: d.assumptions,
        flags: d.flags
      })
    } else {
      Object.assign(n, {
        answer,
        rationale: 'The user overrode the oracle in /decidinator:confirm.',
        provenance: 'user',
        confidence: null,
        rung: null,
        sources: [],
        assumptions: [],
        flags: []
      })
    }
    const r = decisionLog.append(logFile, n)
    if (!r.ok) return { ok: false, error: r.error }

    const warnings = []
    let alsoSuperseded = []
    if (sidecarId) {
      alsoSuperseded = supersedeDuplicates(logFile, decisionLog.read(logFile).model, sidecarId, d.id, r.id, warnings)
      const side = load(sidecar.read, sideFile, 'sidecar')
      const entry = side.error || side.fresh ? undefined : side.model.entries.find((e) => e.id === sidecarId)
      if (entry && entry.question.status === 'open') {
        const s = sidecar.setStatus(sideFile, sidecarId, 'answered')
        if (!s.ok) warnings.push(s.error)
      }
    }
    return { ok: true, id: r.id, supersedes: d.id, alsoSuperseded, warnings }
  } catch (e) {
    debug(`record: ${e?.stack ?? e}`)
    return { ok: false, error: String(e?.message ?? e) }
  }
}

module.exports = { recordEntryAnswer, recordConfirm }
