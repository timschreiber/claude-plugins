'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const vd = require('../../plugins/decidinator/scripts/lib/verdict.js')

const valid = () => ({
  question_id: 'Q-0007',
  rung: 1,
  kind: 'human-only',
  status: 'unresolved',
  answer: 'Use a queue.',
  rationale: 'It decouples the producers.',
  options: [{ label: 'Queue', tradeoffs: 'More moving parts.' }, { label: 'Direct call', tradeoffs: 'Coupled.' }],
  sources: ['https://example.com/queues', 'src/jobs.js'],
  assumptions: ['Volume stays low'],
  confidence: 'medium',
  flags: ['cross-cutting', 'cross-cutting'],
  duplicate_of: 'D-0003'
})
const wrap = (obj, fence = '```') => `Some prose.\n\n${fence}decidinator-verdict\n${typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)}\n${fence}\n`
const reasonFor = (mutate, expected) => {
  const v = valid()
  mutate(v)
  const r = vd.parseVerdict(wrap(v), expected)
  assert.equal(r.ok, false)
  assert.deepEqual(r.verdict, vd.fallback(expected))
  return r.reason
}

test('a valid verdict parses, dedupes flags and drops unknown keys', () => {
  const v = valid()
  v.extra = 'ignored'
  const r = vd.parseVerdict(wrap(v), { questionId: 'Q-0007', rung: 1 })
  assert.equal(r.ok, true)
  assert.deepEqual(r.verdict.flags, ['cross-cutting'])
  assert.equal('extra' in r.verdict, false)
  assert.equal(Object.keys(r.verdict).length, 12)
  assert.equal(r.verdict.duplicate_of, 'D-0003')
})

test('a resolved verdict gets defaults for absent optional fields', () => {
  const r = vd.parseVerdict(wrap({
    question_id: 'Q-0001', rung: 2, kind: 'researchable', status: 'resolved',
    answer: 'Yes.', rationale: 'Docs say so.', confidence: 'high'
  }))
  assert.equal(r.ok, true)
  assert.deepEqual(r.verdict.options, [])
  assert.deepEqual(r.verdict.sources, [])
  assert.deepEqual(r.verdict.assumptions, [])
  assert.deepEqual(r.verdict.flags, [])
  assert.equal(r.verdict.duplicate_of, null)
})

test('each field fails with its own reason', () => {
  assert.equal(reasonFor((v) => { v.question_id = 'x' }), '"question_id" must be a question ID such as Q-0007')
  assert.equal(reasonFor((v) => { delete v.question_id }), '"question_id" must be a question ID such as Q-0007')
  assert.equal(reasonFor((v) => { v.rung = 0 }), '"rung" must be a whole number of at least 1')
  assert.equal(reasonFor((v) => { v.rung = '1' }), '"rung" must be a whole number of at least 1')
  assert.equal(reasonFor((v) => { v.kind = 'other' }), '"kind" must be "researchable" or "human-only"')
  assert.equal(reasonFor((v) => { v.status = 'maybe' }), '"status" must be "resolved" or "unresolved"')
  assert.equal(reasonFor((v) => { v.answer = '  ' }), '"answer" must be a non-empty string')
  assert.equal(reasonFor((v) => { delete v.answer }), '"answer" must be a non-empty string')
  assert.equal(reasonFor((v) => { v.rationale = '' }), '"rationale" must be a non-empty string')
  assert.equal(reasonFor((v) => { v.options = 'x' }), '"options" must be an array of {label, tradeoffs} objects')
  assert.equal(reasonFor((v) => { v.options = [{ label: '', tradeoffs: 'x' }] }), '"options" must be an array of {label, tradeoffs} objects')
  assert.equal(reasonFor((v) => { v.options = [{ label: 'a' }] }), '"options" must be an array of {label, tradeoffs} objects')
  assert.equal(reasonFor((v) => { v.options = [] }), '"options" must list at least one option when "status" is "unresolved"')
  assert.equal(reasonFor((v) => { delete v.options }), '"options" must list at least one option when "status" is "unresolved"')
  assert.equal(reasonFor((v) => { v.sources = ['ok', ''] }), '"sources" must be an array of non-empty strings')
  assert.equal(reasonFor((v) => { v.sources = 'x' }), '"sources" must be an array of non-empty strings')
  assert.equal(reasonFor((v) => { v.assumptions = [3] }), '"assumptions" must be an array of non-empty strings')
  assert.equal(reasonFor((v) => { v.confidence = 'sure' }), '"confidence" must be "high", "medium" or "low"')
  assert.equal(reasonFor((v) => { delete v.confidence }), '"confidence" must be "high", "medium" or "low"')
  assert.equal(reasonFor((v) => { v.flags = ['bogus'] }), '"flags" may only contain "spec-silent", "spec-contradiction", "cross-cutting", "conflicts-binding"')
  assert.equal(reasonFor((v) => { v.flags = 'cross-cutting' }), '"flags" may only contain "spec-silent", "spec-contradiction", "cross-cutting", "conflicts-binding"')
  assert.equal(reasonFor((v) => { v.duplicate_of = 'X-0001' }), '"duplicate_of" must be a D- or Q- ID such as D-0003')
})

