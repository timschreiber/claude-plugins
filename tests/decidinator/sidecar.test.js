'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const sc = require('../../plugins/decidinator/scripts/lib/sidecar.js')

const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'formats', 'open-questions-hand-edited.md'), 'utf8')
const HELPER = path.join(__dirname, 'fixtures', 'append-many.js')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-sidecar-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const copyFixture = (text = FIXTURE) => {
  const f = path.join(dir, 'open-questions.md')
  fs.writeFileSync(f, text)
  return f
}
const question = (id) => sc.parse(FIXTURE).entries.find((e) => e.id === id).question
const diffLines = (a, b) => {
  const x = a.split('\n')
  const y = b.split('\n')
  return { same: x.length === y.length, changed: x.map((l, i) => i).filter((i) => x[i] !== y[i]) }
}

test('round trip is byte-exact: plain, CRLF and BOM', () => {
  for (const t of [FIXTURE, FIXTURE.replace(/\n/g, '\r\n'), '﻿' + FIXTURE]) {
    assert.equal(sc.serialize(sc.parse(t)), t)
  }
})

test('Q-0004 parses with options, labels, stakeholder and the free-text answer', () => {
  const q = question('Q-0004')
  assert.deepEqual(q.options, [
    { label: 'CSV', tradeoffs: 'Simple, opens anywhere.' },
    { label: 'XLSX', tradeoffs: 'Keeps formatting,\nneeds a library.' }
  ])
  assert.deepEqual(q.dependsOn, ['WP-05', 'session abc on main'])
  assert.equal(q.stakeholder, 'Finance')
  assert.equal(q.status, 'open')
  assert.equal(q.provisionalDecision, 'D-0003')
  assert.equal(q.answer, 'XLSX, because finance\nreformats every CSV by hand.\nExtra paragraph the PM added.')
})

test('Q-0009 parses empty', () => {
  const q = question('Q-0009')
  assert.deepEqual(q.options, [])
  assert.deepEqual(q.dependsOn, [])
  assert.equal(q.stakeholder, null)
  assert.equal(q.answer, '')
})

test('answers returns only filled ones', () => {
  assert.deepEqual(sc.answers(sc.parse(FIXTURE)).map((a) => a.id), ['Q-0004'])
})

test('append to a missing file writes marker, entry and a blank Answer', () => {
  const f = path.join(dir, 'sub', 'open-questions.md')
  const input = {
    topic: 'Export',
    question: 'CSV or XLSX?',
    context: 'A download.',
    options: [{ label: 'CSV', tradeoffs: 'Simple.\nPortable.' }, { label: 'XLSX', tradeoffs: 'Rich.' }],
    provisionalAnswer: 'CSV',
    provisionalDecision: 'D-0001',
    dependsOn: ['WP-05'],
    stakeholder: 'Finance'
  }
  const r = sc.append(f, input)
  assert.deepEqual(r, { ok: true, id: 'Q-0001' })
  const text = fs.readFileSync(f, 'utf8')
  assert.ok(text.startsWith('<!-- decidinator-sidecar v1 -->\n\n### Q-0001 · Export\n'))
  assert.ok(text.endsWith('- **Answer:**\n'))
  const q = sc.read(f).model.entries[0].question
  assert.equal(q.topic, 'Export')
  assert.deepEqual(q.options, input.options.map((o) => ({ ...o, tradeoffs: o.tradeoffs })))
  assert.equal(q.provisionalAnswer, 'CSV')
  assert.deepEqual(q.dependsOn, ['WP-05'])
  assert.equal(q.stakeholder, 'Finance')
  assert.equal(q.status, 'open')
  assert.equal(q.answer, '')
})

test('append to the fixture returns Q-0010; explicit IDs work once', () => {
  const f = copyFixture()
  assert.equal(sc.append(f, { topic: 't', question: 'q' }).id, 'Q-0010')
  assert.ok(fs.readFileSync(f, 'utf8').startsWith(FIXTURE))
  assert.equal(sc.append(f, { id: 'Q-0042', topic: 't', question: 'q2' }).id, 'Q-0042')
  const again = sc.append(f, { id: 'Q-0042', topic: 't', question: 'q3' })
  assert.equal(again.ok, false)
  assert.match(again.error, /Q-0042 already exists/)
})

