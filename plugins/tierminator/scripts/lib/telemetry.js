// tierminator's spend records: one JSON line per event in <plan>.telemetry.jsonl, beside the plan and its
// tasks file, and the lines shown in the UI. Nothing leaves the machine.
//   planning       H2, each time a valid tiered plan passes the gate: plan-mode messages and planning
//                  subagents since the session's cursor
//   run            H3 or execute-plan, when a run starts: marks where its planning ends
//   attempt        H4, each worker attempt: its transcript's usage, tier, task and outcome
//   orchestration  H5 (or H1 on a disarm), when the run ends: the main session's other messages and
//                  non-tierminator subagents since the run started
// Every function swallows errors: telemetry never affects a run.
'use strict'

const fs = require('fs')
const path = require('path')
const state = require('./state.js')
const { AS_OF, costOf, priceFor } = require('./prices.js')
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
    ? {
        tokens: u.tokens,
        total: u.total,
        messages: u.messages,
        costUsd: u.costUsd,
        unpriced: u.unpriced,
        models: Object.keys(u.byModel),
        cacheReadPct: u.total > 0 ? Math.round((100 * u.tokens.cacheRead) / u.total) : null,
        contextStart: u.firstContext ?? null,
        contextEnd: u.lastContext ?? null,
      }
    : { tokens: null, total: null, messages: null, costUsd: null, unpriced: [], models: [], cacheReadPct: null, contextStart: null, contextEnd: null }

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
  return `tierminator: ${r.task} on ${r.tier} ${verb}: ${usage}. Run so far: ${fmtUsd(runCost)}.`
}

const sum = (records, pick) => records.reduce((n, r) => n + (pick(r) ?? 0), 0)
// The share of cache reads in the tokens of the records that have usage, as a whole percent, or null.
function cachePct(records) {
  const withUsage = records.filter(r => r.tokens && r.total != null)
  const total = sum(withUsage, r => r.total)
  if (!withUsage.length || !total) return null
  return Math.round((100 * sum(withUsage, r => r.tokens.cacheRead)) / total)
}
const unpricedOf = records => [...new Set(records.flatMap(r => r.unpriced ?? []))]
const modelsOf = records => [...new Set(records.flatMap(r => r.models ?? []))]

// The planning records that led to a run. A plan revised in the dialog gets a new id each round, so
// matching by id alone would drop the rejected rounds. So each session that planned it contributes its
// planning records up to an anchor, and back to that session's previous run start (the planning before
// that belonged to an earlier plan):
//   - the run's own session: anchored at the run's start record;
//   - any other session: anchored at its latest planning record with this plan's id (a plan planned in
//     one session and run with /tierminator:execute-plan in another).
function planningFor(records, { planId, runId }) {
  const planning = records.filter(r => r.kind === 'planning')
  const starts = records.filter(r => r.kind === 'run')
  const anchors = new Map()
  const raise = (session, at) => {
    if (at && (!anchors.has(session) || at > anchors.get(session))) anchors.set(session, at)
  }
  const own = starts.find(r => runId && r.runId === runId)
  if (own) raise(own.sessionId, own.at)
  for (const p of planning) if (planId && p.planId === planId) raise(p.sessionId, p.at)
  return planning.filter(p => {
    if (!anchors.has(p.sessionId)) return false
    const anchor = anchors.get(p.sessionId)
    const floor = starts
      .filter(r => r.sessionId === p.sessionId && r.at < anchor && r !== own)
      .reduce((latest, r) => (r.at > latest ? r.at : latest), '')
    return p.at <= anchor && p.at > floor
  })
}

