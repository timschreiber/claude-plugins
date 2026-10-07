'use strict'

// The Grindinator reference and README must name every configuration key, flag, variable, exit code,
// outcome, file and command. 'Appears' means the text includes the name wrapped in backticks.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..', '..')
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8')
const reference = read('docs', 'grindinator', 'grindinator-reference.md')
const readme = read('tools', 'grindinator', 'README.md')
const toolDir = path.join(root, 'tools', 'grindinator')
const { DEFAULTS, FLAGS } = require('../../tools/grindinator/lib/config.js')
const { EXIT } = require('../../tools/grindinator/lib/errors.js')

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

function binFiles() {
  const dir = path.join(toolDir, 'bin')
  return fs.readdirSync(dir).map((f) => path.join(dir, f))
}

test('the reference names every key of config.js DEFAULTS', () => {
  const missing = missingFrom(Object.keys(DEFAULTS))
  assert.deepEqual(missing, [], `the reference does not name these DEFAULTS keys: ${missing.join(', ')}`)
})

test('the reference names every flag', () => {
  const flags = [...Object.values(FLAGS).map((f) => '--' + f.option), '--name']
  const missing = missingFrom(flags)
  assert.deepEqual(missing, [], `the reference does not name these flags: ${missing.join(', ')}`)
})

test('the reference names every environment variable the code uses', () => {
  const names = []
  for (const file of [...jsFiles(toolDir), ...binFiles()]) {
    const text = fs.readFileSync(file, 'utf8')
    names.push(...matches(text, /\b((?:GRINDINATOR|DECIDINATOR|TIERMINATOR)_[A-Z_]+)\b/g))
    names.push(...matches(text, /process\.env\.([A-Z_][A-Z0-9_]*)/g))
    if (path.basename(file) === 'session.js') names.push(...matches(text, /'(CLAUDE[A-Z_]*)'/g))
  }
  assert.ok(names.length > 0, 'no environment variables found under tools/grindinator')
  const missing = missingFrom(names)
  assert.deepEqual(missing, [], `the reference does not name these variables: ${missing.join(', ')}`)
})

test('the reference has an exit-code table row for every exit code', () => {
  const missing = Object.entries(EXIT)
    .filter(([, code]) => !new RegExp('^\\| `?' + code + '`? \\|', 'm').test(reference))
    .map(([name, code]) => `${code} (${name})`)
  assert.deepEqual(missing, [], `the reference has no exit-code table row for: ${missing.join(', ')}`)
})

test('the reference names every outcome', () => {
  const outcomes = ['complete', 'halted', 'limit', 'no-plan', 'declined', 'crashed', 'interrupted', 'unverified', 'gate-failed']
  const missing = missingFrom(outcomes)
  assert.deepEqual(missing, [], `the reference does not name these outcomes: ${missing.join(', ')}`)
})

test('the reference names every file', () => {
  const files = ['state.json', 'summary.md', 'stream.jsonl', 'stderr.txt', 'result.json', 'gate.stdout.txt', 'gate.stderr.txt',
    '~/.claude/grindinator.json', '.claude/grindinator.json']
  const missing = missingFrom(files)
  assert.deepEqual(missing, [], `the reference does not name these files: ${missing.join(', ')}`)
})

test('the reference contains every command', () => {
  const commands = ['grindinator run', 'grindinator status', 'grindinator reset', 'grindinator help']
  const missing = commands.filter((c) => !reference.includes(c))
  assert.deepEqual(missing, [], `the reference does not contain these commands: ${missing.join(', ')}`)
})

test('the reference lists every open item and known limitation', () => {
  const missing = []
  for (let n = 1; n <= 12; n++) if (!reference.includes(`| O-${n} |`)) missing.push(`O-${n}`)
  for (let n = 1; n <= 11; n++) if (!new RegExp(`\\bL-${n}\\b`).test(reference)) missing.push(`L-${n}`)
  assert.deepEqual(missing, [], `the reference is missing: ${missing.join(', ')}`)
})

test('the README names every key, flag, variable and key document', () => {
  const required = [
    ...Object.keys(DEFAULTS).map((k) => '`' + k + '`'),
    ...Object.values(FLAGS).map((f) => '--' + f.option),
    '--name', 'GRINDINATOR_DEBUG', 'bypassPermissions', 'grindinator-reference.md', 'grindinator-e2e-run.md',
  ]
  const missing = required.filter((s) => !readme.includes(s))
  assert.deepEqual(missing, [], `the README does not contain: ${missing.join(', ')}`)
})

test('no document holds a stale headless statement', () => {
  const files = [
    'docs/grindinator/Grindinator — Specification.md', 'docs/grindinator/grindinator-verification.md',
    'docs/grindinator/grindinator-reference.md', 'tools/grindinator/README.md', 'docs/decidinator/decidinator-reference.md',
    'docs/README.md', 'plugins/decidinator/README.md', 'plugins/decidinator/CLAUDE.md', 'CLAUDE.md',
  ]
  const stale = ['it does not work in `claude -p` today', 'README lists this as out of scope', 'so these runs need a person',
    'it needs a person, so it is not in CI', 'interactive session, so they run by hand']
  const found = []
  for (const f of files) {
    const text = read(...f.split('/'))
    for (const s of stale) if (text.includes(s)) found.push(`${f}: ${s}`)
  }
  assert.deepEqual(found, [], `stale headless statements remain: ${found.join('; ')}`)
})

test('the end-to-end run document has its results and step headings', () => {
  const file = path.join(root, 'docs', 'grindinator', 'grindinator-e2e-run.md')
  assert.ok(fs.existsSync(file), 'docs/grindinator/grindinator-e2e-run.md does not exist')
  const text = fs.readFileSync(file, 'utf8')
  const missing = ['## Results', '## Step 1: stub limit', '## Step 2: harness check'].filter((h) => !text.includes(h))
  assert.deepEqual(missing, [], `grindinator-e2e-run.md does not contain: ${missing.join(', ')}`)
})
