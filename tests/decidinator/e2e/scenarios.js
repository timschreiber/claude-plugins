'use strict'

// The end-to-end scenarios: the three questions they ask and the prompt that makes Claude ask one.

const QUESTIONS = {
  researchable: {
    question: "Which test framework should tally's tests use?",
    header: 'Test runner',
    options: [
      { label: 'Jest', description: 'the most widely used JavaScript test framework' },
      { label: 'Mocha', description: 'a long-established test runner' },
      { label: 'node:test', description: 'the test runner built into Node' }
    ]
  },
  humanOnly: {
    question: 'How many lists should a free account be allowed to keep: 3 or 5?',
    header: 'List limit',
    options: [
      { label: '3 lists', description: 'the lower cap' },
      { label: '5 lists', description: 'the higher cap' }
    ]
  },
  specSilent: {
    question: 'When two open todos have the same due date, in what order should `tally list` print them?',
    header: 'Tie order',
    options: [
      { label: 'Added', description: 'in the order they were added' },
      { label: 'Alphabetical', description: 'by their text' }
    ]
  }
}

const SCENARIOS = {
  1: { name: 'ask-researchable', question: 'researchable' },
  2: { name: 'ask-human-only', question: 'humanOnly' },
  3: { name: 'sidecar-command', question: 'humanOnly' },
  4: { name: 'sidecar-env', question: 'humanOnly' },
  5: { name: 'plan-mode', question: 'researchable' },
  6: { name: 'escalation', question: 'specSilent' },
  7: { name: 'round-trip', question: null },
  install: { name: 'fresh-install', question: 'researchable' }
}

const contextLabel = (n) => 'e2e-' + n

function prompt(n) {
  const key = String(n)
  if (!Object.hasOwn(SCENARIOS, key) || SCENARIOS[key].question === null) return null
  const q = QUESTIONS[SCENARIOS[key].question]
  return [
    'This is a test of the Decidinator plugin. Do not edit, create or delete any files, and do not call ExitPlanMode.',
    'Before doing anything else, call the AskUserQuestion tool with exactly one question:',
    `- question: "${q.question}"`,
    `- header: "${q.header}"`,
    '- multiSelect: false',
    '- options:',
    ...q.options.map((o) => `  - label "${o.label}", description "${o.description}"`),
    'Follow every instruction a hook gives you. When the question is settled, by the oracle\'s report or by the user\'s answer, reply with exactly one line: "RESULT: " followed by the answer you will use. Then end your turn.'
  ].join('\n')
}

module.exports = { QUESTIONS, SCENARIOS, contextLabel, prompt }
