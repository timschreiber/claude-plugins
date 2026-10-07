// Tests for the attempt runner: one scenario per outcome, run against the claude stub.
'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { DEFAULTS } = require('../../tools/grindinator/lib/config')
const state = require('../../tools/grindinator/lib/state')
const { attemptPaths, runAttempt } = require('../../tools/grindinator/lib/attempt')
const h = require('./helpers')

const PROMPT = '/tierminator:plan # P'
const R = x => ({ type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: 'stub-session', ...x })

async function withAttempt(scenario, fn, configOverrides = {}) {
  const root = fs.realpathSync.native(h.makeRepo())
  h.git(root, 'switch', '-q', '-c', 'grindinator/t')
  const stubDir = h.tempDir('grind-stub-')
  try {
    const st = state.create({ runName: 't', branch: 'grindinator/t', packagesDir: 'wp', baseCommit: 'x' })
    state.ensurePackages(st, [{ id: 'WP-01', title: 'One', name: 'WP-01 · One.md' }])
    const pkg = { id: 'WP-01' }
    const config = { ...DEFAULTS, ...configOverrides }
    const env = h.stubEnv(stubDir, scenario)
    const run = async (extra = {}) => {
      const attempt = await runAttempt({ root, st, pkg, prompt: PROMPT, config, env, ...extra })
      assert.deepEqual(state.read(root), st)
      return attempt
    }
    await fn({ root, stubDir, st, run })
  } finally {
    h.remove(root)
    h.remove(stubDir)
  }
}

test('complete: done marker, files and fields', async () => {
  await withAttempt(h.completeScenario(), async ({ root, st, run }) => {
    const a = await run()
    assert.equal(a.outcome, 'complete')
    assert.equal(a.source, 'result-file')
    assert.equal(a.sessionId, 'stub-session')
    assert.equal(a.dir, 'runs/WP-01/attempt-1')
    assert.equal(a.commits, 1)
    assert.equal(a.sessionOutcome, 'complete')
    assert.equal(a.gate.status, 'skipped')
    assert.equal(st.packages['WP-01'].startCommit, a.startCommit)
    assert.equal(st.packages['WP-01'].status, 'done')
    assert.equal(state.isDone(root, 'WP-01'), true)
    const p = attemptPaths(root, 'WP-01', 1)
    const lines = fs.readFileSync(p.streamFile, 'utf8').split('\n').filter(Boolean)
    assert.equal(lines.length, 2)
    assert.deepEqual(JSON.parse(fs.readFileSync(p.resultFile, 'utf8')), h.resultRecord())
  })
})

test('halted record fields are copied and the package fails', async () => {
  const scenario = h.completeScenario()
  scenario.resultFile = h.resultRecord({
    outcome: 'halted', haltedAt: 'T02', reason: 'T02 failed', tasksNotRun: ['T02', 'T03']
  })
  await withAttempt(scenario, async ({ root, st, run }) => {
    const a = await run()
    assert.equal(a.outcome, 'halted')
    assert.equal(a.haltedAt, 'T02')
    assert.equal(a.reason, 'T02 failed')
    assert.deepEqual(a.tasksNotRun, ['T02', 'T03'])
    assert.equal(st.packages['WP-01'].status, 'failed')
    assert.equal(state.isDone(root, 'WP-01'), false)
  })
})

for (const [outcome, reason] of [['no-plan', 'no plan was made'], ['declined', 'dirty tree']]) {
  test(`${outcome} record fails the package`, async () => {
    const scenario = h.completeScenario()
    scenario.resultFile = h.resultRecord({ outcome, reason })
    await withAttempt(scenario, async ({ st, run }) => {
      const a = await run()
      assert.equal(a.outcome, outcome)
      assert.equal(a.reason, reason)
      assert.equal(st.packages['WP-01'].status, 'failed')
    })
  })
}

