// Tests for the claude executable resolver and the stub that stands in for it in runner tests.
'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { claudeCommand } = require('../../tools/grindinator/lib/claude-bin')
const h = require('./helpers')

const STUB = path.join(__dirname, 'fixtures', 'claude-stub.js')

function baseEnv() {
  const env = { ...process.env }
  for (const k of Object.keys(env)) {
    if (k.startsWith('GRINDINATOR_STUB_') || k.startsWith('DECIDINATOR_')) delete env[k]
  }
  env.GRINDINATOR_CLAUDE_BIN = STUB
  return env
}

function runStub(extraEnv = {}, claudeArgs = [], cwd) {
  const env = { ...baseEnv(), ...extraEnv }
  const { command, args } = claudeCommand(env)
  return spawnSync(command, [...args, ...claudeArgs], { env, encoding: 'utf8', cwd })
}

test('claudeCommand resolves the executable', () => {
  assert.deepEqual(claudeCommand({}), { command: 'claude', args: [] })
  assert.deepEqual(claudeCommand({ GRINDINATOR_CLAUDE_BIN: '  ' }), { command: 'claude', args: [] })
  assert.deepEqual(claudeCommand({ GRINDINATOR_CLAUDE_BIN: 'x/stub.js' }), {
    command: process.execPath,
    args: [path.resolve('x/stub.js')]
  })
  assert.equal(claudeCommand({ GRINDINATOR_CLAUDE_BIN: 'C.MJS' }).command, process.execPath)
  assert.deepEqual(claudeCommand({ GRINDINATOR_CLAUDE_BIN: 'claude-dev' }), { command: 'claude-dev', args: [] })
})

test('the default scenario emits init and result and exits 0', () => {
  const r = runStub()
  assert.equal(r.status, 0)
  const lines = r.stdout.split('\n').filter(Boolean)
  assert.equal(lines.length, 2)
  assert.deepEqual(JSON.parse(lines[0]), { type: 'system', subtype: 'init', session_id: 'stub-session' })
  assert.deepEqual(JSON.parse(lines[1]), {
    type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: 'stub-session', result_index: 0
  })
})

test('a scenario file drives stdout, stderr, the exit code and the result file', () => {
  const dir = h.tempDir('grind-stub-')
  try {
    const scenario = path.join(dir, 'scenario.json')
    const resultFile = path.join(dir, 'nested', 'result.json')
    const failed = { type: 'result', is_error: true, api_error_status: 429 }
    fs.writeFileSync(scenario, JSON.stringify({
      stream: ['not json', failed],
      stderr: 'boom',
      exitCode: 1,
      resultFile: { version: 1, outcome: 'limit' }
    }))
    const r = runStub({ GRINDINATOR_STUB_SCENARIO: scenario, TIERMINATOR_RESULT_FILE: resultFile })
    const lines = r.stdout.split('\n').filter(Boolean)
    assert.equal(lines[0], 'not json')
    assert.deepEqual(JSON.parse(lines[1]), failed)
    assert.match(r.stderr, /boom/)
    assert.equal(r.status, 1)
    assert.deepEqual(JSON.parse(fs.readFileSync(resultFile, 'utf8')), { version: 1, outcome: 'limit' })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the stub logs its arguments and environment', () => {
  const dir = h.tempDir('grind-stub-')
  try {
    const log = path.join(dir, 'log.jsonl')
    const r = runStub({ GRINDINATOR_STUB_LOG: log, DECIDINATOR_MODE: 'sidecar' }, ['-p', 'hello'])
    assert.equal(r.status, 0)
    const entry = JSON.parse(fs.readFileSync(log, 'utf8').trim().split('\n')[0])
    assert.deepEqual(entry.argv, ['-p', 'hello'])
    assert.equal(entry.env.DECIDINATOR_MODE, 'sidecar')
    assert.equal(entry.env.DECIDINATOR_CONTEXT, null)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a bad scenario file exits 99', () => {
  const dir = h.tempDir('grind-stub-')
  try {
    const scenario = path.join(dir, 'scenario.json')
    fs.writeFileSync(scenario, '{bad')
    const r = runStub({ GRINDINATOR_STUB_SCENARIO: scenario })
    assert.equal(r.status, 99)
    assert.match(r.stderr, /bad scenario/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('commit makes one commit and untracked leaves a file', () => {
  const repo = h.makeRepo()
  const dir = h.tempDir('grind-stub-')
  try {
    const scenario = path.join(dir, 'scenario.json')
    fs.writeFileSync(scenario, JSON.stringify({ commit: true, untracked: 'litter.txt' }))
    const r = runStub({ GRINDINATOR_STUB_SCENARIO: scenario, DECIDINATOR_CONTEXT: 'WP-07' }, [], repo)
    assert.equal(r.status, 0)
    assert.equal(h.git(repo, 'rev-list', '--count', 'HEAD'), '2')
    assert.equal(h.git(repo, 'log', '-1', '--format=%s'), 'stub commit WP-07')
    assert.equal(h.git(repo, 'status', '--porcelain'), '?? litter.txt')
  } finally {
    h.remove(repo)
    h.remove(dir)
  }
})

test('commit outside a repository root is skipped', () => {
  const work = h.tempDir('grind-plain-')
  const dir = h.tempDir('grind-stub-')
  try {
    const scenario = path.join(dir, 'scenario.json')
    fs.writeFileSync(scenario, JSON.stringify({ commit: true }))
    const r = runStub({ GRINDINATOR_STUB_SCENARIO: scenario }, [], work)
    assert.equal(r.status, 0)
    assert.match(r.stderr, /commit skipped/)
  } finally {
    h.remove(work)
    h.remove(dir)
  }
})

test('the gate fixture fails only for the listed packages', () => {
  const run = id => spawnSync(process.execPath, [h.GATE, 'WP-02'], {
    encoding: 'utf8',
    env: { ...process.env, GRINDINATOR_PACKAGE: id }
  })
  const failing = run('WP-02')
  assert.equal(failing.status, 1)
  assert.ok(failing.stdout.includes('gate stdout WP-02'))
  assert.ok(failing.stderr.includes('gate stderr WP-02'))
  assert.equal(run('WP-01').status, 0)
})
