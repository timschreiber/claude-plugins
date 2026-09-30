'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const I = require('../../plugins/decidinator/scripts/lib/importer.js')
const { parseVerdict } = require('../../plugins/decidinator/scripts/lib/verdict.js')
const { DEFAULTS } = require('../../plugins/decidinator/scripts/lib/config.js')
const { NO_ANSWER } = require('../../plugins/decidinator/scripts/lib/resolution.js')

const repoQ = (extra = {}) => ({ provisionalDecision: 'D-0001', provisionalAnswer: 'Use Postgres.', ...extra })

test('classify: identical after normalization is confirmed, different waits, no provisional is changed', () => {
  assert.deepEqual(I.classify(repoQ(), 'use postgres'), { cls: 'confirmed', note: 'same as the provisional answer.' })
  assert.deepEqual(I.classify(repoQ(), 'Use MySQL'), { cls: 'waiting', note: '' })
  assert.deepEqual(I.classify(repoQ({ provisionalAnswer: NO_ANSWER, provisionalDecision: '' }), 'x'), {
    cls: 'changed',
    note: 'no provisional answer to compare.'
  })
})

const verdictText = (answer, extra = {}) =>
  '```decidinator-verdict\n' +
  JSON.stringify({
    question_id: 'Q-0004', rung: 1, kind: 'researchable', status: 'resolved', answer, rationale: 'Why.', options: [],
    sources: [], assumptions: [], confidence: 'high', flags: [], ...extra
  }) +
  '\n```'
const judge = (text) => I.judgmentOf(parseVerdict(text, { questionId: 'Q-0004', rung: 1 }))

test('judgmentOf', () => {
  assert.deepEqual(judge(verdictText('match')), { cls: 'confirmed', note: 'the oracle judged it a match. Why.' })
  assert.deepEqual(judge(verdictText('Change.')), { cls: 'changed', note: 'the oracle judged it changed. Why.' })
  assert.deepEqual(judge(verdictText('change', { status: 'unresolved', options: [{ label: 'a', tradeoffs: '' }] })), {
    cls: 'changed',
    note: 'the oracle could not judge it (its verdict is unresolved), so it counts as changed.'
  })
  const bad = judge('no block here')
  assert.equal(bad.cls, 'changed')
  assert.equal(bad.note, 'the oracle could not judge it (no decidinator-verdict block), so it counts as changed.')
  assert.equal(
    judge(verdictText('maybe')).note,
    'the oracle could not judge it (its answer is "maybe", not match or change), so it counts as changed.'
  )
})

const item = (id, extra = {}) => ({
  id, decision: 'D-0009', supersedes: 'D-0001', dependsOn: ['WP-03'], question: 'Which DB?', provisionalAnswer: 'Use Postgres.',
  answer: 'Use MySQL', cls: 'waiting', note: '', dispatched: false, ...extra
})
const stateOf = (items, extra = {}) => ({ importJob: { promptId: 'p', file: 'out/copy.md', createdAt: 'now', delivered: false, reminded: false, items, ...extra } })

test('judgmentId', () => {
  const s = stateOf([item('Q-0004', { dispatched: true }), item('Q-0005')])
  assert.equal(I.judgmentId(s, 'Q-0005', false), 'Q-0005')
  assert.equal(I.judgmentId(s, 'Q-0009', false), null)
  assert.equal(I.judgmentId(s, null, false), 'Q-0004')
  assert.equal(I.judgmentId(s, null, true), null)
  assert.equal(I.judgmentId(stateOf([item('Q-0004', { dispatched: true }), item('Q-0005', { dispatched: true })]), null, false), null)
  assert.equal(I.judgmentId({}, 'Q-0004', false), null)
})

