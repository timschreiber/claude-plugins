'use strict'

// The end-to-end checks, run on synthetic logs, sidecars and hook records: one passing run per
// scenario and the failing runs that each name the check that must catch them.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const decisionLog = require(path.join(lib, 'decision-log.js'))
const sidecar = require(path.join(lib, 'sidecar.js'))
const exporter = require(path.join(lib, 'export.js'))
const { QUESTIONS, contextLabel } = require('./e2e/scenarios.js')
const { ANSWERS, setupRepo, fillAnswers } = require('./e2e/fixture.js')
const { checkScenario, evidence } = require('./e2e/checks.js')

const O1 = 'decidinator:oracle-1'
const O2 = 'decidinator:oracle-2'

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-e2e-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

const at = (s) => `2026-09-30T10:00:${String(s).padStart(2, '0')}.000Z`
const rec = (s, event, input) => ({ at: at(s), event, input })
const askPre = (s) => rec(s, 'PreToolUse', { tool_name: 'AskUserQuestion', tool_input: { questions: [] } })
const askPost = (s, q) => rec(s, 'PostToolUse', {
  tool_name: 'AskUserQuestion',
  tool_input: {
    questions: [{ question: q.question, options: q.options.map((o) => ({ label: o.label })) }],
    answers: { [q.question]: '5 lists' }
  }
})
const stop = (s, agent) => rec(s, 'SubagentStop', { agent_type: agent })

const decision = (q, over) => ({
  title: 'A decision',
  question: q.question,
  answer: 'An answer.',
  rationale: 'Because.',
  provenance: 'oracle-unconfirmed',
  confidence: 'high',
  rung: 1,
  sources: ['docs/spec.md'],
  assumptions: [],
  flags: [],
  questionId: 'Q-0002',
  context: 'tests',
  date: '2026-09-30',
  ...over
})

function appendDecision(logFile, d) {
  const r = decisionLog.append(logFile, d)
  assert.ok(r.ok, r.error)
}

function appendQuestion(sideFile, q) {
  const r = sidecar.append(sideFile, q)
  assert.ok(r.ok, r.error)
}

const read = (file) => fs.readFileSync(file, 'utf8')

const VERDICT_LOW = { rung: 1, question_id: 'Q-0002', kind: 'researchable', status: 'unresolved', confidence: 'low', flags: ['spec-silent'] }
const VERDICT_HIGH = { rung: 1, question_id: 'Q-0002', kind: 'researchable', status: 'resolved', confidence: 'high', flags: [] }

const dispatch2 = (s, verdict) => rec(s, 'PreToolUse', {
  tool_name: 'Agent',
  tool_input: {
    subagent_type: O2,
    description: 'Decidinator question Q-0002',
    prompt: 'Decidinator question Q-0002\nQuestion: tie order\nEarlier verdicts: ' + JSON.stringify([verdict])
  }
})

const judgment = (s, id) => rec(s, 'PreToolUse', {
  tool_name: 'Agent',
  tool_input: { subagent_type: O1, description: 'Decidinator import judgment ' + id, prompt: 'judge it' }
})

const HEADER = 'decidinator: imported 2 answers from docs/stakeholders.md as stakeholder decisions.'
const CONFIRMED = '- Q-0002 → D-0004 (supersedes D-0002): same as the provisional answer.'
const CHANGED = '- Q-0003 → D-0005 (supersedes D-0003): the oracle judged it changed.'

