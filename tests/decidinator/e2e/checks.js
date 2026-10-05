'use strict'

// The per-scenario checks of the end-to-end run, as a pure module: the files and hook records of a
// run go in, a list of named pass or fail checks comes out. It reads no file and no process state.

const path = require('path')
const lib = path.join(__dirname, '..', '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const decisionLog = require(path.join(lib, 'decision-log.js'))
const sidecar = require(path.join(lib, 'sidecar.js'))
const { normalizeQuestion } = require(path.join(lib, 'normalize.js'))
const { ESCALATING_FLAGS } = require(path.join(lib, 'ladder.js'))
const { QUESTIONS, SCENARIOS, contextLabel } = require('./scenarios.js')
const { ANSWERS } = require('./fixture.js')

const ORACLE_1 = 'decidinator:oracle-1'
const ORACLE_2 = 'decidinator:oracle-2'
const ORACLE_3 = 'decidinator:oracle-3'
const VERDICTS_PREFIX = 'Earlier verdicts: '

const inputOf = (r) => (r && r.input !== null && typeof r.input === 'object' ? r.input : {})
const toolInput = (r) => {
  const t = inputOf(r).tool_input
  return t !== null && typeof t === 'object' ? t : {}
}
const jeq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const same = (a, b) => normalizeQuestion(a) === normalizeQuestion(b)

// Hook records of one tool call made by the main session (not a subagent).
function mainCalls(records, event, tool) {
  return records.filter((r) => r.event === event && inputOf(r).tool_name === tool && !inputOf(r).agent_id)
}

function stops(records, agent) {
  return records.filter((r) => r.event === 'SubagentStop' && inputOf(r).agent_type === agent)
}

// A check is { name, pass, detail }; detail is '' when it passes and is built only when it fails.
function chk(name, pass, detail) {
  const ok = Boolean(pass)
  return { name, pass: ok, detail: ok ? '' : String(typeof detail === 'function' ? detail() : detail ?? '') }
}

// A check on the first new decision, which fails when there is none.
function onDecision(x, name, test, detail) {
  if (!x.d) return chk(name, false, 'no new decision')
  return chk(name, test(x.d), () => detail(x.d))
}

function buildContext(n, inputs) {
  const records = Array.isArray(inputs.records) ? inputs.records : []
  const log = decisionLog.parse(inputs.logText ?? '')
  const decisions = log.entries.map((e) => e.decision)
  const fresh = decisions.filter((d) => d.id !== 'D-0001')
  const side = sidecar.parse(inputs.sidecarText ?? '')
  const entries = side.entries.map((e) => e.question)
  const question = SCENARIOS[n].question
  return {
    n,
    records,
    strings: Array.isArray(inputs.transcriptStrings) ? inputs.transcriptStrings : [],
    finalMessage: inputs.finalMessage ?? '',
    exportedText: inputs.exportedText ?? '',
    answeredText: inputs.answeredText ?? '',
    log,
    decisions,
    fresh,
    d: fresh[0],
    side,
    entries,
    e: entries[0],
    Q: question ? QUESTIONS[question] : null
  }
}

const logMarker = (x) => chk('log-marker', jeq(x.log.marker, { kind: 'log', major: 1 }), () => 'marker ' + JSON.stringify(x.log.marker))
const sidecarMarker = (x) =>
  chk('sidecar-marker', jeq(x.side.marker, { kind: 'sidecar', major: 1 }), () => 'marker ' + JSON.stringify(x.side.marker))
const oneNewDecision = (x) => chk('one-new-decision', x.fresh.length === 1, () => `found ${x.fresh.length} new decisions`)
const decisionQuestion = (x) =>
  onDecision(x, 'decision-question', (d) => d.questionId === 'Q-0002' && same(d.question, x.Q.question),
    (d) => `question ID ${d.questionId}, question "${d.question}"`)
const sidecarEmpty = (x) => chk('sidecar-empty', x.entries.length === 0, () => `found ${x.entries.length} sidecar entries`)
const oracle1Stopped = (x) => {
  const count = stops(x.records, ORACLE_1).length
  return chk('oracle-1-stopped', count >= 1, () => `found ${count} oracle-1 stops`)
}
const noOracle2 = (x) => {
  const count = stops(x.records, ORACLE_2).length
  return chk('no-oracle-2', count === 0, () => `found ${count} oracle-2 stops`)
}
const askIntercepted = (x) => {
  const count = mainCalls(x.records, 'PreToolUse', 'AskUserQuestion').length
  return chk('ask-intercepted', count >= 1, () => `found ${count} intercepted AskUserQuestion calls`)
}
const askNeverShown = (x) => {
  const count = mainCalls(x.records, 'PostToolUse', 'AskUserQuestion').length
  return chk('ask-never-shown', count === 0, () => `AskUserQuestion was shown ${count} times`)
}

function filesResolved(x) {
  return [
    logMarker(x),
    oneNewDecision(x),
    onDecision(x, 'decision-oracle-unconfirmed', (d) => d.provenance === 'oracle-unconfirmed', (d) => `provenance ${d.provenance}`),
    onDecision(x, 'decision-rung-1', (d) => d.rung === 1, (d) => `rung ${d.rung}`),
    decisionQuestion(x),
    onDecision(x, 'decision-answer-node-test', (d) => /node:test|node --test/i.test(d.answer), (d) => `answer "${d.answer}"`),
    sidecarEmpty(x)
  ]
}

function recordsResolved(x) {
  return [oracle1Stopped(x), noOracle2(x), askIntercepted(x), askNeverShown(x)]
}

function scenarioPlanMode(x) {
  const modes = x.records.map((r) => inputOf(r).permission_mode).filter((m) => typeof m === 'string')
  const odd = modes.filter((m) => m !== 'plan')
  const research = x.records.filter((r) => {
    const i = inputOf(r)
    return r.event === 'PostToolUse' && i.agent_type === ORACLE_1 && (i.tool_name === 'WebFetch' || i.tool_name === 'WebSearch')
  })
  return [
    chk('plan-mode-throughout', modes.length >= 1 && odd.length === 0, () =>
      modes.length === 0 ? 'no permission mode recorded' : `permission mode ${odd[0]}`),
    chk('oracle-web-research', research.length >= 1, 'oracle-1 used no WebFetch or WebSearch')
  ]
}

function scenarioHumanOnly(x) {
  const stop = stops(x.records, ORACLE_1)[0]
  const shown = mainCalls(x.records, 'PostToolUse', 'AskUserQuestion').some((p) => {
    const qs = toolInput(p).questions
    if (!stop || !Array.isArray(qs)) return false
    return Date.parse(p.at) > Date.parse(stop.at) &&
      qs.some((q) => q && same(q.question, x.Q.question) && Array.isArray(q.options) && q.options.length >= 2)
  })
  // The user may pick any option: the logged answer must be the one the dialog returned.
  const answered = mainCalls(x.records, 'PostToolUse', 'AskUserQuestion').map((p) => toolInput(p).answers)
    .filter((a) => a !== null && typeof a === 'object')
  const last = answered.length > 0 ? answered[answered.length - 1] : {}
  const key = Object.keys(last).find((k) => same(k, x.Q.question))
  const picked = key !== undefined && typeof last[key] === 'string' ? last[key] : ''
  return [
    logMarker(x),
    oneNewDecision(x),
    onDecision(x, 'decision-user', (d) => d.provenance === 'user', (d) => `provenance ${d.provenance}`),
    decisionQuestion(x),
    onDecision(x, 'decision-answer-matches-pick', (d) => picked !== '' && same(d.answer, picked),
      (d) => (picked === '' ? 'the dialog returned no answer' : `answer "${d.answer}", the dialog returned "${picked}"`)),
    onDecision(x, 'decision-no-rung', (d) => d.rung === null && d.confidence === null,
      (d) => `rung ${d.rung}, confidence ${d.confidence}`),
    sidecarEmpty(x),
    oracle1Stopped(x),
    noOracle2(x),
    chk('ask-shown-after-research', shown, () => (stop ? 'no question with options shown after research' : 'no oracle-1 stop'))
  ]
}

function scenarioSidecar(x) {
  const e = x.e
  const entryFields = () => {
    if (!e) return false
    return e.id === 'Q-0002' && e.status === 'open' && same(e.question, x.Q.question) &&
      Boolean(x.d) && e.provisionalDecision === x.d.id && e.provisionalAnswer.trim() !== '' &&
      e.options.length >= 2 && e.answer === ''
  }
  const out = [
    logMarker(x),
    sidecarMarker(x),
    oneNewDecision(x),
    onDecision(x, 'decision-provisional', (d) => d.provenance === 'oracle-provisional' && d.sidecar === 'Q-0002',
      (d) => `provenance ${d.provenance}, sidecar ${d.sidecar}`),
    decisionQuestion(x),
    chk('one-sidecar-entry', x.entries.length === 1, () => `found ${x.entries.length} sidecar entries`),
    chk('entry-fields', entryFields(), () => (e ? `entry ${e.id}, status ${e.status}` : 'no sidecar entry')),
    chk('entry-depends-on', Boolean(e) && jeq(e.dependsOn, [contextLabel(x.n)]), () =>
      e ? `depends on ${JSON.stringify(e.dependsOn)}` : 'no sidecar entry'),
    oracle1Stopped(x),
    askNeverShown(x),
    chk('session-continued', x.finalMessage.includes('RESULT:'), 'the final message has no RESULT: line')
  ]
  if (x.n === '4') out.push(askIntercepted(x))
  return out
}

// The rung 2 dispatch and the rung 1 verdict found in its prompt.
function rungTwo(x) {
  const call = mainCalls(x.records, 'PreToolUse', 'Agent').find((a) => {
    const t = toolInput(a)
    return t.subagent_type === ORACLE_2 && typeof t.prompt === 'string' && t.prompt.includes('Decidinator question Q-0002')
  })
  if (!call) return { call: null, verdict: null }
  const line = toolInput(call).prompt.split('\n').find((l) => l.startsWith(VERDICTS_PREFIX))
  let verdict = null
  if (line !== undefined) {
    try {
      const list = JSON.parse(line.slice(VERDICTS_PREFIX.length).trim())
      if (Array.isArray(list)) verdict = list.find((v) => v !== null && typeof v === 'object' && v.rung === 1 && v.question_id === 'Q-0002') ?? null
    } catch {
      verdict = null
    }
  }
  return { call, verdict }
}

function scenarioEscalation(x) {
  const { call, verdict: v } = rungTwo(x)
  const o2 = stops(x.records, ORACLE_2).length
  const o3 = stops(x.records, ORACLE_3).length
  const escalated = Boolean(v) && (
    v.confidence === 'low' ||
    (v.status !== 'resolved' && v.kind === 'researchable') ||
    (Array.isArray(v.flags) && v.flags.some((f) => ESCALATING_FLAGS.includes(f)))
  )
  return [
    logMarker(x),
    oneNewDecision(x),
    decisionQuestion(x),
    onDecision(x, 'decision-rung-2-or-user',
      (d) => (d.provenance === 'oracle-unconfirmed' && d.rung === 2) || d.provenance === 'user',
      (d) => `provenance ${d.provenance}, rung ${d.rung}`),
    oracle1Stopped(x),
    chk('oracle-2-stopped', o2 >= 1, () => `found ${o2} oracle-2 stops`),
    chk('no-oracle-3', o3 === 0, () => `found ${o3} oracle-3 stops`),
    chk('rung-2-dispatch', Boolean(call), 'no rung 2 dispatch'),
    chk('rung-2-has-rung-1-verdict', Boolean(v), () => (call ? 'no rung 1 verdict in the prompt' : 'no rung 2 dispatch')),
    chk('rung-1-escalated', escalated, () => (v ? `rung 1 verdict: ${JSON.stringify(v)}` : call ? 'no rung 1 verdict in the prompt' : 'no rung 2 dispatch'))
  ]
}

function scenarioRoundTrip(x) {
  const text = x.exportedText.replace(/\r\n/g, '\n')
  const exp = sidecar.parse(x.exportedText)
  const expIds = exp.entries.map((e) => e.id)
  const answered = sidecar.answers(sidecar.parse(x.answeredText)).map((a) => a.id).sort()
  const byId = (id) => x.decisions.find((d) => d.id === id)
  const judgments = (id) => mainCalls(x.records, 'PreToolUse', 'Agent')
    .filter((a) => toolInput(a).description === 'Decidinator import judgment ' + id).length
  const stakeholder = (id, supersedes, qid) => {
    const d = byId(id)
    return Boolean(d) && d.provenance === 'stakeholder' && d.supersedes === supersedes && same(d.answer, ANSWERS[qid])
  }
  const status = (id) => x.entries.find((q) => q.id === id)?.status
  const has = (s) => x.strings.some((item) => typeof item === 'string' && item.includes(s))
  const changed = '- Q-0003 → D-0005 (supersedes D-0003): the oracle judged it changed.'
  return [
    chk('export-marker', jeq(exp.marker, { kind: 'sidecar', major: 1 }), () => 'marker ' + JSON.stringify(exp.marker)),
    chk('export-entries', jeq(expIds, ['Q-0002', 'Q-0003']) && exp.entries.every((e) => e.question.answer === ''), () =>
      `exported ${JSON.stringify(expIds)}`),
    chk('export-groups',
      text.includes('\n## Stakeholder: Product team\n') && text.includes('\n## Topic: Equal due dates order\n'),
      'a group heading is missing from the export'),
    chk('answers-filled', jeq(answered, ['Q-0002', 'Q-0003']), () => `answers for ${JSON.stringify(answered)}`),
    chk('stakeholder-decisions', stakeholder('D-0004', 'D-0002', 'Q-0002') && stakeholder('D-0005', 'D-0003', 'Q-0003'),
      'D-0004 or D-0005 is missing or wrong'),
    chk('provisionals-superseded', byId('D-0002')?.supersededBy === 'D-0004' && byId('D-0003')?.supersededBy === 'D-0005',
      () => `D-0002 superseded by ${byId('D-0002')?.supersededBy}, D-0003 by ${byId('D-0003')?.supersededBy}`),
    chk('entries-imported', status('Q-0002') === 'imported' && status('Q-0003') === 'imported',
      () => `Q-0002 is ${status('Q-0002')}, Q-0003 is ${status('Q-0003')}`),
    chk('judgment-dispatched', judgments('Q-0003') >= 1 && judgments('Q-0002') === 0,
      () => `Q-0003 judged ${judgments('Q-0003')} times, Q-0002 ${judgments('Q-0002')}`),
    oracle1Stopped(x),
    chk('report-header', has('decidinator: imported 2 answers from docs/stakeholders.md as stakeholder decisions.'),
      'the report header was not seen'),
    chk('report-confirmed', has('- Q-0002 → D-0004 (supersedes D-0002): same as the provisional answer.'),
      'the confirmed line was not seen'),
    chk('report-changed',
      x.strings.some((item) => typeof item === 'string' && item.includes(changed) && item.includes('Depends on: e2e-seed.')),
      'the changed line was not seen')
  ]
}

const BUILDERS = {
  1: (x) => [...filesResolved(x), ...recordsResolved(x)],
  2: scenarioHumanOnly,
  3: scenarioSidecar,
  4: scenarioSidecar,
  5: (x) => [...filesResolved(x), ...recordsResolved(x), ...scenarioPlanMode(x)],
  6: scenarioEscalation,
  7: scenarioRoundTrip,
  8: scenarioSidecar,
  install: filesResolved
}

function checkScenario(n, inputs = {}) {
  const key = String(n)
  if (!Object.hasOwn(SCENARIOS, key)) throw new Error('unknown scenario ' + n)
  const checks = BUILDERS[key](buildContext(key, inputs ?? {}))
  return { name: SCENARIOS[key].name, pass: checks.every((c) => c.pass), checks }
}

// What the run showed, kept beside the checks in result.json.
function evidence(n, inputs = {}) {
  const records = Array.isArray(inputs.records) ? inputs.records : []
  const isOracle = (r) => String(inputOf(r).agent_type ?? '').startsWith('decidinator:')
  const modes = records.map((r) => inputOf(r).permission_mode).filter((m) => typeof m === 'string')
  const oracleTools = {}
  for (const r of records) {
    if (r.event === 'PostToolUse' && isOracle(r)) {
      const tool = inputOf(r).tool_name
      oracleTools[tool] = (oracleTools[tool] ?? 0) + 1
    }
  }
  return {
    oracleStops: records.filter((r) => r.event === 'SubagentStop' && isOracle(r))
      .map((r) => ({ at: r.at, agentType: inputOf(r).agent_type, effort: inputOf(r).effort ?? null })),
    dispatches: mainCalls(records, 'PreToolUse', 'Agent').map((r) => ({
      at: r.at,
      subagentType: toolInput(r).subagent_type,
      description: toolInput(r).description,
      prompt: toolInput(r).prompt
    })),
    askCalls: records
      .filter((r) => (r.event === 'PreToolUse' || r.event === 'PostToolUse') &&
        inputOf(r).tool_name === 'AskUserQuestion' && !inputOf(r).agent_id)
      .map((r) => ({ at: r.at, event: r.event, questions: toolInput(r).questions ?? null })),
    permissionModes: [...new Set(modes)].sort(),
    oracleTools,
    finalMessage: inputs.finalMessage ?? ''
  }
}

module.exports = { checkScenario, evidence }
