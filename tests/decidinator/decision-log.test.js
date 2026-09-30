'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const log = require('../../plugins/decidinator/scripts/lib/decision-log.js')

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'formats', 'decisions-hand-edited.md'), 'utf8')
const HELPER = path.join(__dirname, 'fixtures', 'append-many.js')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-log-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const copyFixture = () => {
  const f = path.join(dir, 'decisions.md')
  fs.writeFileSync(f, FIXTURE)
  return f
}
const base = () => ({
  title: 'T',
  question: 'Q?',
  answer: 'A',
  provenance: 'user',
  date: '2026-09-29'
})

test('round trip is byte-exact: plain, CRLF and BOM', () => {
  for (const t of [FIXTURE, FIXTURE.replace(/\n/g, '\r\n'), '﻿' + FIXTURE]) {
    assert.equal(log.serialize(log.parse(t)), t)
  }
})

test('typed decisions from the hand-edited fixture', () => {
  const [a, b] = log.parse(FIXTURE).entries.map((e) => e.decision)
  assert.equal(a.rung, 1)
  assert.deepEqual(a.sources, ['https://example.com/rate-limits', 'src/cache.js'])
  assert.deepEqual(a.assumptions, [])
  assert.deepEqual(a.flags, [])
  assert.equal(a.supersededBy, null)
  assert.equal(a.confidence, 'high')
  assert.equal(b.rung, null)
  assert.equal(b.confidence, null)
  assert.equal(b.supersedes, 'D-0001')
})

test('append to a missing file creates the marker and the entry', () => {
  const f = path.join(dir, 'sub', 'decisions.md')
  const r = log.append(f, { ...base(), rung: null, confidence: null, sources: [] })
  assert.deepEqual(r, { ok: true, id: 'D-0001' })
  assert.equal(
    fs.readFileSync(f, 'utf8'),
    [
      '<!-- decidinator-log v1 -->',
      '',
      '### D-0001 · T',
      '',
      '- **Question:** Q?',
      '- **Answer:** A',
      '- **Rationale:**',
      '- **Provenance:** user',
      '- **Confidence:** none',
      '- **Rung:** none',
      '- **Sources:** none',
      '- **Assumptions:** none',
      '- **Flags:** none',
      '- **Question ID:**',
      '- **Context:**',
      '- **Date:** 2026-09-29',
      ''
    ].join('\n')
  )
})

test('flags are written, parsed back and validated', () => {
  const f = path.join(dir, 'decisions.md')
  const r = log.append(f, { ...base(), flags: ['cross-cutting'] })
  assert.equal(r.ok, true)
  assert.ok(fs.readFileSync(f, 'utf8').includes('- **Flags:** cross-cutting'))
  assert.deepEqual(log.read(f).model.entries[0].decision.flags, ['cross-cutting'])
  const bad = log.append(f, { ...base(), flags: ['bogus'] })
  assert.equal(bad.ok, false)
  assert.equal(bad.error, 'decision: "flags" may only contain spec-silent, spec-contradiction, cross-cutting, conflicts-binding')
})

test('append to the fixture keeps every byte and parses back', () => {
  const f = copyFixture()
  const input = { ...base(), answer: 'Line one.\nLine two.', rung: 2, confidence: 'medium', sources: ['a', 'b'], assumptions: ['x'], questionId: 'Q-0005', context: 'WP-03', rationale: 'Because.' }
  const r = log.append(f, input)
  assert.equal(r.id, 'D-0003')
  const after = fs.readFileSync(f, 'utf8')
  assert.ok(after.startsWith(FIXTURE + '\n'))
  const d = log.read(f).model.entries.find((e) => e.id === 'D-0003').decision
  assert.equal(d.answer, 'Line one.\nLine two.')
  assert.equal(d.rung, 2)
  assert.equal(d.confidence, 'medium')
  assert.deepEqual(d.sources, ['a', 'b'])
  assert.deepEqual(d.assumptions, ['x'])
  assert.equal(d.questionId, 'Q-0005')
  assert.equal(d.provenance, 'user')
  assert.equal(d.date, '2026-09-29')
})

