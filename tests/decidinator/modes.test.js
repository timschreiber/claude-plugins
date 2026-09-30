'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const state = require(path.join(lib, 'state.js'))
const Q = require(path.join(lib, 'questions.js'))
const reasons = require(path.join(lib, 'reasons.js'))
const decisionLog = require(path.join(lib, 'decision-log.js'))
const sidecar = require(path.join(lib, 'sidecar.js'))
const recorded = require('./fixtures/recorded.js')
const { setup, denyReason } = require('./fixtures/harness.js')

const NOW = '2026-01-01T00:00:00.000Z'
const CLEAR = 'decidinator-probe-oracle-clear-hooks.jsonl'
const HUMAN_ONLY = 'decidinator-probe-oracle-human-only-hooks.jsonl'
let h
let savedData

beforeEach(() => {
  h = setup('modes')
  savedData = process.env.CLAUDE_PLUGIN_DATA
  process.env.CLAUDE_PLUGIN_DATA = h.dataDir
})

afterEach(() => {
  if (savedData === undefined) delete process.env.CLAUDE_PLUGIN_DATA
  else process.env.CLAUDE_PLUGIN_DATA = savedData
  h.cleanup()
})

const logFile = () => path.join(h.projectDir, 'docs', 'decisions.md')
const sideFile = () => path.join(h.projectDir, 'docs', 'open-questions.md')

function stopOf(file) {
  const input = recorded.input(file, r => r.event === 'SubagentStop' && r.input.agent_type !== '')
  input.agent_transcript_path = path.join(h.tmp, 'none.jsonl')
  return input
}

function pendingState(id, { dispatched = true, rung = 1 } = {}) {
  let s = Q.addQuestions(
    Q.emptyState(),
    Q.fromCall({ questions: [{ question: `Question ${id}?`, options: [] }] }),
    [id],
    NOW
  )
  s = { ...s, questions: { ...s.questions, [id]: { ...s.questions[id], rung } } }
  if (dispatched) s = Q.recordDispatch(s, id, rung, 'toolu_x', NOW)
  return s
}

function pending(sid, id, mode) {
  state.arm(sid, mode, 'command')
  state.write(sid, pendingState(id))
}

function record(input) {
  const res = h.run('recorder.js', input)
  assert.equal(res.status, 0, res.stderr)
  assert.equal(res.stdout, '')
  return state.read(input.session_id)
}

function ask(sid, id) {
  const input = recorded.input(
    'decidinator-probe-interactive-deny-normal-hooks.jsonl',
    r => r.event === 'PreToolUse' && r.input.tool_name === 'AskUserQuestion'
  )
  input.session_id = sid
  input.tool_input = {
    questions: [
      {
        question: `Question ${id}?`,
        header: '',
        options: [
          { label: 'Five', description: '' },
          { label: 'Ten', description: '' }
        ],
        multiSelect: false
      }
    ]
  }
  return input
}

function answered(sid, id, label, notes) {
  const input = ask(sid, id)
  input.hook_event_name = 'PostToolUse'
  input.tool_response = {
    questions: input.tool_input.questions,
    answers: { [`Question ${id}?`]: label }
  }
  if (notes !== undefined) input.tool_response.annotations = { [`Question ${id}?`]: { notes } }
  return input
}

test('resolved: an oracle-unconfirmed decision', () => {
  const stop = stopOf(CLEAR)
  const sid = stop.session_id
  pending(sid, 'Q-0002', 'ask')
  const s = record(stop)
  const log = decisionLog.read(logFile())
  assert.equal(log.ok, true)
  assert.equal(log.model.entries.length, 1)
  const d = log.model.entries[0].decision
  assert.equal(d.provenance, 'oracle-unconfirmed')
  assert.equal(d.questionId, 'Q-0002')
  assert.equal(d.rung, 1)
  assert.equal(d.confidence, 'high')
  assert.equal(d.answer, state.read(sid).questions['Q-0002'].verdicts[0].verdict.answer)
  assert.equal(s.questions['Q-0002'].decision, 'D-0001')
  assert.equal(fs.existsSync(sideFile()), false)
})

