'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PLUGIN = path.join(__dirname, '..', '..', 'plugins', 'tierminator')
const state = require(path.join(PLUGIN, 'scripts', 'lib', 'state.js'))
const result = require(path.join(PLUGIN, 'scripts', 'lib', 'result.js'))

const S = 'sess-unit'
let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-result-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(dir, 'data')
  delete process.env.TIERMINATOR_RESULT_FILE
  state.activate(S)
})
afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA
  delete process.env.TIERMINATOR_RESULT_FILE
  fs.rmSync(dir, { recursive: true, force: true })
})

test('schema: version, fields, outcomes and record key order', () => {
  assert.equal(result.VERSION, 1)
  assert.deepEqual(result.FIELDS, [
    'version', 'sessionId', 'outcome', 'planFile', 'tasksFile', 'tasksDone', 'tasksNotRun',
    'haltedAt', 'reason', 'limit', 'headCommit', 'endedAt',
  ])
  assert.deepEqual(result.OUTCOMES, ['complete', 'halted', 'limit', 'no-plan', 'declined'])
  assert.deepEqual(Object.keys(result.record({ sessionId: S, outcome: 'complete' })), result.FIELDS)
})

test('record with no state has null and empty defaults', () => {
  const now = new Date('2026-10-05T01:02:03.000Z')
  const r = result.record({ sessionId: S, outcome: 'halted', now })
  assert.equal(r.version, 1)
  assert.equal(r.sessionId, S)
  assert.equal(r.outcome, 'halted')
  for (const k of ['planFile', 'tasksFile', 'haltedAt', 'reason', 'limit', 'headCommit']) assert.equal(r[k], null)
  assert.deepEqual(r.tasksDone, [])
  assert.deepEqual(r.tasksNotRun, [])
  assert.equal(r.endedAt, '2026-10-05T01:02:03.000Z')
  const r2 = result.record({ sessionId: S, outcome: 'halted', planFile: 'p.md', reason: 'why', now })
  assert.equal(r2.planFile, 'p.md')
  assert.equal(r2.reason, 'why')
})

test('record from a state lists done and not-run tasks; an explicit planFile wins', () => {
  const s = { planFile: 'p.md', tasksFile: 't.json', tasks: [{ id: 'T01' }, { id: 'T02' }, { id: 'T03' }], done: [{ id: 'T01' }] }
  const r = result.record({ sessionId: S, s, outcome: 'halted' })
  assert.equal(r.planFile, 'p.md')
  assert.equal(r.tasksFile, 't.json')
  assert.deepEqual(r.tasksDone, ['T01'])
  assert.deepEqual(r.tasksNotRun, ['T02', 'T03'])
  assert.equal(result.record({ sessionId: S, s, outcome: 'halted', planFile: 'other.md' }).planFile, 'other.md')
})

test('pathFor: env override, plan-relative, session fallback', () => {
  const abs = path.join(dir, 'x.json')
  process.env.TIERMINATOR_RESULT_FILE = abs
  assert.equal(result.pathFor(S, null), abs)
  process.env.TIERMINATOR_RESULT_FILE = 'rel.json'
  assert.equal(result.pathFor(S, null), path.resolve('rel.json'))
  process.env.TIERMINATOR_RESULT_FILE = '   '
  assert.equal(result.pathFor(S, path.join(dir, 'plan.md')), path.join(dir, 'plan.result.json'))
  delete process.env.TIERMINATOR_RESULT_FILE
  assert.equal(result.pathFor(S, path.join(dir, 'plan.md')), path.join(dir, 'plan.result.json'))
  assert.equal(result.pathFor(S, path.join(dir, 'PLAN.MD')), path.join(dir, 'PLAN.result.json'))
  assert.equal(result.pathFor(S, null), path.join(dir, 'data', 'sessions', `${S}.result.json`))
  assert.equal(result.pathFor(null, null), null)
})

test('write: only for an active session, atomic, replaces', () => {
  const rec = result.record({ sessionId: S, outcome: 'complete' })
  const file = result.pathFor(S, null)
  state.deactivate(S)
  assert.equal(result.write(S, rec), false)
  assert.equal(fs.existsSync(file), false)

  state.activate(S)
  assert.equal(result.write(S, rec), true)
  const text = fs.readFileSync(file, 'utf8')
  assert.deepEqual(JSON.parse(text), rec)
  assert.ok(text.endsWith('\n'))
  assert.deepEqual(fs.readdirSync(path.dirname(file)).filter(f => f.endsWith('.tmp')), [])

  state.deactivate(S)
  fs.rmSync(file)
  assert.equal(result.write(S, rec, { allowInactive: true }), true)
  assert.ok(fs.existsSync(file))

  const rec2 = result.record({ sessionId: S, outcome: 'halted', reason: 'again' })
  assert.equal(result.write(S, rec2, { allowInactive: true }), true)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), rec2)
})

test('write failure returns false without throwing', () => {
  const blocker = path.join(dir, 'blocker')
  fs.writeFileSync(blocker, 'x')
  process.env.TIERMINATOR_RESULT_FILE = path.join(blocker, 'r.json')
  assert.equal(result.write(S, result.record({ sessionId: S, outcome: 'complete' })), false)
})
