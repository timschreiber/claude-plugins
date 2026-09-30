'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const rec = require('../../plugins/decidinator/scripts/lib/record.js')
const decisionLog = require('../../plugins/decidinator/scripts/lib/decision-log.js')
const sidecar = require('../../plugins/decidinator/scripts/lib/sidecar.js')

let dir, logFile, sideFile
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-record-'))
  logFile = path.join(dir, 'decisions.md')
  sideFile = path.join(dir, 'open-questions.md')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const seedLog = (d) => {
  const r = decisionLog.append(logFile, {
    title: 'T', question: 'Q?', answer: 'A', rationale: 'Because.', context: 'WP-03', sources: ['s'], assumptions: ['a'], flags: [],
    confidence: 'medium', rung: 2, date: '2026-09-30', ...d
  })
  assert.ok(r.ok, r.error)
  return r.id
}
const seedSide = (q) => {
  const r = sidecar.append(sideFile, { topic: 'Topic', question: 'Q?', context: 'c', options: [], provisionalAnswer: 'P', dependsOn: ['WP-03'], status: 'open', ...q })
  assert.ok(r.ok, r.error)
  return r.id
}
const decisions = () => decisionLog.read(logFile).model.entries.map((e) => e.decision)
const questions = () => sidecar.read(sideFile).model.entries.map((e) => e.question)
const answerArgs = (extra = {}) => ({
  logFile, sideFile, entryId: 'Q-0001', provenance: 'user', answer: 'Mine', rationale: 'The user answered.', status: 'answered', ...extra
})

function seedProvisional() {
  seedSide({ provisionalDecision: 'D-0001' })
  seedLog({ answer: 'P', provenance: 'oracle-provisional', questionId: 'Q-0001', sidecar: 'Q-0001' })
}

test('an entry answer supersedes the provisional decision, its duplicates, and sets the status', () => {
  seedProvisional()
  seedLog({ answer: 'P', provenance: 'oracle-provisional', questionId: 'Q-0002', sidecar: 'Q-0001' })
  const r = rec.recordEntryAnswer(answerArgs())
  assert.equal(r.ok, true)
  assert.equal(r.id, 'D-0003')
  assert.equal(r.supersedes, 'D-0001')
  assert.deepEqual(r.alsoSuperseded, ['D-0002'])
  assert.deepEqual(r.warnings, [])
  const [d1, d2, d3] = decisions()
  assert.equal(d1.supersededBy, 'D-0003')
  assert.equal(d2.supersededBy, 'D-0003')
  assert.equal(d3.provenance, 'user')
  assert.equal(d3.answer, 'Mine')
  assert.equal(d3.supersedes, 'D-0001')
  assert.equal(d3.sidecar, 'Q-0001')
  assert.equal(d3.questionId, 'Q-0001')
  assert.equal(d3.context, 'WP-03')
  assert.equal(d3.confidence, null)
  assert.equal(d3.rung, null)
  assert.equal(questions()[0].status, 'answered')
})

test('an entry with no provisional decision gets no Supersedes line', () => {
  seedSide({ provisionalDecision: '', provisionalAnswer: 'none: no oracle returned a valid verdict', dependsOn: ['A', 'B'] })
  const r = rec.recordEntryAnswer(answerArgs({ provenance: 'stakeholder', status: 'imported' }))
  assert.equal(r.ok, true)
  assert.equal(r.supersedes, null)
  const d = decisions()[0]
  assert.equal(d.supersedes, null)
  assert.equal(d.provenance, 'stakeholder')
  assert.equal(d.context, 'A, B')
  assert.equal(questions()[0].status, 'imported')
})

test('an entry that is not open is skipped and nothing is written', () => {
  seedProvisional()
  sidecar.setStatus(sideFile, 'Q-0001', 'imported')
  const before = fs.readFileSync(logFile, 'utf8')
  const r = rec.recordEntryAnswer(answerArgs())
  assert.equal(r.ok, false)
  assert.equal(r.skipped, true)
  assert.equal(r.error, 'Q-0001 is already imported')
  assert.equal(fs.readFileSync(logFile, 'utf8'), before)
})

test('a missing entry is an error', () => {
  seedProvisional()
  const r = rec.recordEntryAnswer(answerArgs({ entryId: 'Q-0009' }))
  assert.equal(r.ok, false)
  assert.ok(r.error.endsWith('Q-0009 not found'))
})

test('confirm approve writes oracle-confirmed, copies the fields and answers the entry', () => {
  seedProvisional()
  const r = rec.recordConfirm({ logFile, sideFile, decisionId: 'D-0001', approve: true, notes: '' })
  assert.equal(r.ok, true)
  assert.equal(r.id, 'D-0002')
  assert.equal(r.supersedes, 'D-0001')
  const [d1, d2] = decisions()
  assert.equal(d1.supersededBy, 'D-0002')
  assert.equal(d2.provenance, 'oracle-confirmed')
  assert.equal(d2.answer, 'P')
  assert.equal(d2.rationale, 'Because.')
  assert.equal(d2.confidence, 'medium')
  assert.equal(d2.rung, 2)
  assert.deepEqual(d2.sources, ['s'])
  assert.deepEqual(d2.assumptions, ['a'])
  assert.equal(d2.supersedes, 'D-0001')
  assert.equal(d2.sidecar, 'Q-0001')
  assert.equal(questions()[0].status, 'answered')
})

test('confirm approve with notes adds them to the rationale', () => {
  seedLog({ provenance: 'oracle-unconfirmed', questionId: 'Q-0005' })
  const r = rec.recordConfirm({ logFile, sideFile, decisionId: 'D-0001', approve: true, notes: 'Looks right.' })
  assert.equal(r.ok, true)
  const d = decisions()[1]
  assert.equal(d.rationale, 'Because.\nConfirmed with notes: Looks right.')
  assert.equal(d.sidecar, null)
})

test('confirm override writes a user decision that supersedes', () => {
  seedProvisional()
  const r = rec.recordConfirm({ logFile, sideFile, decisionId: 'D-0001', approve: false, answer: 'Other' })
  assert.equal(r.ok, true)
  const d = decisions()[1]
  assert.equal(d.provenance, 'user')
  assert.equal(d.answer, 'Other')
  assert.equal(d.supersedes, 'D-0001')
  assert.equal(d.confidence, null)
  assert.equal(d.rung, null)
  assert.deepEqual(d.sources, [])
})

test('confirm skips a superseded or already binding decision', () => {
  seedProvisional()
  assert.equal(rec.recordConfirm({ logFile, sideFile, decisionId: 'D-0001', approve: true, notes: '' }).ok, true)
  const again = rec.recordConfirm({ logFile, sideFile, decisionId: 'D-0001', approve: true, notes: '' })
  assert.equal(again.skipped, true)
  assert.equal(again.error, 'D-0001 is already superseded by D-0002')
  const binding = rec.recordConfirm({ logFile, sideFile, decisionId: 'D-0002', approve: true, notes: '' })
  assert.equal(binding.skipped, true)
  assert.equal(binding.error, 'D-0002 is oracle-confirmed, not unconfirmed')
  assert.equal(rec.recordConfirm({ logFile, sideFile, decisionId: 'D-0009', approve: true, notes: '' }).ok, false)
})

test('every written file parses back', () => {
  seedProvisional()
  rec.recordEntryAnswer(answerArgs())
  assert.equal(decisionLog.read(logFile).ok, true)
  assert.equal(sidecar.read(sideFile).ok, true)
})
