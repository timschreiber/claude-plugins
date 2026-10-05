'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const state = require('../../plugins/decidinator/scripts/lib/state.js')

const scripts = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts')
let root, data, home, project, saved

beforeEach(() => {
  saved = process.env.CLAUDE_PLUGIN_DATA
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-session-'))
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

function spawn(script, input, envExtra = {}) {
  const env = { ...process.env }
  delete env.DECIDINATOR_MODE
  delete env.CLAUDE_CODE_ENTRYPOINT
  delete env.CLAUDE_CODE_SESSION_ATTENDED
  delete env.DECIDINATOR_LOG
  delete env.DECIDINATOR_SIDECAR
  delete env.DECIDINATOR_DEBUG
  Object.assign(env, {
    CLAUDE_PLUGIN_DATA: data,
    HOME: home,
    USERPROFILE: home,
    CLAUDE_PROJECT_DIR: project
  }, envExtra)
  return spawnSync(process.execPath, [path.join(scripts, script)], {
    input: JSON.stringify({ session_id: 's1', cwd: project, ...input }),
    encoding: 'utf8',
    env
  })
}

const start = (source, mode, extra = {}) =>
  spawn('session-start.js', { source, hook_event_name: 'SessionStart', ...extra },
    mode === undefined ? {} : { DECIDINATOR_MODE: mode })
const end = () => spawn('session-end.js', { hook_event_name: 'SessionEnd', reason: 'prompt_input_exit' })

const configFile = () => path.join(project, '.claude', 'decidinator.json')

test('SessionStart arms from DECIDINATOR_MODE and says so', () => {
  const r = start('startup', 'sidecar')
  assert.deepEqual(JSON.parse(r.stdout), { systemMessage: 'decidinator: armed in sidecar mode by DECIDINATOR_MODE.' })
  const a = state.readArming('s1')
  assert.equal(a.mode, 'sidecar')
  assert.equal(a.by, 'env')
})

test('the mode is trimmed and case-insensitive; resume and clear arm, compact does not', () => {
  start('startup', ' ASK ')
  assert.equal(state.readArming('s1').mode, 'ask')
  state.disarm('s1')
  assert.notEqual(start('resume', 'ask').stdout, '')
  assert.equal(state.readArming('s1').mode, 'ask')
  state.disarm('s1')
  assert.notEqual(start('clear', 'sidecar').stdout, '')
  assert.equal(state.readArming('s1').mode, 'sidecar')
  state.disarm('s1')
  const r = start('compact', 'ask')
  assert.equal(r.stdout, '')
  assert.equal(state.readArming('s1'), null)
})

test('DECIDINATOR_MODE unset or empty prints nothing and does not arm', () => {
  for (const mode of [undefined, '']) {
    const r = start('startup', mode)
    assert.equal(r.stdout, '')
    assert.equal(state.readArming('s1'), null)
  }
})

test('a bad DECIDINATOR_MODE is reported and does not arm', () => {
  const r = start('startup', 'loud')
  assert.deepEqual(JSON.parse(r.stdout), {
    systemMessage: 'decidinator: not armed: DECIDINATOR_MODE is "loud"; use ask or sidecar.'
  })
  assert.equal(state.readArming('s1'), null)
})

test('an already armed session is left alone', () => {
  state.arm('s1', 'ask', 'command')
  const before = state.readArming('s1')
  const r = start('startup', 'sidecar')
  assert.equal(r.stdout, '')
  assert.deepEqual(state.readArming('s1'), before)
})

test('configuration problems are reported with the arming', () => {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true })
  fs.writeFileSync(configFile(), JSON.stringify({ mode: 'loud' }))
  const r = start('startup', 'ask')
  assert.deepEqual(JSON.parse(r.stdout), {
    systemMessage:
      `decidinator: armed in ask mode by DECIDINATOR_MODE. Configuration problems, ignored: ${configFile()}: "mode" must be "ask" or "sidecar".`
  })
  assert.equal(state.readArming('s1').mode, 'ask')
})

test('SessionStart ignores subagent input', () => {
  const r = start('startup', 'ask', { agent_id: 'a1' })
  assert.equal(r.stdout, '')
  assert.equal(state.readArming('s1'), null)
})

test('SessionEnd removes the session files and leaves other sessions', () => {
  const dir = state.sessionsDir()
  fs.mkdirSync(dir, { recursive: true })
  for (const f of ['s1.json', 's1.armed', 's1.extra', 's2.armed']) fs.writeFileSync(path.join(dir, f), '{}')
  const r = end()
  assert.equal(r.stdout, '')
  for (const f of ['s1.json', 's1.armed', 's1.extra']) assert.equal(fs.existsSync(path.join(dir, f)), false)
  assert.equal(fs.existsSync(path.join(dir, 's2.armed')), true)
})

test('SessionEnd sweeps files older than 7 days', () => {
  const dir = state.sessionsDir()
  fs.mkdirSync(dir, { recursive: true })
  const ago = days => new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  for (const [f, days] of [['old.json', 8], ['old.armed', 8], ['recent.json', 6]]) {
    const file = path.join(dir, f)
    fs.writeFileSync(file, '{}')
    fs.utimesSync(file, ago(days), ago(days))
  }
  const r = end()
  assert.equal(r.stdout, '')
  assert.equal(fs.existsSync(path.join(dir, 'old.json')), false)
  assert.equal(fs.existsSync(path.join(dir, 'old.armed')), false)
  assert.equal(fs.existsSync(path.join(dir, 'recent.json')), true)
})