test('a long rationale is accepted', () => {
  const v = valid()
  v.rationale = 'One. Two. Three. Four. Five.'
  assert.equal(vd.parseVerdict(wrap(v)).ok, true)
})

test('mismatch with the expected question or rung is reported', () => {
  assert.equal(reasonFor(() => {}, { questionId: 'Q-0008' }), '"question_id" is Q-0007, expected Q-0008')
  assert.equal(reasonFor(() => {}, { rung: 2 }), '"rung" is 1, expected 2')
})

test('the fallback is unresolved and low, with the reason', () => {
  const expected = { questionId: 'Q-0007', rung: 2 }
  const want = vd.fallback(expected)
  assert.equal(want.status, 'unresolved')
  assert.equal(want.confidence, 'low')
  const cases = [
    ['no prose block here', 'no decidinator-verdict block'],
    [wrap('{not json'), 'verdict block is not valid JSON'],
    [wrap('[1, 2]'), 'verdict block is not a JSON object'],
    [wrap('null'), 'verdict block is not a JSON object'],
    [undefined, 'no reply text'],
    [42, 'no reply text']
  ]
  for (const [reply, reason] of cases) {
    const r = vd.parseVerdict(reply, expected)
    assert.equal(r.ok, false)
    assert.equal(r.reason, reason)
    assert.deepEqual(r.verdict, want)
  }
})

test('with two blocks the last one wins', () => {
  const good = wrap(valid())
  const bad = wrap('{oops')
  const first = vd.parseVerdict(good + '\n' + bad)
  assert.equal(first.ok, false)
  assert.equal(first.reason, 'verdict block is not valid JSON')
  assert.equal(vd.parseVerdict(bad + '\n' + good).ok, true)
})

test('fence handling', () => {
  assert.equal(vd.parseVerdict(wrap(valid(), '~~~')).ok, true)

  const four = vd.extractBlocks('````decidinator-verdict\n' + JSON.stringify({ a: 1 }) + '\n```\nstill inside\n````\n')
  assert.equal(four.length, 1)
  assert.ok(four[0].includes('```'))
  assert.ok(four[0].includes('still inside'))

  const example = '```markdown\n```decidinator-verdict\n' + JSON.stringify(valid()) + '\n```\n```\n'
  assert.deepEqual(vd.extractBlocks(example), [])

  const unclosed = 'text\n```decidinator-verdict\n' + JSON.stringify(valid())
  assert.equal(vd.parseVerdict(unclosed).ok, true)

  assert.equal(vd.parseVerdict(wrap(valid()).replace(/\n/g, '\r\n')).ok, true)
})
