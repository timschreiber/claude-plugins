'use strict'

const { test, before, after, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PLUGIN = path.join(__dirname, '..', '..', 'plugins', 'tierminator')
const state = require(path.join(PLUGIN, 'scripts', 'lib', 'state.js'))
const sidecar = require(path.join(PLUGIN, 'scripts', 'lib', 'sidecar.js'))
const { extractBlock, parsePlan } = require(path.join(PLUGIN, 'scripts', 'lib', 'tasks.js'))
const runLib = require(path.join(PLUGIN, 'scripts', 'lib', 'run.js'))
const telemetry = require(path.join(PLUGIN, 'scripts', 'lib', 'telemetry.js'))
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
  REPO = makeRepo(fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-repo-')))
})
after(() => {
  fs.rmSync(REPO, { recursive: true, force: true })
})

const S = 'sess-1'
let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-hooks-'))
  process.env.CLAUDE_PLUGIN_DATA = path.join(dir, 'data')
  // Every hook does nothing in an inactive session, so the tests start active; the command tests
  // deactivate first.
  state.activate(S)
})
afterEach(() => {
  delete process.env.CLAUDE_PLUGIN_DATA
  fs.rmSync(dir, { recursive: true, force: true })
})

// Runs a hook script with `stdin` and returns {status, stdout, json}. CLAUDE_CODE_ENTRYPOINT is left out
// unless `env` sets it, so the hooks see an interactive session whatever shell runs the tests.
function hook(script, stdin, args = [], env = {}) {
  const base = { ...process.env }
  delete base.CLAUDE_CODE_ENTRYPOINT
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

const task = (n, over = {}) => ({
  id: `T${String(n).padStart(2, '0')}`,
  title: `Task ${n}`,
  model: 'sonnet',
  effort: 'medium',
  prompt: 'Read docs/spec.md.\nFiles to change: src/a.js\nDo the work. Verify: node --test passes.',
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
// The state /tierminator:plan saves: the session is planning.
const planning = (over = {}) => state.write(S, { phase: 'planning', tasks: [], denials: 0, guardDenials: 0, ...over })

// ---- H1 ----------------------------------------------------------------------------

const planPrompt = prompt => hook('h1-plan-rules.js', { session_id: S, permission_mode: 'plan', prompt }).stdout

test('H1 prints the rules on the first plan-mode prompt only', () => {
  planning()
  const first = hook('h1-plan-rules.js', { session_id: S, permission_mode: 'plan', prompt: 'x' })
  assert.equal(first.status, 0)
  assert.equal(first.stdout, RULES)
  assert.equal(planPrompt('y'), '')
})

test('H1 prints nothing outside plan mode when there is no run', () => {
  for (const mode of ['default', 'auto', 'acceptEdits', undefined]) {
    assert.equal(hook('h1-plan-rules.js', { session_id: S, permission_mode: mode }).stdout, '')
  }
})

test('H1 does not show the rules for harness prompts, and shows them on the next user prompt', () => {
  planning()
  assert.equal(planPrompt('<task-notification>x</task-notification>'), '')
  assert.equal(planPrompt('<agent-message from="x">r</agent-message>'), '')
  assert.equal(state.rulesShown(S), false)
  assert.equal(planPrompt('x'), RULES)
  assert.equal(planPrompt('<task-notification>x</task-notification>'), '')
})

test('a typed prompt outside plan mode during planning deactivates silently', () => {
  planning()
  assert.equal(planPrompt('x'), RULES)
  const r = hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: 'never mind' })
  assert.equal(r.stdout, '')
  assert.equal(state.isActive(S), false)
  assert.equal(state.read(S), null)
  assert.equal(state.rulesShown(S), false)
  assert.equal(planPrompt('x'), '', 'the user left plan mode without approving; tierminator is no longer involved')
})

test('H1 compact mode clears the marker so the next plan-mode prompt shows the rules again', () => {
  planning()
  assert.equal(planPrompt('x'), RULES)
  assert.equal(planPrompt('y'), '')
  const r = hook('h1-plan-rules.js', { session_id: S }, ['compact'])
  assert.equal(r.status, 0)
  assert.equal(r.stdout, '')
  assert.equal(state.rulesShown(S), false)
  assert.equal(planPrompt('x'), RULES)
})

test('H1 enter mode returns the rules as PostToolUse additionalContext, always, and marks them shown', () => {
  assert.equal(hook('h1-plan-rules.js', { session_id: S, tool_name: 'EnterPlanMode' }, ['enter']).stdout, '', 'not planning')
  planning()
  const r = hook('h1-plan-rules.js', { session_id: S, tool_name: 'EnterPlanMode' }, ['enter'])
  assert.deepEqual(r.json, { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: RULES } })
  assert.equal(state.rulesShown(S), true)
  assert.equal(planPrompt('x'), '')
  const again = hook('h1-plan-rules.js', { session_id: S, tool_name: 'EnterPlanMode' }, ['enter'])
  assert.deepEqual(again.json, { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: RULES } })
})

test('H1 shows the rules again after deactivation and activation', () => {
  planning()
  assert.equal(planPrompt('x'), RULES)
  state.deactivate(S)
  assert.equal(state.rulesShown(S), false)
  state.activate(S)
  assert.equal(planPrompt('x'), RULES)
})

test('H1 stays silent for subagents', () => {
  assert.equal(hook('h1-plan-rules.js', { permission_mode: 'plan', agent_id: 'a1' }).stdout, '')
})

// ---- H1: unattended (headless) sessions -----------------------------------------------

const unattendedRun = (over = {}, envOver = {}) => {
  const payload = { session_id: S, cwd: REPO, permission_mode: 'default', prompt: '/tierminator:plan Add a clock', ...over }
  return hook('h1-plan-rules.js', payload, [], { CLAUDE_CODE_ENTRYPOINT: 'sdk-cli', CLAUDE_CONFIG_DIR: dir, ...envOver })
}

test('with CLAUDE_CODE_ENTRYPOINT=sdk-cli, /tierminator:plan starts drafting and saves the state', () => {
  state.deactivate(S)
  const r = unattendedRun()
  assert.equal(state.isActive(S), true)
  const s = state.read(S)
  assert.equal(s.phase, 'drafting')
  assert.ok(s.planFile.startsWith(path.join(dir, 'plans')))
  assert.match(s.planFile, /tierminator-unattended-\d{8}-\d{6}-sess-1\.md$/)
  assert.equal(state.rulesShown(S), true)
  assert.ok(r.stdout.includes('unattended run'))
  assert.ok(r.stdout.includes(s.planFile))
  assert.ok(r.stdout.includes(RULES))
})

test('a headless /tierminator:plan in plan mode is refused, and nothing is activated', () => {
  state.deactivate(S)
  const r = unattendedRun({ permission_mode: 'plan' })
  assert.equal(state.isActive(S), false)
  assert.equal(state.read(S), null)
  assert.ok(r.stdout.includes('plan mode'))
  assert.match(r.stdout, /relaunch without --permission-mode plan/)
})

test('a headless /tierminator:plan in a dirty repository starts nothing', () => {
  state.deactivate(S)
  const repo2 = makeRepo(path.join(dir, 'dirty'))
  fs.writeFileSync(path.join(repo2, 'extra.txt'), 'x\n')
  const r = unattendedRun({ cwd: repo2 })
  assert.equal(state.isActive(S), false)
  assert.equal(state.read(S), null)
  assert.ok(r.stdout.includes('not started'))
})

test('an interactive entrypoint plans in plan mode instead of drafting', () => {
  state.deactivate(S)
  const r = unattendedRun({}, { CLAUDE_CODE_ENTRYPOINT: 'cli' })
  assert.match(r.stdout, /^tierminator: planning started\./)
  assert.equal(state.read(S).phase, 'planning')
})

test('a headless session without /tierminator:plan starts nothing, for a prompt or a task notification', () => {
  state.deactivate(S)
  for (const prompt of ['Add a clock', '<task-notification>done</task-notification>']) {
    const r = unattendedRun({ prompt })
    assert.equal(r.stdout, '')
    assert.equal(state.isActive(S), false)
  }
})

test('H1 repeats the unattended note, without the rules, on a prompt while drafting', () => {
  state.deactivate(S)
  unattendedRun()
  const planFile = state.read(S).planFile
  const r = unattendedRun({ prompt: 'and more' })
  assert.ok(r.stdout.includes('unattended run'))
  assert.ok(r.stdout.includes(planFile))
  assert.ok(!r.stdout.includes(RULES))
})

const sessionStart = () => hook('h1-plan-rules.js', { session_id: S, source: 'compact' }, ['session'])

test('H1 session mode re-injects the note and rules into a drafting session after compaction', () => {
  state.write(S, { phase: 'drafting', planFile: path.join(dir, 'plans', 'p.md'), denials: 0, guardDenials: 0 })
  state.clearRulesShown(S)
  const r = sessionStart()
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.ok(r.json.hookSpecificOutput.additionalContext.includes(path.join(dir, 'plans', 'p.md')))
  assert.ok(r.json.hookSpecificOutput.additionalContext.includes(RULES))
  assert.equal(state.rulesShown(S), true)
})

test('H1 session mode prints nothing for a running run, no state or an inactive session', () => {
  state.write(S, approvedState({ phase: 'running' }))
  assert.equal(sessionStart().stdout, '')
  state.remove(S)
  assert.equal(sessionStart().stdout, '')
  state.write(S, { phase: 'drafting', planFile: 'p.md', denials: 0, guardDenials: 0 })
  state.deactivate(S)
  assert.equal(sessionStart().stdout, '')
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
  assert.ok(!out.permissionDecisionReason.includes('# tierminator: tiered plans'), 'rules only when the block is missing')
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

test('H2 denying keeps the planning state intact', () => {
  planning({ tasks: [task(1), task(2)] })
  hook('h2-gate-exit-plan.js', exitPre(NO_BLOCK, writePlanFile(NO_BLOCK)))
  const s = state.read(S)
  assert.equal(s.phase, 'planning')
  assert.equal(s.tasks.length, 2)
  assert.equal(s.denials, 1)
})

test('H2 does nothing outside the planning phase', () => {
  for (const phase of ['running', 'drafting', 'complete']) {
    state.write(S, approvedState({ phase }))
    assert.equal(hook('h2-gate-exit-plan.js', exitPre(NO_BLOCK, writePlanFile(NO_BLOCK))).stdout, '', phase)
    assert.equal(state.read(S).denials, 0, phase)
  }
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
  assert.ok(plan.startsWith('# Plan\n\nProse.\n\n## Tasks\n\n<!-- tierminator:tasks -->\n'))
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
  planning()
  const file = writePlanFile(VALID)
  hook('h2-gate-exit-plan.js', exitPre(VALID, file))
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('| T02 | Task 2 |', '| T02 | Renamed |'))
  const out = hook('h3-post-approval.js', exitPost(VALID)).json.hookSpecificOutput.additionalContext
  assert.match(out, /tasks could not be loaded, so nothing will run/)
  assert.match(out, /the table was edited/)
  assert.equal(state.read(S), null)
  assert.equal(state.isActive(S), false)
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
  planning()
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
  assert.match(out.additionalContext, /^tierminator: the user approved 3 tiered tasks and wants them run\./)
  assert.equal(state.isActive(S), true)
  assert.match(out.additionalContext, /subagent_type "tierminator:sonnet-medium", description "T01: Task 1", and as its prompt exactly the/)
  assert.ok(out.additionalContext.includes(`as its prompt exactly the 3 lines inside this fence, without the fence lines:\n\`\`\`\nTasks file: ${TASKS_FILE()}\nPlan: ${s.planId}\nTask: T01\n\`\`\`\n`))
  assert.match(out.additionalContext, /Do not implement the plan yourself/)
})

test('a task asking for sonnet/xhigh is shown, saved and dispatched as opus/medium', () => {
  planning()
  const text = planText([task(1, { effort: 'xhigh' }), task(2)])
  const file = writePlanFile(text)
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(text, file)).stdout, '', 'not denied')
  assert.ok(fs.readFileSync(file, 'utf8').includes('| T01 | Task 1 | opus | medium |'))
  const out = hook('h3-post-approval.js', exitPost(text)).json.hookSpecificOutput.additionalContext
  assert.match(out, /subagent_type "tierminator:opus-medium", description "T01: Task 1"/)
  const s = state.read(S)
  assert.deepEqual([s.tasks[0].model, s.tasks[0].effort, s.current.tier], ['opus', 'medium', 'opus-medium'])
})

test('H3 saves the plan beside the state when there is no plan file, and runs it from there', () => {
  planning()
  hook('h3-post-approval.js', exitPost(VALID))
  const s = state.read(S)
  const saved = state.fileFor(S).replace(/\.json$/, '.plan.md')
  assert.equal(s.planFile, saved)
  assert.equal(fs.readFileSync(saved, 'utf8'), VALID)
  assert.equal(s.tasksFile, state.fileFor(S).replace(/\.json$/, '.plan.tasks.json'))
  assert.deepEqual(JSON.parse(fs.readFileSync(s.tasksFile, 'utf8')).tasks, parsePlan(VALID).tasks)
  assert.equal(s.tasksHash, null)
})

