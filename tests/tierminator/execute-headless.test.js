'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PLUGIN = path.join(__dirname, '..', '..', 'plugins', 'tierminator')
const state = require(path.join(PLUGIN, 'scripts', 'lib', 'state.js'))
const runLib = require(path.join(PLUGIN, 'scripts', 'lib', 'run.js'))
const result = require(path.join(PLUGIN, 'scripts', 'lib', 'result.js'))

// Git in a test repository; fails the test on an error.
const gitIn = (cwd, ...args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
// A repository with one commit and a "main" branch.
function makeRepo(where) {
  fs.mkdirSync(where, { recursive: true })
  gitIn(where, 'init', '-q', '-b', 'main')
  gitIn(where, 'config', 'user.name', 'Test')
  gitIn(where, 'config', 'user.email', 'test@example.com')
  gitIn(where, 'config', 'commit.gpgsign', 'false')
  gitIn(where, 'config', 'core.autocrlf', 'false')
  fs.writeFileSync(path.join(where, 'README.md'), '# test\n')
  gitIn(where, 'add', '-A')
  gitIn(where, 'commit', '-q', '-m', 'init')
  return where
}

// Runs a hook script with `stdin` and returns {status, stdout, json}. CLAUDE_CODE_ENTRYPOINT is left out
// unless `env` sets it, so the hooks see an interactive session whatever shell runs the tests.
function hook(script, stdin, args = [], env = {}) {
  const base = { ...process.env }
  delete base.CLAUDE_CODE_ENTRYPOINT
  delete base.TIERMINATOR_RESULT_FILE
  const r = spawnSync(process.execPath, [path.join(PLUGIN, 'scripts', script), ...args], {
    input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
    env: { ...base, ...env },
    encoding: 'utf8',
  })
  let json = null
  try {
    json = JSON.parse(r.stdout)
  } catch {}
  return { status: r.status, stdout: r.stdout, json }
}

const S = 'sess-headless'
let dir, repo, plan

const toolPre = (name, extra = {}) => ({ session_id: S, tool_name: name, tool_input: {}, ...extra })
const agentPre = (toolInput, extra = {}) => ({ session_id: S, cwd: repo, tool_name: 'Agent', tool_input: toolInput, ...extra })
const expected = (over = {}) => ({ ...runLib.expectedCall(state.read(S)), ...over })
const subStop = (text, over = {}) => ({
  session_id: S,
  agent_id: 'worker-1',
  agent_type: `tierminator:${state.read(S).current.tier}`,
  hook_event_name: 'SubagentStop',
  last_assistant_message: text,
  ...over,
})
const agentPost = (toolInput, extra = {}) => ({
  session_id: S, cwd: repo, tool_name: 'Agent', tool_input: toolInput, tool_response: { status: 'completed' }, ...extra,
})
// What a worker does for task `id`: a file and one commit with the trailer.
function workerCommits(id, file = `${id}.txt`, planId) {
  fs.writeFileSync(path.join(repo, file), id)
  gitIn(repo, 'add', '-A')
  const plan = planId ? ['-m', `Tierminator-Plan: ${planId}`] : []
  gitIn(repo, 'commit', '-q', '-m', `Task ${id}`, '-m', `Tierminator-Task: ${id}`, ...plan)
  return gitIn(repo, 'rev-parse', 'HEAD')
}
const report = (status, commit = 'NONE', note = 'did it') => `STATUS: ${status}\nCOMMIT: ${commit}\nVERIFY: PASS\nNOTE: ${note}`

// One attempt of the current task, through the hooks: dispatch, the worker's work, its report, and
// the PostToolUse that judges it. Returns the PostToolUse context.
function attempt(work) {
  const call = expected()
  assert.equal(hook('h4-dispatch.js', agentPre(call), ['pre']).stdout, '', 'the expected dispatch passes')
  const text = work()
  hook('h4-dispatch.js', subStop(text), ['stop'])
  return hook('h4-dispatch.js', agentPost(call), ['post']).json?.hookSpecificOutput?.additionalContext ?? ''
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-headless-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(dir, 'data')
  repo = makeRepo(path.join(dir, 'repo'))
  plan = path.join(dir, 'plan.md')
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'headless-plan.md'), plan)
})
afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA
  fs.rmSync(dir, { recursive: true, force: true })
})

