'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const R = require(path.join(lib, 'resolution.js'))
const decisionLog = require(path.join(lib, 'decision-log.js'))
const sidecar = require(path.join(lib, 'sidecar.js'))

const v = (rung, confidence, ok = true, answer = 'A' + rung) => ({
  rung,
  ok,
  verdict: { answer, confidence }
})

test('bestAnswer', () => {
  const rows = [
    [[], null],
    [[v(1, 'high', false)], null],
    [[v(1, 'high'), v(2, 'medium')], 1],
    [[v(1, 'medium'), v(2, 'medium')], 2],
    [[v(1, 'high'), v(2, 'high')], 2],
    [[v(3, 'low'), v(1, 'low')], 3],
    [[v(1, 'low'), v(2, 'low', false)], 1],
    [[v(1, 'high', true, '  '), v(2, 'low')], 2],
    ['nope', null]
  ]
  for (const [input, rung] of rows) {
    const best = R.bestAnswer(input)
    assert.equal(best === null ? null : best.rung, rung, JSON.stringify(input))
  }
})

test('optionsFor', () => {
  const o1 = [{ label: 'X', tradeoffs: 'x' }]
  const o2 = [{ label: 'Y', tradeoffs: 'y' }]
  const a = { rung: 1, ok: true, verdict: { answer: 'a', confidence: 'high', options: o1 } }
  const b = { rung: 2, ok: true, verdict: { answer: 'b', confidence: 'low', options: o2 } }
  assert.deepEqual(R.optionsFor([a, b], a), o1)
  const c = { rung: 3, ok: true, verdict: { answer: 'c', confidence: 'high', options: [] } }
  assert.deepEqual(R.optionsFor([a, b, c], c), o2)
  assert.deepEqual(R.optionsFor([c], c), [])
  assert.deepEqual(R.optionsFor([], null), [])
})

test('title', () => {
  assert.equal(R.title({ header: ' Color ', question: 'Which?' }), 'Color')
  const t = R.title({ header: '', question: 'q'.repeat(70) })
  assert.equal(t.length, 60)
  assert.ok(t.endsWith('...'))
  assert.equal(R.title({ question: 'Which\n  color?' }), 'Which color?')
})

test('contextLabel', () => {
  assert.equal(R.contextLabel({ DECIDINATOR_CONTEXT: ' a;b  c ' }, 's1', 'main'), 'a,b c')
  assert.equal(R.contextLabel({}, 's1', 'main'), 'session s1 on main')
  assert.equal(R.contextLabel({}, 's1', null), 'session s1')
})

test('sidecarContext', () => {
  assert.equal(R.sidecarContext({ context: ' ctx ' }, 'label'), 'ctx')
  assert.equal(R.sidecarContext({ context: '  ' }, 'label'), 'label')
})

function models(decisions, questions) {
  const logText = [decisionLog.MARKER, '', ...decisions.flatMap(([id, d]) => [...decisionLog.render(id, d), ''])].join('\n')
  const sideText = [sidecar.MARKER, '', ...questions.flatMap(([id, q]) => [...sidecar.render(id, q), ''])].join('\n')
  return { log: decisionLog.parse(logText), side: sidecar.parse(sideText) }
}

const dec = (question, extra = {}) => ({
  title: 'T',
  question,
  answer: 'A',
  rationale: 'r',
  provenance: 'oracle-unconfirmed',
  confidence: 'low',
  rung: 1,
  questionId: 'Q-0009',
  context: 'c',
  date: '2026-01-01',
  ...extra
})
const que = (question, status = 'open') => ({
  topic: 'Topic',
  question,
  context: 'c',
  options: [],
  provisionalAnswer: 'p',
  status
})
const dupVerdict = (id) => [{ rung: 1, ok: true, verdict: { answer: 'a', confidence: 'low', duplicate_of: id } }]

test('findDuplicate', () => {
  const q = { id: 'Q-0010', question: 'Should we use tabs?' }

  let m = models([], [['Q-0001', que('Something else')], ['Q-0002', que('Another thing')]])
  assert.equal(R.findDuplicate(q, dupVerdict('Q-0002'), m.log, m.side).id, 'Q-0002')

  m = models([['D-0001', dec('Unrelated', { sidecar: 'Q-0002' })]], [['Q-0001', que('Something else')], ['Q-0002', que('Another thing')]])
  assert.equal(R.findDuplicate(q, dupVerdict('D-0001'), m.log, m.side).id, 'Q-0002')

  m = models([], [['Q-0001', que('Something else')], ['Q-0002', que('SHOULD we use TABS')]])
  assert.equal(R.findDuplicate(q, [], m.log, m.side).id, 'Q-0002')

  m = models([['D-0001', dec('should we use tabs!', { sidecar: 'Q-0001' })]], [['Q-0001', que('Different wording entirely')]])
  assert.equal(R.findDuplicate(q, [], m.log, m.side).id, 'Q-0001')

  m = models([], [['Q-0001', que('Should we use tabs?', 'answered')]])
  assert.equal(R.findDuplicate(q, dupVerdict('Q-0001'), m.log, m.side), null)

  m = models([], [['Q-0001', que('Nothing alike')]])
  assert.equal(R.findDuplicate(q, [], m.log, m.side), null)
  assert.equal(R.findDuplicate(q, [], null, null), null)
})

test('userAnswer', () => {
  const Qt = 'Which?'
  assert.equal(R.userAnswer({ tool_response: { answers: { [Qt]: ' Red ' } } }, Qt), 'Red')
  assert.equal(R.userAnswer({ tool_input: { answers: { [Qt]: 'Blue' } } }, Qt), 'Blue')
  assert.equal(
    R.userAnswer({ tool_response: { answers: { [Qt]: 'Red' }, annotations: { [Qt]: { notes: ' because ' } } } }, Qt),
    'Red\nNotes: because'
  )
  assert.equal(R.userAnswer({ tool_response: { answers: { [Qt]: ['Red', 'Blue'] } } }, Qt), 'Red, Blue')
  assert.equal(R.userAnswer({ tool_response: { answers: {} } }, Qt), null)
  assert.equal(R.userAnswer(null, Qt), null)
})
