'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { wordCount } = require('../src/words.js')

test('counts words separated by any whitespace', () => {
  assert.equal(wordCount('one two\tthree\nfour'), 4)
})

test('an empty or blank string has no words', () => {
  assert.equal(wordCount(''), 0)
  assert.equal(wordCount('   '), 0)
})

test('a non-string throws a TypeError', () => {
  assert.throws(() => wordCount(42), TypeError)
})
