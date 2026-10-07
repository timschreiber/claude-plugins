'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const h = require('./helpers.js')
const { load } = require('./e2e/check.js')

const CHECK = path.join(__dirname, 'e2e', 'check.js')
const cli = (...args) => spawnSync(process.execPath, [CHECK, ...args], { encoding: 'utf8', windowsHide: true })

function makeRun() {
  const repo = h.makeRepo()
  fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '.grindinator/\n')
  const grind = path.join(repo, '.grindinator')
  fs.mkdirSync(path.join(grind, 'runs', 'WP-01', 'attempt-1'), { recursive: true })
  const state = {
    version: 1,
    branch: 'main',
    baseCommit: h.git(repo, 'rev-parse', 'HEAD'),
    packages: { 'WP-01': { status: 'done', attempts: [{ n: 1, outcome: 'complete', gate: { status: 'passed' } }] } }
  }
  fs.writeFileSync(path.join(grind, 'state.json'), JSON.stringify(state))
  const lines = [
    h.INIT,
    { type: 'result', subtype: 'success', result: 'first' },
    { type: 'result', subtype: 'success', result: 'second' }
  ]
  fs.writeFileSync(path.join(grind, 'runs', 'WP-01', 'attempt-1', 'stream.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
  return repo
}

test('no arguments exits 2', () => {
  assert.strictEqual(cli().status, 2)
})

test('an unknown step exits 2', () => {
  assert.strictEqual(cli('nope', os_tmp()).status, 2)
})

function os_tmp() {
  return require('os').tmpdir()
}

test('compare prints both tags', () => {
  const dir = h.tempDir('grind-cmp-')
  try {
    const a = path.join(dir, 'a.json')
    const b = path.join(dir, 'b.json')
    fs.writeFileSync(a, JSON.stringify({ tag: 'alpha', metrics: { packages: {} } }))
    fs.writeFileSync(b, JSON.stringify({ tag: 'beta', metrics: { packages: {} } }))
    const r = cli('compare', a, b)
    assert.strictEqual(r.status, 0)
    assert.ok(r.stdout.includes('alpha') && r.stdout.includes('beta'))
  } finally {
    h.remove(dir)
  }
})

test('load reads state, git and stream', () => {
  const repo = makeRun()
  try {
    const x = load(repo)
    assert.strictEqual(x.state.version, 1)
    assert.strictEqual(x.branch, 'main')
    assert.strictEqual(x.porcelain, '')
    assert.strictEqual(x.attempts['WP-01'][0].lastResult.result, 'second')
  } finally {
    h.remove(repo)
  }
})

test('the harness CLI fails a run missing its checks and writes result.json', () => {
  const repo = makeRun()
  const out = h.tempDir('grind-out-')
  try {
    const r = cli('harness', repo, '--exit', '0', '--out', out)
    assert.strictEqual(r.status, 1, r.stderr)
    const res = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8'))
    assert.strictEqual(res.step, 'harness')
    assert.strictEqual(res.pass, false)
  } finally {
    h.remove(repo)
    h.remove(out)
  }
})
