'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const state = require(path.join(lib, 'state.js'))
const decisionLog = require(path.join(lib, 'decision-log.js'))
const sidecar = require(path.join(lib, 'sidecar.js'))
const recorded = require('./fixtures/recorded.js')
const { setup, denyReason } = require('./fixtures/harness.js')

const FILE = 'grindinator-decide-sidecar-hooks.jsonl'
const OTHER_PROMPT = 'Decidinator question NEW\nQuestion: Which size?\nOptions:\n- Small: tiny\n- Large: big\nContext: testing'
let h
let savedData
let agentCall
let stop
let sid

beforeEach(() => {
  h = setup('hrec')
  savedData = process.env.CLAUDE_PLUGIN_DATA
  process.env.CLAUDE_PLUGIN_DATA = h.dataDir
  h.env.CLAUDE_CODE_ENTRYPOINT = 'sdk-cli'
  agentCall = recorded.input(FILE, r => r.event === 'PreToolUse' && r.input.tool_name === 'Agent' && !r.input.agent_id)
  stop = recorded.input(FILE, r => r.event === 'SubagentStop')
  stop.agent_transcript_path = path.join(h.tmp, 'none.jsonl')
  sid = agentCall.session_id
  state.arm(sid, 'sidecar', 'env')
})

afterEach(() => {
  if (savedData === undefined) delete process.env.CLAUDE_PLUGIN_DATA
  else process.env.CLAUDE_PLUGIN_DATA = savedData
  h.cleanup()
})

const unresolvedMessage = () => {
  const v = {
    question_id: 'Q-0001',
    rung: 1,
    kind: 'human-only',
    status: 'unresolved',
    answer: 'node:test',
    rationale: 'Only the team can choose.',
    options: [
      { label: 'node:test', tradeoffs: 'No dependency.' },
      { label: 'Jest', tradeoffs: 'Extra dependency.' }
    ],
    sources: ['docs/spec.md'],
    assumptions: [],
    confidence: 'medium',
    flags: [],
    duplicate_of: null
  }
  return 'Summary.\n\n```decidinator-verdict\n' + JSON.stringify(v) + '\n```'
}

// Opens Q-0001 by the direct dispatch, then records the stop.
function flow() {
  let res = h.run('dispatch-check.js', agentCall)
  assert.equal(res.status, 0, res.stderr)
  res = h.run('recorder.js', stop)
  assert.equal(res.status, 0, res.stderr)
  assert.equal(res.stdout, '')
}

const logFile = () => path.join(h.projectDir, 'docs', 'decisions.md')
const sideFile = () => path.join(h.projectDir, 'docs', 'open-questions.md')

test('a resolved verdict is logged as oracle-unconfirmed and writes no sidecar', () => {
  flow()
  const r = decisionLog.read(logFile())
  assert.equal(r.ok, true)
  assert.equal(r.model.entries.length, 1)
  const d = r.model.entries[0].decision
  assert.equal(d.provenance, 'oracle-unconfirmed')
  assert.equal(d.questionId, 'Q-0001')
  assert.equal(d.rung, 1)
  assert.equal(state.read(sid).questions['Q-0001'].status, 'resolved')
  assert.equal(fs.existsSync(sideFile()), false)
})

test('an unresolved verdict is logged as provisional and opens a sidecar entry', () => {
  stop.last_assistant_message = unresolvedMessage()
  flow()
  const r = decisionLog.read(logFile())
  assert.equal(r.model.entries.length, 1)
  const d = r.model.entries[0].decision
  assert.equal(d.provenance, 'oracle-provisional')
  assert.equal(d.sidecar, 'Q-0001')
  const s = sidecar.read(sideFile())
  assert.equal(s.ok, true)
  assert.equal(s.model.entries.length, 1)
  const q = s.model.entries[0].question
  assert.equal(q.id, 'Q-0001')
  assert.equal(q.status, 'open')
  assert.equal(q.provisionalDecision, d.id)
  assert.equal(q.options.length, 2)
  const line = agentCall.tool_input.prompt.split('\n').find(l => l.startsWith('Question: '))
  assert.equal(q.question, line.slice('Question: '.length))
})

test('configured paths are honoured: an absolute log, a relative sidecar and no docs directory', () => {
  const absLog = path.join(h.tmp, 'out', 'decisions.md')
  const relSide = '.grindinator/decisions/open-questions.md'
  h.env.DECIDINATOR_LOG = absLog
  h.env.DECIDINATOR_SIDECAR = relSide
  stop.last_assistant_message = unresolvedMessage()
  flow()
  assert.equal(fs.existsSync(absLog), true)
  assert.equal(fs.existsSync(path.join(h.projectDir, '.grindinator', 'decisions', 'open-questions.md')), true)
  assert.equal(fs.existsSync(path.join(h.projectDir, 'docs')), false)

  const call = JSON.parse(JSON.stringify(agentCall))
  call.tool_input = { ...call.tool_input, prompt: OTHER_PROMPT }
  const res = h.run('dispatch-check.js', call)
  assert.equal(res.status, 0, res.stderr)
  const reason = denyReason(res.stdout)
  assert.ok(reason.includes(`Decision log: ${absLog}`), reason)
  assert.ok(reason.includes(`Sidecar: ${relSide}`), reason)
})

test('an unarmed session writes no log or sidecar', () => {
  state.disarm(sid)
  stop.last_assistant_message = unresolvedMessage()
  flow()
  assert.equal(fs.existsSync(logFile()), false)
  assert.equal(fs.existsSync(sideFile()), false)
})
