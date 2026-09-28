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

const S = 'sess-1'
let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planandtier-hooks-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(dir, 'data')
  // Every hook does nothing in an unarmed session, so the tests start armed; the arming tests
  // disarm first.
  state.arm(S)
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
  assert.match(out.permissionDecisionReason, /T01\.model: "fable" is not allowed; use sonnet or opus/)
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
  assert.match(out.additionalContext, /subagent_type "planandtier:sonnet-medium", description "T01: Task 1", and exactly this prompt/)
  assert.ok(out.additionalContext.includes(`exactly this prompt (3 lines, nothing added):\nTasks file: ${TASKS_FILE()}\nPlan: ${s.planId}\nTask: T01\n`))
  assert.match(out.additionalContext, /Do not implement the plan yourself/)
})

test('a task asking for sonnet/xhigh is shown, saved and dispatched as opus/low', () => {
  const text = planText([task(1, { effort: 'xhigh' }), task(2)])
  const file = writePlanFile(text)
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(text, file)).stdout, '', 'not denied')
  assert.ok(fs.readFileSync(file, 'utf8').includes('| T01 | Task 1 | opus | low |'))
  const out = hook('h3-post-approval.js', exitPost(text)).json.hookSpecificOutput.additionalContext
  assert.match(out, /subagent_type "planandtier:opus-low", description "T01: Task 1"/)
  const s = state.read(S)
  assert.deepEqual([s.tasks[0].model, s.tasks[0].effort, s.current.tier], ['opus', 'low', 'opus-low'])
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

// A clean repository with one commit but no identity to commit with, and the environment a hook needs
// to see it that way: user.useConfigOnly stops Git from guessing one, the global and system config are
// shut out, and no GIT_* identity is set.
function repoWithoutIdentity() {
  const repo = path.join(dir, 'anon')
  fs.mkdirSync(repo)
  gitIn(repo, 'init', '-q', '-b', 'main')
  gitIn(repo, 'config', 'user.useConfigOnly', 'true')
  gitIn(repo, 'config', 'commit.gpgsign', 'false')
  fs.writeFileSync(path.join(repo, 'README.md'), '# test\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, '-c', 'user.name=Setup', '-c', 'user.email=setup@example.com', 'commit', '-q', '-m', 'init')
  const emptyConfig = path.join(dir, 'empty.gitconfig')
  fs.writeFileSync(emptyConfig, '')
  const env = { GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_NOSYSTEM: '1' }
  for (const key of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'EMAIL']) env[key] = ''
  return { repo, env }
}

test('H2 denies a tiered plan in a repository with no Git identity', () => {
  const { repo, env } = repoWithoutIdentity()
  const file = writePlanFile(VALID)
  const out = hook('h2-gate-exit-plan.js', exitPre(VALID, file, repo), [], env).json.hookSpecificOutput
  assert.equal(out.permissionDecision, 'deny')
  assert.match(out.permissionDecisionReason, /Git has no user name and email for this repository, so the tasks cannot commit/)
  assert.equal(fs.readFileSync(file, 'utf8'), VALID, 'the block is not moved')
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
  assert.equal(s.planId, s.tasksHash, 'the plan id is the tasks file hash')
  assert.match(r.json.hookSpecificOutput.additionalContext, /3 tiered tasks/)
  assert.match(r.json.hookSpecificOutput.additionalContext, new RegExp(`\\nPlan: ${s.planId}\\nTask: T01`))
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
  // The session is armed, but a directory stands where its state file would go.
  fs.mkdirSync(state.fileFor(S))
  writePlanFile(VALID)
  const r = hook('h3-post-approval.js', exitPost(VALID))
  assert.equal(r.status, 0)
  assert.match(r.json.hookSpecificOutput.additionalContext, /could not be saved/)
  assert.ok(!r.json.hookSpecificOutput.additionalContext.includes('Your next action'))
})

// ---- the run: H4 dispatch, H5 guard, H1 resume note ---------------------------------

const RUN_TASKS = [task(1, { effort: 'low' }), task(2), task(3, { model: 'opus', effort: 'high' })]
let repo // the run's repository, per test
const PLAN_ID = 'feedfacecafebeef'
const toolPre = (name, extra = {}) => ({ session_id: S, tool_name: name, tool_input: {}, ...extra })

