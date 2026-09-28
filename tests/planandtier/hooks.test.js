'use strict'

const { test, before, after, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PLUGIN = path.join(__dirname, '..', '..', 'plugins', 'planandtier')
const state = require(path.join(PLUGIN, 'scripts', 'lib', 'state.js'))
const sidecar = require(path.join(PLUGIN, 'scripts', 'lib', 'sidecar.js'))
const { extractBlock, parsePlan } = require(path.join(PLUGIN, 'scripts', 'lib', 'tasks.js'))
const runLib = require(path.join(PLUGIN, 'scripts', 'lib', 'run.js'))
const RULES = fs.readFileSync(path.join(PLUGIN, 'rules', 'tiering.md'), 'utf8')
const OPT_OUT = 'Tiered execution: off'

// Git in a test repository; fails the test on an error.
const gitIn = (cwd, ...args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
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

// A clean repository shared by tests that only need one to exist; tests that change a repository
// make their own.
let REPO
before(() => {
  REPO = makeRepo(fs.mkdtempSync(path.join(os.tmpdir(), 'planandtier-repo-')))
})
after(() => {
  fs.rmSync(REPO, { recursive: true, force: true })
})

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planandtier-hooks-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(dir, 'data')
})
afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA
  fs.rmSync(dir, { recursive: true, force: true })
})

// Runs a hook script with `stdin` and returns {status, stdout, json}.
function hook(script, stdin, args = [], env = {}) {
  const r = spawnSync(process.execPath, [path.join(PLUGIN, 'scripts', script), ...args], {
    input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })
  let json = null
  try {
    json = JSON.parse(r.stdout)
  } catch {}
  return { status: r.status, stdout: r.stdout, json }
}

const task = (n, over = {}) => ({
  id: `T${String(n).padStart(2, '0')}`,
  title: `Task ${n}`,
  model: 'sonnet',
  effort: 'medium',
  prompt: 'Read docs/spec.md. Do the work. Verify: node --test passes.',
  ...over,
})
const planText = (tasks, extra = '') =>
  `# Plan\n\nProse.\n\n## Tasks\n\n\`\`\`json tiered-tasks\n${JSON.stringify({ tasks }, null, 2)}\n\`\`\`\n${extra}`
const VALID = planText([task(1), task(2, { model: 'opus', effort: 'high' }), task(3)])
const INVALID = planText([task(1, { model: 'fable' })])
const NO_BLOCK = '# Plan\n\nJust prose, no task block.\n'

const writePlanFile = text => {
  const file = path.join(dir, 'plan.md')
  fs.writeFileSync(file, text)
  return file
}
const S = 'sess-1'
const exitPre = (plan, file, cwd = REPO) => ({
  session_id: S,
  cwd,
  tool_name: 'ExitPlanMode',
  tool_input: { plan, planFilePath: file },
})
const exitPost = (plan, extra = {}) => ({
  session_id: S,
  cwd: REPO,
  tool_name: 'ExitPlanMode',
  tool_input: { plan: 'stale' },
  tool_response: { plan, isAgent: false, filePath: path.join(dir, 'plan.md') },
  ...extra,
})
const approvedState = (over = {}) => ({ phase: 'approved', tasks: [task(1), task(2)], denials: 0, guardDenials: 0, ...over })

// ---- H1 ----------------------------------------------------------------------------

test('H1 prints the rules on a plan-mode prompt and nothing otherwise', () => {
  const plan = hook('h1-plan-rules.js', { session_id: S, permission_mode: 'plan', prompt: 'x' })
  assert.equal(plan.status, 0)
  assert.equal(plan.stdout, RULES)
  for (const mode of ['default', 'auto', 'acceptEdits', undefined]) {
    assert.equal(hook('h1-plan-rules.js', { session_id: S, permission_mode: mode }).stdout, '')
  }
})

test('H1 enter mode returns the rules as PostToolUse additionalContext', () => {
  const r = hook('h1-plan-rules.js', { session_id: S, tool_name: 'EnterPlanMode' }, ['enter'])
  assert.deepEqual(r.json, { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: RULES } })
})

test('H1 stays silent for subagents', () => {
  assert.equal(hook('h1-plan-rules.js', { permission_mode: 'plan', agent_id: 'a1' }).stdout, '')
})

// ---- H2 ----------------------------------------------------------------------------

test('H2 is silent for a valid plan and writes no state', () => {
  const file = writePlanFile(VALID)
  const r = hook('h2-gate-exit-plan.js', exitPre(VALID, file))
  assert.equal(r.stdout, '')
  assert.equal(state.read(S), null)
})

test('H2 reads the plan file over a stale tool_input.plan, in both directions', () => {
  const fileValid = writePlanFile(VALID)
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(INVALID, fileValid)).stdout, '')
  const fileInvalid = writePlanFile(INVALID)
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(VALID, fileInvalid)).json.hookSpecificOutput.permissionDecision, 'deny')
})

