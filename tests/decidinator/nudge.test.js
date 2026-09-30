'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const state = require(path.join(lib, 'state.js'))
const reasons = require(path.join(lib, 'reasons.js'))
const recorded = require('./fixtures/recorded.js')
const { setup } = require('./fixtures/harness.js')

const QUESTION = 'I can fix this two ways.\n\nShould I also update the README?'
let h
let savedData
let stop
let sid

beforeEach(() => {
  h = setup('nudge')
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

function nudge(input) {
  const res = h.run('nudge.js', input)
  assert.equal(res.status, 0, res.stderr)
  return res.stdout
}

function withMessage(text, extra = {}) {
  return Object.assign(JSON.parse(JSON.stringify(stop)), { last_assistant_message: text }, extra)
}

test('a plain-text question is blocked once, then allowed', () => {
  assert.deepEqual(JSON.parse(nudge(withMessage(QUESTION))), { decision: 'block', reason: reasons.NUDGE })
  assert.equal(nudge(withMessage(QUESTION, { stop_hook_active: true })), '')
})

test('a question inside a code block is ignored', () => {
  assert.equal(nudge(withMessage('Here is the check:\n```js\nif (ready?) go()\n```')), '')
})

test('a statement is ignored', () => {
  assert.equal(nudge(stop), '')
})

test('nothing happens when nudgeOnPlainTextQuestions is false', () => {
  fs.mkdirSync(path.join(h.projectDir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(h.projectDir, '.claude', 'decidinator.json'), JSON.stringify({ nudgeOnPlainTextQuestions: false }))
  assert.equal(nudge(withMessage(QUESTION)), '')
})

test('nothing happens while a question is due', () => {
  const ask = recorded.input('decidinator-probe-interactive-deny-normal-hooks.jsonl',
    r => r.event === 'PreToolUse' && r.input.tool_name === 'AskUserQuestion')
  ask.session_id = sid
  const res = h.run('gate.js', ask)
  assert.match(res.stdout, /Q-0001/)
  assert.equal(nudge(withMessage(QUESTION)), '')
})

test('nothing happens when unarmed', () => {
  state.disarm(sid)
  assert.equal(nudge(withMessage(QUESTION)), '')
})

test('a missing last_assistant_message is ignored', () => {
  const input = withMessage('x')
  delete input.last_assistant_message
  assert.equal(nudge(input), '')
})
