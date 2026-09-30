'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const Q = require(path.join(lib, 'questions.js'))
const reasons = require(path.join(lib, 'reasons.js'))
const { DEFAULTS } = require(path.join(lib, 'config.js'))

const cfg = { ...DEFAULTS, rungs: [...DEFAULTS.rungs] }
const NOW = '2026-01-01T00:00:00.000Z'

const ASK = {
  questions: [
    {
      question: 'Which color should the probe use?',
      header: 'Color',
      options: [
        { label: 'Red', description: 'Use red for the probe.' },
        { label: 'Blue', description: 'Use blue for the probe.' }
      ],
      multiSelect: false
    }
  ]
}

const other = (text) => ({ questions: [{ question: text, header: '', options: [], multiSelect: false }] })

// A state with the given [id, question, status] rows, in order.
function stateOf(rows) {
  let s = Q.emptyState()
  for (const [id, question, status] of rows) {
    s = Q.addQuestions(s, Q.fromCall(other(question)), [id], NOW)
    s.questions[id].status = status
  }
  return s
}

test('emptyState', () => {
  assert.deepEqual(Q.emptyState(), { v: 1, order: [], questions: {}, passThrough: null })
})

test('fromCall rejects unusable shapes', () => {
  for (const bad of [null, undefined, 5, {}, { questions: [] }, { questions: 'x' }, { questions: [null] },
    { questions: [{}] }, { questions: [{ question: '' }] }, { questions: [{ question: '  ' }] },
    { questions: [{ question: 3 }] }, { questions: [{ question: 'ok' }, 'x'] }]) {
    assert.equal(Q.fromCall(bad), null, JSON.stringify(bad))
  }
})

test('fromCall normalizes questions', () => {
  const [c] = Q.fromCall({
    questions: [{
      question: 'Which?',
      header: 7,
      options: [{ label: ' A\n b ', description: 'x   y' }, { label: 'B' }, { description: 'no label' }, null],
      multiSelect: 1
    }]
  })
  assert.equal(c.header, '')
  assert.equal(c.multiSelect, true)
  assert.deepEqual(c.options, [{ label: 'A b', description: 'x y' }, { label: 'B', description: '' }])
  assert.match(c.hash, /^[0-9a-f]{16}$/)
})

test('fromCall collapses duplicates, keeping the first', () => {
  const calls = Q.fromCall({ questions: [{ question: 'Which color?' }, { question: 'WHICH color' }, { question: 'Other?' }] })
  assert.deepEqual(calls.map(c => c.question), ['Which color?', 'Other?'])
})

test('findByHash returns the latest match', () => {
  const s = stateOf([['Q-0001', 'Which color?', 'resolved'], ['Q-0002', 'Which color?!', 'pending']])
  const hash = Q.fromCall(other('which COLOR'))[0].hash
  assert.equal(Q.findByHash(s, hash).id, 'Q-0002')
  assert.equal(Q.findByHash(s, 'nope'), null)
})

test('classify gives new, pending, open and settled', () => {
  const s = stateOf([
    ['Q-0001', 'A?', 'pending'], ['Q-0002', 'B?', 'final-unresolved'],
    ['Q-0003', 'C?', 'resolved'], ['Q-0004', 'D?', 'answered']
  ])
  const calls = Q.fromCall({ questions: ['a', 'b', 'c', 'd', 'e'].map(l => ({ question: `${l}?` })) })
  assert.deepEqual(Q.classify(s, calls).map(c => c.kind), ['pending', 'open', 'settled', 'settled', 'new'])
})

test('addQuestions adds pending rung-1 questions without mutating its input', () => {
  const s0 = Q.emptyState()
  const s1 = Q.addQuestions(s0, Q.fromCall(ASK), ['Q-0007'], NOW)
  assert.deepEqual(s0, Q.emptyState())
  assert.deepEqual(s1.order, ['Q-0007'])
  const q = s1.questions['Q-0007']
  assert.equal(q.id, 'Q-0007')
  assert.equal(q.question, 'Which color should the probe use?')
  assert.equal(q.header, 'Color')
  assert.equal(q.status, 'pending')
  assert.equal(q.rung, 1)
  assert.deepEqual(q.verdicts, [])
  assert.deepEqual(q.dispatches, [])
  assert.equal(q.createdAt, NOW)
  assert.deepEqual(q.options[0], { label: 'Red', description: 'Use red for the probe.' })
})

