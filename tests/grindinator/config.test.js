'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { parseArgs } = require('node:util')

const config = require('../../tools/grindinator/lib/config.js')
const { GrindinatorError } = require('../../tools/grindinator/lib/errors.js')
const { DEFAULTS, load, loadStrict, fromFlags, parseArgsOptions, userFile, projectFile } = config

let root, home, project

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'grindinator-config-'))
  home = path.join(root, 'home')
  project = path.join(root, 'project')
  fs.mkdirSync(home)
  fs.mkdirSync(project)
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content))
}

test('no files and no flags give the defaults', () => {
  const { config: c, errors } = load({ projectDir: project, homeDir: home })
  assert.deepEqual(c, DEFAULTS)
  assert.deepEqual(errors, [])
})

test('precedence: defaults, user file, project file, flags', () => {
  write(userFile(home), { effort: 'high', model: 'sonnet', maxLimitWaits: 5 })
  write(projectFile(project), { effort: 'low' })
  const { config: c, errors } = load({ projectDir: project, homeDir: home, flags: { model: 'opus' } })
  assert.deepEqual(errors, [])
  assert.equal(c.effort, 'low')
  assert.equal(c.model, 'opus')
  assert.equal(c.maxLimitWaits, 5)
})

const INVALID = {
  permissionMode: ['plan', '"permissionMode" must be one of acceptEdits, bypassPermissions, default'],
  allowedTools: [['Read', ' '], '"allowedTools" must be an array of non-empty strings'],
  model: ['two words', '"model" must be a model name with no spaces, such as "opus"'],
  effort: ['extreme', '"effort" must be one of low, medium, high, xhigh, max'],
  maxTurns: [0, '"maxTurns" must be null or a whole number of at least 1'],
  gate: ['  ', '"gate" must be null or a non-empty command'],
  onFailure: ['retry', '"onFailure" must be "stop" or "continue"'],
  maxLimitWaits: [1.5, '"maxLimitWaits" must be a whole number of at least 1'],
  waitWeekly: ['yes', '"waitWeekly" must be true or false'],
  preamble: ['a\0b', '"preamble" must be null or a non-empty file path']
}

for (const [key, [bad, text]] of Object.entries(INVALID)) {
  test(`invalid ${key} in the project file is reported and not applied`, () => {
    write(projectFile(project), { [key]: bad })
    const { config: c, errors } = load({ projectDir: project, homeDir: home })
    assert.deepEqual(errors, [`${projectFile(project)}: ${text}`])
    assert.ok(errors[0].includes(`"${key}"`))
    assert.deepEqual(c[key], DEFAULTS[key])
  })
}

test('an unknown key is reported with its name and the file path', () => {
  write(projectFile(project), { efort: 'low' })
  const { errors } = load({ projectDir: project, homeDir: home })
  assert.deepEqual(errors, [`${projectFile(project)}: "efort" is not a Grindinator setting`])
})

test('invalid JSON, an array and null each give one error naming the file', () => {
  for (const text of ['{ nope', '[]', 'null']) {
    write(projectFile(project), text)
    const { errors } = load({ projectDir: project, homeDir: home })
    assert.equal(errors.length, 1)
    assert.ok(errors[0].startsWith(projectFile(project)))
  }
})

test('a BOM-prefixed file loads', () => {
  write(projectFile(project), '﻿{"effort":"high"}')
  const { config: c, errors } = load({ projectDir: project, homeDir: home })
  assert.deepEqual(errors, [])
  assert.equal(c.effort, 'high')
})

test('errors from both files and a flag are all reported', () => {
  write(userFile(home), { effort: 'bad' })
  write(projectFile(project), { onFailure: 'bad' })
  const { errors } = load({ projectDir: project, homeDir: home, flags: { 'max-turns': '0' } })
  assert.deepEqual(errors, [
    `${userFile(home)}: "effort" must be one of low, medium, high, xhigh, max`,
    `${projectFile(project)}: "onFailure" must be "stop" or "continue"`,
    '--max-turns: "maxTurns" must be null or a whole number of at least 1'
  ])
})

test('fromFlags converts values and load reports a bad integer', () => {
  assert.deepEqual(fromFlags({ 'allowed-tools': ' Read, Bash(git:*) ,,' }), { allowedTools: ['Read', 'Bash(git:*)'] })
  assert.deepEqual(fromFlags({ 'max-turns': '12' }), { maxTurns: 12 })
  assert.deepEqual(fromFlags({ 'max-turns': 'abc' }), { maxTurns: 'abc' })
  assert.deepEqual(fromFlags({ 'wait-weekly': true }), { waitWeekly: true })
  assert.deepEqual(fromFlags({}), {})
  const { errors } = load({ projectDir: project, homeDir: home, flags: { 'max-turns': 'abc' } })
  assert.deepEqual(errors, ['--max-turns: "maxTurns" must be null or a whole number of at least 1'])
})

test('parseArgsOptions works with parseArgs', () => {
  const { values } = parseArgs({ args: ['--wait-weekly', '--model', 'sonnet'], options: parseArgsOptions() })
  assert.deepEqual(fromFlags(values), { waitWeekly: true, model: 'sonnet' })
})

test('loadStrict throws GrindinatorError for an invalid key and returns the config otherwise', () => {
  write(projectFile(project), { effort: 'bad' })
  assert.throws(
    () => loadStrict({ projectDir: project, homeDir: home }),
    e => e instanceof GrindinatorError && e.exitCode === 2 && e.message.includes('"effort"')
  )
  write(projectFile(project), { effort: 'high' })
  assert.equal(loadStrict({ projectDir: project, homeDir: home }).effort, 'high')
})
