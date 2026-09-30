'use strict'

const { test, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const state = require('../../plugins/decidinator/scripts/lib/state.js')

const fixture = path.join(__dirname, 'fixtures', 'armed-echo.js')
let dir

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-hook-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(dir, 'data')
})

function spawn(args, input, extra = {}) {
  const env = { ...process.env, TMPDIR: dir, TEMP: dir, TMP: dir }
  delete env.DECIDINATOR_DEBUG
  delete env.DECIDINATOR_MODE
  Object.assign(env, extra)
  return spawnSync(process.execPath, [fixture, ...args], { input, encoding: 'utf8', env })
}

const payload = JSON.stringify({ session_id: 's1' })

test('unarmed session prints nothing and exits 0', () => {
  const r = spawn([], payload)
  assert.equal(r.stdout, '')
  assert.equal(r.status, 0)
})

test('armed session runs the body', () => {
  state.arm('s1', 'sidecar', 'command')
  const r = spawn([], payload)
  assert.equal(r.stdout, 'ran s1 sidecar\n')
  assert.equal(r.status, 0)
})

for (const bad of ['not json', '[]', '']) {
  test(`stdin ${JSON.stringify(bad)} prints nothing even when armed`, () => {
    state.arm('s1', 'sidecar', 'command')
    const r = spawn([], bad)
    assert.equal(r.stdout, '')
    assert.equal(r.status, 0)
  })
}

test('a throwing body prints nothing and exits 0', () => {
  state.arm('s1', 'sidecar', 'command')
  const r = spawn(['throw'], payload)
  assert.equal(r.stdout, '')
  assert.equal(r.status, 0)
})

test('DECIDINATOR_DEBUG=1 logs the error', () => {
  state.arm('s1', 'sidecar', 'command')
  spawn(['throw'], payload, { DECIDINATOR_DEBUG: '1' })
  const log = path.join(dir, 'decidinator-debug.log')
  assert.ok(fs.existsSync(log))
  assert.match(fs.readFileSync(log, 'utf8'), /armed-echo failure/)
})

test('DECIDINATOR_DEBUG=true does not log', () => {
  state.arm('s1', 'sidecar', 'command')
  spawn(['throw'], payload, { DECIDINATOR_DEBUG: 'true' })
  assert.ok(!fs.existsSync(path.join(dir, 'decidinator-debug.log')))
})
