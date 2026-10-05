// Tests for the run command's precondition flow (tools/grindinator/lib/run.js).
'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { EventEmitter } = require('events')

const helpers = require('./helpers.js')
const { run, defaultRunName, validRunName } = require('../../tools/grindinator/lib/run.js')
const state = require('../../tools/grindinator/lib/state.js')
const { GrindinatorError } = require('../../tools/grindinator/lib/errors.js')

const NAMES = ['WP-01 · One.md', 'WP-02 · Two.md', 'WP-03 · Three.md']

let repo, home, stubDir, outLines, errLines, initial

beforeEach(() => {
  repo = fs.realpathSync.native(helpers.makeRepo())
  home = helpers.tempDir('grind-home-')
  stubDir = helpers.tempDir('grind-stub-')
  helpers.writePackages(path.join(repo, 'wp'), NAMES)
  helpers.git(repo, 'add', '-A')
  helpers.git(repo, 'commit', '-q', '-m', 'packages')
  initial = helpers.git(repo, 'rev-parse', 'HEAD')
  outLines = []
  errLines = []
})

afterEach(() => {
  helpers.remove(repo)
  helpers.remove(home)
  helpers.remove(stubDir)
})

const go = (extra = {}) =>
  run({
    cwd: repo,
    homeDir: home,
    packagesDir: 'wp',
    out: l => outLines.push(l),
    err: l => errLines.push(l),
    env: extra.env === undefined ? helpers.stubEnv(stubDir, helpers.completeScenario()) : extra.env,
    ...extra,
  })

const branch = () => helpers.git(repo, 'branch', '--show-current')
const grindBranches = () => helpers.git(repo, 'branch', '--list', 'grindinator/*').split('\n').filter(Boolean)

const rejects2 = (promise, pattern) =>
  assert.rejects(promise, e => {
    assert.ok(e instanceof GrindinatorError)
    assert.equal(e.exitCode, 2)
    assert.match(e.message, pattern)
    return true
  })

test('run names: default slug and validation', () => {
  assert.equal(defaultRunName('/x/My Packages', new Date('2026-10-05T14:22:33Z')), 'my-packages-20261005-142233')
  assert.equal(defaultRunName('/x/__', new Date('2026-10-05T14:22:33Z')), 'run-20261005-142233')
  assert.ok(validRunName('a'))
  assert.ok(validRunName('x.y_z-1'))
  for (const bad of ['', '-a', 'a..b', 'a.lock', 'a.', 'a b', 'a'.repeat(101)]) {
    assert.equal(validRunName(bad), false, JSON.stringify(bad))
  }
})

test('an untracked file is rejected before anything changes', async () => {
  fs.writeFileSync(path.join(repo, 'stray.txt'), 'x\n')
  await rejects2(go({ name: 'test' }), /uncommitted changes/)
  assert.equal(branch(), 'main')
  assert.equal(fs.existsSync(path.join(repo, '.grindinator', 'state.json')), false)
})

test('a named run creates the branch and state', async () => {
  assert.equal(await go({ name: 'test' }), 0)
  assert.equal(branch(), 'grindinator/test')
  const st = state.read(repo)
  assert.equal(st.runName, 'test')
  assert.equal(st.branch, 'grindinator/test')
  assert.equal(st.packagesDir, 'wp')
  assert.equal(st.baseCommit, initial)
  assert.deepEqual(Object.keys(st.packages), ['WP-01', 'WP-02', 'WP-03'])
  for (const p of Object.values(st.packages)) {
    assert.equal(p.status, 'done')
    assert.equal(p.attempts.length, 1)
    assert.equal(p.attempts[0].outcome, 'complete')
  }
  for (const id of ['WP-01', 'WP-02', 'WP-03']) assert.equal(state.isDone(repo, id), true)
  const exclude = fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8')
  assert.ok(exclude.includes('/.grindinator/'))
  assert.equal(helpers.git(repo, 'status', '--porcelain'), '')
  assert.equal(outLines[outLines.length - 1], 'Every package is done.')
})

test('without a name the branch comes from the directory and the time', async () => {
  await go({ now: () => new Date('2026-10-05T14:22:33Z') })
  assert.equal(branch(), 'grindinator/wp-20261005-142233')
})

test('a re-run skips done markers', async () => {
  state.markDone(repo, 'WP-01')
  await go()
  assert.ok(outLines.includes('Packages: 3 (1 done, 2 to run).'))
  assert.ok(outLines.includes('To run: WP-02, WP-03.'))
  assert.deepEqual(helpers.readStubLog(stubDir).map(e => e.env.DECIDINATOR_CONTEXT), ['WP-02', 'WP-03'])
  assert.equal(state.read(repo).packages['WP-01'].status, 'done')
  assert.equal(state.read(repo).packages['WP-01'].attempts.length, 0)
  assert.equal(grindBranches().length, 1)
})

test('a re-run switches back to the run branch', async () => {
  await go({ name: 'test' })
  helpers.git(repo, 'switch', 'main')
  outLines.length = 0
  await go()
  assert.ok(outLines.includes('Switched to grindinator/test.'))
  assert.equal(branch(), 'grindinator/test')
})