test('H2 falls back to tool_input.plan when the plan file is missing or empty', () => {
  const missing = path.join(dir, 'nope.md')
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(VALID, missing)).stdout, '')
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(INVALID, missing)).json.hookSpecificOutput.permissionDecision, 'deny')
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(VALID, writePlanFile(''))).stdout, '')
})

test('H2 denies with the errors and a way out, in the shape the spike proved', () => {
  const r = hook('h2-gate-exit-plan.js', exitPre(INVALID, writePlanFile(INVALID)))
  const out = r.json.hookSpecificOutput
  assert.deepEqual(Object.keys(out).sort(), ['hookEventName', 'permissionDecision', 'permissionDecisionReason'])
  assert.equal(out.hookEventName, 'PreToolUse')
  assert.equal(out.permissionDecision, 'deny')
  assert.match(out.permissionDecisionReason, /T01\.model: "fable" is not allowed; use haiku, sonnet or opus/)
  assert.match(out.permissionDecisionReason, /call ExitPlanMode again/)
  assert.ok(out.permissionDecisionReason.includes(OPT_OUT))
  assert.ok(!out.permissionDecisionReason.includes('# planandtier: tiered plans'), 'rules only when the block is missing')
})

test('H2 appends the full rules when the block is missing', () => {
  const r = hook('h2-gate-exit-plan.js', exitPre(NO_BLOCK, writePlanFile(NO_BLOCK)))
  assert.ok(r.json.hookSpecificOutput.permissionDecisionReason.includes(RULES))
})

test('H2 is silent for the opt-out line', () => {
  const text = `# Plan\n\n${OPT_OUT}\n`
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(text, writePlanFile(text))).stdout, '')
})

test('H2 lets the plan through after three denials in a row', () => {
  const file = writePlanFile(NO_BLOCK)
  for (let i = 1; i <= 3; i++) {
    assert.equal(hook('h2-gate-exit-plan.js', exitPre(NO_BLOCK, file)).json.hookSpecificOutput.permissionDecision, 'deny')
    assert.equal(state.read(S).denials, i)
  }
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(NO_BLOCK, file)).stdout, '')
  assert.equal(state.read(S).denials, 3)
})

test('H2 denying keeps an existing approved state intact', () => {
  state.write(S, approvedState())
  hook('h2-gate-exit-plan.js', exitPre(NO_BLOCK, writePlanFile(NO_BLOCK)))
  const s = state.read(S)
  assert.equal(s.phase, 'approved')
  assert.equal(s.tasks.length, 2)
  assert.equal(s.denials, 1)
})

test('H2 ignores subagents', () => {
  const input = { ...exitPre(NO_BLOCK, writePlanFile(NO_BLOCK)), agent_id: 'a1' }
  assert.equal(hook('h2-gate-exit-plan.js', input).stdout, '')
})

// ---- H2: the tasks file --------------------------------------------------------------

const TASKS_FILE = () => path.join(dir, 'plan.tasks.json')
const blockBody = text => extractBlock(text).blocks[0]

test('H2 moves a valid block to the tasks file and leaves the table in the plan', () => {
  const file = writePlanFile(VALID)
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(VALID, file)).stdout, '')
  assert.equal(fs.readFileSync(TASKS_FILE(), 'utf8'), blockBody(VALID))
  const plan = fs.readFileSync(file, 'utf8')
  assert.ok(plan.startsWith('# Plan\n\nProse.\n\n## Tasks\n\n<!-- planandtier:tasks -->\n'))
  assert.ok(!plan.includes('tiered-tasks'))
  assert.ok(plan.includes('| T02 | Task 2 | opus | high |'))
  assert.equal(parsePlan(plan).section.hash, sidecar.hashOf(blockBody(VALID)))
})

test('H2 does not move a block it did not read from the plan file', () => {
  const missing = path.join(dir, 'nope.md')
  hook('h2-gate-exit-plan.js', exitPre(VALID, missing))
  assert.equal(fs.existsSync(missing), false)
  const empty = writePlanFile('')
  hook('h2-gate-exit-plan.js', exitPre(VALID, empty))
  assert.equal(fs.readFileSync(empty, 'utf8'), '')
  assert.deepEqual(fs.readdirSync(dir).filter(f => f.endsWith('.tasks.json')), [])
})

test('H2 leaves an invalid or opted-out plan untouched', () => {
  for (const text of [INVALID, NO_BLOCK, `# Plan\n\n${OPT_OUT}\n`]) {
    const file = writePlanFile(text)
    hook('h2-gate-exit-plan.js', exitPre(text, file))
    assert.equal(fs.readFileSync(file, 'utf8'), text)
    assert.equal(fs.existsSync(TASKS_FILE()), false)
  }
})

test('H2 passes a resubmitted plan with its table silently and leaves it as it is', () => {
  const file = writePlanFile(VALID)
  hook('h2-gate-exit-plan.js', exitPre(VALID, file))
  const moved = fs.readFileSync(file, 'utf8')
  assert.equal(hook('h2-gate-exit-plan.js', exitPre('stale', file)).stdout, '')
  assert.equal(fs.readFileSync(file, 'utf8'), moved)
  assert.equal(state.read(S), null)
})