// Starts a run on its own repository and returns its state.
function startTestRun(over = {}) {
  repo = makeRepo(path.join(dir, 'repo'))
  const tasksFile = path.join(dir, 'plan.tasks.json')
  fs.writeFileSync(tasksFile, JSON.stringify({ tasks: RUN_TASKS }))
  const s = { ...runLib.startRun({ tasks: RUN_TASKS, tasksFile, branch: 'main', planId: PLAN_ID }), cwd: repo, ...over }
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
function workerCommits(id, file = `${id}.txt`, planId = PLAN_ID) {
  fs.writeFileSync(path.join(repo, file), id)
  gitIn(repo, 'add', '-A')
  const plan = planId ? ['-m', `Planandtier-Plan: ${planId}`] : []
  gitIn(repo, 'commit', '-q', '-m', `Task ${id}`, '-m', `Planandtier-Task: ${id}`, ...plan)
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

test('H4 pre refuses a wrong tier, a wrong prompt, and a second dispatch, repeating the right call', () => {
  startTestRun()
  for (const [over, why] of [
    [{ subagent_type: 'planandtier:sonnet-medium' }, /runs on planandtier:sonnet-low, not planandtier:sonnet-medium/],
    [{ prompt: 'Do T01 please' }, /prompt is not the expected one/],
  ]) {
    const out = hook('h4-dispatch.js', agentPre(expected(over)), ['pre']).json.hookSpecificOutput
    assert.equal(out.permissionDecision, 'deny')
    assert.match(out.permissionDecisionReason, why)
    assert.match(out.permissionDecisionReason, /subagent_type "planandtier:sonnet-low"/)
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

test('H4 accepts a dispatch whether or not it sets run_in_background', () => {
  startTestRun()
  const call = expected()
  assert.ok(!('run_in_background' in call))
  assert.equal(hook('h4-dispatch.js', agentPre({ ...call, run_in_background: true }), ['pre']).stdout, '')
  assert.equal(state.read(S).current.inFlight, true)
})

test('H4 stop judges the dispatched worker only, and leaves the notice for Claude', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  hook('h4-dispatch.js', subStop(report('DONE'), { agent_type: 'Explore' }), ['stop'])
  assert.deepEqual([state.read(S).current.inFlight, state.read(S).notice], [true, null], 'another agent type is ignored')
  hook('h4-dispatch.js', subStop(report('DONE', workerCommits('T01'))), ['stop'])
  const s = state.read(S)
  assert.equal(s.current.inFlight, false)
  assert.deepEqual(s.done.map(d => d.id), ['T01'])
  assert.match(s.notice, /^planandtier: T01 is done \(commit [0-9a-f]{7}, sonnet-low\)\. Call the Agent tool now with subagent_type "planandtier:sonnet-medium"/)
})

test('H4 stop reads the report from the worker transcript when SubagentStop has none', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  const transcript = path.join(dir, 'agent.jsonl')
  const line = o => JSON.stringify(o) + '\n'
  fs.writeFileSync(
    transcript,
    line({ type: 'assistant', message: { content: [{ type: 'text', text: report('FAILED', 'NONE', 'from transcript') }] } }) +
      line({ type: 'user', message: { content: 'x' } })
  )
  hook('h4-dispatch.js', subStop('', { agent_transcript_path: transcript }), ['stop'])
  assert.match(state.read(S).notice, /T01 failed at sonnet-low: from transcript\./)
})

test('H4 stop finds a report handed back with SubagentHandback when the last message is only "Task complete."', () => {
  // As measured in the interactive run: the report goes through the hand-back tool, and the
  // worker's final text says nothing more.
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  const sha = workerCommits('T01')
  const transcript = path.join(dir, 'agent.jsonl')
  const line = o => JSON.stringify(o) + '\n'
  fs.writeFileSync(
    transcript,
    line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Committing now.' }] } }) +
      line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'SubagentHandback', input: { message: report('DONE', sha) } }] } }) +
      line({ type: 'user', message: { content: [{ type: 'tool_result', content: 'Report delivered to your caller.' }] } }) +
      line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Task complete.' }] } })
  )
  hook('h4-dispatch.js', subStop('Task complete.', { agent_transcript_path: transcript }), ['stop'])
  const s = state.read(S)
  assert.deepEqual(s.done.map(d => [d.id, d.tier, d.attempts]), [['T01', 'sonnet-low', 1]])
  assert.match(s.notice, /T01 is done/)
})