test('addDependsOn changes only the one line', () => {
  const f = copyFixture()
  assert.deepEqual(sc.addDependsOn(f, 'Q-0004', 'WP-07'), { ok: true, added: true })
  const after = fs.readFileSync(f, 'utf8')
  const d = diffLines(FIXTURE, after)
  assert.equal(d.same, true)
  assert.equal(d.changed.length, 1)
  assert.equal(after.split('\n')[d.changed[0]], '- **Depends on:** WP-05; session abc on main; WP-07')
  assert.deepEqual(sc.addDependsOn(f, 'Q-0004', 'WP-07'), { ok: true, added: false })
  assert.equal(fs.readFileSync(f, 'utf8'), after)
  sc.addDependsOn(f, 'Q-0009', 'WP-07')
  assert.ok(fs.readFileSync(f, 'utf8').includes('- **Depends on:** WP-07\n'))
  assert.equal(sc.addDependsOn(f, 'Q-0099', 'x').ok, false)
  assert.equal(sc.addDependsOn(f, 'Q-0004', '  ').ok, false)
})

test('setStatus changes only the Status line', () => {
  const f = copyFixture()
  assert.equal(sc.setStatus(f, 'Q-0004', 'answered').ok, true)
  const after = fs.readFileSync(f, 'utf8')
  const d = diffLines(FIXTURE, after)
  assert.equal(d.changed.length, 1)
  assert.equal(after.split('\n')[d.changed[0]], '- **Status:** answered')
  assert.equal(sc.setStatus(f, 'Q-0004', 'closed').ok, false)
  assert.equal(fs.readFileSync(f, 'utf8'), after)
})

test('setStatus inserts a Status line that was removed by hand', () => {
  const f = copyFixture(FIXTURE.replace('- **Status:** open\n- **Answer:**\n', '- **Answer:**\n'))
  assert.equal(sc.setStatus(f, 'Q-0009', 'imported').ok, true)
  const q = sc.read(f).model.entries.find((e) => e.id === 'Q-0009').question
  assert.equal(q.status, 'imported')
  assert.equal(q.answer, '')
})

test('refusals name the file and leave it untouched', () => {
  const v2 = copyFixture(FIXTURE.replace('sidecar v1', 'sidecar v2'))
  const r = sc.append(v2, { topic: 't', question: 'q' })
  assert.equal(r.ok, false)
  assert.ok(r.error.includes(v2) && r.error.includes('v2'))
  assert.equal(fs.readFileSync(v2, 'utf8'), FIXTURE.replace('sidecar v1', 'sidecar v2'))

  const logFile = path.join(dir, 'log.md')
  fs.writeFileSync(logFile, '<!-- decidinator-log v1 -->\n')
  assert.equal(sc.append(logFile, { topic: 't', question: 'q' }).ok, false)
  assert.equal(sc.setStatus(logFile, 'Q-0001', 'open').ok, false)
  assert.equal(fs.readFileSync(logFile, 'utf8'), '<!-- decidinator-log v1 -->\n')
})

test('validate rejects each bad field', () => {
  const base = { topic: 't', question: 'q' }
  assert.equal(sc.validate(base), null)
  const bad = [
    ['topic', ''], ['question', 3], ['id', 'D-0001'], ['options', 'x'], ['options', [{ label: '', tradeoffs: '' }]],
    ['options', [{ label: 'a' }]], ['provisionalDecision', 'Q-0001'], ['dependsOn', [1]], ['status', 'closed'],
    ['context', 1], ['provisionalAnswer', 1], ['stakeholder', 1]
  ]
  for (const [key, value] of bad) {
    const p = sc.validate({ ...base, [key]: value })
    assert.ok(p && p.includes(`"${key}"`), `${key}=${JSON.stringify(value)} -> ${p}`)
  }
  assert.ok(sc.validate(null))
})

test('two simultaneous appends both land with distinct IDs', async () => {
  const f = path.join(dir, 'open-questions.md')
  const run = () => new Promise((resolve) => {
    const p = spawn(process.execPath, [HELPER, 'sidecar', f, '10'], { stdio: 'inherit' })
    p.on('exit', resolve)
  })
  assert.deepEqual(await Promise.all([run(), run()]), [0, 0])
  const ids = sc.read(f).model.entries.map((e) => e.id)
  assert.deepEqual(ids, Array.from({ length: 20 }, (_, i) => `Q-${String(i + 1).padStart(4, '0')}`))
  assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith('.lock') || n.endsWith('.tmp')), [])
})

test('findByQuestion matches by normalized text', () => {
  assert.deepEqual(sc.findByQuestion(sc.parse(FIXTURE), 'should exports be csv or xlsx').map((q) => q.id), ['Q-0004'])
})
