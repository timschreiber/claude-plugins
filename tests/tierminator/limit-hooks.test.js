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
const S = 'sess-limit'
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-limit-hooks-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(dir, 'data')
  state.activate(S)
  repo = makeRepo(path.join(dir, 'repo'))
})
afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA
  fs.rmSync(dir, { recursive: true, force: true })
})

const fx = require('./fixtures/stop-failure.js')
const TRANSCRIPT = () => path.join(dir, 'transcript.jsonl')
const SESSION_RESULT = () => path.join(dir, 'data', 'sessions', `${S}.result.json`)
const payload = (kind, over = {}) => { fs.writeFileSync(TRANSCRIPT(), fx.transcript(kind)); return { ...fx.PAYLOADS[kind], session_id: S, cwd: repo, transcript_path: TRANSCRIPT(), ...over } }
const h7 = (input, env = {}) => hook('h7-limit.js', input, [], env)
const h6 = () => hook('h6-cleanup.js', { session_id: S, cwd: repo, hook_event_name: 'SessionEnd' }, ['end'])
const midRun = (over = {}) => runState({ done: [doneEntry('T01')], current: { ...runState().current, index: 1 }, ...over })

test('a usage limit during a run writes a limit result with the reset time', () => {
  state.write(S, midRun())
  const input = payload('oauth')
  const r = h7(input)
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
  const res = readResult()
  assert.deepEqual(Object.keys(res), result.FIELDS)
  assert.equal(res.outcome, 'limit')
  assert.equal(res.reason, result.REASONS.limit)
  assert.equal(res.haltedAt, 'T02')
  assert.deepEqual(res.tasksDone, ['T01'])
  assert.deepEqual(res.tasksNotRun, ['T02', 'T03'])
  assert.equal(res.planFile, PLAN())
  assert.equal(res.tasksFile, path.join(dir, 'plan.tasks.json'))
  assert.deepEqual(Object.keys(res.limit), ['detectedAt', 'resetsAt', 'raw'])
  assert.equal(res.limit.resetsAt, fx.RESET_OAUTH)
  assert.notEqual(Date.parse(res.limit.detectedAt), NaN)
  assert.deepEqual(res.limit.raw, input)
  const s = state.read(S)
  assert.equal(s.resultWritten, true)
  assert.equal(s.phase, 'running')
})

test('an API-key limit has no reset time', () => {
  state.write(S, midRun())
  h7(payload('apikey'))
  const res = readResult()
  assert.equal(res.outcome, 'limit')
  assert.equal(res.limit.resetsAt, null)
})

test('a missing transcript gives a null reset time', () => {
  state.write(S, midRun())
  h7({ ...payload('oauth'), transcript_path: path.join(dir, 'none.jsonl') })
  const res = readResult()
  assert.equal(res.outcome, 'limit')
  assert.equal(res.limit.resetsAt, null)
})

test('another API error writes halted, not limit', () => {
  state.write(S, midRun())
  h7(payload('error'))
  const res = readResult()
  assert.equal(res.outcome, 'halted')
  assert.equal(res.reason, 'an API error ended the session: API Error: 400 probe: invalid request')
  assert.equal(res.limit, null)
  assert.equal(res.haltedAt, 'T02')
  assert.equal(state.read(S).resultWritten, true)
})

test('an inactive session writes nothing', () => {
  state.deactivate(S)
  state.write(S, midRun())
  for (const kind of ['oauth', 'apikey', 'error']) {
    const r = h7(payload(kind))
    assert.equal(r.status, 0)
    assert.equal(r.stdout, '')
    assert.equal(fs.existsSync(RESULT()), false)
    assert.equal(fs.existsSync(SESSION_RESULT()), false)
    assert.equal(state.read(S).resultWritten, undefined)
  }
})

test("a subagent's StopFailure is ignored", () => {
  state.write(S, midRun())
  h7(payload('oauth', { agent_id: 'a1' }))
  assert.equal(fs.existsSync(RESULT()), false)
})

test('TIERMINATOR_RESULT_FILE overrides the path', () => {
  state.write(S, midRun())
  const out = path.join(dir, 'out', 'r.json')
  h7(payload('oauth'), { TIERMINATOR_RESULT_FILE: out })
  assert.equal(readResult(out).outcome, 'limit')
  assert.equal(fs.existsSync(RESULT()), false)
})
