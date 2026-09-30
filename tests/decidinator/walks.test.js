'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const W = require('../../plugins/decidinator/scripts/lib/walks.js')
const R = require('../../plugins/decidinator/scripts/lib/resolution.js')
const sidecar = require('../../plugins/decidinator/scripts/lib/sidecar.js')
const decisionLog = require('../../plugins/decidinator/scripts/lib/decision-log.js')

const entry = (id, extra = {}) =>
  sidecar.render(id, {
    topic: `Topic ${id}`,
    question: `Question for ${id}?`,
    context: 'c',
    options: [],
    provisionalAnswer: 'Prov',
    provisionalDecision: 'D-0001',
    dependsOn: [],
    status: 'open',
    ...extra
  })

const sideModel = (...entries) => sidecar.parse(['<!-- decidinator-sidecar v1 -->', '', ...entries.flatMap((e) => [...e, ''])].join('\n'))

const decision = (id, extra = {}) =>
  decisionLog.render(id, {
    title: `T ${id}`,
    question: `Decision question ${id}?`,
    answer: 'Ans',
    rationale: 'r',
    provenance: 'oracle-unconfirmed',
    confidence: 'high',
    rung: 1,
    sources: [],
    assumptions: [],
    flags: [],
    questionId: 'Q-0001',
    context: 'ctx',
    date: '2026-09-30',
    ...extra
  })

const logModel = (...entries) => decisionLog.parse(['<!-- decidinator-log v1 -->', '', ...entries.flatMap((e) => [...e, ''])].join('\n'))

const labels = (item) => item.options.map((o) => o.label)

test('review item: provisional answer, then up to 2 more options, then Skip', () => {
  const options = [1, 2, 3, 4].map((n) => ({ label: `opt${n}`, tradeoffs: `t${n}` }))
  const [item] = W.reviewItems(sideModel(entry('Q-0001', { options })))
  assert.deepEqual(labels(item), [W.KEEP, 'opt1', 'opt2', W.SKIP])
  assert.equal(item.kind, 'review')
  assert.equal(item.key, 'Q-0001')
  assert.equal(item.header, 'Q-0001')
  assert.equal(item.text, 'Q-0001: Question for Q-0001?')
  assert.equal(item.options[0].description, 'Prov')
  assert.equal(item.options[1].description, 't1')
})

test('review item: no provisional answer and no options offers Type an answer', () => {
  const [item] = W.reviewItems(sideModel(entry('Q-0001', { provisionalAnswer: R.NO_ANSWER, provisionalDecision: '' })))
  assert.deepEqual(labels(item), [W.TYPE, W.SKIP])
})

test('review item: reserved option labels are dropped, empty tradeoffs get the placeholder', () => {
  const options = [{ label: 'skip', tradeoffs: 'x' }, { label: 'Real', tradeoffs: '' }]
  const [item] = W.reviewItems(sideModel(entry('Q-0001', { options })))
  assert.deepEqual(labels(item), [W.KEEP, 'Real', W.SKIP])
  assert.equal(item.options[1].description, W.NO_TRADEOFFS)
})

test('review items: only open entries, in ID order', () => {
  const m = sideModel(entry('Q-0003'), entry('Q-0001'), entry('Q-0002', { status: 'imported' }))
  assert.deepEqual(W.reviewItems(m).map((i) => i.key), ['Q-0001', 'Q-0003'])
})

test('short truncates to 250 characters ending in ...', () => {
  const s = W.short('x'.repeat(300))
  assert.equal(s.length, 250)
  assert.ok(s.endsWith('...'))
  assert.equal(W.short('  a   b '), 'a b')
})

