'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const r = require('../../plugins/planandtier/scripts/lib/run.js')

const task = (n, over = {}) => ({
  id: `T${String(n).padStart(2, '0')}`,
  title: `Task ${n}`,
  model: 'sonnet',
  effort: 'medium',
  prompt: 'Do it. Verify: node --test passes.',
  ...over,
})
const TASKS = [task(1, { effort: 'low' }), task(2), task(3, { model: 'opus', effort: 'xhigh' })]
const start = () => r.startRun({ tasks: TASKS, tasksFile: 'C:/plans/p.tasks.json', branch: 'main' })
const call = (state, over = {}) => ({ ...r.expectedCall(state), ...over })

test('startRun begins at T01 on its own tier', () => {
  const s = start()
  assert.equal(s.phase, 'running')
  assert.deepEqual(
    { index: s.current.index, attempt: s.current.attempt, tier: s.current.tier, inFlight: s.current.inFlight },
    { index: 0, attempt: 1, tier: 'sonnet-low', inFlight: false }
  )
  assert.deepEqual(s.done, [])
  assert.equal(s.branch, 'main')
})

test('the dispatch is a pointer to the task, with the reason added on a retry', () => {
  const s = start()
  assert.equal(r.expectedPrompt(s), 'Tasks file: C:/plans/p.tasks.json\nTask: T01')
  assert.deepEqual(r.expectedCall(s), {
    subagent_type: 'planandtier:sonnet-low',
    description: 'T01: Task 1',
    run_in_background: false,
    prompt: 'Tasks file: C:/plans/p.tasks.json\nTask: T01',
  })
  const retry = r.advance(s, { ok: false, reason: 'Verify failed' }).state
  assert.equal(
    r.expectedPrompt(retry),
    'Tasks file: C:/plans/p.tasks.json\nTask: T01\n' +
      'Retry: attempt 2 of 3; the attempt at sonnet-low failed and was rolled back.\n' +
      'Reason: Verify failed'
  )
})

test('dispatchText spells out the exact call', () => {
  const text = r.dispatchText(start())
  assert.match(text, /subagent_type "planandtier:sonnet-low"/)
  assert.match(text, /description "T01: Task 1"/)
  assert.match(text, /run_in_background false/)
  assert.match(text, /exactly this prompt \(2 lines, nothing added\):\nTasks file: C:\/plans\/p\.tasks\.json\nTask: T01\n/)
  assert.match(text, /Do not do the task yourself/)
})

test('checkDispatch accepts the expected call, allowing line endings and trailing spaces to differ', () => {
  const s = start()
  assert.equal(r.checkDispatch(s, call(s)), null)
  assert.equal(r.checkDispatch(s, call(s, { prompt: 'Tasks file: C:/plans/p.tasks.json  \r\nTask: T01\r\n' })), null)
  assert.equal(r.checkDispatch(s, call(s, { description: 'anything' })), null, 'the description is not checked')
})

test('checkDispatch names what is wrong', () => {
  const s = start()
  assert.match(r.checkDispatch(s, call(s, { subagent_type: 'planandtier:sonnet-medium' })), /runs on planandtier:sonnet-low, not planandtier:sonnet-medium/)
  assert.match(r.checkDispatch(s, call(s, { run_in_background: true })), /run_in_background must be false/)
  const noFlag = call(s)
  delete noFlag.run_in_background
  assert.match(r.checkDispatch(s, noFlag), /run_in_background must be false/)
  assert.match(r.checkDispatch(s, call(s, { prompt: 'Task: T01' })), /prompt is not the expected one/)
  assert.match(r.checkDispatch(s, call(s, { prompt: 'Tasks file: C:/plans/p.tasks.json\nTask: T02' })), /not the expected one/)
  assert.match(r.checkDispatch({ ...s, current: { ...s.current, inFlight: true } }, call(s)), /T01 is already running/)
  assert.match(r.checkDispatch({ ...s, phase: 'halted' }, call(s)), /no planandtier run is in progress/)
  assert.match(r.checkDispatch(null, call(s)), /no planandtier run is in progress/)
})

test('parseReport reads the closing block, fenced or not', () => {
  const block = 'STATUS: DONE\nCOMMIT: abc1234\nVERIFY: PASS\nNOTE: created a.txt'
  const want = { status: 'DONE', commit: 'abc1234', verify: 'PASS', note: 'created a.txt' }
  assert.deepEqual(r.parseReport(block), want)
  assert.deepEqual(r.parseReport('All done.\n\n```\n' + block + '\n```'), want)
  assert.deepEqual(r.parseReport('status: failed\nnote: Verify failed: 2 tests'), {
    status: 'FAILED', commit: 'NONE', verify: 'NOT RUN', note: 'Verify failed: 2 tests',
  })
  assert.equal(r.parseReport('I did it!'), null)
  assert.equal(r.parseReport('STATUS: MAYBE'), null)
  assert.equal(r.parseReport(undefined), null)
})

