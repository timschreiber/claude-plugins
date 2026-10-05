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

beforeEach(() => {
  h = setup('headless-nudge')
  delete h.env.CLAUDE_CODE_SESSION_ATTENDED
  savedData = process.env.CLAUDE_PLUGIN_DATA
  process.env.CLAUDE_PLUGIN_DATA = h.dataDir
  stop = recorded.input('decidinator-probe-interactive-normal-hooks.jsonl', r => r.event === 'Stop')
  state.arm(stop.session_id, 'ask', 'command')
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

test('headless: a plain-text question is sent to the oracle, once', () => {
  h.env.CLAUDE_CODE_ENTRYPOINT = 'sdk-cli'
  assert.deepEqual(JSON.parse(nudge(withMessage(QUESTION))), { decision: 'block', reason: reasons.NUDGE_HEADLESS })
  assert.equal(nudge(withMessage(QUESTION, { stop_hook_active: true })), '')
})

test('interactive entrypoint keeps the AskUserQuestion nudge', () => {
  h.env.CLAUDE_CODE_ENTRYPOINT = 'cli'
  assert.deepEqual(JSON.parse(nudge(withMessage(QUESTION))), { decision: 'block', reason: reasons.NUDGE })
})

test('headless: nothing happens when nudgeOnPlainTextQuestions is false', () => {
  h.env.CLAUDE_CODE_ENTRYPOINT = 'sdk-cli'
  fs.mkdirSync(path.join(h.projectDir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(h.projectDir, '.claude', 'decidinator.json'), JSON.stringify({ nudgeOnPlainTextQuestions: false }))
  assert.equal(nudge(withMessage(QUESTION)), '')
})
