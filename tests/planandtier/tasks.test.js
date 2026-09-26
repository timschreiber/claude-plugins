'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { extractBlock, validate, parsePlan, OPT_OUT_LINE } = require('../../plugins/planandtier/scripts/lib/tasks.js')

const task = (n, over = {}) => ({
  id: `T${String(n).padStart(2, '0')}`,
  title: `Task ${n}`,
  model: 'sonnet',
  effort: 'medium',
  prompt: 'Read docs/spec.md section 2. Add the function. Verify: node --test passes.',
  ...over,
})

const fenced = (obj, info = 'json tiered-tasks') => '```' + info + '\n' + JSON.stringify(obj, null, 2) + '\n```'
const plan = (obj, extra = '') => `# Plan\n\nProse here.\n\n## Tasks\n\n${fenced(obj)}\n${extra}`

test('a valid plan parses to its tasks', () => {
  const r = parsePlan(plan({ tasks: [task(1), task(2, { model: 'opus', effort: 'xhigh' })] }))
  assert.equal(r.ok, true)
  assert.equal(r.optOut, false)
  assert.deepEqual(r.errors, [])
  assert.equal(r.tasks.length, 2)
  assert.equal(r.tasks[1].model, 'opus')
})

test('every allowed model/effort pair validates', () => {
  for (const model of ['sonnet', 'opus']) {
    for (const effort of ['low', 'medium', 'high', 'xhigh']) {
      assert.deepEqual(validate({ tasks: [task(1, { model, effort })] }), [], `${model}/${effort}`)
    }
  }
})

test('haiku, fable, max and unknown values are rejected with a message naming the choices', () => {
  const haiku = validate({ tasks: [task(1, { model: 'haiku' })] })
  assert.match(haiku[0], /T01\.model: "haiku" is not allowed; use sonnet or opus/)
  assert.match(validate({ tasks: [task(1, { model: 'fable' })] })[0], /"fable" is not allowed/)
  const max = validate({ tasks: [task(1, { effort: 'max' })] })
  assert.match(max[0], /T01\.effort: "max" is not allowed for sonnet; use low, medium, high or xhigh/)
  assert.match(validate({ tasks: [task(1, { effort: 'ultra' })] })[0], /"ultra" is not allowed/)
})

test('ids must be T01, T02, ... in order and unique', () => {
  assert.match(validate({ tasks: [task(1), task(3)] })[0], /T03\.id: expected "T02"/)
  assert.match(validate({ tasks: [task(1), task(1)] })[0], /T01\.id: expected "T02"/)
  assert.match(validate({ tasks: [task(1, { id: 'task-1' })] })[0], /task-1\.id: expected "T01"/)
})

test('unknown keys are rejected', () => {
  const errors = validate({ tasks: [task(1, { modle: 'sonnet' })] })
  assert.match(errors[0], /unknown key "modle"; allowed keys are id, title, model, effort or prompt/)
})

test('missing and non-string fields are rejected', () => {
  const t = task(1)
  delete t.effort
  assert.ok(validate({ tasks: [t] }).some(e => /T01\.effort: must be a string/.test(e)))
  assert.ok(validate({ tasks: [task(1, { prompt: 7 })] }).some(e => /T01\.prompt: must be a string/.test(e)))
})

test('titles must be one non-empty line of at most 100 characters', () => {
  assert.match(validate({ tasks: [task(1, { title: '  ' })] })[0], /title: must be one non-empty line/)
  assert.match(validate({ tasks: [task(1, { title: 'a\nb' })] })[0], /title: must be one non-empty line/)
  assert.match(validate({ tasks: [task(1, { title: 'x'.repeat(101) })] })[0], /at most 100 characters/)
  assert.deepEqual(validate({ tasks: [task(1, { title: 'x'.repeat(100) })] }), [])
})

test('prompts must be non-empty and contain a Verify: step', () => {
  assert.match(validate({ tasks: [task(1, { prompt: '' })] })[0], /prompt: must not be empty/)
  assert.match(validate({ tasks: [task(1, { prompt: 'Do the thing.' })] })[0], /must contain a "Verify:" step/)
})

