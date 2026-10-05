// Tests for the run command's precondition flow (tools/grindinator/lib/run.js).
'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const helpers = require('./helpers.js')
const { run, defaultRunName, validRunName } = require('../../tools/grindinator/lib/run.js')
const state = require('../../tools/grindinator/lib/state.js')
const { GrindinatorError } = require('../../tools/grindinator/lib/errors.js')

const NAMES = ['WP-01 · One.md', 'WP-02 · Two.md', 'WP-03 · Three.md']
const WP07_LINE = 'Launching sessions is not built yet (WP-07); stopped after the precondition checks.'

let repo, home, outLines, errLines, initial

beforeEach(() => {
  repo = fs.realpathSync.native(helpers.makeRepo())
  home = helpers.tempDir('grind-home-')
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
})

const go = (extra = {}) =>
  run({
    cwd: repo,
    homeDir: home,
    packagesDir: 'wp',
    out: l => outLines.push(l),
    err: l => errLines.push(l),
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
  for (const p of Object.values(st.packages)) assert.equal(p.status, 'pending')
  const exclude = fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8')
  assert.ok(exclude.includes('/.grindinator/'))
  assert.equal(helpers.git(repo, 'status', '--porcelain'), '')
  assert.equal(outLines[outLines.length - 1], WP07_LINE)
})

test('without a name the branch comes from the directory and the time', async () => {
  await go({ now: () => new Date('2026-10-05T14:22:33Z') })
  assert.equal(branch(), 'grindinator/wp-20261005-142233')
})

test('a re-run skips done markers', async () => {
  await go()
  state.markDone(repo, 'WP-01')
  outLines.length = 0
  await go()
  assert.ok(outLines.includes('Packages: 3 (1 done, 2 to run).'))
  assert.ok(outLines.includes('To run: WP-02, WP-03.'))
  assert.equal(state.read(repo).packages['WP-01'].status, 'done')
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
