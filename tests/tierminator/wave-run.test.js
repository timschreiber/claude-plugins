'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const r = require('../../plugins/tierminator/scripts/lib/run.js')
const w = require('../../plugins/tierminator/scripts/lib/wave-run.js')

const REPO = process.platform === 'win32' ? 'C:/repo' : '/repo'
const task = (n, over = {}) => ({
  id: `T${String(n).padStart(2, '0')}`,
  title: `Task ${n}`,
  model: 'sonnet',
  effort: 'medium',
  prompt: 'Do it. Verify: node --test passes.',
  ...over,
})
const TASKS = [
  task(1, { after: [] }),
  task(2, { after: ['T01'] }),
  task(3, { model: 'haiku', effort: 'high', after: ['T01'] }),
  task(4, { model: 'opus', effort: 'high', after: ['T01'] }),
  task(5, { after: ['T02', 'T03', 'T04'] }),
]
const run = () => ({
  ...r.startRun({ tasks: TASKS, tasksFile: 'C:/plans/p.tasks.json', branch: 'main', planId: '0123456789abcdef', graph: true }),
  runId: 'ab12cd34',
})
const wave = (cap = 5) => w.startWave(run(), ['T02', 'T03', 'T04'], 'base000', cap, REPO)
const slot = (s, id) => s.wave.slots[id]
const call = (s, id, over = {}) => ({ ...w.expectedCall(s, id), ...over })

test('slotPlacement puts the worktree under .claude/worktrees with a tierminator- name', () => {
  const want = `${REPO}/.claude/worktrees/tierminator-ab12cd34-T02`
  if (process.platform === 'win32') {
    for (const root of ['C:\\repo', '/c/repo', 'c:/repo']) {
      assert.equal(w.slotPlacement('ab12cd34', root, 'T02').worktree, want)
    }
  } else {
    assert.equal(w.slotPlacement('ab12cd34', '/repo', 'T02').worktree, want)
  }
  const p = w.slotPlacement('ab12cd34', REPO, 'T02')
  assert.ok(path.basename(p.worktree).startsWith('tierminator-'))
  assert.ok(!path.basename(p.worktree).startsWith('agent-'))
  assert.ok(!p.worktree.includes('\\'))
  assert.equal(p.branch, 'tierminator/ab12cd34/T02')
  assert.equal(w.slotPlacement('ab12cd34', '', 'T02').worktree, null)
})

test('startWave makes ready and queued slots on their own tiers', () => {
  const s = wave()
  assert.equal(s.current, null)
  assert.equal(s.wave.n, 2)
  assert.deepEqual(s.wave.size, ['T02', 'T03', 'T04'])
  assert.equal(s.wave.base, 'base000')
  assert.equal(s.wave.cap, 5)
  assert.equal(s.wave.phase, 'working')
  assert.equal(s.wave.halting, null)
  assert.deepEqual(s.wave.setAside, [])
  assert.deepEqual(s.wave.queue, [])
  assert.deepEqual(['T02', 'T03', 'T04'].map(id => slot(s, id).status), ['ready', 'ready', 'ready'])
  assert.deepEqual(['T02', 'T03', 'T04'].map(id => slot(s, id).tier), ['sonnet-medium', 'haiku-high', 'opus-high'])
  assert.equal(slot(s, 'T03').head, 'base000')
  assert.equal(slot(s, 'T03').index, 2)
  assert.equal(slot(s, 'T03').branch, 'tierminator/ab12cd34/T03')
  assert.deepEqual(slot(s, 'T03').pastAgents, [])
})

test('startWave queues the tasks beyond the cap, takes ids in task order, and defaults a bad cap', () => {
  const s = wave(2)
  assert.deepEqual(['T02', 'T03', 'T04'].map(id => slot(s, id).status), ['ready', 'ready', 'queued'])
  assert.deepEqual(s.wave.queue, ['T04'])
  const out = w.startWave(run(), ['T04', 'T02', 'T03'], 'b', 5, REPO)
  assert.deepEqual(out.wave.size, ['T02', 'T03', 'T04'])
  for (const bad of [0, 'x']) {
    const d = w.startWave(run(), ['T02', 'T03', 'T04'], 'b', bad, REPO)
    assert.equal(d.wave.cap, 5)
  }
})