test('every package done', async () => {
  await go()
  for (const id of ['WP-01', 'WP-02', 'WP-03']) state.markDone(repo, id)
  outLines.length = 0
  assert.equal(await go(), 0)
  assert.ok(outLines.includes('Every package is done.'))
  assert.equal(helpers.readStubLog(stubDir).length, 3)
})

test('conflicting runs and bad names are rejected', async () => {
  await go({ name: 'test' })
  await rejects2(go({ name: 'other' }), /a run named test is in progress/)

  fs.rmSync(path.join(repo, '.grindinator'), { recursive: true, force: true })
  helpers.git(repo, 'switch', 'main')
  await rejects2(go({ name: 'test' }), /already exists/)

  await rejects2(go({ name: 'a b' }), /not a valid run name/)
  assert.deepEqual(grindBranches(), ['grindinator/test'])
})

test('an invalid committed configuration is rejected', async () => {
  fs.mkdirSync(path.join(repo, '.claude'))
  fs.writeFileSync(path.join(repo, '.claude', 'grindinator.json'), JSON.stringify({ effort: 'huge' }))
  helpers.git(repo, 'add', '-A')
  helpers.git(repo, 'commit', '-q', '-m', 'config')
  await rejects2(go({ name: 'test' }), /"effort"[\s\S]*grindinator\.json|grindinator\.json[\s\S]*"effort"/)
  assert.equal(branch(), 'main')
})

test('the session prompt is the preamble then the package', async () => {
  fs.writeFileSync(path.join(repo, 'pre.md'), 'Read CLAUDE.md first.\n')
  helpers.git(repo, 'add', '-A')
  helpers.git(repo, 'commit', '-q', '-m', 'preamble')
  await go({ flags: { preamble: 'pre.md' } })
  const log = helpers.readStubLog(stubDir)
  assert.equal(log[0].argv[0], '-p')
  assert.equal(log[0].argv[1], '/tierminator:plan Read CLAUDE.md first.\n\n# WP-01 · One.md\n')
})

test('a halted package stops the run with exit 1', async () => {
  const scenario = helpers.completeScenario()
  scenario.resultFile = helpers.resultRecord({ outcome: 'halted', haltedAt: 'T02', reason: 'T02 failed' })
  const env = helpers.stubEnv(stubDir, scenario)
  assert.equal(await go({ name: 'test', env }), 1)
  const st = state.read(repo)
  assert.equal(st.packages['WP-01'].status, 'failed')
  assert.equal(st.packages['WP-01'].attempts[0].haltedAt, 'T02')
  assert.equal(helpers.readStubLog(stubDir).length, 1)
  assert.match(errLines[errLines.length - 1], /WP-01 ended halted/)
  for (const id of ['WP-01', 'WP-02', 'WP-03']) assert.equal(state.isDone(repo, id), false)
})

test('a usage limit stops the run with exit 3', async () => {
  const scenario = {
    stream: [
      helpers.INIT,
      { type: 'result', subtype: 'success', is_error: true, api_error_status: 429, result: 'limit', session_id: 'stub-session' }
    ],
    exitCode: 1
  }
  const env = helpers.stubEnv(stubDir, scenario)
  assert.equal(await go({ name: 'test', env }), 3)
  const st = state.read(repo)
  assert.equal(st.packages['WP-01'].status, 'pending')
  assert.equal(st.packages['WP-01'].attempts[0].outcome, 'limit')
  assert.equal(st.packages['WP-01'].attempts[0].source, 'stream')
})

test('SIGINT ends the session, exits 4 and keeps the state', async () => {
  const signals = new EventEmitter()
  const env = helpers.stubEnv(stubDir, { stream: [helpers.INIT], delayMs: 30000 })
  const p = go({ name: 'test', signals, env })
  const streamFile = path.join(repo, '.grindinator', 'runs', 'WP-01', 'attempt-1', 'stream.jsonl')
  await helpers.waitFor(() => fs.readFileSync(streamFile, 'utf8').includes('init'))
  signals.emit('SIGINT')
  assert.equal(await p, 4)
  const st = state.read(repo)
  assert.equal(st.packages['WP-01'].status, 'pending')
  assert.equal(st.packages['WP-01'].attempts[0].outcome, 'interrupted')
  assert.ok(st.packages['WP-01'].attempts[0].endedAt)
  assert.equal(st.packages['WP-02'].attempts.length, 0)
  for (const id of ['WP-01', 'WP-02', 'WP-03']) assert.equal(state.isDone(repo, id), false)
  assert.equal(signals.listenerCount('SIGINT'), 0)
  assert.match(errLines[errLines.length - 1], /interrupted/)

  assert.equal(await go(), 0)
  const again = state.read(repo)
  assert.equal(again.packages['WP-01'].attempts.length, 2)
  assert.equal(again.packages['WP-01'].attempts[1].dir, 'runs/WP-01/attempt-2')
})
