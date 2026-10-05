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

const SIDECAR = 'grindinator-decide-sidecar-hooks.jsonl'
const NEW_PROMPT = 'Decidinator question NEW\nQuestion: Which color?\nOptions:\n- Red: warm\n- Blue: cool\nContext: testing'
const OTHER_PROMPT = 'Decidinator question NEW\nQuestion: Which size?\nOptions:\n- Small: tiny\n- Large: big\nContext: testing'
let h
let savedData
let agentCall
let sid

beforeEach(() => {
  h = setup('hdispatch')
  savedData = process.env.CLAUDE_PLUGIN_DATA
  process.env.CLAUDE_PLUGIN_DATA = h.dataDir
  agentCall = recorded.input(SIDECAR, r => r.event === 'PreToolUse' && r.input.tool_name === 'Agent' && !r.input.agent_id)
  sid = agentCall.session_id
  state.arm(sid, 'sidecar', 'env')
  h.env.CLAUDE_CODE_ENTRYPOINT = 'sdk-cli'
})

afterEach(() => {
  if (savedData === undefined) delete process.env.CLAUDE_PLUGIN_DATA
  else process.env.CLAUDE_PLUGIN_DATA = savedData
  h.cleanup()
})

const cfg = () => ({ ...DEFAULTS, rungs: [...DEFAULTS.rungs] })

// Runs dispatch-check.js on the recorded call with the given tool_input overrides; returns stdout.
function run(toolInput = {}) {
  const input = JSON.parse(JSON.stringify(agentCall))
  input.tool_input = { ...input.tool_input, ...toolInput }
  const res = h.run('dispatch-check.js', input)
  assert.equal(res.status, 0, res.stderr)
  assert.doesNotMatch(res.stdout, /"permissionDecision":"allow"/)
  return res.stdout
}

test('the recorded opening call opens Q-0001 and is recorded as its first dispatch', () => {
  assert.equal(run(), '')
  const q = state.read(sid).questions['Q-0001']
  assert.ok(q)
  assert.equal(q.status, 'pending')
  assert.equal(q.question, "Which test runner should the probe project's unit tests use?")
  assert.equal(q.options.length, 2)
  assert.equal(q.dispatches.length, 1)
  assert.equal(q.dispatches[0].rung, 1)
})

test('a NEW prompt opens the question and is refused once with the dispatch to make', () => {
  const out = run({ prompt: NEW_PROMPT })
  const d = Q.dueDispatch(state.read(sid), cfg())
  assert.equal(denyReason(out), reasons.openedHeadless(d))
  assert.equal(state.read(sid).questions['Q-0001'].dispatches.length, 0)
  assert.equal(run({ subagent_type: d.agent, prompt: d.prompt }), '')
  assert.equal(state.read(sid).questions['Q-0001'].dispatches.length, 1)
})

test('an interactive session does not open a question', () => {
  h.env.CLAUDE_CODE_ENTRYPOINT = 'cli'
  assert.equal(run(), '')
  assert.equal(state.read(sid), null)
})

test('only a first-rung dispatch opens a question', () => {
  assert.equal(run({ subagent_type: 'decidinator:oracle-2' }), '')
  assert.equal(state.read(sid), null)
})

test('while a question is due, another opening is refused as a wrong dispatch', () => {
  run({ prompt: NEW_PROMPT })
  const d = Q.dueDispatch(state.read(sid), cfg())
  assert.equal(denyReason(run({ prompt: OTHER_PROMPT })), reasons.refused(reasons.missingId(d), d))
  assert.equal(state.read(sid).order.length, 1)
})

test('an opening for a settled question is refused as settled', () => {
  run({ prompt: NEW_PROMPT })
  state.update(sid, cur => ({ ...cur, questions: { ...cur.questions, 'Q-0001': { ...cur.questions['Q-0001'], status: 'resolved' } } }))
  assert.equal(denyReason(run({ prompt: NEW_PROMPT })), reasons.settled(['Q-0001']))
})

test('an import judgment prompt is not an opening', () => {
  assert.equal(run({ prompt: 'Decidinator import judgment\nQuestion: Which color?' }), '')
  assert.equal(state.read(sid), null)
})

test('an unarmed headless session is inert', () => {
  state.disarm(sid)
  assert.equal(run(), '')
  assert.equal(state.read(sid), null)
})
