'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const r = require('../../plugins/tierminator/scripts/lib/run.js')

const task = (n, over = {}) => ({
  id: `T${String(n).padStart(2, '0')}`,
  title: `Task ${n}`,
  model: 'sonnet',
  effort: 'medium',
  prompt: 'Do it. Verify: node --test passes.',
  ...over,
})
const TASKS = [task(1, { effort: 'low' }), task(2), task(3, { model: 'opus', effort: 'high' })]
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
    subagent_type: 'tierminator:sonnet-low',
    description: 'T01: Task 1',
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

test('with a plan id, the prompt names the plan and judge requires its line in the commit', () => {
  const s = r.startRun({ tasks: TASKS, tasksFile: 'C:/plans/p.tasks.json', branch: 'main', planId: '0123456789abcdef' })
  assert.equal(r.expectedPrompt(s), 'Tasks file: C:/plans/p.tasks.json\nPlan: 0123456789abcdef\nTask: T01')
  const report = { status: 'DONE', commit: 'abc', verify: 'PASS', note: '' }
  const base = { report, taskId: 'T01', planId: '0123456789abcdef', clean: true, sameBranch: true }
  const withPlan = { sha: 'abc123', message: 'Task 1\n\nTierminator-Task: T01\n\nTierminator-Plan: 0123456789abcdef' }
  assert.deepEqual(r.judge({ ...base, commits: [withPlan] }), { ok: true, commit: 'abc123' })
  const noPlan = { sha: 'abc123', message: 'Task 1\n\nTierminator-Task: T01' }
  assert.match(r.judge({ ...base, commits: [noPlan] }).reason, /no "Tierminator-Plan: 0123456789abcdef" line/)
  const otherPlan = { ...withPlan, message: withPlan.message.replace('0123456789abcdef', 'ffffffffffffffff') }
  assert.match(r.judge({ ...base, commits: [otherPlan] }).reason, /no "Tierminator-Plan: /)
})

test('a run picked up part-way starts at its first unfinished task and names the skipped ones', () => {
  const done = [r.skippedEntry('T01', 'aaa1111ffff', 'committed')]
  let s = r.startRun({ tasks: TASKS, tasksFile: 'f', branch: 'main', start: 1, done })
  assert.deepEqual([s.current.index, s.current.tier, s.current.attempt], [1, 'sonnet-medium', 1])
  assert.match(r.expectedPrompt(s), /Task: T02$/)
  s = r.advance(s, { ok: true, commit: 'bbb2222' }).state
  const { state } = r.advance(s, { ok: true, commit: 'ccc3333' })
  const text = r.completeText(state)
  assert.match(text, /all 3 tasks are done.*: T01 aaa1111 \(earlier run\), T02 bbb2222 \(sonnet-medium\), T03 ccc3333 \(opus-high\)\./)
  assert.match(text, /were not run this time/)
  assert.equal(r.doneLabel(r.skippedEntry('T01', null, 'from')), 'T01 (skipped by --from)')
  assert.ok(!r.completeText(r.advance(r.advance(r.advance(start(), { ok: true, commit: 'a' }).state, { ok: true, commit: 'b' }).state, { ok: true, commit: 'c' }).state).includes('not run this time'))
})

test('dispatchText spells out the exact call', () => {
  const text = r.dispatchText(start())
  assert.match(text, /subagent_type "tierminator:sonnet-low"/)
  assert.match(text, /description "T01: Task 1"/)
  assert.ok(!text.includes('run_in_background'))
  assert.match(text, /as its prompt exactly the 2 lines inside this fence, without the fence lines:\n```\nTasks file: C:\/plans\/p\.tasks\.json\nTask: T01\n```\nDo not do the task yourself/)
  assert.match(text, /Do not do the task yourself/)
  assert.match(text, /If it runs in the background, end your turn/)
})

test('runningText tells Claude to end its turn while a background task runs', () => {
  const text = r.runningText(start())
  assert.match(text, /T01 is running in the background on tierminator:sonnet-low\. End your turn now/)
})

test('noticeText says what happened and what comes next, for each outcome', () => {
  const s = { ...start(), current: { ...start().current, head: 'abcdef1234' } }
  const next = r.advance(s, { ok: true, commit: 'aaa1111bbb' })
  assert.match(r.noticeText(s, next.state, next.action, { ok: true }), /^tierminator: T01 done \(commit aaa1111, sonnet-low\)\. Call the Agent tool now with subagent_type "tierminator:sonnet-medium"/)
  const outcome = { ok: false, reason: 'Verify failed' }
  const retry = r.advance(s, outcome)
  assert.match(r.noticeText(s, retry.state, retry.action, outcome), /T01 failed at sonnet-low: Verify failed\. Reset to abcdef1; retrying one tier up\. Call the Agent tool now with subagent_type "tierminator:sonnet-medium"/)
  const fatal = { ok: false, fatal: 'the worker left the branch the run started on' }
  const halt = r.advance(s, fatal)
  assert.equal(r.noticeText(s, halt.state, halt.action, fatal), r.haltText(halt.state))
  let done = s
  for (let i = 0; i < 3; i++) done = r.advance(done, { ok: true, commit: `c${i}000000` }).state
  assert.equal(done.phase, 'complete')
  assert.match(r.noticeText(s, done, 'complete', { ok: true }), /all 3 tasks are done/)
})

test('checkDispatch accepts the expected call in the foreground or the background', () => {
  const s = start()
  assert.equal(r.checkDispatch(s, call(s)), null)
  assert.equal(r.checkDispatch(s, call(s, { run_in_background: false })), null)
  assert.equal(r.checkDispatch(s, call(s, { run_in_background: true })), null)
  assert.equal(r.checkDispatch(s, call(s, { prompt: 'Tasks file: C:/plans/p.tasks.json  \r\nTask: T01\r\n' })), null)
  assert.equal(r.checkDispatch(s, call(s, { description: 'anything' })), null, 'the description is not checked')
})

test('checkDispatch names what is wrong', () => {
  const s = start()
  assert.match(r.checkDispatch(s, call(s, { subagent_type: 'tierminator:sonnet-medium' })), /runs on tierminator:sonnet-low, not tierminator:sonnet-medium/)
  assert.match(r.checkDispatch(s, call(s, { prompt: 'Task: T01' })), /prompt is not the expected one/)
  assert.match(r.checkDispatch(s, call(s, { prompt: 'Tasks file: C:/plans/p.tasks.json\nTask: T02' })), /not the expected one/)
  assert.match(r.checkDispatch({ ...s, current: { ...s.current, inFlight: true } }, call(s)), /T01 is already running/)
  assert.match(r.checkDispatch({ ...s, phase: 'halted' }, call(s)), /no tierminator run is in progress/)
  assert.match(r.checkDispatch(null, call(s)), /no tierminator run is in progress/)
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
  const commit = { sha: 'abc123', message: 'Task 2\n\nTierminator-Task: T02' }
  const base = { report, taskId: 'T02', commits: [commit], clean: true, sameBranch: true }
  assert.deepEqual(r.judge(base), { ok: true, commit: 'abc123' })
  assert.match(r.judge({ ...base, sameBranch: false }).fatal, /left the branch/)
  assert.match(r.judge({ ...base, report: null }).reason, /no STATUS report/)
  assert.equal(r.judge({ ...base, report: { ...report, status: 'FAILED', note: 'tests fail' } }).reason, 'tests fail')
  assert.match(r.judge({ ...base, report: { ...report, verify: 'FAIL' } }).reason, /DONE but VERIFY was FAIL/)
  assert.match(r.judge({ ...base, report: r.parseReport('STATUS: DONE\nCOMMIT: abc\nNOTE: x') }).reason, /DONE but VERIFY was NOT RUN/)
  assert.match(r.judge({ ...base, commits: [] }).reason, /made 0 commits instead of one/)
  assert.match(r.judge({ ...base, commits: [commit, commit] }).reason, /made 2 commits/)
  assert.match(r.judge({ ...base, commits: [{ ...commit, message: 'Task 2' }] }).reason, /no "Tierminator-Task: T02" trailer/)
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
    ['T01', 'sonnet-low', 1], ['T02', 'sonnet-medium', 1], ['T03', 'opus-high', 1],
  ])
  assert.match(r.completeText(state), /all 3 tasks are done.*T01 aaa1111 \(sonnet-low\), T02 bbb2222 \(sonnet-medium\)/)
})

