'use strict'

// Proves every hook prints nothing in an unarmed session, by replaying the WP-01 fixture records
// against each handler declared in hooks.json. Data-driven: new handlers are covered automatically.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..', '..')
const pluginDir = path.join(root, 'plugins', 'decidinator')
const evidence = path.join(root, 'probes', 'evidence')
const fixtureNames = [
  'decidinator-probe-interactive-normal-hooks.jsonl',
  'decidinator-probe-interactive-plan-hooks.jsonl',
  'decidinator-probe-interactive-deny-normal-hooks.jsonl',
  'decidinator-probe-interactive-deny-plan-hooks.jsonl',
]
const COMMAND = /^node "\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)"((?: \S+)*)$/

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-unarmed-'))
const dataDir = path.join(tmp, 'data')
const projectDir = path.join(tmp, 'project')
fs.mkdirSync(dataDir)
fs.mkdirSync(projectDir)

function makeEnv() {
  const env = { ...process.env }
  delete env.DECIDINATOR_MODE
  delete env.DECIDINATOR_DEBUG
  env.CLAUDE_PLUGIN_DATA = dataDir
  env.HOME = tmp
  env.USERPROFILE = tmp
  env.CLAUDE_PROJECT_DIR = projectDir
  return env
}

const hooksJson = JSON.parse(fs.readFileSync(path.join(pluginDir, 'hooks', 'hooks.json'), 'utf8'))

const records = []
for (const name of fixtureNames) {
  const lines = fs.readFileSync(path.join(evidence, name), 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    if (line.trim()) records.push({ file: name, line: i + 1, ...JSON.parse(line) })
  })
}

// No PostToolUse for AskUserQuestion was recorded (the probe denied every call), so one is derived from the recorded PreToolUse call: the same payload, the PostToolUse event name, and a tool_response in the shape Claude Code writes to the transcript as toolUseResult.
{
  const pre = records.find((r) => r.file === 'decidinator-probe-interactive-deny-normal-hooks.jsonl' && r.event === 'PreToolUse' && r.input && r.input.tool_name === 'AskUserQuestion')
  assert.ok(pre, 'no recorded AskUserQuestion PreToolUse call to derive from')
  const input = JSON.parse(JSON.stringify(pre.input))
  input.hook_event_name = 'PostToolUse'
  const answers = {}
  for (const q of input.tool_input.questions) answers[q.question] = q.options && q.options.length ? q.options[0].label : 'Yes'
  input.tool_response = { questions: input.tool_input.questions, answers }
  records.push({ file: 'derived from decidinator-probe-interactive-deny-normal-hooks.jsonl', line: 0, event: 'PostToolUse', input })
}

function matches(record, event, matcher) {
  if (record.event !== event) return false
  if (matcher === undefined || matcher === '' || matcher === '*') return true
  const input = record.input || {}
  let subject
  if (['PreToolUse', 'PostToolUse', 'PostToolUseFailure'].includes(event)) subject = input.tool_name
  else if (event === 'SessionStart') subject = input.source
  else return true
  return new RegExp(`^(?:${matcher})$`).test(subject || '')
}

const handlers = []
for (const [event, groups] of Object.entries(hooksJson.hooks)) {
  for (const group of groups) {
    for (const hook of group.hooks) {
      const m = COMMAND.exec(hook.command)
      assert.ok(m, `hook command does not match the expected form: ${hook.command}`)
      const args = m[2].split(/\s+/).filter(Boolean)
      handlers.push({ event, matcher: group.matcher, script: m[1], args })
    }
  }
}

for (const h of handlers) {
  test(`${h.event} ${h.script} ${h.args.join(' ')}`.trim(), () => {
    const matched = records.filter((r) => matches(r, h.event, h.matcher))
    assert.ok(matched.length > 0, `no fixture record matches ${h.event} ${h.script}`)
    for (const r of matched) {
      const res = spawnSync(process.execPath, [path.join(pluginDir, h.script), ...h.args], {
        input: JSON.stringify(r.input),
        encoding: 'utf8',
        env: makeEnv(),
      })
      assert.equal(res.status, 0, `${r.file}:${r.line} exited ${res.status}: ${res.stderr}`)
      assert.equal(res.stdout, '', `${r.file}:${r.line} printed output`)
    }
  })
}

test('no session was armed by the replay', () => {
  const dir = path.join(dataDir, 'sessions')
  if (fs.existsSync(dir)) {
    assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.armed')), [])
  }
})

test('control: commands.js prints output for /decidinator:arm', () => {
  const res = spawnSync(process.execPath, [path.join(pluginDir, 'scripts', 'commands.js')], {
    input: JSON.stringify({ session_id: 'ctl', prompt: '/decidinator:arm' }),
    encoding: 'utf8',
    env: makeEnv(),
  })
  assert.notEqual(res.stdout, '')
})

test.after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  } catch {}
})
