'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { parseCsvLine } = require('../src/csv.js')

test('plain fields', () => {
  assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c'])
})

test('an empty line is one empty field', () => {
  assert.deepEqual(parseCsvLine(''), [''])
})

test('empty fields, in the middle and at the end', () => {
  assert.deepEqual(parseCsvLine('a,,c'), ['a', '', 'c'])
  assert.deepEqual(parseCsvLine('a,'), ['a', ''])
  assert.deepEqual(parseCsvLine(',a'), ['', 'a'])
})

test('spaces are kept', () => {
  assert.deepEqual(parseCsvLine(' a , b '), [' a ', ' b '])
})

test('a quoted field may contain commas', () => {
  assert.deepEqual(parseCsvLine('"a,b",c'), ['a,b', 'c'])
  assert.deepEqual(parseCsvLine('x,"b"'), ['x', 'b'])
})

test('a doubled quote inside quotes is one quote', () => {
  assert.deepEqual(parseCsvLine('"say ""hi""",x'), ['say "hi"', 'x'])
})

test('an empty quoted field', () => {
  assert.deepEqual(parseCsvLine('"",x'), ['', 'x'])
})

test('a quote that is never closed throws', () => {
  assert.throws(() => parseCsvLine('"open'), Error)
  assert.throws(() => parseCsvLine('a,"b,c'), Error)
})
