'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const state = require('../../plugins/decidinator/scripts/lib/state.js')
const msg = require('../../plugins/decidinator/scripts/lib/messages.js')
const { DEFAULTS } = require('../../plugins/decidinator/scripts/lib/config.js')
const decisionLog = require('../../plugins/decidinator/scripts/lib/decision-log.js')
const sidecar = require('../../plugins/decidinator/scripts/lib/sidecar.js')

const script = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'commands.js')
let root, data, home, project, saved

beforeEach(() => {
  saved = process.env.CLAUDE_PLUGIN_DATA
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-commands-'))
  data = path.join(root, 'data')
  home = path.join(root, 'home')
  project = path.join(root, 'project')
  for (const d of [data, home, project]) fs.mkdirSync(d)
  process.env.CLAUDE_PLUGIN_DATA = data
})

afterEach(() => {
  if (saved === undefined) delete process.env.CLAUDE_PLUGIN_DATA
  else process.env.CLAUDE_PLUGIN_DATA = saved
  fs.rmSync(root, { recursive: true, force: true })
})

function spawn(prompt, extra = {}) {
  const env = { ...process.env }
  delete env.DECIDINATOR_MODE
  delete env.DECIDINATOR_DEBUG
  Object.assign(env, {
    CLAUDE_PLUGIN_DATA: data,
    HOME: home,
    USERPROFILE: home,
    CLAUDE_PROJECT_DIR: project
  })
  const input = {
    session_id: 's1',
    cwd: project,
    hook_event_name: 'UserPromptSubmit',
    permission_mode: 'default',
    prompt,
    ...extra
  }
  return spawnSync(process.execPath, [script], { input: JSON.stringify(input), encoding: 'utf8', env })
}

const configFile = () => path.join(project, '.claude', 'decidinator.json')

function writeConfig(content) {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true })
  fs.writeFileSync(configFile(), JSON.stringify(content))
}

test('arm with no config arms in ask mode by command', () => {
  const r = spawn('/decidinator:arm')
  assert.equal(
    r.stdout,
    'decidinator: armed in ask mode. Questions the oracles cannot settle go to the user. /decidinator:disarm turns it off.\n'
  )
  const a = state.readArming('s1')
  assert.equal(a.mode, 'ask')
  assert.equal(a.by, 'command')
})

test('arm takes the mode from the project config', () => {
  writeConfig({ mode: 'sidecar' })
  const r = spawn('/decidinator:arm')
  assert.equal(r.stdout, msg.armed('sidecar') + '\n')
  assert.equal(state.readArming('s1').mode, 'sidecar')
})

test('arm argument is case-insensitive and trimmed', () => {
  assert.equal(spawn('/decidinator:arm SIDECAR').stdout, msg.armed('sidecar') + '\n')
  assert.equal(state.readArming('s1').mode, 'sidecar')
  state.disarm('s1')
  assert.equal(spawn('  /decidinator:arm sidecar  ').stdout, msg.armed('sidecar') + '\n')
  assert.equal(state.readArming('s1').mode, 'sidecar')
})

test('arm with a bad mode changes nothing', () => {
  const r = spawn('/decidinator:arm loud')
  assert.equal(r.stdout, msg.badMode('loud') + '\n')
  assert.equal(state.readArming('s1'), null)
})

test('arm when already armed reports it; a different mode switches and keeps the flag fields', () => {
  state.arm('s1', 'ask', 'command')
  const before = state.readArming('s1')
  assert.equal(spawn('/decidinator:arm ask').stdout, msg.already('ask') + '\n')
  assert.equal(spawn('/decidinator:arm').stdout, msg.already('ask') + '\n')
  assert.equal(spawn('/decidinator:arm sidecar').stdout, msg.switched('ask', 'sidecar') + '\n')
  const after = state.readArming('s1')
  assert.equal(after.mode, 'sidecar')
  assert.equal(after.armedAt, before.armedAt)
  assert.equal(after.by, before.by)
})

