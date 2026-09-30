'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const report = require('../../plugins/decidinator/scripts/lib/report.js')
const recorded = require('./fixtures/recorded.js')

const asst = (content, model) => ({ type: 'assistant', message: { content, model } })

test('readJsonLines: missing, undefined and empty paths give []', () => {
  assert.deepEqual(report.readJsonLines(path.join(os.tmpdir(), 'no-such-file-decidinator.jsonl')), [])
  assert.deepEqual(report.readJsonLines(undefined), [])
  assert.deepEqual(report.readJsonLines(''), [])
})

test('readJsonLines: keeps only valid object lines', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcd-report-'))
  try {
    const file = path.join(dir, 't.jsonl')
    fs.writeFileSync(file, '{"a":1}\n\n{bad\nnull\n')
    assert.deepEqual(report.readJsonLines(file), [{ a: 1 }])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('transcriptReport: last assistant text, joined blocks', () => {
  const lines = [
    { type: 'user', message: { content: 'hi' } },
    asst([{ type: 'text', text: 'first' }]),
    asst([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]),
    asst([{ type: 'thinking', thinking: 'hmm' }])
  ]
  assert.equal(report.transcriptReport(lines), 'a\nb')
})

test('transcriptReport: a SubagentHandback message beats text', () => {
  const lines = [
    asst([
      { type: 'text', text: 'x' },
      { type: 'tool_use', name: 'SubagentHandback', input: { message: 'report' } }
    ])
  ]
  assert.equal(report.transcriptReport(lines), 'report')
})

test('transcriptReport: no lines gives null', () => {
  assert.equal(report.transcriptReport([]), null)
})

test('transcriptModels: distinct real models in first-seen order', () => {
  const lines = [
    asst([], 'claude-opus-5-5'),
    asst([], '<synthetic>'),
    asst([], 'claude-opus-5-5'),
    asst([], 'claude-sonnet-5-5'),
    { type: 'user' }
  ]
  assert.deepEqual(report.transcriptModels(lines), ['claude-opus-5-5', 'claude-sonnet-5-5'])
})

test('findReport: order of preference', () => {
  const input = recorded.input('decidinator-probe-normal-default-hooks.jsonl', (r) => r.event === 'SubagentStop')
  const lines = [asst([{ type: 'text', text: 'from transcript' }])]
  const handbacks = { [input.agent_id]: 'hb' }

  assert.deepEqual(
    report.findReport({ ...input, last_assistant_message: 'lam' }, handbacks, lines),
    { source: 'last_assistant_message', text: 'lam' }
  )
  assert.deepEqual(
    report.findReport({ ...input, last_assistant_message: '  ' }, handbacks, lines),
    { source: 'SubagentHandback', text: 'hb' }
  )
  assert.deepEqual(report.findReport(input, handbacks, lines), { source: 'SubagentHandback', text: 'hb' })
  assert.deepEqual(report.findReport(input, {}, lines), { source: 'agent_transcript_path', text: 'from transcript' })
  assert.deepEqual(report.findReport(input, {}, []), { source: null, text: null })
})

test('reportQuestionId', () => {
  const input = recorded.input('decidinator-probe-oracle-clear-hooks.jsonl', (r) => r.event === 'SubagentStop')
  assert.equal(report.reportQuestionId(input.last_assistant_message), 'Q-0002')
  assert.equal(report.reportQuestionId('no block here'), null)
  assert.equal(report.reportQuestionId('```decidinator-verdict\n{bad\n```'), null)
  assert.equal(report.reportQuestionId(42), null)
})
