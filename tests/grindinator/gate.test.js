// Tests for the gate runner: skipped, passing, failing, capped and interrupted gates.
'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { DEFAULTS } = require('../../tools/grindinator/lib/config')
const session = require('../../tools/grindinator/lib/session')
const { runGate } = require('../../tools/grindinator/lib/gate')
const h = require('./helpers')

async function withDir(fn) {
  const dir = fs.realpathSync.native(h.tempDir('grind-gate-'))
  try {
    await fn(dir)
  } finally {
    h.remove(dir)
  }
}

const run = (dir, overrides, extra = {}) => runGate({
  root: dir,
  config: { ...DEFAULTS, ...overrides },
  packageId: 'WP-01',
  dir,
  env: h.stubEnv(dir, {}),
  ...extra
})

test('no gate is skipped and writes no files', () => withDir(async dir => {
  const r = await run(dir, {})
  assert.equal(r.status, 'skipped')
  assert.equal(r.command, null)
  assert.equal(fs.existsSync(path.join(dir, 'gate.stdout.txt')), false)
}))

test('a passing gate passes and records its output', () => withDir(async dir => {
  const r = await run(dir, { gate: h.gateCommand() })
  assert.equal(r.status, 'passed')
  assert.equal(r.exitCode, 0)
  assert.equal(r.reason, null)
  assert.ok(fs.readFileSync(path.join(dir, 'gate.stdout.txt'), 'utf8').includes(`gate stdout WP-01 ${dir}`))
  assert.ok(fs.readFileSync(path.join(dir, 'gate.stderr.txt'), 'utf8').includes('gate stderr WP-01'))
}))

test('a failing gate fails with its exit code', () => withDir(async dir => {
  const r = await run(dir, { gate: h.gateCommand('WP-01') })
  assert.equal(r.status, 'failed')
  assert.equal(r.exitCode, 1)
  assert.equal(r.reason, 'the gate exited 1')
}))

test('a gate past the cap is stopped and fails', () => withDir(async dir => {
  const saved = session.timing.killGraceMs
  session.timing.killGraceMs = 100
  try {
    const env = h.stubEnv(dir, {})
    env.GRINDINATOR_GATE_SLEEP_MS = '30000'
    const r = await runGate({
      root: dir,
      config: { ...DEFAULTS, gate: h.gateCommand(), maxGateMinutes: 0.002 },
      packageId: 'WP-01',
      dir,
      env
    })
    assert.equal(r.status, 'failed')
    assert.equal(r.timedOut, true)
    assert.match(r.reason, /cap/)
  } finally {
    session.timing.killGraceMs = saved
  }
}))

test('an aborted signal interrupts the gate', () => withDir(async dir => {
  const ac = new AbortController()
  ac.abort()
  const r = await run(dir, { gate: h.gateCommand() }, { abortSignal: ac.signal })
  assert.equal(r.status, 'interrupted')
}))
