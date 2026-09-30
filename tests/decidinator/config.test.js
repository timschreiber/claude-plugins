'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const config = require('../../plugins/decidinator/scripts/lib/config.js')
const { DEFAULTS, load, projectDir, forInput, userFile, projectFile } = config

let root, home, project

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-config-'))
  home = path.join(root, 'home')
  project = path.join(root, 'project')
  fs.mkdirSync(home)
  fs.mkdirSync(project)
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
  delete process.env.CLAUDE_PROJECT_DIR
})

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content))
}

const writeUser = content => write(userFile(home), content)
const writeProject = content => write(projectFile(project), content)
const run = () => load({ projectDir: project, homeDir: home })

function defaultsCopy() {
  return { ...DEFAULTS, rungs: [...DEFAULTS.rungs] }
}

test('no files gives the defaults and no warnings', () => {
  const { config: c, warnings } = run()
  assert.deepEqual(c, defaultsCopy())
  assert.deepEqual(warnings, [])
})

test('project overrides user per key, and rungs are replaced whole', () => {
  writeUser({ mode: 'sidecar', guardMaxBlocks: 5 })
  writeProject({ mode: 'ask' })
  const { config: c, warnings } = run()
  assert.equal(c.mode, 'ask')
  assert.equal(c.guardMaxBlocks, 5)
  assert.deepEqual({ ...c, mode: 'x', guardMaxBlocks: 0 }, { ...defaultsCopy(), mode: 'x', guardMaxBlocks: 0 })
  assert.deepEqual(warnings, [])

  writeUser({ rungs: ['a:b', 'c'] })
  writeProject({ rungs: ['x'] })
  assert.deepEqual(run().config.rungs, ['x'])
})

const BAD = [
  ['mode', 'loud', '"mode" must be "ask" or "sidecar"'],
  ['mode', 1, '"mode" must be "ask" or "sidecar"'],
  ['rungs', [], '"rungs" must be a non-empty array of agent names such as "decidinator:oracle-1"'],
  ['rungs', ['bad name'], '"rungs" must be a non-empty array of agent names such as "decidinator:oracle-1"'],
  ['rungs', ['a', 'a'], '"rungs" must not name the same agent twice'],
  ['decisionLog', '', '"decisionLog" must be a non-empty file path'],
  ['decisionLog', 5, '"decisionLog" must be a non-empty file path'],
  ['sidecar', '   ', '"sidecar" must be a non-empty file path'],
  ['sidecar', null, '"sidecar" must be a non-empty file path'],
  ['guardMaxBlocks', 0, '"guardMaxBlocks" must be a whole number of at least 1'],
  ['guardMaxBlocks', 2.5, '"guardMaxBlocks" must be a whole number of at least 1'],
  ['nudgeOnPlainTextQuestions', 'yes', '"nudgeOnPlainTextQuestions" must be true or false'],
  ['nudgeOnPlainTextQuestions', 1, '"nudgeOnPlainTextQuestions" must be true or false']
]

for (const [key, value, message] of BAD) {
  test(`invalid ${key} ${JSON.stringify(value)} is ignored with a warning`, () => {
    writeProject({ [key]: value })
    const { config: c, warnings } = run()
    assert.deepEqual(c[key], DEFAULTS[key])
    assert.deepEqual(warnings, [`${projectFile(project)}: ${message}`])
    assert.ok(warnings[0].includes(`"${key}"`))
  })
}

test('an invalid project value falls back to the valid user value', () => {
  writeUser({ mode: 'sidecar' })
  writeProject({ mode: 'loud' })
  const { config: c, warnings } = run()
  assert.equal(c.mode, 'sidecar')
  assert.equal(warnings.length, 1)
  assert.ok(warnings[0].includes('"mode"'))
})

test('valid keys beside an invalid one still apply', () => {
  writeProject({ guardMaxBlocks: 7, mode: 'loud' })
  const { config: c } = run()
  assert.equal(c.guardMaxBlocks, 7)
  assert.equal(c.mode, 'ask')
})

test('an unknown key is reported and ignored', () => {
  const file = projectFile(project)
  writeProject({ guardMaxBlock: 4 })
  const { config: c, warnings } = run()
  assert.deepEqual(warnings, [`${file}: "guardMaxBlock" is not a Decidinator setting`])
  assert.deepEqual(c, defaultsCopy())
})

test('warnings from both files are reported, user file first', () => {
  writeUser({ mode: 'loud' })
  writeProject({ guardMaxBlocks: 0 })
  const { warnings } = run()
  assert.equal(warnings.length, 2)
  assert.ok(warnings[0].startsWith(userFile(home)))
  assert.ok(warnings[1].startsWith(projectFile(project)))
})

test('invalid JSON, an array and null give warnings and the other file still applies', () => {
  const cases = [
    ['{nope', 'is not valid JSON'],
    ['[1]', 'must hold a JSON object'],
    ['null', 'must hold a JSON object']
  ]
  for (const [text, message] of cases) {
    writeUser(text)
    writeProject({ guardMaxBlocks: 4 })
    const { config: c, warnings } = run()
    assert.deepEqual(warnings, [`${userFile(home)}: ${message}`])
    assert.equal(c.guardMaxBlocks, 4)
  }
})

test('a file starting with a BOM loads', () => {
  writeProject('﻿' + JSON.stringify({ mode: 'sidecar' }))
  const { config: c, warnings } = run()
  assert.equal(c.mode, 'sidecar')
  assert.deepEqual(warnings, [])
})

test('decisionLog and sidecar naming the same file fall back to the defaults', () => {
  writeProject({ decisionLog: 'docs/x.md', sidecar: './docs/x.md' })
  const { config: c, warnings } = run()
  assert.equal(c.decisionLog, DEFAULTS.decisionLog)
  assert.equal(c.sidecar, DEFAULTS.sidecar)
  assert.deepEqual(warnings, ['"decisionLog" and "sidecar" must name different files; the defaults are used'])
})

test('homeDir equal to projectDir reports a warning once', () => {
  write(projectFile(home), { mode: 'loud' })
  const { warnings } = load({ projectDir: home, homeDir: home })
  assert.equal(warnings.length, 1)
})

test('projectDir prefers CLAUDE_PROJECT_DIR, then cwd', () => {
  delete process.env.CLAUDE_PROJECT_DIR
  assert.equal(projectDir({ cwd: '/c' }), '/c')
  process.env.CLAUDE_PROJECT_DIR = '/env'
  assert.equal(projectDir({ cwd: '/c' }), '/env')
})

test('forInput reads the project file from CLAUDE_PROJECT_DIR', () => {
  process.env.CLAUDE_PROJECT_DIR = project
  writeProject({ mode: 'sidecar' })
  assert.equal(forInput({}).config.mode, 'sidecar')
})
