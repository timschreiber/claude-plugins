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

const input = () => ({ session_id: S })
const read = () => JSON.parse(fs.readFileSync(path.join(dir, 'x.result.json'), 'utf8'))
const run = (over = {}) => ({
  phase: 'running', planFile: 'p.md', tasksFile: 't.json', tasks: [{ id: 'T01' }, { id: 'T02' }, { id: 'T03' }],
  current: { index: 1 }, done: [{ id: 'T01' }], ...over,
})
const fixed = () => { process.env.TIERMINATOR_RESULT_FILE = path.join(dir, 'x.result.json') }
const exists = () => fs.existsSync(path.join(dir, 'x.result.json'))

test('writeEnded: complete state', () => {
  fixed()
  const s = run({ phase: 'complete', done: [{ id: 'T01' }, { id: 'T02' }, { id: 'T03' }] })
  assert.equal(result.writeEnded(input(), s), true)
  const r = read()
  assert.equal(r.outcome, 'complete')
  assert.equal(r.reason, null)
  assert.equal(r.haltedAt, null)
  assert.deepEqual(r.tasksDone, ['T01', 'T02', 'T03'])
  assert.deepEqual(r.tasksNotRun, [])
  assert.equal(r.limit, null)
  assert.equal(r.version, 1)
  assert.equal(r.sessionId, S)
})

test('writeEnded: halted state, with and without a halt object', () => {
  fixed()
  const s = run({ phase: 'halted', halt: { task: 'T02', tried: ['sonnet-medium'], reason: 'boom' } })
  assert.equal(result.writeEnded(input(), s), true)
  let r = read()
  assert.equal(r.outcome, 'halted')
  assert.equal(r.reason, 'boom')
  assert.equal(r.haltedAt, 'T02')
  assert.deepEqual(r.tasksDone, ['T01'])
  assert.deepEqual(r.tasksNotRun, ['T02', 'T03'])

  assert.equal(result.writeEnded(input(), run({ phase: 'halted' })), true)
  r = read()
  assert.equal(r.reason, 'the run halted')
  assert.equal(r.haltedAt, 'T02')
})

test('writeEnded: abandoned with and without a run', () => {
  fixed()
  assert.equal(result.writeEnded(input(), run({ phase: 'abandoned' })), true)
  let r = read()
  assert.equal(r.outcome, 'halted')
  assert.equal(r.reason, result.REASONS.abandoned)
  assert.equal(r.haltedAt, 'T02')

  assert.equal(result.writeEnded(input(), { phase: 'abandoned', planFile: 'p.md' }), true)
  r = read()
  assert.equal(r.outcome, 'no-plan')
  assert.equal(r.reason, result.REASONS.noPlan)
  assert.equal(r.haltedAt, null)
  assert.deepEqual(r.tasksDone, [])
  assert.deepEqual(r.tasksNotRun, [])
})

test('writeEnded: running needs a reason', () => {
  fixed()
  assert.equal(result.writeEnded(input(), run(), result.REASONS.sessionEnded), true)
  const r = read()
  assert.equal(r.outcome, 'halted')
  assert.equal(r.reason, 'session ended during run')
  assert.equal(r.haltedAt, 'T02')
  fs.rmSync(path.join(dir, 'x.result.json'))
  assert.equal(result.writeEnded(input(), run()), false)
  assert.equal(exists(), false)
})

test('writeEnded: writes nothing for states that have not ended or were written', () => {
  fixed()
  const cases = [
    null,
    undefined,
    { phase: 'planning' },
    { phase: 'drafting' },
    run({ phase: 'complete', resultWritten: true }),
  ]
  for (const s of cases) {
    assert.equal(result.writeEnded(input(), s), false)
    assert.equal(exists(), false)
  }
  assert.equal(result.writeEnded(input(), run({ resultWritten: true }), 'why'), false)
  assert.equal(exists(), false)
})

test('writeOutcome: allowInactive writes beside the plan; without it nothing', () => {
  const plan = path.join(dir, 'plan.md')
  const file = path.join(dir, 'plan.result.json')
  state.deactivate(S)
  assert.equal(result.writeOutcome(input(), null, 'declined', 'why', { planFile: plan }), false)
  assert.equal(fs.existsSync(file), false)
  assert.equal(result.writeOutcome(input(), null, 'declined', 'why', { planFile: plan, allowInactive: true }), true)
  const r = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(r.outcome, 'declined')
  assert.equal(r.reason, 'why')
  assert.equal(r.planFile, plan)
  assert.equal(r.tasksFile, null)
  assert.deepEqual(r.tasksDone, [])
})

