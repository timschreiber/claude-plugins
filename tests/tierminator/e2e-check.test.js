'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const lib = require('./e2e/lib.js')
const { setup } = require('./e2e/setup.js')
const checks = require('./e2e/checks.js')
const { gatherFacts, main } = require('./e2e/check.js')

function quiet(fn) {
  const log = console.log
  const err = console.error
  console.log = () => {}
  console.error = () => {}
  try {
    return fn()
  } finally {
    console.log = log
    console.error = err
  }
}

function fakeBase() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-e2e-check-'))
  const base = path.join(tmp, 'base')
  const info = setup(6, base)
  const repo = path.join(base, 'repo')
  for (const id of ['T01', 'T02', 'T03']) {
    fs.writeFileSync(path.join(repo, `${id}.txt`), id)
    lib.git(repo, 'add', '-A')
    lib.git(repo, 'commit', '-q', '-m', `Task ${id}`, '-m', `Tierminator-Task: ${id}`, '-m', 'Tierminator-Plan: abc')
  }
  const t0 = Date.parse('2026-01-01T00:00:00.000Z')
  const records = ['T01', 'T02', 'T03'].map((task, i) => ({
    kind: 'attempt',
    task,
    tier: 'haiku-high',
    attempt: 1,
    outcome: 'done',
    agentId: `agent-${i + 1}`,
    durationMs: 10000,
    at: new Date(t0 + (i + 1) * 10000).toISOString()
  }))
  fs.writeFileSync(path.join(base, 'plans', 'plan.telemetry.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n')
  fs.writeFileSync(path.join(base, 'result-run-1.json'), JSON.stringify({ outcome: 'complete' }))
  fs.mkdirSync(path.join(base, 'run-1'), { recursive: true })
  fs.writeFileSync(path.join(base, 'run-1', 'meta.json'), JSON.stringify({ exit: 0, timedOut: false, durationMs: 31000 }))
  fs.writeFileSync(
    path.join(base, 'run-1', 'snapshot.json'),
    JSON.stringify({ commits: lib.commitsOf(repo), branches: [], worktrees: [info.repo] })
  )
  return { tmp, base, info }
}

test('gatherFacts and main on a finished serial scenario', () => {
  const { tmp, base } = fakeBase()
  try {
    const facts = gatherFacts(6, base, { permissionLine: 'yes' })
    assert.strictEqual(facts.runs.length, 1)
    assert.deepStrictEqual(facts.runs[0], { exit: 0, timedOut: false, durationMs: 31000 })
    assert.deepStrictEqual(facts.results, [{ outcome: 'complete' }])
    assert.strictEqual(facts.snapshots.length, 1)
    assert.strictEqual(facts.snapshots[0].commits.length, 4)
    assert.strictEqual(facts.final.commits.length, 4)
    assert.strictEqual(facts.final.merges, 0)
    assert.strictEqual(facts.final.branch, 'main')
    assert.strictEqual(facts.final.status, '')
    assert.deepStrictEqual(facts.final.branches, [])
    assert.strictEqual(facts.final.worktrees.length, 1)
    assert.strictEqual(facts.final.files['src/registry.js'].includes('REGISTER-HERE'), true)
    assert.strictEqual(facts.telemetry.length, 3)
    assert.deepStrictEqual(facts.observed, { permissionLine: 'yes' })

    const list = checks.scenarioChecks(6, facts)
    for (const c of list) assert.strictEqual(c.ok, true, `${c.name}: ${c.detail}`)

    const resultsDir = path.join(tmp, 'results')
    assert.strictEqual(quiet(() => main(['6', base], { resultsDir })), 0)
    const out = path.join(resultsDir, 'scenario-6')
    const result = JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8'))
    assert.strictEqual(result.pass, true)
    assert.strictEqual(result.scenario, 6)
    assert.deepStrictEqual(result.finalCommits, ['fixture', 'Task T01', 'Task T02', 'Task T03'])
    assert.strictEqual(result.attempts.length, 3)
    assert.strictEqual(result.note, null)
    assert.ok(fs.existsSync(path.join(out, 'telemetry.jsonl')))

    fs.rmSync(path.join(base, 'plans', 'plan.telemetry.jsonl'))
    assert.strictEqual(quiet(() => main(['6', base], { resultsDir })), 1)
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(out, 'result.json'), 'utf8')).pass, false)

    assert.strictEqual(quiet(() => main(['9', base], { resultsDir })), 2)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
