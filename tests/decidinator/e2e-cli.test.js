'use strict'

// The end-to-end check command: it loads a run, prints its checks and writes the fixtures.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const decisionLog = require(path.join(lib, 'decision-log.js'))
const { QUESTIONS } = require('./e2e/scenarios.js')
const { setupRepo } = require('./e2e/fixture.js')
const { load } = require('./e2e/check.js')

const CHECK = path.join(__dirname, 'e2e', 'check.js')

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-e2e-cli-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function writeLines(file, records) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, records.map((r) => JSON.stringify(r) + '\n').join(''))
}

function makeRun(root, { stop = true, input = {} } = {}) {
  const base = path.join(root, 'base')
  setupRepo('1', path.join(base, 'repo'))
  const res = decisionLog.append(path.join(base, 'repo', 'docs', 'decisions.md'), {
    title: 'Test framework',
    question: QUESTIONS.researchable.question,
    answer: 'Use node:test.',
    rationale: 'Built in.',
    provenance: 'oracle-unconfirmed',
    confidence: 'high',
    rung: 1,
    sources: ['docs/spec.md'],
    assumptions: [],
    flags: [],
    questionId: 'Q-0002',
    context: 'tests',
    date: '2026-09-30'
  })
  assert.equal(res.ok, true)
  writeLines(path.join(base, 'out', 'PreToolUse.jsonl'), [
    { at: '2026-09-30T10:00:00.000Z', event: 'PreToolUse', input: { tool_name: 'AskUserQuestion', tool_input: {}, ...input } }
  ])
  if (stop) {
    writeLines(path.join(base, 'out', 'SubagentStop.jsonl'), [
      { at: '2026-09-30T10:01:00.000Z', event: 'SubagentStop', input: { agent_type: 'decidinator:oracle-1' } }
    ])
  }
  return base
}

function run(root, base) {
  const fx = path.join(root, 'fx')
  const r = spawnSync(process.execPath, [CHECK, '1', base, '--fixtures', fx], { encoding: 'utf8' })
  return { r, fx }
}

test('a passing run exits 0 and writes the fixtures', (t) => {
  const root = tmp(t)
  const { r, fx } = run(root, makeRun(root))
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.ok(r.stdout.includes('PASS: scenario 1 (ask-researchable)'))
  assert.ok(fs.existsSync(path.join(fx, 'decisions.md')))
  const result = JSON.parse(fs.readFileSync(path.join(fx, 'result.json'), 'utf8'))
  assert.equal(result.pass, true)
  assert.equal(result.scenario, '1')
  assert.equal(result.evidence.oracleStops.length, 1)
})

test('a failing run exits 1 and still writes the fixtures', (t) => {
  const root = tmp(t)
  const { r, fx } = run(root, makeRun(root, { stop: false }))
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.ok(r.stdout.includes('FAIL oracle-1-stopped'))
  assert.ok(r.stdout.includes('FAIL: scenario 1'))
  const result = JSON.parse(fs.readFileSync(path.join(fx, 'result.json'), 'utf8'))
  assert.equal(result.pass, false)
})

test('load reads the main transcript', (t) => {
  const root = tmp(t)
  const transcript = path.join(root, 't.jsonl')
  const line = (text) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } }) + '\n'
  fs.writeFileSync(transcript, line('first') + line('RESULT: node:test'))
  const base = makeRun(root, { input: { transcript_path: transcript } })
  const inputs = load('1', base)
  assert.equal(inputs.finalMessage, 'RESULT: node:test')
  assert.ok(inputs.transcriptStrings.includes('first'))
})

test('an unknown scenario exits 2', (t) => {
  const root = tmp(t)
  const r = spawnSync(process.execPath, [CHECK, '9', path.join(root, 'base')], { encoding: 'utf8' })
  assert.equal(r.status, 2)
  assert.ok(r.stderr.includes('usage:'))
})
