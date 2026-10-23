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
