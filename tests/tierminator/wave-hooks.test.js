'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PLUGIN = path.join(__dirname, '..', '..', 'plugins', 'tierminator')
const lib = f => require(path.join(PLUGIN, 'scripts', 'lib', f))
const state = lib('state.js')
const git = lib('git.js')
const r = lib('run.js')
const w = lib('wave-run.js')
const telemetry = lib('telemetry.js')

const S = 'wave-sess'
const PLAN_ID = 'feedfacecafebeef'

// Git in a test repository; fails the test on an error.
const gitIn = (cwd, ...args) => {
  const res = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`)
  return res.stdout.trim()
}
// A repository with one commit, a "main" branch and a .gitignore that ignores *.log.
function makeRepo(where) {
  fs.mkdirSync(where, { recursive: true })
  gitIn(where, 'init', '-q', '-b', 'main')
  gitIn(where, 'config', 'user.name', 'Test')
  gitIn(where, 'config', 'user.email', 'test@example.com')
  gitIn(where, 'config', 'commit.gpgsign', 'false')
  gitIn(where, 'config', 'core.autocrlf', 'false')
  fs.writeFileSync(path.join(where, 'README.md'), '# test\n')
  fs.writeFileSync(path.join(where, '.gitignore'), '*.log\n')
  gitIn(where, 'add', '-A')
  gitIn(where, 'commit', '-q', '-m', 'init')
  return where
}

let dir
let repo
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-wave-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(dir, 'data')
  state.activate(S)
})
afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

// Runs a hook script with `stdin` and returns {status, stdout, json}. CLAUDE_CODE_ENTRYPOINT is left out
// unless `env` sets it, so the hooks see an interactive session whatever shell runs the tests.
function hook(script, stdin, args = [], env = {}) {
  const base = { ...process.env }
  delete base.CLAUDE_CODE_ENTRYPOINT
  const res = spawnSync(process.execPath, [path.join(PLUGIN, 'scripts', script), ...args], {
    input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
    env: { ...base, ...env },
    encoding: 'utf8',
  })
  let json = null
  try {
    json = JSON.parse(res.stdout)
  } catch {}
  return { status: res.status, stdout: res.stdout, json }
}

const task = (n, over = {}) => ({
  id: `T${String(n).padStart(2, '0')}`,
  title: `Task ${n}`,
  model: 'sonnet',
  effort: 'medium',
  prompt: 'Do it.\nFiles to change: src/a.js\nVerify: node --test passes.',
  ...over,
})
const TASKS = [task(1, { after: [] }), task(2, { model: 'haiku', effort: 'high', after: [] }), task(3, { model: 'opus', effort: 'high', after: [] })]

// Starts a wave of all three tasks on its own repository and returns its state.
function startWaveRun(over = {}, cap = 5) {
  repo = makeRepo(path.join(dir, 'repo'))
  git.excludeWorktrees(repo)
  const tasksFile = path.join(dir, 'plan.tasks.json')
  fs.writeFileSync(tasksFile, JSON.stringify({ tasks: TASKS }))
  const root = git.worktreeList(repo)[0].path
  let s = {
    ...r.startRun({ tasks: TASKS, tasksFile, planFile: path.join(dir, 'plan.md'), branch: 'main', planId: PLAN_ID, graph: true }),
    cwd: repo,
    ...over,
  }
  s = w.startWave(s, ['T01', 'T02', 'T03'], git.head(repo), cap, root)
  state.write(S, s)
  return s
}

const slotOf = id => state.read(S).wave.slots[id]
const agentPre = toolInput => ({ session_id: S, cwd: repo, tool_name: 'Agent', tool_input: toolInput })
const agentPost = (toolInput, response = { status: 'completed' }) => ({ ...agentPre(toolInput), tool_response: response })
const callOf = id => w.expectedCall(state.read(S), id)
const subStop = (id, text, over = {}) => ({
  session_id: S,
  agent_id: 'worker-' + id,
  agent_type: 'tierminator:' + slotOf(id).tier,
  hook_event_name: 'SubagentStop',
  last_assistant_message: text,
  ...over,
})
const report = (status, commit = 'NONE', note = 'did it') => 'STATUS: ' + status + '\nCOMMIT: ' + commit + '\nVERIFY: PASS\nNOTE: ' + note
// What a worker does for task `id`: a file and one commit with the trailers, in its slot's worktree.
function workerCommits(id) {
  const wt = slotOf(id).worktree
  fs.writeFileSync(path.join(wt, id + '.txt'), id)
  gitIn(wt, 'add', '-A')
  gitIn(wt, 'commit', '-q', '-m', 'Task ' + id, '-m', 'Tierminator-Task: ' + id, '-m', 'Tierminator-Plan: ' + PLAN_ID)
  return gitIn(wt, 'rev-parse', 'HEAD')
}

test('wave fixtures start three ready slots in a clean main tree', () => {
  startWaveRun()
  const s = state.read(S)
  assert.deepEqual(Object.keys(s.wave.slots), ['T01', 'T02', 'T03'])
  assert.deepEqual(['T01', 'T02', 'T03'].map(id => slotOf(id).status), ['ready', 'ready', 'ready'])
  assert.deepEqual(['T01', 'T02', 'T03'].map(id => slotOf(id).tier), ['sonnet-medium', 'haiku-high', 'opus-high'])
  assert.ok(git.isClean(repo))
  assert.equal(s.current, null)
})

const spend = lib('spend.js')
const attemptRows = () => telemetry.read(path.join(dir, 'plan.telemetry.jsonl')).filter(x => x.kind === 'attempt')

test('spend records an attempt of a wave slot', () => {
  const s = startWaveRun()
  const prev = w.dispatched(s, 'T02')
  const next = w.advanceSlot(prev, 'T02', { ok: true, commit: 'abc' }).state
  const out = spend.recordAttempt({ session_id: S, agent_id: 'worker-T02' }, prev, next, { slotId: 'T02', ran: false, stopReason: 'report' })
  const rows = attemptRows()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].task, 'T02')
  assert.equal(rows[0].tier, 'haiku-high')
  assert.equal(rows[0].attempt, 1)
  assert.equal(rows[0].outcome, 'done')
  assert.equal(rows[0].runId, prev.runId)
  assert.equal(rows[0].agentId, 'worker-T02')
  assert.equal(out.next.spendLines.length, 1)
})

test('spend judges a failed wave slot as halt or retry by its ladder', () => {
  const s = startWaveRun()
  const p3 = w.dispatched(s, 'T03')
  const n3 = w.advanceSlot(p3, 'T03', { ok: false, reason: 'x' }).state
  spend.recordAttempt({ session_id: S, agent_id: 'worker-T03' }, p3, n3, { slotId: 'T03', ran: false })
  const p1 = w.dispatched(s, 'T01')
  const n1 = w.advanceSlot(p1, 'T01', { ok: false, reason: 'x' }).state
  spend.recordAttempt({ session_id: S, agent_id: 'worker-T01' }, p1, n1, { slotId: 'T01', ran: false })
  const rows = attemptRows()
  const by = id => rows.find(x => x.task === id)
  assert.equal(by('T03').outcome, 'halt')
  assert.equal(by('T03').reason, 'x')
  assert.equal(by('T01').outcome, 'retry')
  assert.equal(by('T01').reason, 'x')
})

test('spend writes no second row for the same wave slot attempt and agent', () => {
  const s = startWaveRun()
  const prev = w.dispatched(s, 'T02')
  const next = w.advanceSlot(prev, 'T02', { ok: true, commit: 'abc' }).state
  const input = { session_id: S, agent_id: 'worker-T02' }
  spend.recordAttempt(input, prev, next, { slotId: 'T02', ran: false })
  spend.recordAttempt(input, prev, next, { slotId: 'T02', ran: false })
  assert.equal(attemptRows().length, 1)
})

test('spend.outcomeOf without a slot id still judges a serial state', () => {
  const tasksFile = path.join(dir, 'plan.tasks.json')
  const prev = r.startRun({ tasks: [task(1)], tasksFile, planFile: path.join(dir, 'plan.md'), branch: 'main', planId: PLAN_ID })
  const next = r.advance(prev, { ok: true, commit: 'a' }).state
  assert.equal(spend.outcomeOf(prev, next).outcome, 'done')
})

const resultFile = lib('result.js')
const stopFx = require('./fixtures/stop-failure.js')

test('result.currentId reads a wave state', () => {
  const s = startWaveRun()
  assert.equal(resultFile.currentId(s), 'T01')
  const p = w.dispatched(s, 'T03')
  const halted = w.advanceSlot(p, 'T03', { ok: false, reason: 'x' }).state
  assert.equal(resultFile.currentId(halted), 'T03')
  const serial = r.startRun({ tasks: [task(1)], tasksFile: 'f', branch: 'main' })
  assert.equal(resultFile.currentId(serial), 'T01')
})

test('result.endOf treats a wave state as a run', () => {
  const s = startWaveRun()
  const a = resultFile.endOf({ ...s, phase: 'abandoned' })
  assert.equal(a.outcome, 'halted')
  assert.equal(a.haltedAt, 'T01')
  const b = resultFile.endOf({ ...s, phase: 'running' }, 'why')
  assert.equal(b.outcome, 'halted')
  assert.equal(b.reason, 'why')
  assert.equal(b.haltedAt, 'T01')
})

test('a usage limit during a wave writes a limit result at the open task', () => {
  const s = startWaveRun()
  state.write(S, { ...s, phase: 'running' })
  const transcript = path.join(dir, 'transcript.jsonl')
  fs.writeFileSync(transcript, stopFx.transcript('oauth'))
  hook('h7-limit.js', { ...stopFx.PAYLOADS.oauth, session_id: S, cwd: repo, transcript_path: transcript })
  const res = JSON.parse(fs.readFileSync(resultFile.pathFor(S, path.join(dir, 'plan.md')), 'utf8'))
  assert.equal(res.outcome, 'limit')
  assert.equal(res.haltedAt, 'T01')
})

test('H4 pre makes the slot worktree and lets the call through', () => {
  startWaveRun()
  const res = hook('h4-dispatch.js', agentPre(callOf('T01')), ['pre'])
  assert.equal(res.stdout, '')
  const slot = slotOf('T01')
  assert.equal(slot.status, 'running')
  assert.equal(slot.inFlight, true)
  assert.ok(fs.existsSync(slot.worktree))
  assert.equal(git.branch(slot.worktree), slot.branch)
  assert.equal(git.head(slot.worktree), state.read(S).wave.base)
  assert.ok(git.isClean(repo))
})

const preOf = input => hook('h4-dispatch.js', agentPre(input), ['pre'])
const denial = res => res.json.hookSpecificOutput

test('the three calls of a wave pass one after another', () => {
  startWaveRun()
  for (const id of ['T01', 'T02', 'T03']) assert.equal(preOf(callOf(id)).stdout, '')
  for (const id of ['T01', 'T02', 'T03']) {
    assert.ok(fs.existsSync(slotOf(id).worktree))
    assert.equal(slotOf(id).status, 'running')
  }
})

test('a call carrying isolation is denied', () => {
  startWaveRun()
  const res = preOf({ ...callOf('T01'), isolation: 'worktree' })
  assert.equal(denial(res).permissionDecision, 'deny')
  assert.match(denial(res).permissionDecisionReason, /isolation/)
  assert.ok(!fs.existsSync(slotOf('T01').worktree))
  assert.equal(slotOf('T01').status, 'ready')
})

test('a wrong tier or a foreign Worktree line is denied with the right call', () => {
  startWaveRun()
  const tier = preOf({ ...callOf('T01'), subagent_type: 'tierminator:opus-high' })
  assert.equal(denial(tier).permissionDecision, 'deny')
  assert.match(denial(tier).permissionDecisionReason, /runs on tierminator:sonnet-medium/)
  assert.match(denial(tier).permissionDecisionReason, /Call the Agent tool/)
  const call = callOf('T01')
  const foreign = preOf({ ...call, prompt: call.prompt.replace(/^Worktree:.*$/m, 'Worktree: C:/elsewhere') })
  assert.equal(denial(foreign).permissionDecision, 'deny')
  assert.match(denial(foreign).permissionDecisionReason, /Worktree: line must be/)
  assert.match(denial(foreign).permissionDecisionReason, /Call the Agent tool/)
})

test('a worktree that cannot be made denies with Git message and fails the slot', () => {
  startWaveRun()
  const wt = slotOf('T01').worktree
  fs.mkdirSync(path.dirname(wt), { recursive: true })
  fs.writeFileSync(wt, 'x')
  const res = preOf(callOf('T01'))
  assert.equal(denial(res).permissionDecision, 'deny')
  assert.match(denial(res).permissionDecisionReason, /git worktree add failed/)
  assert.equal(slotOf('T01').status, 'failed')
  assert.ok(slotOf('T01').failure.startsWith('WORKTREE CREATE:'))
  assert.equal(state.read(S).wave.halting.task, 'T01')
  assert.ok(!fs.existsSync(slotOf('T02').worktree))
})

test('a retry discards the old worktree and makes a fresh one', () => {
  startWaveRun()
  assert.equal(preOf(callOf('T01')).stdout, '')
  const wt = slotOf('T01').worktree
  fs.writeFileSync(path.join(wt, 'marker.txt'), 'old')
  const s = state.read(S)
  state.write(S, w.advanceSlot(s, 'T01', { ok: false, reason: 'x' }).state)
  assert.equal(preOf(callOf('T01')).stdout, '')
  assert.ok(!fs.existsSync(path.join(wt, 'marker.txt')))
  assert.ok(fs.existsSync(wt))
  assert.equal(git.branch(wt), 'tierminator/' + state.read(S).runId + '/T01')
})

const h4 = lib('h4-wave.js')
const promptFor = (id, plan = 'P1') => 'Tasks file: x\nPlan: ' + plan + '\nTask: ' + id + '\nParallel: yes\nWorktree: C:/w'
const transcript = (name, content) => {
  const f = path.join(dir, name)
  fs.writeFileSync(f, JSON.stringify({ type: 'user', message: { content } }) + '\n')
  return f
}

test('slotFromTranscript reads the task from the first prompt', () => {
  const f = transcript('t.jsonl', promptFor('T02'))
  assert.equal(h4.slotFromTranscript(f, 'P1'), 'T02')
  assert.equal(h4.slotFromTranscript(f, 'P2'), null)
  assert.equal(h4.slotFromTranscript(path.join(dir, 'missing.jsonl'), 'P1'), null)
  const g = transcript('u.jsonl', [{ type: 'text', text: promptFor('T02') }])
  assert.equal(h4.slotFromTranscript(g, 'P1'), 'T02')
})

test('slotOfStop finds a slot by transcript or by agent id', () => {
  startWaveRun()
  const f = transcript('t3.jsonl', promptFor('T03', PLAN_ID))
  assert.equal(h4.slotOfStop(state.read(S), { agent_transcript_path: f }), 'T03')
  assert.equal(preOf(callOf('T01')).stdout, '')
  state.write(S, w.recordAgent(state.read(S), 'T01', 'a1'))
  assert.equal(h4.slotOfStop(state.read(S), { agent_id: 'a1' }), 'T01')
})

test('slotFacts reports commits, cleanliness and the main tree', () => {
  startWaveRun()
  assert.equal(preOf(callOf('T01')).stdout, '')
  workerCommits('T01')
  const facts = h4.slotFacts(repo, state.read(S), 'T01')
  assert.equal(facts.commits.length, 1)
  assert.equal(facts.clean, true)
  assert.equal(facts.sameBranch, true)
  assert.equal(facts.mainTree, null)
  fs.writeFileSync(path.join(repo, 'stray.txt'), 'x')
  assert.match(h4.slotFacts(repo, state.read(S), 'T01').mainTree, /uncommitted/)
})

test('stubHalt halts the run and names the slot branches', () => {
  const s = startWaveRun()
  const res = h4.stubHalt(s, 'T01', 'Note.')
  assert.equal(res.state.phase, 'halted')
  assert.equal(res.state.halt.reason, h4.STUB_REASON)
  for (const id of s.wave.size) assert.ok(res.notice.includes(s.wave.slots[id].branch))
})

// Dispatches all three slots with the pre hook.
function dispatchAll() {
  startWaveRun()
  for (const id of ['T01', 'T02', 'T03']) assert.equal(preOf(callOf(id)).stdout, '')
}
// A SubagentStop for slot `id`; its transcript names the task, as the worker's first prompt does.
const stopOf = (id, text) => subStop(id, text, { agent_transcript_path: transcript('stop-' + id + '.jsonl', promptFor(id, PLAN_ID)) })

test('a clean finish settles one slot while the others run', () => {
  dispatchAll()
  const sha = workerCommits('T01')
  hook('h4-dispatch.js', stopOf('T01', report('DONE', sha)), ['stop'])
  const s = state.read(S)
  assert.equal(slotOf('T01').status, 'done')
  assert.equal(slotOf('T01').agentId, 'worker-T01')
  assert.equal(s.done.length, 1)
  assert.equal(s.done[0].id, 'T01')
  assert.equal(s.done[0].commit, sha)
  assert.match(s.notice, /T01 done/)
  assert.match(s.notice, /Still running: T02, T03/)
  assert.equal(slotOf('T02').status, 'running')
  assert.equal(slotOf('T03').status, 'running')
  assert.ok(git.isClean(repo))
})

test('a failed slot retries in place while the others run', () => {
  dispatchAll()
  hook('h4-dispatch.js', stopOf('T01', report('FAILED', 'NONE', 'tests fail')), ['stop'])
  const s = state.read(S)
  assert.equal(slotOf('T01').status, 'ready')
  assert.equal(slotOf('T01').attempt, 2)
  assert.equal(slotOf('T01').tier, 'sonnet-high')
  assert.equal(slotOf('T02').status, 'running')
  assert.match(s.notice, /T01 failed at sonnet-medium: tests fail/)
  assert.ok(s.notice.includes('tierminator:sonnet-high'))
})
