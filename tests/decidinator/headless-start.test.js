'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const msg = require('../../plugins/decidinator/scripts/lib/messages.js')
const state = require('../../plugins/decidinator/scripts/lib/state.js')

const scripts = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts')
let root, data, home, project, saved

beforeEach(() => {
  saved = process.env.CLAUDE_PLUGIN_DATA
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-headless-'))
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
  env.CLAUDE_CODE_ENTRYPOINT = 'sdk-cli'
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

const rule = { hookEventName: 'SessionStart', additionalContext: msg.HEADLESS_RULE }

test('startup in sidecar mode arms and gives the rule', () => {
  const r = start('startup', 'sidecar')
  assert.deepEqual(JSON.parse(r.stdout), {
    systemMessage: msg.envArmedHeadless('sidecar', []),
    hookSpecificOutput: rule
  })
  const a = state.readArming('s1')
  assert.equal(a.mode, 'sidecar')
  assert.equal(a.by, 'env')
})

test('DECIDINATOR_MODE=ask is armed as sidecar', () => {
  const r = start('startup', 'ask')
  assert.equal(JSON.parse(r.stdout).systemMessage, msg.envArmedHeadless('ask', []))
  assert.equal(state.readArming('s1').mode, 'sidecar')
})

test('compact prints nothing and does not arm', () => {
  const r = start('compact', 'sidecar')
  assert.equal(r.stdout, '')
  assert.equal(state.readArming('s1'), null)
})

test('resume and clear each print the rule', () => {
  for (const source of ['resume', 'clear']) {
    const r = start(source, 'sidecar')
    assert.deepEqual(JSON.parse(r.stdout).hookSpecificOutput, rule)
    state.disarm('s1')
  }
})

test('an already armed session prints nothing, so the rule is given once', () => {
  state.arm('s1', 'sidecar', 'command')
  assert.equal(start('startup', 'sidecar').stdout, '')
})

test('a bad DECIDINATOR_MODE prints only the bad-mode message', () => {
  const r = start('startup', 'loud')
  assert.deepEqual(JSON.parse(r.stdout), { systemMessage: msg.envBad('loud') })
  assert.equal(state.readArming('s1'), null)
})

test('an attended entrypoint stays interactive', () => {
  const r = spawn('session-start.js', { source: 'startup', hook_event_name: 'SessionStart' },
    { DECIDINATOR_MODE: 'sidecar', CLAUDE_CODE_ENTRYPOINT: 'cli' })
  assert.deepEqual(JSON.parse(r.stdout), { systemMessage: msg.envArmed('sidecar', []) })
})

test('CLAUDE_CODE_SESSION_ATTENDED=0 counts as headless', () => {
  const r = spawn('session-start.js', { source: 'startup', hook_event_name: 'SessionStart' },
    { DECIDINATOR_MODE: 'sidecar', CLAUDE_CODE_ENTRYPOINT: '', CLAUDE_CODE_SESSION_ATTENDED: '0' })
  assert.deepEqual(JSON.parse(r.stdout).hookSpecificOutput, rule)
})