// Passing inputs for a scenario; edit(inputs, ctx) may change them before they are returned.
function build(t, n, edit) {
  n = String(n)
  const base = tmp(t)
  const repo = path.join(base, 'repo')
  setupRepo(n, repo)
  const logFile = path.join(repo, 'docs', 'decisions.md')
  const sideFile = path.join(repo, 'docs', 'open-questions.md')
  const inputs = { records: [], transcriptStrings: [], finalMessage: '', exportedText: '', answeredText: '' }
  const ctx = { base, repo, logFile, sideFile }
  const provisional = (extra) => {
    appendDecision(logFile, decision(QUESTIONS.humanOnly, {
      answer: 'Five lists, held in one named constant.',
      provenance: 'oracle-provisional',
      confidence: 'medium',
      sidecar: 'Q-0002',
      ...extra
    }))
    appendQuestion(sideFile, {
      id: 'Q-0002',
      topic: 'Free-plan list limit',
      question: QUESTIONS.humanOnly.question,
      context: 'tests',
      options: [{ label: '3 lists', tradeoffs: 'lower' }, { label: '5 lists', tradeoffs: 'higher' }],
      provisionalAnswer: 'Five lists, held in one named constant.',
      provisionalDecision: 'D-0002',
      dependsOn: [contextLabel(n)],
      status: 'open'
    })
  }
  if (n === '1' || n === '5' || n === 'install') {
    appendDecision(logFile, decision(QUESTIONS.researchable, { answer: 'Use node:test.' }))
  }
  if (n === '1') inputs.records = [askPre(1), stop(2, O1)]
  if (n === '5') {
    inputs.records = [
      rec(1, 'PreToolUse', { tool_name: 'AskUserQuestion', tool_input: {}, permission_mode: 'plan' }),
      rec(2, 'PostToolUse', { tool_name: 'WebSearch', agent_type: O1, permission_mode: 'plan' }),
      stop(3, O1)
    ]
  }
  if (n === '2') {
    appendDecision(logFile, decision(QUESTIONS.humanOnly, { answer: '5 lists', provenance: 'user', confidence: null, rung: null }))
    inputs.records = [askPre(1), stop(2, O1), askPost(3, QUESTIONS.humanOnly)]
  }
  if (n === '3') {
    provisional()
    inputs.records = [stop(1, O1)]
    inputs.finalMessage = 'RESULT: 5 lists'
  }
  if (n === '4') {
    provisional()
    inputs.records = [askPre(1), stop(2, O1)]
    inputs.finalMessage = 'RESULT: 5 lists'
  }
  if (n === '6') {
    appendDecision(logFile, decision(QUESTIONS.specSilent, { answer: 'In the order they were added.', rung: 2 }))
    inputs.records = [askPre(1), stop(2, O1), dispatch2(3, VERDICT_LOW), stop(4, O2)]
  }
  if (n === '7') {
    const questions = sidecar.read(sideFile).model.entries.map((e) => e.question)
    fs.writeFileSync(path.join(repo, 'docs', 'stakeholders.md'),
      exporter.render(questions, { source: 'docs/open-questions.md', date: '2026-09-30' }))
    fillAnswers(base)
    appendDecision(logFile, decision(QUESTIONS.humanOnly, {
      answer: ANSWERS['Q-0002'], provenance: 'stakeholder', confidence: null, rung: null, supersedes: 'D-0002'
    }))
    appendDecision(logFile, decision(QUESTIONS.specSilent, {
      answer: ANSWERS['Q-0003'], provenance: 'stakeholder', confidence: null, rung: null, supersedes: 'D-0003', questionId: 'Q-0003'
    }))
    for (const id of ['Q-0002', 'Q-0003']) {
      const r = sidecar.setStatus(sideFile, id, 'imported')
      assert.ok(r.ok, r.error)
    }
    inputs.exportedText = read(path.join(base, 'stakeholders-exported.md'))
    inputs.answeredText = read(path.join(base, 'stakeholders-answered.md'))
    inputs.records = [judgment(1, 'Q-0003'), stop(2, O1)]
    inputs.transcriptStrings = [HEADER, CONFIRMED, CHANGED + '\n  Depends on: e2e-seed.']
  }
  if (edit) edit(inputs, ctx)
  inputs.logText = read(logFile)
  inputs.sidecarText = read(sideFile)
  return inputs
}

const FILES_RESOLVED = [
  'log-marker', 'one-new-decision', 'decision-oracle-unconfirmed', 'decision-rung-1', 'decision-question',
  'decision-answer-node-test', 'sidecar-empty'
]
const RECORDS_RESOLVED = ['oracle-1-stopped', 'no-oracle-2', 'ask-intercepted', 'ask-never-shown']
const SIDECAR_CHECKS = [
  'log-marker', 'sidecar-marker', 'one-new-decision', 'decision-provisional', 'decision-question', 'one-sidecar-entry',
  'entry-fields', 'entry-depends-on', 'oracle-1-stopped', 'ask-never-shown', 'session-continued'
]

const NAMES = {
  1: [...FILES_RESOLVED, ...RECORDS_RESOLVED],
  2: [
    'log-marker', 'one-new-decision', 'decision-user', 'decision-question', 'decision-answer-matches-pick', 'decision-no-rung',
    'sidecar-empty', 'oracle-1-stopped', 'no-oracle-2', 'ask-shown-after-research'
  ],
  3: SIDECAR_CHECKS,
  4: [...SIDECAR_CHECKS, 'ask-intercepted'],
  5: [...FILES_RESOLVED, ...RECORDS_RESOLVED, 'plan-mode-throughout', 'oracle-web-research'],
  6: [
    'log-marker', 'one-new-decision', 'decision-question', 'decision-rung-2-or-user', 'oracle-1-stopped', 'oracle-2-stopped',
    'no-oracle-3', 'rung-2-dispatch', 'rung-2-has-rung-1-verdict', 'rung-1-escalated'
  ],
  7: [
    'export-marker', 'export-entries', 'export-groups', 'answers-filled', 'stakeholder-decisions', 'provisionals-superseded',
    'entries-imported', 'judgment-dispatched', 'oracle-1-stopped', 'report-header', 'report-confirmed', 'report-changed'
  ],
  install: FILES_RESOLVED
}