test('approval with a dirty tree starts nothing, deactivates and names /tierminator:execute with the plan path', () => {
  planning()
  const repo = makeRepo(path.join(dir, 'repo'))
  fs.writeFileSync(path.join(repo, 'dirty.txt'), 'x')
  const file = writePlanFile(VALID)
  const out = hook('h3-post-approval.js', { ...exitPost(VALID), cwd: repo }).json.hookSpecificOutput.additionalContext
  assert.match(out, /cannot run here: the working tree has uncommitted changes \(dirty\.txt\)/)
  assert.ok(out.includes(`then to type /tierminator:execute "${file}".`))
  assert.ok(!out.includes('Call the Agent tool'))
  assert.equal(state.read(S), null)
  assert.equal(state.isActive(S), false)
})

test('approval runs the plan only after /tierminator:plan: H3 does nothing outside the planning phase', () => {
  writePlanFile(VALID)
  assert.equal(hook('h3-post-approval.js', exitPost(VALID)).stdout, '', 'no state')
  state.write(S, approvedState({ phase: 'complete' }))
  assert.equal(hook('h3-post-approval.js', exitPost(VALID)).stdout, '', 'an ended run')
  assert.equal(state.read(S).phase, 'complete')
})

test('H2 denies a tiered plan outside a Git repository or with a dirty tree, without counting it', () => {
  const plain = path.join(dir, 'plain')
  fs.mkdirSync(plain)
  const file = writePlanFile(VALID)
  const out = hook('h2-gate-exit-plan.js', exitPre(VALID, file, plain)).json.hookSpecificOutput
  assert.equal(out.permissionDecision, 'deny')
  assert.match(out.permissionDecisionReason, /cannot run yet: it is not inside a Git repository/)
  assert.match(out.permissionDecisionReason, /Do not call ExitPlanMode again until it is fixed/)
  assert.equal(fs.readFileSync(file, 'utf8'), VALID, 'the block is not moved')

  const repo = makeRepo(path.join(dir, 'repo'))
  fs.writeFileSync(path.join(repo, 'README.md'), 'changed\n')
  for (let i = 0; i < 5; i++) {
    const again = hook('h2-gate-exit-plan.js', exitPre(VALID, file, repo)).json.hookSpecificOutput
    assert.match(again.permissionDecisionReason, /uncommitted changes \(README\.md\)/, 'never passed through')
  }
  assert.equal(state.read(S), null, 'not counted as a denial')
})

// ---- H2: task sizing ---------------------------------------------------------------

const BIG = task(2, { title: 'Wire it in and test it' })
const FLAGGED = planText([task(1), BIG])
const denyReason = r => r.json?.hookSpecificOutput?.permissionDecisionReason

test('H2 denies a plan with a flagged task, and lets it through after a Keep line is added', () => {
  planning()
  const file = writePlanFile(FLAGGED)
  const first = hook('h2-gate-exit-plan.js', exitPre(FLAGGED, file))
  assert.equal(first.json.hookSpecificOutput.permissionDecision, 'deny')
  const reason = denyReason(first)
  assert.match(reason, /some tasks may be too large for one worker/)
  assert.match(reason, /- T02: has "and", "then" or ";" in its title/)
  assert.ok(!reason.includes('- T01:'))
  assert.equal(state.read(S).sizingReviews, 1)
  assert.equal(fs.readFileSync(file, 'utf8'), FLAGGED, 'the block is not moved by a review')

  const kept = FLAGGED + '\nKeep T02: the wiring and its test are one change.\n'
  fs.writeFileSync(file, kept)
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(kept, file)).stdout, '')
  assert.ok(fs.existsSync(TASKS_FILE()), 'the block is moved')
})

test('H2 lets an unchanged flagged plan through after two reviews', () => {
  planning()
  const file = writePlanFile(FLAGGED)
  for (let i = 1; i <= 2; i++) {
    assert.equal(hook('h2-gate-exit-plan.js', exitPre(FLAGGED, file)).json.hookSpecificOutput.permissionDecision, 'deny')
    assert.equal(state.read(S).sizingReviews, i)
  }
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(FLAGGED, file)).stdout, '')
  assert.ok(fs.existsSync(TASKS_FILE()))
})

test('H2 passes a clean plan on the first call', () => {
  planning()
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(VALID, writePlanFile(VALID))).stdout, '')
  assert.equal(state.read(S).sizingReviews, undefined)
})

test('H2 sizing reviews do not count toward the invalid-block denials', () => {
  planning({ denials: 1 })
  const file = writePlanFile(FLAGGED)
  hook('h2-gate-exit-plan.js', exitPre(FLAGGED, file))
  assert.equal(state.read(S).denials, 1)
  assert.equal(state.read(S).sizingReviews, 1)
  hook('h2-gate-exit-plan.js', exitPre(NO_BLOCK, writePlanFile(NO_BLOCK)))
  assert.equal(state.read(S).denials, 2)
  assert.equal(state.read(S).sizingReviews, 1)
})

test('H2 reviews a resubmitted plan whose block is already a table, with the tasks it loaded', () => {
  planning({ sizingReviews: 2 })
  const file = writePlanFile(FLAGGED)
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(FLAGGED, file)).stdout, '')
  const withTable = fs.readFileSync(file, 'utf8')
  assert.ok(withTable.includes('tierminator:tasks'))
  planning()
  const out = hook('h2-gate-exit-plan.js', exitPre('stale', file))
  assert.match(denyReason(out), /- T02: /)
  assert.equal(state.read(S).sizingReviews, 1)
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
  planning()
  writePlanFile(VALID)
  hook('h3-post-approval.js', exitPost(INVALID))
  assert.equal(state.read(S).tasks.length, 3)
})

test('H3 loads the tasks from the tasks file H2 wrote and records it', () => {
  planning()
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
  planning()
  const out = hook('h3-post-approval.js', exitPost(VALID)).json.hookSpecificOutput.additionalContext
  assert.match(out, /tasks could not be loaded, so nothing will run/)
  assert.match(out, /has changed since its table was written/)
  assert.match(out, /Do not implement the plan yourself/)
  assert.ok(!out.includes('Your next action'))
  assert.equal(state.read(S), null)
  assert.equal(state.isActive(S), false)
})

test('H3 uses tool_response.plan over a stale tool_input.plan', () => {
  planning()
  hook('h3-post-approval.js', { ...exitPost(VALID), tool_input: { plan: INVALID } })
  assert.equal(state.read(S).tasks.length, 3)
})

test('H3 falls back to the plan file when tool_response has no plan text', () => {
  planning()
  writePlanFile(VALID)
  const input = exitPost(undefined)
  hook('h3-post-approval.js', input)
  assert.equal(state.read(S).tasks.length, 3)
})

test('H3 skips agent plans and subagent calls', () => {
  planning()
  const agentPlan = exitPost(VALID)
  agentPlan.tool_response.isAgent = true
  assert.equal(hook('h3-post-approval.js', agentPlan).stdout, '')
  assert.equal(hook('h3-post-approval.js', exitPost(VALID, { agent_id: 'a1' })).stdout, '')
  assert.equal(state.read(S).phase, 'planning')
})

test('H3 on the opt-out line says nothing, ends planning and deactivates', () => {
  planning()
  const r = hook('h3-post-approval.js', exitPost(`# Plan\n\n${OPT_OUT}\n`))
  assert.equal(r.stdout, '')
  assert.equal(state.read(S), null)
  assert.equal(state.isActive(S), false)
})

test('H3 on an invalid plan (after the denial cap) runs it untiered and says so', () => {
  planning()
  const r = hook('h3-post-approval.js', exitPost(NO_BLOCK))
  assert.match(r.json.hookSpecificOutput.additionalContext, /will not run as tiered tasks/)
  assert.equal(state.read(S), null)
  assert.equal(state.isActive(S), false)
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

test('H3 does not claim a launch when the plan cannot be saved', () => {
  // There is no plan file, and a directory stands where the plan would be saved beside the state.
  planning()
  fs.mkdirSync(state.fileFor(S).replace(/\.json$/, '.plan.md'), { recursive: true })
  const r = hook('h3-post-approval.js', exitPost(VALID))
  assert.equal(r.status, 0)
  assert.match(r.json.hookSpecificOutput.additionalContext, /could not be saved/)
  assert.ok(!r.json.hookSpecificOutput.additionalContext.includes('Call the Agent tool'))
  assert.equal(state.read(S), null)
  assert.equal(state.isActive(S), false)
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
  agent_type: `tierminator:${state.read(S).current.tier}`,
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
    [{ subagent_type: 'tierminator:sonnet-medium' }, /runs on tierminator:sonnet-low, not tierminator:sonnet-medium/],
    [{ prompt: 'Do T01 please' }, /prompt is not the expected one/],
  ]) {
    const out = hook('h4-dispatch.js', agentPre(expected(over)), ['pre']).json.hookSpecificOutput
    assert.equal(out.permissionDecision, 'deny')
    assert.match(out.permissionDecisionReason, why)
    assert.match(out.permissionDecisionReason, /subagent_type "tierminator:sonnet-low"/)
    assert.equal(state.read(S).current.inFlight, false)
  }
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  const again = hook('h4-dispatch.js', agentPre(expected()), ['pre']).json.hookSpecificOutput
  assert.match(again.permissionDecisionReason, /T01 is already running/)
})

test('H4 pre leaves other agent types alone, and refuses tierminator agents when no run is in progress', () => {
  startTestRun()
  assert.equal(hook('h4-dispatch.js', agentPre({ subagent_type: 'Explore', prompt: 'look' }), ['pre']).stdout, '')
  state.remove(S)
  const out = hook('h4-dispatch.js', agentPre({ subagent_type: 'tierminator:sonnet-low', prompt: 'x', run_in_background: false }), ['pre'])
  assert.match(out.json.hookSpecificOutput.permissionDecisionReason, /no tierminator run is in progress\. Tell the user/)
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
  assert.match(s.notice, /^tierminator: T01 done \(commit [0-9a-f]{7}, sonnet-low\)\. Call the Agent tool now with subagent_type "tierminator:sonnet-medium"/)
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
  assert.match(s.notice, /T01 done/)
})

// ---- a hand-back is judged by H1 when it arrives -----------------------------------------

const STOP = { session_id: S, stop_hook_active: false }
const handBackPrompt = (id, text) => `<agent-message from="${id}">\n  ${text.split('\n').join('\n  ')}\n</agent-message>`
const h1Prompt = (prompt, extra = {}) => hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt, ...extra })

test('H1 judges a worker\'s hand-back when it arrives and gives Claude the next dispatch in that turn', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  const sha = workerCommits('T01')
  const out = h1Prompt(handBackPrompt('agent-abc', report('DONE', sha))).stdout
  assert.match(out, /T01 done \(commit [0-9a-f]{7}, sonnet-low\)\. Call the Agent tool now with subagent_type "tierminator:sonnet-medium"/)
  assert.match(out, /Task: T02/)
  const s = state.read(S)
  assert.deepEqual(s.done.map(d => d.id), ['T01'])
  assert.equal(s.current.inFlight, false)
  assert.equal(s.current.index, 1)
  assert.equal(s.notice, null)
  assert.deepEqual(s.handedBack, ['agent-abc'])
  assert.equal(s.spendLines.length, 1)
})

test('H1 retries a task one tier up when the hand-back reports FAILED', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  const out = h1Prompt(handBackPrompt('agent-abc', report('FAILED', 'NONE', 'tests fail'))).stdout
  assert.match(out, /T01 failed at sonnet-low: tests fail\./)
  assert.match(out, /subagent_type "tierminator:sonnet-medium"/)
  const s = state.read(S)
  assert.equal(s.done.length, 0)
  assert.equal(s.current.index, 0)
  assert.equal(s.current.tier, 'sonnet-medium')
  assert.equal(s.current.inFlight, false)
  assert.deepEqual(s.handedBack, ['agent-abc'])
})

test('H1 reads a hand-back with no STATUS block from the worker transcript', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  const sha = workerCommits('T01')
  const main = path.join(dir, 'main.jsonl')
  const subagents = path.join(dir, 'main', 'subagents')
  fs.mkdirSync(subagents, { recursive: true })
  const line = o => JSON.stringify(o) + '\n'
  fs.writeFileSync(
    path.join(subagents, 'agent-abc123.jsonl'),
    line({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'SubagentHandback', input: { message: report('DONE', sha) } }] } }) +
      line({ type: 'assistant', message: { content: [{ type: 'text', text: 'Task complete.' }] } })
  )
  const out = h1Prompt('<agent-message from="abc123">Report delivered.</agent-message>', { transcript_path: main }).stdout
  assert.match(out, /T01 done/)
  assert.deepEqual(state.read(S).done.map(d => d.id), ['T01'])
  assert.deepEqual(state.read(S).handedBack, ['abc123'])
})

