'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const md = require('../../plugins/decidinator/scripts/lib/mdfile.js')

const FIX = path.join(__dirname, 'fixtures', 'formats', 'decisions-hand-edited.md')
const fixtureText = () => fs.readFileSync(FIX, 'utf8')
const lines = (t) => md.splitLines(t)

test('the fixtures have the bytes the tests rely on', () => {
  const t = fixtureText()
  assert.equal(t.endsWith('\n'), false)
  assert.ok(t.includes('Tuesday.   \n'))
  const side = fs.readFileSync(path.join(__dirname, 'fixtures', 'formats', 'open-questions-hand-edited.md'), 'utf8')
  assert.ok(side.endsWith('- **Answer:**\n'))
})

test('splitLines and joinLines round-trip', () => {
  for (const t of ['', 'a', 'a\n', 'a\r\nb\n', 'a\r\nb', '\n\n', 'x\ry\n', '﻿hello\nworld\n']) {
    assert.equal(md.joinLines(md.splitLines(t)), t)
  }
  assert.deepEqual(md.splitLines('x\ry\n'), [{ text: 'x\ry', eol: '\n' }])
  assert.deepEqual(md.splitLines(''), [])
})

test('readMarker', () => {
  assert.deepEqual(md.readMarker(lines('<!-- decidinator-log v1 -->\n')), { kind: 'log', major: 1 })
  assert.deepEqual(md.readMarker(lines('<!-- decidinator-log v1.3 -->\n')), { kind: 'log', major: 1 })
  assert.deepEqual(md.readMarker(lines('<!-- decidinator-log v2 -->\n')), { kind: 'log', major: 2 })
  assert.deepEqual(md.readMarker(lines('<!-- decidinator-sidecar v1 -->\n')), { kind: 'sidecar', major: 1 })
  assert.deepEqual(md.readMarker(lines('﻿<!-- decidinator-log v1 -->\n')), { kind: 'log', major: 1 })
  assert.equal(md.readMarker(lines('# Decisions\n')), null)
})

test('checkWritable', () => {
  assert.deepEqual(md.checkWritable('f.md', lines(''), 'log'), { ok: true, fresh: true })
  assert.deepEqual(md.checkWritable('f.md', lines('  \n\n'), 'log'), { ok: true, fresh: true })
  assert.deepEqual(md.checkWritable('f.md', lines('<!-- decidinator-log v1 -->\n'), 'log'), { ok: true, fresh: false })
  const none = md.checkWritable('f.md', lines('# Notes\n'), 'log')
  assert.equal(none.ok, false)
  assert.ok(none.error.includes('f.md') && none.error.includes('not a Decidinator log file'))
  assert.equal(md.checkWritable('f.md', lines('<!-- decidinator-sidecar v1 -->\n'), 'log').ok, false)
  const v2 = md.checkWritable('f.md', lines('<!-- decidinator-log v2 -->\n'), 'log')
  assert.equal(v2.ok, false)
  assert.ok(v2.error.includes('f.md') && v2.error.includes('v2'))
})

test('parseEntries on the hand-edited log', () => {
  const ls = lines(fixtureText())
  const entries = md.parseEntries(ls, 'D')
  assert.deepEqual(entries.map((e) => e.id), ['D-0001', 'D-0002'])
  const [a, b] = entries
  assert.equal(a.title, 'Cache TTL')
  assert.equal(md.field(a, 'Answer').value, 'Five minutes.\nInvalidate on write.')
  assert.equal(md.field(a, 'Date').value, '2026-09-29')
  assert.match(ls[a.end].text, /^## Notes by hand/)
  assert.deepEqual(b.fields.map((f) => f.name), ['Question', 'Provenance', 'Answer', 'Date', 'Rung', 'Confidence', 'Supersedes'])
})

test('insertIndex for D-0001 is the reviewer-note line', () => {
  const ls = lines(fixtureText())
  const a = md.parseEntries(ls, 'D')[0]
  assert.match(ls[md.insertIndex(ls, a)].text, /^Reviewer note/)
})

test('encodeField', () => {
  assert.deepEqual(md.encodeField('Answer', 'a\n\n  b  \n'), ['- **Answer:** a', '  b'])
  assert.deepEqual(md.encodeField('Answer', ''), ['- **Answer:**'])
})

test('lists', () => {
  assert.equal(md.encodeList([]), 'none')
  assert.equal(md.encodeList(['a;b', ' c ']), 'a,b; c')
  assert.deepEqual(md.decodeList('None'), [])
  assert.deepEqual(md.decodeList('a; b ;'), ['a', 'b'])
})

test('appendBlock finishes an unterminated line and separates the block', () => {
  const ls = lines('a')
  md.appendBlock(ls, ['b', 'c'], '\n')
  assert.equal(md.joinLines(ls), 'a\n\nb\nc\n')
})

test('nextId', () => {
  assert.equal(md.nextId([], 'D'), 'D-0001')
  assert.equal(md.nextId([{ num: 9999 }, { num: 3 }], 'D'), 'D-10000')
})