test('judge accepts only DONE with one trailer commit, a clean tree and the same branch', () => {
  const report = { status: 'DONE', commit: 'abc', verify: 'PASS', note: '' }
  const commit = { sha: 'abc123', message: 'Task 2\n\nPlanandtier-Task: T02' }
  const base = { report, taskId: 'T02', commits: [commit], clean: true, sameBranch: true }
  assert.deepEqual(r.judge(base), { ok: true, commit: 'abc123' })
  assert.match(r.judge({ ...base, sameBranch: false }).fatal, /left the branch/)
  assert.match(r.judge({ ...base, report: null }).reason, /no STATUS report/)
  assert.equal(r.judge({ ...base, report: { ...report, status: 'FAILED', note: 'tests fail' } }).reason, 'tests fail')
  assert.match(r.judge({ ...base, commits: [] }).reason, /made 0 commits instead of one/)
  assert.match(r.judge({ ...base, commits: [commit, commit] }).reason, /made 2 commits/)
  assert.match(r.judge({ ...base, commits: [{ ...commit, message: 'Task 2' }] }).reason, /no "Planandtier-Task: T02" trailer/)
  assert.match(r.judge({ ...base, clean: false }).reason, /uncommitted changes/)
})

test('advance moves to the next task, then completes', () => {
  let { state, action } = r.advance(start(), { ok: true, commit: 'aaa1111' })
  assert.equal(action, 'next')
  assert.deepEqual([state.current.index, state.current.tier, state.current.attempt], [1, 'sonnet-medium', 1])
  ;({ state, action } = r.advance(state, { ok: true, commit: 'bbb2222' }))
  ;({ state, action } = r.advance(state, { ok: true, commit: 'ccc3333' }))
  assert.equal(action, 'complete')
  assert.equal(state.phase, 'complete')
  assert.deepEqual(state.done.map(d => [d.id, d.tier, d.attempts]), [
    ['T01', 'sonnet-low', 1], ['T02', 'sonnet-medium', 1], ['T03', 'opus-xhigh', 1],
  ])
  assert.match(r.completeText(state), /all 3 tasks are done.*T01 aaa1111 \(sonnet-low\), T02 bbb2222 \(sonnet-medium\)/)
})

test('a failure retries one tier up, twice, and then halts; past sonnet/high the next tier is opus/low', () => {
  let s = r.advance(start(), { ok: true, commit: 'aaa' }).state // T02 at sonnet-medium
  s = { ...s, current: { ...s.current, head: 'h1' } }
  let out = r.advance(s, { ok: false, reason: 'first' })
  assert.equal(out.action, 'retry')
  assert.deepEqual([out.state.current.attempt, out.state.current.tier, out.state.current.head], [2, 'sonnet-high', 'h1'])
  out = r.advance(out.state, { ok: false, reason: 'second' })
  assert.deepEqual([out.action, out.state.current.attempt, out.state.current.tier], ['retry', 3, 'opus-low'])
  assert.deepEqual(out.state.current.lastFailure, { tier: 'sonnet-high', reason: 'second' })
  out = r.advance(out.state, { ok: false, reason: 'third' })
  assert.equal(out.action, 'halt')
  assert.equal(out.state.phase, 'halted')
  assert.deepEqual(out.state.halt, { task: 'T02', tried: ['sonnet-medium', 'sonnet-high', 'opus-low'], reason: 'third' })
  assert.match(r.haltText(out.state), /stopped at T02, after 3 attempt\(s\) \(sonnet-medium, sonnet-high, opus-low\)\. Reason: third\./)
  assert.match(r.haltText(out.state), /Do not fix it yourself/)
})

test('a failure at the top tier, or a fatal one, halts at once', () => {
  let s = start()
  s = r.advance(s, { ok: true, commit: 'a' }).state
  s = r.advance(s, { ok: true, commit: 'b' }).state // T03 at opus-xhigh
  const top = r.advance(s, { ok: false, reason: 'hard' })
  assert.deepEqual([top.action, top.state.halt.tried], ['halt', ['opus-xhigh']])
  const fatal = r.advance(start(), { ok: false, fatal: 'the worker left the branch the run started on' })
  assert.equal(fatal.action, 'halt')
  assert.match(fatal.state.halt.reason, /left the branch/)
})
