// /decidinator:import logic: classifying each stakeholder answer against the provisional one, the oracle
// judgment for answers that differ in wording, the import job kept in session state, and the report.
// Pure: no file access, and no function mutates its input. State helpers return the new state, or null
// when nothing changes. The job shape is {promptId, file, createdAt, delivered, reminded, items}.
'use strict'

const { oneLine } = require('./mdfile.js')
const { normalizeQuestion } = require('./normalize.js')
const { hasProvisional } = require('./walks.js')

const JUDGMENT_MARK = 'Decidinator import judgment'
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function classify(repoQ, answer) {
  if (!hasProvisional(repoQ)) return { cls: 'changed', note: 'no provisional answer to compare.' }
  if (normalizeQuestion(answer) === normalizeQuestion(repoQ.provisionalAnswer)) {
    return { cls: 'confirmed', note: 'same as the provisional answer.' }
  }
  return { cls: 'waiting', note: '' }
}

function judgmentPrompt(item, cfg) {
  return [
    `Decidinator question ${item.id}`,
    'Rung: 1',
    `Decision log: ${cfg.decisionLog}`,
    `Sidecar: ${cfg.sidecar}`,
    `Question: Does the stakeholder's answer mean the same as the provisional answer? Provisional answer: "${oneLine(item.provisionalAnswer)}". Stakeholder's answer: "${oneLine(item.answer)}".`,
    'Options:',
    '- match: the answers mean the same, so work built on the provisional answer stands.',
    '- change: the answers differ in substance, so work built on the provisional answer must be revisited.',
    `Context: ${JUDGMENT_MARK}. Sidecar question ${item.id} asked: "${oneLine(item.question)}". The stakeholder's answer is already recorded as ${item.decision}. Do not research the original question again; judge only whether the two answers mean the same. End with a verdict whose status is resolved, whose kind is researchable, and whose answer is exactly match or change.`
  ].join('\n')
}

function judgmentCall(item, cfg) {
  return [
    'Call the Agent tool with exactly these parameters:',
    `subagent_type: ${cfg.rungs[0]}`,
    `description: Decidinator import judgment ${item.id}`,
    'prompt:',
    judgmentPrompt(item, cfg)
  ].join('\n')
}

function judgmentInstructions(items, cfg) {
  const n = items.length
  const head = `${plural(n, 'answer')} ${n === 1 ? 'differs' : 'differ'} in wording from the provisional answer, so an oracle judges whether ${n === 1 ? 'it' : 'each'} changed. Make these Agent calls exactly as given, one per answer. Each oracle reports in the background; after the last report has come in, end your turn, and Decidinator gives you the final report to show the user.`
  return [head, ...items.map((i) => judgmentCall(i, cfg))].join('\n\n')
}

// parsed: the result of parseVerdict(text, {questionId, rung: 1}).
function judgmentOf(parsed) {
  const couldNot = (reason) => ({ cls: 'changed', note: `the oracle could not judge it (${reason}), so it counts as changed.` })
  if (!parsed.ok) return couldNot(parsed.reason)
  const v = parsed.verdict
  if (v.status !== 'resolved') return couldNot('its verdict is unresolved')
  const a = normalizeQuestion(v.answer)
  if (a === 'match' || a.startsWith('match ')) return { cls: 'confirmed', note: `the oracle judged it a match. ${oneLine(v.rationale)}` }
  if (a === 'change' || a.startsWith('change ')) return { cls: 'changed', note: `the oracle judged it changed. ${oneLine(v.rationale)}` }
  return couldNot(`its answer is "${oneLine(v.answer).slice(0, 60)}", not match or change`)
}

function mapItems(s, fn) {
  const job = s?.importJob
  if (!job) return null
  let changed = false
  const items = job.items.map((i) => {
    const next = fn(i)
    if (next !== i) changed = true
    return next
  })
  return changed ? { ...s, importJob: { ...job, items } } : null
}

const markDispatched = (s, id) => mapItems(s, (i) => (i.id === id && !i.dispatched ? { ...i, dispatched: true } : i))

const applyJudgment = (s, id, j) => mapItems(s, (i) => (i.id === id && i.cls === 'waiting' ? { ...i, cls: j.cls, note: j.note } : i))

function setFlag(s, flag) {
  const job = s?.importJob
  return job && !job[flag] ? { ...s, importJob: { ...job, [flag]: true } } : null
}
const setDelivered = (s) => setFlag(s, 'delivered')
const setReminded = (s) => setFlag(s, 'reminded')

function waitingItems(s) {
  const job = s?.importJob
  return job && !job.delivered ? job.items.filter((i) => i.cls === 'waiting') : []
}

// The waiting item a finished judgment oracle answered, or null. qid is the question ID in its verdict.
function judgmentId(s, qid, questionInFlight) {
  const waiting = waitingItems(s)
  if (typeof qid === 'string' && waiting.some((i) => i.id === qid)) return qid
  if (qid === null && !questionInFlight) {
    const sent = waiting.filter((i) => i.dispatched)
    if (sent.length === 1) return sent[0].id
  }
  return null
}

function stopStep(job) {
  const waiting = job.items.filter((i) => i.cls === 'waiting')
  if (waiting.length === 0) return 'deliver'
  if (waiting.some((i) => !i.dispatched) && !job.reminded) return 'remind'
  return 'none'
}

function report(job) {
  const by = (cls) => job.items.filter((i) => i.cls === cls)
  const sup = (i) => (i.supersedes ? ` (supersedes ${i.supersedes})` : '')
  const k = by('confirmed').length + by('changed').length + by('waiting').length
  const lines = [
    k === 0
      ? `decidinator: imported no answers from ${job.file}.`
      : `decidinator: imported ${plural(k, 'answer')} from ${job.file} as stakeholder decisions.`
  ]
  const section = (title, cls, line) => {
    const items = by(cls)
    if (items.length > 0) lines.push('', `${title} (${items.length}):`, ...items.map(line))
  }
  section('Confirmed', 'confirmed', (i) => `- ${i.id} → ${i.decision}${sup(i)}: ${i.note}`)
  section('Changed', 'changed', (i) => `- ${i.id} → ${i.decision}${sup(i)}: ${i.note} Depends on: ${i.dependsOn.join('; ') || 'none'}.`)
  section('Waiting for oracle judgment', 'waiting', (i) => `- ${i.id} → ${i.decision}${sup(i)}`)
  section('Skipped', 'skipped', (i) => `- ${i.id}: ${i.note}`)
  section('Failed', 'failed', (i) => `- ${i.id}: ${i.note}`)
  return lines.join('\n')
}

module.exports = {
  JUDGMENT_MARK,
  classify,
  judgmentPrompt,
  judgmentCall,
  judgmentInstructions,
  judgmentOf,
  markDispatched,
  applyJudgment,
  setDelivered,
  setReminded,
  waitingItems,
  judgmentId,
  stopStep,
  report
}