test('H2 denies a table whose tasks file changed or is missing, and says to write the block again', () => {
  const file = writePlanFile(VALID)
  hook('h2-gate-exit-plan.js', exitPre(VALID, file))
  fs.appendFileSync(TASKS_FILE(), ' ')
  const changed = hook('h2-gate-exit-plan.js', exitPre('stale', file)).json.hookSpecificOutput
  assert.equal(changed.permissionDecision, 'deny')
  assert.match(changed.permissionDecisionReason, /has changed since its table was written/)
  assert.match(changed.permissionDecisionReason, /Write the complete "json tiered-tasks" block into the plan file/)
  assert.equal(state.read(S).denials, 1)
  fs.rmSync(TASKS_FILE())
  const missing = hook('h2-gate-exit-plan.js', exitPre('stale', file)).json.hookSpecificOutput
  assert.match(missing.permissionDecisionReason, /is missing or unreadable/)
})

test('H2 denies a table edited by hand, and says to write the block again', () => {
  const file = writePlanFile(VALID)
  hook('h2-gate-exit-plan.js', exitPre(VALID, file))
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('| T02 | Task 2 |', '| T02 | Renamed |'))
  const out = hook('h2-gate-exit-plan.js', exitPre('stale', file)).json.hookSpecificOutput
  assert.equal(out.permissionDecision, 'deny')
  assert.match(out.permissionDecisionReason, /does not match its tasks file/)
  assert.match(out.permissionDecisionReason, /Write the complete "json tiered-tasks" block into the plan file/)
})

test('H3 runs nothing when the approved table was edited by hand', () => {
  const file = writePlanFile(VALID)
  hook('h2-gate-exit-plan.js', exitPre(VALID, file))
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('| T02 | Task 2 |', '| T02 | Renamed |'))
  const out = hook('h3-post-approval.js', exitPost(VALID)).json.hookSpecificOutput.additionalContext
  assert.match(out, /tasks could not be loaded, so nothing will run/)
  assert.match(out, /the table was edited/)
  assert.equal(state.read(S), null)
})

test('H2 replaces an old table when the model writes a new block', () => {
  const file = writePlanFile(VALID)
  hook('h2-gate-exit-plan.js', exitPre(VALID, file))
  const newBlock = '```json tiered-tasks\n' + JSON.stringify({ tasks: [task(1, { title: 'Redone' })] }) + '\n```\n'
  const edited = fs.readFileSync(file, 'utf8') + '\n' + newBlock
  fs.writeFileSync(file, edited)
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(edited, file)).stdout, '')
  const plan = fs.readFileSync(file, 'utf8')
  assert.equal(extractBlock(plan).sections.length, 1)
  assert.ok(plan.includes('| T01 | Redone |'))
  assert.ok(!plan.includes('| T02 |'))
  assert.equal(sidecar.resolvePlan(plan).tasks[0].title, 'Redone')
})

// ---- H3 ----------------------------------------------------------------------------

test('H3 starts the run and gives the exact first dispatch', () => {
  const file = writePlanFile(VALID)
  hook('h2-gate-exit-plan.js', exitPre(VALID, file))
  const r = hook('h3-post-approval.js', exitPost(VALID))
  const s = state.read(S)
  assert.equal(s.phase, 'running')
  assert.deepEqual(s.tasks.map(t => t.id), ['T01', 'T02', 'T03'])
  assert.equal(s.tasksFile, TASKS_FILE())
  assert.equal(s.branch, 'main')
  assert.equal(s.cwd, REPO)
  assert.deepEqual([s.current.index, s.current.attempt, s.current.tier, s.current.inFlight], [0, 1, 'sonnet-medium', false])
  assert.equal(s.planFile, path.join(dir, 'plan.md'))
  assert.ok(!Number.isNaN(Date.parse(s.approvedAt)))
  const out = r.json.hookSpecificOutput
  assert.equal(out.hookEventName, 'PostToolUse')
  assert.match(out.additionalContext, /3 tiered tasks \(T01 to T03\)/)
  assert.match(out.additionalContext, /subagent_type "planandtier:sonnet-medium", description "T01: Task 1", run_in_background false/)
  assert.ok(out.additionalContext.includes(`exactly this prompt (2 lines, nothing added):\nTasks file: ${TASKS_FILE()}\nTask: T01\n`))
  assert.match(out.additionalContext, /Do not implement the plan yourself/)
})

test('H3 writes a tasks file beside the state when the plan still holds its block', () => {
  hook('h3-post-approval.js', exitPost(VALID))
  const s = state.read(S)
  assert.equal(s.tasksFile, state.fileFor(S).replace(/\.json$/, '.tasks.json'))
  assert.deepEqual(JSON.parse(fs.readFileSync(s.tasksFile, 'utf8')).tasks, parsePlan(VALID).tasks)
  assert.equal(s.tasksHash, null)
})

