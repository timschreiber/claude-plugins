'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { normalizeQuestion, questionHash } = require('../../plugins/decidinator/scripts/lib/normalize.js')

test('case, whitespace and punctuation are ignored', () => {
  assert.equal(normalizeQuestion('  Should we USE   Redis?\n'), normalizeQuestion('should we use redis'))
})

test('apostrophes are deleted, not spaced', () => {
  assert.equal(normalizeQuestion("Don't"), 'dont')
})

test('full-width characters fold to ASCII', () => {
  assert.equal(normalizeQuestion('ＡＢＣ？'), 'abc')
})

test('null normalizes to an empty string', () => {
  assert.equal(normalizeQuestion(null), '')
})

test('hash is 16 lowercase hex characters and stable', () => {
  const h = questionHash('use redis')
  assert.match(h, /^[0-9a-f]{16}$/)
  assert.equal(questionHash('use redis'), h)
})

test('equivalent questions share a hash; different ones do not', () => {
  assert.equal(questionHash('Use Redis?'), questionHash('  use   redis '))
  assert.notEqual(questionHash('use redis'), questionHash('use postgres'))
})