test('writeOutcome: a cwd that is not a repository leaves headCommit null', () => {
  fixed()
  assert.equal(result.writeOutcome({ session_id: S, cwd: dir }, null, 'declined', 'why'), true)
  assert.equal(read().headCommit, null)
})

test('reasonOf', () => {
  assert.equal(
    result.reasonOf('tierminator: the plan cannot run here: the working tree has uncommitted changes (docs/). Tell the user what to fix.'),
    'the plan cannot run here: the working tree has uncommitted changes (docs/)',
  )
  assert.equal(result.reasonOf('tierminator: just a note'), 'just a note')
  assert.equal(result.reasonOf(null), '')
  assert.equal(result.reasonOf('a'.repeat(500)).length, 300)
})

test('REASONS keys and sessionEnded text', () => {
  assert.deepEqual(Object.keys(result.REASONS), ['interrupted', 'lost', 'sessionEnded', 'abandoned', 'noPlan', 'limit', 'apiError'])
  assert.equal(result.REASONS.sessionEnded, 'session ended during run')
})

test('record carries a limit object, else null', () => {
  const L = { detectedAt: 'x', resetsAt: 5, raw: {} }
  assert.deepEqual(result.record({ sessionId: S, outcome: 'limit', limit: L }).limit, L)
  assert.equal(result.record({ sessionId: S, outcome: 'limit' }).limit, null)
})

test('writeOutcome: limit writes the limit object and reason', () => {
  const L = { detectedAt: 'x', resetsAt: 5, raw: {} }
  assert.equal(result.writeOutcome({ session_id: S }, null, 'limit', result.REASONS.limit, { limit: L }), true)
  const r = JSON.parse(fs.readFileSync(result.pathFor(S, null), 'utf8'))
  assert.deepEqual(r.limit, L)
  assert.equal(r.reason, 'a usage limit ended the session')
})

test('REASONS.apiError text', () => {
  assert.equal(result.REASONS.apiError, 'an API error ended the session')
})

test('limitRecorded', () => {
  const s = { planFile: path.join(dir, 'p.md'), approvedAt: '2026-10-05T00:00:00.000Z' }
  const file = path.join(dir, 'p.result.json')
  const put = o => fs.writeFileSync(file, typeof o === 'string' ? o : JSON.stringify(o))
  const ok = { outcome: 'limit', sessionId: S, endedAt: '2026-10-05T01:00:00.000Z' }
  put(ok)
  assert.equal(result.limitRecorded(S, s), true)
  put({ ...ok, sessionId: 'other' })
  assert.equal(result.limitRecorded(S, s), false)
  put({ ...ok, outcome: 'halted' })
  assert.equal(result.limitRecorded(S, s), false)
  put({ ...ok, endedAt: '2026-10-04T00:00:00.000Z' })
  assert.equal(result.limitRecorded(S, s), false)
  assert.equal(result.limitRecorded(S, { planFile: s.planFile }), true)
  fs.rmSync(file)
  assert.equal(result.limitRecorded(S, s), false)
  put('not json')
  assert.equal(result.limitRecorded(S, s), false)
})

test('writeEnded keeps a recorded limit, overwrites a file from another session', () => {
  const s = { planFile: path.join(dir, 'p.md'), approvedAt: '2026-10-05T00:00:00.000Z' }
  const file = path.join(dir, 'p.result.json')
  const st = { ...s, phase: 'running', tasks: [{ id: 'T01' }], current: { index: 0 }, done: [] }
  const lim = { outcome: 'limit', sessionId: S, endedAt: '2026-10-05T01:00:00.000Z' }
  fs.writeFileSync(file, JSON.stringify(lim))
  assert.equal(result.writeEnded({ session_id: S }, st, 'session ended during run'), false)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), lim)
  fs.writeFileSync(file, JSON.stringify({ ...lim, sessionId: 'other' }))
  assert.equal(result.writeEnded({ session_id: S }, st, 'session ended during run'), true)
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).outcome, 'halted')
})
