// The API cells (V1 to V4) for the Grindinator WP-01 probe. See probes/grindinator/README.md, 'Cells'.
//
// module.exports maps each cell name to { items, setup, analyze }. The BASIC fixture is attached as a
// non-enumerable property so run.js does not see it as a cell.
'use strict'

const fs = require('fs')
const path = require('path')
const lib = require('./lib')

const BASIC = {
  'README.md': '# Probe repo\n',
  'notes.txt': 'alpha\nbeta\n',
}

const PROMPT = 'Reply with the single word OK.'

function cell({ items, mock, env, timeoutMs, analyze }) {
  return {
    items,
    setup(base) {
      const cwd = path.join(base, 'repo')
      lib.makeRepo(cwd, BASIC)
      return {
        cwd,
        prompt: PROMPT,
        flags: ['--model', 'sonnet', '--effort', 'low'],
        plugins: ['probe', 'stopFailure'],
        env: env || {},
        mock: mock || null,
        timeoutMs,
      }
    },
    analyze,
  }
}

function common(ctx) {
  return {
    mockRequests: ctx.mockLog.length,
    firstAuthKind: ctx.mockLog.length ? ctx.mockLog[0].authKind ?? null : null,
  }
}

function passAnalyze(ctx) {
  return {
    ...common(ctx),
    rateHeaders: ctx.mockLog.map(r => ({ n: r.n, url: r.url, status: r.status ?? null, rateHeaders: r.rateHeaders ?? null })),
  }
}

const pad2 = n => String(n).padStart(2, '0')

function resetNeedles(resetEpoch) {
  const date = new Date(resetEpoch * 1000)
  const iso = date.toISOString()
  const hour = date.getHours()
  const hour12 = hour % 12 || 12
  const suffix = hour >= 12 ? 'pm' : 'am'
  return [
    String(resetEpoch),
    iso,
    iso.slice(0, 16),
    `${hour12}${suffix}`,
    `${hour12} ${suffix}`,
    `${hour12}:00`,
    `${pad2(hour)}:00`,
  ]
}

function limitAnalyze(ctx) {
  const stopFailures = ctx.records.filter(r => r.event === 'StopFailure')
  const sessionEnds = ctx.records.filter(r => r.event === 'SessionEnd')
  const keys = []
  for (const r of stopFailures) {
    for (const k of Object.keys(r.input || {})) if (!keys.includes(k)) keys.push(k)
  }
  let transcript = ''
  try {
    transcript = fs.readFileSync(path.join(lib.EVIDENCE, `grindinator-${ctx.name}-transcript.jsonl`), 'utf8')
  } catch {
    // no transcript was copied
  }
  const haystacks = { stream: ctx.run.stdout, stderr: ctx.run.stderr, transcript }
  const byEvent = {}
  for (const r of ctx.records) {
    if (!byEvent[r.event]) byEvent[r.event] = []
    byEvent[r.event].push(r)
  }
  for (const [event, recs] of Object.entries(byEvent)) haystacks[event] = JSON.stringify(recs)
  return {
    ...common(ctx),
    stopFailureFired: stopFailures.length > 0,
    stopFailureKeys: keys,
    sessionEndReasons: sessionEnds.map(r => (r.input || {}).reason ?? null),
    apiRetryErrors: ctx.summary.apiRetries.map(e => ({
      error: e.error ?? null,
      error_status: e.error_status ?? null,
      attempt: e.attempt ?? null,
      retry_delay_ms: e.retry_delay_ms ?? null,
    })),
    resetFound: lib.findText(haystacks, resetNeedles(ctx.resetEpoch)),
  }
}

const cells = {
  success: cell({ items: ['V2'], timeoutMs: 180000, analyze: common }),
  error: cell({ items: ['V2'], mock: 'error', timeoutMs: 300000, analyze: common }),
  pass: cell({ items: ['V3'], mock: 'pass', timeoutMs: 180000, analyze: passAnalyze }),
  'limit-oauth': cell({ items: ['V1', 'V2', 'V3', 'V4'], mock: 'limit', timeoutMs: 540000, analyze: limitAnalyze }),
  'limit-oauth-noretry': cell({
    items: ['V1', 'V2', 'V3', 'V4'],
    mock: 'limit',
    env: { CLAUDE_CODE_MAX_RETRIES: '0' },
    timeoutMs: 300000,
    analyze: limitAnalyze,
  }),
  'limit-apikey': cell({
    items: ['V1', 'V2', 'V3', 'V4'],
    mock: 'limit',
    env: { ANTHROPIC_API_KEY: 'sk-ant-probe-dummy', CLAUDE_CODE_MAX_RETRIES: '0' },
    timeoutMs: 300000,
    analyze: limitAnalyze,
  }),
}

Object.defineProperty(cells, 'BASIC', { value: BASIC, enumerable: false })

module.exports = cells
