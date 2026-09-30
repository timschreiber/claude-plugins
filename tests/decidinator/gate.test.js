'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const state = require(path.join(lib, 'state.js'))
const Q = require(path.join(lib, 'questions.js'))
const reasons = require(path.join(lib, 'reasons.js'))
const { DEFAULTS } = require(path.join(lib, 'config.js'))
const recorded = require('./fixtures/recorded.js')
const { setup, denyReason } = require('./fixtures/harness.js')

const cfg = { ...DEFAULTS, rungs: [...DEFAULTS.rungs] }
const isAsk = r => r.event === 'PreToolUse' && r.input.tool_name === 'AskUserQuestion'

let h
let savedData
let base
let sid

beforeEach(() => {
  h = setup('gate')
  savedData = process.env.CLAUDE_PLUGIN_DATA
  process.env.CLAUDE_PLUGIN_DATA = h.dataDir
  base = recorded.input('decidinator-probe-interactive-deny-normal-hooks.jsonl', isAsk)
  sid = base.session_id
  state.arm(sid, 'ask', 'command')
})

afterEach(() => {
  if (savedData === undefined) delete process.env.CLAUDE_PLUGIN_DATA
  else process.env.CLAUDE_PLUGIN_DATA = savedData
  h.cleanup()
})

const SIZE = 'Which size should the probe use?'
const SHAPE = 'Which shape should the probe use?'

function ask(input, ...extra) {
  const copy = JSON.parse(JSON.stringify(input))
  copy.tool_input.questions.push(...extra.map(question => ({ question, header: '', options: [], multiSelect: false })))
  return copy
}

// Runs the gate; asserts the invariants of every run and returns the deny reason or null.
function gate(input) {
  const res = h.run('gate.js', input)
  assert.equal(res.status, 0, res.stderr)
  assert.doesNotMatch(res.stdout, /"permissionDecision":"allow"/)
  return denyReason(res.stdout)
}

function setStatus(id, status) {
  assert.equal(state.update(sid, s => ({ ...s, questions: { ...s.questions, [id]: { ...s.questions[id], status } } })), true)
}

const dispatchOf = () => Q.dueDispatch(state.read(sid), cfg)

test('a single question is held with the oracle dispatch', () => {
  const reason = gate(base)
  const s = state.read(sid)
  assert.deepEqual(s.order, ['Q-0001'])
  const q = s.questions['Q-0001']
  const recordedQ = base.tool_input.questions[0]
  assert.equal(q.status, 'pending')
  assert.equal(q.rung, 1)
  assert.equal(q.question, recordedQ.question)
  assert.deepEqual(q.options.map(o => o.label), recordedQ.options.map(o => o.label))
  assert.equal(reason, reasons.held(dispatchOf(), ['Q-0001']))
})

test('three questions are researched one at a time, in order', () => {
  const three = ask(base, SIZE, SHAPE)
  const r1 = gate(three)
  assert.equal(r1, reasons.held(dispatchOf(), ['Q-0001', 'Q-0002', 'Q-0003']))
  assert.deepEqual(state.read(sid).order, ['Q-0001', 'Q-0002', 'Q-0003'])
  assert.match(dispatchOf().prompt, /Q-0001/)

  setStatus('Q-0001', 'resolved')
  const lastTwo = { ...JSON.parse(JSON.stringify(base)), tool_input: { questions: three.tool_input.questions.slice(1) } }
  const r2 = gate(lastTwo)
  assert.match(r2, /Decidinator question Q-0002/)
  assert.deepEqual(state.read(sid).order.length, 3)

  setStatus('Q-0002', 'final-unresolved')
  assert.match(gate(lastTwo), /Decidinator question Q-0003/)

  setStatus('Q-0003', 'final-unresolved')
  assert.equal(gate(lastTwo), null)
  assert.equal(
    gate(three),
    reasons.narrow(['Q-0001'], [{ id: 'Q-0002', question: SIZE }, { id: 'Q-0003', question: SHAPE }])
  )
})

test('a subagent call is ignored and creates no state', () => {
  const sub = recorded.input('decidinator-probe-interactive-normal-hooks.jsonl', r => r.event === 'PreToolUse' && r.input.agent_id)
  base.agent_id = sub.agent_id
  base.agent_type = sub.agent_type
  assert.equal(gate(base), null)
  assert.equal(state.read(sid), null)
})

test('a re-asked final-unresolved question passes in ask mode and is sidecar-denied in sidecar mode', () => {
  gate(base)
  setStatus('Q-0001', 'final-unresolved')
  const variant = JSON.parse(JSON.stringify(base))
  variant.tool_input.questions[0].question = variant.tool_input.questions[0].question.toUpperCase().replace(/\?$/, '')
  assert.equal(gate(variant), null)
  assert.deepEqual(state.read(sid).order, ['Q-0001'])

  state.arm(sid, 'sidecar', 'command')
  assert.equal(gate(variant), reasons.sidecar(['Q-0001'], cfg.sidecar))
})

test('a re-asked resolved question is denied as settled', () => {
  gate(base)
  setStatus('Q-0001', 'resolved')
  assert.equal(gate(base), reasons.settled(['Q-0001']))
  assert.deepEqual(state.read(sid).order, ['Q-0001'])
})

test('a re-asked pending question is held and mints no new ID', () => {
  gate(base)
  const reason = gate(base)
  assert.equal(reason, reasons.held(dispatchOf(), ['Q-0001']))
  assert.deepEqual(state.read(sid).order, ['Q-0001'])
})

test('a re-asked question whose oracle is running gets the wait reason', () => {
  gate(base)
  assert.equal(state.update(sid, s => Q.recordDispatch(s, 'Q-0001', 1, 'toolu_x', new Date().toISOString())), true)
  const reason = gate(base)
  assert.equal(reason, reasons.heldWaiting(dispatchOf(), ['Q-0001']))
})

test('pass-through with the payload prompt_id lets the call through and mints nothing', () => {
  assert.equal(state.update(sid, () => Q.setPassThrough(Q.emptyState(), 'review', base.prompt_id)), true)
  assert.equal(gate(base), null)
  assert.deepEqual(state.read(sid).order, [])

  const later = { ...JSON.parse(JSON.stringify(base)), prompt_id: 'a-later-prompt' }
  assert.match(gate(later), /^decidinator: not shown to the user yet/)
  assert.deepEqual(state.read(sid).order, ['Q-0001'])
})

test('plan mode is gated the same way', () => {
  const plan = recorded.input('decidinator-probe-interactive-deny-plan-hooks.jsonl', isAsk)
  sid = plan.session_id
  state.arm(sid, 'ask', 'command')
  const reason = gate(plan)
  assert.match(reason, /^decidinator: not shown to the user yet\. Question Q-0001 is waiting/)
  assert.equal(reason, reasons.held(dispatchOf(), ['Q-0001']))
})

test('an unusable tool_input is let through', () => {
  base.tool_input = { questions: [] }
  assert.equal(gate(base), null)
  assert.equal(state.read(sid), null)
})
