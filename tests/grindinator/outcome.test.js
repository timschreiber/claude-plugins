// Tests for the Grindinator outcome mapping (tools/grindinator/lib/outcome.js).
'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { RESULT_OUTCOMES, readResultFile, mapOutcome } = require('../../tools/grindinator/lib/outcome.js')

const RUN = { exitCode: 0, signal: null, timedOut: false, interrupted: false, spawnError: null, capMinutes: 480 }
const NOW = new Date('2026-10-05T12:00:00.000Z')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grind-outcome-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function write(text) {
  const file = path.join(dir, 'result.json')
  fs.writeFileSync(file, text)
  return file
}

function map(over) {
  return mapOutcome({
    result: { record: null, problem: null },
    stream: { lastResult: null, rateLimitResetsAt: null },
    run: RUN,
    now: NOW,
    ...over,
  })
}

test('readResultFile: a missing file is no record and no problem', () => {
  assert.deepEqual(readResultFile(path.join(dir, 'nope.json')), { record: null, problem: null })
})

test('readResultFile: invalid JSON', () => {
  assert.deepEqual(readResultFile(write('{bad')), { record: null, problem: 'is not valid JSON' })
})

test('readResultFile: not an object', () => {
  assert.deepEqual(readResultFile(write('[]')), { record: null, problem: 'is not a version 1 result file' })
})

test('readResultFile: wrong version', () => {
  const r = readResultFile(write(JSON.stringify({ version: 2 })))
  assert.deepEqual(r, { record: null, problem: 'is not a version 1 result file' })
})

test('readResultFile: unknown outcome', () => {
  const r = readResultFile(write(JSON.stringify({ version: 1, outcome: 'weird' })))
  assert.deepEqual(r, { record: null, problem: 'has an unknown outcome "weird"' })
})

test('readResultFile: a BOM-prefixed valid record', () => {
  const rec = { version: 1, outcome: 'complete' }
  assert.deepEqual(readResultFile(write('﻿' + JSON.stringify(rec))), { record: rec, problem: null })
})

test('readResultFile: a valid record', () => {
  const rec = { version: 1, outcome: 'halted', haltedAt: 'T02', tasksDone: ['T01'] }
  assert.deepEqual(readResultFile(write(JSON.stringify(rec))), { record: rec, problem: null })
})

for (const outcome of RESULT_OUTCOMES) {
  test(`mapOutcome: a ${outcome} record maps to itself`, () => {
    const m = map({ result: { record: { version: 1, outcome }, problem: null } })
    assert.equal(m.outcome, outcome)
    assert.equal(m.source, 'result-file')
    assert.equal(m.reason, null)
  })
}

test('mapOutcome: a halted record copies its fields', () => {
  const record = {
    version: 1,
    outcome: 'halted',
    reason: 'T02 failed',
    haltedAt: 'T02',
    tasksDone: ['T01'],
    tasksNotRun: ['T03'],
  }
  const m = map({ result: { record, problem: null } })
  assert.equal(m.haltedAt, 'T02')
  assert.equal(m.reason, 'T02 failed')
  assert.deepEqual(m.tasksDone, ['T01'])
  assert.deepEqual(m.tasksNotRun, ['T03'])
})

test('mapOutcome: a limit record copies the limit', () => {
  const limit = { detectedAt: '2026-10-05T00:00:00.000Z', resetsAt: 1791179511, raw: {} }
  const m = map({ result: { record: { version: 1, outcome: 'limit', limit }, problem: null } })
  assert.deepEqual(m.limit, limit)
})

test('mapOutcome: interrupted beats a complete record', () => {
  const record = { version: 1, outcome: 'complete', planFile: 'p.md' }
  const m = map({ result: { record, problem: null }, run: { ...RUN, interrupted: true } })
  assert.equal(m.outcome, 'interrupted')
  assert.equal(m.source, 'runner')
  assert.equal(m.planFile, 'p.md')
})

test('mapOutcome: a record beats timedOut', () => {
  const m = map({ result: { record: { version: 1, outcome: 'complete' }, problem: null }, run: { ...RUN, timedOut: true } })
  assert.equal(m.outcome, 'complete')
})

test('mapOutcome: spawn error', () => {
  const m = map({ run: { ...RUN, spawnError: 'spawn claude ENOENT' } })
  assert.equal(m.outcome, 'crashed')
  assert.equal(m.reason, 'claude could not be started: spawn claude ENOENT')
})

test('mapOutcome: timed out without a record', () => {
  const m = map({ run: { ...RUN, timedOut: true } })
  assert.equal(m.outcome, 'crashed')
  assert.equal(m.reason, 'the session ran past the 480-minute cap and was stopped')
})

test('mapOutcome: a 429 result is a limit', () => {
  const stream = { lastResult: { is_error: true, api_error_status: 429 }, rateLimitResetsAt: null }
  const m = map({ stream })
  assert.equal(m.outcome, 'limit')
  assert.equal(m.source, 'stream')
  assert.deepEqual(m.limit, { detectedAt: NOW.toISOString(), resetsAt: null, raw: null })
})

test('mapOutcome: a 429 result is a limit even with an invalid result file', () => {
  const stream = { lastResult: { is_error: true, api_error_status: 429 }, rateLimitResetsAt: null }
  const m = map({ stream, result: { record: null, problem: 'is not valid JSON' } })
  assert.equal(m.outcome, 'limit')
})

test('mapOutcome: a later non-error result means crashed', () => {
  const stream = { lastResult: { is_error: false, result: 'done' }, rateLimitResetsAt: null }
  assert.equal(map({ stream }).outcome, 'crashed')
})

test('mapOutcome: a 400 API error reason', () => {
  const stream = {
    lastResult: { is_error: true, api_error_status: 400, result: 'API Error: 400 probe' },
    rateLimitResetsAt: null,
  }
  const m = map({ stream, run: { ...RUN, exitCode: 1 } })
  assert.equal(
    m.reason,
    'the session ended without a result file; the last result was an API error (400): API Error: 400 probe; exit code 1'
  )
})

test('mapOutcome: an invalid result file reason', () => {
  const m = map({ result: { record: null, problem: 'is not valid JSON' } })
  assert.equal(m.reason, 'the result file is not valid JSON; exit code 0')
})

test('mapOutcome: no exit code and a signal', () => {
  const m = map({ run: { ...RUN, exitCode: null, signal: 'SIGTERM' } })
  assert.ok(m.reason.endsWith('; exit code none, signal SIGTERM'))
})
