'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { parseDuration } = require('../src/duration.js')

test('hours, minutes and seconds', () => {
  assert.equal(parseDuration('1h30m15s'), 5415)
})

test('a single unit', () => {
  assert.equal(parseDuration('2h'), 7200)
  assert.equal(parseDuration('45m'), 2700)
  assert.equal(parseDuration('10s'), 10)
})

test('a bare number is seconds', () => {
  assert.equal(parseDuration('90'), 90)
})

test('parts may be separated by spaces', () => {
  assert.equal(parseDuration('1h 30m'), 5400)
  assert.equal(parseDuration(' 2h 5s '), 7205)
})

test('anything else throws', () => {
  assert.throws(() => parseDuration(''))
  assert.throws(() => parseDuration('abc'))
  assert.throws(() => parseDuration('30s1h'))
})
