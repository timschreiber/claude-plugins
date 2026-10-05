'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const H = require(path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib', 'headless.js'))

const AGENT = 'decidinator:oracle-1'
const QUESTION = "Which test runner should the probe project's unit tests use?"
const OPTIONS = [
  { label: 'node:test', description: 'the runner built into Node' },
  { label: 'Jest', description: 'a third-party runner' }
]
const FULL = 'Decidinator question Q-0001\nRung: 1\nDecision log: docs/decisions.md\nSidecar: docs/open-questions.md\n' +
  `Question: ${QUESTION}\nOptions:\n- node:test: the runner built into Node\n- Jest: a third-party runner\nContext: I am adding the first unit test.`
const open = prompt => H.parseOpening({ subagent_type: AGENT, prompt }, AGENT)

test('is detects headless sessions', () => {
  assert.equal(H.is({ CLAUDE_CODE_ENTRYPOINT: 'sdk-cli' }), true)
  assert.equal(H.is({ CLAUDE_CODE_SESSION_ATTENDED: '0' }), true)
  assert.equal(H.is({ CLAUDE_CODE_ENTRYPOINT: 'cli' }), false)
  assert.equal(H.is({}), false)
})

test('parseOpening reads a full opening prompt', () => {
  const q = open(FULL)
  assert.equal(q.question, QUESTION)
  assert.deepEqual(q.options, OPTIONS)
  assert.equal(typeof q.hash, 'string')
})

test('parseOpening accepts NEW with no Rung, log or sidecar lines', () => {
  const q = open(`Decidinator question NEW\nQuestion: ${QUESTION}\nOptions:\n- node:test: the runner built into Node\n- Jest: a third-party runner`)
  assert.equal(q.question, QUESTION)
  assert.deepEqual(q.options, OPTIONS)
})

test('parseOpening joins a two-line question and handles Options: none', () => {
  const q = open('Decidinator question NEW\nQuestion: Which runner\nshould we use?\nOptions: none')
  assert.equal(q.question, 'Which runner should we use?')
  assert.deepEqual(q.options, [])
})

test('parseOpening returns null for non-openings', () => {
  assert.equal(H.parseOpening({ subagent_type: 'other', prompt: FULL }, AGENT), null)
  assert.equal(open('Research this\nQuestion: x'), null)
  assert.equal(open('Decidinator question NEW\nOptions: none'), null)
  assert.equal(open('Decidinator question NEW\nDecidinator import judgment\nQuestion: x'), null)
  assert.equal(open(42), null)
})