test('H1 delivers the notice H4 already left for a hand-back, once, and does not judge again', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  hook('h4-dispatch.js', subStop(report('DONE', workerCommits('T01'))), ['stop'])
  const judged = state.read(S)
  assert.ok(judged.notice)
  const out = h1Prompt(handBackPrompt('agent-abc', report('DONE', 'NONE'))).stdout
  assert.match(out, /T01 done .*Call the Agent tool now/)
  const s = state.read(S)
  assert.equal(s.notice, null)
  assert.deepEqual(s.done, judged.done)
  assert.equal(s.spendLines.length, judged.spendLines.length)
  assert.equal(s.handedBack, undefined)
  assert.equal(h1Prompt(handBackPrompt('agent-abc', report('DONE', 'NONE'))).stdout, '')
})

test('H1 prints nothing for a hand-back when no attempt is in flight', () => {
  startTestRun()
  const before = state.read(S)
  assert.equal(h1Prompt(handBackPrompt('agent-abc', report('DONE', 'NONE'))).stdout, '')
  assert.deepEqual(state.read(S), before)
})

test('H4 stop ignores a worker whose hand-back H1 already judged, so the next task is left alone', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  h1Prompt(handBackPrompt('agent-abc', report('DONE', workerCommits('T01'))))
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  const before = state.read(S)
  assert.equal(before.current.inFlight, true)
  assert.equal(before.current.index, 1)
  hook('h4-dispatch.js', subStop(report('DONE', 'NONE'), { agent_id: 'agent-abc' }), ['stop'])
  assert.deepEqual(state.read(S), before)
})

test('H5 stop after H1 judged a hand-back blocks with the dispatch, and is silent while the next task is in flight', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  h1Prompt(handBackPrompt('agent-abc', report('DONE', workerCommits('T01'))))
  assert.equal(state.read(S).notice, null)
  const blocked = hook('h5-guard.js', STOP, ['stop']).json
  assert.equal(blocked.decision, 'block')
  assert.match(blocked.reason, /Call the Agent tool now with subagent_type "tierminator:sonnet-medium"/)
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  assert.equal(state.read(S).current.inFlight, true)
  assert.equal(hook('h5-guard.js', STOP, ['stop']).stdout, '')
})

test('a background task\'s next step comes with its "finished" notification, and the stop in between is not blocked', () => {
  // The order in every live run: launch (async), the hand-back, Claude's turn ends, SubagentStop, then
  // the "finished" notification.
  startTestRun({ planFile: path.join(dir, 'plan.md') })
  const call = expected()
  hook('h4-dispatch.js', agentPre(call), ['pre'])
  hook('h4-dispatch.js', agentPost(call, { tool_response: { isAsync: true, status: 'async_launched' } }), ['post'])
  assert.equal(state.read(S).current.background, true)
  hook('h4-dispatch.js', subStop(report('DONE', workerCommits('T01'))), ['stop'])
  assert.deepEqual([!!state.read(S).notice, state.read(S).noticeByNotification], [true, true])

  const stop = hook('h5-guard.js', { session_id: S, stop_hook_active: false }, ['stop'])
  assert.equal(stop.json.decision, undefined, 'no block, so no "Stop hook error"')
  assert.match(stop.json.systemMessage, /^tierminator: T01 on sonnet-low done/, 'the spend line still shows')
  assert.ok(state.read(S).notice, 'the notice waits for the notification')

  const arrived = hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: '<task-notification>done</task-notification>' }).stdout
  assert.match(arrived, /T01 done .*Call the Agent tool now with subagent_type "tierminator:sonnet-medium"/)
  assert.deepEqual([state.read(S).notice, state.read(S).noticeByNotification], [null, false])
})

// ---- one hook judges each attempt: the hand-back (H1) and SubagentStop (H4) claim it --------

// Runs a hook script without waiting for it, so two hooks can run at once. Resolves to {status, stdout}.
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
// A background attempt of T01, launched and in flight. Returns the state.
function backgroundAttempt() {
  startTestRun({ planFile: path.join(dir, 'plan.md') })
  const call = expected()
  hook('h4-dispatch.js', agentPre(call), ['pre'])
  hook('h4-dispatch.js', agentPost(call, { tool_response: { isAsync: true, status: 'async_launched', agentId: 'worker-1' } }), ['post'])
  return state.read(S)
}
const attemptRows = () => telemetry.read(path.join(dir, 'plan.telemetry.jsonl')).filter(r => r.kind === 'attempt')
const noticesIn = outputs => (outputs.join('\n').match(/tierminator: T01 (done|failed)/g) ?? []).length
const handBackInput = text => ({ session_id: S, permission_mode: 'default', prompt: handBackPrompt('worker-1', text) })

test('a hand-back, then its SubagentStop: H1 judges the attempt once and H4 stands down', () => {
  backgroundAttempt()
  const sha = workerCommits('T01')
  const stopInput = subStop(report('DONE', sha))
  const h1 = hook('h1-plan-rules.js', handBackInput(report('DONE', sha))).stdout
  const h4 = hook('h4-dispatch.js', stopInput, ['stop']).stdout
  const s = state.read(S)
  assert.deepEqual(s.done.map(d => d.id), ['T01'])
  assert.equal(s.current.index, 1)
  assert.equal(s.notice, null)
  assert.equal(attemptRows().length, 1)
  assert.equal(noticesIn([h1, h4]), 1)
  assert.match(h1, /T01 done/)
})

test('a SubagentStop, then its hand-back: H4 judges the attempt once and H1 only gives the notice', () => {
  backgroundAttempt()
  const sha = workerCommits('T01')
  const h4 = hook('h4-dispatch.js', subStop(report('DONE', sha)), ['stop']).stdout
  const h1 = hook('h1-plan-rules.js', handBackInput(report('DONE', sha))).stdout
  const s = state.read(S)
  assert.deepEqual(s.done.map(d => d.id), ['T01'])
  assert.equal(s.current.index, 1)
  assert.deepEqual([s.notice, s.noticeByNotification], [null, false])
  assert.equal(attemptRows().length, 1)
  assert.equal(noticesIn([h1, h4]), 1)
  assert.match(h1, /T01 done/)
})

test('a hand-back and its SubagentStop at once: a DONE attempt is judged once and its notice given once', async () => {
  backgroundAttempt()
  const sha = workerCommits('T01')
  const outs = await Promise.all([
    hookAsync('h1-plan-rules.js', handBackInput(report('DONE', sha))),
    hookAsync('h4-dispatch.js', subStop(report('DONE', sha)), ['stop']),
  ])
  const s = state.read(S)
  assert.equal(s.phase, 'running')
  assert.deepEqual(s.done.map(d => [d.id, d.attempts]), [['T01', 1]])
  assert.equal(s.current.index, 1)
  assert.equal(s.current.attempt, 1)
  assert.equal(s.notice, null)
  assert.equal(attemptRows().length, 1)
  assert.equal(noticesIn(outs.map(o => o.stdout)), 1)
})

test('a hand-back and its SubagentStop at once: a FAILED attempt is reset and retried once, with no halt', async () => {
  const before = backgroundAttempt()
  workerCommits('T01')
  const failed = report('FAILED', 'NONE', 'tests fail')
  const outs = await Promise.all([
    hookAsync('h1-plan-rules.js', handBackInput(failed)),
    hookAsync('h4-dispatch.js', subStop(failed), ['stop']),
  ])
  const s = state.read(S)
  assert.equal(s.phase, 'running', s.halt?.reason)
  assert.equal(s.done.length, 0)
  assert.equal(s.current.index, 0)
  assert.equal(s.current.attempt, 2)
  assert.equal(s.current.tier, 'sonnet-medium')
  assert.deepEqual(s.current.tried, ['sonnet-low'])
  assert.equal(s.notice, null)
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD'), before.current.head, 'the failed attempt was reset')
  assert.equal(attemptRows().length, 1)
  assert.equal(noticesIn(outs.map(o => o.stdout)), 1)
})

// The two tests above start both hooks at once, which only sometimes overlaps them, and a second reset to
// the same commit succeeds, so on their own they pass with or without the claim. These hold the claim for one
// hook and run the other on a FAILED attempt: without the claim the second hook would reset, record an
// attempt and write the state again (the double settle behind the "reset failed" halts).
test('H1 holds the claim on a FAILED attempt: H4\'s stop resets nothing, records nothing and writes nothing', () => {
  const s = backgroundAttempt()
  const worker = workerCommits('T01')
  assert.equal(state.claimAttempt(S, state.attemptKey(s)), true, 'H1 claims the attempt')
  const before = state.read(S)
  const out = hook('h4-dispatch.js', subStop(report('FAILED', 'NONE', 'tests fail')), ['stop'])
  assert.equal(out.stdout, '')
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD'), worker, 'the failed attempt was not reset by the losing hook')
  assert.deepEqual(state.read(S), before, 'the losing hook wrote no state')
  assert.equal(attemptRows().length, 0, 'the losing hook recorded no attempt')
})

test('H4 holds the claim on a FAILED attempt: H1\'s hand-back resets nothing, records nothing and writes no judgment', async () => {
  const s = backgroundAttempt()
  const worker = workerCommits('T01')
  assert.equal(state.claimAttempt(S, state.attemptKey(s)), true, 'H4 claims the attempt')
  const before = state.read(S)
  const out = await hookAsync('h1-plan-rules.js', handBackInput(report('FAILED', 'NONE', 'tests fail')))
  assert.equal(out.stdout, '', 'H4 left no notice, so H1 has nothing to give')
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD'), worker, 'the failed attempt was not reset by the losing hook')
  assert.deepEqual(state.read(S), before, 'the losing hook wrote no state')
  assert.equal(attemptRows().length, 0, 'the losing hook recorded no attempt')
})

test('when H4 claimed the attempt first, H1 waits for H4\'s saved notice, prints it and clears it', async () => {
  const s = backgroundAttempt()
  assert.equal(state.claimAttempt(S, state.attemptKey(s)), true, 'H4 claims the attempt')
  const h1 = hookAsync('h1-plan-rules.js', handBackInput(report('DONE', 'NONE')))
  await new Promise(resolve => setTimeout(resolve, 1000))
  const judged = {
    ...s,
    done: [{ id: 'T01', tier: 'sonnet-low', commit: 'abc1234', attempts: 1 }],
    current: { ...s.current, index: 1, inFlight: false },
    notice: 'tierminator: T01 done (judged by H4).',
    noticeByNotification: true,
  }
  state.write(S, judged)
  assert.equal((await h1).stdout, 'tierminator: T01 done (judged by H4).\n')
  const after = state.read(S)
  assert.deepEqual([after.notice, after.noticeByNotification], [null, false])
  assert.deepEqual(after.done, judged.done, 'H1 judged nothing')
  assert.equal(after.handedBack, undefined)
  assert.equal(attemptRows().length, 0, 'H1 recorded no attempt')
})

// ---- a judged attempt whose state cannot be saved ends the run with a message ------------------

// NODE_OPTIONS treats a backslash inside quotes as an escape, hence the forward slashes. Each failing save waits
// out the rename retry backoff (about 3 s).
const FAIL_RENAME = path.join(__dirname, 'fixtures', 'fail-rename.js').replace(/\\/g, '/')
const failingSaves = { NODE_OPTIONS: `--require "${FAIL_RENAME}"`, TIERMINATOR_TEST_FAIL_RENAME: `${S}.json` }
const sessionFiles = () => fs.readdirSync(path.join(dir, 'data', 'sessions'))

test('when H1 cannot save a judged hand-back, it stops the run and says how to resume', () => {
  backgroundAttempt()
  const sha = workerCommits('T01')
  const out = hook('h1-plan-rules.js', handBackInput(report('DONE', sha)), [], failingSaves).stdout
  assert.match(out, /the run stopped: T02 was not dispatched because the run's state could not be saved/)
  assert.match(out, /Done: T01 [0-9a-f]{7} \(sonnet-low\)/)
  assert.match(out, /\/tierminator:execute "/)
  assert.equal(state.isActive(S), false)
  assert.equal(sessionFiles().some(name => name.endsWith('.tmp')), false)
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD'), sha)
})

test('when H4 cannot save a judged attempt, the hand-back gives the lost-state note and stops the run', () => {
  backgroundAttempt()
  const sha = workerCommits('T01')
  hook('h4-dispatch.js', subStop(report('DONE', sha)), ['stop'], failingSaves)
  const files = sessionFiles()
  assert.ok(files.includes(`${S}.lost`))
  assert.equal(files.some(name => name.endsWith('.tmp')), false)
  assert.equal(state.read(S).current.inFlight, true)
  const out = hook('h1-plan-rules.js', handBackInput(report('DONE', sha))).stdout
  assert.match(out, /T02 was not dispatched/)
  assert.equal(state.isActive(S), false)
  assert.equal(sessionFiles().includes(`${S}.lost`), false)
  assert.equal(attemptRows().length, 1)
})

test('when H4 cannot save a judged attempt, the finished notification gives the lost-state note and stops the run', () => {
  backgroundAttempt()
  const sha = workerCommits('T01')
  hook('h4-dispatch.js', subStop(report('DONE', sha)), ['stop'], failingSaves)
  assert.ok(sessionFiles().includes(`${S}.lost`))
  assert.equal(state.read(S).current.inFlight, true)
  const out = hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: '<task-notification>done</task-notification>' }).stdout
  assert.match(out, /T02 was not dispatched/)
  assert.equal(state.isActive(S), false)
  assert.equal(sessionFiles().includes(`${S}.lost`), false)
  assert.equal(attemptRows().length, 1)
})