test('due skips settled questions and clamps the rung', () => {
  const s = stateOf([['Q-0001', 'A?', 'resolved'], ['Q-0002', 'B?', 'pending'], ['Q-0003', 'C?', 'pending']])
  assert.equal(Q.due(s, cfg.rungs).id, 'Q-0002')
  assert.equal(Q.due(s, cfg.rungs).agent, 'decidinator:oracle-1')
  s.questions['Q-0002'].rung = 2
  assert.equal(Q.due(s, cfg.rungs).agent, 'decidinator:oracle-2')
  s.questions['Q-0002'].rung = 9
  assert.deepEqual([Q.due(s, cfg.rungs).rung, Q.due(s, cfg.rungs).agent], [3, 'decidinator:oracle-3'])
  assert.equal(Q.due(s, ['only']).agent, 'only')
  s.questions['Q-0002'].status = 'final-unresolved'
  s.questions['Q-0003'].status = 'resolved'
  assert.equal(Q.due(s, cfg.rungs), null)
  assert.equal(Q.due(Q.emptyState(), cfg.rungs), null)
})

const RUNG_1_PROMPT = [
  'Decidinator question Q-0007',
  'Rung: 1',
  'Decision log: docs/decisions.md',
  'Sidecar: docs/open-questions.md',
  'Question: Which color should the probe use?',
  'Options:',
  '- Red: Use red for the probe.',
  '- Blue: Use blue for the probe.',
  'Context: <what you were doing and why this question came up>'
].join('\n')

function sample() {
  const ask = JSON.parse(JSON.stringify(ASK))
  ask.questions[0].options[1] = { label: 'Blue', description: 'Use blue for the probe.' }
  return Q.addQuestions(Q.emptyState(), Q.fromCall(ask), ['Q-0007'], NOW)
}

test('dispatchPrompt at rung 1 is the exact text', () => {
  const s = sample()
  assert.equal(Q.dispatchPrompt(s.questions['Q-0007'], 1, cfg), RUNG_1_PROMPT)
})

test('dispatchPrompt handles empty descriptions and zero options', () => {
  const q = { id: 'Q-0001', question: 'A\n  b?', options: [{ label: 'X', description: '' }, { label: 'Y', description: 'why' }], verdicts: [] }
  assert.match(Q.dispatchPrompt(q, 1, cfg), /Question: A b\?\nOptions:\n- X\n- Y: why\nContext:/)
  const none = Q.dispatchPrompt({ ...q, options: [] }, 1, cfg)
  assert.match(none, /Question: A b\?\nOptions: none\nContext:/)
})

test('dispatchPrompt adds Earlier verdicts only above rung 1', () => {
  const s = sample()
  const q = s.questions['Q-0007']
  const v1 = { question_id: 'Q-0007', rung: 1, status: 'unresolved' }
  const v2 = { question_id: 'Q-0007', rung: 2, status: 'unresolved' }
  q.verdicts = [{ rung: 2, verdict: v2 }, { rung: 1, verdict: v1 }]
  assert.equal(Q.dispatchPrompt(q, 1, cfg), RUNG_1_PROMPT)
  const p2 = Q.dispatchPrompt(q, 2, cfg)
  assert.equal(p2, `${RUNG_1_PROMPT.replace('Rung: 1', 'Rung: 2')}\nEarlier verdicts: ${JSON.stringify([v1])}`)
  const p3 = Q.dispatchPrompt(q, 3, cfg)
  assert.ok(p3.endsWith(`Earlier verdicts: ${JSON.stringify([v1, v2])}`))
})

test('dueDispatch', () => {
  const s = sample()
  const d = Q.dueDispatch(s, cfg)
  assert.deepEqual(d, { id: 'Q-0007', rung: 1, agent: 'decidinator:oracle-1', prompt: RUNG_1_PROMPT })
  s.questions['Q-0007'].status = 'resolved'
  assert.equal(Q.dueDispatch(s, cfg), null)
})

// Every row of the Decision 7 table.
function gate(rows, callTexts, mode) {
  const s = stateOf(rows)
  const calls = Q.fromCall({ questions: callTexts.map(question => ({ question })) })
  return Q.decideGate(s, Q.classify(s, calls), mode, cfg)
}

test('decideGate: any pending question is held, in both modes', () => {
  const rows = [['Q-0001', 'A?', 'pending'], ['Q-0002', 'B?', 'final-unresolved'], ['Q-0003', 'C?', 'pending']]
  for (const mode of ['ask', 'sidecar']) {
    const r = gate(rows, ['B?', 'C?', 'A?'], mode)
    assert.equal(r.deny.startsWith('decidinator: not shown to the user yet. Questions Q-0003, Q-0001 are waiting'), true, r.deny)
    assert.match(r.deny, /Q-0001 is next/)
    assert.equal(r.allow, undefined)
  }
})