// What the run would have cost had the main session done every task itself, on the model that planned
// it: the planning, plus each finished task's own tokens, plus the cache reads that main session would have
// added by re-reading its context (the run's start context, plus what earlier tasks added, less what this
// task's worker started with) on each of the task's messages. Returns {model, costUsd, total,
// extraCacheRead, reason}; reason is null on success, else a short phrase and the numbers are null.
function mainAgentEstimate(records, { planId, runId }) {
  const planning = planningFor(records, { planId, runId })
  const fail = (model, reason) => ({ model, costUsd: null, total: null, extraCacheRead: null, reason })
  const latest = planning
    .filter(r => r.mainModel)
    .reduce((best, r) => (!best || r.at > best.at ? r : best), null)
  const model = latest?.mainModel ?? modelsOf(planning)[0] ?? null
  if (!model) return fail(null, 'no planning model')
  if (!priceFor(model)) return fail(model, `${model} is unpriced`)
  const run = records.find(r => r.kind === 'run' && r.runId === runId)
  const C = run?.contextTokens
  if (typeof C !== 'number') return fail(model, 'no context size for the run')
  const done = records
    .filter(r => r.kind === 'attempt' && r.runId === runId && r.outcome === 'done')
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  if (!done.length) return fail(model, 'no finished tasks')
  const num = v => typeof v === 'number'
  if (done.some(a => !a.tokens || !num(a.total) || !num(a.messages) || !num(a.contextStart) || !num(a.contextEnd))) {
    return fail(model, 'attempts lack context sizes')
  }
  let G = 0
  let extraTotal = 0
  let cost = sum(planning, r => r.costUsd)
  let tokens = sum(planning, r => r.total)
  for (const a of done) {
    const extra = Math.max(0, a.messages * (C + G - a.contextStart))
    cost += costOf(model, { ...a.tokens, cacheRead: a.tokens.cacheRead + extra })
    tokens += a.total + extra
    extraTotal += extra
    G += Math.max(0, a.contextEnd - a.contextStart)
  }
  return { model, costUsd: cost, total: tokens, extraCacheRead: extraTotal, reason: null }
}

// The end-of-run summary: the planning that led to the run (planningFor), then this run's attempts by
// tier and its orchestration, and a total.
function summary(records, { planId, runId }) {
  const planning = planningFor(records, { planId, runId })
  const attempts = records.filter(r => r.kind === 'attempt' && r.runId === runId)
  const orchestration = records.filter(r => r.kind === 'orchestration' && r.runId === runId)
  const rows = []
  const row = (label, recs, detail) => {
    if (!recs.length) return
    const pct = cachePct(recs)
    rows.push([label, fmtUsd(sum(recs, r => r.costUsd), unpricedOf(recs)), pct == null ? detail : `${detail}, ${pct}% cache reads`])
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
  const allPct = cachePct(all)
  const totalDetail = all.some(r => r.total != null)
    ? `${fmtTokens(sum(all, r => r.total))}${allPct == null ? '' : `, ${allPct}% cache reads`}`
    : ''
  const totalCost = sum(all, r => r.costUsd)
  rows.push(['total', fmtUsd(totalCost, unpricedOf(all)), totalDetail])
  const est = mainAgentEstimate(records, { planId, runId })
  if (est.reason) {
    rows.push(['main agent', '-', `not estimated: ${est.reason}`])
  } else {
    rows.push(['main agent', fmtUsd(est.costUsd), `${fmtTokens(est.total)}, ${est.model} running the tasks itself (estimated)`])
    const dUsd = est.costUsd - totalCost
    const dTok = est.total - sum(all, r => r.total)
    const tokPart = dTok >= 0 ? `${fmtTokens(dTok).replace(' tokens', '')} fewer tokens` : `${fmtTokens(-dTok).replace(' tokens', '')} more tokens`
    if (dUsd >= 0) {
      const pct = est.costUsd > 0 ? Math.round((100 * dUsd) / est.costUsd) : 0
      rows.push(['savings', fmtUsd(dUsd), `${pct}% of the main agent's cost, ${tokPart}`])
    } else {
      const pct = est.costUsd > 0 ? Math.round((100 * -dUsd) / est.costUsd) : 0
      rows.push(['extra cost', fmtUsd(-dUsd), `${pct}% more than the main agent, ${tokPart}`])
    }
  }
  const width = Math.max(...rows.map(r => r[0].length))
  const col = Math.max(...rows.map(r => r[1].length))
  const lines = rows.map(([a, b, c]) => `  ${a.padEnd(width)}  ${b.padEnd(col)}  ${c}`.trimEnd())
  return [`tierminator spend (estimated, prices as of ${AS_OF}):`, ...lines].join('\n')
}

module.exports = { fileFor, append, read, usageFields, fmtTokens, fmtUsd, attemptLine, planningFor, mainAgentEstimate, summary }
