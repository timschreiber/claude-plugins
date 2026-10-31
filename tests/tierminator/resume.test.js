'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PLUGIN = path.join(__dirname, '..', '..', 'plugins', 'tierminator')
const state = require(path.join(PLUGIN, 'scripts', 'lib', 'state.js'))
const sidecar = require(path.join(PLUGIN, 'scripts', 'lib', 'sidecar.js'))
const { extractBlock } = require(path.join(PLUGIN, 'scripts', 'lib', 'tasks.js'))

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

const S = 'resume-sess'
let dir, repo, plan

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-resume-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(dir, 'data')
  repo = makeRepo(path.join(dir, 'repo'))
  plan = path.join(dir, 'plan.md')
})
afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

const task = (n, over = {}) => ({
  id: 'T0' + n,
  title: `Task ${n}`,
  model: 'sonnet',
  effort: 'medium',
  prompt: 'Do it.\nFiles to change: src/a.js\nVerify: node --test passes.',
  ...over,
})
function writePlan(tasks, file = plan) {
  const text = '# Plan\n\n## Tasks\n\n```json tiered-tasks\n' + JSON.stringify({ tasks }, null, 2) + '\n```\n'
  fs.writeFileSync(file, text)
  return sidecar.hashOf(extractBlock(text).blocks[0])
}
function commitTask(id, planId) {
  fs.writeFileSync(path.join(repo, `${id}.txt`), id)
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-q', '-m', `Task ${id}`, '-m', `Tierminator-Task: ${id}`, '-m', `Tierminator-Plan: ${planId}`)
}
const execute = (args, env = {}) =>
  hook(
    'h1-plan-rules.js',
    { session_id: S, cwd: repo, permission_mode: 'auto', prompt: `/tierminator:execute ${args}` },
    [],
    { CLAUDE_CONFIG_DIR: path.join(dir, 'config'), ...env },
  ).stdout
const GRAPH = () => [task(1, { after: [] }), task(2, { after: ['T01'] }), task(3, { after: ['T01'] }), task(4, { after: ['T02', 'T03'] })]

test('a graph plan half done resumes at its next parallel wave', () => {
  const planId = writePlan(GRAPH())
  commitTask('T01', planId)
  const out = execute(`"${plan}"`)
  assert.match(out, /T01 [0-9a-f]{7} \(earlier run\) is not run again\./)
  assert.ok(out.includes('Wave 2 runs 2 tasks in parallel (T02, T03)'))
  assert.ok(!out.includes('tierminator removed what an earlier run left'))
  const s = state.read(S)
  assert.equal(s.current, null)
  assert.deepEqual(s.wave.size, ['T02', 'T03'])
  assert.equal(s.wave.n, 2)
  assert.deepEqual(s.done.map(d => [d.id, d.skipped]), [['T01', 'committed']])
})

test('a done dependency counts as satisfied wherever it is in the plan', () => {
  const planId = writePlan([task(1, { after: [] }), task(2, { after: [] }), task(3, { after: ['T01'] }), task(4, { after: ['T02'] })])
  commitTask('T02', planId)
  const out = execute(`"${plan}"`)
  assert.doesNotMatch(out, /was not started/)
  const s = state.read(S)
  assert.deepEqual(s.wave.size, ['T01', 'T04'])
  assert.deepEqual(s.done.map(d => [d.id, d.skipped]), [['T02', 'committed']])
})

test('a graph plan already committed runs nothing', () => {
  const planId = writePlan(GRAPH())
  for (const id of ['T01', 'T02', 'T03', 'T04']) commitTask(id, planId)
  const out = execute(`"${plan}"`)
  assert.match(out, /every task in .* is already committed on this branch/)
  assert.equal(state.read(S), null)
})

test('--from is refused for a graph plan and works for a serial plan', () => {
  writePlan(GRAPH())
  const out = execute(`"${plan}" --from T02`)
  assert.match(out, /was not started: --from cannot be used with a graph plan.*graph plans resume from what is committed on this branch/)
  assert.equal(state.read(S), null)
  assert.equal(state.isActive(S), false)
  const serial = path.join(dir, 'serial.md')
  writePlan([task(1), task(2), task(3)], serial)
  const out2 = execute(`"${serial}" --from T02`)
  assert.match(out2, /T01 \(skipped by --from\) is not run again\./)
  assert.equal(state.read(S).current.index, 1)
})

test('a headless --from on a graph plan writes a declined result', () => {
  writePlan(GRAPH())
  const outFile = path.join(dir, 'out', 'r.json')
  execute(`"${plan}" --from T02`, { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli', TIERMINATOR_RESULT_FILE: outFile })
  const r = JSON.parse(fs.readFileSync(outFile, 'utf8'))
  assert.equal(r.outcome, 'declined')
  assert.match(r.reason, /graph plans resume from what is committed/)
  assert.equal(r.planFile, plan)
  assert.deepEqual(r.tasksDone, [])
})