test('a background run: the launch says to wait, the worker stopping moves the run on, and its report delivers the notice', () => {
  startTestRun()
  const call = expected()
  hook('h4-dispatch.js', agentPre(call), ['pre'])
  const launched = hook('h4-dispatch.js', agentPost(call, { tool_response: { isAsync: true, status: 'async_launched' } }), ['post'])
  assert.match(launched.json.hookSpecificOutput.additionalContext, /T01 is running in the background on planandtier:sonnet-low\. End your turn now/)
  assert.equal(hook('h5-guard.js', { session_id: S, stop_hook_active: false }, ['stop']).stdout, '', 'Claude may end its turn')

  const sha = workerCommits('T01')
  hook('h4-dispatch.js', subStop(report('DONE', sha)), ['stop'])
  const arrived = hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: '<agent-message from="w">STATUS: DONE</agent-message>' }).stdout
  assert.match(arrived, /T01 is done \(commit [0-9a-f]{7}, sonnet-low\)\. Call the Agent tool now with subagent_type "planandtier:sonnet-medium"/)
  assert.equal(state.read(S).notice, null, 'shown once')
  assert.equal(hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: '<task-notification>x</task-notification>' }).stdout, '')
})

test('a notice is shown on an ordinary prompt too, and by the stop guard, but only once', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  hook('h4-dispatch.js', subStop(report('FAILED', 'NONE', 'tests fail')), ['stop'])
  const typed = hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: 'what happened?' }).stdout
  assert.match(typed, /T01 failed at sonnet-low: tests fail\. The working tree was reset/)
  assert.match(hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: 'and now?' }).stdout, /a run of the approved plan is in progress/)

  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  hook('h4-dispatch.js', subStop(report('FAILED', 'NONE', 'still failing')), ['stop'])
  const blocked = hook('h5-guard.js', { session_id: S, stop_hook_active: false }, ['stop']).json
  assert.equal(blocked.decision, 'block')
  assert.match(blocked.reason, /T01 failed at sonnet-medium: still failing\./)
  assert.equal(state.read(S).notice, null)
})

test('a dispatch clears a notice that was never shown', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  hook('h4-dispatch.js', subStop(report('FAILED', 'NONE', 'x')), ['stop'])
  assert.ok(state.read(S).notice)
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  assert.equal(state.read(S).notice, null)
  assert.equal(hook('h4-dispatch.js', agentPost(expected()), ['post']).json.hookSpecificOutput.additionalContext.includes('running in the background'), true)
})

test('a run goes through every task, one commit each, then completes', () => {
  startTestRun()
  const first = attempt(() => report('DONE', workerCommits('T01')))
  assert.match(first, /T01 is done \(commit [0-9a-f]{7}, sonnet-low\)\. Call the Agent tool now with subagent_type "planandtier:sonnet-medium", description "T02: Task 2"/)
  const second = attempt(() => report('DONE', workerCommits('T02')))
  assert.match(second, /subagent_type "planandtier:opus-high"/)
  const last = attempt(() => report('DONE', workerCommits('T03')))
  assert.match(last, /all 3 tasks are done, each in its own commit: T01 [0-9a-f]{7} \(sonnet-low\), T02 [0-9a-f]{7} \(sonnet-medium\), T03 [0-9a-f]{7} \(opus-high\)/)
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
  assert.match(out, /T01 failed at sonnet-low: Verify failed: 2 tests\. The working tree was reset to [0-9a-f]{7}/)
  assert.match(out, /subagent_type "planandtier:sonnet-medium"/)
  assert.match(out, /Retry: attempt 2 of 3; the attempt at sonnet-low failed and was rolled back\.\nReason: Verify failed: 2 tests/)
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD'), base)
  assert.equal(gitIn(repo, 'status', '--porcelain'), '')
  assert.equal(fs.existsSync(path.join(repo, 'half.txt')), false)
  const s = state.read(S)
  assert.deepEqual([s.phase, s.current.attempt, s.current.tier, s.current.inFlight], ['running', 2, 'sonnet-medium', false])
})

test('a DONE report the Git facts do not back up is a failed attempt', () => {
  startTestRun()
  const noCommit = attempt(() => report('DONE', 'abc'))
  assert.match(noCommit, /made 0 commits instead of one/)
  const noReport = attempt(() => 'All done!')
  assert.match(noReport, /returned no STATUS report/)
  const noPlanLine = attempt(() => report('DONE', workerCommits('T01', 'T01.txt', null)))
  assert.match(noPlanLine, /no "Planandtier-Plan: feedfacecafebeef" line/)
})

