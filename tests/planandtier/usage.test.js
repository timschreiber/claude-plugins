'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const u = require('../../plugins/planandtier/scripts/lib/usage.js')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planandtier-usage-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
// One assistant transcript line, shaped as Claude Code writes it.
const line = (id, at, usage, model = 'claude-sonnet-5') => ({
  type: 'assistant',
  timestamp: at,
  message: {
    id,
    model,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
      inference_geo: 'not_available',
      ...usage,
    },
  },
})
const write = (file, entries) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n')
  return file
}

test('repeated lines of one message count once, with the largest value of each field', () => {
  // As measured: the streaming line has a small output count, the input side is the same on every line.
  const file = write(path.join(dir, 'w.jsonl'), [
    line('m1', '2026-09-28T10:00:00Z', { input_tokens: 2, output_tokens: 4, cache_read_input_tokens: 25035, cache_creation_input_tokens: 6876, cache_creation: { ephemeral_5m_input_tokens: 6876, ephemeral_1h_input_tokens: 0 } }),
    line('m1', '2026-09-28T10:00:01Z', { input_tokens: 2, output_tokens: 101, cache_read_input_tokens: 25035, cache_creation_input_tokens: 6876, cache_creation: { ephemeral_5m_input_tokens: 6876, ephemeral_1h_input_tokens: 0 } }),
    { type: 'user', message: { content: 'x' } },
    line('m2', '2026-09-28T10:00:05Z', { input_tokens: 1, output_tokens: 50, cache_read_input_tokens: 31911 }),
  ])
  const t = u.transcriptUsage(file)
  assert.equal(t.messages, 2)
  assert.deepEqual(t.tokens, { input: 3, output: 151, cacheWrite5m: 6876, cacheWrite1h: 0, cacheRead: 56946 })
  assert.equal(t.total, 3 + 151 + 6876 + 56946)
  close(t.costUsd, (3 * 2 + 151 * 10 + 6876 * 2.5 + 56946 * 0.2) / 1e6)
  assert.deepEqual([t.firstAt, t.lastAt], ['2026-09-28T10:00:00Z', '2026-09-28T10:00:05Z'])
  assert.deepEqual(Object.keys(t.byModel), ['claude-sonnet-5'])
})

test('cache writes without a 5m/1h split count as 5-minute writes; 1-hour writes are priced as such', () => {
  const file = write(path.join(dir, 'w.jsonl'), [
    { ...line('a', '2026-09-28T10:00:00Z', {}), message: { id: 'a', model: 'claude-sonnet-5', usage: { cache_creation_input_tokens: 1000 } } },
    line('b', '2026-09-28T10:00:01Z', { cache_creation_input_tokens: 500, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 500 } }),
  ])
  const t = u.transcriptUsage(file)
  assert.deepEqual([t.tokens.cacheWrite5m, t.tokens.cacheWrite1h], [1000, 500])
  close(t.costUsd, (1000 * 2.5 + 500 * 4) / 1e6)
})

test('an opusplan session is split by mode and priced per message model', () => {
  const file = write(path.join(dir, 'main.jsonl'), [
    { type: 'permission-mode', permissionMode: 'default' },
    line('chat', '2026-09-28T09:00:00Z', { output_tokens: 10 }, 'claude-sonnet-5'),
    { type: 'permission-mode', permissionMode: 'plan' },
    line('p1', '2026-09-28T10:00:00Z', { output_tokens: 1000 }, 'claude-opus-5-5'),
    { type: 'user', permissionMode: 'plan', message: { content: 'x' } },
    line('p2', '2026-09-28T10:05:00Z', { output_tokens: 2000 }, 'claude-opus-5-5'),
    { type: 'user', permissionMode: 'auto', message: { content: 'approved' } },
    line('e1', '2026-09-28T10:10:00Z', { output_tokens: 300 }, 'claude-sonnet-5'),
  ])
  const plan = u.transcriptUsage(file, { mode: 'plan' })
  assert.equal(plan.tokens.output, 3000)
  assert.deepEqual(Object.keys(plan.byModel), ['claude-opus-5-5'])
  close(plan.costUsd, (3000 * 20) / 1e6)
  const run = u.transcriptUsage(file, { mode: 'other', from: '2026-09-28T10:06:00Z' })
  assert.equal(run.tokens.output, 300, 'chat before the window is left out')
  close(run.costUsd, (300 * 10) / 1e6)
  const windowed = u.transcriptUsage(file, { mode: 'plan', from: '2026-09-28T10:00:00Z' })
  assert.equal(windowed.tokens.output, 2000, 'from is exclusive, to is inclusive')
})

