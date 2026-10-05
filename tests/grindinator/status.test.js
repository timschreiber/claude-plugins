// Tests for the Grindinator status and reset commands.
'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const helpers = require('./helpers.js')
const { formatTable, status, reset } = require('../../tools/grindinator/lib/status.js')
const { run } = require('../../tools/grindinator/lib/run.js')
const state = require('../../tools/grindinator/lib/state.js')
const { GrindinatorError } = require('../../tools/grindinator/lib/errors.js')

const NAMES = ['WP-01 · One.md', 'WP-02 · Two.md', 'WP-03 · Three.md']

function setup() {
  const repo = helpers.makeRepo()
  helpers.writePackages(path.join(repo, 'wp'), NAMES)
  helpers.git(repo, 'add', '-A')
  helpers.git(repo, 'commit', '-q', '-m', 'packages')
  return repo
}

test('formatTable pads all but the last column', () => {
  assert.deepEqual(formatTable([['A', 'BB', 'x'], ['CCC', 'D', 'yy']]), ['A    BB  x', 'CCC  D   yy'])
})

test('status without state or packagesDir explains how to start', async () => {
  const repo = setup()
  try {
    const lines = []
    assert.equal(await status({ cwd: repo, out: l => lines.push(l) }), 0)
    assert.deepEqual(lines, ['No Grindinator run here yet; start one with: grindinator run <packages dir>'])
  } finally {
    helpers.remove(repo)
  }
})

test('status with packagesDir and no state lists pending packages', async () => {
  const repo = setup()
  try {
    const lines = []
    assert.equal(await status({ cwd: repo, packagesDir: 'wp', out: l => lines.push(l) }), 0)
    assert.equal(lines.length, 4)
    assert.deepEqual(lines[0].split(/\s{2,}/), ['PACKAGE', 'STATE', 'ATTEMPTS', 'TITLE'])
    assert.deepEqual(lines.slice(1).map(l => l.split(/\s{2,}/)), [
      ['WP-01', 'pending', '0', 'One'],
      ['WP-02', 'pending', '0', 'Two'],
      ['WP-03', 'pending', '0', 'Three'],
    ])
  } finally {
    helpers.remove(repo)
  }
})

test('status with a run reports the run and each package', async () => {
  const repo = setup()
  const home = helpers.tempDir('grind-home-')
  try {
    await run({ cwd: repo, homeDir: home, packagesDir: 'wp', name: 'test', out: () => {}, err: () => {} })
    state.markDone(repo, 'WP-02')
    const st = state.read(repo)
    st.packages['WP-03'].status = 'failed'
    st.packages['WP-03'].attempts = [{}]
    state.write(repo, st)
    const lines = []
    assert.equal(await status({ cwd: repo, out: l => lines.push(l) }), 0)
    assert.equal(lines[0], 'Run test on branch grindinator/test.')
    assert.deepEqual(lines[1].split(/\s{2,}/), ['PACKAGE', 'STATE', 'ATTEMPTS', 'TITLE'])
    assert.equal(lines.length, 5)
    assert.deepEqual(lines.slice(2).map(l => l.split(/\s{2,}/)), [
      ['WP-01', 'pending', '0', 'One'],
      ['WP-02', 'done', '0', 'Two'],
      ['WP-03', 'failed', '1', 'Three'],
    ])
  } finally {
    helpers.remove(repo)
    helpers.remove(home)
  }
})

test('reset clears the marker and rejects a bad id', async () => {
  const repo = setup()
  const home = helpers.tempDir('grind-home-')
  try {
    await run({ cwd: repo, homeDir: home, packagesDir: 'wp', name: 'test', out: () => {}, err: () => {} })
    state.markDone(repo, 'WP-02')
    const st = state.read(repo)
    st.packages['WP-02'].status = 'done'
    state.write(repo, st)
    const lines = []
    const out = l => lines.push(l)
    assert.equal(await reset({ cwd: repo, id: 'WP-02', out }), 0)
    assert.equal(state.isDone(repo, 'WP-02'), false)
    assert.equal(state.read(repo).packages['WP-02'].status, 'pending')
    assert.equal(lines[0], 'Cleared the done marker for WP-02; the next run repeats it.')
    await reset({ cwd: repo, id: 'WP-02', out })
    assert.equal(lines[1], 'WP-02 has no done marker; nothing to clear.')
    await assert.rejects(reset({ cwd: repo, id: 'bogus', out }), e => e instanceof GrindinatorError && e.exitCode === 2)
  } finally {
    helpers.remove(repo)
    helpers.remove(home)
  }
})
