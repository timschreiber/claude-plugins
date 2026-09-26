'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const state = require('../../plugins/planandtier/scripts/lib/state.js')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planandtier-state-'))
  process.env.CLAUDE_PLUGIN_DATA = dir
})
afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA
  fs.rmSync(dir, { recursive: true, force: true })
})

test('write then read round-trips, under sessions/<id>.json', () => {
  assert.equal(state.write('abc-123', { phase: 'approved', tasks: [1] }), true)
  assert.deepEqual(state.read('abc-123'), { phase: 'approved', tasks: [1] })
  assert.ok(fs.existsSync(path.join(dir, 'sessions', 'abc-123.json')))
})

test('reading a missing session returns null', () => {
  assert.equal(state.read('nope'), null)
})

test('a corrupt file reads as null instead of throwing', () => {
  fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'sessions', 'bad.json'), '{not json')
  assert.equal(state.read('bad'), null)
})

test('remove deletes the file and is safe when it is already gone', () => {
  state.write('s1', { phase: 'approved' })
  state.remove('s1')
  assert.equal(state.read('s1'), null)
  state.remove('s1')
})

test('session ids are reduced to filename-safe characters', () => {
  assert.equal(state.write('../../evil', { phase: 'approved' }), true)
  const file = state.fileFor('../../evil')
  assert.equal(path.dirname(file), path.join(dir, 'sessions'))
  assert.equal(path.basename(file), 'evil.json')
})

test('missing or empty session ids read and write nothing', () => {
  for (const id of [undefined, null, '', '///']) {
    assert.equal(state.write(id, { phase: 'approved' }), false)
    assert.equal(state.read(id), null)
  }
})

test('write leaves no temp file behind', () => {
  state.write('s1', { phase: 'approved' })
  assert.deepEqual(fs.readdirSync(path.join(dir, 'sessions')), ['s1.json'])
})

test('prune removes files older than the cutoff and keeps recent ones', () => {
  state.write('old', { phase: 'approved' })
  state.write('new', { phase: 'approved' })
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
  fs.utimesSync(state.fileFor('old'), past, past)
  state.prune(7)
  assert.equal(state.read('old'), null)
  assert.deepEqual(state.read('new'), { phase: 'approved' })
})

test('an unwritable data directory makes write return false and read return null', () => {
  const blocker = path.join(dir, 'file')
  fs.writeFileSync(blocker, '')
  process.env.CLAUDE_PLUGIN_DATA = path.join(blocker, 'nested')
  assert.equal(state.write('s1', { phase: 'approved' }), false)
  assert.equal(state.read('s1'), null)
  state.prune(7)
})

test('with CLAUDE_PLUGIN_DATA unset, state falls back to the temp directory', () => {
  delete process.env.CLAUDE_PLUGIN_DATA
  const file = state.fileFor('fallback-test')
  assert.ok(file.startsWith(path.join(os.tmpdir(), 'planandtier')))
})
