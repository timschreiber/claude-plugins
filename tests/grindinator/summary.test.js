// Tests for the run summary: rendering rows and notes, gate and outcome text, and writing.
'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const state = require('../../tools/grindinator/lib/state.js')
const { summaryPath, renderSummary, writeSummary } = require('../../tools/grindinator/lib/summary.js')
const h = require('./helpers')

let root

beforeEach(() => {
  root = h.tempDir('grind-summary-')
})

afterEach(() => {
  h.remove(root)
})

const packages = [
  { id: 'WP-01', title: 'One | Pipe', name: 'WP-01.md' },
  { id: 'WP-02', title: 'Two', name: 'WP-02.md' },
  { id: 'WP-03', title: 'Three', name: 'WP-03.md' },
]

function build() {
  const st = state.create({ runName: 't', branch: 'grindinator/t', packagesDir: 'wp', baseCommit: 'abc123' })
  state.ensurePackages(st, packages)
  st.packages['WP-01'].attempts = [
    {
      n: 1, dir: 'runs/WP-01/attempt-1', outcome: 'complete', haltedAt: null, reason: null, commits: 2,
      gate: { status: 'passed', exitCode: 0, timedOut: false },
    },
  ]
  state.markDone(root, 'WP-01')
  st.packages['WP-02'].status = 'failed'
  st.packages['WP-02'].attempts = [
    {
      n: 1, dir: 'runs/WP-02/attempt-1', outcome: 'gate-failed', haltedAt: null, reason: 'the gate exited 1.',
      commits: 1, gate: { status: 'failed', exitCode: 1, timedOut: false },
    },
  ]
  return st
}

const render = (st, decisions = null) =>
  renderSummary({
    root, st, packages, exitCode: 1, stopReason: 'WP-02 failed its gate', now: new Date('2026-10-05T12:00:00Z'), decisions,
  })

test('lists open questions with the export hint', () => {
  const text = render(build(), {
    open: [{ id: 'Q-0001', topic: 'A | B', dependsOn: ['WP-01', 'WP-02'] }],
    sidecar: 'docs/open-questions.md',
  })
  assert.ok(text.includes('\n## Open questions\n\n- Q-0001 · A \\| B (WP-01, WP-02)\n'))
  assert.ok(text.includes('`/decidinator:export`'))
  assert.ok(text.includes('docs/open-questions.md'))
})

test('says None when no questions are open', () => {
  const text = render(build(), { open: [], sidecar: 'docs/open-questions.md' })
  assert.ok(text.endsWith('## Open questions\n\nNone.\n'))
  assert.ok(!text.includes('decidinator:export'))
})

test('omits open questions when Decidinator is off', () => {
  assert.ok(!render(build()).includes('## Open questions'))
})

test('renders header, rows and notes', () => {
  const text = render(build())
  assert.ok(text.endsWith('\n'))
  const lines = text.split('\n')
  for (const l of [
    '# Grindinator run t',
    '- Branch: grindinator/t',
    '- Base commit: abc123',
    '- Ended: 2026-10-05T12:00:00.000Z',
    '- Exit code: 1',
    '- Stop reason: WP-02 failed its gate',
    '| Package | Title | Status | Attempts | Outcome | Commits | Gate |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| WP-01 | One \\| Pipe | done | 1 | complete | 2 | passed |',
    '| WP-02 | Two | failed | 1 | gate-failed | 1 | failed (exit 1) |',
    '| WP-03 | Three | pending | 0 | - | - | - |',
    '## Details',
    '- WP-02, attempt 1: the gate exited 1. Logs: .grindinator/runs/WP-02/attempt-1/',
  ]) {
    assert.ok(lines.includes(l), `missing line: ${l}`)
  }
  assert.ok(!text.includes('## Limit waits'))
})

test('lists limit waits', () => {
  const st = build()
  const S = '2026-10-05T06:00:00.000Z'
  const E = '2026-10-05T06:30:00.000Z'
  const W = '2026-10-05T11:00:00.000Z'
  const waits = [
    { source: 'stream', resetsAt: '2026-10-05T05:51:51.000Z', wakeAt: '2026-10-05T05:56:51.000Z', status: 'woke', startedAt: '2026-10-05T05:00:00.000Z', endedAt: '2026-10-05T05:56:51.000Z' },
    { source: 'fallback', resetsAt: null, wakeAt: W, status: 'interrupted', startedAt: S, endedAt: E },
    { source: 'result-file', status: 'over-cap', startedAt: null, endedAt: null },
    { source: 'result-file', status: 'weekly' },
    { source: 'stream', status: 'waiting', startedAt: S, wakeAt: W },
  ]
  st.packages['WP-03'].attempts = waits.map((wait, i) => ({
    n: i + 1, dir: `runs/WP-03/attempt-${i + 1}`, outcome: 'limit', haltedAt: null, reason: null, commits: 0, gate: null, wait,
  }))
  const text = render(st)
  const lines = text.split('\n')
  assert.ok(lines.includes('## Limit waits'))
  for (const l of [
    '- WP-03, attempt 1: waited from 2026-10-05T05:00:00.000Z to 2026-10-05T05:56:51.000Z (reset 2026-10-05T05:51:51.000Z, from the stream)',
    `- WP-03, attempt 2: waited from ${S}, interrupted at ${E} (reset unknown, none reported; fixed five-hour wait)`,
    '- WP-03, attempt 3: did not wait: over the limit-wait cap (reset unknown, from the result file)',
    '- WP-03, attempt 4: did not wait: the reset is more than 24 hours away (reset unknown, from the result file)',
    `- WP-03, attempt 5: waiting since ${S} until ${W} (reset unknown, from the stream)`,
  ]) {
    assert.ok(lines.includes(l), `missing line: ${l}`)
  }
})

test('gate and outcome text through rendered rows', () => {
  const st = build()
  const set = (id, attempt) => {
    st.packages[id].attempts = [{ n: 1, dir: `runs/${id}/attempt-1`, reason: null, commits: 0, haltedAt: null, outcome: 'complete', ...attempt }]
  }
  set('WP-01', { gate: { status: 'skipped', exitCode: null, timedOut: false } })
  set('WP-02', { gate: { status: 'failed', exitCode: null, timedOut: true } })
  set('WP-03', { outcome: 'halted', haltedAt: 'T02', gate: { status: 'interrupted', exitCode: null, timedOut: false } })
  const lines = render(st).split('\n')
  assert.ok(lines.includes('| WP-01 | One \\| Pipe | done | 1 | complete | 0 | none configured |'))
  assert.ok(lines.includes('| WP-02 | Two | failed | 1 | complete | 0 | failed (timed out) |'))
  assert.ok(lines.includes('| WP-03 | Three | pending | 1 | halted at T02 | 0 | interrupted |'))
})

test('writeSummary writes summaryPath with the given text', () => {
  writeSummary(root, 'hello\n')
  assert.equal(fs.readFileSync(summaryPath(root), 'utf8'), 'hello\n')
})
