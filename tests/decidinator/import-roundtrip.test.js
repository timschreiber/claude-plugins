'use strict'

// Export, fill in answers, import, then the oracle judgment through the dispatch check, the recorder and
// the Stop hook, each run as a script on recorded hook payloads.

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const state = require(path.join(lib, 'state.js'))
const msg = require(path.join(lib, 'messages.js'))
const importer = require(path.join(lib, 'importer.js'))
const decisionLog = require(path.join(lib, 'decision-log.js'))
const sidecar = require(path.join(lib, 'sidecar.js'))
const { NO_ANSWER } = require(path.join(lib, 'resolution.js'))
const recorded = require('./fixtures/recorded.js')
const { setup } = require('./fixtures/harness.js')

const SID = 'roundtrip-session'
let h
let savedData

beforeEach(() => {
  h = setup('roundtrip')
  savedData = process.env.CLAUDE_PLUGIN_DATA
  process.env.CLAUDE_PLUGIN_DATA = h.dataDir
  state.arm(SID, 'sidecar', 'command')
})

afterEach(() => {
  if (savedData === undefined) delete process.env.CLAUDE_PLUGIN_DATA
  else process.env.CLAUDE_PLUGIN_DATA = savedData
  h.cleanup()
})

const logFile = () => path.join(h.projectDir, 'docs', 'decisions.md')
const sideFile = () => path.join(h.projectDir, 'docs', 'open-questions.md')
const copyFile = () => path.join(h.projectDir, 'out', 'copy.md')

function seed() {
  const entries = [
    { id: 'Q-0001', topic: 'Database', question: 'Which database?', provisionalAnswer: 'Use Postgres.', provisionalDecision: 'D-0001', dependsOn: ['WP-03'], status: 'open' },
    { id: 'Q-0002', topic: 'Retries', question: 'How many retries?', provisionalAnswer: 'Retry three times.', provisionalDecision: 'D-0002', dependsOn: ['WP-04', 'WP-05'], status: 'open' },
    { id: 'Q-0003', topic: 'Launch', question: 'When do we launch?', provisionalAnswer: NO_ANSWER, provisionalDecision: '', dependsOn: ['WP-06'], status: 'open' },
    { id: 'Q-0004', topic: 'Old', question: 'An old question?', provisionalAnswer: 'Old.', provisionalDecision: '', dependsOn: [], status: 'imported' }
  ]
  for (const e of entries) {
    const r = sidecar.append(sideFile(), { context: 'c', options: [], ...e })
    assert.ok(r.ok, r.error)
  }
  const provisional = [
    ['Which database?', 'Use Postgres.', 'Q-0001'],
    ['How many retries?', 'Retry three times.', 'Q-0002'],
    ['How many retries?', 'Retry three times.', 'Q-0002']
  ]
  for (const [question, answer, sidecarId] of provisional) {
    const r = decisionLog.append(logFile(), {
      title: 'T', question, answer, rationale: 'r', provenance: 'oracle-provisional', confidence: 'medium', rung: 1, sources: [],
      assumptions: [], flags: [], questionId: sidecarId, context: 'WP', date: '2026-09-30', sidecar: sidecarId
    })
    assert.ok(r.ok, r.error)
  }
}

function command(prompt, promptId = 'p1') {
  const res = h.run('commands.js', { session_id: SID, cwd: h.projectDir, hook_event_name: 'UserPromptSubmit', permission_mode: 'default', prompt, prompt_id: promptId })
  assert.equal(res.status, 0, res.stderr)
  return res.stdout
}

function fillAnswers(answers) {
  let text = fs.readFileSync(copyFile(), 'utf8')
  for (const [id, answer] of Object.entries(answers)) {
    const at = text.indexOf(`### ${id} `)
    assert.ok(at >= 0, `${id} is not in the copy`)
    const line = text.indexOf('- **Answer:**', at)
    text = text.slice(0, line) + `- **Answer:** ${answer}` + text.slice(line + '- **Answer:**'.length)
  }
  fs.writeFileSync(copyFile(), text)
}

// A recorded main-thread Stop, from the oracle-clear run.
function stop(active = false) {
  const input = recorded.input('decidinator-probe-oracle-clear-hooks.jsonl', r => r.event === 'Stop')
  input.session_id = SID
  input.stop_hook_active = active
  return input
}

function run(script, input) {
  const res = h.run(script, input)
  assert.equal(res.status, 0, res.stderr)
  return res.stdout
}

const decisions = () => decisionLog.read(logFile()).model.entries.map(e => e.decision)
const questions = () => sidecar.read(sideFile()).model.entries.map(e => e.question)

