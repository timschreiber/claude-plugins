// Questions sidecar (docs/open-questions.md): parse, append the next Q- entry, add a Depends on
// label, set Status, and read the Answer a stakeholder filled in. Only entry lines are rewritten;
// hand-written text and unknown lines are left as they are. Write functions return {ok:true, ...}
// or {ok:false, error}, and never throw.
'use strict'

const md = require('./mdfile.js')
const io = require('./fileio.js')
const { questionHash } = require('./normalize.js')
const { debug } = require('./debug.js')

const MARKER = '<!-- decidinator-sidecar v1 -->'
const STATUSES = ['open', 'answered', 'imported']
const ID_RE = /^Q-\d{4,}$/
const OPTION_RE = /^\s+[-*] \*\*(.+?):\*\*(?:[ \t]+(.*))?$/

const isIndented = (l) => l !== undefined && /^[ \t]/.test(l.text) && l.text.trim() !== ''

function optionsOf(lines, entry) {
  const f = md.field(entry, 'Options')
  const options = []
  if (!f) return options
  for (let k = f.line + 1; k < entry.end && isIndented(lines[k]); k++) {
    const m = OPTION_RE.exec(lines[k].text)
    if (m) options.push({ label: m[1].trim(), tradeoffs: (m[2] ?? '').trim() })
    else if (options.length > 0) {
      const cur = options[options.length - 1]
      cur.tradeoffs = cur.tradeoffs === '' ? lines[k].text.trim() : `${cur.tradeoffs}\n${lines[k].text.trim()}`
    }
  }
  return options
}

// The Answer is free text: everything after the label up to the next field line or the entry's end.
function answerOf(lines, entry) {
  const f = md.field(entry, 'Answer')
  if (!f) return ''
  const pieces = [(md.FIELD_RE.exec(lines[f.line].text)[2] ?? '').trim()]
  for (let k = f.line + 1; k < entry.end && !md.FIELD_RE.test(lines[k].text); k++) pieces.push(lines[k].text.trim())
  return pieces.filter((s) => s !== '').join('\n')
}

function questionOf(lines, entry) {
  const get = (name) => md.field(entry, name)?.value ?? ''
  return {
    id: entry.id,
    topic: entry.title,
    question: get('Question'),
    context: get('Context'),
    options: optionsOf(lines, entry),
    provisionalAnswer: get('Provisional answer'),
    provisionalDecision: get('Provisional decision'),
    dependsOn: md.decodeList(get('Depends on')),
    stakeholder: get('Stakeholder') || null,
    status: get('Status'),
    answer: answerOf(lines, entry)
  }
}

