// Tests for lib/limit.js: reset resolution, wait decisions and the sleep loop.
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { fakeClock, INIT, tempDir, remove } = require('./helpers')
const { parseStream } = require('../../tools/grindinator/lib/stream')
const { resolveReset, decide, realClock, sleepUntil, plansDir, findSessionPlan, recoveryPhase } = require('../../tools/grindinator/lib/limit')

const R = 1791179511
const now = (R - 3600) * 1000
const config = { maxLimitWaits: 3, waitWeekly: false }
const lines = records => records.map(r => JSON.stringify(r)).join('\n')
const startIso = new Date(now).toISOString()

test('result file comes first', () => {
  const r = resolveReset({ limit: { resetsAt: R }, streamResetsAt: R + 100 }, now)
  assert.deepEqual(r, { source: 'result-file', resetsAtMs: R * 1000, wakeAtMs: R * 1000 + 300000 })
})

test('stream source', () => {
  const s = parseStream(lines([
    INIT,
    { type: 'rate_limit_event', rate_limit_info: { resetsAt: R - 18000, status: 'allowed' } },
    { type: 'rate_limit_event', rate_limit_info: { resetsAt: R, status: 'rejected' } },
    { type: 'result', is_error: true, api_error_status: 429 }
  ]))
  assert.equal(s.rateLimitResetsAt, R)
  assert.equal(resolveReset({ limit: { resetsAt: null }, streamResetsAt: R }, now).source, 'stream')
})

test('API-key fallback', () => {
  const s = parseStream(lines([
    { ...INIT, apiKeySource: 'ANTHROPIC_API_KEY' },
    {
      type: 'result', is_error: true, api_error_status: 429,
      result: 'API Error: Request rejected (429) · This request would exceed your account rate limit. Please try again later.'
    }
  ]))
  assert.equal(s.rateLimitResetsAt, null)
  assert.deepEqual(resolveReset({ limit: null, streamResetsAt: null }, now), {
    source: 'fallback', resetsAtMs: null, wakeAtMs: now + 18300000
  })
})

test('stale resets are skipped', () => {
  assert.equal(resolveReset({ limit: { resetsAt: now / 1000 - 60 }, streamResetsAt: R }, now).source, 'stream')
  assert.equal(resolveReset({ limit: { resetsAt: now / 1000 }, streamResetsAt: R }, now).source, 'stream')
  assert.equal(resolveReset({ limit: { resetsAt: now / 1000 - 60 }, streamResetsAt: now / 1000 }, now).source, 'fallback')
})

test('sleepUntil reaches reset plus grace in chunks', async () => {
  const clock = fakeClock(startIso)
  const wake = R * 1000 + 300000
  assert.equal(await sleepUntil(wake, { clock }), 'woke')
  assert.ok(clock.sleeps.every(ms => ms <= 60000))
  assert.equal(clock.sleeps.reduce((a, b) => a + b, 0), 3900000)
  assert.equal(clock.sleeps.length, 65)
  assert.equal(clock.t, wake)
})

test('a clock jump wakes early', async () => {
  const clock = fakeClock(startIso, (ms, n) => (n === 1 ? 10 * 3600000 : undefined))
  assert.equal(await sleepUntil(R * 1000 + 300000, { clock }), 'woke')
  assert.equal(clock.sleeps.length, 1)
})

test('a target in the past wakes at once', async () => {
  const clock = fakeClock(startIso)
  assert.equal(await sleepUntil(now - 1000, { clock }), 'woke')
  assert.equal(clock.sleeps.length, 0)
})

test('abort interrupts the sleep', async () => {
  const ac = new AbortController()
  const clock = fakeClock(startIso, (ms, n) => { if (n === 2) ac.abort() })
  assert.equal(await sleepUntil(R * 1000, { clock, abortSignal: ac.signal }), 'interrupted')
  assert.equal(clock.sleeps.length, 2)

  const done = new AbortController()
  done.abort()
  const clock2 = fakeClock(startIso)
  assert.equal(await sleepUntil(R * 1000, { clock: clock2, abortSignal: done.signal }), 'interrupted')
  assert.equal(clock2.sleeps.length, 0)
})

test('the cap', () => {
  const attempt = { limit: { resetsAt: R }, streamResetsAt: null }
  for (const limits of [1, 2, 3]) assert.equal(decide({ attempt, limits, config, nowMs: now }).action, 'wait')
  const d = decide({ attempt, limits: 4, config, nowMs: now })
  assert.equal(d.action, 'stop')
  assert.equal(d.wait.status, 'over-cap')
  assert.match(d.reason, /4 times in a row/)
  assert.match(d.reason, /maxLimitWaits \(3\)/)
})

