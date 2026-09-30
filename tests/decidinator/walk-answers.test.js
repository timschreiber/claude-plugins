'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const state = require(path.join(lib, 'state.js'))
const msg = require(path.join(lib, 'messages.js'))
const decisionLog = require(path.join(lib, 'decision-log.js'))
const sidecar = require(path.join(lib, 'sidecar.js'))
const recorded = require('./fixtures/recorded.js')
const { setup } = require('./fixtures/harness.js')

const SID = 'walk-session'
const PROMPT = 'p1'
let h
let savedData

beforeEach(() => {
  h = setup('walk-answers')
  savedData = process.env.CLAUDE_PLUGIN_DATA
  process.env.CLAUDE_PLUGIN_DATA = h.dataDir
  state.arm(SID, 'ask', 'command')
})

afterEach(() => {
  if (savedData === undefined) delete process.env.CLAUDE_PLUGIN_DATA
  else process.env.CLAUDE_PLUGIN_DATA = savedData
  h.cleanup()
})

const logFile = () => path.join(h.projectDir, 'docs', 'decisions.md')
const sideFile = () => path.join(h.projectDir, 'docs', 'open-questions.md')
const decisions = () => decisionLog.read(logFile()).model.entries.map(e => e.decision)
const questions = () => sidecar.read(sideFile()).model.entries.map(e => e.question)

const OPTIONS = [{ label: 'Five', tradeoffs: 'small' }, { label: 'Ten', tradeoffs: 'big' }]

// Q-0001 with provisional decision D-0001 (oracle-provisional), plus a second entry Q-0002 with none.
function seed() {
  const s1 = sidecar.append(sideFile(), {
    topic: 'Limit', question: 'Which limit?', context: 'c', options: OPTIONS, provisionalAnswer: 'Five',
    provisionalDecision: 'D-0001', dependsOn: ['WP-03'], status: 'open'
  })
  assert.ok(s1.ok, s1.error)
  const d1 = decisionLog.append(logFile(), {
    title: 'Limit', question: 'Which limit?', answer: 'Five', rationale: 'r', provenance: 'oracle-provisional', confidence: 'medium',
    rung: 2, sources: ['s'], assumptions: [], flags: [], questionId: 'Q-0001', context: 'WP-03', date: '2026-09-30', sidecar: 'Q-0001'
  })
  assert.ok(d1.ok, d1.error)
}

function command(name) {
  const res = h.run('commands.js', {
    session_id: SID, cwd: h.projectDir, hook_event_name: 'UserPromptSubmit', permission_mode: 'default', prompt: `/decidinator:${name}`, prompt_id: PROMPT
  })
  assert.equal(res.status, 0, res.stderr)
  return res
}

// An AskUserQuestion payload (Pre or Post) for the walk's questions, from a recorded call.
function askInput(event, answers, promptId = PROMPT, notes) {
  const input = recorded.input(
    'decidinator-probe-interactive-deny-normal-hooks.jsonl',
    r => r.event === 'PreToolUse' && r.input.tool_name === 'AskUserQuestion'
  )
  input.session_id = SID
  input.prompt_id = promptId
  input.hook_event_name = event
  const texts = state.read(SID).walk.items.map(i => i.text)
  input.tool_input = { questions: texts.map(t => ({ question: t, header: 'h', options: [{ label: 'x', description: '' }], multiSelect: false })) }
  if (event === 'PostToolUse') {
    input.tool_response = { questions: input.tool_input.questions, answers: Object.fromEntries(texts.map((t, i) => [t, answers[i]])) }
    if (notes) input.tool_response.annotations = Object.fromEntries(texts.map(t => [t, { notes }]))
  }
  return input
}

function post(answers, promptId, notes) {
  const res = h.run('user-answer.js', askInput('PostToolUse', answers, promptId, notes))
  assert.equal(res.status, 0, res.stderr)
  return res.stdout
}