test('state helpers copy and change only what they should', () => {
  const s = stateOf([item('Q-0004'), item('Q-0005')])
  const d = I.markDispatched(s, 'Q-0004')
  assert.equal(d.importJob.items[0].dispatched, true)
  assert.equal(s.importJob.items[0].dispatched, false)
  assert.equal(I.markDispatched(d, 'Q-0004'), null)
  const a = I.applyJudgment(d, 'Q-0004', { cls: 'changed', note: 'n' })
  assert.deepEqual([a.importJob.items[0].cls, a.importJob.items[0].note], ['changed', 'n'])
  assert.equal(I.applyJudgment(a, 'Q-0004', { cls: 'confirmed', note: 'x' }), null)
  assert.equal(I.setDelivered(s).importJob.delivered, true)
  assert.equal(I.setDelivered(I.setDelivered(s)), null)
  assert.equal(I.setReminded(s).importJob.reminded, true)
  assert.deepEqual(I.waitingItems(a).map((i) => i.id), ['Q-0005'])
  assert.deepEqual(I.waitingItems(I.setDelivered(s)), [])
})

test('stopStep', () => {
  assert.equal(I.stopStep(stateOf([item('Q-0004', { cls: 'confirmed' })]).importJob), 'deliver')
  assert.equal(I.stopStep(stateOf([item('Q-0004')]).importJob), 'remind')
  assert.equal(I.stopStep(stateOf([item('Q-0004')], { reminded: true }).importJob), 'none')
  assert.equal(I.stopStep(stateOf([item('Q-0004', { dispatched: true })]).importJob), 'none')
})

test('report lists every class in order', () => {
  const job = stateOf([
    item('Q-0001', { cls: 'confirmed', note: 'same as the provisional answer.', decision: 'D-0004' }),
    item('Q-0002', { cls: 'changed', note: 'the oracle judged it changed. Why.', decision: 'D-0005', dependsOn: ['WP-04', 'WP-05'] }),
    item('Q-0003', { cls: 'changed', note: 'no provisional answer to compare.', decision: 'D-0006', supersedes: null, dependsOn: [] }),
    item('Q-0007', { decision: 'D-0007' }),
    item('Q-0008', { cls: 'skipped', note: 'already imported in docs/open-questions.md.', decision: null, supersedes: null }),
    item('Q-0009', { cls: 'failed', note: 'boom.', decision: null, supersedes: null })
  ]).importJob
  assert.equal(
    I.report(job),
    [
      'decidinator: imported 4 answers from out/copy.md as stakeholder decisions.',
      '',
      'Confirmed (1):',
      '- Q-0001 → D-0004 (supersedes D-0001): same as the provisional answer.',
      '',
      'Changed (2):',
      '- Q-0002 → D-0005 (supersedes D-0001): the oracle judged it changed. Why. Depends on: WP-04; WP-05.',
      '- Q-0003 → D-0006: no provisional answer to compare. Depends on: none.',
      '',
      'Waiting for oracle judgment (1):',
      '- Q-0007 → D-0007 (supersedes D-0001)',
      '',
      'Skipped (1):',
      '- Q-0008: already imported in docs/open-questions.md.',
      '',
      'Failed (1):',
      '- Q-0009: boom.'
    ].join('\n')
  )
  assert.equal(I.report({ file: 'f.md', items: [] }), 'decidinator: imported no answers from f.md.')
})

test('judgment prompt and instructions', () => {
  const it = item('Q-0004')
  const p = I.judgmentPrompt(it, DEFAULTS)
  assert.ok(p.startsWith('Decidinator question Q-0004\nRung: 1\nDecision log: docs/decisions.md\nSidecar: docs/open-questions.md\n'))
  assert.ok(p.includes('Context: Decidinator import judgment. Sidecar question Q-0004 asked: "Which DB?".'))
  assert.ok(p.includes('recorded as D-0009.'))
  const text = I.judgmentInstructions([it], DEFAULTS)
  assert.ok(text.startsWith('1 answer differs in wording'))
  assert.ok(text.includes('subagent_type: decidinator:oracle-1\ndescription: Decidinator import judgment Q-0004\nprompt:\n' + p))
  assert.ok(I.judgmentInstructions([it, item('Q-0005')], DEFAULTS).startsWith('2 answers differ in wording'))
})