test('after two retries the run halts and leaves the last attempt in place', () => {
  startTestRun()
  attempt(() => report('FAILED', 'NONE', 'one'))
  attempt(() => report('FAILED', 'NONE', 'two'))
  const out = attempt(() => {
    fs.writeFileSync(path.join(repo, 'last.txt'), 'x')
    return report('FAILED', 'NONE', 'three')
  })
  assert.match(out, /stopped at T01, after 3 attempt\(s\) \(sonnet-low, sonnet-medium, sonnet-high\)\. Reason: three\./)
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
  assert.match(out.additionalContext, /T01 failed at sonnet-low: the Agent call failed: Agent type not found\./)
  assert.equal(state.read(S).current.tier, 'sonnet-medium')
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
  assert.match(first.json.reason, /subagent_type "planandtier:sonnet-low"/)
  assert.equal(state.read(S).phase, 'running')
  const second = hook('h5-guard.js', { session_id: S, stop_hook_active: true }, ['stop'])
  assert.equal(second.stdout, '')
  assert.equal(state.read(S).phase, 'abandoned')
})

test('H1 reminds Claude of a run in progress outside plan mode, but not for reports and notifications', () => {
  startTestRun()
  const out = hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: 'continue' }).stdout
  assert.match(out, /a run of the approved plan is in progress\. 0 of 3 tasks are done\./)
  assert.match(out, /subagent_type "planandtier:sonnet-low"/)
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

// ---- arming ---------------------------------------------------------------------------

const typed = (prompt, mode = 'default', cwd = REPO, env = {}) =>
  hook('h1-plan-rules.js', { session_id: S, cwd, permission_mode: mode, prompt }, [], env)

test('arming is refused, with the reason, where a plan could not run', () => {
  state.disarm(S)
  const refused = (out, reason) => {
    assert.match(out, new RegExp(`^planandtier: not armed, because ${reason}\\.`))
    assert.match(out, /type \/planandtier:arm again\./)
    assert.equal(state.isArmed(S), false)
  }
  const plain = path.join(dir, 'plain')
  fs.mkdirSync(plain)
  refused(typed('/planandtier:arm', 'default', plain).stdout, 'it is not inside a Git repository')

  const repo = makeRepo(path.join(dir, 'repo'))
  fs.writeFileSync(path.join(repo, 'wip.txt'), 'x')
  refused(typed('/planandtier:arm', 'default', repo).stdout, 'the working tree has uncommitted changes \\(wip\\.txt\\)')

  const anon = repoWithoutIdentity()
  refused(typed('/planandtier:arm', 'default', anon.repo, anon.env).stdout, 'Git has no user name and email for this repository, so the tasks cannot commit; set user.name and user.email')

  refused(typed('/planandtier:arm', 'default', REPO, { PATH: '', Path: '' }).stdout, 'Git is not installed or not on the PATH')

  const inPlanMode = typed('/planandtier:arm', 'plan', plain).stdout
  assert.ok(!inPlanMode.includes(RULES), 'no rules when arming is refused')
})

test('/planandtier:arm arms the session and says so, and arming again changes nothing', () => {
  state.disarm(S)
  const out = typed('/planandtier:arm').stdout
  assert.match(out, /^planandtier: armed for this session\. A plan made in plan mode is now split into tiered tasks/)
  assert.ok(!out.includes(RULES), 'no rules outside plan mode')
  assert.equal(state.isArmed(S), true)
  assert.match(typed('  /planandtier:arm please').stdout, /^planandtier: already armed for this session; nothing changed\./)
  assert.equal(typed('/planandtier:armed').stdout, '', 'only the exact command')
  assert.equal(typed('please /planandtier:arm').stdout, '', 'only at the start of the prompt')
})

test('arming in plan mode also prints the rules', () => {
  state.disarm(S)
  const out = typed('/planandtier:arm', 'plan').stdout
  assert.match(out, /^planandtier: armed for this session\./)
  assert.ok(out.endsWith(RULES))
})

