'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const sizing = require('../../plugins/tierminator/scripts/lib/sizing.js')

const { MAX_FILES, MAX_PROMPT, MAX_REVIEWS, filesToChange, flags, kept, review, reviewText } = sizing

const task = (n, over = {}) => ({
  id: `T${String(n).padStart(2, '0')}`,
  title: `Task ${n}`,
  model: 'sonnet',
  effort: 'medium',
  prompt: 'Read docs/spec.md.\nFiles to change: a.js\nVerify: node --test passes.',
  ...over,
})
const filesLine = n => `Files to change: ${Array.from({ length: n }, (_, i) => `f${i}.js`).join(', ')}`
// A prompt with a Files line and exactly `len` characters.
const promptOf = len => {
  const head = 'Files to change: a.js\n'
  return head + 'x'.repeat(len - head.length)
}

test('the limits', () => {
  assert.equal(MAX_FILES, 4)
  assert.deepEqual(MAX_PROMPT, { sonnet: 4000, opus: 5000 })
  assert.equal(MAX_REVIEWS, 2)
})

test('filesToChange splits the first Files to change line on commas, trimming and dropping empties', () => {
  assert.deepEqual(filesToChange('Read x.\nFiles to change: a.js, b.js ,, c.js,\nVerify: y'), ['a.js', 'b.js', 'c.js'])
  assert.deepEqual(filesToChange('  files TO change:\ta.js'), ['a.js'])
  assert.deepEqual(filesToChange('Files to change: a.js\nFiles to change: b.js'), ['a.js'])
  assert.deepEqual(filesToChange('Files to change:'), [])
  assert.equal(filesToChange('Read x.\nVerify: y'), null)
  assert.equal(filesToChange('The Files to change: a.js'), null, 'must start the line')
  assert.equal(filesToChange(undefined), null)
})

test('flags: a task with no Files to change line', () => {
  assert.deepEqual(flags(task(1, { prompt: 'Do it. Verify: x' })), ['has no "Files to change:" line'])
})

test('flags: files, at and just over the limit', () => {
  assert.deepEqual(flags(task(1, { prompt: `${filesLine(MAX_FILES)}\nVerify: x` })), [])
  assert.deepEqual(flags(task(1, { prompt: `${filesLine(MAX_FILES + 1)}\nVerify: x` })), [
    'changes 5 files (guideline: at most 4)',
  ])
})

test('flags: an opus task is not flagged for its files', () => {
  const none = 'Do it. Verify: x'
  const many = `${filesLine(MAX_FILES + 2)}\nVerify: x`
  assert.deepEqual(flags(task(1, { model: 'opus', effort: 'medium', prompt: none })), [])
  assert.deepEqual(flags(task(1, { model: 'opus', effort: 'medium', prompt: many })), [])
  assert.deepEqual(flags(task(1, { model: 'sonnet', effort: 'medium', prompt: none })), ['has no "Files to change:" line'])
  assert.deepEqual(flags(task(1, { model: 'sonnet', effort: 'medium', prompt: many })), [
    'changes 6 files (guideline: at most 4)',
  ])
})

test('flags: an opus task still gets the prompt-length and title flags', () => {
  assert.deepEqual(flags(task(1, { model: 'opus', effort: 'medium', title: 'A and B', prompt: 'x'.repeat(5001) })), [
    'has a 5,001-character prompt (guideline: at most 5000 for opus)',
    'has "and", "then" or ";" in its title, which suggests two changes',
  ])
})

test('review skips an opus task with no Files line', () => {
  assert.deepEqual(review([task(1, { model: 'opus', effort: 'medium', prompt: 'no files line' })], ''), [])
})

test('flags: prompt length, at and just over the limit for each model', () => {
  for (const model of ['sonnet', 'opus']) {
    const max = MAX_PROMPT[model]
    assert.deepEqual(flags(task(1, { model, prompt: promptOf(max) })), [], `${model} at the limit`)
    assert.deepEqual(
      flags(task(1, { model, prompt: promptOf(max + 1) })),
      [`has a ${(max + 1).toLocaleString('en-US')}-character prompt (guideline: at most ${max} for ${model})`],
      `${model} over the limit`
    )
  }
})

test('flags: "and", "then" or ";" in the title', () => {
  const msg = 'has "and", "then" or ";" in its title, which suggests two changes'
  assert.deepEqual(flags(task(1, { title: 'Add the parser and its tests' })), [msg])
  assert.deepEqual(flags(task(1, { title: 'Parse, then print' })), [msg])
  assert.deepEqual(flags(task(1, { title: 'Parse; print' })), [msg])
  assert.deepEqual(flags(task(1, { title: 'AND gate' })), [msg], 'case-insensitive')
  assert.deepEqual(flags(task(1, { title: 'Handle android thenceforth' })), [], 'whole words only')
})

test('flags come in a fixed order', () => {
  const t = task(1, { title: 'A and B', prompt: 'x'.repeat(4001) })
  assert.deepEqual(flags(t), [
    'has no "Files to change:" line',
    'has a 4,001-character prompt (guideline: at most 4000 for sonnet)',
    'has "and", "then" or ";" in its title, which suggests two changes',
  ])
  const many = task(1, { title: 'A then B', prompt: `${filesLine(6)}\n${'x'.repeat(4000)}` })
  assert.deepEqual(flags(many).map(f => f.split(' ')[0]), ['changes', 'has', 'has'])
})

test('kept finds the Keep lines that give a reason', () => {
  const text = [
    '# Plan',
    'Keep T01: it is one change.',
    '  Keep T02:\tindented, with a tab',
    'Keep T03:',
    'Keep T04:   ',
    'Keep T5: too few digits',
    'Please Keep T06: not at the start of a line',
    '',
  ].join('\n')
  assert.deepEqual([...kept(text)].sort(), ['T01', 'T02'])
  assert.equal(kept('').size, 0)
})

test('review lists the flagged tasks that are not kept', () => {
  const tasks = [task(1), task(2, { title: 'A and B' }), task(3, { prompt: 'no files line' })]
  assert.deepEqual(review(tasks, 'Prose'), [
    { id: 'T02', flags: ['has "and", "then" or ";" in its title, which suggests two changes'] },
    { id: 'T03', flags: ['has no "Files to change:" line'] },
  ])
  assert.deepEqual(review(tasks, 'Keep T02: one change.\nKeep T03: just prose.'), [])
  assert.deepEqual(review(tasks, 'Keep T02: one change.').map(p => p.id), ['T03'])
  assert.deepEqual(review([task(1)], ''), [])
})

test('reviewText names each task and its flags, and the two ways out', () => {
  const text = reviewText([
    { id: 'T03', flags: ['has no "Files to change:" line', 'changes 5 files (guideline: at most 4)'] },
    { id: 'T05', flags: ['has a 4,001-character prompt (guideline: at most 4000 for sonnet)'] },
  ])
  assert.equal(
    text,
    'tierminator: some tasks may be too large for one worker. These are guidelines, not rules:\n' +
      '- T03: has no "Files to change:" line; changes 5 files (guideline: at most 4)\n' +
      '- T05: has a 4,001-character prompt (guideline: at most 4000 for sonnet)\n\n' +
      'For each, split it into smaller tasks, or keep it and add a line "Keep T03: <why it stays one task>" ' +
      'to the plan, outside the task block. Then call ExitPlanMode again.'
  )
})
