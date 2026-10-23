'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { waveOf, waves, startable, maxParallel, DEFAULT_MAX_PARALLEL } = require('../../plugins/tierminator/scripts/lib/waves.js')

const t = (n, after) => ({ id: `T${String(n).padStart(2, '0')}`, after })
const DIAMOND = [t(1, []), t(2, ['T01']), t(3, ['T01']), t(4, ['T02', 'T03'])]

test('a chain has one task per wave', () => {
  assert.deepEqual(waves([t(1, []), t(2, ['T01']), t(3, ['T02'])]), [['T01'], ['T02'], ['T03']])
})

test('independent tasks share wave 1', () => {
  assert.deepEqual(waves([t(1, []), t(2, []), t(3, [])]), [['T01', 'T02', 'T03']])
})

test('a diamond has three waves', () => {
  assert.deepEqual(waves(DIAMOND), [['T01'], ['T02', 'T03'], ['T04']])
  assert.equal(waveOf(DIAMOND, 'T04'), 3)
  assert.equal(waveOf(DIAMOND, 'T02'), 2)
})

test('a task waits for its deepest dependency', () => {
  const tasks = [t(1, []), t(2, []), t(3, ['T01']), t(4, ['T02']), t(5, ['T03', 'T04']), t(6, ['T02'])]
  assert.deepEqual(waves(tasks), [['T01', 'T02'], ['T03', 'T04', 'T06'], ['T05']])
})

test('done tasks count as satisfied and are left out', () => {
  assert.deepEqual(waves(DIAMOND, ['T01']), [['T02', 'T03'], ['T04']])
  assert.deepEqual(waves(DIAMOND, ['T01', 'T02']), [['T03'], ['T04']])
  assert.deepEqual(waves(DIAMOND, ['T01', 'T02', 'T03', 'T04']), [])
  assert.equal(waveOf(DIAMOND, 'T04', ['T01']), 2)
  assert.equal(waveOf(DIAMOND, 'T01', ['T01']), null)
  assert.equal(waveOf(DIAMOND, 'T99'), null)
})

test('a task without after depends on the one before it', () => {
  assert.deepEqual(waves([{ id: 'T01' }, { id: 'T02' }, { id: 'T03' }]), [['T01'], ['T02'], ['T03']])
})

test('startable gives the queued ids that fit under the cap', () => {
  assert.deepEqual(startable(['T02', 'T03', 'T04'], [], 2), ['T02', 'T03'])
  assert.deepEqual(startable(['T02', 'T03', 'T04'], ['T01'], 2), ['T02'])
  assert.deepEqual(startable(['T02', 'T03', 'T04'], ['T01', 'T05'], 2), [])
  assert.deepEqual(startable(['T02', 'T03', 'T04'], [], 0), [])
  assert.deepEqual(startable(['T02', 'T03', 'T04'], [], NaN), [])
  assert.deepEqual(startable(['T02', 'T03', 'T04'], [], 2.5), [])
  assert.deepEqual(startable(['T02', 'T03'], ['T02'], 5), ['T03'])
  assert.deepEqual(startable([], [], 5), [])
})

test('maxParallel reads TIERMINATOR_MAX_PARALLEL', () => {
  assert.equal(DEFAULT_MAX_PARALLEL, 5)
  assert.equal(maxParallel({}), 5)
  assert.equal(maxParallel({ TIERMINATOR_MAX_PARALLEL: '3' }), 3)
  assert.equal(maxParallel({ TIERMINATOR_MAX_PARALLEL: ' 7 ' }), 7)
  assert.equal(maxParallel({ TIERMINATOR_MAX_PARALLEL: '12' }), 12)
  for (const bad of ['0', '-2', '2.5', 'abc', '', '08']) {
    assert.equal(maxParallel({ TIERMINATOR_MAX_PARALLEL: bad }), 5, bad)
  }
})