test('review: choosing an option records a user decision that supersedes the provisional one', () => {
  seed()
  command('review')
  const out = post(['Ten'])
  assert.equal(out, JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg.walkRecorded(['Q-0001 recorded as D-0002 (user, supersedes D-0001)']) } }))
  const [d1, d2] = decisions()
  assert.equal(d1.supersededBy, 'D-0002')
  assert.equal(d2.provenance, 'user')
  assert.equal(d2.answer, 'Ten')
  assert.equal(d2.supersedes, 'D-0001')
  assert.equal(d2.sidecar, 'Q-0001')
  assert.equal(d2.rationale, 'The user answered in /decidinator:review.')
  assert.equal(questions()[0].status, 'answered')
  assert.equal(state.read(SID).walk.items[0].done, true)
})

test('review: Keep provisional with a note records the provisional answer plus the note', () => {
  seed()
  command('review')
  post(['Keep provisional'], PROMPT, 'Agreed in standup')
  const d = decisions()[1]
  assert.equal(d.provenance, 'user')
  assert.equal(d.answer, 'Five\nNotes: Agreed in standup')
  assert.equal(d.supersedes, 'D-0001')
})

test('review: a typed answer is recorded as typed', () => {
  seed()
  command('review')
  post(['Twenty, but only for admins'])
  assert.equal(decisions()[1].answer, 'Twenty, but only for admins')
})

test('review: Skip writes nothing and leaves the entry open', () => {
  seed()
  command('review')
  const before = fs.readFileSync(logFile(), 'utf8')
  const out = post(['Skip'])
  assert.equal(out, JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg.walkRecorded(['Q-0001 skipped; it stays open']) } }))
  assert.equal(fs.readFileSync(logFile(), 'utf8'), before)
  assert.equal(questions()[0].status, 'open')
})

test('confirm: Confirm records oracle-confirmed and supersedes the oracle decision', () => {
  seed()
  command('confirm')
  const out = post(['Confirm'])
  assert.ok(out.includes('D-0001 recorded as D-0002 (oracle-confirmed, supersedes D-0001)'))
  const [d1, d2] = decisions()
  assert.equal(d1.supersededBy, 'D-0002')
  assert.equal(d2.provenance, 'oracle-confirmed')
  assert.equal(d2.answer, 'Five')
  assert.equal(d2.confidence, 'medium')
  assert.equal(d2.rung, 2)
  assert.equal(d2.supersedes, 'D-0001')
  assert.equal(questions()[0].status, 'answered')
})

test('confirm: typed text overrides as a user decision that supersedes', () => {
  seed()
  command('confirm')
  const out = post(['Something else'], PROMPT, 'because')
  assert.ok(out.includes('D-0001 recorded as D-0002 (user, supersedes D-0001)'))
  const d = decisions()[1]
  assert.equal(d.provenance, 'user')
  assert.equal(d.answer, 'Something else\nNotes: because')
  assert.equal(d.supersedes, 'D-0001')
})

test('a second identical PostToolUse writes nothing more', () => {
  seed()
  command('review')
  post(['Ten'])
  const before = fs.readFileSync(logFile(), 'utf8')
  assert.equal(post(['Ten']), '')
  assert.equal(fs.readFileSync(logFile(), 'utf8'), before)
})

test('a PostToolUse with another prompt_id writes nothing', () => {
  seed()
  command('review')
  const before = fs.readFileSync(logFile(), 'utf8')
  assert.equal(post(['Ten'], 'p-other'), '')
  assert.equal(fs.readFileSync(logFile(), 'utf8'), before)
  assert.equal(state.read(SID).walk.items[0].done, false)
})

test('the gate lets the walk questions through and mints nothing', () => {
  seed()
  command('review')
  const res = h.run('gate.js', askInput('PreToolUse', []))
  assert.equal(res.status, 0, res.stderr)
  assert.equal(res.stdout, '')
  assert.deepEqual(state.read(SID).order, [])
})
