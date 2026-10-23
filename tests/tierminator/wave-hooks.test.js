'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync, spawn } = require('node:child_process')
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

const stopHook = input => hook('h4-dispatch.js', input, ['stop'])

test('a stale or repeated stop changes nothing', () => {
  dispatchAll()
  const sha = workerCommits('T01')
  stopHook(stopOf('T01', report('DONE', sha)))
  assert.equal(state.read(S).done.length, 1)
  const before = fs.readFileSync(state.fileFor(S))
  stopHook(stopOf('T01', report('DONE', sha)))
  assert.equal(state.read(S).done.length, 1)
  assert.ok(fs.readFileSync(state.fileFor(S)).equals(before))
  stopHook({ ...stopOf('T02', report('DONE', sha)), agent_type: 'Explore' })
  assert.ok(fs.readFileSync(state.fileFor(S)).equals(before))
  assert.equal(slotOf('T02').status, 'running')
})

test('an exhausted slot halts the run after its siblings settle', () => {
  dispatchAll()
  stopHook(stopOf('T03', report('FAILED', 'NONE', 'cannot do it')))
  assert.equal(slotOf('T03').status, 'failed')
  let s = state.read(S)
  assert.equal(s.wave.halting.task, 'T03')
  assert.equal(s.phase, 'running')
  assert.equal(slotOf('T01').status, 'running')
  assert.equal(slotOf('T02').status, 'running')
  const sha1 = workerCommits('T01')
  stopHook(stopOf('T01', report('DONE', sha1)))
  assert.equal(state.read(S).phase, 'running')
  const sha2 = workerCommits('T02')
  stopHook(stopOf('T02', report('DONE', sha2)))
  s = state.read(S)
  assert.equal(s.phase, 'halted')
  assert.equal(s.halt.task, 'T03')
  assert.match(s.notice, /wave 1 stopped: T03 failed/)
  assert.ok(s.notice.includes('T01 ' + sha1.slice(0, 7)))
  assert.ok(s.notice.includes('T02 ' + sha2.slice(0, 7)))
})

test('a leaked edit in the main tree fails as MAIN TREE', () => {
  dispatchAll()
  const sha = workerCommits('T01')
  fs.writeFileSync(path.join(repo, 'stray.txt'), 'leak')
  stopHook(stopOf('T01', report('DONE', sha)))
  assert.equal(slotOf('T01').status, 'failed')
  assert.ok(slotOf('T01').failure.startsWith('MAIN TREE:'))
  assert.equal(state.read(S).wave.halting.task, 'T01')
  assert.equal(slotOf('T01').attempt, 1)
})

test('a failed setup is fatal and not retried', () => {
  dispatchAll()
  stopHook(stopOf('T01', report('FAILED', 'NONE', 'SETUP FAILED: npm ci exited 1')))
  assert.equal(slotOf('T01').status, 'failed')
  assert.ok(slotOf('T01').failure.startsWith('SETUP FAILED:'))
  assert.equal(slotOf('T01').attempt, 1)
})

test('a stop with no last_assistant_message reads the report from the transcript', () => {
  dispatchAll()
  const sha = workerCommits('T01')
  const file = path.join(dir, 'report-T01.jsonl')
  fs.writeFileSync(
    file,
    JSON.stringify({ type: 'user', message: { content: promptFor('T01', PLAN_ID) } }) +
      '\n' +
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: report('DONE', sha) }] } }) +
      '\n'
  )
  const input = subStop('T01', '', { agent_transcript_path: file })
  delete input.last_assistant_message
  stopHook(input)
  assert.equal(slotOf('T01').status, 'done')
})

test('no report and no commit asks the worker once', () => {
  dispatchAll()
  stopHook(stopOf('T01', ''))
  assert.equal(slotOf('T01').status, 'running')
  assert.equal(slotOf('T01').resumePending, true)
  assert.equal(slotOf('T01').resumeFor, 'report')
  const s = state.read(S)
  assert.match(s.notice, /without its report block/)
  assert.ok(s.notice.includes('to "worker-T01"'))
})

test('the agent is found by its transcript when no id was recorded', () => {
  dispatchAll()
  const sha = workerCommits('T02')
  const file = transcript('zz.jsonl', 'Tasks file: x\nPlan: ' + PLAN_ID + '\nTask: T02\nParallel: yes')
  stopHook(subStop('T02', report('DONE', sha), { agent_id: 'zz', agent_transcript_path: file }))
  assert.equal(slotOf('T02').status, 'done')
  assert.equal(slotOf('T02').agentId, 'zz')
})

const postHook = input => hook('h4-dispatch.js', input, ['post'])