test('startable and dispatched respect the cap', () => {
  let s = wave(2)
  assert.deepEqual(w.startable(s), ['T02', 'T03'])
  s = w.dispatched(s, 'T02', 'now1')
  s = w.dispatched(s, 'T03', 'now2')
  assert.deepEqual(w.startable(s), [])
  assert.equal(slot(s, 'T02').status, 'running')
  assert.equal(slot(s, 'T02').inFlight, true)
  assert.equal(slot(s, 'T02').startedAt, 'now1')
  assert.equal(w.dispatched(s, 'T04'), s)
  assert.deepEqual(s.wave.queue, ['T04'])
  s = w.withSlot(s, 'T02', { ...slot(s, 'T02'), status: 'done' })
  assert.deepEqual(w.startable(s), ['T04'])
  s = w.dispatched(s, 'T04', 'now3')
  assert.deepEqual(s.wave.queue, [])
  assert.equal(slot(s, 'T04').status, 'running')
})

test('startable is empty outside a working run and queues nothing while halting', () => {
  const s = wave(2)
  assert.deepEqual(w.startable({ ...s, phase: 'halted' }), [])
  assert.deepEqual(w.startable({ ...s, wave: { ...s.wave, phase: 'integrating' } }), [])
  const halting = { ...s, wave: { ...s.wave, halting: { task: 'T02', tried: [], reason: 'x' } } }
  assert.deepEqual(w.startable(halting), ['T02', 'T03'])
})

test('taskOfPrompt and worktreeOfPrompt read their lines', () => {
  assert.equal(w.taskOfPrompt('Tasks file: f\r\nTask: T02\r\nParallel: yes'), 'T02')
  assert.equal(w.worktreeOfPrompt('Task: T02\r\nWorktree: C:/a b/c\r\n'), 'C:/a b/c')
  assert.equal(w.taskOfPrompt('Tasks file: f'), null)
  assert.equal(w.worktreeOfPrompt('Task: T02'), null)
  assert.equal(w.taskOfPrompt(undefined), null)
})

test('slotOfAgent and recordAgent', () => {
  let s = w.dispatched(wave(), 'T02')
  assert.equal(w.recordAgent(s, 'T03', 'a1'), s)
  assert.equal(w.recordAgent(s, 'T09', 'a1'), s)
  assert.equal(w.recordAgent(s, 'T02', ''), s)
  assert.equal(w.recordAgent(s, 'T02', 5), s)
  s = w.recordAgent(s, 'T02', 'a1')
  assert.equal(slot(s, 'T02').agentId, 'a1')
  assert.equal(w.recordAgent(s, 'T02', 'a2'), s)
  assert.equal(w.slotOfAgent(s, 'a1'), 'T02')
  assert.equal(w.slotOfAgent(s, 'zz'), null)
  assert.equal(w.slotOfAgent(s, ''), null)
  const past = w.withSlot(s, 'T02', { ...slot(s, 'T02'), agentId: null, pastAgents: ['a3'] })
  assert.equal(w.recordAgent(past, 'T02', 'a3'), past)
})

test('expectedCall adds the Parallel and Worktree lines and no isolation', () => {
  const s = wave()
  const c = w.expectedCall(s, 'T02')
  assert.equal(
    c.prompt,
    ['Tasks file: C:/plans/p.tasks.json', 'Plan: 0123456789abcdef', 'Task: T02', 'Parallel: yes', `Worktree: ${slot(s, 'T02').worktree}`].join('\n')
  )
  assert.equal(c.subagent_type, 'tierminator:sonnet-medium')
  assert.equal(c.description, 'T02: Task 2')
  assert.ok(!('isolation' in c))
  assert.equal(w.expectedCall(s, 'T09'), null)
  const retry = w.withSlot(s, 'T02', { ...slot(s, 'T02'), attempt: 2, lastFailure: { tier: 'sonnet-medium', reason: 'Verify failed' } })
  assert.equal(
    w.expectedCall(retry, 'T02').prompt,
    [
      'Tasks file: C:/plans/p.tasks.json',
      'Plan: 0123456789abcdef',
      'Task: T02',
      'Parallel: yes',
      `Worktree: ${slot(s, 'T02').worktree}`,
      'Retry: attempt 2 of 3; the attempt at sonnet-medium failed and was rolled back.',
      'Reason: Verify failed',
    ].join('\n')
  )
})

