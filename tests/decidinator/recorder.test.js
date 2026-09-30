'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const state = require(path.join(lib, 'state.js'))
const Q = require(path.join(lib, 'questions.js'))
const { DEFAULTS } = require(path.join(lib, 'config.js'))
const recorded = require('./fixtures/recorded.js')
const { setup } = require('./fixtures/harness.js')

const NOW = '2026-01-01T00:00:00.000Z'
const CLEAR = 'decidinator-probe-oracle-clear-hooks.jsonl'
const HUMAN_ONLY = 'decidinator-probe-oracle-human-only-hooks.jsonl'
const SPEC_SILENT = 'decidinator-probe-oracle-spec-silent-hooks.jsonl'
let h
let savedData

beforeEach(() => {
  h = setup('recorder')
  savedData = process.env.CLAUDE_PLUGIN_DATA
  process.env.CLAUDE_PLUGIN_DATA = h.dataDir
})

afterEach(() => {
  if (savedData === undefined) delete process.env.CLAUDE_PLUGIN_DATA
  else process.env.CLAUDE_PLUGIN_DATA = savedData
  h.cleanup()
})

// The SubagentStop of a recorded file, with a transcript path that does not exist.
function stopOf(file) {
  const input = recorded.input(file, r => r.event === 'SubagentStop' && r.input.agent_type !== '')
  input.agent_transcript_path = path.join(h.tmp, 'none.jsonl')
  return input
}

function pendingState(id, { dispatched = true, rung = 1 } = {}) {
  let s = Q.addQuestions(
    Q.emptyState(),
    Q.fromCall({ questions: [{ question: `Question ${id}?`, options: [] }] }),
    [id],
    NOW
  )
  s = { ...s, questions: { ...s.questions, [id]: { ...s.questions[id], rung } } }
  if (dispatched) s = Q.recordDispatch(s, id, rung, 'toolu_x', NOW)
  return s
}

// Arms the session and saves a question with its dispatch recorded.
function pending(sid, id, opts) {
  state.arm(sid, 'ask', 'command')
  state.write(sid, pendingState(id, opts))
}

// Runs the recorder on `input`; it must print nothing. Returns the session state afterwards.
function record(input) {
  const res = h.run('recorder.js', input)
  assert.equal(res.status, 0, res.stderr)
  assert.equal(res.stdout, '')
  return state.read(input.session_id)
}

test('a clear verdict is stored and resolves the question', () => {
  const stop = stopOf(CLEAR)
  const sid = stop.session_id
  pending(sid, 'Q-0002')
  const s = record(stop)
  const q = s.questions['Q-0002']
  assert.equal(q.verdicts.length, 1)
  const e = q.verdicts[0]
  assert.equal(e.rung, 1)
  assert.equal(e.agent, 'decidinator:oracle-1')
  assert.equal(e.agentId, stop.agent_id)
  assert.equal(e.ok, true)
  assert.equal(e.reason, null)
  assert.equal(e.source, 'last_assistant_message')
  assert.deepEqual(e.models, [])
  assert.equal(e.verdict.status, 'resolved')
  assert.equal(e.verdict.confidence, 'high')
  assert.equal(q.status, 'resolved')
  assert.equal(typeof q.settledAt, 'string')
})

test('a human-only verdict ends the ladder unresolved', () => {
  const stop = stopOf(HUMAN_ONLY)
  const sid = stop.session_id
  pending(sid, 'Q-0003')
  const q = record(stop).questions['Q-0003']
  assert.equal(q.status, 'final-unresolved')
  assert.equal(q.rung, 1)
  assert.equal(q.verdicts[0].verdict.kind, 'human-only')
})

test('a spec-silent verdict escalates to the next rung', () => {
  const stop = stopOf(SPEC_SILENT)
  const sid = stop.session_id
  pending(sid, 'Q-0004')
  const s = record(stop)
  const q = s.questions['Q-0004']
  assert.equal(q.status, 'pending')
  assert.equal(q.rung, 2)
  const cfg = { ...DEFAULTS, rungs: [...DEFAULTS.rungs] }
  const d = Q.dueDispatch(s, cfg)
  assert.equal(d.agent, 'decidinator:oracle-2')
  assert.ok(d.prompt.includes('Rung: 2'))
  assert.ok(d.prompt.includes(`Earlier verdicts: ${JSON.stringify([q.verdicts[0].verdict])}`))
})

test('models come from the agent transcript', () => {
  const stop = stopOf(CLEAR)
  const sid = stop.session_id
  const file = path.join(h.tmp, 'agent.jsonl')
  fs.writeFileSync(
    file,
    [
      { type: 'assistant', message: { model: 'claude-opus-5-5', content: [] } },
      { type: 'assistant', message: { model: '<synthetic>', content: [] } }
    ]
      .map(l => JSON.stringify(l))
      .join('\n')
  )
  stop.agent_transcript_path = file
  pending(sid, 'Q-0002')
  assert.deepEqual(record(stop).questions['Q-0002'].verdicts[0].models, ['claude-opus-5-5'])
})

