'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const p = require('../../plugins/planandtier/scripts/lib/prices.js')

const EVIDENCE = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'probes', 'evidence', 'planandtier-pricing.json'), 'utf8')
)
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

test('the price table is exactly the one recorded in the pricing evidence', () => {
  assert.deepEqual(p.PRICES, EVIDENCE.models)
  assert.equal(p.AS_OF, EVIDENCE.generated)
})

test('priceFor matches the longest model id prefix, and never a shorter version', () => {
  assert.equal(p.priceFor('claude-opus-5-5').cacheRead, 0.2)
  assert.equal(p.priceFor('claude-opus-5').cacheRead, 0.5)
  assert.equal(p.priceFor('claude-opus-5-5[1m]').input, 4)
  assert.equal(p.priceFor('claude-sonnet-5').input, 2)
  assert.equal(p.priceFor('claude-sonnet-5-5').input, 2)
  assert.equal(p.priceFor('claude-haiku-4-5-20251001').output, 5)
  assert.equal(p.priceFor('claude-opus-55'), null, 'a digit right after a key is another model')
  assert.equal(p.priceFor('gpt-9'), null)
  assert.equal(p.priceFor(undefined), null)
})

test('costOf prices each token kind from the model row, and US-only inference at 1.1x', () => {
  const million = { input: 1e6, output: 1e6, cacheWrite5m: 1e6, cacheWrite1h: 1e6, cacheRead: 1e6 }
  close(p.costOf('claude-opus-5-5', million), 4 + 20 + 5 + 8 + 0.2)
  close(p.costOf('claude-sonnet-5', million), 2 + 10 + 2.5 + 4 + 0.2)
  close(p.costOf('claude-sonnet-5', { cacheRead: 1e6 }, 'us'), 0.22)
  close(p.costOf('claude-sonnet-5', {}), 0)
  assert.equal(p.costOf('mystery-model', million), null)
})