test('append with supersedes marks the old entry', () => {
  const f = copyFixture()
  const r = log.append(f, { ...base(), supersedes: 'D-0001' })
  assert.equal(r.id, 'D-0003')
  const text = fs.readFileSync(f, 'utf8')
  assert.ok(text.includes('- **Date:** 2026-09-29\n- **Superseded by:** D-0003\nReviewer note'))
  const [a] = log.parse(text).entries.map((e) => e.decision)
  assert.equal(a.supersededBy, 'D-0003')
  const again = log.append(f, { ...base(), supersedes: 'D-0001' })
  assert.equal(again.ok, false)
  assert.match(again.error, /already superseded by D-0003/)
  assert.equal(log.append(f, { ...base(), supersedes: 'D-0099' }).ok, false)
  assert.equal(fs.readFileSync(f, 'utf8'), text)
})

test('markSuperseded is idempotent for the same ID and refuses another', () => {
  const f = copyFixture()
  assert.equal(log.markSuperseded(f, 'D-0001', 'D-0002').ok, true)
  const once = fs.readFileSync(f, 'utf8')
  assert.equal(log.markSuperseded(f, 'D-0001', 'D-0002').ok, true)
  assert.equal(fs.readFileSync(f, 'utf8'), once)
  const r = log.markSuperseded(f, 'D-0001', 'D-0001')
  assert.equal(r.ok, false)
  assert.equal(log.markSuperseded(f, 'D-0009', 'D-0002').ok, false)
})

test('refusals name the file and leave it untouched', () => {
  const v2 = path.join(dir, 'v2.md')
  const v2Text = '<!-- decidinator-log v2 -->\n\n### D-0001 · x\n'
  fs.writeFileSync(v2, v2Text)
  const r2 = log.append(v2, base())
  assert.equal(r2.ok, false)
  assert.ok(r2.error.includes(v2) && r2.error.includes('v2'))
  assert.equal(fs.readFileSync(v2, 'utf8'), v2Text)

  const plain = path.join(dir, 'plain.md')
  fs.writeFileSync(plain, '# My own decisions\n')
  const r0 = log.append(plain, base())
  assert.equal(r0.ok, false)
  assert.ok(r0.error.includes(plain))
  assert.equal(fs.readFileSync(plain, 'utf8'), '# My own decisions\n')
})

test('validate rejects each bad field', () => {
  const bad = [
    ['title', ''], ['question', ' '], ['answer', 3], ['provenance', 'guess'], ['confidence', 'sure'],
    ['rung', 0], ['rung', 1.5], ['sources', 'x'], ['assumptions', [1]], ['rationale', 5], ['questionId', 5],
    ['context', 5], ['date', '29/09/2026'], ['supersedes', 'Q-0001'], ['sidecar', 'D-0001']
  ]
  assert.equal(log.validate(base()), null)
  for (const [key, value] of bad) {
    const p = log.validate({ ...base(), [key]: value })
    assert.ok(p && p.includes(`"${key}"`), `${key}=${JSON.stringify(value)} -> ${p}`)
  }
  assert.ok(log.validate(null))
})

test('two simultaneous appends both land with distinct IDs', async () => {
  const f = path.join(dir, 'decisions.md')
  const run = () => new Promise((resolve) => {
    const p = spawn(process.execPath, [HELPER, 'log', f, '10'], { stdio: 'inherit' })
    p.on('exit', resolve)
  })
  const codes = await Promise.all([run(), run()])
  assert.deepEqual(codes, [0, 0])
  const ids = log.read(f).model.entries.map((e) => e.id)
  assert.deepEqual(ids, Array.from({ length: 20 }, (_, i) => `D-${String(i + 1).padStart(4, '0')}`))
  assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith('.lock') || n.endsWith('.tmp')), [])
})

test('findByQuestion matches by normalized text', () => {
  const m = log.parse(FIXTURE)
  const found = log.findByQuestion(m, 'how long should the PROFILE cache live')
  assert.deepEqual(found.map((d) => d.id), ['D-0001'])
})