test('ask mode: the gate lets the question through and the user answer is recorded', () => {
  const stop = stopOf(HUMAN_ONLY)
  const sid = stop.session_id
  pending(sid, 'Q-0003', 'ask')
  record(stop)
  assert.equal(fs.existsSync(logFile()), false)

  const gate = h.run('gate.js', ask(sid, 'Q-0003'))
  assert.equal(gate.status, 0, gate.stderr)
  assert.equal(gate.stdout, '')

  const ua = h.run('user-answer.js', answered(sid, 'Q-0003', 'Five', 'Keep it configurable'))
  assert.equal(ua.status, 0, ua.stderr)
  assert.equal(ua.stdout, '')

  const log = decisionLog.read(logFile())
  assert.equal(log.ok, true)
  const d = log.model.entries.find(e => e.id === 'D-0001').decision
  assert.equal(d.provenance, 'user')
  assert.equal(d.answer, 'Five\nNotes: Keep it configurable')
  assert.equal(d.confidence, null)
  assert.equal(d.rung, null)
  assert.equal(d.questionId, 'Q-0003')
  assert.equal(state.read(sid).questions['Q-0003'].status, 'answered')

  const again = h.run('gate.js', ask(sid, 'Q-0003'))
  assert.equal(denyReason(again.stdout), reasons.settled(['Q-0003']))
})

test('sidecar mode: provisional decision and a new sidecar entry, and the gate never lets it through', () => {
  const stop = stopOf(HUMAN_ONLY)
  const sid = stop.session_id
  pending(sid, 'Q-0003', 'sidecar')
  const s = record(stop)
  const verdictAnswer = s.questions['Q-0003'].verdicts[0].verdict.answer

  const log = decisionLog.read(logFile())
  assert.equal(log.ok, true)
  assert.equal(log.model.entries.length, 1)
  const d = log.model.entries[0].decision
  assert.equal(d.id, 'D-0001')
  assert.equal(d.provenance, 'oracle-provisional')
  assert.equal(d.sidecar, 'Q-0003')

  const side = sidecar.read(sideFile())
  assert.equal(side.ok, true)
  assert.equal(side.model.entries.length, 1)
  const e = side.model.entries.find(x => x.id === 'Q-0003').question
  assert.equal(e.status, 'open')
  assert.equal(e.provisionalDecision, 'D-0001')
  assert.equal(e.provisionalAnswer, verdictAnswer)
  assert.equal(e.options.length, 2)
  assert.deepEqual(e.dependsOn, [`session ${sid}`])

  const want = reasons.sidecar(['Q-0003'], 'docs/open-questions.md')
  assert.equal(denyReason(h.run('gate.js', ask(sid, 'Q-0003')).stdout), want)
  assert.equal(denyReason(h.run('gate.js', ask(sid, 'Q-0003')).stdout), want)

  const ua = h.run('user-answer.js', answered(sid, 'Q-0003', 'Five', 'Keep it configurable'))
  assert.equal(ua.status, 0, ua.stderr)
  assert.equal(ua.stdout, '')
  assert.equal(decisionLog.read(logFile()).model.entries.length, 1)
})

test('sidecar mode: a duplicate extends the existing entry', () => {
  const stop = stopOf(HUMAN_ONLY)
  const sid = stop.session_id
  pending(sid, 'Q-0003', 'sidecar')
  const a = decisionLog.append(logFile(), {
    title: 'Limit',
    question: 'question q-0003',
    answer: 'P',
    provenance: 'oracle-provisional',
    confidence: 'medium',
    rung: 1,
    questionId: 'Q-0001',
    context: 'wp-1',
    sidecar: 'Q-0001'
  })
  assert.equal(a.ok, true, a.error)
  const b = sidecar.append(sideFile(), {
    id: 'Q-0001',
    topic: 'Limit',
    question: 'question q-0003',
    context: 'c',
    options: [],
    provisionalAnswer: 'P',
    provisionalDecision: 'D-0001',
    dependsOn: ['wp-1'],
    status: 'open'
  })
  assert.equal(b.ok, true, b.error)

  const s = record(stop)

  const side = sidecar.read(sideFile())
  assert.equal(side.ok, true)
  assert.equal(side.model.entries.length, 1)
  assert.deepEqual(side.model.entries[0].question.dependsOn, ['wp-1', `session ${sid}`])

  const log = decisionLog.read(logFile())
  const d = log.model.entries.find(e => e.id === 'D-0002').decision
  assert.equal(d.answer, 'P')
  assert.equal(d.questionId, 'Q-0003')
  assert.equal(d.sidecar, 'Q-0001')
  assert.equal(s.questions['Q-0003'].duplicateOf, 'Q-0001')
})

test('DECIDINATOR_CONTEXT labels the entry', () => {
  h.env.DECIDINATOR_CONTEXT = 'WP-07'
  const stop = stopOf(HUMAN_ONLY)
  const sid = stop.session_id
  pending(sid, 'Q-0003', 'sidecar')
  record(stop)
  const side = sidecar.read(sideFile())
  assert.deepEqual(side.model.entries[0].question.dependsOn, ['WP-07'])
  const log = decisionLog.read(logFile())
  assert.equal(log.model.entries[0].decision.context, 'WP-07')
})