function parse(text) {
  const lines = md.splitLines(text)
  const entries = md.parseEntries(lines, 'Q')
  for (const e of entries) e.question = questionOf(lines, e)
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

function encodeOptions(options) {
  if (options.length === 0) return ['- **Options:** none']
  const out = ['- **Options:**']
  for (const o of options) {
    const pieces = String(o.tradeoffs ?? '')
      .split(/\r?\n/)
      .map((p) => p.trim())
      .filter((p) => p !== '')
    out.push(pieces.length === 0 ? `  - **${md.oneLine(o.label)}:**` : `  - **${md.oneLine(o.label)}:** ${pieces[0]}`)
    for (const p of pieces.slice(1)) out.push(`    ${p}`)
  }
  return out
}

function render(id, q) {
  return [
    `### ${id} · ${md.oneLine(q.topic)}`,
    '',
    ...md.encodeField('Question', q.question),
    ...md.encodeField('Context', q.context),
    ...encodeOptions(q.options ?? []),
    ...md.encodeField('Provisional answer', q.provisionalAnswer),
    ...md.encodeField('Provisional decision', q.provisionalDecision ?? ''),
    ...md.encodeField('Depends on', md.encodeList(q.dependsOn ?? [])),
    ...(q.stakeholder ? md.encodeField('Stakeholder', q.stakeholder) : []),
    ...md.encodeField('Status', q.status ?? 'open'),
    '- **Answer:**'
  ]
}

const present = (v) => v !== undefined && v !== null
const isText = (v) => typeof v === 'string' && v.trim() !== ''

// Returns the first problem as text, or null.
function validate(q) {
  if (q === null || typeof q !== 'object') return 'question: must be an object'
  for (const key of ['topic', 'question']) {
    if (!isText(q[key])) return `question: "${key}" must be a non-empty string`
  }
  if (present(q.id) && !(typeof q.id === 'string' && ID_RE.test(q.id))) {
    return 'question: "id" must be a question ID such as Q-0003'
  }
  if (present(q.options)) {
    const ok = Array.isArray(q.options) &&
      q.options.every((o) => o !== null && typeof o === 'object' && isText(o.label) && typeof o.tradeoffs === 'string')
    if (!ok) return 'question: "options" must be an array of {label, tradeoffs} objects'
  }
  if (present(q.provisionalDecision) &&
      !(typeof q.provisionalDecision === 'string' && (q.provisionalDecision === '' || /^D-\d{4,}$/.test(q.provisionalDecision)))) {
    return 'question: "provisionalDecision" must be empty or a decision ID such as D-0003'
  }
  if (present(q.dependsOn) && !(Array.isArray(q.dependsOn) && q.dependsOn.every((s) => typeof s === 'string'))) {
    return 'question: "dependsOn" must be an array of strings'
  }
  if (present(q.status) && !STATUSES.includes(q.status)) return `question: "status" must be one of ${STATUSES.join(', ')}`
  for (const key of ['context', 'provisionalAnswer', 'stakeholder']) {
    if (present(q[key]) && typeof q[key] !== 'string') return `question: "${key}" must be a string`
  }
  return null
}

function append(file, q) {
  const problem = validate(q)
  if (problem) return { ok: false, error: problem }
  return io.update(file, (text) => {
    let lines = md.splitLines(text)
    const check = md.checkWritable(file, lines, 'sidecar')
    if (!check.ok) return check
    if (check.fresh) lines = [{ text: MARKER, eol: '\n' }]
    const eol = md.eolOf(lines)
    const entries = md.parseEntries(lines, 'Q')
    if (q.id && entries.some((e) => e.id === q.id)) return { ok: false, error: `${file}: ${q.id} already exists` }
    const id = q.id ?? md.nextId(entries, 'Q')
    md.appendBlock(lines, render(id, q), eol)
    debug(`sidecar: appended ${id} to ${file}`)
    return { ok: true, id, text: md.joinLines(lines) }
  })
}

// Runs edit(lines, entry, eol) on the named entry under the lock.
function editEntry(file, id, edit) {
  return io.update(file, (text) => {
    const lines = md.splitLines(text)
    const check = md.checkWritable(file, lines, 'sidecar')
    if (!check.ok) return check
    const entry = md.parseEntries(lines, 'Q').find((e) => e.id === id)
    if (!entry) return { ok: false, error: `${file}: ${id} not found` }
    const extra = edit(lines, entry, md.eolOf(lines))
    return { ok: true, ...extra, text: md.joinLines(lines) }
  })
}

// Where a missing field goes: before the first of the named later fields that exists, else at the end.
function insertBefore(lines, entry, laterNames) {
  const later = laterNames.map((n) => md.field(entry, n)).find(Boolean)
  return later ? later.line : md.insertIndex(lines, entry)
}

function addDependsOn(file, id, label) {
  const clean = md.oneLine(label).replace(/;/g, ',')
  if (clean === '') return { ok: false, error: 'question: the "Depends on" label must not be empty' }
  return editEntry(file, id, (lines, entry, eol) => {
    const f = md.field(entry, 'Depends on')
    const list = md.decodeList(f?.value ?? '')
    if (list.includes(clean)) return { added: false }
    const text = `- **Depends on:** ${md.encodeList([...list, clean])}`
    if (f) md.setLine(lines, f.line, text)
    else md.insertLines(lines, insertBefore(lines, entry, ['Stakeholder', 'Status', 'Answer']), [text], eol)
    debug(`sidecar: ${id} depends on ${clean} in ${file}`)
    return { added: true }
  })
}

function setStatus(file, id, status) {
  if (!STATUSES.includes(status)) return { ok: false, error: `question: "status" must be one of ${STATUSES.join(', ')}` }
  return editEntry(file, id, (lines, entry, eol) => {
    const f = md.field(entry, 'Status')
    const text = `- **Status:** ${status}`
    if (f) md.setLine(lines, f.line, text)
    else md.insertLines(lines, insertBefore(lines, entry, ['Answer']), [text], eol)
    debug(`sidecar: ${id} status ${status} in ${file}`)
    return {}
  })
}

function answers(model) {
  return model.entries.map((e) => e.question).filter((q) => q.answer !== '')
    .map((q) => ({ id: q.id, answer: q.answer, question: q }))
}

function findByQuestion(model, text) {
  const hash = questionHash(text)
  return model.entries.map((e) => e.question).filter((q) => questionHash(q.question) === hash)
}

module.exports = {
  MARKER,
  STATUSES,
  parse,
  serialize,
  read,
  render,
  validate,
  append,
  addDependsOn,
  setStatus,
  answers,
  findByQuestion
}