test('limit with a result file', async () => {
  const scenario = {
    stream: [h.INIT, R({ is_error: true, api_error_status: 429 })],
    resultFile: h.resultRecord({
      outcome: 'limit',
      limit: { detectedAt: '2026-10-05T01:00:00.000Z', resetsAt: 1791179511, raw: { error: 'rate_limit' } }
    }),
    exitCode: 1
  }
  await withAttempt(scenario, async ({ st, run }) => {
    const a = await run()
    assert.equal(a.outcome, 'limit')
    assert.equal(a.source, 'result-file')
    assert.equal(a.limit.resetsAt, 1791179511)
    assert.equal(a.exitCode, 1)
    assert.equal(st.packages['WP-01'].status, 'pending')
    assert.equal(st.packages['WP-01'].resume, null)
    assert.equal(a.recovery.phase, 'planning')
  })
})

test('limit with no result file', async () => {
  const scenario = {
    stream: [
      h.INIT,
      { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: 1791179511 }, session_id: 'stub-session' },
      R({ is_error: true, api_error_status: 429 })
    ],
    exitCode: 1
  }
  await withAttempt(scenario, async ({ st, run }) => {
    const a = await run()
    assert.equal(a.outcome, 'limit')
    assert.equal(a.source, 'stream')
    assert.equal(a.limit.resetsAt, null)
    assert.equal(a.streamResetsAt, 1791179511)
    assert.equal(st.packages['WP-01'].status, 'pending')
    assert.equal(st.packages['WP-01'].resume, null)
    assert.equal(a.recovery.phase, 'planning')
  })
})

test('several results, no result file: the last result counts', async () => {
  const scenario = {
    stream: [
      h.INIT, R({ result_index: 0, is_error: true, api_error_status: 429 }),
      h.INIT, R({ result_index: 1 }),
      h.INIT, R({ result_index: 2 })
    ],
    exitCode: 0
  }
  await withAttempt(scenario, async ({ run }) => {
    const a = await run()
    assert.equal(a.outcome, 'crashed')
    assert.equal(a.results, 3)
  })
})

test('permission denials are counted', async () => {
  const scenario = {
    stream: [h.INIT, { type: 'system', subtype: 'permission_denied', agent_id: 'a1', session_id: 'stub-session' }, R({})],
    resultFile: h.resultRecord(),
    commit: true,
    exitCode: 0
  }
  await withAttempt(scenario, async ({ run }) => {
    const a = await run()
    assert.equal(a.outcome, 'complete')
    assert.equal(a.permissionDenials, 1)
  })
})

test('no result file is a crash', async () => {
  const scenario = h.completeScenario()
  delete scenario.resultFile
  await withAttempt(scenario, async ({ root, st, run }) => {
    const a = await run()
    assert.equal(a.outcome, 'crashed')
    assert.match(a.reason, /without a result file/)
    assert.equal(st.packages['WP-01'].status, 'failed')
    assert.equal(fs.existsSync(attemptPaths(root, 'WP-01', 1).resultFile), false)
  })
})

test('malformed stream lines are counted', async () => {
  const scenario = {
    stream: ['garbage', '{"type":"system","subtype":"init","session_id":"s-9"}', '{oops'],
    exitCode: 1
  }
  await withAttempt(scenario, async ({ run }) => {
    const a = await run()
    assert.equal(a.outcome, 'crashed')
    assert.equal(a.malformedLines, 2)
    assert.equal(a.sessionId, 's-9')
  })
})

test('a second run is attempt 2', async () => {
  await withAttempt(h.completeScenario(), async ({ st, run }) => {
    await run()
    const a = await run()
    assert.equal(a.n, 2)
    assert.equal(a.dir, 'runs/WP-01/attempt-2')
    assert.equal(st.packages['WP-01'].attempts.length, 2)
  })
})

