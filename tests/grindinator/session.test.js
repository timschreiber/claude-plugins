// Tests for the session launcher: arguments, prompt, environment and the launch lifecycle.
'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { DEFAULTS } = require('../../tools/grindinator/lib/config')
const { claudeCommand } = require('../../tools/grindinator/lib/claude-bin')
const session = require('../../tools/grindinator/lib/session')
const h = require('./helpers')

const DEFAULT_ARGS = [
  '-p', 'P', '--output-format', 'stream-json', '--verbose',
  '--model', 'opus', '--effort', 'medium', '--permission-mode', 'bypassPermissions'
]

function setup() {
  const dir = h.tempDir('grind-session-')
  return {
    dir,
    streamFile: path.join(dir, 'stream.jsonl'),
    stderrFile: path.join(dir, 'stderr.txt')
  }
}

function launchStub(s, scenario, extra = {}) {
  const env = session.buildEnv(h.stubEnv(s.dir, scenario), {
    root: s.dir, packageId: 'WP-01', resultFile: path.join(s.dir, 'result.json')
  })
  const { command, args } = claudeCommand(env)
  return session.launch({
    command,
    args: [...args, '-p', 'x'],
    cwd: s.dir,
    env,
    streamFile: s.streamFile,
    stderrFile: s.stderrFile,
    capMs: 0,
    ...extra
  })
}

test('buildArgs builds the claude arguments', () => {
  assert.deepEqual(session.buildArgs({ ...DEFAULTS }, 'P'), DEFAULT_ARGS)
  const more = session.buildArgs({ ...DEFAULTS, maxTurns: 5, allowedTools: ['Read', 'Bash(git:*)'] }, 'P')
  assert.deepEqual(more.slice(-5), ['--max-turns', '5', '--allowedTools', 'Read', 'Bash(git:*)'])
})

test('sessionPrompt starts with the plan command', () => {
  assert.equal(session.sessionPrompt(null, '# P'), '/tierminator:plan # P')
  assert.equal(session.sessionPrompt('Pre', '# P'), '/tierminator:plan Pre' + '\n\n' + '# P')
})

test('buildEnv drops session variables and sets the runner variables', () => {
  const root = path.join(path.sep, 'repo')
  const base = { CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', KEEP: 'k', DECIDINATOR_MODE: 'ask' }
  const copy = { ...base }
  const env = session.buildEnv(base, { root, packageId: 'WP-01', resultFile: 'r.json' })
  assert.equal('CLAUDECODE' in env, false)
  assert.equal('CLAUDE_CODE_ENTRYPOINT' in env, false)
  assert.equal(env.KEEP, 'k')
  assert.equal(env.TIERMINATOR_RESULT_FILE, 'r.json')
  assert.equal(env.DECIDINATOR_MODE, 'sidecar')
  assert.equal(env.DECIDINATOR_CONTEXT, 'WP-01')
  assert.ok(env.DECIDINATOR_LOG.endsWith(path.join('.grindinator', 'decisions', 'decisions.md')))
  assert.ok(env.DECIDINATOR_SIDECAR.endsWith(path.join('.grindinator', 'decisions', 'open-questions.md')))
  assert.deepEqual(base, copy)
})

test('launch runs a session and records its stream', async () => {
  const s = setup()
  try {
    const scenario = h.completeScenario()
    const env = session.buildEnv({ ...h.stubEnv(s.dir, scenario), CLAUDECODE: '1' }, {
      root: s.dir, packageId: 'WP-01', resultFile: path.join(s.dir, 'result.json')
    })
    const { command, args } = claudeCommand(env)
    const claudeArgs = session.buildArgs({ ...DEFAULTS }, 'P')
    const r = await session.launch({
      command,
      args: [...args, ...claudeArgs],
      cwd: s.dir,
      env,
      streamFile: s.streamFile,
      stderrFile: s.stderrFile,
      capMs: 0
    })
    assert.equal(r.exitCode, 0)
    assert.equal(r.timedOut, false)
    assert.equal(r.interrupted, false)
    assert.equal(r.spawnError, null)
    const lines = fs.readFileSync(s.streamFile, 'utf8').split('\n').filter(Boolean)
    assert.equal(lines.length, 2)
    for (const line of lines) JSON.parse(line)
    assert.ok(fs.existsSync(s.stderrFile))
    const entry = h.readStubLog(s.dir)[0]
    assert.deepEqual(entry.argv, claudeArgs)
    assert.equal(entry.env.DECIDINATOR_CONTEXT, 'WP-01')
    assert.equal(entry.env.CLAUDECODE, null)
  } finally {
    h.remove(s.dir)
  }
})

test('launch stops a session that passes the time cap', async () => {
  const s = setup()
  try {
    const r = await launchStub(s, { stream: [h.INIT], delayMs: 20000 }, { capMs: 300 })
    assert.equal(r.timedOut, true)
    assert.notEqual(r.exitCode, 0)
    assert.ok(r.durationMs < 15000)
  } finally {
    h.remove(s.dir)
  }
})

test('launch stops a session when the signal aborts', async () => {
  const s = setup()
  try {
    const controller = new AbortController()
    const pending = launchStub(s, { stream: [h.INIT], delayMs: 20000 }, { abortSignal: controller.signal })
    await h.waitFor(() => fs.existsSync(s.streamFile) && fs.readFileSync(s.streamFile, 'utf8').includes('init'))
    controller.abort()
    const r = await pending
    assert.equal(r.interrupted, true)
    assert.ok(r.durationMs < 15000)
  } finally {
    h.remove(s.dir)
  }
})

test('launch stops a session at once when the signal is already aborted', async () => {
  const s = setup()
  try {
    const controller = new AbortController()
    controller.abort()
    const r = await launchStub(s, { stream: [h.INIT], delayMs: 20000 }, { abortSignal: controller.signal })
    assert.equal(r.interrupted, true)
  } finally {
    h.remove(s.dir)
  }
})

test('launch reports a command that cannot start', async () => {
  const s = setup()
  try {
    const r = await session.launch({
      command: 'grindinator-no-such-claude',
      args: [],
      cwd: s.dir,
      env: { ...process.env },
      streamFile: s.streamFile,
      stderrFile: s.stderrFile,
      capMs: 0
    })
    assert.ok(typeof r.spawnError === 'string' && r.spawnError !== '')
    assert.equal(r.exitCode, null)
    assert.equal(fs.readFileSync(s.streamFile, 'utf8'), '')
  } finally {
    h.remove(s.dir)
  }
})
