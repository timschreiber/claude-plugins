'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PLUGIN = path.join(__dirname, '..', '..', 'plugins', 'tierminator')
const lib = f => require(path.join(PLUGIN, 'scripts', 'lib', f))
const git = lib('git.js')
const r = lib('run.js')
const w = lib('wave-run.js')
const integrate = lib('integrate.js')

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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-integ-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

const task = n => ({
  id: `T${String(n).padStart(2, '0')}`,
  title: `Task ${n}`,
  model: 'sonnet',
  effort: 'medium',
  prompt: 'Do it.\nFiles to change: src/a.js\nVerify: node --test passes.',
  after: [],
})
const TASKS = [task(1), task(2), task(3)]
const fwd = p => p.replace(/\\/g, '/')

// A script file in the temp dir; returns its forward-slash path.
function script(name, body) {
  const p = path.join(dir, name)
  fs.writeFileSync(p, body)
  return fwd(p)
}
const nodeCmd = p => `node "${p}"`

// A repository and a started wave over `ids`, each id's slot given a worktree with one commit (the file named
// in files[id], default <id>.txt, with content files[id] text or the id) and marked done. Returns the state.
function setup(ids, { verify = null, files = {}, name = 'repo' } = {}) {
  repo = makeRepo(path.join(dir, name))
  git.excludeWorktrees(repo)
  const base = git.head(repo)
  let s = r.startRun({ tasks: TASKS, tasksFile: 'x', branch: 'main', planId: PLAN_ID, graph: true, verify })
  s = w.startWave(s, ids, base, 5, git.repoRoot(repo))
  for (const id of ids) {
    const slot = s.wave.slots[id]
    const added = git.worktreeAdd(repo, slot.worktree, slot.branch, base)
    assert.equal(added.ok, true, added.failure)
    const [name, text] = files[id] ?? [`${id}.txt`, id]
    fs.writeFileSync(path.join(slot.worktree, name), text)
    gitIn(slot.worktree, 'add', '-A')
    gitIn(slot.worktree, 'commit', '-q', '-m', `Task ${id}`, '-m', `Tierminator-Task: ${id}`, '-m', `Tierminator-Plan: ${PLAN_ID}`)
    s = w.withSlot(s, id, { ...s.wave.slots[id], status: 'done' })
  }
  return s
}
const slotBranches = () => git.branchesMatching(repo, 'tierminator/')

test('a clean wave of three is picked in id order, leaves a linear history and removes its slots', () => {
  const s = setup(['T01', 'T02', 'T03'])
  gitIn(repo, 'branch', 'feature/x')
  const outside = path.join(dir, 'outside')
  gitIn(repo, 'worktree', 'add', '-q', '-b', 'feature/y', outside)

  const res = integrate.integrateWave(s, repo)
  assert.equal(res.problem, null)
  assert.deepEqual(res.picked, ['T01', 'T02', 'T03'])
  assert.deepEqual(res.setAside, [])
  assert.deepEqual(res.cleanFailures, [])
  assert.deepEqual(gitIn(repo, 'log', '--format=%s').split('\n'), ['Task T03', 'Task T02', 'Task T01', 'init'])
  assert.equal(gitIn(repo, 'log', '--merges', '--format=%H'), '')
  assert.deepEqual(Object.keys(git.committedTasks(repo, PLAN_ID)).sort(), ['T01', 'T02', 'T03'])
  assert.ok(git.isClean(repo))
  for (const id of ['T01', 'T02', 'T03']) assert.equal(fs.existsSync(s.wave.slots[id].worktree), false)
  assert.deepEqual(git.branchesMatching(repo, 'tierminator/'), [])
  assert.match(gitIn(repo, 'branch', '--list', 'feature/x'), /feature\/x/)
  assert.ok(fs.existsSync(outside))
  assert.ok(git.worktreeList(repo).some(x => git.samePath(x.path, outside)))
})

