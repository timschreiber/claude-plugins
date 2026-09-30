// Mode resolution: what is written when a question's oracle ladder ends. Pure helpers here; onFinal and onUserAnswer do the writes.
'use strict'

const childProcess = require('child_process')
const decisionLog = require('./decision-log.js')
const sidecar = require('./sidecar.js')

const NO_ANSWER = 'none: no oracle returned a valid verdict'
const UNCONFIRMED = ['oracle-unconfirmed', 'oracle-provisional']

const isText = (v) => typeof v === 'string' && v.trim() !== ''
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const RANK = { high: 3, medium: 2, low: 1 }

function onFinal(s, id, ctx) {
  return s
}

function isValid(e) {
  return e !== null && typeof e === 'object' && Number.isInteger(e.rung) && e.ok === true &&
    e.verdict !== null && typeof e.verdict === 'object' && isText(e.verdict.answer)
}

const validOf = (verdicts) => (Array.isArray(verdicts) ? verdicts : []).filter(isValid)

function bestAnswer(verdicts) {
  let best = null
  for (const e of validOf(verdicts)) {
    if (best === null) {
      best = e
      continue
    }
    const r = RANK[e.verdict.confidence] ?? 0
    const b = RANK[best.verdict.confidence] ?? 0
    if (r > b || (r === b && e.rung > best.rung)) best = e
  }
  return best
}

const nonEmptyArray = (v) => Array.isArray(v) && v.length > 0
const copyOptions = (options) => options.map((o) => ({ label: o?.label, tradeoffs: o?.tradeoffs }))

function highestRung(entries) {
  let top = null
  for (const e of entries) if (top === null || e.rung > top.rung) top = e
  return top
}

function optionsFor(verdicts, best) {
  if (best && nonEmptyArray(best.verdict?.options)) return copyOptions(best.verdict.options)
  const withOptions = validOf(verdicts).filter((e) => nonEmptyArray(e.verdict.options))
  const top = highestRung(withOptions)
  return top ? copyOptions(top.verdict.options) : []
}

function duplicateId(verdicts) {
  const top = highestRung(validOf(verdicts).filter((e) => typeof e.verdict.duplicate_of === 'string' && e.verdict.duplicate_of !== ''))
  return top ? top.verdict.duplicate_of : null
}

function title(q) {
  if (isText(q?.header)) return q.header.trim()
  const t = String(q?.question ?? '').replace(/\s+/g, ' ').trim()
  return t.length > 60 ? t.slice(0, 57).trimEnd() + '...' : t
}

function gitBranch(dir) {
  try {
    const r = childProcess.spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 3000,
      windowsHide: true
    })
    const out = typeof r.stdout === 'string' ? r.stdout.trim() : ''
    return r.status === 0 && out !== '' && out !== 'HEAD' ? out : null
  } catch {
    return null
  }
}

function contextLabel(env, sessionId, branch) {
  const c = String(env?.DECIDINATOR_CONTEXT ?? '').replace(/\s+/g, ' ').trim()
  let label
  if (c !== '') label = c
  else label = isText(branch) ? `session ${sessionId} on ${branch}` : `session ${sessionId}`
  return label.replace(/;/g, ',')
}

function sidecarContext(q, label) {
  return isText(q?.context) ? q.context.trim() : label
}

function findDuplicate(q, verdicts, logModel, sideModel) {
  const questions = (sideModel?.entries ?? []).map((e) => e.question)
  const qualifies = (c) => c && c.status === 'open' && c.id !== q.id
  const byId = (id) => questions.find((c) => c.id === id)

  const dup = duplicateId(verdicts)
  if (typeof dup === 'string') {
    let candidate = null
    if (dup.startsWith('Q-')) candidate = byId(dup)
    else if (dup.startsWith('D-')) {
      const d = (logModel?.entries ?? []).map((e) => e.decision).find((x) => x.id === dup)
      if (d && d.sidecar) candidate = byId(d.sidecar)
    }
    if (qualifies(candidate)) return candidate
  }

  if (sideModel) {
    const hit = sidecar.findByQuestion(sideModel, q.question).find(qualifies)
    if (hit) return hit
  }

  if (logModel) {
    for (const d of decisionLog.findByQuestion(logModel, q.question)) {
      if (d.sidecar === null || d.sidecar === undefined) continue
      const c = byId(d.sidecar)
      if (qualifies(c)) return c
    }
  }
  return null
}

function userAnswer(input, questionText) {
  const pick = (name) => {
    const a = input?.tool_response?.[name]
    if (isPlain(a)) return a
    const b = input?.tool_input?.[name]
    return isPlain(b) ? b : {}
  }
  const answers = pick('answers')
  const annotations = pick('annotations')
  let raw = answers[questionText]
  if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) raw = raw.join(', ')
  if (!isText(raw)) return null
  const notes = annotations[questionText]?.notes
  return isText(notes) ? `${raw.trim()}\nNotes: ${notes.trim()}` : raw.trim()
}

module.exports = {
  NO_ANSWER,
  UNCONFIRMED,
  onFinal,
  isValid,
  bestAnswer,
  optionsFor,
  duplicateId,
  title,
  gitBranch,
  contextLabel,
  sidecarContext,
  findDuplicate,
  userAnswer
}
