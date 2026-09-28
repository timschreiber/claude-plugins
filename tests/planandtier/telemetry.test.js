'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const t = require('../../plugins/planandtier/scripts/lib/telemetry.js')
const { AS_OF } = require('../../plugins/planandtier/scripts/lib/prices.js')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planandtier-telemetry-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(dir, 'data')
})
afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA
  fs.rmSync(dir, { recursive: true, force: true })
})

test('the telemetry file sits beside the plan, or beside the session state without one', () => {
  assert.equal(t.fileFor(path.join(dir, 'brave-fox.md'), 's1'), path.join(dir, 'brave-fox.telemetry.jsonl'))
  assert.equal(t.fileFor(null, 's1'), path.join(dir, 'data', 'sessions', 's1.telemetry.jsonl'))
  assert.equal(t.fileFor(null, ''), null)
})

test('append writes one JSON line per record, with its time and price date, and read returns them', () => {
  const file = path.join(dir, 'p.telemetry.jsonl')
  const r = t.append(file, { kind: 'attempt', task: 'T01' })
  assert.equal(r.priceAsOf, AS_OF)
  assert.ok(!Number.isNaN(Date.parse(r.at)))
  t.append(file, { kind: 'planning' })
  fs.appendFileSync(file, '{broken\n')
  assert.deepEqual(t.read(file).map(x => x.kind), ['attempt', 'planning'])
  assert.deepEqual(t.read(path.join(dir, 'none.jsonl')), [])
  assert.equal(t.append(null, {}), null)
  assert.equal(t.append(path.join(dir, 'blocker', 'x.jsonl'), {}) === null, false, 'creates the directory')
})

test('amounts and token counts are formatted for a glance', () => {
  assert.equal(t.fmtUsd(0.3149), '~$0.31')
  assert.equal(t.fmtUsd(0.001), '<$0.01')
  assert.equal(t.fmtUsd(0), '~$0.00')
  assert.equal(t.fmtUsd(null), 'cost unknown')
  assert.equal(t.fmtUsd(1.2, ['claude-x']), '~$1.20 + unpriced claude-x')
  assert.equal(t.fmtTokens(412345), '412k tokens')
  assert.equal(t.fmtTokens(1234567), '1.2M tokens')
  assert.equal(t.fmtTokens(12), '12 tokens')
  assert.equal(t.fmtTokens(null), '? tokens')
})

const usage = (costUsd, total = 100000, cacheRead = 90000) => ({
  tokens: { input: 10, output: 1000, cacheWrite5m: total - cacheRead - 1010, cacheWrite1h: 0, cacheRead },
  total,
  messages: 5,
  costUsd,
  unpriced: [],
  models: ['claude-sonnet-5'],
})

test('the attempt line names the task, tier, outcome, tokens, cost and the run so far', () => {
  const line = t.attemptLine({ task: 'T02', tier: 'sonnet-medium', outcome: 'done', ...usage(0.31, 412000, 395520) }, 0.52)
  assert.equal(line, 'planandtier: T02 on sonnet-medium done: 412k tokens (96% cache reads), ~$0.31. Run so far: ~$0.52.')
  const failed = t.attemptLine({ task: 'T01', tier: 'sonnet-low', outcome: 'retry', ...usage(0.05) }, 0.05)
  assert.match(failed, /T01 on sonnet-low failed, retrying a tier up: 100k tokens/)
  const unread = t.attemptLine({ task: 'T01', tier: 'sonnet-low', outcome: 'halt', tokens: null, total: null, costUsd: null, unpriced: [] }, 0)
  assert.match(unread, /failed, run stopped: usage unavailable\. Run so far: ~\$0\.00\./)
})