test('decideGate: only final-unresolved is allowed in ask mode and denied in sidecar mode', () => {
  const rows = [['Q-0001', 'A?', 'final-unresolved'], ['Q-0002', 'B?', 'final-unresolved']]
  assert.deepEqual(gate(rows, ['A?', 'B?'], 'ask'), { allow: true })
  const r = gate(rows, ['A?', 'B?'], 'sidecar')
  assert.equal(r.deny, reasons.sidecar(['Q-0001', 'Q-0002'], cfg.sidecar))
})

test('decideGate: final-unresolved plus settled is narrowed in ask mode, sidecar in sidecar mode', () => {
  const rows = [['Q-0001', 'A?', 'resolved'], ['Q-0002', 'B?', 'final-unresolved']]
  assert.equal(gate(rows, ['A?', 'B?'], 'ask').deny, reasons.narrow(['Q-0001'], [{ id: 'Q-0002', question: 'B?' }]))
  assert.equal(gate(rows, ['A?', 'B?'], 'sidecar').deny, reasons.sidecar(['Q-0001', 'Q-0002'], cfg.sidecar))
})

test('decideGate: only settled questions are denied as settled, in both modes', () => {
  const rows = [['Q-0001', 'A?', 'resolved'], ['Q-0002', 'B?', 'answered']]
  for (const mode of ['ask', 'sidecar']) {
    assert.equal(gate(rows, ['A?', 'B?'], mode).deny, reasons.settled(['Q-0001', 'Q-0002']))
  }
})

test('checkDispatch accepts the due call and names each problem', () => {
  const d = Q.dueDispatch(sample(), cfg)
  const ok = { subagent_type: d.agent, prompt: d.prompt }
  assert.equal(Q.checkDispatch(d, ok), null)
  assert.equal(Q.checkDispatch(d, { ...ok, prompt: `see Q-0007, ok` }), null)
  assert.equal(Q.checkDispatch(d, { ...ok, subagent_type: 'decidinator:oracle-2' }), reasons.wrongAgent('decidinator:oracle-2', d))
  assert.equal(Q.checkDispatch(d, { prompt: d.prompt }), reasons.wrongAgent(undefined, d))
  assert.equal(Q.checkDispatch(d, undefined), reasons.wrongAgent(undefined, d))
  assert.equal(Q.checkDispatch(d, { ...ok, prompt: 'no id here' }), reasons.missingId(d))
  assert.equal(Q.checkDispatch(d, { ...ok, prompt: 'about Q-00071' }), reasons.missingId(d))
  assert.equal(Q.checkDispatch(d, { subagent_type: d.agent }), reasons.missingId(d))
})

test('recordDispatch appends without mutating', () => {
  const s = sample()
  const s2 = Q.recordDispatch(s, 'Q-0007', 1, 'toolu_1', NOW)
  const s3 = Q.recordDispatch(s2, 'Q-0007', 1, undefined, NOW)
  assert.deepEqual(s.questions['Q-0007'].dispatches, [])
  assert.deepEqual(s3.questions['Q-0007'].dispatches, [
    { rung: 1, at: NOW, toolUseId: 'toolu_1' },
    { rung: 1, at: NOW, toolUseId: null }
  ])
  assert.equal(Q.recordDispatch(s, 'Q-9999', 1, 't', NOW), s)
})

test('pass-through is set for review and confirm only, and expires with the prompt', () => {
  const s = Q.emptyState()
  assert.equal(Q.setPassThrough(s, 'bogus', 'p1'), s)
  const on = Q.setPassThrough(s, 'review', 'p1')
  assert.deepEqual(on.passThrough, { by: 'review', promptId: 'p1' })
  assert.equal(s.passThrough, null)
  assert.equal(Q.passThroughActive(on, 'p1'), true)
  assert.equal(Q.passThroughActive(on, 'p2'), false)
  assert.equal(Q.passThroughActive(on, ''), false)
  assert.equal(Q.passThroughActive(on, undefined), false)
  assert.equal(Q.passThroughActive(Q.setPassThrough(s, 'confirm', ''), ''), false)
  assert.equal(Q.passThroughActive(s, 'p1'), false)
})