test('a failure retries one tier up, twice, and then halts; past sonnet/high the next tier is opus/medium', () => {
  let s = r.advance(start(), { ok: true, commit: 'aaa' }).state // T02 at sonnet-medium
  s = { ...s, current: { ...s.current, head: 'h1' } }
  let out = r.advance(s, { ok: false, reason: 'first' })
  assert.equal(out.action, 'retry')
  assert.deepEqual([out.state.current.attempt, out.state.current.tier, out.state.current.head], [2, 'sonnet-high', 'h1'])
  out = r.advance(out.state, { ok: false, reason: 'second' })
  assert.deepEqual([out.action, out.state.current.attempt, out.state.current.tier], ['retry', 3, 'opus-medium'])
  assert.deepEqual(out.state.current.lastFailure, { tier: 'sonnet-high', reason: 'second' })
  out = r.advance(out.state, { ok: false, reason: 'third' })
  assert.equal(out.action, 'halt')
  assert.equal(out.state.phase, 'halted')
  assert.deepEqual(out.state.halt, { task: 'T02', tried: ['sonnet-medium', 'sonnet-high', 'opus-medium'], reason: 'third' })
  assert.match(r.haltText(out.state), /stopped at T02 after 3 attempt\(s\) \(sonnet-medium, sonnet-high, opus-medium\)\. Reason: third\./)
  assert.match(r.haltText(out.state), /do not fix it or dispatch more tasks/)
})

