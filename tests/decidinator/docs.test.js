'use strict'

// The Decidinator reference must name every configuration key, environment variable, hook script,
// command and file marker. 'Appears' means the text includes the name wrapped in backticks.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const reference = fs.readFileSync(path.join(root, 'docs', 'decidinator', 'decidinator-reference.md'), 'utf8')
const specFile = path.join(root, 'docs', 'decidinator', 'Decidinator — Specification.md')
const spec = fs.readFileSync(specFile, 'utf8')
const scriptsDir = path.join(root, 'plugins', 'decidinator', 'scripts')
const hooksText = fs.readFileSync(path.join(root, 'plugins', 'decidinator', 'hooks', 'hooks.json'), 'utf8')
const { DEFAULTS } = require('../../plugins/decidinator/scripts/lib/config.js')

const appears = (name) => reference.includes('`' + name + '`')
const missingFrom = (names) => [...new Set(names)].filter((n) => !appears(n))

function matches(text, re) {
  return [...text.matchAll(re)].map((m) => m[1])
}

function jsFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...jsFiles(full))
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

test('the reference names every key of config.js DEFAULTS', () => {
  const missing = missingFrom(Object.keys(DEFAULTS))
  assert.deepEqual(missing, [], `the reference does not name these config.js DEFAULTS keys: ${missing.join(', ')}`)
})

test('the reference names every configuration key in the specification', () => {
  const lines = spec.split(/\r?\n/)
  const start = lines.findIndex((l) => l.includes('Configuration file keys'))
  const end = lines.findIndex((l, i) => i > start && l.startsWith('Impact order'))
  assert.ok(start >= 0 && end > start, 'the specification has no Configuration file keys table before Impact order')
  const keys = matches(lines.slice(start, end).join('\n'), /^\| `(\w+)` \|/gm)
  assert.ok(keys.length > 0, 'no configuration keys found in the specification table')
  const missing = missingFrom(keys)
  assert.deepEqual(missing, [], `the reference does not name these specification configuration keys: ${missing.join(', ')}`)
})

test('the reference names every environment variable in the specification', () => {
  const names = matches(spec, /`(DECIDINATOR_[A-Z_]+)`/g)
  assert.ok(names.length > 0, 'no DECIDINATOR_ variables found in the specification')
  const missing = missingFrom(names)
  assert.deepEqual(missing, [], `the reference does not name these specification environment variables: ${missing.join(', ')}`)
})

test('the reference names every process.env variable the scripts read', () => {
  const names = []
  for (const file of jsFiles(scriptsDir)) names.push(...matches(fs.readFileSync(file, 'utf8'), /process\.env\.([A-Z_][A-Z0-9_]*)/g))
  assert.ok(names.length > 0, 'no process.env reads found under plugins/decidinator/scripts')
  const missing = missingFrom(names)
  assert.deepEqual(missing, [], `the reference does not name these process.env variables: ${missing.join(', ')}`)
})

test('the reference names every script file in hooks.json', () => {
  const scripts = matches(hooksText, /scripts\/([\w-]+\.js)/g)
  assert.ok(scripts.length > 0, 'no script files found in hooks.json')
  const missing = missingFrom(scripts)
  assert.deepEqual(missing, [], `the reference does not name these hooks.json scripts: ${missing.join(', ')}`)
})

test('the reference names all seven commands', () => {
  const commands = ['arm', 'disarm', 'status', 'review', 'confirm', 'export', 'import'].map((c) => `/decidinator:${c}`)
  const missing = commands.filter((c) => !reference.includes(c))
  assert.deepEqual(missing, [], `the reference does not name these commands: ${missing.join(', ')}`)
})

test('the README names every config key, variable, command and key phrase', () => {
  const readme = fs.readFileSync(path.join(root, 'plugins', 'decidinator', 'README.md'), 'utf8')
  const required = [
    ...Object.keys(DEFAULTS).map((k) => '`' + k + '`'),
    'DECIDINATOR_MODE', 'DECIDINATOR_CONTEXT', 'DECIDINATOR_DEBUG',
    ...['arm', 'disarm', 'status', 'review', 'confirm', 'export', 'import'].map((c) => `/decidinator:${c}`),
    'WebFetch', 'WebSearch', 'Bash(gh search:*)', 'Bash(gh repo view:*)', 'Bash(gh api:*)', 'claude -p', 'plan mode', 'decidinator-reference.md', 'In development',
  ]
  const missing = required.filter((s) => !readme.includes(s))
  assert.deepEqual(missing, [], `the README does not contain: ${missing.join(', ')}`)
})

test('the reference lists every tool to allow for unattended research', () => {
  const rules = ['WebFetch', 'WebSearch', 'Bash(gh search:*)', 'Bash(gh repo view:*)', 'Bash(gh api:*)']
  const missing = rules.filter((r) => !appears(r))
  assert.deepEqual(missing, [], `the reference does not list these tools to allow: ${missing.join(', ')}`)
})

test('the reference holds both file markers verbatim', () => {
  const markers = ['<!-- decidinator-log v1 -->', '<!-- decidinator-sidecar v1 -->']
  const missing = markers.filter((m) => !reference.includes(m))
  assert.deepEqual(missing, [], `the reference does not contain these markers: ${missing.join(', ')}`)
})
