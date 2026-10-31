'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { SCENARIOS, buildPlan } = require('./e2e/scenarios.js')
const tasks = require('../../plugins/tierminator/scripts/lib/tasks.js')
const waves = require('../../plugins/tierminator/scripts/lib/waves.js')

const MARKER = 'C:/tmp/m'
const EXPECTED_WAVES = {
  1: [['T01', 'T02', 'T03']],
  2: [['T01', 'T02']],
  3: [['T01', 'T02', 'T03']],
  4: [['T01', 'T02', 'T03'], ['T04']],
  5: [['T01', 'T02'], ['T03']],
  6: [['T01'], ['T02'], ['T03']],
  7: [['T01', 'T02', 'T03']],
  8: [['T01', 'T02', 'T03']],
}

const parse = n => tasks.parsePlan(buildPlan(n, { marker: MARKER }))

for (let n = 1; n <= 8; n++) {
  test(`scenario ${n} parses with the expected graph and waves`, () => {
    const result = parse(n)
    assert.equal(result.ok, true, JSON.stringify(result.errors))
    assert.equal(result.graph, n !== 6)
    assert.deepEqual(waves.waves(result.tasks), EXPECTED_WAVES[n])
  })
}

test('scenario 4 T02 runs on opus high and carries the marker', () => {
  const t02 = parse(4).tasks.find(t => t.id === 'T02')
  assert.equal(t02.model, 'opus')
  assert.equal(t02.effort, 'high')
  assert.ok(t02.prompt.includes(MARKER))
})

test('scenario 3 T01 runs on sonnet medium and carries the marker', () => {
  const t01 = parse(3).tasks.find(t => t.id === 'T01')
  assert.equal(t01.model, 'sonnet')
  assert.equal(t01.effort, 'medium')
  assert.ok(t01.prompt.includes(MARKER))
})

test('scenario 5 plan verify runs the gate with the marker', () => {
  const { verify } = parse(5)
  assert.ok(verify.includes(MARKER))
  assert.ok(verify.includes('gate.js'))
})

test('scenarios 1, 6, 7 and 8 contain no marker text', () => {
  for (const n of [1, 6, 7, 8]) {
    assert.ok(!buildPlan(n, { marker: MARKER }).includes(MARKER), `scenario ${n}`)
  }
})

test('scenarios 4 and 5 run twice with a fix between; the others run once', () => {
  for (let n = 1; n <= 8; n++) {
    const two = n === 4 || n === 5
    assert.equal(SCENARIOS[n].runs, two ? 2 : 1, `scenario ${n} runs`)
    assert.equal(SCENARIOS[n].fixBetween, two ? true : false, `scenario ${n} fixBetween`)
  }
})

test('buildPlan rejects an unknown scenario', () => {
  assert.throws(() => buildPlan(9, { marker: MARKER }))
})
