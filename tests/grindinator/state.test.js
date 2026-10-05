'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const state = require('../../tools/grindinator/lib/state.js')
const { GrindinatorError } = require('../../tools/grindinator/lib/errors.js')

let root

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'grindinator-state-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

const fresh = () =>
  state.create({
    runName: 'run',
    branch: 'grind/run',
    packagesDir: 'docs/wp',
    baseCommit: 'abc123',
    now: new Date('2026-01-01T00:00:00.000Z'),
  })

const tmpFiles = () => fs.readdirSync(state.stateDir(root)).filter((f) => f.endsWith('.tmp'))

test('read on a fresh root is null; write then read round-trips', () => {
  assert.equal(state.read(root), null)
  const s = fresh()
  state.write(root, s, new Date('2026-02-02T00:00:00.000Z'))
  assert.equal(s.updatedAt, '2026-02-02T00:00:00.000Z')
  assert.deepEqual(state.read(root), s)
  assert.ok(fs.readFileSync(state.statePath(root), 'utf8').endsWith('\n'))
})

test('atomic write leaves no temp file and keeps old content on failure', () => {
  const s = fresh()
  state.write(root, s)
  assert.deepEqual(tmpFiles(), [])
  const before = fs.readFileSync(state.statePath(root), 'utf8')
  const real = fs.renameSync
  fs.renameSync = () => {
    throw Object.assign(new Error('boom'), { code: 'EIO' })
  }
  try {
    assert.throws(() => state.write(root, { ...s, runName: 'other' }), /boom/)
  } finally {
    fs.renameSync = real
  }
  assert.equal(fs.readFileSync(state.statePath(root), 'utf8'), before)
  assert.deepEqual(tmpFiles(), [])
})

test('rename retries on EBUSY', () => {
  const oldMs = state.limits.retryMs
  state.limits.retryMs = 1
  const real = fs.renameSync
  let calls = 0
  fs.renameSync = (a, b) => {
    if (++calls <= 2) throw Object.assign(new Error('busy'), { code: 'EBUSY' })
    return real(a, b)
  }
  try {
    state.write(root, fresh())
  } finally {
    fs.renameSync = real
    state.limits.retryMs = oldMs
  }
  assert.equal(calls, 3)
  assert.equal(state.read(root).runName, 'run')
})

test('bad JSON and a wrong version throw GrindinatorError naming state.json', () => {
  fs.mkdirSync(state.stateDir(root), { recursive: true })
  fs.writeFileSync(state.statePath(root), '{nope')
  assert.throws(() => state.read(root), (e) => e instanceof GrindinatorError && e.message.includes('state.json'))
  fs.writeFileSync(state.statePath(root), JSON.stringify({ version: 2, packages: {} }))
  assert.throws(() => state.read(root), (e) => e instanceof GrindinatorError && e.message.includes('state.json'))
})

test('ensurePackages adds pending entries, keeps existing, updates title', () => {
  const s = fresh()
  state.ensurePackages(s, [{ id: 'WP-01', title: 'One', name: 'WP-01 · One.md' }])
  assert.deepEqual(s.packages['WP-01'], {
    title: 'One',
    file: 'WP-01 · One.md',
    status: 'pending',
    attempts: [],
    startedAt: null,
    endedAt: null,
  })
  s.packages['WP-01'].status = 'failed'
  s.packages['WP-01'].attempts.push({ n: 1 })
  state.ensurePackages(s, [
    { id: 'WP-01', title: 'Uno', name: 'WP-01 · Uno.md' },
    { id: 'WP-02', title: 'Two', name: 'WP-02 · Two.md' },
  ])
  assert.equal(s.packages['WP-01'].title, 'Uno')
  assert.equal(s.packages['WP-01'].status, 'failed')
  assert.deepEqual(s.packages['WP-01'].attempts, [{ n: 1 }])
  assert.equal(s.packages['WP-02'].status, 'pending')
})

test('done marker round trip', () => {
  assert.equal(state.isDone(root, 'WP-01'), false)
  assert.equal(state.clearDone(root, 'WP-01'), false)
  state.markDone(root, 'WP-01')
  assert.equal(state.isDone(root, 'WP-01'), true)
  assert.equal(state.clearDone(root, 'WP-01'), true)
  assert.equal(state.isDone(root, 'WP-01'), false)
  assert.throws(() => state.donePath(root, '../x'), GrindinatorError)
})

test('statusOf', () => {
  const s = fresh()
  state.ensurePackages(s, [
    { id: 'WP-01', title: 'a', name: 'a.md' },
    { id: 'WP-02', title: 'b', name: 'b.md' },
    { id: 'WP-03', title: 'c', name: 'c.md' },
  ])
  s.packages['WP-01'].status = 'failed'
  s.packages['WP-02'].status = 'running'
  s.packages['WP-03'].status = 'done'
  state.markDone(root, 'WP-01')
  assert.equal(state.statusOf(root, s, 'WP-01'), 'done')
  assert.equal(state.statusOf(root, s, 'WP-02'), 'running')
  assert.equal(state.statusOf(root, s, 'WP-03'), 'pending')
  assert.equal(state.statusOf(root, s, 'WP-09'), 'pending')
})
