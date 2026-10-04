'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { report } = require('../src/report.js')

test('report lists each line and the total', () => {
  const lines = [
    { name: 'pen', priceCents: 150, qty: 3 },
    { name: 'pad', priceCents: 299, qty: 1 },
  ]
  assert.equal(report(lines), ['pen x3: $4.50', 'pad x1: $2.99', 'Total: $7.49'].join('\n'))
})

test('report of an empty cart is just the total', () => {
  assert.equal(report([]), 'Total: $0.00')
})
