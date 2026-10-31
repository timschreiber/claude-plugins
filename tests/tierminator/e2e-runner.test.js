'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { cleanEnv, claudeArgs, waitFor } = require('./e2e/run-headless.js')

const SCRIPT = path.join(__dirname, 'e2e', 'run-headless.js')

function tempBase(status) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-runner-'))
  if (status) fs.writeFileSync(path.join(base, 'status.json'), JSON.stringify(status))
  return base
}

test('cleanEnv removes session variables and keeps the rest', () => {
  const out = cleanEnv({
    CLAUDECODE: '1',
    CLAUDE_CODE_ENTRYPOINT: 'cli',
    CLAUDE_PLUGIN_ROOT: '/x',
    TIERMINATOR_DEBUG: '1',
    DECIDINATOR_MODE: 'on',
    PATH: '/usr/bin',
    HOME: '/home/u'
  })
  assert.deepEqual(out, { PATH: '/usr/bin', HOME: '/home/u' })
})

test('claudeArgs returns the exact argument array', () => {
  assert.deepEqual(
    claudeArgs({ planPath: 'C:/p/plan.md', permissionMode: 'bypassPermissions', pluginDir: 'C:/x' }),
    [
      '-p', '/tierminator:execute "C:/p/plan.md"',
      '--plugin-dir', 'C:/x',
      '--setting-sources', 'project',
      '--model', 'sonnet',
      '--permission-mode', 'bypassPermissions',
      '--output-format', 'stream-json',
      '--verbose'
    ]
  )
})

test('waitFor: done resolves code 0', async () => {
  const r = await waitFor(tempBase({ state: 'done' }), 1, { intervalMs: 20 })
  assert.equal(r.code, 0)
})

test('waitFor: failed gives code 1 with the error', async () => {
  const r = await waitFor(tempBase({ state: 'failed', error: 'boom' }), 1, { intervalMs: 20 })
  assert.equal(r.code, 1)
  assert.ok(r.text.includes('boom'))
})

test('waitFor: live running worker times out with code 3', async () => {
  const r = await waitFor(tempBase({ state: 'running', pid: process.pid }), 0.2, { intervalMs: 20 })
  assert.equal(r.code, 3)
  assert.ok(r.text.includes('still running'))
})

test('waitFor: dead worker gives code 1', async () => {
  const r = await waitFor(tempBase({ state: 'running', pid: 2147483646 }), 1, { intervalMs: 20 })
  assert.equal(r.code, 1)
  assert.ok(r.text.includes('worker died'))
})

test('waitFor: no status file gives code 1', async () => {
  const r = await waitFor(tempBase(null), 1, { intervalMs: 20 })
  assert.equal(r.code, 1)
})

test('CLI: scenario 7 is interactive and exits 2', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '7'], { encoding: 'utf8' })
  assert.equal(r.status, 2)
  assert.ok(`${r.stdout}${r.stderr}`.includes('interactive'))
})

test('CLI: no arguments exits 2', () => {
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' })
  assert.equal(r.status, 2)
})