function failing(result) {
  return result.checks.filter((c) => !c.pass).map((c) => c.name)
}

for (const n of ['1', '2', '3', '4', '5', '6', '7', 'install']) {
  test(`scenario ${n} passes with its checks in order`, (t) => {
    const result = checkScenario(n, build(t, n))
    assert.deepEqual(failing(result), [])
    assert.equal(result.pass, true)
    assert.deepEqual(result.checks.map((c) => c.name), NAMES[n])
    for (const c of result.checks) assert.equal(c.detail, '')
  })
}

function assertFails(result, name) {
  assert.equal(result.pass, false)
  const c = result.checks.find((x) => x.name === name)
  assert.ok(c, 'no check named ' + name)
  assert.equal(c.pass, false, name + ' should fail')
  assert.notEqual(c.detail, '')
}

test('scenario 1 fails when oracle-2 also ran', (t) => {
  const inputs = build(t, '1', (i) => i.records.push(stop(3, O2)))
  assertFails(checkScenario('1', inputs), 'no-oracle-2')
})

test('scenario 1 fails on an empty log', (t) => {
  const inputs = build(t, '1')
  inputs.logText = ''
  const result = checkScenario('1', inputs)
  assertFails(result, 'log-marker')
  assertFails(result, 'one-new-decision')
})

test('scenario 2 fails when the question was shown before the oracle stopped', (t) => {
  const inputs = build(t, '2', (i) => { i.records = [askPre(1), askPost(2, QUESTIONS.humanOnly), stop(3, O1)] })
  assertFails(checkScenario('2', inputs), 'ask-shown-after-research')
})

test('scenario 2 passes whichever option was picked, and fails when the log differs from the pick', (t) => {
  const three = build(t, '2')
  three.records[2].input.tool_input.answers[QUESTIONS.humanOnly.question] = '3 lists'
  three.logText = three.logText.replace('**Answer:** 5 lists', '**Answer:** 3 lists')
  assert.deepEqual(failing(checkScenario('2', three)), [])
  const mismatch = build(t, '2')
  mismatch.records[2].input.tool_input.answers[QUESTIONS.humanOnly.question] = '3 lists'
  assertFails(checkScenario('2', mismatch), 'decision-answer-matches-pick')
})

test('scenario 3 fails on the wrong depends-on label', (t) => {
  const inputs = build(t, '3')
  inputs.sidecarText = inputs.sidecarText.replace('e2e-3', 'e2e-9')
  assertFails(checkScenario('3', inputs), 'entry-depends-on')
})

test('scenario 4 fails when the question was shown', (t) => {
  const inputs = build(t, '4', (i) => i.records.push(askPost(3, QUESTIONS.humanOnly)))
  assertFails(checkScenario('4', inputs), 'ask-never-shown')
})

test('scenario 5 fails when a record is not in plan mode', (t) => {
  const inputs = build(t, '5', (i) => i.records.push(rec(4, 'PostToolUse', { tool_name: 'Read', permission_mode: 'default' })))
  assertFails(checkScenario('5', inputs), 'plan-mode-throughout')
})

test('scenario 6 fails when the rung 1 verdict was no reason to escalate', (t) => {
  const inputs = build(t, '6', (i) => { i.records = [askPre(1), stop(2, O1), dispatch2(3, VERDICT_HIGH), stop(4, O2)] })
  assertFails(checkScenario('6', inputs), 'rung-1-escalated')
})

test('scenario 6 fails without a rung 2 dispatch', (t) => {
  const inputs = build(t, '6', (i) => { i.records = [askPre(1), stop(2, O1), stop(4, O2)] })
  const result = checkScenario('6', inputs)
  assertFails(result, 'rung-2-dispatch')
  assert.equal(result.checks.find((c) => c.name === 'rung-1-escalated').detail, 'no rung 2 dispatch')
})

test('scenario 7 fails when the changed line is missing', (t) => {
  const inputs = build(t, '7', (i) => { i.transcriptStrings = [HEADER, CONFIRMED] })
  assertFails(checkScenario('7', inputs), 'report-changed')
})

test('scenario install passes with no hook records', (t) => {
  const result = checkScenario('install', build(t, 'install'))
  assert.equal(result.pass, true)
})

test('an unknown scenario throws', () => {
  assert.throws(() => checkScenario('9', {}), /unknown scenario 9/)
})

test('evidence lists the oracle-2 dispatch', (t) => {
  const inputs = build(t, '6')
  const ev = evidence('6', inputs)
  assert.equal(ev.dispatches.length, 1)
  assert.equal(ev.dispatches[0].subagentType, O2)
  assert.deepEqual(ev.oracleStops.map((s) => s.agentType), [O1, O2])
  assert.equal(ev.oracleStops[0].effort, null)
  assert.equal(ev.askCalls.length, 1)
  assert.deepEqual(ev.permissionModes, [])
})
