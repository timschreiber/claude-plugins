'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const state = require(path.join(lib, 'state.js'))
const Q = require(path.join(lib, 'questions.js'))
const reasons = require(path.join(lib, 'reasons.js'))
const { DEFAULTS } = require(path.join(lib, 'config.js'))
const recorded = require('./fixtures/recorded.js')
const { setup } = require('./fixtures/harness.js')

let h
let savedData
let stop
let sid

beforeEach(() => {
  h = setup('stop-guard')
  savedData = process.env.CLAUDE_PLUGIN_DATA
  process.env.CLAUDE_PLUGIN_DATA = h.dataDir
  stop = recorded.input('decidinator-probe-interactive-normal-hooks.jsonl', r => r.event === 'Stop')
  sid = stop.session_id
  state.arm(sid, 'ask', 'command')
})

afterEach(() => {
  if (savedData === undefined) delete process.env.CLAUDE_PLUGIN_DATA
  else process.env.CLAUDE_PLUGIN_DATA = savedData
  h.cleanup()
})

// Makes Q-0001 due by running the gate on the recorded AskUserQuestion call.
function dueQuestion() {
  const ask = recorded.input('decidinator-probe-interactive-deny-normal-hooks.jsonl',
    r => r.event === 'PreToolUse' && r.input.tool_name === 'AskUserQuestion')
  ask.session_id = sid
  const res = h.run('gate.js', ask)
  assert.match(res.stdout, /Q-0001/)
}

const cfg = () => ({ ...DEFAULTS, rungs: [...DEFAULTS.rungs] })

function stopGuard(input = stop) {
  const res = h.run('stop-guard.js', input)
  assert.equal(res.status, 0, res.stderr)
  return res.stdout
}

function markDispatched() {
  assert.equal(state.update(sid, s =>
    Q.recordDispatch(s, 'Q-0001', s.questions['Q-0001'].rung, 'toolu_x', new Date().toISOString())), true)
}

function projectConfig(obj) {
  fs.mkdirSync(path.join(h.projectDir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(h.projectDir, '.claude', 'decidinator.json'), JSON.stringify(obj))
}

const guardState = () => state.read(sid).guard
const steppedAside = (max = 3) => JSON.stringify({ systemMessage: reasons.guardSteppedAside('Q-0001', 1, max) })
const blocks = out => JSON.parse(out).decision === 'block'

test('nothing due means nothing happens', () => {
  assert.equal(stopGuard(), '')
  dueQuestion()
  assert.equal(state.update(sid, s => ({ ...s, questions: { 'Q-0001': { ...s.questions['Q-0001'], status: 'resolved' } } })), true)
  assert.equal(stopGuard(), '')
})

test('the stop is blocked while the dispatch is due and not made', () => {
  dueQuestion()
  assert.deepEqual(JSON.parse(stopGuard()), { decision: 'block', reason: reasons.stopDue(Q.dueDispatch(state.read(sid), cfg())) })
  assert.deepEqual(guardState(), { key: 'Q-0001@1:due', blocks: 1, steppedAside: false })
})

test('the stop is allowed while the dispatch is in flight', () => {
  dueQuestion()
  markDispatched()
  assert.equal(stopGuard(), '')
  assert.equal(guardState() ?? null, null)
})

test('stop_hook_active does not let the stop through', () => {
  dueQuestion()
  assert.equal(JSON.parse(stopGuard({ ...stop, stop_hook_active: true })).decision, 'block')
})

test('an escalation blocks the stop with the next rung', () => {
  dueQuestion()
  markDispatched()
  assert.equal(state.update(sid, s => {
    const q = s.questions['Q-0001']
    const verdict = { rung: 1, ok: true, verdict: { kind: 'researchable', status: 'resolved', confidence: 'medium', flags: ['spec-silent'] } }
    return { ...s, questions: { 'Q-0001': { ...q, rung: 2, verdicts: [...(q.verdicts || []), verdict] } } }
  }), true)
  const out = JSON.parse(stopGuard())
  assert.equal(out.decision, 'block')
  assert.ok(out.reason.includes('decidinator:oracle-2'))
  assert.ok(out.reason.includes('Q-0001'))
  assert.equal(guardState().key, 'Q-0001@2:due')
})

test('it steps aside after the limit', () => {
  dueQuestion()
  for (let i = 0; i < 3; i++) assert.equal(blocks(stopGuard()), true)
  assert.equal(stopGuard(), steppedAside())
  assert.equal(stopGuard(), '')
  assert.equal(guardState().steppedAside, true)
})

test('guardMaxBlocks comes from the config', () => {
  projectConfig({ guardMaxBlocks: 1 })
  dueQuestion()
  assert.equal(blocks(stopGuard()), true)
  assert.equal(stopGuard(), steppedAside(1))
})

test('it shares its count with the guard', () => {
  dueQuestion()
  const readCall = recorded.input('decidinator-probe-interactive-deny-normal-hooks.jsonl',
    r => r.event === 'PreToolUse' && r.input.tool_name === 'Read' && !r.input.agent_id)
  readCall.session_id = sid
  const res = h.run('guard.js', readCall)
  assert.equal(res.status, 0, res.stderr)
  assert.match(res.stdout, /"permissionDecision":"deny"/)
  assert.equal(blocks(stopGuard()), true)
  assert.equal(blocks(stopGuard()), true)
  assert.equal(guardState().blocks, 3)
  assert.equal(stopGuard(), steppedAside())
})

test('a dispatch re-arms it', () => {
  dueQuestion()
  for (let i = 0; i < 3; i++) assert.equal(blocks(stopGuard()), true)
  markDispatched()
  assert.equal(stopGuard(), '')
})

test('a subagent stop is ignored', () => {
  dueQuestion()
  assert.equal(stopGuard({ ...stop, agent_id: 'a1' }), '')
})

test('nothing happens when unarmed', () => {
  dueQuestion()
  state.disarm(sid)
  assert.equal(stopGuard(), '')
})