const RESULT = () => path.join(dir, 'plan.result.json')
const readResult = (file = RESULT()) => JSON.parse(fs.readFileSync(file, 'utf8'))

const execute = (args, { mode = 'default', cwd = repo, env = {} } = {}) =>
  hook(
    'h1-plan-rules.js',
    { session_id: S, cwd, permission_mode: mode, prompt: `/tierminator:execute ${args}`.trimEnd() },
    [],
    { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli', CLAUDE_CONFIG_DIR: path.join(dir, 'config'), ...env },
  ).stdout
const runTask = id => attempt(() => report('DONE', workerCommits(id, `${id}.txt`, state.read(S).planId)))
const stop = () => hook('h5-guard.js', { session_id: S, cwd: repo }, ['stop'])

test('a headless execute runs every task and writes a complete result at the end', () => {
  assert.match(execute(`"${plan}"`), /^tierminator: running the plan in .*plan\.md \(3 tiered tasks\)\./)
  assert.equal(state.read(S).phase, 'running')
  assert.equal(fs.existsSync(RESULT()), false)
  for (const id of ['T01', 'T02', 'T03']) runTask(id)
  stop()
  const r = readResult()
  assert.equal(r.outcome, 'complete')
  assert.equal(r.sessionId, S)
  assert.equal(r.planFile, plan)
  assert.equal(r.tasksFile, path.join(dir, 'plan.tasks.json'))
  assert.deepEqual(r.tasksDone, ['T01', 'T02', 'T03'])
  assert.deepEqual(r.tasksNotRun, [])
  assert.equal(r.reason, null)
  assert.equal(r.headCommit, gitIn(repo, 'rev-parse', 'HEAD'))
  assert.equal(gitIn(repo, 'log', '--format=%s').split('\n').length, 4)
})

test('--from skips the earlier tasks', () => {
  assert.match(execute(`"${plan}" --from T02`), /T01 \(skipped by --from\) is not run again\./)
  assert.equal(state.read(S).current.index, 1)
  for (const id of ['T02', 'T03']) runTask(id)
  stop()
  const r = readResult()
  assert.equal(r.outcome, 'complete')
  assert.deepEqual(r.tasksDone, ['T01', 'T02', 'T03'])
  assert.deepEqual(r.tasksNotRun, [])
  assert.equal(fs.existsSync(path.join(repo, 'T01.txt')), false)
  assert.equal(gitIn(repo, 'log', '--format=%s').split('\n').length, 3)
})

const sidecar = require(path.join(PLUGIN, 'scripts', 'lib', 'sidecar.js'))
const { extractBlock } = require(path.join(PLUGIN, 'scripts', 'lib', 'tasks.js'))

const OUT = () => path.join(dir, 'out', 'r.json')
const SESSION_RESULT = () => path.join(dir, 'data', 'sessions', `${S}.result.json`)

// A repository whose Git has no commit identity, with the env that hides the global one.
function repoWithoutIdentity() {
  const anon = path.join(dir, 'anon')
  fs.mkdirSync(anon)
  gitIn(anon, 'init', '-q', '-b', 'main')
  gitIn(anon, 'config', 'user.useConfigOnly', 'true')
  gitIn(anon, 'config', 'commit.gpgsign', 'false')
  fs.writeFileSync(path.join(anon, 'README.md'), '# test\n')
  gitIn(anon, 'add', '-A')
  gitIn(anon, '-c', 'user.name=Setup', '-c', 'user.email=setup@example.com', 'commit', '-q', '-m', 'init')
  const emptyConfig = path.join(dir, 'empty.gitconfig')
  fs.writeFileSync(emptyConfig, '')
  const env = { GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_NOSYSTEM: '1' }
  for (const key of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'EMAIL']) env[key] = ''
  return { repo: anon, env }
}