test('H3 pauses the run when the tree is no longer clean, and gives no dispatch', () => {
  const repo = makeRepo(path.join(dir, 'repo'))
  fs.writeFileSync(path.join(repo, 'dirty.txt'), 'x')
  const out = hook('h3-post-approval.js', { ...exitPost(VALID), cwd: repo }).json.hookSpecificOutput.additionalContext
  assert.match(out, /cannot start, because the working tree has uncommitted changes \(dirty\.txt\)/)
  assert.ok(!out.includes('Call the Agent tool'))
  const s = state.read(S)
  assert.equal(s.phase, 'paused')
  assert.match(s.pausedBecause, /uncommitted changes/)
})

test('H2 denies a tiered plan outside a Git repository or with a dirty tree, without counting it', () => {
  const plain = path.join(dir, 'plain')
  fs.mkdirSync(plain)
  const file = writePlanFile(VALID)
  const out = hook('h2-gate-exit-plan.js', exitPre(VALID, file, plain)).json.hookSpecificOutput
  assert.equal(out.permissionDecision, 'deny')
  assert.match(out.permissionDecisionReason, /cannot run yet, because it is not inside a Git repository/)
  assert.match(out.permissionDecisionReason, /Do not call ExitPlanMode again until that is fixed/)
  assert.equal(fs.readFileSync(file, 'utf8'), VALID, 'the block is not moved')

  const repo = makeRepo(path.join(dir, 'repo'))
  fs.writeFileSync(path.join(repo, 'README.md'), 'changed\n')
  for (let i = 0; i < 5; i++) {
    const again = hook('h2-gate-exit-plan.js', exitPre(VALID, file, repo)).json.hookSpecificOutput
    assert.match(again.permissionDecisionReason, /uncommitted changes \(README\.md\)/, 'never passed through')
  }
  assert.equal(state.read(S), null, 'not counted as a denial')
})

test('H2 lets an opted-out plan through a dirty tree', () => {
  const plain = path.join(dir, 'plain')
  fs.mkdirSync(plain)
  const text = `# Plan\n\n${OPT_OUT}\n`
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(text, writePlanFile(text), plain)).stdout, '')
})

test('H3 reads the plan file over tool_response.plan', () => {
  writePlanFile(VALID)
  hook('h3-post-approval.js', exitPost(INVALID))
  assert.equal(state.read(S).tasks.length, 3)
})

test('H3 loads the tasks from the tasks file H2 wrote and records it', () => {
  const file = writePlanFile(VALID)
  hook('h2-gate-exit-plan.js', exitPre(VALID, file))
  const r = hook('h3-post-approval.js', exitPost(VALID))
  const s = state.read(S)
  assert.deepEqual(s.tasks, parsePlan(VALID).tasks)
  assert.equal(s.tasksFile, TASKS_FILE())
  assert.equal(s.tasksHash, sidecar.hashOf(blockBody(VALID)))
  assert.match(r.json.hookSpecificOutput.additionalContext, /3 tiered tasks/)
})

test('H3 runs nothing when the tasks file changed after the table was shown', () => {
  const file = writePlanFile(VALID)
  hook('h2-gate-exit-plan.js', exitPre(VALID, file))
  fs.appendFileSync(TASKS_FILE(), ' ')
  state.write(S, approvedState())
  const out = hook('h3-post-approval.js', exitPost(VALID)).json.hookSpecificOutput.additionalContext
  assert.match(out, /tasks could not be loaded, so nothing will run/)
  assert.match(out, /has changed since its table was written/)
  assert.match(out, /Do not implement the plan yourself/)
  assert.ok(!out.includes('Your next action'))
  assert.equal(state.read(S), null)
})

test('H3 uses tool_response.plan over a stale tool_input.plan', () => {
  hook('h3-post-approval.js', { ...exitPost(VALID), tool_input: { plan: INVALID } })
  assert.equal(state.read(S).tasks.length, 3)
})

test('H3 falls back to the plan file when tool_response has no plan text', () => {
  writePlanFile(VALID)
  const input = exitPost(undefined)
  hook('h3-post-approval.js', input)
  assert.equal(state.read(S).tasks.length, 3)
})

test('H3 skips agent plans and subagent calls', () => {
  const agentPlan = exitPost(VALID)
  agentPlan.tool_response.isAgent = true
  assert.equal(hook('h3-post-approval.js', agentPlan).stdout, '')
  assert.equal(hook('h3-post-approval.js', exitPost(VALID, { agent_id: 'a1' })).stdout, '')
  assert.equal(state.read(S), null)
})

test('H3 on the opt-out line says nothing and clears an earlier tiered plan', () => {
  state.write(S, approvedState())
  const r = hook('h3-post-approval.js', exitPost(`# Plan\n\n${OPT_OUT}\n`))
  assert.equal(r.stdout, '')
  assert.equal(state.read(S), null)
})

test('H3 on an invalid plan (after the denial cap) runs it untiered and says so', () => {
  state.write(S, approvedState())
  const r = hook('h3-post-approval.js', exitPost(NO_BLOCK))
  assert.match(r.json.hookSpecificOutput.additionalContext, /will not run as tiered tasks/)
  assert.equal(state.read(S), null)
})

