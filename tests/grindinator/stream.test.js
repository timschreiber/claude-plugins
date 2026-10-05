// Tests for the Grindinator stream-json parser.
'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { parseStream, readStreamFile } = require('../../tools/grindinator/lib/stream.js')

const j = (o) => JSON.stringify(o)
const init = (id) => j({ type: 'system', subtype: 'init', session_id: id })

function assertEmpty(s) {
  assert.equal(s.sessionId, null)
  assert.equal(s.initCount, 0)
  assert.equal(s.resultCount, 0)
  assert.equal(s.lastResult, null)
  assert.deepEqual(s.permissionDenials, [])
  assert.equal(s.rateLimitResetsAt, null)
  assert.equal(s.lines, 0)
  assert.equal(s.malformed, 0)
}

test('init, assistant and result lines', () => {
  const text = [
    init('s1'),
    j({ type: 'assistant', session_id: 's1' }),
    j({ type: 'result', session_id: 's1', result: 'OK' }),
  ].join('\n')
  const s = parseStream(text)
  assert.equal(s.sessionId, 's1')
  assert.equal(s.initCount, 1)
  assert.equal(s.resultCount, 1)
  assert.equal(s.lastResult.result, 'OK')
  assert.equal(s.malformed, 0)
  assert.equal(s.lines, 3)
})

test('several inits and results: the last result counts', () => {
  const lines = []
  for (let i = 0; i < 3; i++) {
    lines.push(init('s'))
    lines.push(j({ type: 'result', result_index: i }))
  }
  const s = parseStream(lines.join('\n'))
  assert.equal(s.initCount, 3)
  assert.equal(s.resultCount, 3)
  assert.equal(s.lastResult.result_index, 2)
})

test('rate limit reset time is the one in force at the result', () => {
  const ev = (resetsAt) => j({ type: 'rate_limit_event', rate_limit_info: resetsAt === undefined ? {} : { resetsAt } })
  const result = j({ type: 'result', is_error: true, api_error_status: 429 })

  assert.equal(parseStream([ev(1791179511), result, ev(1791180000)].join('\n')).rateLimitResetsAt, 1791179511)
  assert.equal(parseStream([ev(1791179511), ev(1791180000)].join('\n')).rateLimitResetsAt, 1791180000)
  assert.equal(parseStream([ev(1791179511), ev(undefined), result].join('\n')).rateLimitResetsAt, null)
})

test('permission denials are collected as parsed', () => {
  const denial = {
    type: 'system',
    subtype: 'permission_denied',
    agent_id: 'a1',
    decision_reason: 'Permission prompts are not available in this context',
  }
  const s = parseStream([init('s'), j(denial)].join('\n'))
  assert.deepEqual(s.permissionDenials, [denial])
})

test('malformed lines are counted, blank lines skipped', () => {
  const text = ['not json', '[1]', '42', init('s'), ''].join('\n')
  const s = parseStream(text)
  assert.equal(s.malformed, 3)
  assert.equal(s.lines, 4)
  assert.equal(s.sessionId, 's')
})

test('session id falls back to any message; empty input is an empty summary', () => {
  assert.equal(parseStream(j({ type: 'assistant', session_id: 'x' })).sessionId, 'x')
  assertEmpty(parseStream(''))
  assertEmpty(parseStream(undefined))
})

test('CRLF parses the same as LF', () => {
  const lines = [init('s1'), j({ type: 'result', result: 'OK' }), 'junk']
  assert.deepEqual(parseStream(lines.join('\r\n')), parseStream(lines.join('\n')))
})

test('readStreamFile: missing file is empty, written file is parsed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grind-stream-'))
  try {
    assertEmpty(readStreamFile(path.join(dir, 'missing.jsonl')))
    const file = path.join(dir, 'out.jsonl')
    const text = [init('s1'), j({ type: 'result', result: 'OK' })].join('\n')
    fs.writeFileSync(file, text)
    assert.deepEqual(readStreamFile(file), parseStream(text))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
