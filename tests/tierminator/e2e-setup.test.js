'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { setup } = require('./e2e/setup.js')
const lib = require('./e2e/lib.js')
const tasks = require('../../plugins/tierminator/scripts/lib/tasks.js')

function freshBase() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-setup-test-')), 'base')
}

test('setup(6) builds the repo, plan and scenario.json', () => {
  const base = freshBase()
  const r = setup(6, base)
  const repo = path.join(base, 'repo')
  const commits = lib.commitsOf(repo)
  assert.equal(commits.length, 1)
  assert.equal(commits[0].subject, 'fixture')
  assert.equal(lib.git(repo, 'status', '--porcelain'), '')
  for (const f of ['.gitattributes', 'scripts/gate.js', 'CLAUDE.md']) {
    assert.ok(fs.existsSync(path.join(repo, f)), f)
  }
  const parsed = tasks.parsePlan(fs.readFileSync(path.join(base, 'plans', 'plan.md'), 'utf8'))
  assert.equal(parsed.ok, true)
  const info = JSON.parse(fs.readFileSync(path.join(base, 'scenario.json'), 'utf8'))
  assert.equal(info.scenario, 6)
  assert.equal(info.runs, 1)
  assert.equal(info.permissionMode, 'bypassPermissions')
  assert.equal(r.base, path.resolve(base))
  assert.throws(() => setup(6, base))
})

test('setup(4) writes a marker path that does not exist', () => {
  const base = freshBase()
  const info = setup(4, base)
  assert.ok(info.marker.endsWith('/marker/s4'))
  assert.equal(fs.existsSync(info.marker), false)
  assert.equal(info.fixBetween, true)
})

test('setup rejects an unknown scenario', () => {
  assert.throws(() => setup(9, freshBase()), /unknown scenario/)
})