test('H3 resets the denial count and prunes old session files', () => {
  state.write('old-session', approvedState())
  const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
  fs.utimesSync(state.fileFor('old-session'), past, past)
  state.write(S, { phase: 'planning', tasks: [], denials: 2 })
  hook('h3-post-approval.js', exitPost(VALID))
  assert.equal(state.read(S).denials, 0)
  assert.equal(state.read('old-session'), null)
})

test('H3 does not claim a launch when the state cannot be saved', () => {
  const blocker = path.join(dir, 'blocker')
  fs.writeFileSync(blocker, '')
  const r = hook('h3-post-approval.js', exitPost(VALID), [], { CLAUDE_PLUGIN_DATA: path.join(blocker, 'x') })
  assert.equal(r.status, 0)
  assert.match(r.json.hookSpecificOutput.additionalContext, /could not be saved/)
  assert.ok(!r.json.hookSpecificOutput.additionalContext.includes('Your next action'))
})

// ---- the run: H4 dispatch, H5 guard, H1 resume note ---------------------------------

const RUN_TASKS = [task(1, { model: 'haiku', effort: 'default' }), task(2), task(3, { model: 'opus', effort: 'high' })]
let repo // the run's repository, per test
const toolPre = (name, extra = {}) => ({ session_id: S, tool_name: name, tool_input: {}, ...extra })

// Starts a run on its own repository and returns its state.
function startTestRun(over = {}) {
  repo = makeRepo(path.join(dir, 'repo'))
  const tasksFile = path.join(dir, 'plan.tasks.json')
  fs.writeFileSync(tasksFile, JSON.stringify({ tasks: RUN_TASKS }))
  const s = { ...runLib.startRun({ tasks: RUN_TASKS, tasksFile, branch: 'main' }), cwd: repo, ...over }
  state.write(S, s)
  return s
}
const agentPre = (toolInput, extra = {}) => ({ session_id: S, cwd: repo, tool_name: 'Agent', tool_input: toolInput, ...extra })
const expected = (over = {}) => ({ ...runLib.expectedCall(state.read(S)), ...over })
const subStop = (text, over = {}) => ({
  session_id: S,
  agent_id: 'worker-1',
  agent_type: `planandtier:${state.read(S).current.tier}`,
  hook_event_name: 'SubagentStop',
  last_assistant_message: text,
  ...over,
})
const agentPost = (toolInput, extra = {}) => ({
  session_id: S, cwd: repo, tool_name: 'Agent', tool_input: toolInput, tool_response: { status: 'completed' }, ...extra,
})
// What a worker does for task `id`: a file and one commit with the trailer.
function workerCommits(id, file = `${id}.txt`) {
  fs.writeFileSync(path.join(repo, file), id)
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-q', '-m', `Task ${id}`, '-m', `Planandtier-Task: ${id}`)
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

test('H4 pre lets the expected dispatch through and records HEAD', () => {
  startTestRun()
  const r = hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  assert.equal(r.stdout, '')
  const s = state.read(S)
  assert.equal(s.current.inFlight, true)
  assert.equal(s.current.head, gitIn(repo, 'rev-parse', 'HEAD'))
})

test('H4 pre refuses a wrong tier, a background run, a wrong prompt, and a second dispatch, repeating the right call', () => {
  startTestRun()
  for (const [over, why] of [
    [{ subagent_type: 'planandtier:sonnet-low' }, /runs on planandtier:haiku-default, not planandtier:sonnet-low/],
    [{ run_in_background: true }, /run_in_background must be false/],
    [{ prompt: 'Do T01 please' }, /prompt is not the expected one/],
  ]) {
    const out = hook('h4-dispatch.js', agentPre(expected(over)), ['pre']).json.hookSpecificOutput
    assert.equal(out.permissionDecision, 'deny')
    assert.match(out.permissionDecisionReason, why)
    assert.match(out.permissionDecisionReason, /subagent_type "planandtier:haiku-default"/)
    assert.equal(state.read(S).current.inFlight, false)
  }
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  const again = hook('h4-dispatch.js', agentPre(expected()), ['pre']).json.hookSpecificOutput
  assert.match(again.permissionDecisionReason, /T01 is already running/)
})

test('H4 pre leaves other agent types alone, and refuses planandtier agents when no run is in progress', () => {
  startTestRun()
  assert.equal(hook('h4-dispatch.js', agentPre({ subagent_type: 'Explore', prompt: 'look' }), ['pre']).stdout, '')
  state.remove(S)
  const out = hook('h4-dispatch.js', agentPre({ subagent_type: 'planandtier:sonnet-low', prompt: 'x', run_in_background: false }), ['pre'])
  assert.match(out.json.hookSpecificOutput.permissionDecisionReason, /no planandtier run is in progress\. Tell the user/)
})

test('H4 pre halts the run when the tree is dirty or the branch changed, before any work', () => {
  startTestRun()
  fs.writeFileSync(path.join(repo, 'stray.txt'), 'x')
  const dirty = hook('h4-dispatch.js', agentPre(expected()), ['pre']).json.hookSpecificOutput
  assert.equal(dirty.permissionDecision, 'deny')
  assert.match(dirty.permissionDecisionReason, /stopped at T01.*uncommitted changes that no task made/)
  assert.equal(state.read(S).phase, 'halted')

  startTestRun()
  gitIn(repo, 'switch', '-q', '-c', 'other')
  const moved = hook('h4-dispatch.js', agentPre(expected()), ['pre']).json.hookSpecificOutput
  assert.match(moved.permissionDecisionReason, /no longer on the branch the run started on \(main\)/)
  assert.equal(state.read(S).phase, 'halted')
})

test('H4 stop records the report of the dispatched worker only, falling back to its transcript', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  hook('h4-dispatch.js', subStop(report('DONE'), { agent_type: 'Explore' }), ['stop'])
  assert.equal(state.read(S).current.report, null)
  hook('h4-dispatch.js', subStop(report('DONE', 'abc')), ['stop'])
  assert.deepEqual(state.read(S).current.report, { status: 'DONE', commit: 'abc', verify: 'PASS', note: 'did it' })

  const transcript = path.join(dir, 'agent.jsonl')
  const line = o => JSON.stringify(o) + '\n'
  fs.writeFileSync(
    transcript,
    line({ type: 'assistant', message: { content: [{ type: 'text', text: report('FAILED', 'NONE', 'from transcript') }] } }) +
      line({ type: 'user', message: { content: 'x' } })
  )
  hook('h4-dispatch.js', subStop('', { agent_transcript_path: transcript }), ['stop'])
  assert.equal(state.read(S).current.report.note, 'from transcript')
})

