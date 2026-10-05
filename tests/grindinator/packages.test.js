'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { isPackageId, discover, readPackage, loadPreamble, buildPrompt } = require('../../tools/grindinator/lib/packages.js')
const { GrindinatorError } = require('../../tools/grindinator/lib/errors.js')

let dir

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grindinator-packages-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function touch(name, text = 'x') {
  fs.writeFileSync(path.join(dir, name), text)
}

test('packages come back sorted by number with parsed fields', () => {
  touch('WP-10 · Ten.md')
  touch('WP-02 · Two.md')
  touch('WP-01 · One.md')
  const { packages, warnings } = discover(dir)
  assert.deepEqual(packages.map((p) => p.id), ['WP-01', 'WP-02', 'WP-10'])
  assert.deepEqual(packages.map((p) => p.title), ['One', 'Two', 'Ten'])
  assert.deepEqual(packages.map((p) => p.number), [1, 2, 10])
  for (const p of packages) {
    assert.ok(path.isAbsolute(p.file))
    assert.equal(p.file, path.join(dir, p.name))
  }
  assert.deepEqual(warnings, [])
})

test('unrelated files are ignored and look-alikes are skipped with a warning', () => {
  touch('WP-01 · One.md')
  touch('notes.md')
  touch('README.md')
  fs.mkdirSync(path.join(dir, 'WP-03 · Dir.md'))
  touch('WP-4 · Short.md')
  touch('wp-05 - Dash.md')
  const { packages, warnings } = discover(dir)
  assert.deepEqual(packages.map((p) => p.id), ['WP-01'])
  assert.equal(warnings.length, 2)
  assert.ok(warnings.some((w) => w.startsWith('WP-4 · Short.md:')))
  assert.ok(warnings.some((w) => w.startsWith('wp-05 - Dash.md:')))
  assert.ok(!warnings.some((w) => w.includes('Dir.md')))
})

test('a duplicate id throws naming both files', () => {
  touch('WP-01 · A.md')
  touch('WP-01 · B.md')
  assert.throws(() => discover(dir), (err) => {
    assert.ok(err instanceof GrindinatorError)
    assert.ok(err.message.includes('WP-01'))
    assert.ok(err.message.includes('WP-01 · A.md'))
    assert.ok(err.message.includes('WP-01 · B.md'))
    return true
  })
})

test('a missing directory, a file path and an empty directory throw', () => {
  const missing = path.join(dir, 'nope')
  assert.throws(() => discover(missing), (err) => {
    assert.ok(err instanceof GrindinatorError)
    assert.equal(err.exitCode, 2)
    assert.equal(err.message, `the packages directory ${missing} does not exist`)
    return true
  })
  const file = path.join(dir, 'plain.txt')
  fs.writeFileSync(file, 'x')
  assert.throws(() => discover(file), (err) => {
    assert.ok(err instanceof GrindinatorError)
    assert.equal(err.exitCode, 2)
    assert.equal(err.message, `${file} is not a directory`)
    return true
  })
  const empty = path.join(dir, 'empty')
  fs.mkdirSync(empty)
  assert.throws(() => discover(empty), (err) => {
    assert.ok(err instanceof GrindinatorError)
    assert.equal(err.exitCode, 2)
    assert.equal(err.message, `no work packages named "WP-NN · Title.md" in ${empty}`)
    return true
  })
})

test('readPackage strips a BOM, loadPreamble handles null and missing, buildPrompt joins', () => {
  touch('WP-01 · One.md', '﻿Hello')
  const { packages } = discover(dir)
  assert.equal(readPackage(packages[0]), 'Hello')
  assert.equal(loadPreamble(null), null)
  const missing = path.join(dir, 'pre.md')
  assert.throws(() => loadPreamble(missing), (err) => {
    assert.ok(err instanceof GrindinatorError)
    assert.equal(err.message, `the preamble file ${missing} does not exist`)
    return true
  })
  assert.equal(buildPrompt('Pre\n\n', 'Body'), 'Pre\n\nBody')
  assert.equal(buildPrompt('  ', 'Body'), 'Body')
  assert.equal(buildPrompt(null, 'Body'), 'Body')
})

test('isPackageId accepts and rejects the right ids', () => {
  assert.equal(isPackageId('WP-01'), true)
  assert.equal(isPackageId('WP-123'), true)
  for (const bad of ['WP-1', 'wp-01', 'WP-01x', '../WP-01']) assert.equal(isPackageId(bad), false)
})