test('post of a background launch records the agent id and says to end the turn', () => {
  startWaveRun()
  assert.equal(preOf(callOf('T01')).stdout, '')
  const res = postHook(agentPost(callOf('T01'), { isAsync: true, status: 'async_launched', agentId: 'worker-T01' }))
  assert.match(res.json.hookSpecificOutput.additionalContext, /T01 on tierminator:sonnet-medium is running in the background/)
  assert.equal(slotOf('T01').agentId, 'worker-T01')
  assert.equal(slotOf('T01').background, true)
})

test('post then stop and stop then post both settle the slot', () => {
  dispatchAll()
  postHook(agentPost(callOf('T01'), { isAsync: true, status: 'async_launched', agentId: 'worker-T01' }))
  const sha1 = workerCommits('T01')
  stopHook(stopOf('T01', report('DONE', sha1)))
  assert.equal(slotOf('T01').status, 'done')
  const sha2 = workerCommits('T02')
  stopHook(stopOf('T02', report('DONE', sha2)))
  assert.equal(slotOf('T02').status, 'done')
  const res = postHook(agentPost(callOf('T02'), { status: 'completed', agentId: 'worker-T02' }))
  assert.match(res.json.hookSpecificOutput.additionalContext, /T02 done/)
  assert.equal(state.read(S).notice, null)
})

test('the failure mode counts the failed Agent call as a failed attempt', () => {
  dispatchAll()
  const res = hook('h4-dispatch.js', { ...agentPre(callOf('T01')), error: 'boom\nmore' }, ['failure'])
  assert.match(res.json.hookSpecificOutput.additionalContext, /T01 failed at sonnet-medium: the Agent call failed: boom/)
  assert.equal(slotOf('T01').status, 'ready')
  assert.equal(slotOf('T01').attempt, 2)
  assert.equal(state.read(S).notice, null)
})

test('post with a saved lost-state note ends the run', () => {
  dispatchAll()
  state.saveLost(S, 'LOST')
  const res = postHook(agentPost(callOf('T01')))
  assert.equal(res.json.hookSpecificOutput.additionalContext, 'LOST')
  assert.equal(state.read(S), null)
  assert.equal(state.isActive(S), false)
})

// A worker transcript of `n` assistant messages.
function turnsTranscript(n, id) {
  const file = path.join(dir, 'turns.jsonl')
  const lines = Array.from({ length: n }, (_, i) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: new Date(Date.now() - (n - i) * 1000).toISOString(),
      message: { id: `m${i}`, model: 'claude-sonnet-5', content: [{ type: 'text', text: '...' }], usage: { input_tokens: 1, output_tokens: 1 } },
    })
  )
  // The first line is the worker's prompt, which names its task, as a real worker transcript does.
  const first = JSON.stringify({ type: 'user', message: { content: promptFor(id, PLAN_ID) } })
  fs.writeFileSync(file, [first, ...lines].join('\n') + '\n')
  return file
}
const sendMessage = (to, message) => ({
  session_id: S,
  cwd: repo,
  tool_name: 'SendMessage',
  tool_input: { to, summary: 'T01: resume after the turn limit', message },
})
const ctxOf = res => res.json.hookSpecificOutput.additionalContext
const limitedResponse = { status: 'completed', agentId: 'worker-T01', content: 'stopped at its 60-turn limit' }

test('a stop with no report at the turn limit marks the slot and gives no notice', () => {
  dispatchAll()
  stopHook(subStop('T01', '', { agent_transcript_path: turnsTranscript(60, 'T01') }))
  assert.deepEqual(slotOf('T01').turnLimited, { turns: 60 })
  assert.equal(slotOf('T01').status, 'running')
  assert.equal(slotOf('T01').agentId, 'worker-T01')
  assert.equal(state.read(S).notice, null)
})

test('a foreground post at the turn limit asks Claude to resume the worker', () => {
  dispatchAll()
  stopHook(subStop('T01', '', { agent_transcript_path: turnsTranscript(60, 'T01') }))
  const res = postHook(agentPost(callOf('T01'), limitedResponse))
  assert.match(ctxOf(res), /turn limit/)
  assert.ok(ctxOf(res).includes('to "worker-T01"'))
  assert.equal(slotOf('T01').resumePending, true)
})