test('a run goes through every task, one commit each, then completes', () => {
  startTestRun()
  const first = attempt(() => report('DONE', workerCommits('T01')))
  assert.match(first, /T01 is done \(commit [0-9a-f]{7}, haiku-default\)\. Call the Agent tool now with subagent_type "planandtier:sonnet-medium", description "T02: Task 2"/)
  const second = attempt(() => report('DONE', workerCommits('T02')))
  assert.match(second, /subagent_type "planandtier:opus-high"/)
  const last = attempt(() => report('DONE', workerCommits('T03')))
  assert.match(last, /all 3 tasks are done, each in its own commit: T01 [0-9a-f]{7} \(haiku-default\), T02 [0-9a-f]{7} \(sonnet-medium\), T03 [0-9a-f]{7} \(opus-high\)/)
  const s = state.read(S)
  assert.equal(s.phase, 'complete')
  assert.deepEqual(s.done.map(d => [d.id, d.attempts]), [['T01', 1], ['T02', 1], ['T03', 1]])
  assert.equal(gitIn(repo, 'log', '--format=%s', '-3'), 'Task T03\nTask T02\nTask T01')
})

test('a failed attempt is reset and retried one tier up, with the reason in the prompt', () => {
  startTestRun()
  const base = gitIn(repo, 'rev-parse', 'HEAD')
  const out = attempt(() => {
    workerCommits('T01', 'half.txt')
    fs.writeFileSync(path.join(repo, 'loose.txt'), 'x')
    return report('FAILED', 'NONE', 'Verify failed: 2 tests')
  })
  assert.match(out, /T01 failed at haiku-default: Verify failed: 2 tests\. The working tree was reset to [0-9a-f]{7}/)
  assert.match(out, /subagent_type "planandtier:sonnet-low"/)
  assert.match(out, /Retry: attempt 2 of 3; the attempt at haiku-default failed and was rolled back\.\nReason: Verify failed: 2 tests/)
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD'), base)
  assert.equal(gitIn(repo, 'status', '--porcelain'), '')
  assert.equal(fs.existsSync(path.join(repo, 'half.txt')), false)
  const s = state.read(S)
  assert.deepEqual([s.phase, s.current.attempt, s.current.tier, s.current.inFlight], ['running', 2, 'sonnet-low', false])
})

test('a DONE report the Git facts do not back up is a failed attempt', () => {
  startTestRun()
  const noCommit = attempt(() => report('DONE', 'abc'))
  assert.match(noCommit, /made 0 commits instead of one/)
  const noReport = attempt(() => 'All done!')
  assert.match(noReport, /returned no STATUS report/)
})

test('after two retries the run halts and leaves the last attempt in place', () => {
  startTestRun()
  attempt(() => report('FAILED', 'NONE', 'one'))
  attempt(() => report('FAILED', 'NONE', 'two'))
  const out = attempt(() => {
    fs.writeFileSync(path.join(repo, 'last.txt'), 'x')
    return report('FAILED', 'NONE', 'three')
  })
  assert.match(out, /stopped at T01, after 3 attempt\(s\) \(haiku-default, sonnet-low, sonnet-medium\)\. Reason: three\./)
  assert.equal(state.read(S).phase, 'halted')
  assert.equal(fs.existsSync(path.join(repo, 'last.txt')), true, 'nothing is reset after the last attempt')
})