test('the session gets the prompt and the environment', async () => {
  await withAttempt(h.completeScenario(), async ({ root, stubDir, run }) => {
    await run()
    const entry = h.readStubLog(stubDir)[0]
    assert.equal(entry.argv[0], '-p')
    assert.equal(entry.argv[1], PROMPT)
    assert.equal(entry.env.TIERMINATOR_RESULT_FILE, attemptPaths(root, 'WP-01', 1).resultFile)
    assert.equal(entry.env.DECIDINATOR_CONTEXT, 'WP-01')
    assert.equal(entry.env.DECIDINATOR_MODE, 'sidecar')
  })
})

test('an already-aborted signal is interrupted and the package stays pending', async () => {
  const controller = new AbortController()
  controller.abort()
  await withAttempt(h.completeScenario(), async ({ st, run }) => {
    const a = await run({ abortSignal: controller.signal })
    assert.equal(a.outcome, 'interrupted')
    assert.equal(st.packages['WP-01'].status, 'pending')
  })
})

test('complete with no new commit is unverified', async () => {
  const scenario = h.completeScenario()
  scenario.commit = false
  await withAttempt(scenario, async ({ root, st, run }) => {
    const a = await run()
    assert.equal(a.outcome, 'unverified')
    assert.equal(a.sessionOutcome, 'complete')
    assert.equal(a.commits, 0)
    assert.match(a.reason, /has not advanced from the package's start commit/)
    assert.match(a.reason, /made no commits/)
    assert.equal(a.gate, null)
    assert.equal(st.packages['WP-01'].status, 'failed')
    assert.equal(state.isDone(root, 'WP-01'), false)
  })
})

test('complete off the run branch is unverified', async () => {
  await withAttempt(h.completeScenario(), async ({ root, st, run }) => {
    h.git(root, 'switch', '-q', 'main')
    const a = await run()
    assert.equal(a.outcome, 'unverified')
    assert.ok(a.reason.includes('left the run branch grindinator/t (now on main)'))
    assert.equal(state.isDone(root, 'WP-01'), false)
  })
})

test('a passing gate writes the marker', async () => {
  await withAttempt(h.completeScenario(), async ({ root, st, run }) => {
    const a = await run()
    assert.equal(a.outcome, 'complete')
    assert.equal(a.gate.status, 'passed')
    assert.equal(a.gate.exitCode, 0)
    assert.equal(state.isDone(root, 'WP-01'), true)
    assert.equal(st.packages['WP-01'].status, 'done')
    const out = fs.readFileSync(path.join(attemptPaths(root, 'WP-01', 1).dir, 'gate.stdout.txt'), 'utf8')
    assert.ok(out.includes('gate stdout WP-01'))
  }, { gate: h.gateCommand() })
})

test('a failing gate fails the package', async () => {
  await withAttempt(h.completeScenario(), async ({ root, st, run }) => {
    const a = await run()
    assert.equal(a.outcome, 'gate-failed')
    assert.equal(a.sessionOutcome, 'complete')
    assert.equal(a.reason, 'the gate exited 1')
    assert.equal(a.gate.exitCode, 1)
    assert.equal(a.commits, 1)
    assert.equal(st.packages['WP-01'].status, 'failed')
    assert.equal(state.isDone(root, 'WP-01'), false)
  }, { gate: h.gateCommand('WP-01') })
})

test('no gate configured is skipped', async () => {
  await withAttempt(h.completeScenario(), async ({ root, run }) => {
    const a = await run()
    assert.equal(a.gate.status, 'skipped')
    assert.equal(state.isDone(root, 'WP-01'), true)
  })
})

test('commits are counted for a halted session', async () => {
  const scenario = h.completeScenario()
  scenario.resultFile = h.resultRecord({ outcome: 'halted', haltedAt: 'T02', reason: 'T02 failed' })
  await withAttempt(scenario, async ({ run }) => {
    const a = await run()
    assert.equal(a.commits, 1)
    assert.equal(a.gate, null)
    assert.equal(a.outcome, 'halted')
  })
})

const LIMIT_STREAM = [h.INIT, R({ is_error: true, api_error_status: 429 })]
const LIMIT = { detectedAt: '2026-10-05T01:00:00.000Z', resetsAt: 1791179511, raw: { error: 'rate_limit' } }

function limitScenario(planFile, overrides) {
  return {
    stream: LIMIT_STREAM,
    resultFile: h.resultRecord({
      outcome: 'limit', limit: LIMIT, planFile, tasksFile: planFile.replace(/[.]md$/, '.tasks.json'), ...overrides
    }),
    exitCode: 1
  }
}

test('limit with a saved plan resumes at the first task not run', async () => {
  const dir = h.tempDir('grind-plan-')
  try {
    const planFile = path.join(dir, 'plan.md')
    fs.writeFileSync(planFile, '# plan')
    const scenario = limitScenario(planFile, { tasksDone: ['T01'], tasksNotRun: ['T02', 'T03'] })
    await withAttempt(scenario, async ({ st, run }) => {
      const a = await run()
      assert.equal(a.outcome, 'limit')
      assert.equal(a.kind, 'plan')
      assert.deepEqual(a.recovery, { phase: 'execute', planFile, from: 'T02' })
      assert.deepEqual(st.packages['WP-01'].resume, { kind: 'execute', planFile, from: 'T02' })
      assert.equal(st.packages['WP-01'].status, 'pending')
    })
  } finally {
    h.remove(dir)
  }
})

test('limit with every task committed counts as complete', async () => {
  const dir = h.tempDir('grind-plan-')
  try {
    const planFile = path.join(dir, 'plan.md')
    fs.writeFileSync(planFile, '# plan')
    const scenario = limitScenario(planFile, { tasksDone: ['T01', 'T02'], tasksNotRun: [] })
    scenario.commit = true
    await withAttempt(scenario, async ({ root, st, run }) => {
      const a = await run()
      assert.equal(a.outcome, 'complete')
      assert.equal(a.sessionOutcome, 'limit')
      assert.equal(a.recovery.phase, 'complete')
      assert.equal(a.gate.status, 'skipped')
      assert.equal(state.isDone(root, 'WP-01'), true)
      assert.equal(st.packages['WP-01'].status, 'done')
      assert.equal(st.packages['WP-01'].resume, null)
    })
  } finally {
    h.remove(dir)
  }
})

test('limit with no result file finds the plan by session id', async () => {
  const scenario = { stream: LIMIT_STREAM, exitCode: 1 }
  await withAttempt(scenario, async ({ stubDir, run }) => {
    const plans = path.join(stubDir, 'claude-config', 'plans')
    fs.mkdirSync(plans, { recursive: true })
    const planFile = path.join(plans, 'tierminator-unattended-20261005-010000-stub-ses.md')
    fs.writeFileSync(planFile, '# plan')
    const a = await run()
    assert.equal(a.outcome, 'limit')
    assert.deepEqual(a.recovery, { phase: 'execute', planFile, from: null })
  })
})

test('an execute attempt keeps the start commit', async () => {
  await withAttempt(h.completeScenario(), async ({ root, st, run }) => {
    const entry = st.packages['WP-01']
    entry.startCommit = h.git(root, 'rev-parse', 'HEAD')
    const start = entry.startCommit
    const resume = { kind: 'execute', planFile: '/p.md', from: 'T02' }
    const a = await run({ resume })
    assert.equal(a.kind, 'execute')
    assert.deepEqual(a.resume, resume)
    assert.equal(entry.startCommit, start)
    assert.equal(a.commits, 1)
    assert.equal(a.outcome, 'complete')
    assert.equal(entry.resume, null)
  })
})

test('an interrupted execute attempt drops --from', async () => {
  const controller = new AbortController()
  controller.abort()
  await withAttempt(h.completeScenario(), async ({ st, run }) => {
    const resume = { kind: 'execute', planFile: '/p.md', from: 'T02' }
    st.packages['WP-01'].resume = { ...resume }
    const a = await run({ resume, abortSignal: controller.signal })
    assert.equal(a.outcome, 'interrupted')
    assert.deepEqual(st.packages['WP-01'].resume, { kind: 'execute', planFile: '/p.md', from: null })
  })
})
