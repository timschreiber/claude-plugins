'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const io = require('../../plugins/decidinator/scripts/lib/fileio.js')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-fileio-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

test('readText of a missing file is empty', () => {
  assert.equal(io.readText(path.join(dir, 'nope.md')), '')
})

test('writeAtomic writes the file and leaves no tmp file', () => {
  const f = path.join(dir, 'a.md')
  io.writeAtomic(f, 'hello')
  assert.equal(fs.readFileSync(f, 'utf8'), 'hello')
  assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp')), [])
})

test('update writes the mutated text and removes the lock', () => {
  const f = path.join(dir, 'a.md')
  const r = io.update(f, (t) => ({ ok: true, text: t + 'x', n: 1 }))
  assert.deepEqual(r, { ok: true, n: 1 })
  assert.equal(fs.readFileSync(f, 'utf8'), 'x')
  assert.equal(fs.existsSync(`${f}.lock`), false)
})

test('update with unchanged text does not touch the file', () => {
  const f = path.join(dir, 'a.md')
  fs.writeFileSync(f, 'same')
  const old = new Date(Date.now() - 86400000)
  fs.utimesSync(f, old, old)
  const before = fs.statSync(f).mtimeMs
  io.update(f, (t) => ({ ok: true, text: t }))
  assert.equal(fs.statSync(f).mtimeMs, before)
})

test('a failing mutate writes nothing and is returned', () => {
  const f = path.join(dir, 'a.md')
  const r = io.update(f, () => ({ ok: false, error: 'x' }))
  assert.deepEqual(r, { ok: false, error: 'x' })
  assert.equal(fs.existsSync(f), false)
})

test('a throwing mutate returns an error naming the file and frees the lock', () => {
  const f = path.join(dir, 'a.md')
  const r = io.update(f, () => {
    throw new Error('boom')
  })
  assert.equal(r.ok, false)
  assert.ok(r.error.startsWith(f))
  assert.equal(fs.existsSync(`${f}.lock`), false)
})

test('a fresh lock file makes update time out, naming the lock', () => {
  const f = path.join(dir, 'a.md')
  fs.writeFileSync(`${f}.lock`, 'held')
  const saved = io.limits.timeoutMs
  io.limits.timeoutMs = 200
  try {
    const r = io.update(f, (t) => ({ ok: true, text: 'x' }))
    assert.equal(r.ok, false)
    assert.ok(r.error.includes(`${f}.lock`))
  } finally {
    io.limits.timeoutMs = saved
  }
})

test('a stale lock is broken', () => {
  const f = path.join(dir, 'a.md')
  fs.writeFileSync(`${f}.lock`, 'old')
  const old = new Date(Date.now() - 60000)
  fs.utimesSync(`${f}.lock`, old, old)
  const r = io.update(f, () => ({ ok: true, text: 'x' }))
  assert.equal(r.ok, true)
  assert.equal(fs.readFileSync(f, 'utf8'), 'x')
})

test('update creates missing parent directories', () => {
  const f = path.join(dir, 'sub', 'deep', 'a.md')
  assert.equal(io.update(f, () => ({ ok: true, text: 'x' })).ok, true)
  assert.equal(fs.readFileSync(f, 'utf8'), 'x')
})