test('H4 post gives the lost-state note on a foreground run', () => {
  startTestRun()
  const call = expected()
  hook('h4-dispatch.js', agentPre(call), ['pre'])
  state.saveLost(S, 'tierminator: lost note')
  const post = hook('h4-dispatch.js', agentPost(call), ['post']).json
  assert.equal(post.hookSpecificOutput.additionalContext, 'tierminator: lost note')
  assert.equal(state.isActive(S), false)
})

test('H1 gives H4\'s notice even when it cannot clear it', () => {
  const s = backgroundAttempt()
  assert.equal(state.claimAttempt(S, state.attemptKey(s)), true, 'H4 claims the attempt')
  state.write(S, {
    ...s,
    done: [{ id: 'T01', tier: 'sonnet-low', commit: 'abc1234', attempts: 1 }],
    current: { ...s.current, index: 1, inFlight: false },
    notice: 'tierminator: T01 done (judged by H4).',
    noticeByNotification: true,
  })
  const out = hook('h1-plan-rules.js', handBackInput(report('DONE', 'NONE')), [], failingSaves).stdout
  assert.equal(out, 'tierminator: T01 done (judged by H4).\n')
})

test('with nothing in flight and no notice, a stop is still blocked', () => {
  startTestRun()
  const out = hook('h5-guard.js', { session_id: S, stop_hook_active: false }, ['stop']).json
  assert.equal(out.decision, 'block')
  assert.match(out.reason, /Call the Agent tool now/)
})

test('a background run: the launch says to wait, the worker stopping moves the run on, and its report delivers the notice', () => {
  startTestRun()
  const call = expected()
  hook('h4-dispatch.js', agentPre(call), ['pre'])
  const launched = hook('h4-dispatch.js', agentPost(call, { tool_response: { isAsync: true, status: 'async_launched' } }), ['post'])
  assert.match(launched.json.hookSpecificOutput.additionalContext, /T01 is running in the background on tierminator:sonnet-low\. End your turn now/)
  assert.equal(hook('h5-guard.js', { session_id: S, stop_hook_active: false }, ['stop']).stdout, '', 'Claude may end its turn')

  const sha = workerCommits('T01')
  hook('h4-dispatch.js', subStop(report('DONE', sha)), ['stop'])
  const arrived = hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: '<agent-message from="w">STATUS: DONE</agent-message>' }).stdout
  assert.match(arrived, /T01 done \(commit [0-9a-f]{7}, sonnet-low\)\. Call the Agent tool now with subagent_type "tierminator:sonnet-medium"/)
  assert.equal(state.read(S).notice, null, 'shown once')
  assert.equal(hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: '<task-notification>x</task-notification>' }).stdout, '')
})

test('a notice is shown on a notification, and by the stop guard, but only once', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  hook('h4-dispatch.js', subStop(report('FAILED', 'NONE', 'tests fail')), ['stop'])
  const note = '<task-notification>x</task-notification>'
  const shown = hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: note }).stdout
  assert.match(shown, /T01 failed at sonnet-low: tests fail\. Reset/)
  assert.equal(hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: note }).stdout, '')

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
  assert.match(first, /T01 done \(commit [0-9a-f]{7}, sonnet-low\)\. Call the Agent tool now with subagent_type "tierminator:sonnet-medium", description "T02: Task 2"/)
  const second = attempt(() => report('DONE', workerCommits('T02')))
  assert.match(second, /subagent_type "tierminator:opus-high"/)
  const last = attempt(() => report('DONE', workerCommits('T03')))
  assert.match(last, /all 3 tasks are done: T01 [0-9a-f]{7} \(sonnet-low\), T02 [0-9a-f]{7} \(sonnet-medium\), T03 [0-9a-f]{7} \(opus-high\)/)
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
  assert.match(out, /T01 failed at sonnet-low: Verify failed: 2 tests\. Reset to [0-9a-f]{7}/)
  assert.match(out, /subagent_type "tierminator:sonnet-medium"/)
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
  assert.match(noPlanLine, /no "Tierminator-Plan: feedfacecafebeef" line/)
})

test('after two retries the run halts and leaves the last attempt in place', () => {
  startTestRun()
  attempt(() => report('FAILED', 'NONE', 'one'))
  attempt(() => report('FAILED', 'NONE', 'two'))
  const out = attempt(() => {
    fs.writeFileSync(path.join(repo, 'last.txt'), 'x')
    return report('FAILED', 'NONE', 'three')
  })
  assert.match(out, /stopped at T01 after 3 attempt\(s\) \(sonnet-low, sonnet-medium, sonnet-high\)\. Reason: three\./)
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

// ---- a worker that stops at its turn limit is resumed, not judged -----------------------

const LIMIT_SUMMARY = 'Agent "T01: x" stopped at its 40-turn limit (partial result; SendMessage to task-id to continue)'
const limitNote = id =>
  `<task-notification>\n<task-id>${id}</task-id>\n<status>completed</status>\n<summary>${LIMIT_SUMMARY}</summary>\n</task-notification>`
// A background launch of the current task, as the Agent tool answers it, with the agent id `id`.
function launchInBackground(id) {
  const call = expected()
  hook('h4-dispatch.js', agentPre(call), ['pre'])
  hook('h4-dispatch.js', agentPost(call, { tool_response: { isAsync: true, status: 'async_launched', agentId: id } }), ['post'])
}
// A worker transcript of `n` assistant messages.
function turnsTranscript(n) {
  const file = path.join(dir, 'turns.jsonl')
  const lines = Array.from({ length: n }, (_, i) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: new Date(Date.now() - (n - i) * 1000).toISOString(),
      message: { id: `m${i}`, model: 'claude-sonnet-5', content: [{ type: 'text', text: '...' }], usage: { input_tokens: 1, output_tokens: 1 } },
    })
  )
  fs.writeFileSync(file, lines.join('\n') + '\n')
  return file
}

test('a background launch records the worker\'s agent id', () => {
  startTestRun()
  launchInBackground('ae454b4')
  assert.deepEqual([state.read(S).current.background, state.read(S).current.agentId], [true, 'ae454b4'])
})

test('a turn-limit notification resumes the worker, and leaves the tree and its commits alone', () => {
  startTestRun({ planFile: path.join(dir, 'plan.md') })
  launchInBackground('ae454b4')
  const sha = workerCommits('T01')
  const out = h1Prompt(limitNote('ae454b4')).stdout
  assert.match(out, /T01 stopped at its turn limit on tierminator:sonnet-low \(resume 1 of 2\)/)
  assert.match(out, /Call the SendMessage tool now with to "ae454b4"/)
  const s = state.read(S)
  assert.deepEqual([s.current.inFlight, s.current.resumePending, s.current.attempt, s.done.length], [true, true, 1, 0])
  assert.deepEqual(s.current.turnLimited, { turns: 40 })
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD'), sha, 'nothing is reset')
  assert.equal(fs.existsSync(path.join(repo, 'T01.txt')), true)
  assert.deepEqual(telemetry.read(telemetryFile()), [], 'a resume is not an attempt')
  assert.equal(h1Prompt(limitNote('ae454b4')).stdout, '', 'a second notification while the resume is due says nothing')
})

test('a turn-limit notification after two resumes halts the run, without a reset, and records the attempt', () => {
  startTestRun({ planFile: path.join(dir, 'plan.md') })
  launchInBackground('ae454b4')
  const sha = workerCommits('T01')
  const saved = state.read(S)
  state.write(S, { ...saved, current: { ...saved.current, resumes: 2 } })
  const out = h1Prompt(limitNote('ae454b4')).stdout
  assert.match(out, /stopped at T01 after 1 attempt\(s\) \(sonnet-low\)\. Reason: T01 reached its turn limit 3 times.*split it/)
  const s = state.read(S)
  assert.equal(s.phase, 'halted')
  assert.equal(s.notice, null)
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD'), sha, 'the worker commit survives')
  assert.equal(fs.existsSync(path.join(repo, 'T01.txt')), true)
  const rows = telemetry.read(telemetryFile()).filter(r => r.kind === 'attempt')
  assert.deepEqual(rows.map(r => [r.task, r.tier, r.agentId, r.outcome]), [['T01', 'sonnet-low', 'ae454b4', 'halt']])
  assert.match(rows[0].reason, /split it/)
})

test('a turn-limit notification for another task is ignored', () => {
  startTestRun()
  launchInBackground('ae454b4')
  const before = state.read(S)
  assert.equal(h1Prompt(limitNote('someone-else')).stdout, '')
  assert.deepEqual(state.read(S), before)
})

test('a turn-limit notification with no recorded agent id takes the notification\'s task-id', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  const out = h1Prompt(limitNote('ae454b4')).stdout
  assert.match(out, /to "ae454b4"/)
  assert.equal(state.read(S).current.agentId, 'ae454b4')
})

test('H4 stop with no report and as many turns as its limit is not judged', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  // sonnet-low has a 40-turn limit.
  hook('h4-dispatch.js', subStop('', { agent_transcript_path: turnsTranscript(40) }), ['stop'])
  const s = state.read(S)
  assert.deepEqual([s.current.inFlight, s.notice, s.current.attempt, s.current.agentId], [true, null, 1, 'worker-1'])
  assert.deepEqual(s.current.turnLimited, { turns: 40 })
})

test('H4 stop with no report and fewer turns than its limit is judged as before', () => {
  startTestRun()
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  hook('h4-dispatch.js', subStop('', { agent_transcript_path: turnsTranscript(39) }), ['stop'])
  assert.equal(state.read(S).current.inFlight, false)
  assert.match(state.read(S).notice, /T01 failed at sonnet-low: the worker returned no STATUS report/)
})

test('a foreground Agent result that stopped at the turn limit gives the resume text', () => {
  startTestRun()
  const call = expected()
  hook('h4-dispatch.js', agentPre(call), ['pre'])
  const response = {
    status: 'completed',
    agentId: 'a1b48e4',
    content: [{ type: 'text', text: 'NOTE: this agent stopped at its 40-turn limit before finishing. It was still calling tools and had produced no report.' }],
  }
  const out = hook('h4-dispatch.js', agentPost(call, { tool_response: response }), ['post']).json.hookSpecificOutput
  assert.equal(out.hookEventName, 'PostToolUse')
  assert.match(out.additionalContext, /T01 stopped at its turn limit.*Call the SendMessage tool now with to "a1b48e4"/s)
  const s = state.read(S)
  assert.deepEqual([s.current.agentId, s.current.resumePending, s.current.inFlight], ['a1b48e4', true, true])
})

// ---- the resume SendMessage is guarded, and the turn stays open until it is sent --------

const sendMessage = (toolInput, extra = {}) => ({ session_id: S, cwd: repo, tool_name: 'SendMessage', tool_input: toolInput, ...extra })
const resumeCall = (over = {}) => ({ to: 'ae454b4', summary: 'T01: resume after the turn limit', message: runLib.RESUME_MESSAGE, ...over })
// A run whose worker stopped at its turn limit: the resume is due.
function resumeDue() {
  startTestRun({ planFile: path.join(dir, 'plan.md') })
  launchInBackground('ae454b4')
  const sha = workerCommits('T01')
  h1Prompt(limitNote('ae454b4'))
  assert.equal(state.read(S).current.resumePending, true)
  return sha
}

test('resume-pre passes the expected SendMessage, clears resumePending and counts the resume', () => {
  resumeDue()
  const r = hook('h4-dispatch.js', sendMessage(resumeCall()), ['resume-pre'])
  assert.equal(r.stdout, '')
  const s = state.read(S)
  assert.deepEqual([s.current.resumePending, s.current.resumes, s.current.inFlight], [false, 1, true])
})

