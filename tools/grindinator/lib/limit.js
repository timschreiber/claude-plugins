// Grindinator usage-limit recovery for the runner (spec: Limits and recovery): the reset time,
// whether to wait, and the wait itself, and the recovery phase (planning, execute or complete)
// that a retry after the wait starts from.
'use strict'

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

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

function plansDir(env = process.env, homeDir = os.homedir()) {
  return path.join(env.CLAUDE_CONFIG_DIR || path.join(homeDir, '.claude'), 'plans')
}

function findSessionPlan(dir, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return null
  const prefix = sessionId.slice(0, 8).replace(/[^A-Za-z0-9_-]/g, '')
  if (prefix === '') return null
  let names
  try {
    names = fs.readdirSync(dir)
  } catch {
    return null
  }
  const hits = names.filter(n => n.startsWith('tierminator-unattended-') && n.endsWith(`-${prefix}.md`)).sort()
  return hits.length ? path.join(dir, hits[hits.length - 1]) : null
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function recoveryPhase({ attempt, plansDir: dir }) {
  const planFile = attempt.planFile ?? attempt.resume?.planFile ?? findSessionPlan(dir, attempt.sessionId)
  // No plan file: planning did not finish, so rerun planning.
  if (!planFile || !isFile(planFile)) return { phase: 'planning', planFile: null, from: null }
  const notRun = Array.isArray(attempt.tasksNotRun) ? attempt.tasksNotRun : []
  const done = Array.isArray(attempt.tasksDone) ? attempt.tasksDone : []
  // Every task committed: the plan is complete.
  if (attempt.tasksFile && notRun.length === 0 && done.length > 0) return { phase: 'complete', planFile, from: null }
  // A saved plan resumes at the first task not run; with no --from when unknown,
  // Tierminator then skips the committed tasks itself.
  return { phase: 'execute', planFile, from: /^T\d+$/.test(notRun[0] ?? '') ? notRun[0] : null }
}

module.exports = {
  GRACE_MS, FALLBACK_MS, WEEKLY_MS, CHUNK_MS, SOURCE_TEXT, resolveReset, decide, realClock, sleepUntil,
  plansDir, findSessionPlan, isFile, recoveryPhase
}
