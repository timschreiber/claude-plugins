'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PLUGIN = path.join(__dirname, '..', '..', 'plugins', 'tierminator')
const SCRIPT = path.join(PLUGIN, 'scripts', 'h9-worker-timeout.js')
const state = require(path.join(PLUGIN, 'scripts', 'lib', 'state.js'))

const S = 'timeout-sess'

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-timeout-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(dir, 'data')
  state.activate(S)
  state.write(S, { phase: 'running', tasks: [] })
})
afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

function hook(stdin) {
  const base = { ...process.env }
  delete base.CLAUDE_CODE_ENTRYPOINT
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
    env: base,
    encoding: 'utf8',
  })
  let json = null
  try {
    json = JSON.parse(res.stdout)
  } catch {}
  return { status: res.status, stdout: res.stdout, json }
}

const call = over => ({
  session_id: S,
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  agent_id: 'w1',
  agent_type: 'tierminator:sonnet-medium',
  tool_input: { command: 'node --test', description: 'tests' },
  ...over,
})

const withTi = extra => call({ tool_input: { command: 'node --test', description: 'tests', ...extra } })

function assertSilent(res) {
  assert.equal(res.status, 0)
  assert.equal(res.stdout.trim(), '')
}

test('a worker call without timeout gets 600000 and no permission decision', () => {
  const res = hook(call())
  assert.equal(res.status, 0)
  assert.deepEqual(res.json.hookSpecificOutput, {
    hookEventName: 'PreToolUse',
    updatedInput: { command: 'node --test', description: 'tests', timeout: 600000 },
  })
})

test('a null timeout is replaced; 30000 and 0 are left alone', () => {
  const res = hook(withTi({ timeout: null }))
  assert.equal(res.status, 0)
  assert.equal(res.json.hookSpecificOutput.updatedInput.timeout, 600000)
  assertSilent(hook(withTi({ timeout: 30000 })))
  assertSilent(hook(withTi({ timeout: 0 })))
})

test('run_in_background true is left alone; false still gets the timeout', () => {
  assertSilent(hook(withTi({ run_in_background: true })))
  const res = hook(withTi({ run_in_background: false }))
  assert.equal(res.status, 0)
  assert.equal(res.json.hookSpecificOutput.updatedInput.timeout, 600000)
})

test('every tier gets it; non-workers print nothing', () => {
  for (const t of ['haiku-high', 'sonnet-low', 'sonnet-medium', 'sonnet-high', 'opus-medium', 'opus-high']) {
    const res = hook(call({ agent_type: `tierminator:${t}` }))
    assert.equal(res.status, 0, t)
    assert.equal(res.json.hookSpecificOutput.updatedInput.timeout, 600000, t)
  }
  assertSilent(hook(call({ agent_id: undefined })))
  assertSilent(hook(call({ agent_type: 'Explore' })))
  assertSilent(hook(call({ agent_type: undefined })))
  assertSilent(hook(call({ agent_type: 'tierminator' })))
})

test('other tools print nothing', () => {
  assertSilent(hook(call({ tool_name: 'Write' })))
  assertSilent(hook(call({ tool_name: 'PowerShell' })))
})

test('an inactive, removed, halted or complete run prints nothing', () => {
  state.deactivate(S)
  assertSilent(hook(call()))
  state.activate(S)
  state.write(S, { phase: 'running', tasks: [] })
  state.remove(S)
  assertSilent(hook(call()))
  state.activate(S)
  state.write(S, { phase: 'halted', tasks: [] })
  assertSilent(hook(call()))
  state.write(S, { phase: 'complete', tasks: [] })
  assertSilent(hook(call()))
})

test('a wave state still gets the timeout', () => {
  state.write(S, { phase: 'running', tasks: [], wave: { phase: 'working' } })
  const res = hook(call())
  assert.equal(res.status, 0)
  assert.equal(res.json.hookSpecificOutput.updatedInput.timeout, 600000)
})

test('a null or array tool_input prints nothing', () => {
  assertSilent(hook(call({ tool_input: null })))
  assertSilent(hook(call({ tool_input: [] })))
})

test('the script never names a permission decision', () => {
  const src = fs
    .readFileSync(SCRIPT, 'utf8')
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n')
  assert.doesNotMatch(src, /['"](allow|ask|deny)['"]/)
})