test('resume-pre denies a wrong message and a wrong recipient, repeating the resume', () => {
  resumeDue()
  for (const [over, why] of [
    [{ message: 'carry on' }, /the message is not the expected one/],
    [{ to: 'someone-else' }, /the resume goes to ae454b4, not someone-else/],
  ]) {
    const out = hook('h4-dispatch.js', sendMessage(resumeCall(over)), ['resume-pre']).json.hookSpecificOutput
    assert.equal(out.permissionDecision, 'deny')
    assert.match(out.permissionDecisionReason, /^tierminator: resume refused: /)
    assert.match(out.permissionDecisionReason, why)
    assert.match(out.permissionDecisionReason, /Call the SendMessage tool now with to "ae454b4"/)
    const s = state.read(S)
    assert.deepEqual([s.current.resumePending, s.current.resumes], [true, 0])
  }
})

test('resume-pre denies a resume when none is due, telling Claude to wait', () => {
  startTestRun()
  launchInBackground('ae454b4')
  const out = hook('h4-dispatch.js', sendMessage(resumeCall()), ['resume-pre']).json.hookSpecificOutput
  assert.equal(out.permissionDecision, 'deny')
  assert.match(out.permissionDecisionReason, /resume refused: no resume is due\. Wait for the worker to report\./)
  assert.equal(state.read(S).current.resumes, 0)
})

test('resume-pre leaves SendMessage to another agent alone, and when no run is active', () => {
  startTestRun()
  launchInBackground('ae454b4')
  assert.equal(hook('h4-dispatch.js', sendMessage(resumeCall({ to: 'someone-else' })), ['resume-pre']).stdout, '')
  state.remove(S)
  assert.equal(hook('h4-dispatch.js', sendMessage(resumeCall()), ['resume-pre']).stdout, '')
  state.write(S, { ...runLib.startRun({ tasks: RUN_TASKS, tasksFile: 'x', branch: 'main', planId: PLAN_ID }), cwd: repo, phase: 'halted' })
  assert.equal(hook('h4-dispatch.js', sendMessage(resumeCall()), ['resume-pre']).stdout, '')
})

test('resume-post tells Claude the task is running and to end its turn', () => {
  resumeDue()
  hook('h4-dispatch.js', sendMessage(resumeCall()), ['resume-pre'])
  const out = hook('h4-dispatch.js', sendMessage(resumeCall()), ['resume-post']).json.hookSpecificOutput
  assert.equal(out.hookEventName, 'PostToolUse')
  assert.match(out.additionalContext, /T01 is running in the background on tierminator:sonnet-low\. End your turn now/)
  assert.equal(hook('h4-dispatch.js', sendMessage(resumeCall({ to: 'someone-else' })), ['resume-post']).stdout, '')
})

test('resume-failure halts the run with the reason, and leaves the tree and its commits alone', () => {
  const sha = resumeDue()
  const input = sendMessage(resumeCall(), { error: 'no such agent\nmore' })
  const out = hook('h4-dispatch.js', input, ['resume-failure']).json.hookSpecificOutput
  assert.equal(out.hookEventName, 'PostToolUseFailure')
  assert.match(out.additionalContext, /stopped at T01 after 1 attempt\(s\) \(sonnet-low\)\. Reason: the resume message to the worker failed: no such agent\./)
  const s = state.read(S)
  assert.equal(s.phase, 'halted')
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD'), sha)
  assert.equal(fs.existsSync(path.join(repo, 'T01.txt')), true)
  assert.equal(gitIn(repo, 'status', '--porcelain'), '')
  assert.equal(hook('h4-dispatch.js', { ...input, tool_input: resumeCall({ to: 'x' }) }, ['resume-failure']).stdout, '')
})

test('H5 stop blocks while a resume is due, and allows the stop after resume-pre passed', () => {
  resumeDue()
  const blocked = hook('h5-guard.js', { session_id: S, stop_hook_active: false }, ['stop'])
  assert.equal(blocked.json.decision, 'block')
  assert.match(blocked.json.reason, /T01 stopped at its turn limit.*Call the SendMessage tool now with to "ae454b4"/s)
  assert.equal(state.read(S).phase, 'running')
  hook('h4-dispatch.js', sendMessage(resumeCall()), ['resume-pre'])
  assert.equal(hook('h5-guard.js', { session_id: S, stop_hook_active: false }, ['stop']).stdout, '')
})

test('H5 stop with a resume due abandons the run on the second consecutive stop', () => {
  resumeDue()
  const second = hook('h5-guard.js', { session_id: S, stop_hook_active: true }, ['stop'])
  assert.equal(second.json.decision, undefined)
  assert.equal(state.read(S).phase, 'abandoned')
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
    assert.match(out.permissionDecisionReason, /its subagents do the work, not you. Call the Agent tool now/)
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
  for (const phase of ['halted', 'complete', 'abandoned']) {
    // An ended run's spend is shown once (tested below); after that, H5 has nothing to say.
    state.write(S, { ...state.read(S), phase, spendReported: true, current: { ...state.read(S).current, inFlight: false } })
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
  assert.match(first.json.reason, /subagent_type "tierminator:sonnet-low"/)
  assert.equal(state.read(S).phase, 'running')
  const second = hook('h5-guard.js', { session_id: S, stop_hook_active: true }, ['stop'])
  assert.equal(second.json.decision, undefined, 'the stop is allowed')
  assert.match(second.json.systemMessage, /^tierminator spend \(estimated/, 'with the abandoned run\'s spend')
  assert.equal(state.read(S).phase, 'abandoned')
})

// An unattended session that is drafting: its final message is the plan.
const draftPlanFile = () => path.join(dir, 'plans', 'unattended.md')
const draftingState = (over = {}) => ({ phase: 'drafting', planFile: draftPlanFile(), denials: 0, guardDenials: 0, ...over })
const draftStop = (text, extra = {}, cwd = REPO) =>
  hook(
    'h5-guard.js',
    { session_id: S, cwd, ...(text === null ? {} : { last_assistant_message: text }), ...extra },
    ['stop'],
    { CLAUDE_CONFIG_DIR: dir }
  )

test('H5 pre denies file edits while drafting, counts them, and abandons after the third', () => {
  state.write(S, draftingState())
  for (let i = 1; i <= 3; i++) {
    const out = hook('h5-guard.js', toolPre('Write', { cwd: REPO }), ['pre'], { CLAUDE_CONFIG_DIR: dir }).json.hookSpecificOutput
    assert.equal(out.permissionDecision, 'deny')
    assert.equal(
      out.permissionDecisionReason,
      'tierminator: unattended planning: files cannot be edited until the plan runs. Finish investigating, then end your turn with the complete plan as your final message.'
    )
    assert.equal(state.read(S).guardDenials, i)
  }
  assert.equal(hook('h5-guard.js', toolPre('Write', { cwd: REPO }), ['pre'], { CLAUDE_CONFIG_DIR: dir }).stdout, '')
  assert.equal(state.read(S).phase, 'abandoned')
})

test('H5 stop with a valid plan while drafting saves it and starts the run, even when stop_hook_active', () => {
  for (const extra of [{}, { stop_hook_active: true }]) {
    fs.rmSync(path.join(dir, 'plans'), { recursive: true, force: true })
    state.write(S, draftingState())
    const r = draftStop(VALID, extra)
    assert.equal(fs.readFileSync(draftPlanFile(), 'utf8'), VALID)
    const s = state.read(S)
    assert.equal(s.phase, 'running')
    assert.deepEqual(s.tasks.map(t => t.id), ['T01', 'T02', 'T03'])
    assert.equal(r.json.decision, 'block')
    assert.match(r.json.reason, /Dispatch/)
    assert.match(r.json.reason, /tierminator:sonnet-medium/)
  }
})

test('H5 stop takes the plan from the transcript when there is no last_assistant_message', () => {
  const transcript = path.join(dir, 'transcript.jsonl')
  const entry = (type, text) => JSON.stringify({ type, message: { content: [{ type: 'text', text }] } })
  fs.writeFileSync(transcript, [entry('user', 'plan it'), entry('assistant', VALID)].join('\n') + '\n')
  state.write(S, draftingState())
  const r = draftStop(null, { transcript_path: transcript })
  assert.equal(state.read(S).phase, 'running')
  assert.equal(r.json.decision, 'block')
  assert.equal(fs.readFileSync(draftPlanFile(), 'utf8'), VALID)
})

test('H5 stop with an invalid plan while drafting blocks with the errors and the rules, then abandons on the fourth', () => {
  state.write(S, draftingState())
  const errors = sidecar.resolvePlan(INVALID).errors
  assert.ok(errors.length > 0)
  for (let i = 1; i <= 3; i++) {
    const r = draftStop(INVALID)
    assert.equal(r.json.decision, 'block')
    for (const e of errors) assert.ok(r.json.reason.includes(`- ${e}`), e)
    assert.ok(r.json.reason.includes(RULES))
    assert.equal(state.read(S).denials, i)
    assert.equal(state.read(S).phase, 'drafting')
  }
  const last = draftStop(INVALID)
  assert.equal(last.json.decision, undefined)
  assert.match(last.json.systemMessage, /nothing ran/)
  assert.equal(state.read(S).phase, 'abandoned')
  assert.ok(!fs.existsSync(draftPlanFile()))
})

test('H5 stop with no task block while drafting blocks with the rules', () => {
  state.write(S, draftingState())
  const r = draftStop(NO_BLOCK)
  assert.equal(r.json.decision, 'block')
  assert.ok(r.json.reason.includes(RULES))
  assert.equal(state.read(S).denials, 1)
  const empty = draftStop('')
  assert.equal(empty.json.decision, 'block')
  assert.equal(state.read(S).denials, 2)
})

test('H5 stop with a flagged plan while drafting blocks once with the review text, then runs it', () => {
  state.write(S, draftingState())
  const text = planText([task(1), BIG])
  const r = draftStop(text)
  assert.equal(r.json.decision, 'block')
  assert.match(r.json.reason, /some tasks may be too large for one worker/)
  assert.match(r.json.reason, /- T02: /)
  assert.match(r.json.reason, /then end your turn again with the complete plan as your final message\.$/i)
  assert.ok(!r.json.reason.includes('ExitPlanMode'))
  assert.equal(state.read(S).phase, 'drafting')
  assert.equal(state.read(S).sizingReviews, 1)
  assert.equal(state.read(S).denials, 0)
  assert.ok(!fs.existsSync(draftPlanFile()))

  const kept = text + '\nKeep T02: one change.\n'
  const again = draftStop(kept)
  assert.match(again.json.reason, /Dispatch/)
  assert.equal(state.read(S).phase, 'running')
  assert.equal(fs.readFileSync(draftPlanFile(), 'utf8'), kept)
})

test('H5 stop with an opt-out plan while drafting removes the state and tells Claude to implement it', () => {
  state.write(S, draftingState())
  const r = draftStop(`# Plan\n\n${OPT_OUT}\n`)
  assert.equal(r.json.decision, 'block')
  assert.match(r.json.reason, /Implement it yourself/)
  assert.equal(state.read(S), null)
})

test('H5 stop with a valid plan in a dirty repository removes the state and blocks with the refusal', () => {
  const dirty = makeRepo(path.join(dir, 'dirty'))
  fs.writeFileSync(path.join(dirty, 'wip.txt'), 'x')
  state.write(S, draftingState())
  const r = draftStop(VALID, {}, dirty)
  assert.equal(r.json.decision, 'block')
  assert.match(r.json.reason, /cannot run here/)
  assert.equal(state.read(S), null)
})

test('a harness <task-notification> or <agent-message> during a run does not stop it', () => {
  startTestRun()
  const before = state.read(S)
  for (const prompt of ['<agent-message from="x">report</agent-message>', '<task-notification>x</task-notification>']) {
    assert.equal(hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt }).stdout, '')
  }
  assert.equal(state.isActive(S), true)
  assert.deepEqual(state.read(S), before)
})

test('an ended run makes the session inactive at the next typed prompt, silently', () => {
  startTestRun({ phase: 'complete', spendReported: true })
  assert.equal(hook('h1-plan-rules.js', { session_id: S, permission_mode: 'default', prompt: 'thanks' }).stdout, '')
  assert.equal(state.isActive(S), false)
  assert.equal(state.read(S), null)
})