test('inFlight is true only for a recorded dispatch at that rung', () => {
  const s = sample()
  assert.equal(Q.inFlight(s.questions['Q-0007'], 1), false)
  const s2 = Q.recordDispatch(s, 'Q-0007', 1, 't', NOW)
  assert.equal(Q.inFlight(s2.questions['Q-0007'], 1), true)
  assert.equal(Q.inFlight(s2.questions['Q-0007'], 2), false)
  assert.equal(Q.inFlight(null, 1), false)
})

test('guardKey names the id, rung and phase', () => {
  assert.equal(Q.guardKey('Q-0001', 2, true), 'Q-0001@2:running')
  assert.ok(Q.guardKey('Q-0001', 2, false).endsWith(':due'))
})

test('recordVerdict appends, keeps the first per rung, and ignores unknown ids', () => {
  const s = sample()
  const e1 = { rung: 1, verdict: { status: 'unresolved' } }
  const s2 = Q.recordVerdict(s, 'Q-0007', e1)
  assert.deepEqual(s.questions['Q-0007'].verdicts, [])
  assert.deepEqual(s2.questions['Q-0007'].verdicts, [e1])
  assert.equal(Q.recordVerdict(s2, 'Q-0007', { rung: 1, verdict: { status: 'resolved' } }), s2)
  assert.equal(Q.recordVerdict(s, 'Q-9999', e1), s)
})

test('applyLadder escalates, settles and clears the guard', () => {
  const s = { ...sample(), guard: { key: 'x', blocks: 1, steppedAside: false } }
  const before = JSON.parse(JSON.stringify(s))
  const esc = Q.applyLadder(s, 'Q-0007', { outcome: 'escalate', rung: 2 }, NOW)
  assert.equal(esc.questions['Q-0007'].rung, 2)
  assert.equal(esc.questions['Q-0007'].status, 'pending')
  assert.equal(esc.guard, null)
  const res = Q.applyLadder(s, 'Q-0007', { outcome: 'resolved' }, NOW)
  assert.equal(res.questions['Q-0007'].status, 'resolved')
  assert.equal(res.questions['Q-0007'].settledAt, NOW)
  assert.equal(res.guard, null)
  const fin = Q.applyLadder(s, 'Q-0007', { outcome: 'final-unresolved' }, NOW)
  assert.equal(fin.questions['Q-0007'].status, 'final-unresolved')
  assert.equal(fin.questions['Q-0007'].settledAt, NOW)
  assert.equal(fin.guard, null)
  assert.equal(Q.applyLadder(s, 'Q-9999', { outcome: 'resolved' }, NOW), s)
  assert.equal(Q.applyLadder(s, 'Q-0007', { outcome: 'bogus' }, NOW), s)
  assert.deepEqual(s, before)
})

test('setHandback and dropHandback round-trip and reject bad input', () => {
  const s = Q.emptyState()
  const on = Q.setHandback(s, 'a1', 'msg')
  assert.deepEqual(on.handbacks, { a1: 'msg' })
  assert.equal(s.handbacks, undefined)
  const off = Q.dropHandback(on, 'a1')
  assert.deepEqual(off.handbacks, {})
  assert.equal(Object.hasOwn(off.handbacks, 'a1'), false)
  assert.equal(Q.setHandback(s, '', 'm'), s)
  assert.equal(Q.setHandback(s, 5, 'm'), s)
  assert.equal(Q.setHandback(s, 'a1', 5), s)
  assert.equal(Q.dropHandback(on, 'zzz'), on)
  assert.equal(Q.dropHandback(s, 'a1'), s)
})

test('guardStep denies up to max, steps aside once, then passes', () => {
  let s = Q.emptyState()
  for (const n of [1, 2, 3]) {
    const r = Q.guardStep(s, 'k', 3)
    assert.equal(r.action, 'deny')
    assert.equal(r.blocks, n)
    s = r.state
  }
  const aside = Q.guardStep(s, 'k', 3)
  assert.equal(aside.action, 'step-aside')
  assert.equal(aside.blocks, 3)
  s = aside.state
  assert.deepEqual(Q.guardStep(s, 'k', 3), { action: 'pass', state: null })
  const again = Q.guardStep(s, 'other', 3)
  assert.equal(again.action, 'deny')
  assert.equal(again.blocks, 1)
  const one = Q.guardStep(Q.emptyState(), 'k', 1)
  assert.equal(one.action, 'deny')
  assert.equal(Q.guardStep(one.state, 'k', 1).action, 'step-aside')
})