test('checkDispatch accepts the expected call, in the foreground or the background', () => {
  const s = wave()
  assert.deepEqual(w.checkDispatch(s, call(s, 'T02')), { id: 'T02', problem: null })
  assert.equal(w.checkDispatch(s, call(s, 'T03', { run_in_background: true })).problem, null)
})

test('checkDispatch refuses isolation in any form', () => {
  const s = wave()
  for (const v of ['worktree', null, false]) {
    assert.match(w.checkDispatch(s, call(s, 'T02', { isolation: v })).problem, /carries isolation/)
  }
})

test('checkDispatch refuses another slot\'s worktree', () => {
  const s = wave()
  const other = w.expectedCall(s, 'T03').prompt.replace('Task: T03', 'Task: T02')
  const p = w.checkDispatch(s, call(s, 'T02', { prompt: other })).problem
  assert.match(p, /^the Worktree: line must be .*T02, not .*T03$/)
  const none = w.expectedCall(s, 'T02').prompt.replace(/\nWorktree: .*/, '')
  assert.match(w.checkDispatch(s, call(s, 'T02', { prompt: none })).problem, /not missing$/)
})

test('checkDispatch names each other problem', () => {
  const s = wave(2)
  const problem = (state, input) => w.checkDispatch(state, input).problem
  assert.equal(problem(null, call(s, 'T02')), 'no parallel wave is running')
  assert.equal(problem({ ...s, phase: 'halted' }, call(s, 'T02')), 'no parallel wave is running')
  assert.equal(problem(run(), call(s, 'T02')), 'no parallel wave is running')
  assert.equal(problem({ ...s, wave: { ...s.wave, phase: 'verifying' } }, call(s, 'T02')), 'wave 2 is closing; dispatch nothing')
  assert.equal(problem(s, { subagent_type: 'x', prompt: 'Tasks file: f' }), 'the prompt has no Task: line')
  assert.equal(problem(s, { subagent_type: 'x', prompt: 'Task: T05' }), 'T05 is not in this wave (wave 2: T02, T03, T04)')
  const running = w.dispatched(s, 'T02')
  assert.equal(problem(running, call(s, 'T02')), 'T02 is already running; wait for it to return')
  for (const status of ['done', 'failed']) {
    const fin = w.withSlot(s, 'T02', { ...slot(s, 'T02'), status })
    assert.equal(problem(fin, call(s, 'T02')), 'T02 has already finished in this wave')
  }
  const full = w.dispatched(running, 'T03')
  assert.equal(problem(full, call(s, 'T04')), 'T04 must wait: 2 tasks are running or due and the cap is 2')
  const halting = { ...full, wave: { ...full.wave, halting: { task: 'T02', tried: [], reason: 'x' } } }
  assert.equal(problem(halting, call(s, 'T04')), 'the wave is halting (T02 failed), so T04 does not start')
  assert.equal(problem(s, call(s, 'T02', { subagent_type: 'tierminator:opus-high' })), 'T02 runs on tierminator:sonnet-medium, not tierminator:opus-high')
  assert.equal(problem(s, call(s, 'T02', { prompt: `${w.expectedCall(s, 'T02').prompt}\nExtra` })), 'the prompt is not the expected one')
})

