'use strict'

// A duration as seconds: "1h30m15s" is 5415. The units are h, m and s, each at most once and in that
// order; parts may be separated by spaces ("1h 30m"); a bare number is seconds ("90" is 90). Anything
// else throws.
function parseDuration(text) {
  const trimmed = String(text).trim()
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(trimmed)
  if (!m || trimmed === '') throw new Error(`bad duration: ${text}`)
  const [, h = 0, min = 0, s = 0] = m
  return h * 3600 + min * 60 + s
}

module.exports = { parseDuration }
