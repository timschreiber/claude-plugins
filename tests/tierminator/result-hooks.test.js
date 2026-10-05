'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PLUGIN = path.join(__dirname, '..', '..', 'plugins', 'tierminator')
const state = require(path.join(PLUGIN, 'scripts', 'lib', 'state.js'))
const runLib = require(path.join(PLUGIN, 'scripts', 'lib', 'run.js'))
const result = require(path.join(PLUGIN, 'scripts', 'lib', 'result.js'))

// Git in a test repository; fails the test on an error.
const gitIn = (cwd, ...args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
// A repository with one commit and a "main" branch.
function makeRepo(where) {
  fs.mkdirSync(where, { recursive: true })
  gitIn(where, 'init', '-q', '-b', 'main')
  gitIn(where, 'config', 'user.name', 'Test')
  gitIn(where, 'config', 'user.email', 'test@example.com')
  gitIn(where, 'config', 'commit.gpgsign', 'false')
  gitIn(where, 'config', 'core.autocrlf', 'false')
  fs.writeFileSync(path.join(where, 'README.md'), '# test\n')
  gitIn(where, 'add', '-A')
  gitIn(where, 'commit', '-q', '-m', 'init')
  return where
}

// Runs a hook script with `stdin` and returns {status, stdout, json}. CLAUDE_CODE_ENTRYPOINT is left out
// unless `env` sets it, so the hooks see an interactive session whatever shell runs the tests.
function hook(script, stdin, args = [], env = {}) {
  const base = { ...process.env }
  delete base.CLAUDE_CODE_ENTRYPOINT
  delete base.TIERMINATOR_RESULT_FILE
  const r = spawnSync(process.execPath, [path.join(PLUGIN, 'scripts', script), ...args], {
    input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
    env: { ...base, ...env },
    encoding: 'utf8',
  })
  let json = null
  try {
    json = JSON.parse(r.stdout)
  } catch {}
  return { status: r.status, stdout: r.stdout, json }
}

const TASKS = [1, 2, 3].map(n => ({ id: `T0${n}`, title: `Task ${n}`, model: 'sonnet', effort: 'medium', prompt: 'Do it.\nFiles to change: a.js\nVerify: node --test passes.' }))
const S = 'sess-res'
let dir, repo
const PLAN = () => path.join(dir, 'plan.md')
const RESULT = () => path.join(dir, 'plan.result.json')
const readResult = (file = RESULT()) => JSON.parse(fs.readFileSync(file, 'utf8'))
const doneEntry = id => ({ id, tier: 'sonnet-medium', commit: 'abc1234', attempts: 1 })
const runState = (over = {}) => ({
  ...runLib.startRun({ tasks: TASKS, tasksFile: path.join(dir, 'plan.tasks.json'), planFile: PLAN(), branch: 'main', planId: 'feedfacecafebeef' }),
  cwd: repo,
  ...over,
})

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-result-hooks-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(dir, 'data')
  state.activate(S)
  repo = makeRepo(path.join(dir, 'repo'))
})
afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA
  fs.rmSync(dir, { recursive: true, force: true })
})

test('H5 stop writes the complete result once', () => {
  state.write(S, runState({ phase: 'complete', done: TASKS.map(t => doneEntry(t.id)) }))
  hook('h5-guard.js', { session_id: S, cwd: repo }, ['stop'])
  const r = readResult()
  assert.equal(r.version, 1)
  assert.equal(r.sessionId, S)
  assert.equal(r.outcome, 'complete')
  assert.equal(r.planFile, PLAN())
  assert.equal(r.tasksFile, path.join(dir, 'plan.tasks.json'))
  assert.deepEqual(r.tasksDone, ['T01', 'T02', 'T03'])
  assert.deepEqual(r.tasksNotRun, [])
  assert.equal(r.haltedAt, null)
  assert.equal(r.reason, null)
  assert.equal(r.limit, null)
  assert.equal(r.headCommit, gitIn(repo, 'rev-parse', 'HEAD'))
  assert.ok(!Number.isNaN(Date.parse(r.endedAt)))
  assert.deepEqual(Object.keys(r), result.FIELDS)
  assert.equal(state.read(S).resultWritten, true)
  fs.rmSync(RESULT())
  hook('h5-guard.js', { session_id: S, cwd: repo }, ['stop'])
  assert.equal(fs.existsSync(RESULT()), false)
})

test('H5 stop writes a halted result', () => {
  state.write(S, runState({ phase: 'halted', done: [doneEntry('T01')], halt: { task: 'T02', tried: ['sonnet-medium'], reason: 'boom' } }))
  hook('h5-guard.js', { session_id: S, cwd: repo }, ['stop'])
  const r = readResult()
  assert.equal(r.outcome, 'halted')
  assert.equal(r.reason, 'boom')
  assert.equal(r.haltedAt, 'T02')
  assert.deepEqual(r.tasksDone, ['T01'])
  assert.deepEqual(r.tasksNotRun, ['T02', 'T03'])
})

test('H5 stop writes a halted result for an abandoned run', () => {
  state.write(S, runState())
  hook('h5-guard.js', { session_id: S, cwd: repo, stop_hook_active: true }, ['stop'])
  const r = readResult()
  assert.equal(r.outcome, 'halted')
  assert.equal(r.reason, result.REASONS.abandoned)
  assert.equal(r.haltedAt, 'T01')
  assert.deepEqual(r.tasksDone, [])
  assert.deepEqual(r.tasksNotRun, ['T01', 'T02', 'T03'])
  const s = state.read(S)
  assert.equal(s.phase, 'abandoned')
  assert.equal(s.resultWritten, true)
})