test('an unknown model keeps its tokens, and is named as unpriced', () => {
  const file = write(path.join(dir, 'w.jsonl'), [
    line('a', '2026-09-28T10:00:00Z', { output_tokens: 100 }, 'claude-future-9'),
    line('b', '2026-09-28T10:00:01Z', { output_tokens: 100 }),
  ])
  const t = u.transcriptUsage(file)
  assert.equal(t.tokens.output, 200)
  assert.deepEqual(t.unpriced, ['claude-future-9'])
  close(t.costUsd, (100 * 10) / 1e6)
  assert.equal(t.byModel['claude-future-9'].costUsd, null)
})

test('a missing or unreadable transcript is null, and a malformed line is skipped', () => {
  assert.equal(u.transcriptUsage(path.join(dir, 'nope.jsonl')), null)
  assert.equal(u.transcriptUsage(undefined), null)
  const file = path.join(dir, 'bad.jsonl')
  fs.writeFileSync(file, '{not json\n' + JSON.stringify(line('a', '2026-09-28T10:00:00Z', { output_tokens: 5 })) + '\n')
  assert.equal(u.transcriptUsage(file).tokens.output, 5)
})

test('subagentUsage counts the subagents that started in the window, skipping excluded types', () => {
  const main = path.join(dir, 'sess.jsonl')
  const subs = u.subagentsDir(main)
  assert.equal(subs, path.join(dir, 'sess', 'subagents'))
  const agent = (name, type, at, out) => {
    write(path.join(subs, `${name}.jsonl`), [line(`${name}-1`, at, { output_tokens: out }, 'claude-opus-5-5')])
    if (type) fs.writeFileSync(path.join(subs, `${name}.meta.json`), JSON.stringify({ agentType: type }))
  }
  agent('agent-explore', 'Explore', '2026-09-28T10:01:00Z', 100)
  agent('agent-plan', 'Plan', '2026-09-28T10:02:00Z', 200)
  agent('agent-worker', 'planandtier:sonnet-low', '2026-09-28T10:03:00Z', 5000)
  agent('agent-before', 'Explore', '2026-09-28T08:00:00Z', 7000)
  agent('agent-nometa', null, '2026-09-28T10:04:00Z', 10)
  const t = u.subagentUsage(subs, {
    from: '2026-09-28T10:00:00Z',
    to: '2026-09-28T11:00:00Z',
    exclude: type => String(type).startsWith('planandtier:'),
  })
  assert.equal(t.count, 3)
  assert.equal(t.tokens.output, 310)
  assert.equal(u.subagentUsage(path.join(dir, 'none')).count, 0)
  assert.equal(u.subagentsDir(undefined), null)
})

test('combine adds tallies, keeping per-model costs and the unpriced list', () => {
  const a = u.tally([{ model: 'claude-sonnet-5', geo: null, tokens: { input: 0, output: 1000, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 }, at: '2026-09-28T10:00:00Z' }])
  const b = u.tally([{ model: 'x-model', geo: null, tokens: { input: 5, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 }, at: '2026-09-28T09:00:00Z' }])
  const c = u.combine(a, b, null)
  assert.equal(c.messages, 2)
  assert.equal(c.total, 1005)
  assert.deepEqual(c.unpriced, ['x-model'])
  close(c.costUsd, 0.01)
  assert.equal(c.firstAt, '2026-09-28T09:00:00Z')
})