test('state changes are logged with a timestamp only when TIERMINATOR_DEBUG is set', () => {
  startTestRun()
  const env = { TEMP: dir, TMP: dir, TMPDIR: dir }
  const log = path.join(dir, 'tierminator-debug.log')
  hook('h5-guard.js', toolPre('Edit'), ['pre'], env)
  assert.equal(fs.existsSync(log), false)
  hook('h5-guard.js', toolPre('Edit'), ['pre'], { ...env, TIERMINATOR_DEBUG: '1' })
  hook('h6-cleanup.js', { session_id: S }, ['end'], { ...env, TIERMINATOR_DEBUG: '1' })
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

// ---- the commands: /tierminator:plan, and a typed prompt during a run -----------------------

const typed = (prompt, mode = 'default', cwd = REPO, env = {}) =>
  hook('h1-plan-rules.js', { session_id: S, cwd, permission_mode: mode, prompt }, [], env)
// The note H1 gave: added context when the UI also gets a spend message, else plain text.
const noteOf = r => r.json?.hookSpecificOutput?.additionalContext ?? r.stdout
const ASK_PLAN_MODE = /Call the EnterPlanMode tool now \(load it with ToolSearch first if it is deferred\), then plan the request\./

test('planning is refused, with the reason, where a plan could not run, and nothing is activated', () => {
  state.deactivate(S)
  const refused = (out, reason) => {
    assert.match(out, new RegExp(`^tierminator: planning was not started: ${reason}\\.`))
    assert.match(out, /then to type \/tierminator:plan again\./)
    assert.equal(state.isActive(S), false)
    assert.equal(state.read(S), null)
  }
  const plain = path.join(dir, 'plain')
  fs.mkdirSync(plain)
  refused(typed('/tierminator:plan add a flag', 'default', plain).stdout, 'it is not inside a Git repository')

  const repo = makeRepo(path.join(dir, 'repo'))
  fs.writeFileSync(path.join(repo, 'wip.txt'), 'x')
  refused(typed('/tierminator:plan add a flag', 'default', repo).stdout, 'the working tree has uncommitted changes \\(wip\\.txt\\)')

  const anon = repoWithoutIdentity()
  refused(typed('/tierminator:plan add a flag', 'default', anon.repo, anon.env).stdout, 'Git has no user name and email for this repository, so the tasks cannot commit; set user.name and user.email')

  refused(typed('/tierminator:plan add a flag', 'default', REPO, { PATH: '', Path: '' }).stdout, 'Git is not installed or not on the PATH')

  const inPlanMode = typed('/tierminator:plan add a flag', 'plan', plain).stdout
  assert.ok(!inPlanMode.includes(RULES), 'no rules when planning is refused')
})

test('/tierminator:plan outside plan mode activates, writes phase planning and asks for EnterPlanMode', () => {
  for (const mode of ['default', 'auto', 'acceptEdits']) {
    state.deactivate(S)
    state.remove(S)
    const out = typed('/tierminator:plan add a --verbose flag', mode).stdout
    assert.match(out, /^tierminator: planning started\. Plan the request in plan mode; when the user approves the plan, tierminator runs it as tiered tasks\./, mode)
    assert.match(out, ASK_PLAN_MODE, mode)
    assert.ok(!out.includes(RULES), 'the rules come when plan mode is entered')
    assert.equal(state.isActive(S), true)
    assert.deepEqual(state.read(S), { phase: 'planning', tasks: [], denials: 0, guardDenials: 0 })
  }
  const entered = hook('h1-plan-rules.js', { session_id: S, tool_name: 'EnterPlanMode' }, ['enter'])
  assert.equal(entered.json.hookSpecificOutput.additionalContext, RULES)
  assert.equal(typed('/tierminator:planned x').stdout, '', 'only the exact command')
  state.activate(S)
  planning()
  assert.equal(typed('please /tierminator:plan x', 'plan').stdout, RULES, 'only at the start of the prompt')
})

test('/tierminator:plan inside plan mode emits the rules', () => {
  state.deactivate(S)
  const out = typed('  /tierminator:plan add a --verbose flag', 'plan').stdout
  assert.match(out, /^tierminator: planning started\./)
  assert.ok(!ASK_PLAN_MODE.test(out), 'already in plan mode')
  assert.ok(out.endsWith(RULES))
  assert.equal(state.rulesShown(S), true)
  assert.equal(state.read(S).phase, 'planning')
  assert.equal(planPrompt('more detail'), '', 'shown once')
})

test('/tierminator:plan with no request is refused', () => {
  state.deactivate(S)
  for (const prompt of ['/tierminator:plan', '/tierminator:plan   ']) {
    const out = typed(prompt).stdout
    assert.match(out, /^tierminator: planning was not started: \/tierminator:plan needs a request, for example \/tierminator:plan add a --verbose flag\./)
    assert.equal(state.isActive(S), false)
    assert.equal(state.read(S), null)
  }
})

test('/tierminator:plan says it failed when the flag cannot be written', () => {
  state.deactivate(S)
  const blocker = path.join(dir, 'blocker')
  fs.writeFileSync(blocker, '')
  const out = typed('/tierminator:plan add a flag', 'default', REPO, { CLAUDE_PLUGIN_DATA: path.join(blocker, 'x') })
  assert.match(out.stdout, /^tierminator: planning was not started: its flag file could not be written/)
})

test('the plan skill tells Claude to follow the note into plan mode and gives it the request', () => {
  const skill = fs.readFileSync(path.join(PLUGIN, 'skills', 'plan', 'SKILL.md'), 'utf8')
  assert.match(skill, /if it says to call EnterPlanMode, call it/i)
  assert.match(skill, /\n\$ARGUMENTS\n/)
  assert.match(skill, /do not plan or implement the request/)
})

test('a plan-mode plan made without /tierminator:plan is not tiered, and an inactive session is left alone by every hook', () => {
  state.deactivate(S)
  const file = writePlanFile(INVALID)
  assert.equal(typed('plan a clock', 'plan').stdout, '', 'no rules in plan mode')
  assert.equal(state.isActive(S), false)
  assert.equal(hook('h1-plan-rules.js', { session_id: S, tool_name: 'EnterPlanMode' }, ['enter']).stdout, '')
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(INVALID, file, path.join(dir, 'not-a-repo'))).stdout, '', 'no denial')
  assert.equal(fs.readFileSync(file, 'utf8'), INVALID)
  writePlanFile(VALID)
  assert.equal(hook('h2-gate-exit-plan.js', exitPre(VALID, path.join(dir, 'plan.md'))).stdout, '')
  assert.equal(fs.readFileSync(path.join(dir, 'plan.md'), 'utf8'), VALID, 'the block is not moved')
  assert.equal(hook('h3-post-approval.js', exitPost(VALID)).stdout, '')
  assert.equal(state.read(S), null, 'nothing is saved')

  // A run's state left behind does not wake the hooks either.
  startTestRun()
  state.deactivate(S)
  const call = expected()
  assert.equal(hook('h4-dispatch.js', agentPre({ subagent_type: 'tierminator:opus-high', prompt: 'x', description: 'x' }), ['pre']).stdout, '')
  assert.equal(hook('h4-dispatch.js', agentPost(call), ['post']).stdout, '')
  assert.equal(hook('h5-guard.js', toolPre('Edit'), ['pre']).stdout, '')
  assert.equal(hook('h5-guard.js', { session_id: S, stop_hook_active: false }, ['stop']).stdout, '')
  assert.equal(typed('continue').stdout, '', 'no resume note')
  assert.deepEqual(state.read(S).current.inFlight, false)
})