test('lostText tells Claude the run stopped because its state could not be saved', () => {
  const s = { ...r.advance(start(), { ok: true, commit: 'aaa1111' }).state, planFile: 'C:/plans/p.md' }
  const text = r.lostText(s)
  assert.match(text, /^tierminator: the run stopped: T02 was not dispatched because the run's state could not be saved\. Done: T01 aaa1111 \(/)
  assert.ok(text.includes('/tierminator:execute "C:/plans/p.md"'))
  assert.ok(r.lostText({ ...s, planFile: null }).includes('with the plan\'s path'))
  assert.ok(r.lostText({ ...start(), planFile: null }).includes('Done: none'))
})

test('a failure at the top tier, or a fatal one, halts at once', () => {
  let s = start()
  s = r.advance(s, { ok: true, commit: 'a' }).state
  s = r.advance(s, { ok: true, commit: 'b' }).state // T03 at opus-high
  const top = r.advance(s, { ok: false, reason: 'hard' })
  assert.deepEqual([top.action, top.state.halt.tried], ['halt', ['opus-high']])
  const fatal = r.advance(start(), { ok: false, fatal: 'the worker left the branch the run started on' })
  assert.equal(fatal.action, 'halt')
  assert.match(fatal.state.halt.reason, /left the branch/)
})

test('turnLimitOf reads the limit from a stopped-agent summary, taskIdOf the task-id element', () => {
  const summary = 'Agent "T04: x" stopped at its 40-turn limit (partial result; SendMessage to task-id to continue)'
  assert.equal(r.turnLimitOf(summary), 40)
  assert.equal(r.turnLimitOf('Agent "T04: x" completed'), null)
  assert.equal(r.turnLimitOf(undefined), null)
  assert.equal(r.taskIdOf('<task-notification>\n<task-id>  a1b2c3d4  </task-id>\n</task-notification>'), 'a1b2c3d4')
  assert.equal(r.taskIdOf('<task-id>first</task-id><task-id>second</task-id>'), 'first')
  assert.equal(r.taskIdOf('no id here'), null)
  assert.equal(r.taskIdOf(null), null)
})

test('a fresh task has no agent, no resumes and no turn limit stop', () => {
  assert.equal(r.MAX_RESUMES, 2)
  const { agentId, resumes, resumePending, turnLimited } = start().current
  assert.deepEqual({ agentId, resumes, resumePending, turnLimited }, { agentId: null, resumes: 0, resumePending: false, turnLimited: null })
})

const inFlight = (over = {}) => {
  const s = start()
  return { ...s, current: { ...s.current, inFlight: true, agentId: 'agent-1', ...over } }
}

test('turnLimitStop resumes twice and then halts without retrying or changing tier', () => {
  for (const resumes of [0, 1]) {
    const out = r.turnLimitStop(inFlight({ resumes }), 40)
    assert.equal(out.action, 'resume')
    assert.equal(out.state.phase, 'running')
    assert.equal(out.state.current.resumePending, true)
    assert.deepEqual(out.state.current.turnLimited, { turns: 40 })
    assert.equal(out.state.current.tier, 'sonnet-low')
    assert.equal(out.state.current.attempt, 1)
  }
  const out = r.turnLimitStop(inFlight({ resumes: 2 }), 41)
  assert.equal(out.action, 'halt')
  assert.equal(out.state.phase, 'halted')
  assert.match(out.state.halt.reason, /^T01 reached its turn limit 3 times \(41 turns at the last stop\)/)
  assert.match(out.state.halt.reason, /split it/)
  assert.deepEqual(out.state.halt.tried, ['sonnet-low'])
  assert.equal(out.state.current.tier, 'sonnet-low')
  assert.equal(out.state.current.attempt, 1)
})

test('checkResume accepts the expected resume and names each problem', () => {
  const s = inFlight({ resumePending: true })
  const good = { to: 'agent-1', message: r.RESUME_MESSAGE, summary: 'T01: resume after the turn limit' }
  assert.equal(r.checkResume(s, good), null)
  assert.equal(r.checkResume(s, { ...good, message: r.RESUME_MESSAGE + '  \r\n' }), null)
  assert.equal(r.checkResume({ ...s, phase: 'halted' }, good), 'no tierminator run is in progress')
  assert.equal(r.checkResume(null, good), 'no tierminator run is in progress')
  assert.equal(r.checkResume(inFlight({ resumePending: false }), good), 'no resume is due')
  assert.equal(r.checkResume({ ...s, current: { ...s.current, inFlight: false } }, good), 'no resume is due')
  assert.equal(r.checkResume(s, { ...good, to: 'agent-2' }), 'the resume goes to agent-1, not agent-2')
  assert.equal(r.checkResume(inFlight({ resumePending: true, agentId: null }), { ...good, to: 'anything' }), null)
  assert.equal(r.checkResume(s, { ...good, message: 'go on' }), 'the message is not the expected one')
})

test('resumed clears the pending resume and counts it', () => {
  const s = inFlight({ resumePending: true, resumes: 1 })
  const out = r.resumed(s)
  assert.deepEqual([out.current.resumePending, out.current.resumes], [false, 2])
  assert.deepEqual([s.current.resumePending, s.current.resumes], [true, 1])
})

test('resumeText names the agent, the resume count and the exact message', () => {
  const text = r.resumeText(inFlight({ resumePending: true, resumes: 1 }))
  assert.match(text, /^tierminator: T01 stopped at its turn limit on tierminator:sonnet-low \(resume 2 of 2\)\. /)
  assert.match(text, /to "agent-1", summary "T01: resume after the turn limit"/)
  assert.ok(text.includes('```\n' + r.RESUME_MESSAGE + '\n```\n'))
  assert.match(text, /Do not do the task yourself\. Then end your turn/)
  assert.match(r.resumeText(inFlight({ agentId: null })), /to "the worker's task-id from the notification"/)
})

test('a retry after a failure is a new worker: agent and resume state are cleared', () => {
  const s = inFlight({ resumePending: true, resumes: 2, turnLimited: { turns: 40 } })
  const { state, action } = r.advance(s, { ok: false, reason: 'Verify failed' })
  assert.equal(action, 'retry')
  const { agentId, resumes, resumePending, turnLimited } = state.current
  assert.deepEqual({ agentId, resumes, resumePending, turnLimited }, { agentId: null, resumes: 0, resumePending: false, turnLimited: null })
})
