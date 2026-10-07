'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const helpers = require('./helpers.js')
const { setup } = require('./e2e/setup.js')

const SCRIPT = path.join(__dirname, 'e2e', 'setup.js')
const mds = dir => fs.readdirSync(dir).filter(n => n.endsWith('.md'))

test('pilot builds a clean one-commit repo and three packages', () => {
  const base = path.join(helpers.tempDir('grind-e2e-'), 'b')
  try {
    const r = setup('pilot', base)
    assert.equal(helpers.git(r.repo, 'rev-list', '--count', 'HEAD'), '1')
    assert.equal(helpers.git(r.repo, 'status', '--porcelain'), '')
    assert.ok(fs.existsSync(path.join(r.repo, 'src', 'words.js')))
    assert.ok(fs.existsSync(path.join(r.repo, 'test', 'words.test.js')))
    assert.equal(mds(r.packages).length, 3)
    assert.equal(r.scenario, null)
  } finally { helpers.remove(path.dirname(base)) }
})

test('harness builds one package and no plan', () => {
  const base = path.join(helpers.tempDir('grind-e2e-'), 'b')
  try {
    const r = setup('harness', base)
    assert.equal(mds(r.packages).length, 1)
    assert.equal(fs.existsSync(path.join(base, 'plan.md')), false)
  } finally { helpers.remove(path.dirname(base)) }
})

test('stub-limit writes the plan and the scenario', () => {
  const base = path.join(helpers.tempDir('grind-e2e-'), 'b')
  try {
    const r = setup('stub-limit', base)
    const scenario = JSON.parse(fs.readFileSync(r.scenario, 'utf8'))
    assert.equal(scenario.sequence.length, 2)
    assert.equal(scenario.sequence[0].resultFile.planFile, path.join(base, 'plan.md'))
    assert.ok(scenario.sequence[0].resultFile.limit.resetsAt > Date.now() / 1000)
    assert.ok(fs.existsSync(path.join(base, 'plan.md')))
  } finally { helpers.remove(path.dirname(base)) }
})

test('the CLI rejects bad input and succeeds on a new base', () => {
  const root = helpers.tempDir('grind-e2e-')
  try {
    const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
    assert.equal(run('bogus', path.join(root, 'x')).status, 2)
    fs.writeFileSync(path.join(root, 'f.txt'), 'x')
    assert.equal(run('pilot', root).status, 2)
    const ok = run('pilot', path.join(root, 'new'))
    assert.equal(ok.status, 0)
    assert.ok(ok.stdout.includes('ready:'))
  } finally { helpers.remove(root) }
})
