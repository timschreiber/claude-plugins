'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { STEPS, checkStep, metrics, compareText } = require('./e2e/checks.js')

const clone = (v) => JSON.parse(JSON.stringify(v))

function stateAttempt(n, kind, outcome, extra = {}) {
  return { n, kind, outcome, commits: 1, gate: { status: 'passed' }, wait: null, ...extra }
}

function entry(n, extra = {}) {
  return {
    n,
    result: { version: 1, outcome: 'complete', tasksDone: ['T01', 'T02'] },
    init: {},
    lastResult: { total_cost_usd: 0.5, num_turns: 10 },
    ...extra
  }
}

function pkg(attempts) {
  return { status: 'done', attempts }
}

// Inputs that pass the given step.
function passing(step) {
  const ids = step === 'pilot' ? ['WP-01', 'WP-02', 'WP-03'] : ['WP-01']
  const packages = {}
  const attempts = {}
  for (const id of ids) {
    packages[id] = pkg([stateAttempt(1, 'plan', 'complete')])
    attempts[id] = [entry(1)]
  }
  const inputs = {
    exitCode: 0,
    state: { version: 1, branch: 'grindinator/run', packages },
    summary: '# Run\n\n- Exit code: 0\n',
    branch: 'grindinator/run',
    porcelain: '',
    subjects: ['chore(grindinator): decisions for WP-01'],
    decisionsText: '### D-0001 first\n\nWP-01 chose a thing.\n',
    openQuestionsText: '',
    attempts,
    plugins: { tierminator: { version: '1.0', current: true }, decidinator: { version: '1.0', current: true } },
    stubLog: [],
    leftover: false
  }
  if (step === 'stub-limit') {
    packages['WP-01'] = pkg([
      stateAttempt(1, 'plan', 'limit', { wait: { status: 'woke', source: 'result-file' } }),
      stateAttempt(2, 'execute', 'complete')
    ])
    inputs.summary += '\n## Limit waits\n'
    inputs.stubLog = [{ argv: ['-p', '/tierminator:plan x'] }, { argv: ['-p', '/tierminator:execute /p/plan.md --from T02'] }]
  }
  if (step === 'batch') {
    packages['WP-01'].attempts[0].gate = { status: 'skipped' }
  }
  return inputs
}

// Each check, with a mutation that makes that check and no other fail.
const MUTATIONS = {
  state: (i) => { i.state.version = 2 },
  'exit code': (i) => { i.exitCode = 1 },
  'all done': (i) => { i.state.packages['WP-01'].status = 'failed' },
  'clean tree': (i) => { i.porcelain = ' M src/words.js\n' },
  'on run branch': (i) => { i.branch = 'main' },
  summary: (i) => { i.summary = '- Exit code: 1\n## Limit waits\n' },
  'limit then complete': (i) => { i.state.packages['WP-01'].attempts[1].outcome = 'failed' },
  'relaunched by execute': (i) => { i.state.packages['WP-01'].attempts[1].kind = 'plan' },
  'waited on the result-file reset': (i) => { i.state.packages['WP-01'].attempts[0].wait.source = 'timer' },
  'execute from T02': (i) => { i.stubLog[1].argv[1] = '/tierminator:execute /p/plan.md' },
  'limit waits in summary': (i) => { i.summary = '- Exit code: 0\n' },
  'leftovers discarded': (i) => { i.leftover = true },
  'result file': (i) => { i.attempts['WP-01'][0].result.outcome = 'failed' },
  'gate passed': (i) => { i.state.packages['WP-01'].attempts[0].gate.status = 'failed' },
  'decision logged': (i) => { i.decisionsText = '' },
  'decisions committed': (i) => { i.subjects = [] },
  'plugins current': (i) => { i.plugins.decidinator.current = false },
  'three packages': (i) => { delete i.state.packages['WP-03'] },
  'result files': (i) => { i.attempts['WP-02'][0].result.outcome = 'failed' },
  'gates passed': (i) => { i.state.packages['WP-03'].attempts[0].gate.status = 'failed' },
  'gates passed or none': (i) => { i.state.packages['WP-01'].attempts[0].gate.status = 'failed' }
}

const NAMES = {
  'stub-limit': ['state', 'exit code', 'all done', 'clean tree', 'on run branch', 'summary',
    'limit then complete', 'relaunched by execute', 'waited on the result-file reset', 'execute from T02',
    'limit waits in summary', 'leftovers discarded'],
  harness: ['state', 'exit code', 'all done', 'clean tree', 'on run branch', 'summary',
    'result file', 'gate passed', 'decision logged', 'decisions committed', 'plugins current'],
  pilot: ['state', 'exit code', 'all done', 'clean tree', 'on run branch', 'summary',
    'three packages', 'result files', 'gates passed', 'plugins current'],
  batch: ['state', 'exit code', 'all done', 'clean tree', 'on run branch', 'summary',
    'gates passed or none', 'plugins current']
}

test('STEPS lists the four steps', () => {
  assert.deepEqual(STEPS, ['stub-limit', 'harness', 'pilot', 'batch'])
})