test('a failed attempt whose commit was pushed halts without a reset', () => {
  startTestRun()
  const remote = path.join(dir, 'remote.git')
  gitIn(dir, 'init', '-q', '--bare', remote)
  gitIn(repo, 'remote', 'add', 'origin', remote)
  const out = attempt(() => {
    const sha = workerCommits('T01')
    gitIn(repo, 'push', '-q', 'origin', 'main')
    return report('FAILED', sha, 'oops')
  })
  assert.match(out, /stopped at T01.*is on a remote branch, so it cannot be reset/)
  assert.equal(fs.existsSync(path.join(repo, 'T01.txt')), true)
})

test('H4 failure counts a failed Agent call as a failed attempt', () => {
  startTestRun()
  const call = expected()
  hook('h4-dispatch.js', agentPre(call), ['pre'])
  const out = hook('h4-dispatch.js', { ...agentPre(call), error: 'Agent type not found\nmore' }, ['failure']).json.hookSpecificOutput
  assert.equal(out.hookEventName, 'PostToolUseFailure')
  assert.match(out.additionalContext, /T01 failed at haiku-default: the Agent call failed: Agent type not found\./)
  assert.equal(state.read(S).current.tier, 'sonnet-low')
})

test('H4 post and failure ignore calls that were not dispatched by the run', () => {
  startTestRun()
  assert.equal(hook('h4-dispatch.js', agentPost(expected()), ['post']).stdout, '')
  assert.equal(hook('h4-dispatch.js', agentPost({ subagent_type: 'Explore' }), ['post']).stdout, '')
  assert.equal(state.read(S).current.attempt, 1)
})

test('H5 pre denies main-thread edits during a run, with the next dispatch, then gives up', () => {
  startTestRun()
  for (let i = 1; i <= 3; i++) {
    const out = hook('h5-guard.js', toolPre('Edit'), ['pre']).json.hookSpecificOutput
    assert.equal(out.permissionDecision, 'deny')
    assert.match(out.permissionDecisionReason, /do not do the work yourself\. Call the Agent tool now/)
    assert.equal(state.read(S).guardDenials, i)
  }
  assert.equal(hook('h5-guard.js', toolPre('Edit'), ['pre']).stdout, '')
  assert.equal(state.read(S).phase, 'abandoned')
})

test('H5 is silent while a task is in flight, in other phases, with no state, and for subagents', () => {
  startTestRun()
  assert.equal(hook('h5-guard.js', toolPre('Write', { agent_id: 'a1' }), ['pre']).stdout, '')
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  assert.equal(hook('h5-guard.js', toolPre('Edit'), ['pre']).stdout, '')
  assert.equal(hook('h5-guard.js', { session_id: S }, ['stop']).stdout, '')
  for (const phase of ['paused', 'halted', 'complete', 'abandoned']) {
    state.write(S, { ...state.read(S), phase, current: { ...state.read(S).current, inFlight: false } })
    assert.equal(hook('h5-guard.js', toolPre('Write'), ['pre']).stdout, '', phase)
    assert.equal(hook('h5-guard.js', { session_id: S }, ['stop']).stdout, '', phase)
  }
  state.remove(S)
  assert.equal(hook('h5-guard.js', toolPre('Write'), ['pre']).stdout, '')
})

test('H5 stop blocks once with the next dispatch, then allows and abandons on the second consecutive stop', () => {
  startTestRun()
  const first = hook('h5-guard.js', { session_id: S, stop_hook_active: false }, ['stop'])
  assert.equal(first.json.decision, 'block')
  assert.match(first.json.reason, /subagent_type "planandtier:haiku-default"/)
  assert.equal(state.read(S).phase, 'running')
  const second = hook('h5-guard.js', { session_id: S, stop_hook_active: true }, ['stop'])
  assert.equal(second.stdout, '')
  assert.equal(state.read(S).phase, 'abandoned')
})

test('H1 reminds Claude of a run in progress outside plan mode, but not for reports and notifications', () => {
  startTestRun()
  const out = hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: 'continue' }).stdout
  assert.match(out, /a run of the approved plan is in progress\. 0 of 3 tasks are done\./)
  assert.match(out, /subagent_type "planandtier:haiku-default"/)
  for (const prompt of ['<agent-message from="x">report</agent-message>', '<task-notification>x</task-notification>']) {
    assert.equal(hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt }).stdout, '')
  }
  assert.equal(hook('h1-plan-rules.js', { session_id: S, permission_mode: 'plan', prompt: 'x' }).stdout, RULES)
})

test('H1 starts a paused run once the tree is clean, and says why it is still waiting until then', () => {
  startTestRun({ phase: 'paused', pausedBecause: 'dirty' })
  fs.writeFileSync(path.join(repo, 'wip.txt'), 'x')
  const waiting = hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: 'go' }).stdout
  assert.match(waiting, /still waiting to run, because the working tree has uncommitted changes \(wip\.txt\)/)
  assert.equal(state.read(S).phase, 'paused')
  fs.rmSync(path.join(repo, 'wip.txt'))
  const started = hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: 'go' }).stdout
  assert.match(started, /the working tree is clean now, so the approved plan's run starts\. Call the Agent tool now/)
  const s = state.read(S)
  assert.equal(s.phase, 'running')
  assert.equal(s.pausedBecause, undefined)
})

