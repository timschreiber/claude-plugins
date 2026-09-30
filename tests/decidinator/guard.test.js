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
const { setup, denyReason } = require('./fixtures/harness.js')

const NORMAL = 'decidinator-probe-normal-default-hooks.jsonl'
let h
let savedData
let readCall
let sid

beforeEach(() => {
  h = setup('guard')
  savedData = process.env.CLAUDE_PLUGIN_DATA
  process.env.CLAUDE_PLUGIN_DATA = h.dataDir
  readCall = recorded.input('decidinator-probe-interactive-deny-normal-hooks.jsonl',
    r => r.event === 'PreToolUse' && r.input.tool_name === 'Read' && !r.input.agent_id)
  sid = readCall.session_id
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
const dueDispatch = (c = cfg()) => Q.dueDispatch(state.read(sid), c)

function guard(input = readCall) {
  const res = h.run('guard.js', input)
  assert.equal(res.status, 0, res.stderr)
  assert.doesNotMatch(res.stdout, /"permissionDecision":"allow"/)
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

test('nothing due means nothing happens', () => {
  assert.equal(guard(), '')
  dueQuestion()
  assert.equal(state.update(sid, s => ({ ...s, questions: { 'Q-0001': { ...s.questions['Q-0001'], status: 'resolved' } } })), true)
  assert.equal(guard(), '')
})

test('a call is denied while the dispatch is due and not made', () => {
  dueQuestion()
  const out = guard()
  assert.equal(denyReason(out), reasons.guardDue(Q.dueDispatch(state.read(sid), cfg())))
  assert.deepEqual(guardState(), { key: 'Q-0001@1:due', blocks: 1, steppedAside: false })
})

test('a call is denied with the wait text while the dispatch is in flight', () => {
  dueQuestion()
  markDispatched()
  const out = guard()
  assert.equal(denyReason(out), reasons.guardWaiting(Q.dueDispatch(state.read(sid), cfg())))
  assert.equal(guardState().key, 'Q-0001@1:running')
})

function exhaust() {
  for (let i = 0; i < 3; i++) assert.notEqual(denyReason(guard()), null)
}

test('the guard steps aside after the limit', () => {
  dueQuestion()
  exhaust()
  const out = guard()
  assert.equal(out, JSON.stringify({ systemMessage: reasons.guardSteppedAside('Q-0001', 1, 3) }))
  assert.equal(JSON.parse(out).hookSpecificOutput, undefined)
  assert.equal(guard(), '')
  assert.equal(guardState().steppedAside, true)
})

test('a dispatch re-arms the guard', () => {
  dueQuestion()
  exhaust()
  assert.notEqual(guard(), '')
  markDispatched()
  const out = guard()
  assert.equal(denyReason(out), reasons.guardWaiting(Q.dueDispatch(state.read(sid), cfg())))
  assert.equal(guardState().blocks, 1)
})

test('guardMaxBlocks comes from the config', () => {
  projectConfig({ guardMaxBlocks: 1 })
  dueQuestion()
  assert.notEqual(denyReason(guard()), null)
  assert.equal(guard(), JSON.stringify({ systemMessage: reasons.guardSteppedAside('Q-0001', 1, 1) }))
})

test('escalation moves the due rung', () => {
  dueQuestion()
  assert.equal(state.update(sid, s => ({ ...s, questions: { 'Q-0001': { ...s.questions['Q-0001'], rung: 2 } } })), true)
  const d = Q.dueDispatch(state.read(sid), cfg())
  assert.equal(d.agent, 'decidinator:oracle-2')
  assert.equal(denyReason(guard()), reasons.guardDue(d))
})

test('the tools of the gate and the dispatch check pass', () => {
  dueQuestion()
  for (const tool of ['Agent', 'AskUserQuestion']) {
    assert.equal(guard({ ...readCall, tool_name: tool }), '')
  }
  assert.equal(guardState() ?? null, null)
})

test('a subagent call is never denied', () => {
  dueQuestion()
  assert.equal(guard({ ...readCall, agent_id: 'a1', agent_type: 'decidinator:oracle-1' }), '')
})

const handbackCall = () => {
  const input = recorded.input(NORMAL, r => r.event === 'PreToolUse' && r.input.tool_name === 'SubagentHandback')
  input.session_id = sid
  return input
}

test('a handback is captured only for a rung agent', () => {
  const input = handbackCall()
  assert.equal(guard(input), '')
  assert.equal(state.read(sid)?.handbacks?.[input.agent_id], undefined)
  projectConfig({ rungs: ['decidinator-probe:researcher', 'decidinator:oracle-2'] })
  dueQuestion()
  assert.equal(guard(input), '')
  assert.equal(state.read(sid).handbacks[input.agent_id], input.tool_input.message)
})

test('a handback report resolves the question without last_assistant_message', () => {
  projectConfig({ rungs: ['decidinator-probe:researcher', 'decidinator:oracle-2'] })
  dueQuestion()
  markDispatched()
  const input = handbackCall()
  const clear = recorded.input('decidinator-probe-oracle-clear-hooks.jsonl', r => r.event === 'SubagentStop')
  input.tool_input.message = clear.last_assistant_message.replaceAll('Q-0002', 'Q-0001')
  assert.equal(guard(input), '')
  const stop = recorded.input(NORMAL, r => r.event === 'SubagentStop')
  stop.session_id = sid
  stop.agent_transcript_path = path.join(h.tmp, 'none.jsonl')
  delete stop.last_assistant_message
  const res = h.run('recorder.js', stop)
  assert.equal(res.status, 0, res.stderr)
  const q = state.read(sid).questions['Q-0001']
  assert.equal(q.status, 'resolved')
  assert.equal(q.verdicts[0].source, 'SubagentHandback')
  assert.equal(guard(), '')
})
