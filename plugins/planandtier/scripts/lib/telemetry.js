// planandtier's spend records: one JSON line per event in <plan>.telemetry.jsonl, beside the plan and its
// tasks file, and the lines shown in the UI. Nothing leaves the machine.
//   planning       H2, each time a valid tiered plan passes the gate: plan-mode messages and planning
//                  subagents since the session's cursor
//   attempt        H4, each worker attempt: its transcript's usage, tier, task and outcome
//   orchestration  H5 (or H1 on a disarm), when the run ends: the main session's other messages and
//                  non-planandtier subagents since the run started
// Every function swallows errors: telemetry never affects a run.
'use strict'

const fs = require('fs')
const path = require('path')
const state = require('./state.js')
const { AS_OF } = require('./prices.js')
const { TIERS } = require('./tasks.js')

// The telemetry file for a plan file, or the session's own when there is no plan file.
function fileFor(planFile, sessionId) {
  if (typeof planFile === 'string' && planFile) return planFile.replace(/\.md$/i, '') + '.telemetry.jsonl'
  return state.fileFor(sessionId)?.replace(/\.json$/, '.telemetry.jsonl') ?? null
}

// Appends one record, with its time and the price date. Returns the record written, or null.
function append(file, record) {
  try {
    if (!file) return null
    const full = { at: new Date().toISOString(), priceAsOf: AS_OF, ...record }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, JSON.stringify(full) + '\n')
    return full
  } catch {
    return null
  }
}

function read(file) {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => {
        try {
          return JSON.parse(l)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

// The usage fields kept in a record (a tally from lib/usage.js, or null when unreadable).
const usageFields = u =>
  u
    ? { tokens: u.tokens, total: u.total, messages: u.messages, costUsd: u.costUsd, unpriced: u.unpriced, models: Object.keys(u.byModel) }
    : { tokens: null, total: null, messages: null, costUsd: null, unpriced: [], models: [] }

function fmtTokens(n) {
  if (n == null) return '? tokens'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M tokens`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k tokens`
  return `${n} tokens`
}

function fmtUsd(usd, unpriced = []) {
  const extra = unpriced.length ? ` + unpriced ${unpriced.join(', ')}` : ''
  if (usd == null) return `cost unknown${extra}`
  if (usd > 0 && usd < 0.005) return `<$0.01${extra}`
  return `~$${usd.toFixed(2)}${extra}`
}

const cachedShare = r =>
  r.tokens && r.total ? ` (${Math.round((100 * r.tokens.cacheRead) / r.total)}% cache reads)` : ''

// The UI line for one finished attempt. runCost is the run's spend so far, this attempt included.
function attemptLine(r, runCost) {
  const verb = { done: 'done', retry: 'failed, retrying a tier up', halt: 'failed, run stopped' }[r.outcome] ?? r.outcome
  const usage = r.total == null ? 'usage unavailable' : `${fmtTokens(r.total)}${cachedShare(r)}, ${fmtUsd(r.costUsd, r.unpriced)}`
  return `planandtier: ${r.task} on ${r.tier} ${verb}: ${usage}. Run so far: ${fmtUsd(runCost)}.`
}

const sum = (records, pick) => records.reduce((n, r) => n + (pick(r) ?? 0), 0)
const unpricedOf = records => [...new Set(records.flatMap(r => r.unpriced ?? []))]
const modelsOf = records => [...new Set(records.flatMap(r => r.models ?? []))]

// The end-of-run summary: planning for the plan (from any session), then this run's attempts by tier
// and its orchestration, and a total.
function summary(records, { planId, runId }) {
  const planning = records.filter(r => r.kind === 'planning' && planId && r.planId === planId)
  const attempts = records.filter(r => r.kind === 'attempt' && r.runId === runId)
  const orchestration = records.filter(r => r.kind === 'orchestration' && r.runId === runId)
  const rows = []
  const row = (label, recs, detail) => {
    if (!recs.length) return
    rows.push([label, fmtUsd(sum(recs, r => r.costUsd), unpricedOf(recs)), detail])
  }
  const subs = sum(planning, r => r.subagents)
  row('planning', planning, `${modelsOf(planning).join(', ') || 'no messages'}${subs ? `, ${subs} subagent${subs === 1 ? '' : 's'}` : ''}`)
  for (const tier of [...TIERS, ...new Set(attempts.map(a => a.tier).filter(t => !TIERS.includes(t)))]) {
    const at = attempts.filter(a => a.tier === tier)
    const failed = at.filter(a => a.outcome !== 'done').length
    row(tier, at, `${at.length} attempt${at.length === 1 ? '' : 's'}${failed ? ` (${failed} failed)` : ''}, ${fmtTokens(sum(at, a => a.total))}`)
  }
  row('orchestration', orchestration, modelsOf(orchestration).join(', ') || 'no messages')
  const all = [...planning, ...attempts, ...orchestration]
  rows.push(['total', fmtUsd(sum(all, r => r.costUsd), unpricedOf(all)), ''])
  const width = Math.max(...rows.map(r => r[0].length))
  const col = Math.max(...rows.map(r => r[1].length))
  const lines = rows.map(([a, b, c]) => `  ${a.padEnd(width)}  ${b.padEnd(col)}  ${c}`.trimEnd())
  return [`planandtier spend (estimated, prices as of ${AS_OF}):`, ...lines].join('\n')
}

module.exports = { fileFor, append, read, usageFields, fmtTokens, fmtUsd, attemptLine, summary }