test('export, fill, import, judge and report', () => {
  seed()

  // 1. Export: the open entries only.
  assert.ok(command('/decidinator:export out/copy.md').startsWith('decidinator: exported 3 open questions'))
  const copy = sidecar.read(copyFile()).model
  assert.deepEqual(copy.marker, { kind: 'sidecar', major: 1 })
  assert.deepEqual(copy.entries.map(e => e.id), ['Q-0001', 'Q-0003', 'Q-0002'], 'grouped by topic: Database, Launch, Retries')

  // 2. Stakeholder answers.
  fillAnswers({ 'Q-0001': 'use postgres', 'Q-0002': 'Retry five times, then give up.', 'Q-0003': 'Ship in Q3.' })

  // 3. Import.
  const out = command('/decidinator:import out/copy.md')
  const d = decisions()
  assert.deepEqual(d.slice(3).map(x => [x.id, x.questionId, x.provenance, x.supersedes]), [
    ['D-0004', 'Q-0001', 'stakeholder', 'D-0001'],
    ['D-0005', 'Q-0002', 'stakeholder', 'D-0002'],
    ['D-0006', 'Q-0003', 'stakeholder', null]
  ])
  assert.deepEqual(d.slice(0, 3).map(x => x.supersededBy), ['D-0004', 'D-0005', 'D-0005'])
  assert.deepEqual(questions().map(q => q.status), ['imported', 'imported', 'imported', 'imported'])
  assert.ok(out.includes('Confirmed (1):\n- Q-0001 → D-0004 (supersedes D-0001): same as the provisional answer.'))
  assert.ok(out.includes('Changed (1):\n- Q-0003 → D-0006: no provisional answer to compare. Depends on: WP-06.'))
  assert.ok(out.includes('Waiting for oracle judgment (1):\n- Q-0002 → D-0005 (supersedes D-0002)'))
  assert.equal((out.match(/subagent_type: decidinator:oracle-1/g) ?? []).length, 1)
  assert.ok(out.includes('description: Decidinator import judgment Q-0002'))
  assert.equal(out.includes('import judgment Q-0001'), false)
  const judgmentPrompt = out.slice(out.indexOf('prompt:\n') + 'prompt:\n'.length).trimEnd()
  assert.ok(judgmentPrompt.startsWith('Decidinator question Q-0002\nRung: 1\n'))

  // 4. The model stops without dispatching: one reminder, then silence.
  assert.ok(run('import-report.js', stop()).includes(msg.IMPORT_REMIND.replace(/"/g, '\\"')))
  assert.equal(run('import-report.js', stop()), '')

  // 5. The dispatch check marks the judgment dispatched and prints nothing.
  const agent = recorded.input('decidinator-probe-interactive-normal-hooks.jsonl', r => r.event === 'PreToolUse' && r.input.tool_name === 'Agent')
  agent.session_id = SID
  agent.tool_input = { subagent_type: 'decidinator:oracle-1', description: 'Decidinator import judgment Q-0002', prompt: judgmentPrompt }
  assert.equal(run('dispatch-check.js', agent), '')
  assert.equal(state.read(SID).importJob.items.find(i => i.id === 'Q-0002').dispatched, true)

  // 6. The oracle reports "change": the recorder stores the judgment.
  const verdict = {
    question_id: 'Q-0002', rung: 1, kind: 'researchable', status: 'resolved', answer: 'change', rationale: 'Five retries is not three.',
    options: [], sources: [], assumptions: [], confidence: 'high', flags: []
  }
  const done = recorded.input('decidinator-probe-oracle-clear-hooks.jsonl', r => r.event === 'SubagentStop' && r.input.agent_type !== '')
  done.session_id = SID
  done.agent_type = 'decidinator:oracle-1'
  done.agent_transcript_path = path.join(h.tmp, 'none.jsonl')
  done.last_assistant_message = `Judged.\n\n\`\`\`decidinator-verdict\n${JSON.stringify(verdict)}\n\`\`\``
  assert.equal(run('recorder.js', done), '')
  const job = state.read(SID).importJob
  assert.equal(job.items.find(i => i.id === 'Q-0002').cls, 'changed')

  // 7. The Stop hook delivers the final report once.
  const expected = msg.importFinal(importer.report(job))
  assert.equal(JSON.parse(run('import-report.js', stop())).reason, expected)
  assert.ok(expected.includes('Changed (2):\n- Q-0002 → D-0005 (supersedes D-0002): the oracle judged it changed. Five retries is not three. Depends on: WP-04; WP-05.\n- Q-0003 → D-0006'))
  assert.ok(expected.includes('Confirmed (1):\n- Q-0001'))
  assert.equal(run('import-report.js', stop()), '')

  // 8. Everything written parses back.
  assert.equal(decisionLog.read(logFile()).ok, true)
  assert.equal(sidecar.read(sideFile()).ok, true)
})
