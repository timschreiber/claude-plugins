'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { formatPrice } = require('../src/format.js')

test('formatPrice formats cents as dollars', () => {
  assert.equal(formatPrice(1999), '$19.99')
  assert.equal(formatPrice(5), '$0.05')
  assert.equal(formatPrice(0), '$0.00')
})

test('formatPrice puts the minus before the dollar sign', () => {
  assert.equal(formatPrice(-5), '-$0.05')
})
