'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const sidecar = require('../../plugins/planandtier/scripts/lib/sidecar.js')
const { parsePlan } = require('../../plugins/planandtier/scripts/lib/tasks.js')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planandtier-sidecar-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const task = (n, over = {}) => ({
  id: `T${String(n).padStart(2, '0')}`,
  title: `Task ${n}`,
  model: 'sonnet',
  effort: 'medium',
  prompt: 'Read docs/spec.md. Do the work. Verify: node --test passes.',
  ...over,
})
const body = tasks => JSON.stringify({ tasks }, null, 2)
const planText = (tasks, eol = '\n') =>
  ['# Plan', '', 'Prose.', '', '## Tasks', '', '```json tiered-tasks', body(tasks), '```', ''].join('\n').replace(/\n/g, eol)
const writePlan = text => {
  const file = path.join(dir, 'plan.md')
  fs.writeFileSync(file, text)
  return file
}

test('sidecarPath puts <name>.tasks.json beside the plan', () => {
  assert.equal(sidecar.sidecarPath(path.join(dir, 'brave-fox.md')), path.join(dir, 'brave-fox.tasks.json'))
})

test('hashOf is the first 16 hex characters of the sha256', () => {
  const full = crypto.createHash('sha256').update('abc', 'utf8').digest('hex')
  assert.equal(sidecar.hashOf('abc'), full.slice(0, 16))
})

test('moveBlock writes the exact block body to the tasks file and the section to the plan', () => {
  const tasks = [task(1), task(2, { title: 'Pipe | here' })]
  const text = planText(tasks)
  const planFile = writePlan(text)
  assert.equal(sidecar.moveBlock(planFile, text, tasks), true)

  const tasksFile = sidecar.sidecarPath(planFile)
  assert.equal(fs.readFileSync(tasksFile, 'utf8'), body(tasks))
  const plan = fs.readFileSync(planFile, 'utf8')
  assert.ok(!plan.includes('```json tiered-tasks'))
  assert.ok(plan.includes('| T02 | Pipe \\| here |'))
  const { file, hash } = parsePlan(plan).section
  assert.deepEqual({ file, hash }, { file: tasksFile, hash: sidecar.hashOf(body(tasks)) })
  assert.deepEqual(fs.readdirSync(dir).sort(), ['plan.md', 'plan.tasks.json'])
})

test('moveBlock keeps a CRLF plan CRLF, and the tasks file matches its hash', () => {
  const tasks = [task(1)]
  const text = planText(tasks, '\r\n')
  const planFile = writePlan(text)
  assert.equal(sidecar.moveBlock(planFile, text, tasks), true)
  const plan = fs.readFileSync(planFile, 'utf8')
  assert.equal(plan.replace(/\r\n/g, '').includes('\n'), false)
  const r = sidecar.resolvePlan(plan)
  assert.equal(r.ok, true)
  assert.deepEqual(r.tasks, tasks)
})

test('moveBlock leaves the plan unchanged when the plan cannot be written', () => {
  const tasks = [task(1)]
  const text = planText(tasks)
  const missingDir = path.join(dir, 'nope', 'plan.md')
  assert.equal(sidecar.moveBlock(missingDir, text, tasks), false)
  assert.equal(sidecar.moveBlock(writePlan('# no block\n'), '# no block\n', tasks), false)
})

test('resolvePlan loads the tasks from the tasks file', () => {
  const tasks = [task(1), task(2)]
  const text = planText(tasks)
  const planFile = writePlan(text)
  sidecar.moveBlock(planFile, text, tasks)
  const r = sidecar.resolvePlan(fs.readFileSync(planFile, 'utf8'))
  assert.equal(r.ok, true)
  assert.deepEqual(r.tasks, tasks)
  assert.equal(r.section.file, sidecar.sidecarPath(planFile))
  assert.equal(r.problem, undefined)
})

test('resolvePlan reports a missing, changed or invalid tasks file', () => {
  const tasks = [task(1)]
  const text = planText(tasks)
  const planFile = writePlan(text)
  sidecar.moveBlock(planFile, text, tasks)
  const plan = fs.readFileSync(planFile, 'utf8')
  const tasksFile = sidecar.sidecarPath(planFile)

  fs.writeFileSync(tasksFile, body([task(1, { effort: 'high' })]))
  const changed = sidecar.resolvePlan(plan)
  assert.deepEqual([changed.ok, changed.problem], [false, 'changed'])
  assert.match(changed.errors[0], /has changed since its table was written/)

  fs.rmSync(tasksFile)
  const missing = sidecar.resolvePlan(plan)
  assert.deepEqual([missing.ok, missing.problem], [false, 'missing'])

  const bad = '{"tasks": [{"id": "T01"}]}'
  fs.writeFileSync(tasksFile, bad)
  const invalid = sidecar.resolvePlan(plan.replace(/sha256 `[0-9a-f]{16}`/, `sha256 \`${sidecar.hashOf(bad)}\``))
  assert.deepEqual([invalid.ok, invalid.problem], [false, 'invalid'])
  assert.match(invalid.errors[0], /T01\.title: must be a string/)
})

test('resolvePlan rejects a table edited by hand, even though the tasks file is unchanged', () => {
  const tasks = [task(1), task(2)]
  const text = planText(tasks)
  const planFile = writePlan(text)
  sidecar.moveBlock(planFile, text, tasks)
  const plan = fs.readFileSync(planFile, 'utf8')

  const edits = [
    plan.replace('| T02 | Task 2 |', '| T02 | Task 2 renamed |'),
    plan.replace('| T02 | Task 2 | sonnet | medium |', '| T02 | Task 2 | opus | high |'),
    plan.replace(/\| T02 [^\n]*\n/, ''),
    plan.replace(/(\| T02 [^\n]*\n)/, '$1| T03 | Task 3 | sonnet | medium | 10 chars |\n'),
  ]
  for (const edited of edits) {
    assert.notEqual(edited, plan)
    const r = sidecar.resolvePlan(edited)
    assert.deepEqual([r.ok, r.problem], [false, 'edited'])
    assert.match(r.errors[0], /does not match its tasks file .*; the table was edited/)
  }
  assert.equal(sidecar.resolvePlan(plan.replace(/\n/g, '  \r\n')).ok, true, 'trailing spaces and CRLF are not edits')
})

test('resolvePlan passes an ordinary plan straight through', () => {
  const r = sidecar.resolvePlan(planText([task(1)]))
  assert.deepEqual([r.ok, r.tasks.length, r.section], [true, 1, undefined])
  assert.equal(sidecar.resolvePlan('').ok, false)
})