test('arming says it failed when the flag cannot be written', () => {
  state.disarm(S)
  const blocker = path.join(dir, 'blocker')
  fs.writeFileSync(blocker, '')
  const out = typed('/planandtier:arm', 'default', REPO, { CLAUDE_PLUGIN_DATA: path.join(blocker, 'x') })
  assert.match(out.stdout, /^planandtier: arming failed/)
})

test('/planandtier:disarm disarms, and says so when there was nothing to disarm', () => {
  state.write(S, { phase: 'planning', tasks: [], denials: 1 })
  assert.match(typed('/planandtier:disarm').stdout, /^planandtier: disarmed for this session\. Plans are no longer tiered/)
  assert.equal(state.isArmed(S), false)
  assert.equal(state.read(S), null, 'planning state is removed')
  assert.match(typed('/planandtier:disarm').stdout, /^planandtier: was not armed for this session; nothing changed\./)
})

test('an unarmed session is left alone by every hook', () => {
  state.disarm(S)
  const file = writePlanFile(INVALID)
  assert.equal(typed('x', 'plan').stdout, '', 'no rules in plan mode')
  assert.equal(hook('h1-plan-rules.js', { session_id: S, tool_name: 'EnterPlanMode' }, ['enter']).stdout, '')
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(INVALID, file, path.join(dir, 'not-a-repo'))).stdout, '', 'no denial')
  assert.equal(fs.readFileSync(file, 'utf8'), INVALID)
  writePlanFile(VALID)
  assert.equal(hook('h3-post-approval.js', exitPost(VALID)).stdout, '')
  assert.equal(state.read(S), null, 'nothing is saved')

  // A run's state left behind (say, from before a disarm) does not wake the hooks either.
  startTestRun()
  state.disarm(S)
  const call = expected()
  assert.equal(hook('h4-dispatch.js', agentPre({ subagent_type: 'planandtier:opus-high', prompt: 'x', description: 'x' }), ['pre']).stdout, '')
  assert.equal(hook('h4-dispatch.js', agentPost(call), ['post']).stdout, '')
  assert.equal(hook('h5-guard.js', toolPre('Edit'), ['pre']).stdout, '')
  assert.equal(hook('h5-guard.js', { session_id: S, stop_hook_active: false }, ['stop']).stdout, '')
  assert.equal(typed('continue').stdout, '', 'no resume note')
  assert.deepEqual(state.read(S).current.inFlight, false)
})

test('disarming mid-run stops it: nothing more is dispatched, and the worker in flight is not judged', () => {
  startTestRun()
  attempt(() => report('DONE', workerCommits('T01')))
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  assert.equal(state.read(S).current.inFlight, true)

  const out = typed('/planandtier:disarm').stdout
  assert.match(out, /^planandtier: disarmed for this session, which stops the run of the approved plan\./)
  assert.match(out, /Done and committed: T01 [0-9a-f]{7} \(sonnet-low\)\. Not done: T02, T03\./)
  assert.match(out, /T02's worker is still running; planandtier will not check it or roll it back/)
  assert.match(out, /Do not dispatch more tasks\./)
  const s = state.read(S)
  assert.deepEqual([s.phase, s.notice], ['abandoned', null])

  const head = gitIn(repo, 'rev-parse', 'HEAD')
  fs.writeFileSync(path.join(repo, 'loose.txt'), 'x')
  hook('h4-dispatch.js', subStop(report('FAILED', 'NONE', 'x')), ['stop'])
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD'), head)
  assert.equal(fs.existsSync(path.join(repo, 'loose.txt')), true, 'no reset')
  assert.equal(state.read(S).notice, null)
})

test('disarming a run between tasks says nothing is running', () => {
  startTestRun()
  const out = typed('/planandtier:disarm').stdout
  assert.match(out, /Done and committed: none\. Not done: T01, T02, T03\. Tell the user/)
  assert.ok(!out.includes('still running'))
})

test('SessionEnd removes the arming flag', () => {
  hook('h6-cleanup.js', { session_id: S, hook_event_name: 'SessionEnd' }, ['end'])
  assert.equal(state.isArmed(S), false)
})

test('the arm and disarm skills can only be run by the user', () => {
  for (const name of ['arm', 'disarm']) {
    const skill = fs.readFileSync(path.join(PLUGIN, 'skills', name, 'SKILL.md'), 'utf8')
    assert.match(skill, new RegExp(`^---\\r?\\nname: ${name}\\r?\\n`))
    assert.match(skill, /^disable-model-invocation: true$/m)
  }
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
