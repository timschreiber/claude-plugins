'use strict'

const { test, mock, beforeEach, afterEach } =require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const state = require('../../plugins/tierminator/scripts/lib/state.js')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-state-'))
  process.env.CLAUDE_PLUGIN_DATA = dir
})
afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA
  fs.rmSync(dir, { recursive: true, force: true })
})

test('write then read round-trips, under sessions/<id>.json', () => {
  assert.equal(state.write('abc-123', { phase: 'approved', tasks: [1] }), true)
  assert.deepEqual(state.read('abc-123'), { phase: 'approved', tasks: [1] })
  assert.ok(fs.existsSync(path.join(dir, 'sessions', 'abc-123.json')))
})

test('reading a missing session returns null', () => {
  assert.equal(state.read('nope'), null)
})

test('a corrupt file reads as null instead of throwing', () => {
  fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'sessions', 'bad.json'), '{not json')
  assert.equal(state.read('bad'), null)
})

test('remove deletes the file and is safe when it is already gone', () => {
  state.write('s1', { phase: 'approved' })
  state.remove('s1')
  assert.equal(state.read('s1'), null)
  state.remove('s1')
})

test('session ids are reduced to filename-safe characters', () => {
  assert.equal(state.write('../../evil', { phase: 'approved' }), true)
  const file = state.fileFor('../../evil')
  assert.equal(path.dirname(file), path.join(dir, 'sessions'))
  assert.equal(path.basename(file), 'evil.json')
})

test('missing or empty session ids read and write nothing', () => {
  for (const id of [undefined, null, '', '///']) {
    assert.equal(state.write(id, { phase: 'approved' }), false)
    assert.equal(state.read(id), null)
  }
})

test('write leaves no temp file behind', () => {
  state.write('s1', { phase: 'approved' })
  assert.deepEqual(fs.readdirSync(path.join(dir, 'sessions')), ['s1.json'])
})

const lockError = code => Object.assign(new Error(code), { code })

test('write retries a rename that fails with a lock error, then saves', () => {
  const original = fs.renameSync
  let calls = 0
  mock.method(fs, 'renameSync', (...args) => {
    if (++calls <= 2) throw lockError('EPERM')
    return original(...args)
  })
  try {
    assert.equal(state.write('s1', { phase: 'running' }, [0, 0, 0, 0, 0]), true)
    assert.deepEqual(state.read('s1'), { phase: 'running' })
    assert.deepEqual(fs.readdirSync(path.join(dir, 'sessions')), ['s1.json'])
    assert.equal(calls, 3)
  } finally {
    mock.restoreAll()
  }
})

test('write gives up after its retries, removes the temp file and returns false', () => {
  let calls = 0
  mock.method(fs, 'renameSync', () => {
    calls++
    throw lockError('EBUSY')
  })
  try {
    assert.equal(state.write('s1', { phase: 'running' }, [0, 0]), false)
    assert.equal(calls, 3)
    assert.deepEqual(fs.readdirSync(path.join(dir, 'sessions')), [])
  } finally {
    mock.restoreAll()
  }
})

test('write does not retry an error that is not a lock error', () => {
  let calls = 0
  mock.method(fs, 'renameSync', () => {
    calls++
    throw lockError('EXDEV')
  })
  try {
    assert.equal(state.write('s1', { phase: 'running' }, [0, 0]), false)
    assert.equal(calls, 1)
    assert.deepEqual(fs.readdirSync(path.join(dir, 'sessions')), [])
  } finally {
    mock.restoreAll()
  }
})

test('prune removes files older than the cutoff and keeps recent ones', () => {
  state.write('old', { phase: 'approved' })
  state.write('new', { phase: 'approved' })
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
  fs.utimesSync(state.fileFor('old'), past, past)
  state.prune(7)
  assert.equal(state.read('old'), null)
  assert.deepEqual(state.read('new'), { phase: 'approved' })
})

test('an unwritable data directory makes write return false and read return null', () => {
  const blocker = path.join(dir, 'file')
  fs.writeFileSync(blocker, '')
  process.env.CLAUDE_PLUGIN_DATA = path.join(blocker, 'nested')
  assert.equal(state.write('s1', { phase: 'approved' }), false)
  assert.equal(state.read('s1'), null)
  state.prune(7)
})