test('a typed prompt during a run abandons it, deactivates, and names /tierminator:execute', () => {
  startTestRun({ planFile: path.join(dir, 'plan.md') })
  attempt(() => report('DONE', workerCommits('T01')))
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  assert.equal(state.read(S).current.inFlight, true)

  const r = typed('how is it going?', 'default', repo)
  const out = r.json.hookSpecificOutput.additionalContext
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'UserPromptSubmit')
  assert.match(
    r.json.systemMessage,
    /^tierminator: T01 on sonnet-low done: usage unavailable\. .*\ntierminator spend \(estimated.*\n\s+sonnet-low\s/s,
    "the queued line and the stopped run's spend go to the UI"
  )
  assert.match(out, /^tierminator: the run stopped because the user typed a new prompt\./)
  assert.match(out, /Done: T01 [0-9a-f]{7} \(sonnet-low\)\. Not done: T02, T03\./)
  assert.match(out, /T02's worker is still running; whatever it commits or leaves in the working tree stays unchecked/)
  assert.ok(out.includes(`To resume, the user types /tierminator:execute "${path.join(dir, 'plan.md')}".`))
  assert.match(out, /dispatch nothing more\./)
  assert.equal(state.isActive(S), false)
  assert.equal(state.read(S), null)

  const head = gitIn(repo, 'rev-parse', 'HEAD')
  fs.writeFileSync(path.join(repo, 'loose.txt'), 'x')
  const lateStop = { session_id: S, agent_id: 'worker-1', agent_type: 'tierminator:sonnet-medium', hook_event_name: 'SubagentStop' }
  hook('h4-dispatch.js', { ...lateStop, last_assistant_message: report('FAILED', 'NONE', 'x') }, ['stop'])
  assert.equal(gitIn(repo, 'rev-parse', 'HEAD'), head)
  assert.equal(fs.existsSync(path.join(repo, 'loose.txt')), true, 'no reset')
  assert.equal(state.read(S), null)
})

test('a typed prompt between tasks stops the run and says nothing is running', () => {
  startTestRun()
  const out = noteOf(typed('stop please'))
  assert.match(out, /Done: none\. Not done: T01, T02, T03\. To resume/)
  assert.ok(!out.includes('still running'))
  assert.equal(state.isActive(S), false)
})

test('/tierminator:plan during a run stops the run and starts planning', () => {
  startTestRun({ planFile: path.join(dir, 'plan.md') })
  const out = noteOf(typed('/tierminator:plan something else', 'default', repo))
  assert.match(out, /^tierminator: the run stopped because the user typed a new prompt\..*dispatch nothing more\.\n\ntierminator: planning started\./s)
  assert.match(out, ASK_PLAN_MODE)
  assert.equal(state.isActive(S), true)
  assert.equal(state.read(S).phase, 'planning')
})

test('SessionEnd removes the activation flag', () => {
  assert.ok(state.cursor(S), 'activation started the telemetry cursor')
  hook('h6-cleanup.js', { session_id: S, hook_event_name: 'SessionEnd' }, ['end'])
  assert.equal(state.isActive(S), false)
  assert.equal(state.cursor(S), null)
})

test('the plan and execute skills are the only skills, and only the user can run them', () => {
  const skills = fs.readdirSync(path.join(PLUGIN, 'skills')).sort()
  assert.deepEqual(skills, ['execute', 'plan'])
  for (const name of skills) {
    const skill = fs.readFileSync(path.join(PLUGIN, 'skills', name, 'SKILL.md'), 'utf8')
    assert.match(skill, new RegExp(`^---\\r?\\nname: ${name}\\r?\\n`))
    assert.match(skill, /^disable-model-invocation: true$/m)
  }
  const execute = fs.readFileSync(path.join(PLUGIN, 'skills', 'execute', 'SKILL.md'), 'utf8')
  assert.match(execute, /^argument-hint: "\[plan path \| list number\] \[--from Txx\]"$/m)
  const plan = fs.readFileSync(path.join(PLUGIN, 'skills', 'plan', 'SKILL.md'), 'utf8')
  assert.match(plan, /^argument-hint: "<what to plan>"$/m)
})

test('/tierminator:execute never asks for plan mode', () => {
  const file = savedPlan()
  assert.ok(!execute(file).includes('EnterPlanMode'))
})

// ---- /tierminator:execute ----------------------------------------------------------------

const execute = (args, { mode = 'default', cwd = repo, env = {} } = {}) =>
  typed(`/tierminator:execute ${args}`.trimEnd(), mode, cwd, env).stdout
// A saved plan with a raw block at dir/<name>, and a fresh repository for it to run in.
function savedPlan(text = VALID, name = 'plan.md') {
  repo = makeRepo(path.join(dir, 'repo'))
  const file = path.join(dir, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  state.deactivate(S)
  return file
}
const idOf = text => sidecar.hashOf(blockBody(text))
// Has H2 move the plan's block to its tasks file, as it does when Claude submits the plan in an active
// session, and leaves the session inactive again.
function moveBlock(file) {
  state.activate(S)
  hook('h2-gate-exit-plan.js', exitPre(fs.readFileSync(file, 'utf8'), file))
  state.deactivate(S)
  assert.match(fs.readFileSync(file, 'utf8'), /<!-- tierminator:tasks -->/)
}

test('execute runs a saved plan with a raw block: activates, saves the run, and gives the first dispatch', () => {
  const file = savedPlan()
  const out = execute(file)
  const planId = idOf(VALID)
  assert.match(out, /^tierminator: running the plan in .*plan\.md \(3 tiered tasks\)\./)
  assert.ok(out.includes(`as its prompt exactly the 3 lines inside this fence, without the fence lines:\n\`\`\`\nTasks file: ${TASKS_FILE()}\nPlan: ${planId}\nTask: T01\n\`\`\`\n`))
  assert.match(out, /Do not implement the plan yourself/)
  assert.equal(state.isActive(S), true)
  const s = state.read(S)
  assert.deepEqual([s.phase, s.planId, s.cwd, s.branch, s.planFile], ['running', planId, repo, 'main', file])
  assert.equal(fs.readFileSync(TASKS_FILE(), 'utf8'), blockBody(VALID), 'the tasks file is the block')
  assert.equal(fs.readFileSync(file, 'utf8'), VALID, 'the plan file is not rewritten')
  const [start] = telemetry.read(path.join(dir, 'plan.telemetry.jsonl'))
  assert.deepEqual([start.kind, start.planId, start.runId], ['run', planId, s.runId], 'the run start is recorded beside the plan')
})

test('execute runs a plan whose block H2 moved, from its tasks file, with the same plan id', () => {
  const file = savedPlan()
  moveBlock(file)
  execute(file)
  const s = state.read(S)
  assert.equal(s.tasksFile, TASKS_FILE())
  assert.equal(s.planId, idOf(VALID))
  assert.equal(s.tasksHash, idOf(VALID))
})

test('execute skips the tasks already committed for this plan, and the run goes on from there', () => {
  const file = savedPlan()
  const planId = idOf(VALID)
  workerCommits('T01', 'T01.txt', planId)
  workerCommits('T02', 'other.txt', 'ffffffffffffffff') // another plan's T02 does not count
  const out = execute(file)
  assert.match(out, /T01 [0-9a-f]{7} \(earlier run\) is not run again\./)
  assert.match(out, /subagent_type "tierminator:opus-high", description "T02: Task 2"/)
  const s = state.read(S)
  assert.deepEqual([s.current.index, s.done.map(d => [d.id, d.skipped])], [1, [['T01', 'committed']]])

  attempt(() => report('DONE', workerCommits('T02', 'T02.txt', planId)))
  const last = attempt(() => report('DONE', workerCommits('T03', 'T03.txt', planId)))
  assert.match(last, /all 3 tasks are done.*T01 [0-9a-f]{7} \(earlier run\), T02 [0-9a-f]{7} \(opus-high\), T03 [0-9a-f]{7} \(sonnet-medium\)/)
})

test('execute refuses when committed tasks have a gap, and --from chooses the start', () => {
  const file = savedPlan()
  workerCommits('T02', 'T02.txt', idOf(VALID))
  const gap = execute(file)
  assert.match(gap, /was not started: T02 is already committed on this branch, but T01 is not\..*--from/)
  assert.equal(state.isActive(S), false)
  assert.equal(state.read(S), null)

  const from = execute(`${file} --from t03`)
  assert.match(from, /T01 \(skipped by --from\), T02 [0-9a-f]{7} \(earlier run\) are not run again\./)
  assert.match(from, /description "T03: Task 3"/)
  assert.equal(state.read(S).current.index, 2)
})

test('execute reports a plan that is already done, and a --from it cannot use', () => {
  const file = savedPlan()
  for (const id of ['T01', 'T02', 'T03']) workerCommits(id, `${id}.txt`, idOf(VALID))
  assert.match(execute(file), /every task in .* is already committed on this branch: T01 [0-9a-f]{7} \(earlier run\), .*Nothing was run\./)
  assert.equal(state.read(S), null)
  assert.match(execute(`${file} --from T09`), /the plan has no task T09; its tasks are T01 to T03/)
  assert.match(execute(`${file} --from`), /--from needs a task id/)
})

test('execute takes quoted paths with spaces, unquoted ones, ~ and paths relative to cwd', () => {
  const file = savedPlan(VALID, path.join('my plans', 'plan one.md'))
  assert.match(execute(`"${file}"`), /running the plan in /)
  state.remove(S)
  assert.match(execute(file), /running the plan in /)
  state.remove(S)
  assert.match(execute(`'../my plans/plan one.md' --from T02`), /running the plan in /)
  assert.equal(state.read(S).planFile, file)
  state.remove(S)
  const home = { USERPROFILE: dir, HOME: dir }
  assert.match(execute(`"~/my plans/plan one.md"`, { env: home }), /running the plan in /)
})

test('execute runs a plain or opted-out plan without tierminator, inactive', () => {
  for (const [text, why] of [[NO_BLOCK, /it has no tierminator task table or task block/], [`# Plan\n\n${OPT_OUT}\n`, /it says "Tiered execution: off"/]]) {
    const file = savedPlan(text)
    const out = execute(file)
    assert.match(out, /is not a tiered plan/)
    assert.match(out, why)
    assert.match(out, /Read it and implement it in this session as usual/)
    assert.equal(state.isActive(S), false)
    assert.equal(state.read(S), null)
    fs.rmSync(repo, { recursive: true, force: true })
  }
})

test('execute refuses a plan whose tasks cannot be loaded, and an invalid block', () => {
  const file = savedPlan()
  moveBlock(file)
  fs.appendFileSync(TASKS_FILE(), ' ')
  const changed = execute(file)
  assert.match(changed, /cannot run: its tasks cannot be loaded: .*has changed since its table was written/)
  assert.match(changed, /do not implement it yourself/)

  const bad = path.join(dir, 'bad.md')
  fs.writeFileSync(bad, INVALID)
  assert.match(execute(bad), /the task block in .*bad\.md is not valid, so the plan cannot run: /)
  assert.equal(state.isActive(S), false)
})

test('execute refuses in plan mode, for an unreadable file, and where Git cannot run it', () => {
  const file = savedPlan()
  assert.match(execute(file, { mode: 'plan' }), /cannot be executed in plan mode.*leave plan mode/)
  assert.match(execute(path.join(dir, 'nope.md')), /the plan file .*nope\.md cannot be read/)
  fs.writeFileSync(path.join(repo, 'wip.txt'), 'x')
  const dirty = execute(file)
  assert.match(dirty, /cannot run here: the working tree has uncommitted changes \(wip\.txt\)/)
  assert.ok(dirty.includes(`then to type /tierminator:execute "${file}".`))
  assert.equal(state.isActive(S), false)
})

test('/tierminator:execute during a run stops that run first, then runs the plan', () => {
  const file = savedPlan()
  const old = path.join(dir, 'old.md')
  state.write(S, { ...runLib.startRun({ tasks: RUN_TASKS, tasksFile: 'x', branch: 'main', planId: PLAN_ID }), cwd: repo, planFile: old, spendReported: true })
  state.activate(S)
  const out = execute(file)
  assert.match(out, /^tierminator: the run stopped because the user typed a new prompt\./)
  assert.ok(out.includes(`To resume, the user types /tierminator:execute "${old}".`))
  assert.match(out, /\n\ntierminator: running the plan in .*plan\.md \(3 tiered tasks\)\./)
  assert.equal(state.read(S).planId, idOf(VALID))
  assert.equal(state.isActive(S), true)
})

test('execute with no path lists recent tierminator plans, newest first', () => {
  savedPlan()
  const config = path.join(dir, 'config')
  const plans = path.join(config, 'plans')
  fs.mkdirSync(plans, { recursive: true })
  const put = (name, text, minutesAgo) => {
    const file = path.join(plans, name)
    fs.writeFileSync(file, text)
    const t = new Date(Date.now() - minutesAgo * 60000)
    fs.utimesSync(file, t, t)
  }
  put('older.md', planText([task(1)]).replace('# Plan', '# Older plan'), 30)
  put('plain.md', NO_BLOCK, 1)
  put('newer.md', VALID.replace('# Plan', '# Newer plan'), 5)
  const out = execute('', { env: { CLAUDE_CONFIG_DIR: config } })
  assert.match(out, /^tierminator: no plan path was given\. Recent tierminator plans in /)
  assert.match(out, /\n1\. .*newer\.md: "Newer plan", 3 tasks, changed .*\n2\. .*older\.md: "Older plan", 1 tasks, changed/)
  assert.ok(!out.includes('plain.md'))
  assert.match(out, /ask which to run: they type \/tierminator:execute with its number \(for example \/tierminator:execute 1\) or its path/)
  assert.equal(state.isActive(S), false)

  const empty = execute('', { env: { CLAUDE_CONFIG_DIR: path.join(dir, 'none') } })
  assert.match(empty, /there are no tierminator plans in .*plansDirectory/)
})

test('execute with a number runs that plan from the list this session was shown', () => {
  savedPlan()
  const config = path.join(dir, 'config')
  const plans = path.join(config, 'plans')
  fs.mkdirSync(plans, { recursive: true })
  const first = path.join(plans, 'first.md')
  fs.writeFileSync(first, VALID)
  const env = { CLAUDE_CONFIG_DIR: config }

  // No list shown yet in this session: the number is not guessed; the list is shown instead.
  const early = execute('1', { env })
  assert.match(early, /^tierminator: there is no plan list in this session yet to pick number 1 from\. Recent tierminator plans/)
  assert.equal(state.read(S), null, 'nothing started')

  execute('', { env })
  // A newer plan appears after the list was shown; "1" still means the plan that was listed first.
  const later = path.join(plans, 'later.md')
  fs.writeFileSync(later, VALID.replace('Task 2', 'Task two'))
  const out = execute('1. --from T02', { env })
  assert.match(out, /^tierminator: running the plan in .*first\.md \(3 tiered tasks\)\./)
  assert.match(out, /T01 \(skipped by --from\) is not run again\./)
  assert.equal(state.read(S).planFile, first)

  // A number the list did not have is refused, with the list shown again (and saved again).
  state.remove(S)
  const missing = execute('3', { env })
  assert.match(missing, /^tierminator: the list had no plan number 3\. Recent tierminator plans/)
  assert.match(missing, /\n1\. .*later\.md/, 'the fresh list, which the next number refers to')
  assert.equal(state.read(S), null)
})

test('SessionEnd removes the saved plan list', () => {
  savedPlan()
  const config = path.join(dir, 'config')
  fs.mkdirSync(path.join(config, 'plans'), { recursive: true })
  fs.writeFileSync(path.join(config, 'plans', 'p.md'), VALID)
  execute('', { env: { CLAUDE_CONFIG_DIR: config } })
  assert.ok(state.readListing(S))
  hook('h6-cleanup.js', { session_id: S, hook_event_name: 'SessionEnd' }, ['end'])
  assert.equal(state.readListing(S), null)
})

// ---- telemetry --------------------------------------------------------------------------

// Transcript lines shaped as Claude Code writes them (tierminator-telemetry-findings.md).
const said = (id, at, usage, model = 'claude-sonnet-5') => ({
  type: 'assistant',
  timestamp: at,
  message: {
    id,
    model,
    content: [{ type: 'text', text: '...' }],
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: usage.cacheWrite ?? 0,
      cache_creation: { ephemeral_5m_input_tokens: usage.cacheWrite ?? 0, ephemeral_1h_input_tokens: 0 },
      ...usage.raw,
    },
  },
})
const jsonl = (file, entries) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n')
  return file
}
const ago = seconds => new Date(Date.now() - seconds * 1000).toISOString()
// A worker transcript whose usage costs $0.05502 on Sonnet 5: 10 input, 1,000 output, 10,000 5-minute
// cache writes and 100,000 cache reads, the streaming line of its message repeated first.
const workerTranscript = name => {
  const raw = { input_tokens: 10, output_tokens: 1000, cache_read_input_tokens: 100000 }
  return jsonl(path.join(dir, 'transcripts', `${name}.jsonl`), [
    said(`${name}-m`, ago(20), { raw: { ...raw, output_tokens: 3 }, cacheWrite: 10000 }),
    said(`${name}-m`, ago(19), { raw, cacheWrite: 10000 }),
  ])
}
const WORKER_COST = (10 * 2 + 1000 * 10 + 10000 * 2.5 + 100000 * 0.2) / 1e6
const telemetryFile = () => path.join(dir, 'plan.telemetry.jsonl')
// One attempt at the current task, with its worker transcript; returns the SubagentStop output.
function spendAttempt(work, transcript) {
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  const text = work()
  return hook('h4-dispatch.js', subStop(text, { agent_transcript_path: transcript }), ['stop'])
}

test('each attempt is recorded beside the plan, and its line is shown at the next Stop', () => {
  startTestRun({ planFile: path.join(dir, 'plan.md') })
  const failed = spendAttempt(() => report('FAILED', 'NONE', 'tests fail'), workerTranscript('w1'))
  assert.equal(failed.stdout, '', 'SubagentStop output is not displayed for a background worker, so H4 shows nothing')
  const retryLine = 'tierminator: T01 on sonnet-low failed, retrying a tier up: 111k tokens (90% cache reads), ~$0.06. Run so far: ~$0.06.'
  assert.deepEqual(state.read(S).spendLines, [retryLine])

  // Claude ends its turn with the retry still due: the Stop blocks with the notice and shows the line.
  const blocked = hook('h5-guard.js', { session_id: S, stop_hook_active: false }, ['stop']).json
  assert.equal(blocked.decision, 'block')
  assert.equal(blocked.systemMessage, retryLine)
  assert.deepEqual(state.read(S).spendLines, [], 'shown once')

  spendAttempt(() => report('DONE', workerCommits('T01')), workerTranscript('w2'))
  assert.match(state.read(S).notice, /T01 done/, "Claude's notice is unchanged")
  hook('h4-dispatch.js', agentPre(expected()), ['pre'])
  // T02 is in flight, so this Stop is allowed; it still shows T01's line.
  const waiting = hook('h5-guard.js', { session_id: S, stop_hook_active: false }, ['stop']).json
  assert.equal(waiting.decision, undefined)
  assert.match(waiting.systemMessage, /^tierminator: T01 on sonnet-medium done: 111k tokens .*Run so far: ~\$0\.11\.$/)

  const records = telemetry.read(telemetryFile())
  assert.deepEqual(records.map(r => [r.kind, r.task, r.tier, r.attempt, r.outcome]), [
    ['attempt', 'T01', 'sonnet-low', 1, 'retry'],
    ['attempt', 'T01', 'sonnet-medium', 2, 'done'],
  ])
  const [first] = records
  assert.equal(first.reason, 'tests fail')
  assert.deepEqual(first.tokens, { input: 10, output: 1000, cacheWrite5m: 10000, cacheWrite1h: 0, cacheRead: 100000 })
  assert.ok(Math.abs(first.costUsd - WORKER_COST) < 1e-9)
  assert.deepEqual([first.planId, first.runId, first.sessionId, first.models], [PLAN_ID, state.read(S).runId, S, ['claude-sonnet-5']])
  assert.deepEqual([first.contextStart, first.contextEnd], [110010, 110010])
  assert.equal(first.durationMs, 0, 'one message: first and last are the same')
  assert.ok(Math.abs(state.read(S).spend.costUsd - 2 * WORKER_COST) < 1e-9)
})

