'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const state = require(path.join(lib, 'state.js'))
const reasons = require(path.join(lib, 'reasons.js'))
const recorded = require('./fixtures/recorded.js')
const { setup, denyReason } = require('./fixtures/harness.js')

let h
let savedData
let cfgFile
const sid = 'oracle-shell-session'

const researcher = recorded.input('decidinator-probe-interactive-normal-hooks.jsonl',
  r => r.event === 'PreToolUse' && r.input.tool_name === 'Bash' && r.input.agent_type === 'decidinator-probe:researcher')
const oracleClear = recorded.input('decidinator-probe-oracle-clear-hooks.jsonl',
  r => r.event === 'PreToolUse' && r.input.tool_name === 'Bash' && r.input.agent_type === 'decidinator:oracle-1')
const oracleHumanOnly = recorded.input('decidinator-probe-oracle-human-only-hooks.jsonl',
  r => r.event === 'PreToolUse' && r.input.tool_name === 'Bash' && r.input.agent_type === 'decidinator:oracle-1')

beforeEach(() => {
  h = setup('oracle-shell')
  savedData = process.env.CLAUDE_PLUGIN_DATA
  process.env.CLAUDE_PLUGIN_DATA = h.dataDir
  state.arm(sid, 'ask', 'command')
  fs.mkdirSync(path.join(h.projectDir, '.claude'), { recursive: true })
  cfgFile = path.join(h.projectDir, '.claude', 'decidinator.json')
  fs.writeFileSync(cfgFile, JSON.stringify({ rungs: ['decidinator:oracle-1', 'decidinator-probe:researcher'] }))
})

afterEach(() => {
  if (savedData === undefined) delete process.env.CLAUDE_PLUGIN_DATA
  else process.env.CLAUDE_PLUGIN_DATA = savedData
  h.cleanup()
})

function run(input) {
  input.session_id = sid
  const res = h.run('oracle-shell.js', input)
  assert.equal(res.status, 0, res.stderr)
  assert.doesNotMatch(res.stdout, /"permissionDecision":"allow"/)
  return denyReason(res.stdout)
}

function withCommand(base, command, toolName = base.tool_name) {
  const copy = JSON.parse(JSON.stringify(base))
  copy.tool_input.command = command
  copy.tool_name = toolName
  return copy
}

test('the recorded researcher gh search call is allowed', () => {
  assert.equal(run(JSON.parse(JSON.stringify(researcher))), null)
})

test('the recorded oracle call with & is denied', () => {
  assert.equal(run(JSON.parse(JSON.stringify(oracleClear))), reasons.oracleShell('it uses `&` outside single quotes'))
})

test('the recorded human-only oracle call is denied', () => {
  assert.match(run(JSON.parse(JSON.stringify(oracleHumanOnly))), /^decidinator: command not run: /)
})

test('gh api with POST is denied', () => {
  assert.equal(run(withCommand(researcher, 'gh api repos/cli/cli -X POST')),
    reasons.oracleShell('gh api with method POST is not read-only'))
})

test('plain gh api is allowed', () => {
  assert.equal(run(withCommand(researcher, 'gh api repos/cli/cli')), null)
})

test('gh api -X GET with a field is allowed', () => {
  assert.equal(run(withCommand(researcher, 'gh api -X GET search/code -f q=retry')), null)
})

test('gh api with fields and no -X GET is denied', () => {
  assert.equal(run(withCommand(researcher, 'gh api repos/x/y/issues -f title=hi')),
    reasons.oracleShell('gh api sends -f/-F fields as a POST unless -X GET is given'))
})

test('PowerShell Get-ChildItem is denied', () => {
  assert.equal(run(withCommand(researcher, 'Get-ChildItem', 'PowerShell')),
    reasons.oracleShell('it is not one of gh search, gh repo view or gh api'))
})

test('PowerShell gh search is allowed', () => {
  assert.equal(run(withCommand(researcher, "gh search repos 'x'", 'PowerShell')), null)
})

test('Monitor is denied', () => {
  const input = JSON.parse(JSON.stringify(researcher))
  input.tool_name = 'Monitor'
  input.tool_input = { command: 'gh search repos x', description: 'watch' }
  assert.equal(run(input), reasons.ORACLE_MONITOR)
})

test('main thread calls are left alone', () => {
  const input = withCommand(researcher, 'rm -rf build')
  delete input.agent_id
  delete input.agent_type
  assert.equal(run(input), null)
})

test('other subagents are left alone', () => {
  const input = withCommand(researcher, 'ls')
  input.agent_type = 'general-purpose'
  assert.equal(run(input), null)
})

test('unarmed is inert', () => {
  state.disarm(sid)
  assert.equal(run(JSON.parse(JSON.stringify(oracleClear))), null)
})

test('default rungs apply without a project config', () => {
  fs.rmSync(cfgFile)
  assert.ok(run(JSON.parse(JSON.stringify(oracleClear))))
  assert.equal(run(withCommand(researcher, 'ls')), null)
})