test('with CLAUDE_PLUGIN_DATA unset, state falls back to the temp directory', () => {
  delete process.env.CLAUDE_PLUGIN_DATA
  const file = state.fileFor('fallback-test')
  assert.ok(file.startsWith(path.join(os.tmpdir(), 'tierminator')))
})

test('activate, isActive and deactivate keep a flag beside the state file, apart from it', () => {
  assert.equal(state.isActive('s1'), false)
  assert.equal(state.activate('s1'), true)
  assert.equal(state.isActive('s1'), true)
  assert.ok(fs.existsSync(path.join(dir, 'sessions', 's1.active')))
  state.write('s1', { phase: 'running' })
  state.remove('s1')
  assert.equal(state.isActive('s1'), true, 'removing the run state leaves the flag')
  state.deactivate('s1')
  assert.equal(state.isActive('s1'), false)
  state.deactivate('s1')
})

test('activation needs a usable session id and a writable data directory', () => {
  for (const id of [undefined, null, '', '///']) {
    assert.equal(state.activate(id), false)
    assert.equal(state.isActive(id), false)
  }
  const blocker = path.join(dir, 'file')
  fs.writeFileSync(blocker, '')
  process.env.CLAUDE_PLUGIN_DATA = path.join(blocker, 'nested')
  assert.equal(state.activate('s1'), false)
  assert.equal(state.isActive('s1'), false)
})

test('prune removes old saved plans too', () => {
  const sessions = path.join(dir, 'sessions')
  fs.mkdirSync(sessions, { recursive: true })
  fs.writeFileSync(path.join(sessions, 'old.plan.md'), 'plan')
  fs.writeFileSync(path.join(sessions, 'new.plan.md'), 'plan')
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
  fs.utimesSync(path.join(sessions, 'old.plan.md'), past, past)
  state.prune(7)
  assert.equal(fs.existsSync(path.join(sessions, 'old.plan.md')), false)
  assert.equal(fs.existsSync(path.join(sessions, 'new.plan.md')), true)
})

test('prune removes old activation flags too', () => {
  state.activate('old')
  state.activate('new')
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
  fs.utimesSync(path.join(dir, 'sessions', 'old.active'), past, past)
  state.prune(7)
  assert.equal(state.isActive('old'), false)
  assert.equal(state.isActive('new'), true)
})

test('activation starts the telemetry cursor, setCursor moves it, and deactivation removes it', () => {
  assert.equal(state.cursor('s1'), null)
  const before = new Date().toISOString()
  state.activate('s1')
  const started = state.cursor('s1')
  assert.ok(started >= before, 'the cursor starts at the time of activation')
  assert.equal(state.setCursor('s1', '2026-09-28T12:00:00.000Z'), true)
  assert.equal(state.cursor('s1'), '2026-09-28T12:00:00.000Z')
  state.deactivate('s1')
  assert.equal(state.cursor('s1'), null)
  assert.equal(fs.existsSync(path.join(dir, 'sessions', 's1.cursor')), false)
  assert.equal(state.setCursor('', 'x'), false)
})

test('the rules marker is set, read and cleared apart from the flag, and deactivation removes it', () => {
  assert.equal(state.rulesShown('s1'), false)
  assert.equal(state.markRulesShown('s1'), true)
  assert.equal(state.rulesShown('s1'), true)
  assert.ok(fs.existsSync(path.join(dir, 'sessions', 's1.rules')))
  assert.equal(state.isActive('s1'), false, 'the marker is not the flag')
  state.clearRulesShown('s1')
  assert.equal(state.rulesShown('s1'), false)
  state.clearRulesShown('s1')
  state.activate('s1')
  state.markRulesShown('s1')
  state.deactivate('s1')
  assert.equal(state.rulesShown('s1'), false)
  assert.equal(fs.existsSync(path.join(dir, 'sessions', 's1.rules')), false)
  for (const id of [undefined, null, '', '///']) {
    assert.equal(state.markRulesShown(id), false)
    assert.equal(state.rulesShown(id), false)
  }
})

test('prune removes old rules markers too', () => {
  state.markRulesShown('old')
  state.markRulesShown('new')
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
  fs.utimesSync(path.join(dir, 'sessions', 'old.rules'), past, past)
  state.prune(7)
  assert.equal(state.rulesShown('old'), false)
  assert.equal(state.rulesShown('new'), true)
})