for (const step of STEPS) {
  test(`${step}: passing inputs pass every check, in order`, () => {
    const r = checkStep(step, passing(step))
    assert.deepEqual(r.checks.map((c) => c.name), NAMES[step])
    assert.deepEqual(r.checks.filter((c) => !c.pass), [])
    assert.ok(r.checks.every((c) => c.detail === ''))
    assert.equal(r.pass, true)
  })

  for (const name of NAMES[step]) {
    test(`${step}: ${name} fails alone`, () => {
      const inputs = clone(passing(step))
      assert.ok(MUTATIONS[name], `no mutation for ${name}`)
      MUTATIONS[name](inputs)
      const r = checkStep(step, inputs)
      assert.deepEqual(r.checks.filter((c) => !c.pass).map((c) => c.name), [name])
      assert.equal(r.pass, false)
      assert.notEqual(r.checks.find((c) => c.name === name).detail, '')
    })
  }

  test(`${step}: null state fails with no state and never throws`, () => {
    const inputs = clone(passing(step))
    inputs.state = null
    const r = checkStep(step, inputs)
    assert.equal(r.pass, false)
    assert.equal(r.checks.find((c) => c.name === 'all done').detail, 'no state')
    assert.equal(r.checks.find((c) => c.name === 'state').pass, false)
  })

  test(`${step}: empty inputs never throw`, () => {
    assert.equal(checkStep(step, {}).pass, false)
    assert.equal(checkStep(step, undefined).pass, false)
  })
}

test('exit code null says it was not given', () => {
  const inputs = passing('batch')
  inputs.exitCode = null
  assert.equal(checkStep('batch', inputs).checks.find((c) => c.name === 'exit code').detail, 'exit code not given')
})

test('all done lists id: status', () => {
  const inputs = passing('pilot')
  inputs.state.packages['WP-02'].status = 'failed'
  assert.match(checkStep('pilot', inputs).checks.find((c) => c.name === 'all done').detail, /WP-02: failed/)
})

test('plugins current names the versions', () => {
  const inputs = passing('harness')
  inputs.plugins.tierminator = { version: '0.9', current: false }
  assert.equal(
    checkStep('harness', inputs).checks.find((c) => c.name === 'plugins current').detail,
    'tierminator 0.9, decidinator 1.0; update the installed plugins'
  )
})

test('metrics counts attempts, tasks, commits, cost, turns, decisions and open questions', () => {
  const inputs = passing('pilot')
  inputs.state.packages['WP-01'].attempts = [
    stateAttempt(1, 'plan', 'limit', { commits: 2 }),
    stateAttempt(2, 'execute', 'complete', { commits: 1 })
  ]
  inputs.attempts['WP-01'] = [
    entry(1, { result: null, lastResult: { total_cost_usd: 0.123, num_turns: 4 } }),
    entry(2, { lastResult: { total_cost_usd: 0.456, num_turns: 6 } })
  ]
  inputs.attempts['WP-02'] = [entry(1, { lastResult: null })]
  inputs.decisionsText = '# Decisions\n\n### D-0001 a\n\nWP-01 one\n\n### D-0002 b\n\nWP-01 two\n\n### D-0003 c\n\nWP-02 three\n'
  inputs.openQuestionsText =
    '### Q-0001 a\n\nWP-01\n\n**Status:** open\n\n### Q-0002 b\n\nWP-01\n\n**Status:** answered\n'
  const m = metrics(inputs)
  assert.deepEqual(m.packages['WP-01'], {
    status: 'done',
    attempts: 2,
    outcome: 'complete',
    tasksDone: 2,
    commits: 3,
    costUsd: 0.58,
    turns: 10,
    decisions: 2,
    openQuestions: 1
  })
  assert.equal(m.packages['WP-02'].decisions, 1)
  assert.equal(m.packages['WP-02'].openQuestions, 0)
  assert.equal(m.packages['WP-02'].costUsd, null)
  assert.equal(m.packages['WP-02'].turns, null)
  assert.deepEqual(m.totals, {
    tasksDone: 6,
    commits: 5,
    decisions: 3,
    openQuestions: 1,
    costUsd: 1.08,
    turns: 20
  })
})

test('metrics tasksDone is null without a result and handles null state', () => {
  const inputs = passing('batch')
  inputs.attempts['WP-01'] = [entry(1, { result: null })]
  assert.equal(metrics(inputs).packages['WP-01'].tasksDone, null)
  assert.deepEqual(metrics({ state: null }).packages, {})
})

test('compareText gives a header and a dash for missing values', () => {
  const a = { tag: 'before', metrics: { packages: { 'WP-01': { tasksDone: 3, commits: 1, decisions: 0, openQuestions: 0, costUsd: 1.5, turns: null } } } }
  const b = { tag: 'after', metrics: { packages: { 'WP-02': { tasksDone: 2, commits: 1, decisions: 1, openQuestions: 0, costUsd: 0.5, turns: 7 } } } }
  const lines = compareText(a, b)
  assert.equal(lines[0], '| Package | Metric | before | after |')
  assert.equal(lines[1], '| --- | --- | --- | --- |')
  assert.equal(lines.length, 2 + 2 * 6)
  assert.equal(lines[2], '| WP-01 | tasksDone | 3 | - |')
  assert.equal(lines[7], '| WP-01 | turns | - | - |')
  assert.equal(lines[8], '| WP-02 | tasksDone | - | 2 |')
  assert.equal(lines[13], '| WP-02 | turns | - | 7 |')
})
