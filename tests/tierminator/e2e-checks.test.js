'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { scenarioChecks, helpers } = require('./e2e/checks.js')

const BASE = Date.parse('2026-01-01T00:00:00.000Z')
const at = (ms) => new Date(BASE + ms).toISOString()
const rec = (task, endMs, durationMs, extra = {}) => ({
  kind: 'attempt',
  task,
  tier: 'sonnet-medium',
  attempt: 1,
  outcome: 'done',
  agentId: `a-${task}`,
  durationMs,
  at: at(endMs),
  ...extra
})
const commit = (id) => ({ subject: `Task ${id}`, body: `Tierminator-Task: ${id}\nTierminator-Plan: abc123` })

function facts(telemetry) {
  return {
    runs: [{ exit: 0, timedOut: false, durationMs: 60000 }],
    results: [{ outcome: 'complete', tasksDone: ['T01', 'T02', 'T03'], tasksNotRun: [] }],
    snapshots: [{ commits: [], branches: [], worktrees: [] }],
    final: {
      commits: [commit('T01'), commit('T02'), commit('T03')],
      merges: 0,
      branch: 'main',
      status: '',
      branches: [],
      worktrees: ['/repo'],
      files: { 'src/registry.js': '' }
    },
    telemetry,
    observed: { permissionLine: '', allAnswerable: true }
  }
}

const parallel = () => [rec('T01', 10000, 10000), rec('T02', 10500, 10000), rec('T03', 11000, 10000)]
const serial = () => [rec('T01', 10000, 10000), rec('T02', 20000, 10000), rec('T03', 30000, 10000)]
const retried = () => [
  rec('T01', 5000, 5000, { outcome: 'retry', tier: 'sonnet-medium' }),
  rec('T01', 20000, 12000, { outcome: 'done', tier: 'sonnet-high', attempt: 2 }),
  rec('T02', 9000, 8000),
  rec('T03', 10000, 8000)
]

const failing = (list) => list.filter((c) => !c.ok).map((c) => c.name)
const named = (list, name) => list.find((c) => c.name === name)

test('helpers: taskIds, attempts, span, overlap', () => {
  assert.deepEqual(helpers.taskIds([commit('T02'), { subject: 'x', body: '' }, commit('T01')]), ['T02', 'T01'])
  const t = [rec('T01', 9000, 1000, { outcome: 'retry' }), rec('T01', 3000, 1000), rec('T02', 1000, 1000)]
  assert.deepEqual(helpers.attempts(t, 'T01').map((r) => r.outcome), ['done', 'retry'])
  assert.deepEqual(helpers.span(rec('T01', 5000, 2000)), { start: BASE + 3000, end: BASE + 5000 })
  assert.equal(helpers.overlap([{ start: 0, end: 10 }, { start: 5, end: 15 }]), true)
  assert.equal(helpers.overlap([{ start: 0, end: 5 }, { start: 5, end: 15 }]), false)
})

test('scenario 1 passes on a parallel run', () => {
  const out = scenarioChecks(1, facts(parallel()))
  assert.deepEqual(failing(out), [])
  assert.ok(named(out, 'about the slowest').detail.includes('s'))
})

test('scenario 1 fails when the spans do not overlap', () => {
  assert.deepEqual(failing(scenarioChecks(1, facts(serial()))), ['ran at once', 'about the slowest'])
})

test('scenario 3 passes on a retried run', () => {
  assert.deepEqual(failing(scenarioChecks(3, facts(retried()))), [])
})

test('scenario 3 fails when the first attempt is done', () => {
  const t = retried()
  t[0].outcome = 'done'
  assert.ok(failing(scenarioChecks(3, facts(t))).includes('T01 retried in place'))
})

test('scenario 6 passes on a serial run', () => {
  assert.deepEqual(failing(scenarioChecks(6, facts(serial()))), [])
})

test('scenario 6 fails when the spans overlap', () => {
  assert.deepEqual(failing(scenarioChecks(6, facts(parallel()))), ['ran one at a time'])
})

test('scenario 8 passes, and reports overlap without failing on it', () => {
  assert.deepEqual(failing(scenarioChecks(8, facts(parallel()))), [])
  const out = scenarioChecks(8, facts(serial()))
  assert.deepEqual(failing(out), [])
  assert.equal(named(out, 'ran at once').detail, 'no')
  assert.equal(named(scenarioChecks(8, facts(parallel())), 'ran at once').detail, 'yes')
})

test('scenario 8 fails with only two done attempts', () => {
  assert.deepEqual(failing(scenarioChecks(8, facts(parallel().slice(0, 2)))), ['three done attempts'])
})

test('scenarioChecks throws on an unknown scenario', () => {
  assert.throws(() => scenarioChecks(99, {}), /unknown scenario/)
})