function assertDeclined(file, reason, planFile) {
  const r = readResult(file)
  assert.equal(r.outcome, 'declined')
  assert.equal(r.sessionId, S)
  assert.equal(r.tasksFile, null)
  assert.deepEqual(r.tasksDone, [])
  assert.match(r.reason, reason)
  assert.equal(r.planFile, planFile)
  assert.equal(state.isActive(S), false)
  assert.equal(state.read(S), null)
}

test('a headless execute that cannot start writes a declined result', () => {
  const env = { TIERMINATOR_RESULT_FILE: OUT() }
  const cases = [
    [() => execute(`"${path.join(dir, 'nope.md')}"`, { env }), /the plan file .*nope\.md cannot be read/, null],
    [() => execute(`"${plan}" --from T09`, { env }), /the plan has no task T09; its tasks are T01 to T03/, plan],
    [() => {
      fs.writeFileSync(path.join(repo, 'scratch.txt'), 'x')
      try {
        return execute(`"${plan}"`, { env })
      } finally {
        fs.rmSync(path.join(repo, 'scratch.txt'), { force: true })
      }
    }, /the working tree has uncommitted changes \(scratch\.txt\)/, plan],
    [() => execute(`"${plan}"`, { mode: 'plan', env }), /cannot be executed in plan mode/, null],
    [() => {
      const anon = repoWithoutIdentity()
      return execute(`"${plan}"`, { cwd: anon.repo, env: { ...anon.env, ...env } })
    }, /Git has no user name and email for this repository/, plan],
    [() => execute('1', { env }), /there is no plan list in this session yet to pick number 1 from/, null],
  ]
  for (const [run, reason, planFile] of cases) {
    fs.rmSync(OUT(), { force: true })
    run()
    assertDeclined(OUT(), reason, planFile)
  }
})

test('without TIERMINATOR_RESULT_FILE a declined result goes beside the plan, or beside the session state', () => {
  fs.writeFileSync(path.join(repo, 'scratch.txt'), 'x')
  execute(`"${plan}"`)
  assert.equal(readResult().outcome, 'declined')
  fs.rmSync(path.join(repo, 'scratch.txt'))
  execute(`"${path.join(dir, 'nope.md')}"`)
  const r = readResult(SESSION_RESULT())
  assert.equal(r.outcome, 'declined')
  assert.equal(r.planFile, null)
})

test('a headless execute of a plan already committed writes a complete result', () => {
  const planId = sidecar.hashOf(extractBlock(fs.readFileSync(plan, 'utf8')).blocks[0])
  for (const id of ['T01', 'T02', 'T03']) workerCommits(id, `${id}.txt`, planId)
  assert.match(execute(`"${plan}"`), /every task in .* is already committed on this branch/)
  const r = readResult()
  assert.equal(r.outcome, 'complete')
  assert.equal(r.reason, null)
  assert.equal(r.planFile, plan)
  assert.equal(r.tasksFile, null)
  assert.deepEqual(r.tasksDone, ['T01', 'T02', 'T03'])
  assert.deepEqual(r.tasksNotRun, [])
  assert.equal(state.isActive(S), false)
})

test('an interactive execute that cannot start writes no result', () => {
  const env = { CLAUDE_CODE_ENTRYPOINT: 'cli' }
  execute(`"${path.join(dir, 'nope.md')}"`, { env })
  fs.writeFileSync(path.join(repo, 'scratch.txt'), 'x')
  execute(`"${plan}"`, { env })
  assert.equal(fs.existsSync(RESULT()), false)
  assert.equal(fs.existsSync(SESSION_RESULT()), false)
})
