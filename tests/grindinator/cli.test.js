// Tests for the command line (tools/grindinator/bin/grindinator), run as a real process.
'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

const helpers = require('./helpers.js')
const { HELP } = require('../../tools/grindinator/lib/cli.js')
const state = require('../../tools/grindinator/lib/state.js')

const BIN = path.resolve(__dirname, '../../tools/grindinator/bin/grindinator')

let repo, home, stubDir

beforeEach(() => {
  repo = fs.realpathSync.native(helpers.makeRepo())
  home = helpers.tempDir('grind-home-')
  stubDir = helpers.tempDir('grind-stub-')
  helpers.writePackages(path.join(repo, 'wp'), ['WP-01 · One.md', 'WP-02 · Two.md'])
  helpers.git(repo, 'add', '-A')
  helpers.git(repo, 'commit', '-q', '-m', 'packages')
})

afterEach(() => {
  helpers.remove(repo)
  helpers.remove(home)
  helpers.remove(stubDir)
})

const grind = (...args) =>
  spawnSync(process.execPath, [BIN, ...args], {
    cwd: repo,
    env: { ...helpers.stubEnv(stubDir, helpers.completeScenario()), HOME: home, USERPROFILE: home },
    encoding: 'utf8',
  })

test('help text and unknown commands', () => {
  for (const arg of ['--help', 'help']) {
    const r = grind(arg)
    assert.equal(r.status, 0)
    assert.equal(r.stdout, HELP)
  }
  const none = grind()
  assert.equal(none.status, 2)
  assert.equal(none.stderr, HELP)
  const bad = grind('frob')
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /frob/)
})

test('argument errors exit 2', () => {
  const bogus = grind('run', 'wp', '--bogus')
  assert.equal(bogus.status, 2)
  assert.match(bogus.stderr, /bogus/)
  assert.equal(grind('run').status, 2)
  const turns = grind('run', 'wp', '--max-turns', 'abc')
  assert.equal(turns.status, 2)
  assert.match(turns.stderr, /--max-turns/)
  assert.match(turns.stderr, /"maxTurns"/)
})

test('an invalid config file exits 2', () => {
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(home, '.claude', 'grindinator.json'), JSON.stringify({ effort: 'huge' }))
  const r = grind('run', 'wp', '--name', 't')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /"effort"/)
})

test('an untracked file exits 2', () => {
  fs.writeFileSync(path.join(repo, 'stray.txt'), 'x\n')
  const r = grind('run', 'wp', '--name', 't')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /uncommitted changes/)
})

test('run, status and reset', () => {
  const r = grind('run', 'wp', '--name', 't')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(helpers.git(repo, 'branch', '--show-current'), 'grindinator/t')
  const s = grind('status')
  assert.equal(s.status, 0, s.stderr)
  const lines = s.stdout.split('\n')
  assert.ok(lines.some(l => l.startsWith('WP-01')))
  assert.ok(lines.some(l => l.startsWith('WP-02')))
  assert.equal(grind('reset', 'WP-01').status, 0)
  assert.equal(grind('reset').status, 2)
})

test('SIGINT exits 4 and keeps the state', { skip: process.platform === 'win32' }, async () => {
  const env = {
    ...helpers.stubEnv(stubDir, { stream: [helpers.INIT], delayMs: 30000 }),
    HOME: home,
    USERPROFILE: home
  }
  const child = spawn(process.execPath, [BIN, 'run', 'wp', '--name', 't'], { cwd: repo, env, stdio: 'ignore' })
  const exited = new Promise(resolve => child.on('close', code => resolve(code)))
  const streamFile = path.join(repo, '.grindinator', 'runs', 'WP-01', 'attempt-1', 'stream.jsonl')
  await helpers.waitFor(() => fs.readFileSync(streamFile, 'utf8').includes('init'))
  child.kill('SIGINT')
  assert.equal(await exited, 4)
  assert.equal(state.read(repo).packages['WP-01'].status, 'pending')
})
