// Token usage read from Claude Code transcripts, for planandtier's spend estimates. The Agent tool's
// result has no usage for a background worker, so usage comes from transcripts: the worker's own, and the
// main session's for planning and orchestration (planandtier-telemetry-findings.md).
//   - Each assistant line has message.model and message.usage. One message can span several lines with
//     the same message.id, the earlier ones with a smaller output count, so each field takes its largest
//     value per id.
//   - The main transcript's permission-mode entries (and permissionMode on user entries) tell which mode
//     each message was written in, so planning (plan mode) can be told from execution.
// Every function swallows errors: a missing or unreadable transcript counts as nothing.
'use strict'

const fs = require('fs')
const path = require('path')
const { costOf } = require('./prices.js')

const KINDS = ['input', 'output', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead']
const zero = () => Object.fromEntries(KINDS.map(k => [k, 0]))
const totalOf = tokens => KINDS.reduce((n, k) => n + (tokens[k] ?? 0), 0)
// What a message read as its context: everything sent in, not the output.
const contextOf = tokens => tokens.input + tokens.cacheWrite5m + tokens.cacheWrite1h + tokens.cacheRead

function readLines(file) {
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
    return null
  }
}

// One line's usage as token kinds. Without a 5 m / 1 h split, cache writes count as 5-minute writes.
function tokensOf(usage) {
  const split = usage.cache_creation
  const write = usage.cache_creation_input_tokens ?? 0
  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheWrite5m: split ? split.ephemeral_5m_input_tokens ?? 0 : write,
    cacheWrite1h: split ? split.ephemeral_1h_input_tokens ?? 0 : 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
  }
}

const inWindow = (at, from, to) => {
  const t = Date.parse(at)
  if (Number.isNaN(t)) return from == null && to == null
  return (from == null || t > Date.parse(from)) && (to == null || t <= Date.parse(to))
}

// The transcript's messages, one per message id: {model, geo, tokens, at, mode}. `mode` is 'plan' or
// 'other' to keep only messages written in (or outside) plan mode; from/to (ISO times) bound the
// message's first line.
function messagesOf(lines, { from = null, to = null, mode = null } = {}) {
  const byId = new Map()
  let current = null
  for (const o of lines ?? []) {
    if (o.type === 'permission-mode' || (o.type === 'user' && typeof o.permissionMode === 'string')) {
      current = o.permissionMode
      continue
    }
    const usage = o.type === 'assistant' ? o.message?.usage : null
    if (!usage) continue
    const id = o.message.id ?? o.uuid
    const tokens = tokensOf(usage)
    const seen = byId.get(id)
    if (seen) {
      for (const k of KINDS) seen.tokens[k] = Math.max(seen.tokens[k], tokens[k])
      continue
    }
    byId.set(id, {
      model: o.message.model ?? 'unknown',
      geo: usage.inference_geo ?? null,
      tokens,
      at: o.timestamp ?? null,
      mode: current === 'plan' ? 'plan' : 'other',
    })
  }
  return [...byId.values()].filter(m => (!mode || m.mode === mode) && inWindow(m.at, from, to))
}

// Totals for a list of messages: {tokens, total, messages, costUsd, unpriced, byModel, firstAt, lastAt}.
// costUsd sums the priced messages; unpriced names the models with no price.
function tally(messages) {
  const t = { tokens: zero(), total: 0, messages: 0, costUsd: 0, unpriced: [], byModel: {}, firstAt: null, lastAt: null, firstContext: null, lastContext: null, lastModel: null }
  for (const m of messages) {
    const cost = costOf(m.model, m.tokens, m.geo)
    const b = (t.byModel[m.model] ??= { tokens: zero(), messages: 0, costUsd: cost === null ? null : 0 })
    for (const k of KINDS) {
      t.tokens[k] += m.tokens[k]
      b.tokens[k] += m.tokens[k]
    }
    t.messages++
    b.messages++
    if (cost === null) {
      if (!t.unpriced.includes(m.model)) t.unpriced.push(m.model)
    } else {
      t.costUsd += cost
      b.costUsd += cost
    }
    if (m.at && (!t.firstAt || m.at < t.firstAt)) {
      t.firstAt = m.at
      t.firstContext = contextOf(m.tokens)
    }
    if (m.at && (!t.lastAt || m.at > t.lastAt)) {
      t.lastAt = m.at
      t.lastContext = contextOf(m.tokens)
      t.lastModel = m.model
    }
  }
  t.total = totalOf(t.tokens)
  return t
}

// Adds tallies together.
function combine(...tallies) {
  const t = tally([])
  for (const s of tallies.filter(Boolean)) {
    for (const k of KINDS) t.tokens[k] += s.tokens[k]
    t.messages += s.messages
    t.costUsd += s.costUsd
    for (const m of s.unpriced) if (!t.unpriced.includes(m)) t.unpriced.push(m)
    for (const [model, b] of Object.entries(s.byModel)) {
      const into = (t.byModel[model] ??= { tokens: zero(), messages: 0, costUsd: b.costUsd === null ? null : 0 })
      for (const k of KINDS) into.tokens[k] += b.tokens[k]
      into.messages += b.messages
      if (b.costUsd !== null && into.costUsd !== null) into.costUsd += b.costUsd
    }
    if (s.firstAt && (!t.firstAt || s.firstAt < t.firstAt)) t.firstAt = s.firstAt
    if (s.lastAt && (!t.lastAt || s.lastAt > t.lastAt)) t.lastAt = s.lastAt
  }
  t.total = totalOf(t.tokens)
  return t
}

// A transcript's usage, or null when it cannot be read.
function transcriptUsage(file, opts) {
  const lines = readLines(file)
  return lines ? tally(messagesOf(lines, opts)) : null
}

// The directory holding a session's subagent transcripts, next to its main transcript.
const subagentsDir = mainTranscript =>
  typeof mainTranscript === 'string' && mainTranscript
    ? path.join(path.dirname(mainTranscript), path.basename(mainTranscript, '.jsonl'), 'subagents')
    : null

// The usage of the subagents that started in the window, skipping the agent types `exclude` returns
// true for. Adds `count`, the number of subagents counted.
function subagentUsage(dir, { from = null, to = null, exclude = () => false } = {}) {
  const tallies = []
  let names = []
  try {
    names = fs.readdirSync(dir).filter(n => n.endsWith('.jsonl'))
  } catch {}
  for (const name of names) {
    let type = null
    try {
      type = JSON.parse(fs.readFileSync(path.join(dir, name.replace(/\.jsonl$/, '.meta.json')), 'utf8')).agentType ?? null
    } catch {}
    if (exclude(type)) continue
    const messages = messagesOf(readLines(path.join(dir, name)))
    const first = messages.map(m => m.at).filter(Boolean).sort()[0]
    if (!first || !inWindow(first, from, to)) continue
    tallies.push(tally(messages))
  }
  return { ...combine(...tallies), count: tallies.length }
}

module.exports = { KINDS, contextOf, tokensOf, messagesOf, tally, combine, transcriptUsage, subagentUsage, subagentsDir }