test('all problems are reported together, not one at a time', () => {
  const errors = validate({ tasks: [task(1, { model: 'haiku', prompt: 'x' }), task(3, { effort: 'max' })] })
  assert.ok(errors.length >= 3, errors.join('\n'))
})

test('top-level shape errors', () => {
  assert.match(validate(null)[0], /JSON object/)
  assert.match(validate([])[0], /JSON object/)
  assert.match(validate({})[0], /non-empty "tasks" array/)
  assert.match(validate({ tasks: [] })[0], /non-empty "tasks" array/)
  assert.match(validate({ tasks: ['x'] })[0], /tasks\[0\]: must be an object/)
})

test('more than 99 tasks are rejected', () => {
  const tasks = Array.from({ length: 100 }, (_, i) => task(i + 1, { id: `T${String(i + 1).padStart(2, '0')}` }))
  assert.match(validate({ tasks })[0], /at most 99 tasks/)
})

test('no block and no opt-out is an error', () => {
  const r = parsePlan('# Plan\n\nJust prose.\n')
  assert.equal(r.ok, false)
  assert.match(r.errors[0], /no fenced "json tiered-tasks" block found/)
})

test('two blocks are an error', () => {
  const r = parsePlan(plan({ tasks: [task(1)] }, '\n' + fenced({ tasks: [task(1)] })))
  assert.equal(r.ok, false)
  assert.match(r.errors[0], /found 2 .* blocks; exactly one is allowed/)
})

test('invalid JSON is an error that names the parse problem', () => {
  const r = parsePlan('```json tiered-tasks\n{"tasks": [\n```\n')
  assert.equal(r.ok, false)
  assert.match(r.errors[0], /not valid JSON/)
})

test('the opt-out line alone is ok, with no tasks', () => {
  const r = parsePlan(`# Plan\n\n${OPT_OUT_LINE}\n\nProse.\n`)
  assert.deepEqual({ ok: r.ok, optOut: r.optOut, tasks: r.tasks }, { ok: true, optOut: true, tasks: [] })
})

test('the opt-out line together with a block is an error', () => {
  const r = parsePlan(`${OPT_OUT_LINE}\n\n${fenced({ tasks: [task(1)] })}`)
  assert.equal(r.ok, false)
  assert.match(r.errors[0], /both a "json tiered-tasks" block and the line/)
})

test('an opt-out line inside a code fence does not count', () => {
  const r = parsePlan('```text\n' + OPT_OUT_LINE + '\n```\n')
  assert.equal(r.ok, false)
})

test('a tiered-tasks block quoted inside another fence is not a block', () => {
  const quoted = '````markdown\n' + fenced({ tasks: [task(1)] }) + '\n````\n'
  const { blocks } = extractBlock(quoted)
  assert.equal(blocks.length, 0)
  const both = parsePlan(quoted + '\n' + fenced({ tasks: [task(1)] }))
  assert.equal(both.ok, true)
})

test('tilde fences and CRLF line endings are handled', () => {
  const body = JSON.stringify({ tasks: [task(1)] })
  const r = parsePlan(`# Plan\r\n\r\n~~~json tiered-tasks\r\n${body}\r\n~~~\r\n`)
  assert.equal(r.ok, true)
})

test('a fence with a different info string is not a task block', () => {
  assert.equal(extractBlock('```json\n{"tasks": []}\n```').blocks.length, 0)
  assert.equal(extractBlock('```json tiered-tasks-old\n{}\n```').blocks.length, 0)
})

test('an empty or non-string plan is an error, not a crash', () => {
  for (const bad of ['', '   ', undefined, null, 42]) {
    const r = parsePlan(bad)
    assert.equal(r.ok, false)
    assert.match(r.errors[0], /empty or unavailable/)
  }
})

test('returned tasks carry only the known keys', () => {
  const r = parsePlan(plan({ tasks: [task(1)] }))
  assert.deepEqual(Object.keys(r.tasks[0]), ['id', 'title', 'model', 'effort', 'prompt'])
})