test('the weekly stop', () => {
  const at = h => ({ limit: { resetsAt: now / 1000 + h * 3600 }, streamResetsAt: null })
  const d = decide({ attempt: at(25), limits: 1, config, nowMs: now })
  assert.equal(d.action, 'stop')
  assert.equal(d.wait.status, 'weekly')
  assert.match(d.reason, /--wait-weekly/)
  assert.equal(decide({ attempt: at(25), limits: 1, config: { ...config, waitWeekly: true }, nowMs: now }).action, 'wait')
  assert.equal(decide({ attempt: at(23), limits: 1, config, nowMs: now }).action, 'wait')
  assert.equal(decide({ attempt: { limit: null, streamResetsAt: null }, limits: 1, config, nowMs: now }).action, 'wait')
})

test('a wait record', () => {
  const d = decide({ attempt: { limit: { resetsAt: R }, streamResetsAt: R + 100 }, limits: 1, config, nowMs: now })
  assert.deepEqual(d.wait, {
    source: 'result-file',
    resetsAt: '2026-10-05T05:51:51.000Z',
    wakeAt: '2026-10-05T05:56:51.000Z',
    status: 'waiting',
    startedAt: null,
    endedAt: null
  })
})

test('realClock sleep aborts early', async () => {
  const ac = new AbortController()
  setTimeout(() => ac.abort(), 10)
  const t0 = Date.now()
  await realClock.sleep(60000, ac.signal)
  assert.ok(Date.now() - t0 < 2000)
  assert.equal(typeof realClock.now(), 'number')
})

test('plansDir follows CLAUDE_CONFIG_DIR', () => {
  const cfg = path.join('x', 'cfg')
  const home = path.join('x', 'home')
  assert.equal(plansDir({ CLAUDE_CONFIG_DIR: cfg }, home), path.join(cfg, 'plans'))
  assert.equal(plansDir({}, home), path.join(home, '.claude', 'plans'))
})

test('findSessionPlan picks the newest match', () => {
  const dir = tempDir('grind-plans-')
  try {
    for (const n of [
      'tierminator-unattended-20261005-010000-abcd1234.md',
      'tierminator-unattended-20261005-020000-abcd1234.md',
      'tierminator-unattended-20261005-030000-zzzz9999.md',
      'other-abcd1234.md'
    ]) fs.writeFileSync(path.join(dir, n), 'x')
    assert.equal(findSessionPlan(dir, 'abcd1234-5678'), path.join(dir, 'tierminator-unattended-20261005-020000-abcd1234.md'))
    assert.equal(findSessionPlan(path.join(dir, 'missing'), 'abcd1234-5678'), null)
    assert.equal(findSessionPlan(dir, null), null)
    assert.equal(findSessionPlan(dir, '!!!'), null)
  } finally {
    remove(dir)
  }
})

test('recovery phase rows', () => {
  const dir = tempDir('grind-phase-')
  try {
    const plans = path.join(dir, 'plans')
    fs.mkdirSync(plans)
    const planFile = path.join(dir, 'plan.md')
    fs.writeFileSync(planFile, 'x')
    const phase = attempt => recoveryPhase({ attempt, plansDir: plans })

    assert.deepEqual(phase({ planFile: null }), { phase: 'planning', planFile: null, from: null })
    assert.deepEqual(phase({ planFile: path.join(dir, 'missing.md') }), { phase: 'planning', planFile: null, from: null })
    assert.deepEqual(
      phase({ planFile, tasksFile: 't.json', tasksDone: ['T01'], tasksNotRun: ['T02', 'T03'] }),
      { phase: 'execute', planFile, from: 'T02' })
    assert.deepEqual(
      phase({ planFile, tasksFile: 't.json', tasksDone: ['T01', 'T02'], tasksNotRun: [] }),
      { phase: 'complete', planFile, from: null })
    assert.deepEqual(
      phase({ planFile, tasksFile: null, tasksDone: [], tasksNotRun: [] }),
      { phase: 'execute', planFile, from: null })
    assert.deepEqual(
      phase({ planFile: null, resume: { kind: 'execute', planFile, from: 'T02' } }),
      { phase: 'execute', planFile, from: null })
    const found = path.join(plans, 'tierminator-unattended-20261005-010000-abcd1234.md')
    fs.writeFileSync(found, 'x')
    assert.deepEqual(
      phase({ planFile: null, sessionId: 'abcd1234-x' }),
      { phase: 'execute', planFile: found, from: null })
    assert.equal(phase({ planFile, tasksNotRun: ['bogus'] }).from, null)
  } finally {
    remove(dir)
  }
})
