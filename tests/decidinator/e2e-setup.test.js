'use strict'

// The end-to-end setup helpers: scenario prompts, fixture repos and the answers filled into an export.

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const lib = path.join(__dirname, '..', '..', 'plugins', 'decidinator', 'scripts', 'lib')
const decisionLog = require(path.join(lib, 'decision-log.js'))
const sidecar = require(path.join(lib, 'sidecar.js'))
const exporter = require(path.join(lib, 'export.js'))
const config = require(path.join(lib, 'config.js'))
const { normalizeQuestion } = require(path.join(lib, 'normalize.js'))
const { QUESTIONS, prompt } = require('./e2e/scenarios.js')
const { ANSWERS, setupRepo, fillAnswers } = require('./e2e/fixture.js')

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-e2e-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('prompt names the question and the result line', () => {
  assert.ok(prompt('1').includes(QUESTIONS.researchable.question))
  assert.ok(prompt('1').includes('RESULT: '))
  assert.ok(prompt('6').includes(QUESTIONS.specSilent.question))
  assert.equal(prompt('7'), null)
  assert.equal(prompt('9'), null)
})

test('setupRepo 7 seeds the log, the sidecar and one commit', (t) => {
  const dir = tmp(t)
  setupRepo('7', dir)
  const log = decisionLog.read(path.join(dir, 'docs', 'decisions.md'))
  assert.deepEqual(log.model.entries.map((e) => e.id), ['D-0001', 'D-0002', 'D-0003'])
  const d2 = log.model.entries[1].decision
  assert.equal(d2.provenance, 'oracle-provisional')
  assert.equal(d2.sidecar, 'Q-0002')
  const side = sidecar.read(path.join(dir, 'docs', 'open-questions.md'))
  assert.deepEqual(side.model.entries.map((e) => e.id), ['Q-0002', 'Q-0003'])
  for (const e of side.model.entries) {
    assert.equal(e.question.status, 'open')
    assert.deepEqual(e.question.dependsOn, ['e2e-seed'])
  }
  assert.equal(side.model.entries[0].question.stakeholder, 'Product team')
  const r = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: dir, encoding: 'utf8' })
  assert.equal(r.stdout.trim(), '1')
})

test('setupRepo 6 writes the two-rung config', (t) => {
  const dir = tmp(t)
  setupRepo('6', dir)
  const { config: c } = config.load({ projectDir: dir, homeDir: tmp(t) })
  assert.deepEqual(c.rungs, ['decidinator:oracle-1', 'decidinator:oracle-2'])
})

test('setupRepo 1 has no .claude and an empty sidecar', (t) => {
  const dir = tmp(t)
  setupRepo('1', dir)
  assert.equal(fs.existsSync(path.join(dir, '.claude')), false)
  const first = fs.readFileSync(path.join(dir, 'docs', 'open-questions.md'), 'utf8').split('\n')[0]
  assert.equal(first, '<!-- decidinator-sidecar v1 -->')
})

test('fillAnswers fills the blank answers once', (t) => {
  const base = tmp(t)
  const repo = path.join(base, 'repo')
  setupRepo('7', repo)
  const questions = sidecar.read(path.join(repo, 'docs', 'open-questions.md')).model.entries.map((e) => e.question)
  const text = exporter.render(questions.filter((q) => q.status === 'open'), { source: 'docs/open-questions.md', date: '2026-09-30' })
  fs.writeFileSync(path.join(repo, 'docs', 'stakeholders.md'), text)
  const file = fillAnswers(base)
  const filled = fs.readFileSync(file, 'utf8')
  const got = sidecar.answers(sidecar.parse(filled)).sort((a, b) => a.id.localeCompare(b.id))
  assert.deepEqual(got.map((a) => a.id), ['Q-0002', 'Q-0003'])
  for (const a of got) assert.equal(a.answer, ANSWERS[a.id])
  assert.equal(fs.readFileSync(path.join(base, 'stakeholders-exported.md'), 'utf8'), text)
  assert.equal(fs.readFileSync(path.join(base, 'stakeholders-answered.md'), 'utf8'), filled)
  assert.throws(() => fillAnswers(base))
})

test('the filled answers match or differ from the provisional ones', () => {
  assert.equal(normalizeQuestion(ANSWERS['Q-0002']), normalizeQuestion('Five lists, held in one named constant.'))
  assert.notEqual(normalizeQuestion(ANSWERS['Q-0003']), normalizeQuestion('In the order they were added.'))
})
