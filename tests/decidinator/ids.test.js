'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const ids = require(path.join(lib, 'ids.js'))
const sidecar = require(path.join(lib, 'sidecar.js'))
const decisionLog = require(path.join(lib, 'decision-log.js'))
const { DEFAULTS } = require(path.join(lib, 'config.js'))

let tmp
let project
let saved

beforeEach(() => {
  saved = process.env.CLAUDE_PLUGIN_DATA
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-ids-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(tmp, 'data')
  project = path.join(tmp, 'project')
  fs.mkdirSync(project)
})

afterEach(() => {
  if (saved === undefined) delete process.env.CLAUDE_PLUGIN_DATA
  else process.env.CLAUDE_PLUGIN_DATA = saved
  fs.rmSync(tmp, { recursive: true, force: true })
})

const opts = dir => ({ projectDir: dir, decisionLog: DEFAULTS.decisionLog, sidecar: DEFAULTS.sidecar })

test('formatId pads to four digits', () => {
  assert.equal(ids.formatId(7), 'Q-0007')
  assert.equal(ids.formatId(12345), 'Q-12345')
})

test('first mint in an empty project is Q-0001, then IDs continue', () => {
  assert.deepEqual(ids.mint(1, opts(project)), ['Q-0001'])
  assert.deepEqual(ids.mint(1, opts(project)), ['Q-0002'])
})

test('count 3 returns three consecutive IDs', () => {
  assert.deepEqual(ids.mint(3, opts(project)), ['Q-0001', 'Q-0002', 'Q-0003'])
  assert.deepEqual(ids.mint(1, opts(project)), ['Q-0004'])
})

test('a sidecar entry raises the next ID', () => {
  const file = path.join(project, DEFAULTS.sidecar)
  const r = sidecar.append(file, { id: 'Q-0012', topic: 't', question: 'q' })
  assert.equal(r.ok, true, r.error)
  assert.deepEqual(ids.mint(1, opts(project)), ['Q-0013'])
})

test('a decision log Question ID raises the next ID', () => {
  const file = path.join(project, DEFAULTS.decisionLog)
  const r = decisionLog.append(file, { title: 't', question: 'q', answer: 'a', provenance: 'user', questionId: 'Q-0020' })
  assert.equal(r.ok, true, r.error)
  assert.deepEqual(ids.mint(1, opts(project)), ['Q-0021'])
})

test('two project dirs have separate counters', () => {
  const other = path.join(tmp, 'other')
  fs.mkdirSync(other)
  assert.deepEqual(ids.mint(2, opts(project)), ['Q-0001', 'Q-0002'])
  assert.deepEqual(ids.mint(1, opts(other)), ['Q-0001'])
})

test('two concurrent processes mint distinct IDs', async () => {
  const helper = path.join(__dirname, 'fixtures', 'mint-many.js')
  const run = () =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [helper, project, '5'], { env: process.env })
      let out = ''
      let err = ''
      child.stdout.on('data', d => (out += d))
      child.stderr.on('data', d => (err += d))
      child.on('close', code => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`exit ${code}: ${err}`))))
    })
  const all = (await Promise.all([run(), run()])).flat()
  assert.equal(all.length, 10)
  assert.equal(new Set(all).size, 10)
})