test('resume-pre passes only the expected message to the worker', () => {
  dispatchAll()
  stopHook(subStop('T01', '', { agent_transcript_path: turnsTranscript(60, 'T01') }))
  postHook(agentPost(callOf('T01'), limitedResponse))
  const wrong = hook('h4-dispatch.js', sendMessage('worker-T01', 'carry on'), ['resume-pre'])
  assert.equal(wrong.json.hookSpecificOutput.permissionDecision, 'deny')
  assert.match(wrong.json.hookSpecificOutput.permissionDecisionReason, /not the expected one/)
  assert.equal(slotOf('T01').resumes, 0)
  const resume = hook('h4-dispatch.js', sendMessage('worker-T01', r.RESUME_MESSAGE), ['resume-pre'])
  assert.equal(resume.stdout, '')
  assert.equal(slotOf('T01').resumes, 1)
})

test('resume-pre refuses a message to another agent while a resume is due', () => {
  dispatchAll()
  stopHook(subStop('T01', '', { agent_transcript_path: turnsTranscript(60, 'T01') }))
  postHook(agentPost(callOf('T01'), limitedResponse))
  const other = hook('h4-dispatch.js', sendMessage('someone-else', r.RESUME_MESSAGE), ['resume-pre'])
  assert.equal(other.json.hookSpecificOutput.permissionDecision, 'deny')
  assert.equal(slotOf('T01').resumePending, true)
  const wrong = hook('h4-dispatch.js', sendMessage('worker-T01', 'carry on'), ['resume-pre'])
  assert.match(wrong.json.hookSpecificOutput.permissionDecisionReason, /not the expected one/)
  assert.equal(slotOf('T01').resumePending, true)
  const ok = hook('h4-dispatch.js', sendMessage('worker-T01', r.RESUME_MESSAGE), ['resume-pre'])
  assert.equal(ok.stdout, '')
  assert.equal(slotOf('T01').resumePending, false)
  assert.equal(slotOf('T01').resumes, 1)
})

test('resume-post says the slot runs in the background and resume-failure fails it fatally', () => {
  dispatchAll()
  stopHook(subStop('T01', '', { agent_transcript_path: turnsTranscript(60, 'T01') }))
  postHook(agentPost(callOf('T01'), limitedResponse))
  hook('h4-dispatch.js', sendMessage('worker-T01', r.RESUME_MESSAGE), ['resume-pre'])
  const post = hook('h4-dispatch.js', sendMessage('worker-T01', r.RESUME_MESSAGE), ['resume-post'])
  assert.match(ctxOf(post), /running in the background/)
  const fail = hook('h4-dispatch.js', { ...sendMessage('worker-T01', r.RESUME_MESSAGE), error: 'x' }, ['resume-failure'])
  assert.match(ctxOf(fail), /resume message to the worker failed/)
  assert.equal(slotOf('T01').status, 'failed')
  assert.match(slotOf('T01').failure, /resume message to the worker failed/)
  assert.equal(state.read(S).wave.halting.task, 'T01')
})

test('a third turn-limit post fails the slot after two resumes', () => {
  dispatchAll()
  stopHook(subStop('T01', '', { agent_transcript_path: turnsTranscript(60, 'T01') }))
  for (let i = 1; i <= 2; i++) {
    postHook(agentPost(callOf('T01'), limitedResponse))
    assert.equal(slotOf('T01').resumePending, true)
    assert.equal(hook('h4-dispatch.js', sendMessage('worker-T01', r.RESUME_MESSAGE), ['resume-pre']).stdout, '')
    assert.equal(slotOf('T01').resumes, i)
  }
  const res = postHook(agentPost(callOf('T01'), limitedResponse))
  assert.match(ctxOf(res), /reached its turn limit 3 times/)
  assert.equal(slotOf('T01').status, 'failed')
  assert.match(slotOf('T01').failure, /reached its turn limit 3 times/)
})

const stopInput = { session_id: S, stop_hook_active: false }
const editInput = () => ({ session_id: S, tool_name: 'Write', tool_input: { file_path: path.join(repo, 'x.txt') } })

test('H5 stop is silent while a wave slot runs', () => {
  startWaveRun()
  assert.equal(preOf(callOf('T01')).stdout, '')
  assert.equal(hook('h5-guard.js', stopInput, ['stop']).stdout, '')
})

test('H5 stop blocks a wave with nothing in flight and names the three calls', () => {
  startWaveRun()
  const res = hook('h5-guard.js', stopInput, ['stop'])
  assert.equal(res.json.decision, 'block')
  assert.ok(res.json.reason.includes('Call the Agent tool 3 times now'))
  for (const id of ['T01', 'T02', 'T03']) assert.ok(res.json.reason.includes('Task: ' + id))
})

