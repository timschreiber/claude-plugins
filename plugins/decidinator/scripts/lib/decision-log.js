// Decision log (docs/decisions.md): parse, append the next D- entry, mark an entry superseded.
// Only entry lines are ever rewritten; hand-written text and unknown lines are left as they are.
// Write functions return {ok:true, ...} or {ok:false, error}, and never throw.
'use strict'

const md = require('./mdfile.js')
const io = require('./fileio.js')
const { questionHash } = require('./normalize.js')
const { debug } = require('./debug.js')

const MARKER = '<!-- decidinator-log v1 -->'
const PROVENANCES = ['user', 'stakeholder', 'oracle-confirmed', 'oracle-unconfirmed', 'oracle-provisional']
const CONFIDENCES = ['high', 'medium', 'low']
const ID_RE = /^D-\d{4,}$/

function decisionOf(entry) {
  const get = (name) => md.field(entry, name)?.value ?? ''
  const rung = get('Rung')
  const confidence = get('Confidence')
  return {
    id: entry.id,
    title: entry.title,
    question: get('Question'),
    answer: get('Answer'),
    rationale: get('Rationale'),
    provenance: get('Provenance'),
    confidence: confidence === '' || confidence.toLowerCase() === 'none' ? null : confidence,
    rung: /^\d+$/.test(rung) ? Number(rung) : null,
    sources: md.decodeList(get('Sources')),
    assumptions: md.decodeList(get('Assumptions')),
    questionId: get('Question ID'),
    context: get('Context'),
    date: get('Date'),
    supersedes: get('Supersedes') || null,
    sidecar: get('Sidecar') || null,
    supersededBy: get('Superseded by') || null
  }
}

function parse(text) {
  const lines = md.splitLines(text)
  const entries = md.parseEntries(lines, 'D')
  for (const e of entries) e.decision = decisionOf(e)
  return { lines, eol: md.eolOf(lines), marker: md.readMarker(lines), entries }
}

function serialize(model) {
  return md.joinLines(model.lines)
}

function read(file) {
  try {
    return { ok: true, model: parse(io.readText(file)) }
  } catch (e) {
    return { ok: false, error: `${file}: ${e.message}` }
  }
}

const today = () => new Date().toISOString().slice(0, 10)

function render(id, d) {
  return [
    `### ${id} · ${md.oneLine(d.title)}`,
    '',
    ...md.encodeField('Question', d.question),
    ...md.encodeField('Answer', d.answer),
    ...md.encodeField('Rationale', d.rationale),
    ...md.encodeField('Provenance', d.provenance),
    ...md.encodeField('Confidence', d.confidence ?? 'none'),
    ...md.encodeField('Rung', d.rung ?? 'none'),
    ...md.encodeField('Sources', md.encodeList(d.sources ?? [])),
    ...md.encodeField('Assumptions', md.encodeList(d.assumptions ?? [])),
    ...md.encodeField('Question ID', d.questionId),
    ...md.encodeField('Context', d.context),
    ...md.encodeField('Date', d.date ?? today()),
    ...(d.supersedes ? md.encodeField('Supersedes', d.supersedes) : []),
    ...(d.sidecar ? md.encodeField('Sidecar', d.sidecar) : [])
  ]
}

const present = (v) => v !== undefined && v !== null
const isText = (v) => typeof v === 'string' && v.trim() !== ''
const isStringArray = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string')

// Returns the first problem as text, or null.
function validate(d) {
  if (d === null || typeof d !== 'object') return 'decision: must be an object'
  for (const key of ['title', 'question', 'answer']) {
    if (!isText(d[key])) return `decision: "${key}" must be a non-empty string`
  }
  if (!PROVENANCES.includes(d.provenance)) return `decision: "provenance" must be one of ${PROVENANCES.join(', ')}`
  if (present(d.confidence) && !CONFIDENCES.includes(d.confidence)) {
    return 'decision: "confidence" must be "high", "medium" or "low"'
  }
  if (present(d.rung) && !(Number.isInteger(d.rung) && d.rung >= 1)) {
    return 'decision: "rung" must be a whole number of at least 1'
  }
  for (const key of ['sources', 'assumptions']) {
    if (present(d[key]) && !isStringArray(d[key])) return `decision: "${key}" must be an array of strings`
  }
  for (const key of ['rationale', 'questionId', 'context']) {
    if (present(d[key]) && typeof d[key] !== 'string') return `decision: "${key}" must be a string`
  }
  if (present(d.date) && !(typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date))) {
    return 'decision: "date" must be YYYY-MM-DD'
  }
  if (present(d.supersedes) && !(typeof d.supersedes === 'string' && ID_RE.test(d.supersedes))) {
    return 'decision: "supersedes" must be a decision ID such as D-0003'
  }
  if (present(d.sidecar) && !(typeof d.sidecar === 'string' && /^Q-\d{4,}$/.test(d.sidecar))) {
    return 'decision: "sidecar" must be a question ID such as Q-0003'
  }
  return null
}

// Adds "Superseded by" to the old entry. Returns null when done or already done, else an error.
function markLines(file, lines, oldId, newId) {
  const old = md.parseEntries(lines, 'D').find((e) => e.id === oldId)
  if (!old) return `${file}: ${oldId} not found`
  const by = md.field(old, 'Superseded by')
  if (by) {
    return by.value === newId ? null : `${file}: ${oldId} is already superseded by ${by.value}`
  }
  md.insertLines(lines, md.insertIndex(lines, old), md.encodeField('Superseded by', newId), md.eolOf(lines))
  return null
}

function append(file, d) {
  const problem = validate(d)
  if (problem) return { ok: false, error: problem }
  return io.update(file, (text) => {
    let lines = md.splitLines(text)
    const check = md.checkWritable(file, lines, 'log')
    if (!check.ok) return check
    if (check.fresh) lines = [{ text: MARKER, eol: '\n' }]
    const eol = md.eolOf(lines)
    const id = md.nextId(md.parseEntries(lines, 'D'), 'D')
    if (d.supersedes) {
      const err = markLines(file, lines, d.supersedes, id)
      if (err) return { ok: false, error: err }
    }
    md.appendBlock(lines, render(id, d), eol)
    debug(`decision-log: appended ${id} to ${file}`)
    return { ok: true, id, text: md.joinLines(lines) }
  })
}

function markSuperseded(file, oldId, newId) {
  return io.update(file, (text) => {
    const lines = md.splitLines(text)
    const check = md.checkWritable(file, lines, 'log')
    if (!check.ok) return check
    if (!md.parseEntries(lines, 'D').some((e) => e.id === newId)) return { ok: false, error: `${file}: ${newId} not found` }
    const err = markLines(file, lines, oldId, newId)
    if (err) return { ok: false, error: err }
    debug(`decision-log: ${oldId} superseded by ${newId} in ${file}`)
    return { ok: true, text: md.joinLines(lines) }
  })
}

function findByQuestion(model, text) {
  const hash = questionHash(text)
  return model.entries.map((e) => e.decision).filter((d) => questionHash(d.question) === hash)
}

module.exports = {
  MARKER,
  PROVENANCES,
  CONFIDENCES,
  parse,
  serialize,
  read,
  render,
  validate,
  append,
  markSuperseded,
  findByQuestion
}
