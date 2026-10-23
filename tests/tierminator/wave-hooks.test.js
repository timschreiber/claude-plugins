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