test('H5 stop blocks while a wave resume is due', () => {
  startWaveRun()
  assert.equal(preOf(callOf('T01')).stdout, '')
  const s = state.read(S)
  state.write(S, w.withSlot(s, 'T01', { ...s.wave.slots.T01, resumePending: true, resumeFor: 'turn-limit' }))
  const res = hook('h5-guard.js', stopInput, ['stop'])
  assert.equal(res.json.decision, 'block')
  assert.match(res.json.reason, /stopped at its turn limit/)
})

test('H5 pre denies a main-thread edit in an idle wave and passes once a slot runs', () => {
  startWaveRun()
  const res = hook('h5-guard.js', editInput(), ['pre'])
  assert.equal(res.json.hookSpecificOutput.permissionDecision, 'deny')
  assert.ok(res.json.hookSpecificOutput.permissionDecisionReason.includes('Call the Agent tool'))
  assert.equal(preOf(callOf('T01')).stdout, '')
  assert.equal(hook('h5-guard.js', editInput(), ['pre']).stdout, '')
})

const h1 = input => hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', cwd: repo, transcript_path: path.join(dir, 'main.jsonl'), ...input })
const notification = id => '<task-notification><task-id>' + id + '</task-id> <summary>Agent stopped at its 60-turn limit</summary></task-notification>'

test('H1 typed prompt during a wave names the workers still running', () => {
  dispatchAll()
  const res = h1({ prompt: 'hello' })
  assert.match(res.stdout, /T01, T02, T03 workers are still running/)
  assert.match(res.stdout, /\/tierminator:execute/)
  assert.equal(state.read(S), null)
  assert.equal(state.isActive(S), false)
})

test('H1 typed prompt during a wave names a single running worker', () => {
  startWaveRun()
  assert.equal(preOf(callOf('T01')).stdout, '')
  const res = h1({ prompt: 'hello' })
  assert.match(res.stdout, /T01's worker is still running/)
})

test('H1 resumes a wave worker named by a turn-limit notification', () => {
  dispatchAll()
  postHook(agentPost(callOf('T01'), { isAsync: true, status: 'async_launched', agentId: 'worker-T01' }))
  const res = h1({ prompt: notification('worker-T01') })
  assert.match(res.stdout, /T01 stopped at its turn limit/)
  assert.ok(res.stdout.includes('to \\"worker-T01\\"') || res.stdout.includes('to "worker-T01"'))
  assert.equal(slotOf('T01').resumePending, true)
})

test('H1 ignores a turn-limit notification for an unknown agent', () => {
  dispatchAll()
  assert.equal(h1({ prompt: notification('nobody') }).stdout, '')
})

const g = (tool_name, tool_input, over = {}) => ({
  session_id: S,
  cwd: repo,
  agent_id: 'worker-T01',
  agent_type: 'tierminator:sonnet-medium',
  tool_name,
  tool_input,
  ...over,
})
const h8 = input => hook('h8-worktree-guard.js', input)

test('H8 denies a worker call outside its worktree', () => {
  startWaveRun()
  const cases = [
    g('PowerShell', { command: 'git status' }),
    g('Bash', { command: 'git status' }),
    g('Bash', { command: 'cd "' + repo + '" && git status' }),
    g('Write', { file_path: path.join(repo, 'src/a.js'), content: 'x' }),
    g('Glob', { pattern: '*.js' }),
    g('Glob', { pattern: '*.js', path: repo }),
    g('Grep', { pattern: 'x' }),
    g('Grep', { pattern: 'x', path: repo }),
  ]
  for (const c of cases) {
    const res = h8(c)
    assert.equal(res.json?.hookSpecificOutput?.permissionDecision, 'deny', JSON.stringify(c))
    assert.ok(res.json.hookSpecificOutput.permissionDecisionReason)
  }
})

test('H8 allows a worker call inside its worktree', () => {
  startWaveRun()
  const wt = slotOf('T01').worktree
  assert.equal(h8(g('Bash', { command: 'cd "' + wt + '" && git status' })).stdout, '')
  assert.equal(h8(g('Write', { file_path: wt + '/src/a.js', content: 'x' })).stdout, '')
  assert.equal(h8(g('Grep', { pattern: 'x', path: wt })).stdout, '')
})

test('H8 stays silent outside a working wave or for other callers', () => {
  startWaveRun()
  const bad = { command: 'git status' }
  assert.equal(h8(g('Bash', bad, { agent_id: undefined })).stdout, '')
  assert.equal(h8(g('Bash', bad, { agent_type: 'Explore' })).stdout, '')
  const s = state.read(S)
  state.write(S, { ...s, wave: { ...s.wave, phase: 'integrating' } })
  assert.equal(h8(g('Bash', bad)).stdout, '')
  state.write(S, s)
  state.deactivate(S)
  assert.equal(h8(g('Bash', bad)).stdout, '')
})

test('H8 stays silent without a wave', () => {
  startWaveRun()
  const tasksFile = path.join(dir, 'plan.tasks.json')
  state.write(S, { ...r.startRun({ tasks: TASKS, tasksFile, planFile: path.join(dir, 'plan.md'), branch: 'main', planId: PLAN_ID }), cwd: repo })
  assert.equal(h8(g('Bash', { command: 'git status' })).stdout, '')
})

test('H8 is registered and only ever denies', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'))
  const entry = hooks.hooks.PreToolUse.find(e => e.matcher === 'Bash|PowerShell|Write|Edit|Glob|Grep')
  assert.ok(entry)
  assert.ok(entry.hooks.some(x => x.command.endsWith('h8-worktree-guard.js"')))
})