test('invalid config keys are ignored and reported', () => {
  writeConfig({ mode: 'loud', guardMaxBlock: 4 })
  const file = configFile()
  const r = spawn('/decidinator:arm')
  assert.equal(
    r.stdout,
    msg.armed('ask') +
      ` Configuration problems, ignored: ${file}: "mode" must be "ask" or "sidecar"; ${file}: "guardMaxBlock" is not a Decidinator setting.` +
      '\n'
  )
  assert.equal(state.readArming('s1').mode, 'ask')
})

test('a fresh arm prunes old session files', () => {
  const dir = state.sessionsDir()
  fs.mkdirSync(dir, { recursive: true })
  const old = path.join(dir, 'old.json')
  fs.writeFileSync(old, '{}')
  const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
  fs.utimesSync(old, past, past)
  spawn('/decidinator:arm')
  assert.equal(fs.existsSync(old), false)
})

test('disarm removes the flag and the state file', () => {
  state.arm('s1', 'ask', 'command')
  state.write('s1', { a: 1 })
  const r = spawn('/decidinator:disarm')
  assert.equal(r.stdout, msg.DISARMED + '\n')
  assert.equal(state.readArming('s1'), null)
  assert.equal(fs.existsSync(state.fileFor('s1')), false)
  assert.equal(fs.existsSync(state.flagFor('s1')), false)
})

test('disarm when unarmed says so', () => {
  assert.equal(spawn('/decidinator:disarm').stdout, msg.NOT_ARMED + '\n')
})

const zero = msg.statusCounts({ open: 0, unconfirmed: 0 }, DEFAULTS)

test('status reports unarmed, armed by command, armed by env, and config problems', () => {
  assert.equal(spawn('/decidinator:status').stdout, msg.STATUS_UNARMED + zero + '\n')

  state.arm('s1', 'ask', 'command')
  let out = spawn('/decidinator:status').stdout
  assert.equal(out, msg.statusArmed(state.readArming('s1')) + zero + '\n')
  assert.ok(out.includes('/decidinator:arm'))

  state.arm('s1', 'sidecar', 'env')
  out = spawn('/decidinator:status').stdout
  assert.equal(out, msg.statusArmed(state.readArming('s1')) + zero + '\n')
  assert.ok(out.includes('DECIDINATOR_MODE'))

  writeConfig({ mode: 'loud' })
  out = spawn('/decidinator:status').stdout
  assert.ok(out.includes(' Configuration problems, ignored: '))
  assert.ok(out.endsWith('.\n'))
})

test('status counts open sidecar entries and unconfirmed decisions', () => {
  const side = path.join(project, 'docs', 'open-questions.md')
  const log = path.join(project, 'docs', 'decisions.md')
  for (const q of ['Q1?', 'Q2?']) {
    const r = sidecar.append(side, { topic: 'T', question: q, context: 'c', options: [], provisionalAnswer: 'p', dependsOn: [], status: 'open' })
    assert.ok(r.ok, r.error)
  }
  const d = decisionLog.append(log, {
    title: 'T', question: 'Q?', answer: 'A', rationale: 'r', provenance: 'oracle-unconfirmed', confidence: 'low',
    rung: 1, context: 'c', sources: [], assumptions: [], date: '2026-01-01'
  })
  assert.ok(d.ok, d.error)
  const out = spawn('/decidinator:status').stdout
  assert.equal(out, msg.STATUS_UNARMED + msg.statusCounts({ open: 2, unconfirmed: 1 }, DEFAULTS) + '\n')
  assert.ok(out.includes('2 open questions'))
  assert.ok(out.includes('1 unconfirmed decision.'))
})

test('other prompts produce no output', () => {
  for (const p of ['hello', '/decidinator:armed', '/decidinator:review', '/planandtier:arm']) {
    assert.equal(spawn(p).stdout, '', p)
  }
  assert.equal(spawn('/decidinator:arm', { agent_id: 'a1' }).stdout, '')
  assert.equal(state.readArming('s1'), null)
})
