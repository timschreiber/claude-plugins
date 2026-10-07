// Tests for the run command's Decidinator decision files (tools/grindinator/lib/run.js, lib/decisions.js).
'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const helpers = require('./helpers.js')
const { run } = require('../../tools/grindinator/lib/run.js')
const state = require('../../tools/grindinator/lib/state.js')
const { GrindinatorError } = require('../../tools/grindinator/lib/errors.js')

const NAMES = ['WP-01 · One.md', 'WP-02 · Two.md', 'WP-03 · Three.md']

let repo, home, stubDir, outLines, errLines

beforeEach(() => {
  repo = fs.realpathSync.native(helpers.makeRepo())
  home = helpers.tempDir('grind-home-')
  stubDir = helpers.tempDir('grind-stub-')
  helpers.writePackages(path.join(repo, 'wp'), NAMES)
  helpers.git(repo, 'add', '-A')
  helpers.git(repo, 'commit', '-q', '-m', 'packages')
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

const work = name => path.join(repo, '.grindinator', 'decisions', name)

function commitFile(rel, text) {
  const file = path.join(repo, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  helpers.git(repo, 'add', '-A')
  helpers.git(repo, 'commit', '-q', '-m', `add ${rel}`)
}

const subjects = () => helpers.git(repo, 'log', '--format=%s').split('\n')
const scenario = extra => ({ ...helpers.completeScenario(), ...extra })
const envFor = sc => helpers.stubEnv(stubDir, sc)

const HALTED = helpers.resultRecord({ outcome: 'halted', haltedAt: 'T01', reason: 'T01 failed' })
const SQ = helpers.sidecarText([{ id: 'Q-0001', topic: 'First' }])

test('sessions get the decision file variables', async () => {
  assert.equal(await go(), 0)
  const log = helpers.readStubLog(stubDir)
  assert.equal(log.length, 3)
  for (const entry of log) {
    assert.equal(entry.env.DECIDINATOR_MODE, 'sidecar')
    assert.match(entry.env.DECIDINATOR_CONTEXT, /^WP-0[123]$/)
    assert.ok(path.isAbsolute(entry.env.DECIDINATOR_LOG))
    assert.ok(entry.env.DECIDINATOR_LOG.endsWith(path.join('.grindinator', 'decisions', 'decisions.md')))
    assert.ok(path.isAbsolute(entry.env.DECIDINATOR_SIDECAR))
    assert.ok(entry.env.DECIDINATOR_SIDECAR.endsWith(path.join('.grindinator', 'decisions', 'open-questions.md')))
  }
  assert.deepEqual(log.map(e => e.env.DECIDINATOR_CONTEXT), ['WP-01', 'WP-02', 'WP-03'])
})

test('the run copies are seeded from the repo paths', async () => {
  const logText = helpers.logText('seed')
  const sidecar = helpers.sidecarText([{ id: 'Q-0001', topic: 'First', status: 'answered' }])
  commitFile('docs/decisions.md', logText)
  commitFile('docs/open-questions.md', sidecar)
  assert.equal(await go(), 0)
  assert.equal(fs.readFileSync(work('decisions.md'), 'utf8'), logText)
  assert.equal(fs.readFileSync(work('open-questions.md'), 'utf8'), sidecar)
  assert.ok(outLines.includes('Seeded .grindinator/decisions/ from docs/decisions.md.'))
  assert.ok(outLines.includes('Seeded .grindinator/decisions/ from docs/open-questions.md.'))
  assert.equal(subjects().some(s => s.startsWith('chore(grindinator)')), false)
})

test('seeding follows .claude/decidinator.json', async () => {
  commitFile('.claude/decidinator.json', JSON.stringify({ decisionLog: 'notes/log.md', sidecar: 'notes/q.md' }))
  const logText = helpers.logText('configured')
  commitFile('notes/log.md', logText)
  assert.equal(await go(), 0)
  assert.equal(fs.readFileSync(work('decisions.md'), 'utf8'), logText)
  assert.equal(fs.existsSync(work('open-questions.md')), false)
})

test('seeding is skipped when the repo paths do not exist', async () => {
  assert.equal(await go(), 0)
  assert.equal(fs.existsSync(work('decisions.md')), false)
  assert.equal(fs.existsSync(work('open-questions.md')), false)
  assert.deepEqual(state.read(repo).decisions, {
    log: { repo: 'docs/decisions.md', hash: null },
    sidecar: { repo: 'docs/open-questions.md', hash: null }
  })
})

test('the repo paths are untouched until a package completes', async () => {
  assert.equal(await go({ env: envFor(scenario({ resultFile: HALTED, sidecar: SQ })) }), 1)
  assert.equal(fs.existsSync(path.join(repo, 'docs', 'open-questions.md')), false)
  assert.ok(fs.readFileSync(work('open-questions.md'), 'utf8').includes('Q-0001'))
  assert.equal(helpers.git(repo, 'status', '--porcelain'), '')

  assert.equal(await go({ env: envFor(scenario({ sidecar: SQ })) }), 0)
  assert.equal(
    fs.readFileSync(path.join(repo, 'docs', 'open-questions.md'), 'utf8'),
    fs.readFileSync(work('open-questions.md'), 'utf8')
  )
  assert.ok(subjects().includes('chore(grindinator): decisions for WP-01'))
})

test('decision files are committed in their own commit', async () => {
  assert.equal(await go({ env: envFor(scenario({ decisionLog: helpers.logText('a'), sidecar: SQ })) }), 0)
  assert.deepEqual(subjects(), [
    'stub commit WP-03',
    'stub commit WP-02',
    'chore(grindinator): decisions for WP-01',
    'stub commit WP-01',
    'packages',
    'init'
  ])
  const files = helpers.git(repo, 'show', '--name-only', '--format=', 'HEAD~2').split('\n').filter(Boolean).sort()
  assert.deepEqual(files, ['docs/decisions.md', 'docs/open-questions.md'])
  const st = state.read(repo)
  assert.equal(st.packages['WP-01'].attempts[0].decisions.status, 'committed')
  assert.equal(st.packages['WP-02'].attempts[0].decisions.status, 'unchanged')
})

test('an unrelated dirty file fails the package', async () => {
  assert.equal(await go({ env: envFor(scenario({ untracked: 'stray.txt', sidecar: SQ })) }), 1)
  const attempt = state.read(repo).packages['WP-01'].attempts[0]
  assert.equal(attempt.outcome, 'unverified')
  assert.match(attempt.reason, /uncommitted changes \(stray\.txt\)/)
  assert.equal(fs.existsSync(path.join(repo, 'docs', 'open-questions.md')), false)
  assert.match(errLines[errLines.length - 1], /WP-01 was not verified/)
})

test('a repo decision file changed between runs stops the next start', async () => {
  assert.equal(await go({ env: envFor(scenario({ resultFile: HALTED, sidecar: SQ })) }), 1)
  commitFile('docs/open-questions.md', 'changed\n')
  await assert.rejects(go(), e => {
    assert.ok(e instanceof GrindinatorError)
    assert.equal(e.exitCode, 2)
    assert.match(e.message, /docs\/open-questions\.md changed since Grindinator last copied it/)
    return true
  })
  assert.equal(helpers.readStubLog(stubDir).length, 1)
})
