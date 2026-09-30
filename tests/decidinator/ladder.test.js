'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const { next } = require(path.join(lib, 'ladder.js'))
const { fallback } = require(path.join(lib, 'verdict.js'))

const e = (rung, kind, status, confidence, flags = []) => ({
  rung,
  ok: true,
  verdict: {
    question_id: 'Q-0001',
    rung,
    kind,
    status,
    answer: 'a',
    rationale: 'r',
    options: status === 'unresolved' ? [{ label: 'x', tradeoffs: '' }] : [],
    sources: ['s'],
    assumptions: [],
    confidence,
    flags,
    duplicate_of: null
  }
})

const bad = (rung) => ({ rung, ok: false, reason: 'no reply text', verdict: fallback({ questionId: 'Q-0001', rung }) })

const R3 = ['a', 'b', 'c']
const resolved = (rung) => ({ outcome: 'resolved', rung })
const escalate = (rung) => ({ outcome: 'escalate', rung })
const final = (rung) => ({ outcome: 'final-unresolved', rung })

const cases = [
  ['resolved high no flags', [e(1, 'researchable', 'resolved', 'high')], R3, resolved(1)],
  ['resolved medium', [e(1, 'researchable', 'resolved', 'medium')], R3, resolved(1)],
  ['resolved low', [e(1, 'researchable', 'resolved', 'low')], R3, escalate(2)],
  ['unresolved high researchable', [e(1, 'researchable', 'unresolved', 'high')], R3, escalate(2)],
  ['resolved high spec-silent', [e(1, 'researchable', 'resolved', 'high', ['spec-silent'])], R3, escalate(2)],
  ['resolved high spec-contradiction', [e(1, 'researchable', 'resolved', 'high', ['spec-contradiction'])], R3, escalate(2)],
  ['resolved high cross-cutting', [e(1, 'researchable', 'resolved', 'high', ['cross-cutting'])], R3, escalate(2)],
  ['resolved high conflicts-binding', [e(1, 'researchable', 'resolved', 'high', ['conflicts-binding'])], R3, resolved(1)],
  ['unresolved medium at rung 2', [e(2, 'researchable', 'unresolved', 'medium')], R3, escalate(3)],
  ['top rung resolved low spec-silent', [e(3, 'researchable', 'resolved', 'low', ['spec-silent'])], R3, resolved(3)],
  ['top rung unresolved low', [e(3, 'researchable', 'unresolved', 'low')], R3, final(3)],
  ['human-only unresolved low with flags', [e(1, 'human-only', 'unresolved', 'low', ['spec-silent', 'cross-cutting'])], R3, final(1)],
  ['human-only resolved high', [e(1, 'human-only', 'resolved', 'high')], R3, resolved(1)],
  ['invalid verdict', [bad(1)], R3, escalate(2)],
  ['invalid verdict at top', [bad(3)], R3, final(3)],
  ['one rung unresolved low', [e(1, 'researchable', 'unresolved', 'low')], ['a'], final(1)],
  ['no verdicts', [], R3, escalate(1)],
  ['undefined verdicts', undefined, R3, escalate(1)],
  [
    'highest rung wins',
    [e(1, 'researchable', 'unresolved', 'low'), e(2, 'researchable', 'resolved', 'high')],
    R3,
    resolved(2)
  ],
  [
    'highest rung wins, reversed order',
    [e(2, 'researchable', 'resolved', 'high'), e(1, 'researchable', 'unresolved', 'low')],
    R3,
    resolved(2)
  ],
  [
    'config shrank, resolved with escalating flag',
    [e(3, 'researchable', 'resolved', 'medium', ['spec-silent'])],
    ['a', 'b'],
    resolved(3)
  ],
  ['config shrank, unresolved', [e(3, 'researchable', 'unresolved', 'medium')], ['a', 'b'], final(3)],
  ['ok true but verdict missing', [{ rung: 1, ok: true }], R3, escalate(2)]
]

test('ladder rules', () => {
  for (const [name, verdicts, rungs, expected] of cases) {
    assert.deepEqual(next(verdicts, rungs), expected, name)
  }
})
