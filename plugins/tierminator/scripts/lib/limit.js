// Usage limits for H7 (StopFailure). WP-01 measured that the payload's `error` is "rate_limit" on a 429 and
// "unknown" on another API error, with no reset field, and that the reset is `quotaLimits.resetsAt` (Unix
// seconds) on the transcript's error line, on an OAuth login only (docs/grindinator/grindinator-verification.md,
// V1 and V3). Every function swallows errors.
'use strict'

const fs = require('fs')
const { REASONS } = require('./result.js')

// Only the transcript's tail is read: the error line is written just before StopFailure fires.
const TAIL_BYTES = 1024 * 1024

function isLimit(input) {
  return input?.error === 'rate_limit'
}

function resetsAtFrom(transcriptPath) {
  try {
    if (typeof transcriptPath !== 'string' || !transcriptPath) return null
    const fd = fs.openSync(transcriptPath, 'r')
    let text
    try {
      const size = fs.fstatSync(fd).size
      const len = Math.min(size, TAIL_BYTES)
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, size - len)
      text = buf.toString('utf8')
    } finally {
      fs.closeSync(fd)
    }
    const lines = text.split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      let line
      try { line = JSON.parse(lines[i]) } catch { continue }
      if (line?.error !== 'rate_limit') continue
      const at = line.quotaLimits?.resetsAt
      return Number.isFinite(at) && at > 0 ? at : null
    }
    return null
  } catch {
    return null
  }
}

function apiErrorReason(input) {
  try {
    const message = String(input?.last_assistant_message ?? '').split('\n')[0].trim().slice(0, 300)
    return message ? `${REASONS.apiError}: ${message}` : REASONS.apiError
  } catch {
    return REASONS.apiError
  }
}

module.exports = { TAIL_BYTES, isLimit, resetsAtFrom, apiErrorReason }
