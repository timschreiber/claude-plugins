// Grindinator stream-json parser. Reads the stdout log of
// `claude -p --output-format stream-json --verbose` and summarizes it. It is tolerant:
// it never throws on content, and counts lines that are not JSON objects as malformed.
'use strict'

const fs = require('fs')

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value) {
  return typeof value === 'string' && value !== ''
}

function parseStream(text) {
  const source = typeof text === 'string' ? text : ''
  let initSessionId = null
  let anySessionId = null
  let initCount = 0
  let resultCount = 0
  let lastResult = null
  const permissionDenials = []
  let latest = null
  let atResult = null
  let lines = 0
  let malformed = 0

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    lines++

    let message
    try {
      message = JSON.parse(line)
    } catch {
      malformed++
      continue
    }
    if (!isObject(message)) {
      malformed++
      continue
    }

    if (anySessionId === null && nonEmptyString(message.session_id)) anySessionId = message.session_id

    if (message.type === 'system' && message.subtype === 'init') {
      initCount++
      if (initSessionId === null && nonEmptyString(message.session_id)) initSessionId = message.session_id
    } else if (message.type === 'system' && message.subtype === 'permission_denied') {
      permissionDenials.push(message)
    } else if (message.type === 'rate_limit_event') {
      const resetsAt = isObject(message.rate_limit_info) ? message.rate_limit_info.resetsAt : undefined
      latest = typeof resetsAt === 'number' && Number.isFinite(resetsAt) && resetsAt > 0 ? resetsAt : null
    } else if (message.type === 'result') {
      resultCount++
      lastResult = message
      atResult = latest
    }
  }

  return {
    sessionId: initSessionId !== null ? initSessionId : anySessionId,
    initCount,
    resultCount,
    lastResult,
    permissionDenials,
    rateLimitResetsAt: resultCount > 0 ? atResult : latest,
    lines,
    malformed,
  }
}

function readStreamFile(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return parseStream('')
    throw err
  }
  return parseStream(text)
}

module.exports = { parseStream, readStreamFile }