test('with no last_assistant_message the handback is used', () => {
  const stop = recorded.input('decidinator-probe-normal-default-hooks.jsonl', r => r.event === 'SubagentStop')
  stop.agent_transcript_path = path.join(h.tmp, 'none.jsonl')
  assert.equal(stop.agent_type, 'decidinator-probe:researcher')
  assert.equal(stop.last_assistant_message, undefined)
  const sid = stop.session_id
  fs.mkdirSync(path.join(h.projectDir, '.claude'))
  fs.writeFileSync(
    path.join(h.projectDir, '.claude', 'decidinator.json'),
    JSON.stringify({ rungs: ['decidinator-probe:researcher', 'decidinator:oracle-2'] })
  )
  pending(sid, 'Q-0002')
  const clearStop = stopOf(CLEAR)
  assert.equal(
    state.update(sid, s => ({ ...s, handbacks: { [stop.agent_id]: clearStop.last_assistant_message } })),
    true
  )
  const s = record(stop)
  const q = s.questions['Q-0002']
  assert.equal(q.verdicts[0].source, 'SubagentHandback')
  assert.equal(q.verdicts[0].ok, true)
  assert.equal(q.status, 'resolved')
  assert.equal(Object.hasOwn(s.handbacks, stop.agent_id), false)
})

test('with no last_assistant_message the agent transcript is used', () => {
  const stop = stopOf(CLEAR)
  const sid = stop.session_id
  const text = stop.last_assistant_message
  delete stop.last_assistant_message
  const file = path.join(h.tmp, 'agent.jsonl')
  fs.writeFileSync(
    file,
    JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-5-5', content: [{ type: 'text', text }] } })
  )
  stop.agent_transcript_path = file
  pending(sid, 'Q-0002')
  const q = record(stop).questions['Q-0002']
  assert.equal(q.verdicts[0].source, 'agent_transcript_path')
  assert.equal(q.verdicts[0].ok, true)
  assert.equal(q.status, 'resolved')
})

test('a report nowhere to be found is an invalid verdict and escalates', () => {
  const stop = stopOf(CLEAR)
  const sid = stop.session_id
  delete stop.last_assistant_message
  pending(sid, 'Q-0002')
  const q = record(stop).questions['Q-0002']
  const e = q.verdicts[0]
  assert.equal(e.ok, false)
  assert.equal(e.reason, 'no reply text')
  assert.equal(e.source, null)
  assert.equal(e.verdict.status, 'unresolved')
  assert.equal(e.verdict.confidence, 'low')
  assert.equal(q.rung, 2)
  assert.equal(q.status, 'pending')
})

test('a non-oracle subagent is ignored', () => {
  const clear = stopOf(CLEAR)
  const sid = clear.session_id
  pending(sid, 'Q-0002')
  const before = state.read(sid)
  const stops = recorded
    .load('decidinator-probe-interactive-normal-hooks.jsonl')
    .filter(r => r.event === 'SubagentStop')
    .map(r => r.input)
  assert.ok(stops.length > 0)
  for (const input of stops) {
    input.session_id = sid
    input.agent_transcript_path = path.join(h.tmp, 'none.jsonl')
    assert.deepEqual(record(input), before)
  }
  const researcher = recorded.input('decidinator-probe-plan-default-hooks.jsonl', r => r.event === 'SubagentStop')
  researcher.session_id = sid
  researcher.agent_transcript_path = path.join(h.tmp, 'none.jsonl')
  assert.deepEqual(record(researcher), before)
})

test('a stop with no dispatch in flight is ignored', () => {
  const stop = stopOf(CLEAR)
  const sid = stop.session_id
  pending(sid, 'Q-0002', { dispatched: false })
  const before = state.read(sid)
  assert.deepEqual(record(stop), before)
})

test('a report for another question is ignored', () => {
  const stop = stopOf(CLEAR)
  const sid = stop.session_id
  pending(sid, 'Q-0005')
  const before = state.read(sid)
  assert.deepEqual(record(stop), before)
})

test('a stale rung is ignored', () => {
  const stop = stopOf(CLEAR)
  const sid = stop.session_id
  pending(sid, 'Q-0002', { rung: 2 })
  const before = state.read(sid)
  assert.deepEqual(record(stop), before)
})

test('a second stop after resolution is ignored', () => {
  const stop = stopOf(CLEAR)
  const sid = stop.session_id
  pending(sid, 'Q-0002')
  const first = record(stop)
  assert.equal(first.questions['Q-0002'].verdicts.length, 1)
  const second = record(stop)
  assert.equal(second.questions['Q-0002'].verdicts.length, 1)
  assert.deepEqual(second, first)
})

test('an unarmed session is left alone', () => {
  const stop = stopOf(CLEAR)
  const sid = stop.session_id
  pending(sid, 'Q-0002')
  state.disarm(sid)
  const s = pendingState('Q-0002')
  assert.equal(state.write(sid, s), true)
  assert.deepEqual(record(stop), s)
})
