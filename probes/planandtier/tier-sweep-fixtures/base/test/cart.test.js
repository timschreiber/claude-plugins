'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { getItemTotal, cartTotal } = require('../src/cart.js')

test('getItemTotal multiplies price by quantity', () => {
  assert.equal(getItemTotal({ name: 'pen', priceCents: 150, qty: 3 }), 450)
})

test('cartTotal sums every line', () => {
  const lines = [
    { name: 'pen', priceCents: 150, qty: 3 },
    { name: 'pad', priceCents: 299, qty: 1 },
  ]
  assert.equal(cartTotal(lines), 749)
})

test('cartTotal of an empty cart is 0', () => {
  assert.equal(cartTotal([]), 0)
})