test('confirm order: more Depends on labels, then cross-cutting, then lowest confidence, then ID', () => {
  const log = logModel(
    decision('D-0001', { confidence: 'high', sidecar: 'Q-0001' }),
    decision('D-0002', { confidence: 'low', sidecar: 'Q-0002' }),
    decision('D-0003', { confidence: 'high', flags: ['cross-cutting'], sidecar: 'Q-0003' }),
    decision('D-0004', { confidence: null, rung: null, sidecar: 'Q-0004' }),
    decision('D-0005', { confidence: 'medium', sidecar: 'Q-0005' }),
    decision('D-0006', { confidence: 'low', sidecar: 'Q-0006' })
  )
  const side = sideModel(
    entry('Q-0001', { dependsOn: ['a', 'b', 'c'] }),
    entry('Q-0002'),
    entry('Q-0003'),
    entry('Q-0004'),
    entry('Q-0005'),
    entry('Q-0006')
  )
  assert.deepEqual(W.confirmItems(log, side).map((i) => i.key), ['D-0001', 'D-0003', 'D-0004', 'D-0002', 'D-0006', 'D-0005'])
})

test('confirm item: Confirm, at most 2 alternatives that differ from the answer, then Skip', () => {
  const options = [
    { label: 'ans', tradeoffs: 'same as the answer' },
    { label: 'Alt1', tradeoffs: 't1' },
    { label: 'Alt2', tradeoffs: 't2' },
    { label: 'Alt3', tradeoffs: 't3' }
  ]
  const log = logModel(decision('D-0001', { answer: 'Ans', sidecar: 'Q-0001' }))
  const [item] = W.confirmItems(log, sideModel(entry('Q-0001', { options })))
  assert.deepEqual(labels(item), [W.CONFIRM, 'Alt1', 'Alt2', W.SKIP])
  assert.equal(item.kind, 'confirm')
  assert.equal(item.header, 'D-0001')
  assert.equal(item.text, 'D-0001: Decision question D-0001?')
  assert.equal(item.options[0].description, 'Ans')
})

test('confirm items skip superseded and binding decisions', () => {
  const log = logModel(
    decision('D-0001', { provenance: 'user' }),
    decision('D-0002', { provenance: 'oracle-provisional' }),
    [...decision('D-0003'), '- **Superseded by:** D-0004'],
    decision('D-0004', { provenance: 'oracle-confirmed' })
  )
  assert.deepEqual(W.confirmItems(log, sideModel()).map((i) => i.key), ['D-0002'])
})

test('calls chunk into groups of 4 with multiSelect false', () => {
  const items = W.reviewItems(sideModel(...[1, 2, 3, 4, 5].map((n) => entry(`Q-000${n}`))))
  const c = W.calls(items)
  assert.deepEqual(c.map((x) => x.length), [4, 1])
  assert.equal(c[0][0].multiSelect, false)
  assert.equal(c[0][0].question, items[0].text)
  assert.equal(c[0][0].header, 'Q-0001')
})

test('walkState keeps the identifying fields and marks nothing done', () => {
  const items = W.reviewItems(sideModel(entry('Q-0001')))
  assert.deepEqual(W.walkState('review', 'p1', items, 'now'), {
    by: 'review',
    promptId: 'p1',
    createdAt: 'now',
    items: [{ kind: 'review', key: 'Q-0001', hash: items[0].hash, text: items[0].text, done: false }]
  })
})

test('classifyChoice', () => {
  assert.equal(W.classifyChoice('review', W.SKIP), 'skip')
  assert.equal(W.classifyChoice('review', W.TYPE), 'skip')
  assert.equal(W.classifyChoice('review', W.KEEP), 'keep')
  assert.equal(W.classifyChoice('review', 'Something else'), 'answer')
  assert.equal(W.classifyChoice('confirm', W.SKIP), 'skip')
  assert.equal(W.classifyChoice('confirm', W.CONFIRM), 'confirm')
  assert.equal(W.classifyChoice('confirm', 'Typed'), 'override')
})

test('userChoice returns the answer and its notes separately', () => {
  const input = { tool_response: { answers: { 'Q?': ['A', 'B'] }, annotations: { 'Q?': { notes: ' n ' } } } }
  assert.deepEqual(R.userChoice(input, 'Q?'), { raw: 'A, B', notes: 'n' })
  assert.equal(R.userChoice(input, 'Other?'), null)
  assert.equal(R.withNotes('A', 'n'), 'A\nNotes: n')
  assert.equal(R.withNotes('A', ''), 'A')
})