test('an attempt is claimed once: the first claim of a key wins, a later one loses, another key wins', () => {
  assert.equal(state.claimAttempt('s1', 'run1-0-1'), true)
  assert.equal(state.claimAttempt('s1', 'run1-0-1'), false)
  assert.equal(state.claimAttempt('s1', 'run1-0-2'), true)
  assert.equal(state.claimAttempt('s2', 'run1-0-1'), true, 'another session has its own claims')
})

test('the attempt key names the run, the task index and the attempt', () => {
  assert.equal(state.attemptKey({ runId: 'ab12', planId: 'p', current: { index: 2, attempt: 3 } }), 'ab12-2-3')
  assert.equal(state.attemptKey({ planId: 'p', current: { index: 0, attempt: 1 } }), 'p-0-1')
})

test('remove clears the session\'s claims and leaves other sessions\' alone', () => {
  state.write('s1', { phase: 'running' })
  state.claimAttempt('s1', 'k1')
  state.claimAttempt('s1', 'k2')
  state.claimAttempt('s10', 'k1')
  state.remove('s1')
  assert.deepEqual(fs.readdirSync(path.join(dir, 'sessions')), ['s10.k1.claim'])
  assert.equal(state.claimAttempt('s1', 'k1'), true)
})

test('an unsafe claim key cannot escape the sessions directory', () => {
  assert.equal(state.claimAttempt('s1', '../../evil/x'), true)
  assert.equal(state.claimAttempt('s1', '../../evil/x'), false)
  assert.deepEqual(fs.readdirSync(dir), ['sessions'])
  const [claim] = fs.readdirSync(path.join(dir, 'sessions'))
  assert.match(claim, /^s1\.[A-Za-z0-9_-]+\.claim$/)
})

test('a claim that cannot be written is granted, so the attempt is still judged', () => {
  for (const [id, key] of [['', 'k'], ['s1', ''], [undefined, undefined]]) assert.equal(state.claimAttempt(id, key), true)
  const blocker = path.join(dir, 'file')
  fs.writeFileSync(blocker, '')
  process.env.CLAUDE_PLUGIN_DATA = path.join(blocker, 'nested')
  assert.equal(state.claimAttempt('s1', 'k'), true)
  assert.equal(state.claimAttempt('s1', 'k'), true)
})

test('prune removes old claims too', () => {
  state.claimAttempt('old', 'k')
  state.claimAttempt('new', 'k')
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
  fs.utimesSync(path.join(dir, 'sessions', 'old.k.claim'), past, past)
  state.prune(7)
  assert.equal(state.claimAttempt('old', 'k'), true)
  assert.equal(state.claimAttempt('new', 'k'), false)
})

test('the lost-state note is saved, taken once, and removed by remove and prune', () => {
  const sessions = path.join(dir, 'sessions')
  assert.equal(state.saveLost('s1', 'gone'), true)
  assert.equal(state.takeLost('s1'), 'gone')
  assert.equal(state.takeLost('s1'), null)
  assert.equal(state.saveLost('s1', 'again'), true)
  state.remove('s1')
  assert.equal(fs.existsSync(path.join(sessions, 's1.lost')), false)
  state.saveLost('old', 'x')
  state.saveLost('new', 'x')
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
  fs.utimesSync(path.join(sessions, 'old.lost'), past, past)
  state.prune(7)
  assert.equal(fs.existsSync(path.join(sessions, 'old.lost')), false)
  assert.equal(fs.existsSync(path.join(sessions, 'new.lost')), true)
  assert.equal(state.saveLost('', 'x'), false)
  assert.equal(state.takeLost(''), null)
})

test('prune removes old cursors and fallback telemetry files too', () => {
  state.setCursor('old', '2026-09-01T00:00:00.000Z')
  const telemetry = path.join(dir, 'sessions', 'old.telemetry.jsonl')
  fs.writeFileSync(telemetry, '{}\n')
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
  fs.utimesSync(path.join(dir, 'sessions', 'old.cursor'), past, past)
  fs.utimesSync(telemetry, past, past)
  state.prune(7)
  assert.equal(state.cursor('old'), null)
  assert.equal(fs.existsSync(telemetry), false)
})