test('the summary has planning from every session, this run by tier in ladder order, orchestration and a total', () => {
  const records = [
    { kind: 'planning', at: '2026-09-28T10:00:00Z', planId: 'P', sessionId: 'old', subagents: 2, ...usage(0.3), models: ['claude-opus-5-5'] },
    { kind: 'planning', at: '2026-09-28T11:00:00Z', planId: 'P', sessionId: 'new', subagents: 1, ...usage(0.1), models: ['claude-opus-5-5'] },
    { kind: 'planning', at: '2026-09-28T09:00:00Z', planId: 'OTHER', sessionId: 'elsewhere', ...usage(9) },
    { kind: 'attempt', runId: 'r2', task: 'T02', tier: 'opus-high', outcome: 'done', ...usage(0.61) },
    { kind: 'attempt', runId: 'r2', task: 'T01', tier: 'sonnet-low', outcome: 'retry', ...usage(0.02) },
    { kind: 'attempt', runId: 'r2', task: 'T01', tier: 'sonnet-medium', outcome: 'done', ...usage(0.03) },
    { kind: 'attempt', runId: 'r1', task: 'T01', tier: 'sonnet-low', outcome: 'done', ...usage(5) },
    { kind: 'orchestration', runId: 'r2', ...usage(0.2) },
  ]
  const text = t.summary(records, { planId: 'P', runId: 'r2' })
  const lines = text.split('\n')
  assert.equal(lines[0], `planandtier spend (estimated, prices as of ${AS_OF}):`)
  assert.deepEqual(
    lines.slice(1).map(l => l.trim().split(/\s+/)[0]),
    ['planning', 'sonnet-low', 'sonnet-medium', 'opus-high', 'orchestration', 'total']
  )
  assert.match(text, /planning\s+~\$0\.40\s+claude-opus-5-5, 3 subagents/)
  assert.match(text, /sonnet-low\s+~\$0\.02\s+1 attempt \(1 failed\), 100k tokens/)
  assert.match(text, /opus-high\s+~\$0\.61\s+1 attempt, 100k tokens/)
  assert.match(text, /total\s+~\$1\.26$/)
})

test('planning includes rounds rejected in the dialog, and planning from another session, but not an earlier plan', () => {
  const plan = (at, sessionId, planId, costUsd) => ({ kind: 'planning', at, sessionId, planId, ...usage(costUsd) })
  const start = (at, sessionId, planId, runId) => ({ kind: 'run', at, sessionId, planId, runId })
  const records = [
    // Session A: plan X planned and run, then plan Y planned twice (rejected once, new id), then run.
    plan('2026-09-28T10:00:00Z', 'A', 'X', 1),
    start('2026-09-28T10:05:00Z', 'A', 'X', 'rx'),
    plan('2026-09-28T11:00:00Z', 'A', 'Y1', 0.26),
    plan('2026-09-28T11:02:00Z', 'A', 'Y2', 0.02),
    start('2026-09-28T11:03:00Z', 'A', 'Y2', 'ry'),
    // Session B planned Z twice and left; session C runs Z with execute-plan.
    plan('2026-09-28T12:00:00Z', 'B', 'Z1', 0.5),
    plan('2026-09-28T12:05:00Z', 'B', 'Z2', 0.1),
    start('2026-09-28T13:00:00Z', 'C', 'Z2', 'rz'),
    plan('2026-09-28T14:00:00Z', 'A', 'W', 7), // later planning in A belongs to a later plan
  ]
  const costs = (planId, runId) => t.planningFor(records, { planId, runId }).map(r => r.costUsd)
  assert.deepEqual(costs('Y2', 'ry'), [0.26, 0.02], 'the rejected round counts; plan X and plan W do not')
  assert.deepEqual(costs('X', 'rx'), [1])
  assert.deepEqual(costs('Z2', 'rz'), [0.5, 0.1], 'both rounds from the session that planned it')
  assert.deepEqual(costs('Z2', 'unknown-run'), [0.5, 0.1], 'without a run record, the plan id still anchors')
  assert.match(t.summary(records, { planId: 'Y2', runId: 'ry' }), /planning\s+~\$0\.28/)
})

test('a summary without planning records or orchestration still totals what it has', () => {
  const text = t.summary([{ kind: 'attempt', runId: 'r', task: 'T01', tier: 'sonnet-low', outcome: 'done', ...usage(0.05) }], { planId: 'P', runId: 'r' })
  assert.ok(!text.includes('planning'))
  assert.match(text, /total\s+~\$0\.05/)
})
