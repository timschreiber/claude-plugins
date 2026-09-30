'use strict'

// Pins every text the gate, the dispatch check and the guard show the model. UPDATE_SNAPSHOTS=1 rewrites the
// snapshot file instead of comparing. The snapshot is JSON, not t.assert.snapshot, which needs Node 22+.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const Q = require(path.join(lib, 'questions.js'))
const reasons = require(path.join(lib, 'reasons.js'))
const { DEFAULTS } = require(path.join(lib, 'config.js'))

const SNAPSHOT = path.join(__dirname, 'fixtures', 'snapshots', 'deny-reasons.json')
const cfg = { ...DEFAULTS, rungs: [...DEFAULTS.rungs] }

const sample = Q.addQuestions(
  Q.emptyState(),
  Q.fromCall({
    questions: [{
      question: 'Which color should the probe use?',
      header: 'Color',
      options: [
        { label: 'Red', description: 'Use red for the probe.' },
        { label: 'Blue', description: 'Use blue for the probe.' }
      ],
      multiSelect: false
    }]
  }),
  ['Q-0007'],
  '2026-01-01T00:00:00.000Z'
)
const d = Q.dueDispatch(sample, cfg)

// The human-only example verdict in agents/oracle-1.md.
const agentText = fs.readFileSync(path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'agents', 'oracle-1.md'), 'utf8')
const exampleAt = agentText.indexOf('Example, a human-only question at rung 1:')
const verdict = JSON.parse(/```decidinator-verdict\r?\n([\s\S]*?)```/.exec(agentText.slice(exampleAt))[1])
const withVerdict = JSON.parse(JSON.stringify(sample))
withVerdict.questions['Q-0007'].verdicts = [{ rung: 1, verdict }]

const rendered = {
  'held-one': reasons.held(d, ['Q-0007']),
  'held-three': reasons.held(d, ['Q-0007', 'Q-0008', 'Q-0009']),
  narrow: reasons.narrow(['Q-0007'], [{ id: 'Q-0008', question: 'Which size should the probe use?' }]),
  'settled-one': reasons.settled(['Q-0007']),
  'settled-two': reasons.settled(['Q-0007', 'Q-0008']),
  sidecar: reasons.sidecar(['Q-0007', 'Q-0008'], 'docs/open-questions.md'),
  'refused-wrong-agent': reasons.refused(reasons.wrongAgent('decidinator:oracle-2', d), d),
  'refused-no-agent': reasons.refused(reasons.wrongAgent(undefined, d), d),
  'refused-missing-id': reasons.refused(reasons.missingId(d), d),
  'held-waiting-one': reasons.heldWaiting(d, ['Q-0007']),
  'held-waiting-three': reasons.heldWaiting(d, ['Q-0007', 'Q-0008', 'Q-0009']),
  'guard-due': reasons.guardDue(d),
  'guard-waiting': reasons.guardWaiting(d),
  'guard-stepped-aside': reasons.guardSteppedAside('Q-0007', 1, 3),
  'prompt-rung-1': Q.dispatchPrompt(withVerdict.questions['Q-0007'], 1, cfg),
  'prompt-rung-2': Q.dispatchPrompt(withVerdict.questions['Q-0007'], 2, cfg),
  'oracle-shell': reasons.oracleShell('it is not one of gh search, gh repo view or gh api'),
  'oracle-monitor': reasons.ORACLE_MONITOR,
  nudge: reasons.NUDGE
}

test('deny reasons and dispatch prompts match the snapshot', () => {
  if (process.env.UPDATE_SNAPSHOTS === '1') {
    fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true })
    fs.writeFileSync(SNAPSHOT, `${JSON.stringify(rendered, null, 2)}\n`)
    return
  }
  const expected = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
  assert.deepEqual(Object.keys(rendered), Object.keys(expected))
  for (const key of Object.keys(rendered)) assert.equal(rendered[key], expected[key], key)
})
