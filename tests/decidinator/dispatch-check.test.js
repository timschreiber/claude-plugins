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

const NORMAL = 'decidinator-probe-interactive-normal-hooks.jsonl'
let h
let savedData
let agentCall
let sid

beforeEach(() => {
  h = setup('dispatch')
  savedData = process.env.CLAUDE_PLUGIN_DATA
  process.env.CLAUDE_PLUGIN_DATA = h.dataDir
  agentCall = recorded.input(NORMAL, r => r.event === 'PreToolUse' && r.input.tool_name === 'Agent' && !r.input.agent_id)
  sid = agentCall.session_id
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

function check(subagentType, prompt, extra = {}) {
  const input = { ...JSON.parse(JSON.stringify(agentCall)), ...extra }
  input.tool_input = { ...input.tool_input, subagent_type: subagentType, prompt }
  const res = h.run('dispatch-check.js', input)
  assert.equal(res.status, 0, res.stderr)
  assert.doesNotMatch(res.stdout, /"permissionDecision":"allow"/)
  return denyReason(res.stdout)
}

const dispatches = () => state.read(sid).questions['Q-0001'].dispatches

test('the expected call passes and is recorded, again and again', () => {
  dueQuestion()
  const d = dueDispatch()
  assert.equal(check(d.agent, d.prompt), null)
  assert.equal(dispatches().length, 1)
  assert.equal(dispatches()[0].rung, 1)
  assert.equal(check(d.agent, d.prompt), null)
  assert.equal(dispatches().length, 2)
})

test('the wrong rung is refused', () => {
  dueQuestion()
  const d = dueDispatch()
  assert.equal(check('decidinator:oracle-2', d.prompt), reasons.refused(reasons.wrongAgent('decidinator:oracle-2', d), d))
  assert.equal(dispatches().length, 0)
})

test('an unrelated recorded Agent call is refused', () => {
  dueQuestion()
  const d = dueDispatch()
  const original = agentCall.tool_input
  assert.notEqual(original.subagent_type, d.agent)
  const res = h.run('dispatch-check.js', agentCall)
  assert.equal(denyReason(res.stdout), reasons.refused(reasons.wrongAgent(original.subagent_type, d), d))
})

test('the right agent without the question ID is refused', () => {
  dueQuestion()
  const d = dueDispatch()
  assert.equal(check(d.agent, 'research something'), reasons.refused(reasons.missingId(d), d))
})

test('the due rung follows the question rung', () => {
  dueQuestion()
  assert.equal(state.update(sid, s => ({ ...s, questions: { 'Q-0001': { ...s.questions['Q-0001'], rung: 2 } }, order: s.order })), true)
  const d = dueDispatch()
  assert.equal(d.agent, 'decidinator:oracle-2')
  assert.equal(check(d.agent, d.prompt), null)
  assert.equal(check('decidinator:oracle-1', d.prompt), reasons.refused(reasons.wrongAgent('decidinator:oracle-1', d), d))
})

test('a project config changes the due agent', () => {
  fs.mkdirSync(path.join(h.projectDir, '.claude'))
  fs.writeFileSync(path.join(h.projectDir, '.claude', 'decidinator.json'), JSON.stringify({ rungs: ['my-oracle'] }))
  dueQuestion()
  const c = { ...cfg(), rungs: ['my-oracle'] }
  const d = dueDispatch(c)
  assert.equal(d.agent, 'my-oracle')
  assert.equal(check('my-oracle', d.prompt), null)
  assert.equal(check('decidinator:oracle-1', d.prompt), reasons.refused(reasons.wrongAgent('decidinator:oracle-1', d), d))
})

test('nothing due means nothing happens', () => {
  dueQuestion()
  assert.equal(state.update(sid, s => ({ ...s, questions: { 'Q-0001': { ...s.questions['Q-0001'], status: 'resolved' } } })), true)
  const res = h.run('dispatch-check.js', agentCall)
  assert.equal(res.stdout, '')
  assert.equal(dispatches().length, 0)
})

test('a subagent call is ignored', () => {
  dueQuestion()
  const res = h.run('dispatch-check.js', { ...agentCall, agent_id: 'a1', agent_type: 'x' })
  assert.equal(res.stdout, '')
})

test('no state means nothing happens', () => {
  const res = h.run('dispatch-check.js', agentCall)
  assert.equal(res.stdout, '')
  assert.equal(state.read(sid), null)
})
