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
const r = require(path.join(PLUGIN, 'scripts', 'lib', 'run.js'))
const w = require(path.join(PLUGIN, 'scripts', 'lib', 'wave-run.js'))
const git = require(path.join(PLUGIN, 'scripts', 'lib', 'git.js'))

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

const report = (status, commit = 'NONE', note = 'did it') => `STATUS: ${status}\nCOMMIT: ${commit}\nVERIFY: PASS\nNOTE: ${note}`
const h4 = (input, mode) => hook('h4-dispatch.js', input, [mode])
const agentPre = toolInput => ({ session_id: S, cwd: repo, tool_name: 'Agent', tool_input: toolInput })
function commitIn(cwd, id, planId) {
  fs.writeFileSync(path.join(cwd, `${id}.txt`), id)
  gitIn(cwd, 'add', '-A')
  gitIn(cwd, 'commit', '-q', '-m', `Task ${id}`, '-m', `Tierminator-Task: ${id}`, '-m', `Tierminator-Plan: ${planId}`)
  return gitIn(cwd, 'rev-parse', 'HEAD')
}

test('a run halted in the middle of a parallel wave resumes without redoing the integrated tasks', () => {
  const planId = writePlan([
    task(1, { after: [] }),
    task(2, { after: [] }),
    task(3, { model: 'opus', effort: 'high', after: [] }),
    task(4, { after: ['T01', 'T02', 'T03'] }),
  ])
  assert.ok(execute(`"${plan}"`).includes('Wave 1 runs 3 tasks in parallel'))
  const oldRunId = state.read(S).runId
  for (const id of ['T01', 'T02', 'T03']) {
    const call = w.expectedCall(state.read(S), id)
    assert.equal(h4(agentPre(call), 'pre').stdout, '')
    h4({ ...agentPre(call), tool_response: { isAsync: true, status: 'async_launched', agentId: 'worker-' + id } }, 'post')
  }
  const slots = state.read(S).wave.slots
  const sha1 = commitIn(slots.T01.worktree, 'T01', planId)
  const sha2 = commitIn(slots.T02.worktree, 'T02', planId)
  const stop = (id, text) =>
    h4(
      {
        session_id: S,
        agent_id: 'worker-' + id,
        agent_type: 'tierminator:' + slots[id].tier,
        hook_event_name: 'SubagentStop',
        last_assistant_message: text,
      },
      'stop',
    )
  stop('T03', report('FAILED', 'NONE', 'cannot do it'))
  stop('T01', report('DONE', sha1))
  stop('T02', report('DONE', sha2))
  let s = state.read(S)
  assert.equal(s.phase, 'halted')
  assert.equal(s.halt.task, 'T03')
  assert.deepEqual(Object.keys(git.committedTasks(repo, planId)).sort(), ['T01', 'T02'])
  const t03 = s.wave.slots.T03.worktree
  assert.ok(fs.existsSync(t03))

  // Uncommitted work in the kept slot, and things that belong to the user.
  fs.writeFileSync(path.join(t03, 'half.txt'), 'half')
  const mine = path.join(repo, '.claude', 'worktrees', 'mine')
  gitIn(repo, 'worktree', 'add', '-q', '-b', 'mine', mine, 'HEAD')
  gitIn(repo, 'branch', 'tierminator/experiment')

  const out = execute(`"${plan}"`)
  assert.ok(out.includes('tierminator removed what an earlier run left'))
  assert.ok(out.includes(t03))
  assert.ok(out.includes(`tierminator/${oldRunId}/T03`))
  assert.ok(out.includes('half.txt'))
  assert.match(out, /T01 [0-9a-f]{7} \(earlier run\), T02 [0-9a-f]{7} \(earlier run\) are not run again\./)
  assert.equal(fs.existsSync(t03), false)
  assert.deepEqual(git.branchesMatching(repo, 'tierminator/'), ['tierminator/experiment'])
  assert.ok(fs.existsSync(mine))
  s = state.read(S)
  assert.equal(s.wave, undefined)
  assert.equal(s.current.index, 2)
  assert.equal(s.current.tier, 'opus-high')
  assert.deepEqual(s.done.map(d => d.id), ['T01', 'T02'])
  assert.notEqual(s.runId, oldRunId)

  // T03 then T04 run serially.
  assert.equal(h4(agentPre(r.expectedCall(state.read(S))), 'pre').stdout, '')
  const sha3 = commitIn(repo, 'T03', planId)
  h4({ session_id: S, agent_id: 'w3', agent_type: 'tierminator:opus-high', last_assistant_message: report('DONE', sha3) }, 'stop')
  assert.equal(state.read(S).current.index, 3)
  assert.equal(h4(agentPre(r.expectedCall(state.read(S))), 'pre').stdout, '')
  const sha4 = commitIn(repo, 'T04', planId)
  h4({ session_id: S, agent_id: 'w4', agent_type: 'tierminator:sonnet-medium', last_assistant_message: report('DONE', sha4) }, 'stop')
  assert.equal(state.read(S).phase, 'complete')
  assert.deepEqual(gitIn(repo, 'log', '--format=%s').split('\n'), ['Task T04', 'Task T03', 'Task T02', 'Task T01', 'init'])
})
