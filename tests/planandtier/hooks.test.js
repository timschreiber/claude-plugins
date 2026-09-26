'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PLUGIN = path.join(__dirname, '..', '..', 'plugins', 'planandtier')
const state = require(path.join(PLUGIN, 'scripts', 'lib', 'state.js'))
const RULES = fs.readFileSync(path.join(PLUGIN, 'rules', 'tiering.md'), 'utf8')
const OPT_OUT = 'Tiered execution: off'
const WORKFLOW = 'planandtier:execute-plan'

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
const INVALID = planText([task(1, { model: 'haiku' })])
const NO_BLOCK = '# Plan\n\nJust prose, no task block.\n'

const writePlanFile = text => {
  const file = path.join(dir, 'plan.md')
  fs.writeFileSync(file, text)
  return file
}
const S = 'sess-1'
const exitPre = (plan, file) => ({ session_id: S, tool_name: 'ExitPlanMode', tool_input: { plan, planFilePath: file } })
const exitPost = (plan, extra = {}) => ({
  session_id: S,
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
  assert.match(out.permissionDecisionReason, /T01\.model: "haiku" is not allowed; use sonnet or opus/)
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

// ---- H3 ----------------------------------------------------------------------------

test('H3 saves the approved tasks and tells the model to launch the workflow', () => {
  const r = hook('h3-post-approval.js', exitPost(VALID))
  const s = state.read(S)
  assert.equal(s.phase, 'approved')
  assert.deepEqual(s.tasks.map(t => t.id), ['T01', 'T02', 'T03'])
  assert.equal(s.denials, 0)
  assert.equal(s.guardDenials, 0)
  assert.equal(s.planFile, path.join(dir, 'plan.md'))
  assert.ok(!Number.isNaN(Date.parse(s.approvedAt)))
  const out = r.json.hookSpecificOutput
  assert.equal(out.hookEventName, 'PostToolUse')
  assert.match(out.additionalContext, /3 tiered tasks \(T01 to T03\)/)
  assert.match(out.additionalContext, /Workflow tool with name "planandtier:execute-plan" and no args/)
  assert.match(out.additionalContext, /do not edit files/)
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
  assert.match(r.json.hookSpecificOutput.additionalContext, /will not run as a tiered workflow/)
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

// ---- H4 ----------------------------------------------------------------------------

const wfPre = (toolInput, extra = {}) => ({ session_id: S, tool_name: 'Workflow', tool_input: toolInput, ...extra })

test('H4 replaces args with the stored tasks, keeps the rest of the input, and never sets a permission decision', () => {
  state.write(S, approvedState())
  const r = hook('h4-rewrite-workflow-args.js', wfPre({ name: WORKFLOW, resumeFromRunId: 'wf_x' }))
  assert.deepEqual(r.json, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { name: WORKFLOW, resumeFromRunId: 'wf_x', args: { tasks: approvedState().tasks } },
    },
  })
  assert.ok(!r.stdout.includes('permissionDecision'))
  assert.equal(state.read(S).phase, 'launched')
})

test('H4 overrides args the model passed', () => {
  state.write(S, approvedState())
  const r = hook('h4-rewrite-workflow-args.js', wfPre({ name: WORKFLOW, args: { tasks: [{ id: 'T99' }] } }))
  assert.equal(r.json.hookSpecificOutput.updatedInput.args.tasks[0].id, 'T01')
})

test('H4 also injects the tasks on a relaunch (launched) and after the guard gave up (abandoned)', () => {
  for (const phase of ['launched', 'abandoned']) {
    state.write(S, approvedState({ phase }))
    const r = hook('h4-rewrite-workflow-args.js', wfPre({ name: WORKFLOW }))
    assert.equal(r.json.hookSpecificOutput.updatedInput.args.tasks.length, 2, phase)
    assert.equal(state.read(S).phase, 'launched')
  }
})

test('H4 ignores other workflows, a missing state, the planning phase and subagents', () => {
  state.write(S, approvedState())
  assert.equal(hook('h4-rewrite-workflow-args.js', wfPre({ name: 'other:thing' })).stdout, '')
  assert.equal(hook('h4-rewrite-workflow-args.js', wfPre({ script: 'x' })).stdout, '')
  assert.equal(state.read(S).phase, 'approved')
  assert.equal(hook('h4-rewrite-workflow-args.js', wfPre({ name: WORKFLOW }, { session_id: 'other' })).stdout, '')
  state.write(S, approvedState({ phase: 'planning', tasks: [] }))
  assert.equal(hook('h4-rewrite-workflow-args.js', wfPre({ name: WORKFLOW })).stdout, '')
  state.write(S, approvedState())
  assert.equal(hook('h4-rewrite-workflow-args.js', wfPre({ name: WORKFLOW }, { agent_id: 'a1' })).stdout, '')
})

// ---- H5 ----------------------------------------------------------------------------

const toolPre = (name, extra = {}) => ({ session_id: S, tool_name: name, tool_input: {}, ...extra })

test('H5 pre denies main-thread work while approved, and counts the denial', () => {
  state.write(S, approvedState())
  const r = hook('h5-guard.js', toolPre('Edit'), ['pre'])
  const out = r.json.hookSpecificOutput
  assert.equal(out.permissionDecision, 'deny')
  assert.match(out.permissionDecisionReason, /Call the Workflow tool with name "planandtier:execute-plan"/)
  assert.equal(state.read(S).guardDenials, 1)
})

test('H5 pre is silent in every other phase, with no state, and for subagents', () => {
  for (const phase of ['planning', 'launched', 'abandoned']) {
    state.write(S, approvedState({ phase }))
    assert.equal(hook('h5-guard.js', toolPre('Bash'), ['pre']).stdout, '', phase)
  }
  state.remove(S)
  assert.equal(hook('h5-guard.js', toolPre('Bash'), ['pre']).stdout, '')
  state.write(S, approvedState())
  assert.equal(hook('h5-guard.js', toolPre('Bash', { agent_id: 'a1' }), ['pre']).stdout, '')
  assert.equal(state.read(S).guardDenials, 0)
})

test('H5 pre gives up after three denials and stands down', () => {
  state.write(S, approvedState())
  for (let i = 0; i < 3; i++) {
    assert.equal(hook('h5-guard.js', toolPre('Write'), ['pre']).json.hookSpecificOutput.permissionDecision, 'deny')
  }
  assert.equal(hook('h5-guard.js', toolPre('Write'), ['pre']).stdout, '')
  assert.equal(state.read(S).phase, 'abandoned')
  assert.equal(hook('h5-guard.js', toolPre('Write'), ['pre']).stdout, '')
})

test('H5 stop blocks once, then allows and abandons on the second consecutive stop', () => {
  state.write(S, approvedState())
  const first = hook('h5-guard.js', { session_id: S, stop_hook_active: false }, ['stop'])
  assert.equal(first.json.decision, 'block')
  assert.match(first.json.reason, /planandtier:execute-plan/)
  assert.equal(state.read(S).phase, 'approved')
  const second = hook('h5-guard.js', { session_id: S, stop_hook_active: true }, ['stop'])
  assert.equal(second.stdout, '')
  assert.equal(state.read(S).phase, 'abandoned')
})

test('H5 stop is silent unless the state is approved', () => {
  assert.equal(hook('h5-guard.js', { session_id: S }, ['stop']).stdout, '')
  state.write(S, approvedState({ phase: 'launched' }))
  assert.equal(hook('h5-guard.js', { session_id: S }, ['stop']).stdout, '')
})

// ---- H6 ----------------------------------------------------------------------------

test('H6 failure reverts a launched state to approved and keeps the tasks', () => {
  state.write(S, approvedState({ phase: 'launched', guardDenials: 2 }))
  hook('h6-cleanup.js', { session_id: S, tool_name: 'Workflow', tool_input: { name: WORKFLOW } }, ['failure'])
  const s = state.read(S)
  assert.equal(s.phase, 'approved')
  assert.equal(s.guardDenials, 0)
  assert.equal(s.tasks.length, 2)
})

test('H6 failure leaves other workflows and other phases alone', () => {
  state.write(S, approvedState({ phase: 'launched' }))
  hook('h6-cleanup.js', { session_id: S, tool_input: { name: 'other:thing' } }, ['failure'])
  assert.equal(state.read(S).phase, 'launched')
  state.write(S, approvedState({ phase: 'abandoned' }))
  hook('h6-cleanup.js', { session_id: S, tool_input: { name: WORKFLOW } }, ['failure'])
  assert.equal(state.read(S).phase, 'abandoned')
})

test('H6 end deletes the session state', () => {
  state.write(S, approvedState())
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
  ['h4-rewrite-workflow-args.js', []],
  ['h5-guard.js', ['pre']],
  ['h5-guard.js', ['stop']],
  ['h6-cleanup.js', ['failure']],
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
  const inputs = {
    'h2-gate-exit-plan.js': exitPre(NO_BLOCK, path.join(dir, 'none.md')),
    'h4-rewrite-workflow-args.js': wfPre({ name: WORKFLOW }),
    'h5-guard.js': toolPre('Edit'),
    'h6-cleanup.js': { session_id: S, tool_input: { name: WORKFLOW } },
  }
  for (const [script, args] of HOOKS) {
    const r = hook(script, inputs[script] ?? { session_id: S }, args, env)
    assert.equal(r.status, 0, `${script} ${args}`)
  }
})

test('hooks.json is valid and every command names a script that exists', () => {
  const config = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'hooks', 'hooks.json'), 'utf8'))
  const commands = Object.values(config.hooks).flatMap(groups => groups.flatMap(g => g.hooks.map(h => h.command)))
  assert.equal(commands.length, 9)
  for (const command of commands) {
    const script = /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/([\w-]+\.js)/.exec(command)?.[1]
    assert.ok(script && fs.existsSync(path.join(PLUGIN, 'scripts', script)), command)
  }
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