test('state changes are logged with a timestamp only when PLANANDTIER_DEBUG is set', () => {
  startTestRun()
  const env = { TEMP: dir, TMP: dir, TMPDIR: dir }
  const log = path.join(dir, 'planandtier-debug.log')
  hook('h5-guard.js', toolPre('Edit'), ['pre'], env)
  assert.equal(fs.existsSync(log), false)
  hook('h5-guard.js', toolPre('Edit'), ['pre'], { ...env, PLANANDTIER_DEBUG: '1' })
  hook('h6-cleanup.js', { session_id: S }, ['end'], { ...env, PLANANDTIER_DEBUG: '1' })
  const lines = fs.readFileSync(log, 'utf8').trim().split('\n')
  assert.match(lines[0], /^\d{4}-\d\d-\d\dT\S+Z state sess-1: phase=running denials=0 guardDenials=2$/)
  assert.match(lines[1], /state sess-1: removed$/)
})

test('H6 end deletes the session state', () => {
  startTestRun()
  const r = hook('h6-cleanup.js', { session_id: S, hook_event_name: 'SessionEnd' }, ['end'])
  assert.equal(r.stdout, '')
  assert.equal(state.read(S), null)
})

// ---- every hook ---------------------------------------------------------------------

const HOOKS = [
  ['h1-plan-rules.js', []],
  ['h1-plan-rules.js', ['enter']],
  ['h2-gate-exit-plan.js', []],
  ['h3-post-approval.js', []],
  ['h4-dispatch.js', ['pre']],
  ['h4-dispatch.js', ['stop']],
  ['h4-dispatch.js', ['post']],
  ['h4-dispatch.js', ['failure']],
  ['h5-guard.js', ['pre']],
  ['h5-guard.js', ['stop']],
  ['h6-cleanup.js', ['end']],
]

test('every hook exits 0 with no output on empty, malformed and non-object stdin', () => {
  for (const [script, args] of HOOKS) {
    for (const stdin of ['', 'not json', '[]', 'null', '42', '{']) {
      const r = hook(script, stdin, args)
      assert.equal(r.status, 0, `${script} ${args} <${stdin}>`)
      assert.equal(r.stdout, '', `${script} ${args} <${stdin}>`)
    }
  }
})

test('every hook exits 0 when the data directory is unwritable', () => {
  const blocker = path.join(dir, 'blocker')
  fs.writeFileSync(blocker, '')
  const env = { CLAUDE_PLUGIN_DATA: path.join(blocker, 'x') }
  const agent = { session_id: S, cwd: REPO, tool_name: 'Agent', tool_input: { subagent_type: 'planandtier:sonnet-low' } }
  const inputs = {
    'h2-gate-exit-plan.js': exitPre(NO_BLOCK, path.join(dir, 'none.md')),
    'h4-dispatch.js': agent,
    'h5-guard.js': toolPre('Edit'),
  }
  for (const [script, args] of HOOKS) {
    const r = hook(script, inputs[script] ?? { session_id: S }, args, env)
    assert.equal(r.status, 0, `${script} ${args}`)
  }
})

test('hooks.json is valid, every command names a script that exists, and Agent events go to H4', () => {
  const config = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'))
  const commands = Object.values(config.hooks).flatMap(groups => groups.flatMap(g => g.hooks.map(h => h.command)))
  assert.equal(commands.length, 11)
  for (const command of commands) {
    const script = /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/([\w-]+\.js)/.exec(command)?.[1]
    assert.ok(script && fs.existsSync(path.join(PLUGIN, 'scripts', script)), command)
  }
  const h4 = (event, matcher) => config.hooks[event].find(g => g.matcher === matcher)?.hooks[0].command
  assert.match(h4('PreToolUse', 'Agent'), /h4-dispatch\.js" pre$/)
  assert.match(h4('PostToolUse', 'Agent'), /h4-dispatch\.js" post$/)
  assert.match(h4('PostToolUseFailure', 'Agent'), /h4-dispatch\.js" failure$/)
  assert.match(config.hooks.SubagentStop[0].hooks[0].command, /h4-dispatch\.js" stop$/)
  assert.ok(!JSON.stringify(config).includes('Workflow'))
})

test('no hook script ever grants permission', () => {
  for (const name of fs.readdirSync(path.join(PLUGIN, 'scripts')).filter(f => f.endsWith('.js'))) {
    const source = fs
      .readFileSync(path.join(PLUGIN, 'scripts', name), 'utf8')
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n')
    assert.ok(!/['"]allow['"]/.test(source), `${name} must not set permissionDecision to allow`)
    assert.ok(!/['"]ask['"]/.test(source), name)
  }
})
