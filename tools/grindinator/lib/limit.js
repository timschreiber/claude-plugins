// Grindinator usage-limit recovery for the runner (spec: Limits and recovery): the reset time,
// whether to wait, and the wait itself.
'use strict'

const GRACE_MS = 5 * 60 * 1000
const FALLBACK_MS = 5 * 60 * 60 * 1000
const WEEKLY_MS = 24 * 60 * 60 * 1000
const CHUNK_MS = 60 * 1000

const SOURCE_TEXT = Object.freeze({
  'result-file': 'from the result file',
  stream: 'from the stream',
  fallback: 'none reported; fixed five-hour wait'
})

function epochMs(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v * 1000 : null
}

function iso(ms) {
  return ms === null ? null : new Date(ms).toISOString()
}

function resolveReset(attempt, nowMs) {
  const candidates = [
    ['result-file', epochMs(attempt?.limit?.resetsAt)],
    ['stream', epochMs(attempt?.streamResetsAt)]
  ]
  // A reset at or before now is stale and skipped.
  for (const [source, ms] of candidates) {
    if (ms !== null && ms > nowMs) return { source, resetsAtMs: ms, wakeAtMs: ms + GRACE_MS }
  }
  return { source: 'fallback', resetsAtMs: null, wakeAtMs: nowMs + FALLBACK_MS + GRACE_MS }
}

function decide({ attempt, limits, config, nowMs }) {
  const r = resolveReset(attempt, nowMs)
  const wait = {
    source: r.source,
    resetsAt: iso(r.resetsAtMs),
    wakeAt: iso(r.wakeAtMs),
    status: 'waiting',
    startedAt: null,
    endedAt: null
  }
  if (limits > config.maxLimitWaits) {
    return {
      action: 'stop',
      wait: { ...wait, status: 'over-cap' },
      reason: `hit a usage limit ${limits} times in a row, more than maxLimitWaits (${config.maxLimitWaits})`
    }
  }
  if (r.resetsAtMs !== null && r.resetsAtMs - nowMs > WEEKLY_MS && !config.waitWeekly) {
    return {
      action: 'stop',
      wait: { ...wait, status: 'weekly' },
      reason: `hit a usage limit that resets at ${wait.resetsAt}, more than 24 hours away; pass --wait-weekly to wait for it`
    }
  }
  return { action: 'wait', wait, reason: null }
}

const realClock = {
  now: () => Date.now(),
  sleep: (ms, signal = null) => new Promise(resolve => {
    if (signal?.aborted) return resolve()
    let timer = null
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function sleepUntil(wakeAtMs, { clock = realClock, abortSignal = null } = {}) {
  // Re-reads the clock after every chunk, so a machine that slept through the target wakes on the next chunk.
  for (;;) {
    if (abortSignal?.aborted) return 'interrupted'
    const left = wakeAtMs - clock.now()
    if (left <= 0) return 'woke'
    await clock.sleep(Math.min(left, CHUNK_MS), abortSignal)
  }
}

module.exports = { GRACE_MS, FALLBACK_MS, WEEKLY_MS, CHUNK_MS, SOURCE_TEXT, resolveReset, decide, realClock, sleepUntil }
