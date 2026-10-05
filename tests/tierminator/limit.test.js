'use strict'

const { test, describe, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { TAIL_BYTES, isLimit, resetsAtFrom, apiErrorReason } = require('../../plugins/tierminator/scripts/lib/limit.js')
const { PAYLOADS, RESET_OAUTH, errorLine, transcript } = require('./fixtures/stop-failure.js')

let dir
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tier-limit-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

const write = content => {
  const p = path.join(dir, 't.jsonl')
  fs.writeFileSync(p, content)
  return p
}

describe('isLimit', () => {
  test('true for rate_limit payloads', () => {
    assert.equal(isLimit(PAYLOADS.oauth), true)
    assert.equal(isLimit(PAYLOADS.apikey), true)
  })
  test('false otherwise', () => {
    assert.equal(isLimit(PAYLOADS.error), false)
    assert.equal(isLimit(null), false)
    assert.equal(isLimit({}), false)
    assert.equal(isLimit({ error: 'RATE_LIMIT' }), false)
  })
})

describe('resetsAtFrom', () => {
  test('reads the reset from an oauth transcript', () => {
    assert.equal(resetsAtFrom(write(transcript('oauth'))), RESET_OAUTH)
  })
  test('null for apikey and error transcripts', () => {
    assert.equal(resetsAtFrom(write(transcript('apikey'))), null)
    assert.equal(resetsAtFrom(write(transcript('error'))), null)
  })
  test('null for bad paths and an empty file', () => {
    assert.equal(resetsAtFrom(path.join(dir, 'missing')), null)
    assert.equal(resetsAtFrom(undefined), null)
    assert.equal(resetsAtFrom(42), null)
    assert.equal(resetsAtFrom(''), null)
    assert.equal(resetsAtFrom(write('')), null)
  })
  test('the last rate_limit line wins', () => {
    const first = errorLine('oauth')
    first.quotaLimits.resetsAt = 100
    const content = [first, errorLine('apikey')].map(l => JSON.stringify(l)).join('\n') + '\n'
    assert.equal(resetsAtFrom(write(content)), null)
  })
  test('later non-error lines are skipped', () => {
    const content = transcript('oauth') + JSON.stringify({ type: 'system' }) + '\nnot json\n'
    assert.equal(resetsAtFrom(write(content)), RESET_OAUTH)
  })
  test('a string resetsAt gives null', () => {
    const line = errorLine('oauth')
    line.quotaLimits.resetsAt = '1791179511'
    assert.equal(resetsAtFrom(write(JSON.stringify(line) + '\n')), null)
  })
  test('reads only the tail of a large transcript', () => {
    const pad = JSON.stringify({ type: 'user', pad: 'x'.repeat(TAIL_BYTES + 10) }) + '\n'
    assert.equal(resetsAtFrom(write(pad + transcript('oauth'))), RESET_OAUTH)
  })
})

describe('apiErrorReason', () => {
  test('includes the first line of the message', () => {
    assert.equal(apiErrorReason(PAYLOADS.error), 'an API error ended the session: API Error: 400 probe: invalid request')
    assert.equal(apiErrorReason({ last_assistant_message: 'a\nb' }), 'an API error ended the session: a')
  })
  test('bare reason without a message', () => {
    assert.equal(apiErrorReason({}), 'an API error ended the session')
  })
  test('cuts a long message to 300 characters', () => {
    const r = apiErrorReason({ last_assistant_message: 'y'.repeat(400) })
    assert.equal(r, 'an API error ended the session: ' + 'y'.repeat(300))
  })
})
