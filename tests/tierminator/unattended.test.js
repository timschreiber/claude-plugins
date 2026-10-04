'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const unattended = require('../../plugins/tierminator/scripts/lib/unattended.js')

let dir
let savedConfigDir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-unattended-'))
  savedConfigDir = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = dir
})
afterEach(() => {
  if (savedConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = savedConfigDir
  fs.rmSync(dir, { recursive: true, force: true })
})

test('headless() is true for an sdk entrypoint', () => {
  for (const v of ['sdk-cli', 'sdk-ts']) {
    assert.equal(unattended.headless({ CLAUDE_CODE_ENTRYPOINT: v }), true, v)
  }
})

test('headless() is false for cli, empty and a missing entrypoint', () => {
  for (const v of ['cli', '', undefined]) {
    assert.equal(unattended.headless({ CLAUDE_CODE_ENTRYPOINT: v }), false, String(v))
  }
  assert.equal(unattended.headless({}), false)
})

test('planFileFor names the file by UTC time and session prefix', () => {
  const now = new Date('2026-09-29T08:15:00.000Z')
  assert.equal(
    unattended.planFileFor('abcdefgh-1234', now),
    path.join(dir, 'plans', 'tierminator-unattended-20260929-081500-abcdefgh.md')
  )
  assert.ok(unattended.planFileFor('!!!', now).endsWith('-session.md'))
})

test('finalText prefers last_assistant_message', () => {
  assert.equal(unattended.finalText({ last_assistant_message: 'the plan' }), 'the plan')
})

test('finalText falls back to the newest assistant text in the transcript', () => {
  const file = path.join(dir, 't.jsonl')
  const lines = [
    JSON.stringify({ type: 'user', message: { content: 'hi' } }),
    JSON.stringify({ type: 'assistant', message: { content: 'older' } }),
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'Read' },
          { type: 'text', text: 'first' },
          { type: 'text', text: 'second' }
        ]
      }
    }),
    '{not json'
  ]
  fs.writeFileSync(file, lines.join('\n'))
  assert.equal(unattended.finalText({ transcript_path: file, last_assistant_message: '  ' }), 'first\nsecond')
})

test('finalText returns an empty string for a missing transcript', () => {
  assert.equal(unattended.finalText({ transcript_path: path.join(dir, 'nope.jsonl') }), '')
})

test('note contains the plan file path and ExitPlanMode', () => {
  const n = unattended.note('/x/plan.md')
  assert.ok(n.includes('/x/plan.md'))
  assert.ok(n.includes('ExitPlanMode'))
})