test('a worker transcript that cannot be read leaves judging alone and records unknown usage', () => {
  startTestRun({ planFile: path.join(dir, 'plan.md') })
  spendAttempt(() => report('DONE', workerCommits('T01')), path.join(dir, 'missing.jsonl'))
  assert.match(state.read(S).spendLines[0], /T01 on sonnet-low done: usage unavailable\. Run so far: ~\$0\.00\./)
  assert.deepEqual(state.read(S).done.map(d => d.id), ['T01'])
  const [r] = telemetry.read(telemetryFile())
  assert.deepEqual([r.tokens, r.costUsd], [null, null])
})

test('a failed Agent call is recorded as an attempt that used nothing', () => {
  startTestRun({ planFile: path.join(dir, 'plan.md') })
  const call = expected()
  hook('h4-dispatch.js', agentPre(call), ['pre'])
  const out = hook('h4-dispatch.js', { ...agentPre(call), error: 'boom' }, ['failure']).json
  assert.match(out.hookSpecificOutput.additionalContext, /the Agent call failed: boom/)
  assert.equal(out.systemMessage, undefined)
  assert.match(state.read(S).spendLines[0], /T01 on sonnet-low failed, retrying a tier up: 0 tokens/)
  const [r] = telemetry.read(telemetryFile())
  assert.deepEqual([r.outcome, r.total, r.costUsd], ['retry', 0, 0])
})

test('H2 records the planning since the cursor, with planning subagents but not workers, and moves the cursor', () => {
  const file = writePlanFile(VALID)
  const main = path.join(dir, 'transcripts', 'main.jsonl')
  state.setCursor(S, ago(60))
  jsonl(main, [
    { type: 'permission-mode', permissionMode: 'plan' },
    said('old', ago(120), { raw: { output_tokens: 99999 } }, 'claude-opus-5-5'),
    said('p1', ago(30), { raw: { output_tokens: 1000 } }, 'claude-opus-5-5'),
    { type: 'user', permissionMode: 'default', message: { content: 'x' } },
    said('chat', ago(20), { raw: { output_tokens: 50000 } }),
    { type: 'user', permissionMode: 'plan', message: { content: 'y' } },
    said('p2', ago(10), { raw: { output_tokens: 500 } }, 'claude-opus-5-5'),
  ])
  const subs = path.join(dir, 'transcripts', 'main', 'subagents')
  jsonl(path.join(subs, 'agent-e.jsonl'), [said('e1', ago(25), { raw: { output_tokens: 200 } })])
  fs.writeFileSync(path.join(subs, 'agent-e.meta.json'), JSON.stringify({ agentType: 'Explore' }))
  jsonl(path.join(subs, 'agent-w.jsonl'), [said('w1', ago(25), { raw: { output_tokens: 70000 } })])
  fs.writeFileSync(path.join(subs, 'agent-w.meta.json'), JSON.stringify({ agentType: 'tierminator:sonnet-low' }))

  const before = new Date().toISOString()
  hook('h2-gate-exit-plan.js', { ...exitPre(VALID, file), transcript_path: main })
  const [r] = telemetry.read(telemetryFile())
  assert.deepEqual([r.kind, r.planId, r.sessionId, r.subagents, r.messages], ['planning', idOf(VALID), S, 1, 3])
  assert.equal(r.mainModel, 'claude-opus-5-5')
  assert.equal(r.tokens.output, 1700, 'plan-mode messages since the cursor, and the Explore subagent')
  assert.ok(Math.abs(r.costUsd - (1500 * 20 + 200 * 10) / 1e6) < 1e-9, 'each message at its own model')
  assert.ok(state.cursor(S) >= before, 'the cursor moved')

  // A resubmission (the table is already there) records only what came after.
  hook('h2-gate-exit-plan.js', { ...exitPre(fs.readFileSync(file, 'utf8'), file), transcript_path: main })
  const records = telemetry.read(telemetryFile())
  assert.equal(records.length, 2)
  assert.deepEqual([records[1].planId, records[1].messages], [idOf(VALID), 0])
})

test('a plan rejected and revised in the dialog keeps its first round of planning in the summary', () => {
  // As in the 2026-09-28 run: the first plan (a different task list, so a different id) was rejected,
  // the revised one approved.
  planning()
  const main = path.join(dir, 'transcripts', 'main.jsonl')
  state.setCursor(S, ago(120))
  jsonl(main, [
    { type: 'permission-mode', permissionMode: 'plan' },
    said('first', ago(100), { raw: { output_tokens: 10000 } }, 'claude-opus-5-5'),
  ])
  const first = planText([task(1), task(2, { title: 'Hello version' })])
  const file = writePlanFile(first)
  hook('h2-gate-exit-plan.js', { ...exitPre(first, file), transcript_path: main })
  // Written after the first submission moved the cursor, so it falls in the second round.
  const afterFirst = new Date(Date.parse(state.cursor(S)) + 1).toISOString()
  fs.appendFileSync(main, JSON.stringify(said('second', afterFirst, { raw: { output_tokens: 1000 } }, 'claude-opus-5-5')) + '\n')
  writePlanFile(VALID)
  hook('h2-gate-exit-plan.js', { ...exitPre(VALID, file), transcript_path: main })
  hook('h3-post-approval.js', exitPost(VALID, { transcript_path: main }))

  const records = telemetry.read(telemetryFile())
  assert.deepEqual(records.map(r => r.kind), ['planning', 'planning', 'run'])
  assert.equal(typeof records[2].contextTokens, 'number')
  assert.notEqual(records[0].planId, records[1].planId, 'the rejected round had another id')
  const s = state.read(S)
  assert.deepEqual([records[2].planId, records[2].runId, records[2].startTask], [s.planId, s.runId, 'T01'])
  const text = telemetry.summary(records, { planId: s.planId, runId: s.runId })
  assert.match(text, new RegExp(`planning\\s+~\\$${((11000 * 20) / 1e6).toFixed(2)}`), 'both rounds')
})

test('H2 records nothing for a plan it denies, or in an inactive session', () => {
  const file = writePlanFile(INVALID)
  hook('h2-gate-exit-plan.js', exitPre(INVALID, file))
  state.deactivate(S)
  const valid = writePlanFile(VALID)
  hook('h2-gate-exit-plan.js', exitPre(VALID, valid))
  assert.equal(fs.existsSync(telemetryFile()), false)
})

test('at the first Stop after the run ends, the spend summary is shown once, with planning from any session', () => {
  startTestRun({ planFile: path.join(dir, 'plan.md') })
  // Planning recorded in an earlier session, as for a plan run with /tierminator:execute.
  telemetry.append(telemetryFile(), { kind: 'planning', sessionId: 'earlier', planId: PLAN_ID, subagents: 2, tokens: {}, total: 50000, messages: 9, costUsd: 0.4, unpriced: [], models: ['claude-opus-5-5'] })
  spendAttempt(() => report('DONE', workerCommits('T01')), workerTranscript('a'))
  spendAttempt(() => report('FAILED', 'NONE', 'x'), workerTranscript('b'))
  spendAttempt(() => report('DONE', workerCommits('T02')), workerTranscript('c'))
  spendAttempt(() => report('DONE', workerCommits('T03')), workerTranscript('d'))
  assert.equal(state.read(S).phase, 'complete')

  const main = jsonl(path.join(dir, 'transcripts', 'main.jsonl'), [
    { type: 'permission-mode', permissionMode: 'auto' },
    said('o1', new Date(Date.parse(state.read(S).approvedAt) + 1).toISOString(), { raw: { output_tokens: 2000 } }),
  ])
  const out = hook('h5-guard.js', { session_id: S, stop_hook_active: false, transcript_path: main }, ['stop']).json
  assert.equal(out.decision, undefined)
  // The four attempts' queued lines come first (no Stop ran during this test's run), then the summary.
  const lines = out.systemMessage.split('\n')
  assert.deepEqual(lines.slice(0, 4).map(l => l.split(':')[1].trim().split(' on ')[0]), ['T01', 'T02', 'T02', 'T03'])
  const summaryAt = lines.findIndex(l => l.startsWith('tierminator spend'))
  assert.equal(summaryAt, 4)
  const rows = lines.slice(summaryAt + 1).map(l => l.trim().split(/\s+/).slice(0, 2).join(' '))
  assert.deepEqual(rows, [
    'planning ~$0.40',
    'sonnet-low ~$0.06',
    'sonnet-medium ~$0.06',
    'sonnet-high ~$0.06',
    'opus-high ~$0.06',
    'orchestration ~$0.02',
    `total ~$${(0.4 + 4 * WORKER_COST + 0.02).toFixed(2)}`,
    'main agent',
  ])
  // This test's run has no run record, so no context size: the estimate says so and no savings row follows.
  assert.match(out.systemMessage, /main agent\s+-\s+not estimated: no context size for the run$/)
  assert.match(out.systemMessage, /sonnet-medium\s+~\$0\.06\s+1 attempt \(1 failed\), 111k tokens/)
  assert.match(out.systemMessage, /sonnet-medium.*90% cache reads/)
  assert.deepEqual(telemetry.read(telemetryFile()).map(r => r.kind).slice(-2), ['orchestration', 'estimate'])
  assert.equal(state.read(S).spendReported, true)
  assert.equal(hook('h5-guard.js', { session_id: S, transcript_path: main }, ['stop']).stdout, '', 'only once')
})

test('a halted run gets its summary too, and an inactive session writes no telemetry', () => {
  startTestRun({ planFile: path.join(dir, 'plan.md') })
  for (let i = 0; i < 3; i++) spendAttempt(() => report('FAILED', 'NONE', 'no'), workerTranscript(`h${i}`))
  assert.equal(state.read(S).phase, 'halted')
  assert.match(hook('h5-guard.js', { session_id: S }, ['stop']).json.systemMessage, /sonnet-low .*\n.*sonnet-medium .*\n.*sonnet-high/)

  // A run in flight whose session is then made inactive.
  const s = state.read(S)
  state.write(S, { ...s, phase: 'running', planFile: path.join(dir, 'plan2.md'), current: { ...s.current, inFlight: true } })
  state.deactivate(S)
  hook('h4-dispatch.js', subStop(report('DONE'), { agent_transcript_path: workerTranscript('u') }), ['stop'])
  assert.equal(fs.existsSync(path.join(dir, 'plan2.telemetry.jsonl')), false)
})

// ---- every hook ---------------------------------------------------------------------

const HOOKS = [
  ['h1-plan-rules.js', []],
  ['h1-plan-rules.js', ['enter']],
  ['h1-plan-rules.js', ['compact']],
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
  const agent = { session_id: S, cwd: REPO, tool_name: 'Agent', tool_input: { subagent_type: 'tierminator:sonnet-low' } }
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
  assert.equal(commands.length, 16)
  for (const command of commands) {
    const script = /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/([\w-]+\.js)/.exec(command)?.[1]
    assert.ok(script && fs.existsSync(path.join(PLUGIN, 'scripts', script)), command)
  }
  const h4 = (event, matcher) => config.hooks[event].find(g => g.matcher === matcher)?.hooks[0].command
  assert.match(h4('PreToolUse', 'Agent'), /h4-dispatch\.js" pre$/)
  assert.match(h4('PostToolUse', 'Agent'), /h4-dispatch\.js" post$/)
  assert.match(h4('PostToolUseFailure', 'Agent'), /h4-dispatch\.js" failure$/)
  assert.match(h4('PreToolUse', 'SendMessage'), /h4-dispatch\.js" resume-pre$/)
  assert.match(h4('PostToolUse', 'SendMessage'), /h4-dispatch\.js" resume-post$/)
  assert.match(h4('PostToolUseFailure', 'SendMessage'), /h4-dispatch\.js" resume-failure$/)
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