test('a conflicting task is aborted and set aside, the others are picked and only they are cleaned', () => {
  const s = setup(['T01', 'T02', 'T03'], { files: { T01: ['shared.txt', 'one\n'], T02: ['shared.txt', 'two\n'] } })

  const res = integrate.integrateWave(s, repo)
  assert.equal(res.problem, null)
  assert.deepEqual(res.picked, ['T01', 'T03'])
  assert.deepEqual(res.setAside, ['T02'])
  assert.ok(res.conflicts.T02.includes('shared.txt'))
  assert.equal(git.pickInProgress(repo), false)
  assert.ok(git.isClean(repo))
  assert.equal(gitIn(repo, 'log', '-1', '--format=%s'), 'Task T03')
  assert.deepEqual(gitIn(repo, 'log', '--format=%s').split('\n'), ['Task T03', 'Task T01', 'init'])
  assert.deepEqual(slotBranches(), [s.wave.slots.T02.branch])
  assert.ok(fs.existsSync(s.wave.slots.T02.worktree))
  assert.equal(fs.existsSync(s.wave.slots.T01.worktree), false)
  assert.equal(fs.existsSync(s.wave.slots.T03.worktree), false)
})

test('a halting wave picks its done tasks, keeps the failed slot and skips verify', () => {
  const marker = fwd(path.join(dir, 'marker.txt'))
  const v = script('verify.js', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`)
  let s = setup(['T01', 'T03'], { verify: nodeCmd(v) })
  // T02 failed in its own slot, with no commit.
  const base = s.wave.base
  const slot2 = { ...r.fresh(TASKS[1], 1), ...w.slotPlacement(s.runId, git.repoRoot(repo), 'T02'), head: base, startedAt: null, pastAgents: [], failure: null }
  assert.equal(git.worktreeAdd(repo, slot2.worktree, slot2.branch, base).ok, true)
  s = { ...s, wave: { ...s.wave, size: ['T01', 'T02', 'T03'], slots: { ...s.wave.slots, T02: { ...slot2, status: 'failed' } }, halting: { task: 'T02', tried: [], reason: 'x' } } }

  const res = integrate.integrateWave(s, repo)
  assert.equal(res.problem, null)
  assert.deepEqual(res.picked, ['T01', 'T03'])
  assert.equal(res.verify, null)
  assert.equal(fs.existsSync(marker), false)
  assert.ok(fs.existsSync(slot2.worktree))
  assert.ok(slotBranches().includes(slot2.branch))
})

test('a main tree that moved or is dirty is a MAIN TREE problem and picks nothing', () => {
  let s = setup(['T01', 'T02'])
  fs.writeFileSync(path.join(repo, 'later.txt'), 'later')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-q', '-m', 'after the wave started')
  let res = integrate.integrateWave(s, repo)
  assert.match(res.problem, /^MAIN TREE:/)
  assert.deepEqual(res.picked, [])

  s = setup(['T01', 'T02'], { name: 'repo2' })
  fs.writeFileSync(path.join(repo, 'untracked.txt'), 'x')
  res = integrate.integrateWave(s, repo)
  assert.match(res.problem, /^MAIN TREE:/)
  assert.deepEqual(res.picked, [])
})

test('verify runs once, in the main tree, after the picks of a wave of two or more', () => {
  const ran = fwd(path.join(dir, 'ran.txt'))
  const v = script('verify.js', `require('fs').writeFileSync(${JSON.stringify(ran)}, process.cwd())`)
  const s = setup(['T01', 'T02', 'T03'], { verify: nodeCmd(v) })

  const res = integrate.integrateWave(s, repo)
  assert.equal(res.problem, null)
  assert.deepEqual(res.picked, ['T01', 'T02', 'T03'])
  assert.equal(res.verify.ok, true)
  assert.equal(res.verify.status, 0)
  assert.ok(git.samePath(fs.readFileSync(ran, 'utf8'), git.toWorktreePath(repo)))
})

test('verify is skipped without a plan verify and for a wave of one', () => {
  const ran = fwd(path.join(dir, 'ran.txt'))
  const v = script('verify.js', `require('fs').writeFileSync(${JSON.stringify(ran)}, 'ran')`)

  let s = setup(['T01', 'T02', 'T03'])
  let res = integrate.integrateWave(s, repo)
  assert.deepEqual(res.picked, ['T01', 'T02', 'T03'])
  assert.equal(res.verify, null)
  assert.equal(fs.existsSync(ran), false)

  s = setup(['T01'], { verify: nodeCmd(v), name: 'repo2' })
  res = integrate.integrateWave(s, repo)
  assert.deepEqual(res.picked, ['T01'])
  assert.equal(res.verify, null)
  assert.equal(fs.existsSync(ran), false)
})

test('a failing verify is reported and keeps every slot and branch, with the picks on main', () => {
  const v = script('verify.js', `process.stderr.write('boom'); process.exit(3)`)
  const s = setup(['T01', 'T02', 'T03'], { verify: nodeCmd(v) })

  const res = integrate.integrateWave(s, repo)
  assert.equal(res.problem, null)
  assert.equal(res.verify.ok, false)
  assert.equal(res.verify.status, 3)
  assert.ok(res.verify.tail.includes('boom'))
  assert.deepEqual(res.picked, ['T01', 'T02', 'T03'])
  assert.deepEqual(res.cleanFailures, [])
  for (const id of ['T01', 'T02', 'T03']) assert.ok(fs.existsSync(s.wave.slots[id].worktree))
  assert.deepEqual(slotBranches(), ['T01', 'T02', 'T03'].map(id => s.wave.slots[id].branch))
  assert.deepEqual(gitIn(repo, 'log', '--format=%s').split('\n'), ['Task T03', 'Task T02', 'Task T01', 'init'])
})

test('runVerify keeps the last 4000 characters and reports a command that did not finish', () => {
  const big = script('big.js', `process.stdout.write('x'.repeat(9980) + '0123456789ENDOFOUTPUT')`)
  const out = integrate.runVerify(dir, nodeCmd(big))
  assert.equal(out.ok, true)
  assert.ok(out.tail.length <= 4000)
  assert.ok(out.tail.endsWith('0123456789ENDOFOUTPUT'))

  const slow = script('slow.js', `setTimeout(() => {}, 5000)`)
  const hung = integrate.runVerify(os.tmpdir(), nodeCmd(slow), { timeoutMs: 200 })
  assert.equal(hung.ok, false)
  assert.equal(hung.status, null)
  assert.ok(hung.tail.includes('did not finish'))
})

test('sweepSlots removes only the named tasks slot worktree and branch', () => {
  const s = setup(['T01', 'T02'])
  const res = integrate.sweepSlots(repo, s.runId, ['T01'])
  assert.deepEqual(res.removed, ['T01'])
  assert.deepEqual(res.failures, [])
  assert.equal(fs.existsSync(s.wave.slots.T01.worktree), false)
  assert.ok(fs.existsSync(s.wave.slots.T02.worktree))
  assert.deepEqual(slotBranches(), [s.wave.slots.T02.branch])
})

// ---- applyIntegration: hand-made results, no Git ----

const APPLY_ROOT = 'C:/repo'
const FLAT = [task(1), task(2), task(3)]
const GRAPH = [
  { ...task(1), after: [] },
  { ...task(2), after: ['T01'] },
  { ...task(3), after: ['T01'] },
  { ...task(4), after: ['T01'] },
  { ...task(5), after: ['T02', 'T03', 'T04'] },
]
const startGraph = tasks =>
  r.startRun({ tasks, tasksFile: 'x.tasks.json', planFile: 'x.md', branch: 'main', planId: 'p', graph: true })
const doneEntry = id => ({ id, tier: 'sonnet-medium', commit: 'abc1234', attempts: 1 })
// The closed state of a wave: every slot done, done entries for them, phase 'integrating'.
function closedState(tasks, doneBefore = []) {
  let s = startGraph(tasks)
  s = { ...s, done: doneBefore.map(doneEntry) }
  const started = w.nextWave(s, 'base000', APPLY_ROOT, 5).state
  let c = started
  for (const id of Object.keys(started.wave.slots)) c = w.withSlot(c, id, { ...c.wave.slots[id], status: 'done' })
  c = { ...c, done: [...c.done, ...Object.keys(started.wave.slots).map(doneEntry)] }
  return { ...c, phase: 'integrating', wave: { ...c.wave, phase: 'integrating' } }
}
const okResult = (over = {}) => ({ problem: null, picked: [], setAside: [], conflicts: {}, verify: null, cleanFailures: [], ...over })
const apply = (state, result) => integrate.applyIntegration(state, result, { head: 'h1', root: APPLY_ROOT, cap: 5 })

test('applyIntegration completes a plan whose only wave is done', () => {
  const closed = closedState(FLAT.map(t => ({ ...t, after: [] })))
  const out = apply({ ...closed, branch: 'main' }, okResult({ picked: ['T01', 'T02', 'T03'] }))
  assert.equal(out.state.phase, 'complete')
  assert.equal(out.state.wave.phase, 'integrated')
  assert.ok(out.tail.includes('Integration: picked T01, T02, T03 onto main'))
  assert.ok(out.tail.includes('all 3 tasks are done'))
})

test('applyIntegration moves on to the serial task after the wave', () => {
  const closed = closedState(GRAPH, ['T01'])
  const out = apply(closed, okResult({ picked: ['T02', 'T03', 'T04'] }))
  assert.equal(out.state.current.index, 4)
  assert.ok(!('wave' in out.state))
  assert.ok(out.tail.includes('Call the Agent tool now'))
})

test('applyIntegration sets a conflicted task aside to run again serially', () => {
  const closed = closedState(GRAPH, ['T01'])
  const out = apply(closed, okResult({ picked: ['T02', 'T04'], setAside: ['T03'], conflicts: { T03: ['a.txt'] } }))
  assert.equal(out.state.current.index, 2)
  assert.ok(!out.state.done.some(d => d.id === 'T03'))
  assert.equal(out.state.current.tier, closed.wave.slots.T03.tier)
  assert.ok(out.tail.includes('T03 conflicted when picked'))
  assert.ok(out.tail.includes('run again serially'))
})

test('applyIntegration halts on a main tree problem', () => {
  const closed = closedState(GRAPH, ['T01'])
  const out = apply(closed, okResult({ problem: 'MAIN TREE: x' }))
  assert.equal(out.state.phase, 'halted')
  assert.equal(out.state.halt.reason, 'MAIN TREE: x')
  assert.equal(out.state.halt.task, null)
  assert.ok(out.tail.includes('MAIN TREE: x'))
  assert.ok(out.tail.includes('Slot worktrees and branches are left in place'))
  assert.ok(out.tail.includes(closed.planFile))
})

test('applyIntegration halts when the plan verify fails', () => {
  const closed = closedState(GRAPH, ['T01'])
  const out = apply(closed, okResult({ picked: ['T02', 'T03', 'T04'], verify: { command: 'npm test', ok: false, status: 1, tail: 'FAIL 3' } }))
  assert.equal(out.state.phase, 'halted')
  assert.ok(out.state.halt.reason.includes('npm test'))
  assert.ok(out.tail.includes('npm test'))
  assert.ok(out.tail.includes('FAIL 3'))
  assert.ok(out.tail.includes(closed.branch))
  assert.ok(out.tail.includes('holds the picks'))
})

test('applyIntegration reports a passing plan verify', () => {
  const closed = closedState(GRAPH, ['T01'])
  const out = apply(closed, okResult({ picked: ['T02', 'T03', 'T04'], verify: { command: 'npm test', ok: true, status: 0, tail: '' } }))
  assert.ok(out.tail.includes('The plan verify passed (npm test)'))
})

test('applyIntegration keeps a halting wave halted', () => {
  const halt = { task: 'T03', tried: [], reason: 'dead' }
  const closed = closedState(GRAPH, ['T01'])
  const halted = { ...closed, phase: 'halted', halt, wave: { ...closed.wave, halting: halt } }
  const plain = apply(halted, okResult({ picked: ['T02'] }))
  assert.equal(plain.state.phase, 'halted')
  assert.equal(plain.state.halt, halt)
  assert.equal(plain.tail, '')
  const conflicted = apply(halted, okResult({ picked: ['T02'], setAside: ['T04'], conflicts: { T04: ['a.txt'] } }))
  assert.equal(conflicted.state.phase, 'halted')
  assert.equal(conflicted.state.halt, halt)
  assert.ok(conflicted.tail.includes('conflicted when picked'))
})
