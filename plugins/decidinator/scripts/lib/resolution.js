// Mode resolution: what is written when a question's oracle ladder ends. Pure helpers here; onFinal and onUserAnswer do the writes.
'use strict'

const childProcess = require('child_process')
const path = require('path')
const config = require('./config.js')
const decisionLog = require('./decision-log.js')
const sidecar = require('./sidecar.js')
const { debug } = require('./debug.js')

const NO_ANSWER = 'none: no oracle returned a valid verdict'
const UNCONFIRMED = ['oracle-unconfirmed', 'oracle-provisional']

const isText = (v) => typeof v === 'string' && v.trim() !== ''
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const RANK = { high: 3, medium: 2, low: 1 }

function setQ(s, id, patch) {
  if (!s.questions?.[id]) return s
  return { ...s, questions: { ...s.questions, [id]: { ...s.questions[id], ...patch } } }
}

function setup(s, id, ctx) {
  const q = s.questions?.[id]
  if (!q) return null
  const projectDir = config.projectDir(ctx.input)
  const logFile = path.resolve(projectDir, ctx.cfg.decisionLog)
  const sideFile = path.resolve(projectDir, ctx.cfg.sidecar)
  const label = contextLabel(process.env, ctx.input?.session_id, gitBranch(projectDir))
  const base = { title: title(q), question: q.question, questionId: id, context: label }
  return { q, logFile, sideFile, label, base }
}

function onFinal(s, id, ctx) {
  try {
    const w = setup(s, id, ctx)
    if (!w) return s
    const { q, logFile, sideFile, label, base } = w
    if (q.decision !== undefined) return s
    const outcome = ctx.outcome?.outcome

    if (outcome === 'resolved') {
      const e = (q.verdicts ?? []).find((x) => x.rung === ctx.outcome.rung)
      if (!e || !isValid(e)) return setQ(s, id, { recordError: 'no valid verdict at the final rung' })
      const r = decisionLog.append(logFile, {
        ...base,
        answer: e.verdict.answer,
        rationale: e.verdict.rationale,
        provenance: 'oracle-unconfirmed',
        confidence: e.verdict.confidence,
        rung: e.rung,
        sources: e.verdict.sources,
        assumptions: e.verdict.assumptions
      })
      return setQ(s, id, { decision: r.ok ? r.id : null, sidecarEntry: null, ...(r.ok ? {} : { recordError: r.error }) })
    }

    if (outcome !== 'final-unresolved' || ctx.mode !== 'sidecar') return s

    const log = decisionLog.read(logFile)
    const side = sidecar.read(sideFile)
    const logModel = log.ok ? log.model : null
    const sideModel = side.ok ? side.model : null
    const dup = findDuplicate(q, q.verdicts, logModel, sideModel)

    if (dup) {
      const a = sidecar.addDependsOn(sideFile, dup.id, label)
      const prov = (logModel?.entries ?? []).map((e) => e.decision).find((d) => d.id === dup.provisionalDecision) ?? null
      let r = null
      if (isText(dup.provisionalDecision) && isText(dup.provisionalAnswer)) {
        r = decisionLog.append(logFile, {
          ...base,
          answer: dup.provisionalAnswer,
          rationale: `Same question as ${dup.id}; uses its provisional answer.`,
          provenance: 'oracle-provisional',
          confidence: prov?.confidence ?? null,
          rung: prov?.rung ?? null,
          sources: prov?.sources ?? [],
          assumptions: prov?.assumptions ?? [],
          sidecar: dup.id
        })
      }
      const patch = { decision: r?.ok ? r.id : null, sidecarEntry: dup.id, duplicateOf: dup.id }
      const error = !a.ok ? a.error : r && !r.ok ? r.error : undefined
      if (error !== undefined) patch.recordError = error
      return setQ(s, id, patch)
    }

    const best = bestAnswer(q.verdicts)
    const errors = []
    let logId = ''
    if (best) {
      const r = decisionLog.append(logFile, {
        ...base,
        answer: best.verdict.answer,
        rationale: best.verdict.rationale,
        provenance: 'oracle-provisional',
        confidence: best.verdict.confidence,
        rung: best.rung,
        sources: best.verdict.sources,
        assumptions: best.verdict.assumptions,
        sidecar: id
      })
      if (r.ok) logId = r.id
      else errors.push(r.error)
    }
    const wr = sidecar.append(sideFile, {
      id,
      topic: base.title,
      question: q.question,
      context: sidecarContext(q, label),
      options: optionsFor(q.verdicts, best),
      provisionalAnswer: best ? best.verdict.answer : NO_ANSWER,
      provisionalDecision: logId,
      dependsOn: [label],
      status: 'open'
    })
    if (!wr.ok) errors.push(wr.error)
    const patch = { decision: logId || null, sidecarEntry: wr.ok ? id : null }
    if (errors.length > 0) patch.recordError = errors[0]
    return setQ(s, id, patch)
  } catch (e) {
    debug(`resolution: ${id}: ${e?.stack ?? e}`)
    return setQ(s, id, { recordError: String(e?.message ?? e) })
  }
}

function onUserAnswer(s, id, answer, ctx) {
  try {
    const w = setup(s, id, ctx)
    if (!w) return s
    const { q, logFile, base } = w
    const d = {
      ...base,
      answer,
      rationale: 'The user answered in the session.',
      provenance: 'user',
      confidence: null,
      rung: null,
      sources: [],
      assumptions: []
    }
    let r
    if (typeof q.decision === 'string' && /^D-\d{4,}$/.test(q.decision)) {
      r = decisionLog.append(logFile, { ...d, supersedes: q.decision })
      if (!r.ok) r = decisionLog.append(logFile, d)
    } else {
      r = decisionLog.append(logFile, d)
    }
    return setQ(s, id, {
      status: 'answered',
      answeredAt: new Date().toISOString(),
      decision: r.ok ? r.id : (q.decision ?? null),
      ...(r.ok ? {} : { recordError: r.error })
    })
  } catch (e) {
    debug(`resolution: ${id}: ${e?.stack ?? e}`)
    return setQ(s, id, { recordError: String(e?.message ?? e) })
  }
}

function counts(projectDir, cfg) {
  const side = sidecar.read(path.resolve(projectDir, cfg.sidecar))
  const log = decisionLog.read(path.resolve(projectDir, cfg.decisionLog))
  return {
    open: side.ok ? side.model.entries.filter((e) => e.question.status === 'open').length : null,
    unconfirmed: log.ok
      ? log.model.entries.filter((e) => UNCONFIRMED.includes(e.decision.provenance) && !e.decision.supersededBy).length
      : null
  }
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
  onUserAnswer,
  counts,
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
