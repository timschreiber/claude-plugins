'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const state = require('../../plugins/tierminator/scripts/lib/state.js')
const h4wave = require('../../plugins/tierminator/scripts/lib/h4-wave.js')

const S = 'sess-int'
const integratingState = () => ({ phase: 'running', wave: { n: 1, phase: 'integrating', size: [], slots: {} } })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-wint-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(dir, 'data')
  state.activate(S)
})
afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA
  fs.rmSync(dir, { recursive: true, force: true })
})

test('hasLost is false, true after saveLost, and false after takeLost', () => {
  assert.equal(state.hasLost(S), false)
  state.saveLost(S, 'x')
  assert.equal(state.hasLost(S), true)
  state.takeLost(S)
  assert.equal(state.hasLost(S), false)
})

test('integrating is true only for an integrating wave of a running or halted run', () => {
  const mk = (phase, wavePhase) => ({ phase, wave: { n: 1, phase: wavePhase } })
  assert.equal(h4wave.integrating(mk('running', 'integrating')), true)
  assert.equal(h4wave.integrating(mk('halted', 'integrating')), true)
  assert.equal(h4wave.integrating(mk('running', 'working')), false)
  assert.equal(h4wave.integrating(mk('running', 'integrated')), false)
  assert.equal(h4wave.integrating(mk('abandoned', 'integrating')), false)
  assert.equal(h4wave.integrating({ phase: 'running' }), false)
  assert.equal(h4wave.integrating(null), false)
})

test('awaitIntegration returns the given state at once when it is not integrating', async () => {
  const s = { phase: 'running', wave: { n: 1, phase: 'working' } }
  const t = Date.now()
  assert.equal(await h4wave.awaitIntegration(S, s), s)
  assert.ok(Date.now() - t < 100)
})

test('awaitIntegration returns the new state once the wave is integrated', async () => {
  state.write(S, integratingState())
  const next = { phase: 'running', wave: { n: 1, phase: 'integrated', size: [], slots: {} } }
  setTimeout(() => state.write(S, next), 200)
  const got = await h4wave.awaitIntegration(S, state.read(S))
  assert.equal(got.wave.phase, 'integrated')
})

test('awaitIntegration returns a state with no wave', async () => {
  state.write(S, integratingState())
  setTimeout(() => state.write(S, { phase: 'complete' }), 200)
  const got = await h4wave.awaitIntegration(S, state.read(S))
  assert.equal(got.phase, 'complete')
  assert.equal(got.wave, undefined)
})

test('awaitIntegration returns when a lost note is saved', async () => {
  state.write(S, integratingState())
  setTimeout(() => state.saveLost(S, 'lost'), 200)
  const t = Date.now()
  const got = await h4wave.awaitIntegration(S, state.read(S))
  assert.equal(h4wave.integrating(got), true)
  assert.ok(Date.now() - t < 3000)
})

test('awaitIntegration returns when the session is deactivated', async () => {
  state.write(S, integratingState())
  setTimeout(() => state.deactivate(S), 200)
  const t = Date.now()
  const got = await h4wave.awaitIntegration(S, state.read(S))
  assert.equal(h4wave.integrating(got), true)
  assert.ok(Date.now() - t < 3000)
})

test('awaitIntegration gives up after waitMs and returns the integrating state', async () => {
  state.write(S, integratingState())
  const t = Date.now()
  const got = await h4wave.awaitIntegration(S, state.read(S), { waitMs: 300 })
  assert.ok(Date.now() - t >= 300)
  assert.equal(h4wave.integrating(got), true)
  await sleep(0)
})
