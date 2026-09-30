'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const X = require('../../plugins/decidinator/scripts/lib/export.js')
const sidecar = require('../../plugins/decidinator/scripts/lib/sidecar.js')

test('defaultPath adds the date next to the sidecar', () => {
  assert.equal(X.defaultPath('docs/open-questions.md', '2026-09-30'), 'docs/open-questions-2026-09-30.md')
  assert.equal(X.defaultPath('questions', '2026-09-30'), 'questions-2026-09-30.md')
  assert.equal(X.defaultPath('a\\b.txt', '2026-09-30'), 'a/b-2026-09-30.txt')
  assert.equal(X.defaultPath('open.md', '2026-09-30'), 'open-2026-09-30.md')
})

const q = (id, extra = {}) => ({
  id,
  topic: `Topic ${id}`,
  question: `Question ${id}?`,
  context: 'Why it came up.',
  options: [{ label: 'Yes', tradeoffs: 'fast' }],
  provisionalAnswer: 'Yes',
  provisionalDecision: 'D-0001',
  dependsOn: ['WP-03'],
  stakeholder: null,
  status: 'open',
  ...extra
})

test('render groups by stakeholder, then topic, and parses back', () => {
  const text = X.render([q('Q-0003'), q('Q-0002', { stakeholder: 'bob' }), q('Q-0001', { stakeholder: 'Alice' })], {
    source: 'docs/open-questions.md',
    date: '2026-09-30'
  })
  assert.ok(text.startsWith('<!-- decidinator-sidecar v1 -->\n\n# Open questions\n\nExported 2026-09-30 from docs/open-questions.md: 3 open questions.'))
  assert.ok(text.endsWith('\n'))
  const headings = text.split('\n').filter((l) => l.startsWith('## '))
  assert.deepEqual(headings, ['## Stakeholder: Alice', '## Stakeholder: bob', '## Topic: Topic Q-0003'])
  const m = sidecar.parse(text)
  assert.deepEqual(m.marker, { kind: 'sidecar', major: 1 })
  assert.deepEqual(m.entries.map((e) => e.id), ['Q-0001', 'Q-0002', 'Q-0003'])
  for (const e of m.entries) {
    assert.equal(e.question.status, 'open')
    assert.equal(e.question.answer, '')
  }
  assert.equal(m.entries[0].question.stakeholder, 'Alice')
  assert.deepEqual(m.entries[0].question.options, [{ label: 'Yes', tradeoffs: 'fast' }])
})

test('render of one question says "1 open question"', () => {
  const text = X.render([q('Q-0001')], { source: 's.md', date: '2026-09-30' })
  assert.ok(text.includes('from s.md: 1 open question.'))
})

test('displayPath is relative inside the project and absolute outside', () => {
  const project = path.join(path.sep, 'p', 'proj')
  assert.equal(X.displayPath(project, path.join(project, 'docs', 'x.md')), 'docs/x.md')
  const outside = path.join(path.sep, 'p', 'other', 'x.md')
  assert.equal(X.displayPath(project, outside), outside)
  assert.equal(X.displayPath(project, project), project)
})