// Like hook, but runs the script without blocking, so several hooks run at the same time.
function hookAsync(script, stdin, args = []) {
  const env = { ...process.env }
  delete env.CLAUDE_CODE_ENTRYPOINT
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(PLUGIN, 'scripts', script), ...args], { env })
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => (stdout += chunk))
    child.on('close', status => resolve({ status, stdout }))
    child.stdin.end(JSON.stringify(stdin))
  })
}

test('a wave of three runs to the integration stub with its stops arriving together', async () => {
  startWaveRun()
  const ids = ['T01', 'T02', 'T03']
  for (const id of ids) assert.equal(preOf(callOf(id)).stdout, '')
  for (const id of ids) {
    const res = postHook(agentPost(callOf(id), { isAsync: true, status: 'async_launched', agentId: 'worker-' + id }))
    assert.match(ctxOf(res), /running in the background/)
  }
  const shas = {}
  for (const id of ids) shas[id] = workerCommits(id)
  await Promise.all(ids.map(id => hookAsync('h4-dispatch.js', subStop(id, report('DONE', shas[id])), ['stop'])))
  const s = state.read(S)
  for (const id of ids) assert.equal(s.wave.slots[id].status, 'done', id)
  assert.deepEqual(s.done.map(x => x.id).sort(), ['T01', 'T02', 'T03'])
  assert.equal(s.phase, 'halted')
  assert.equal(s.halt.reason, 'integration is not built yet')
  assert.equal(s.wave.phase, 'integrating')
  assert.equal(git.head(repo), s.wave.base)
  assert.ok(git.isClean(repo))
  for (const id of ids) assert.ok(fs.existsSync(s.wave.slots[id].worktree), id)
  const rows = attemptRows()
  assert.deepEqual(rows.map(x => x.task).sort(), ['T01', 'T02', 'T03'])
  const by = id => rows.find(x => x.task === id)
  assert.deepEqual(ids.map(id => by(id).tier), ['sonnet-medium', 'haiku-high', 'opus-high'])
  for (const row of rows) {
    assert.equal(row.attempt, 1)
    assert.equal(row.outcome, 'done')
  }
  assert.equal(s.notice.split('integration is not built yet').length - 1, 1)
})

test('a retry runs in place while the others finish, then the run halts with the failed task', () => {
  dispatchAll()
  const ids = ['T01', 'T02', 'T03']
  for (const id of ids) postHook(agentPost(callOf(id), { isAsync: true, status: 'async_launched', agentId: 'worker-' + id }))
  stopHook(subStop('T01', report('FAILED', 'NONE', 'tests fail')))
  assert.equal(slotOf('T01').status, 'ready')
  assert.equal(preOf(callOf('T01')).stdout, '')
  // The retry is a new worker, with its own agent id.
  postHook(agentPost(callOf('T01'), { isAsync: true, status: 'async_launched', agentId: 'retry-T01' }))
  const sha2 = workerCommits('T02')
  stopHook(subStop('T02', report('DONE', sha2)))
  const sha3 = workerCommits('T03')
  stopHook(subStop('T03', report('DONE', sha3)))
  assert.equal(state.read(S).phase, 'running')
  const sha1 = workerCommits('T01')
  stopHook(subStop('T01', report('DONE', sha1), { agent_id: 'retry-T01' }))
  const s = state.read(S)
  assert.equal(slotOf('T01').attempt, 2)
  assert.equal(slotOf('T01').tier, 'sonnet-high')
  assert.equal(slotOf('T01').status, 'done')
  assert.equal(s.phase, 'halted')
  assert.equal(s.halt.reason, 'integration is not built yet')
  const rows = attemptRows()
  assert.equal(rows.length, 4)
  assert.deepEqual(rows.filter(x => x.task === 'T01').map(x => x.outcome), ['retry', 'done'])
})
