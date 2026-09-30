'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const state = require('../../plugins/decidinator/scripts/lib/state.js')

let dir
let saved

beforeEach(() => {
  saved = process.env.CLAUDE_PLUGIN_DATA
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-state-'))
  process.env.CLAUDE_PLUGIN_DATA = dir
})

afterEach(() => {
  if (saved === undefined) delete process.env.CLAUDE_PLUGIN_DATA
  else process.env.CLAUDE_PLUGIN_DATA = saved
  fs.rmSync(dir, { recursive: true, force: true })
})

const sessions = () => path.join(dir, 'sessions')

test('write and read round-trip under sessions/<id>.json', () => {
  assert.equal(state.write('s1', { a: 1 }), true)
  assert.ok(fs.existsSync(path.join(sessions(), 's1.json')))
  assert.deepEqual(state.read('s1'), { a: 1 })
})

test('missing reads null', () => {
  assert.equal(state.read('nope'), null)
})

test('corrupt file reads null', () => {
  fs.mkdirSync(sessions(), { recursive: true })
  fs.writeFileSync(path.join(sessions(), 'bad.json'), '{not json')
  assert.equal(state.read('bad'), null)
})

test('write leaves no .tmp file behind', () => {
  state.write('s1', { a: 1 })
  assert.deepEqual(fs.readdirSync(sessions()).filter((f) => f.endsWith('.tmp')), [])
})

test('ids are sanitized', () => {
  assert.equal(state.write('../../evil', { x: 1 }), true)
  assert.deepEqual(fs.readdirSync(sessions()), ['evil.json'])
})

test('bad ids make everything fail safe', () => {
  for (const id of [undefined, null, '', '///']) {
    assert.equal(state.write(id, {}), false)
    assert.equal(state.arm(id, 'ask', 'command'), false)
    assert.equal(state.setMode(id, 'ask'), false)
    assert.equal(state.read(id), null)
    assert.equal(state.readArming(id), null)
  }
})

test('arm then readArming', () => {
  assert.equal(state.arm('s1', 'sidecar', 'env'), true)
  const a = state.readArming('s1')
  assert.equal(a.mode, 'sidecar')
  assert.equal(a.by, 'env')
  assert.equal(new Date(a.armedAt).toISOString(), a.armedAt)
})

test('arm rejects a bad mode or by', () => {
  assert.equal(state.arm('s1', 'loud', 'command'), false)
  assert.equal(state.arm('s1', 'ask', 'x'), false)
})

test('readArming returns null for invalid flags', () => {
  fs.mkdirSync(sessions(), { recursive: true })
  const flag = path.join(sessions(), 's1.armed')
  fs.writeFileSync(flag, 'yes')
  assert.equal(state.readArming('s1'), null)
  fs.writeFileSync(flag, JSON.stringify({ mode: 'loud', by: 'command', armedAt: 'x' }))
  assert.equal(state.readArming('s1'), null)
  fs.writeFileSync(flag, JSON.stringify({ mode: 'ask', by: 'other', armedAt: 'x' }))
  assert.equal(state.readArming('s1'), null)
})

test('setMode changes mode and keeps armedAt and by', () => {
  state.arm('s1', 'ask', 'command')
  const before = state.readArming('s1')
  assert.equal(state.setMode('s1', 'sidecar'), true)
  const after = state.readArming('s1')
  assert.equal(after.mode, 'sidecar')
  assert.equal(after.armedAt, before.armedAt)
  assert.equal(after.by, 'command')
})

test('setMode fails when unarmed or for a bad mode', () => {
  assert.equal(state.setMode('s1', 'ask'), false)
  state.arm('s1', 'ask', 'command')
  assert.equal(state.setMode('s1', 'loud'), false)
})

test('disarm removes flag and json and is safe to repeat', () => {
  state.arm('s1', 'ask', 'command')
  state.write('s1', { a: 1 })
  state.disarm('s1')
  assert.deepEqual(fs.readdirSync(sessions()), [])
  state.disarm('s1')
})

test('removeSession removes only that session\'s files', () => {
  fs.mkdirSync(sessions(), { recursive: true })
  for (const f of ['abc.json', 'abc.armed', 'abc.extra.txt', 'abcd.json', 'other.armed']) {
    fs.writeFileSync(path.join(sessions(), f), 'x')
  }
  state.removeSession('abc')
  assert.deepEqual(fs.readdirSync(sessions()).sort(), ['abcd.json', 'other.armed'])
})

test('prune removes old files and keeps recent ones', () => {
  fs.mkdirSync(sessions(), { recursive: true })
  const now = Date.now()
  const set = (name, days) => {
    const f = path.join(sessions(), name)
    fs.writeFileSync(f, 'x')
    const t = new Date(now - days * 86400000)
    fs.utimesSync(f, t, t)
  }
  set('a.json', 8)
  set('a.armed', 8)
  set('a.foo', 8)
  set('b.json', 6)
  set('b.armed', 6)
  state.prune(7)
  assert.deepEqual(fs.readdirSync(sessions()).sort(), ['b.armed', 'b.json'])
})

test('an unwritable data dir fails safe', () => {
  const blocker = path.join(dir, 'file')
  fs.writeFileSync(blocker, 'x')
  process.env.CLAUDE_PLUGIN_DATA = path.join(blocker, 'sub')
  assert.equal(state.write('s1', {}), false)
  assert.equal(state.arm('s1', 'ask', 'command'), false)
  assert.doesNotThrow(() => state.prune(7))
})

test('default location is under the temp dir', () => {
  delete process.env.CLAUDE_PLUGIN_DATA
  assert.ok(state.fileFor('x').startsWith(path.join(os.tmpdir(), 'decidinator')))
})