test('wave-run.js requires only the pure libraries', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../plugins/tierminator/scripts/lib/wave-run.js'), 'utf8')
  const args = [...src.matchAll(/require\(([^)]*)\)/g)].map(m => m[1].replace(/['"]/g, ''))
  assert.ok(args.length > 0)
  for (const a of args) assert.ok(['./run.js', './tasks.js', './waves.js', './git.js'].includes(a), a)
  assert.ok(src.includes("const { toWorktreePath } = require('./git.js')"))
})

// --- judging, advancing and closing slots ---

const sha = 'a'.repeat(40)
const goodCommits = id => [{ sha, message: `Task\n\nTierminator-Task: ${id}\nTierminator-Plan: 0123456789abcdef` }]
const doneReport = { status: 'DONE', commit: sha, verify: 'PASS', note: 'ok' }
const facts = (id, over = {}) => ({ report: doneReport, taskId: id, planId: '0123456789abcdef', commits: goodCommits(id), clean: true, sameBranch: true, ...over })
const running = (s, ...ids) => ids.reduce((acc, id) => w.dispatched(acc, id, 'now'), s)
const finish = (s, id) => w.advanceSlot(s, id, { ok: true, commit: sha })
const fail = (s, id, reason = 'Verify failed') => w.advanceSlot(s, id, { ok: false, reason })

test('judgeSlot accepts a clean finish', () => {
  assert.deepEqual(w.judgeSlot(facts('T02')), { ok: true, commit: sha })
})

test('judgeSlot returns the three fatals in order, with their prefixes', () => {
  assert.deepEqual(w.judgeSlot(facts('T02', { worktreeCreate: 'no space', mainTree: 'dirty' })), { ok: false, fatal: 'WORKTREE CREATE: no space' })
  assert.deepEqual(w.judgeSlot(facts('T02', { mainTree: 'dirty', sameBranch: false })), { ok: false, fatal: 'MAIN TREE: dirty' })
  assert.deepEqual(w.judgeSlot(facts('T02', { sameBranch: false })), { ok: false, fatal: "the worker's worktree is no longer on its own branch" })
  assert.equal(w.judgeSlot(facts('T02', { worktreeCreate: '', mainTree: '' })).ok, true)
})

test('judgeSlot reads SETUP FAILED notes and treats other FAILED notes as a plain reason', () => {
  const failed = note => w.judgeSlot(facts('T02', { report: { status: 'FAILED', verify: 'NOT RUN', note } }))
  assert.deepEqual(failed('setup failed: npm ci'), { ok: false, fatal: 'SETUP FAILED: npm ci' })
  assert.deepEqual(failed('  SETUP FAILED:   npm ci  '), { ok: false, fatal: 'SETUP FAILED: npm ci' })
  assert.deepEqual(failed('could not compile'), { ok: false, reason: 'could not compile' })
})

test('judgeSlot judges a missing report on Git alone', () => {
  assert.deepEqual(w.judgeSlot(facts('T02', { report: null })), { ok: true, commit: sha, unreported: true })
  const none = w.judgeSlot(facts('T02', { report: null, commits: [] }))
  assert.equal(none.ok, false)
  assert.equal(none.unreported, true)
})

test('judgeable is true only for a running, in-flight slot awaiting no message', () => {
  let s = running(wave(), 'T02')
  assert.equal(w.judgeable(s, 'T02'), true)
  assert.equal(w.judgeable(s, 'T03'), false)
  assert.equal(w.judgeable(s, 'T09'), false)
  assert.equal(w.judgeable(null, 'T02'), false)
  s = w.recordAgent(s, 'T02', 'a1')
  assert.equal(w.judgeable(s, 'T02', 'a1'), true)
  assert.equal(w.judgeable(s, 'T02', 'zz'), false)
  assert.equal(w.judgeable(w.withSlot(s, 'T02', { ...slot(s, 'T02'), resumePending: true }), 'T02', 'a1'), false)
  const retried = fail(s, 'T02').state
  assert.equal(w.judgeable(retried, 'T02', 'a1'), false)
  let again = running(retried, 'T02')
  assert.equal(w.judgeable(again, 'T02', 'a1'), false)
  again = w.recordAgent(again, 'T02', 'a2')
  assert.equal(w.judgeable(again, 'T02', 'a2'), true)
  assert.equal(w.judgeable(again, 'T02', 'a1'), false)
  assert.equal(w.judgeable(finish(s, 'T02').state, 'T02', 'a1'), false)
})

test('a clean finish of one slot is done while its siblings run', () => {
  const s = running(wave(), 'T02', 'T03', 'T04')
  const before = JSON.stringify(s)
  const out = finish(s, 'T02')
  assert.equal(JSON.stringify(s), before)
  assert.equal(out.action, 'done')
  assert.equal(slot(out.state, 'T02').status, 'done')
  assert.equal(slot(out.state, 'T02').inFlight, false)
  assert.deepEqual(slot(out.state, 'T02').tried, ['sonnet-medium'])
  assert.deepEqual(out.state.done.at(-1), { id: 'T02', tier: 'sonnet-medium', commit: sha, attempts: 1, wave: 2 })
  assert.equal(out.state.wave.phase, 'working')
  assert.equal(slot(out.state, 'T03').status, 'running')
  const un = w.advanceSlot(s, 'T03', { ok: true, commit: sha, unreported: true })
  assert.equal(un.state.done.at(-1).unreported, true)
})

test('with a cap, a finished slot makes the queued one startable', () => {
  let s = running(wave(2), 'T02', 'T03')
  assert.deepEqual(w.startable(s), [])
  s = finish(s, 'T02').state
  assert.deepEqual(w.startable(s), ['T04'])
  s = w.dispatched(s, 'T04', 'now')
  assert.deepEqual(s.wave.queue, [])
  assert.equal(slot(s, 'T04').status, 'running')
})

test('a failed slot is retried in place one tier up while a sibling runs', () => {
  const s = w.recordAgent(running(wave(), 'T02', 'T03'), 'T02', 'a1')
  const out = fail(s, 'T02')
  assert.equal(out.action, 'retry')
  const t = slot(out.state, 'T02')
  assert.equal(t.tier, 'sonnet-high')
  assert.equal(t.attempt, 2)
  assert.equal(t.status, 'ready')
  assert.equal(t.head, 'base000')
  assert.equal(t.agentId, null)
  assert.deepEqual(t.pastAgents, ['a1'])
  assert.deepEqual(t.tried, ['sonnet-medium'])
  assert.deepEqual(t.lastFailure, { tier: 'sonnet-medium', reason: 'Verify failed' })
  assert.equal(t.startedAt, null)
  assert.equal(t.inFlight, false)
  assert.equal(slot(out.state, 'T03'), slot(s, 'T03'))
  assert.ok(w.startable(out.state).includes('T02'))
})

test('an exhausted slot halts the wave once its siblings settle', () => {
  let s = running(wave(), 'T02', 'T03', 'T04')
  s = w.withSlot(s, 'T04', { ...slot(s, 'T04'), attempt: 3 })
  let out = fail(s, 'T04', 'still broken')
  assert.equal(out.action, 'wait')
  assert.equal(slot(out.state, 'T04').status, 'failed')
  assert.equal(slot(out.state, 'T04').failure, 'still broken')
  assert.deepEqual(out.state.wave.halting, { task: 'T04', tried: ['opus-high'], reason: 'still broken' })
  assert.deepEqual(out.state.wave.queue, [])
  assert.equal(out.state.phase, 'running')
  out = finish(out.state, 'T02')
  assert.equal(out.action, 'done')
  out = finish(out.state, 'T03')
  assert.equal(out.action, 'halt')
  assert.equal(out.state.phase, 'halted')
  assert.equal(out.state.halt.task, 'T04')
  assert.equal(out.state.wave.phase, 'integrating')
})

test('halting skips queued and never-dispatched slots, and dispatch is then refused', () => {
  let s = running(wave(2), 'T02', 'T03')
  s = w.withSlot(s, 'T02', { ...slot(s, 'T02'), attempt: 3, tier: 'opus-high' })
  const out = fail(s, 'T02', 'dead')
  assert.equal(out.action, 'wait')
  assert.equal(slot(out.state, 'T03').status, 'running')
  assert.equal(slot(out.state, 'T04').status, 'skipped')
  assert.deepEqual(out.state.wave.queue, [])
  assert.equal(w.checkDispatch(out.state, call(wave(2), 'T04')).problem, 'the wave is halting (T02 failed), so T04 does not start')
  assert.deepEqual(w.startable(out.state), [])

  const ready = running(wave(), 'T03')
  const never = fail(w.withSlot(ready, 'T03', { ...slot(ready, 'T03'), attempt: 3 }), 'T03', 'dead')
  assert.equal(slot(never.state, 'T02').status, 'skipped')
  assert.equal(slot(never.state, 'T04').status, 'skipped')
  assert.equal(never.action, 'halt')
})

test('a ready slot on a later attempt is not skipped when the wave halts', () => {
  let s = running(wave(), 'T02', 'T03', 'T04')
  s = fail(s, 'T03').state
  s = w.withSlot(s, 'T04', { ...slot(s, 'T04'), attempt: 3 })
  const out = fail(s, 'T04')
  assert.equal(slot(out.state, 'T03').status, 'ready')
  assert.deepEqual(w.startable(out.state), ['T03'])
  assert.equal(w.checkDispatch(out.state, call(out.state, 'T03')).problem, null)
})

test('a sibling failing while the wave halts is still retried', () => {
  let s = running(wave(), 'T02', 'T03', 'T04')
  s = w.withSlot(s, 'T04', { ...slot(s, 'T04'), attempt: 3 })
  s = fail(s, 'T04').state
  const out = fail(s, 'T03')
  assert.equal(out.action, 'retry')
  assert.equal(slot(out.state, 'T03').tier, 'sonnet-low')
  assert.equal(slot(out.state, 'T03').status, 'ready')
  assert.equal(out.state.wave.halting.task, 'T04')
  assert.equal(out.state.phase, 'running')
})

test('all slots done gives integrate with the run still running', () => {
  let s = running(wave(), 'T02', 'T03', 'T04')
  s = finish(s, 'T02').state
  s = finish(s, 'T03').state
  const out = finish(s, 'T04')
  assert.equal(out.action, 'integrate')
  assert.equal(out.state.phase, 'running')
  assert.equal(out.state.wave.phase, 'integrating')
  assert.equal(out.state.done.length, 3)
})

test('closeWave acts only when no slot is queued, ready or running', () => {
  const s = wave()
  assert.deepEqual(w.closeWave(s), { state: s, action: null })
  const all = (state, status) => ['T02', 'T03', 'T04'].reduce((acc, id) => w.withSlot(acc, id, { ...slot(acc, id), status }), state)
  assert.equal(w.closeWave(all(s, 'running')).action, null)
  assert.equal(w.closeWave(all(s, 'queued')).action, null)
  const settled = all(s, 'done')
  const out = w.closeWave(settled)
  assert.equal(out.action, 'integrate')
  assert.equal(out.state.wave.phase, 'integrating')
  assert.equal(settled.wave.phase, 'working')
  assert.equal(w.closeWave(out.state).action, null)
  assert.equal(w.closeWave({ ...settled, phase: 'halted' }).action, null)
  const halting = w.closeWave({ ...settled, wave: { ...settled.wave, halting: { task: 'T02', tried: [], reason: 'x' } } })
  assert.equal(halting.action, 'halt')
  assert.equal(halting.state.phase, 'halted')
  assert.equal(halting.state.halt.task, 'T02')
})

test('a repeated stop changes nothing', () => {
  const s = running(wave(), 'T02', 'T03')
  const done = finish(s, 'T02').state
  assert.deepEqual(finish(done, 'T02'), { state: done, action: null })
  assert.deepEqual(fail(done, 'T02'), { state: done, action: null })
  assert.deepEqual(finish(s, 'T09'), { state: s, action: null })
  const closing = { ...s, wave: { ...s.wave, phase: 'integrating' } }
  assert.deepEqual(finish(closing, 'T03'), { state: closing, action: null })
})

test('each fatal fails the slot without a retry', () => {
  const s = running(wave(), 'T02', 'T03')
  for (const fatal of ['WORKTREE CREATE: x', 'MAIN TREE: y', 'SETUP FAILED: z', 'off its branch']) {
    const out = w.advanceSlot(s, 'T02', { ok: false, fatal })
    assert.equal(out.action, 'wait')
    assert.equal(slot(out.state, 'T02').status, 'failed')
    assert.equal(slot(out.state, 'T02').attempt, 1)
    assert.equal(slot(out.state, 'T02').failure, fatal)
    assert.equal(out.state.wave.halting.reason, fatal)
  }
})

test('a WORKTREE CREATE fatal works on a ready, undispatched slot', () => {
  const out = w.advanceSlot(wave(), 'T02', { ok: false, fatal: 'WORKTREE CREATE: disk full' })
  assert.equal(slot(out.state, 'T02').status, 'failed')
  assert.equal(slot(out.state, 'T03').status, 'skipped')
  assert.equal(out.state.wave.halting.task, 'T02')
  assert.equal(out.action, 'halt')
})

test('turnLimitStop resumes twice, counting each resume, then fails the slot', () => {
  let s = running(wave(), 'T02', 'T03')
  s = w.recordAgent(s, 'T02', 'a1')
  let out = w.turnLimitStop(s, 'T02', 60)
  assert.equal(out.action, 'resume')
  assert.equal(slot(out.state, 'T02').resumePending, true)
  assert.equal(slot(out.state, 'T02').resumeFor, 'turn-limit')
  assert.deepEqual(slot(out.state, 'T02').turnLimited, { turns: 60 })
  assert.equal(slot(out.state, 'T02').status, 'running')
  s = w.resumed(out.state, 'T02')
  assert.equal(slot(s, 'T02').resumes, 1)
  assert.equal(slot(s, 'T02').resumePending, false)
  out = w.turnLimitStop(s, 'T02', 60)
  assert.equal(out.action, 'resume')
  s = w.resumed(out.state, 'T02')
  assert.equal(slot(s, 'T02').resumes, 2)
  out = w.turnLimitStop(s, 'T02', 61)
  assert.equal(out.action, 'wait')
  assert.equal(slot(out.state, 'T02').status, 'failed')
  assert.match(out.state.wave.halting.reason, /^T02 reached its turn limit 3 times \(61 turns at the last stop\)/)
  assert.equal(w.turnLimitStop(wave(), 'T02', 5).action, null)
})

test('shouldAsk and askForReport keep the slot in flight and ask once', () => {
  let s = w.recordAgent(running(wave(), 'T02', 'T03'), 'T02', 'a1')
  const outcome = { ok: false, reason: 'no report', unreported: true }
  assert.equal(w.shouldAsk(s, 'T02', outcome), true)
  assert.equal(w.shouldAsk(s, 'T03', outcome), false)
  assert.equal(w.shouldAsk(s, 'T09', outcome), false)
  assert.equal(w.shouldAsk(s, 'T02', { ok: false, reason: 'x' }), false)
  const out = w.askForReport(s, 'T02')
  assert.equal(out.action, 'ask')
  assert.equal(slot(out.state, 'T02').status, 'running')
  assert.equal(slot(out.state, 'T02').inFlight, true)
  assert.equal(slot(out.state, 'T02').asked, true)
  assert.equal(slot(out.state, 'T02').resumeFor, 'report')
  assert.equal(w.shouldAsk(out.state, 'T02', outcome), false)
  assert.equal(slot(s, 'T02').asked, false)
})

test('checkResume accepts the expected message and names each problem', () => {
  let s = w.recordAgent(running(wave(), 'T02', 'T03'), 'T02', 'a1')
  const turn = w.turnLimitStop(s, 'T02', 60).state
  const ok = { to: 'a1', message: w.resumeMessage(turn, 'T02') }
  assert.deepEqual(w.checkResume(turn, ok), { id: 'T02', problem: null })
  assert.equal(w.resumeMessage(turn, 'T02'), r.RESUME_MESSAGE)
  assert.deepEqual(w.checkResume(turn, { ...ok, message: 'hello' }), { id: 'T02', problem: 'the message is not the expected one' })
  assert.deepEqual(w.checkResume(s, ok), { id: 'T02', problem: "no message to T02's worker is due" })
  assert.deepEqual(w.checkResume(turn, { ...ok, to: 'zz' }), { id: null, problem: 'no worker of wave 2 has agent id zz' })
  assert.deepEqual(w.checkResume(null, ok), { id: null, problem: 'no parallel wave is running' })
  assert.deepEqual(w.checkResume(run(), ok), { id: null, problem: 'no parallel wave is running' })
  assert.deepEqual(w.checkResume({ ...turn, phase: 'halted' }, ok), { id: null, problem: 'no parallel wave is running' })
  const ask = w.askForReport(s, 'T02').state
  assert.equal(w.resumeMessage(ask, 'T02'), r.REPORT_MESSAGE)
  assert.equal(w.checkResume(ask, { to: 'a1', message: r.REPORT_MESSAGE }).problem, null)
  assert.equal(w.checkResume(ask, ok).problem, 'the message is not the expected one')
})

test('resumed counts a resume but not a report request', () => {
  const s = w.recordAgent(running(wave(), 'T02'), 'T02', 'a1')
  const turn = w.resumed(w.turnLimitStop(s, 'T02', 60).state, 'T02')
  assert.equal(slot(turn, 'T02').resumes, 1)
  assert.equal(slot(turn, 'T02').resumeFor, null)
  const ask = w.resumed(w.askForReport(s, 'T02').state, 'T02')
  assert.equal(slot(ask, 'T02').resumes, 0)
  assert.equal(slot(ask, 'T02').resumePending, false)
  assert.equal(slot(ask, 'T02').asked, true)
})
