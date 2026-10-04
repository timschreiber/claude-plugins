'use strict'
// Turn usage of tierminator's tier workers, from every subagent transcript on this machine.
// Usage: node probes/planandtier/turn-usage.js
// Writes probes/evidence/planandtier-turn-usage.json.
//
// It scans ~/.claude/projects/*/*/subagents/agent-*.jsonl whose agent-*.meta.json agentType starts with
// 'tierminator:' or 'planandtier:' (the plugin's earlier name). A turn is one assistant message: the
// distinct message ids that lib/usage.js messagesOf counts. The tier is the agentType's suffix, and the
// limit at the time was the tier agent's maxTurns: 30, 40 or 60 for low, medium or high effort.
// A transcript still being written when this runs is left out (see IN_PROGRESS_MS).
// Output paths are relative to the home directory, and no prompt text is kept: tasks are keyed by the
// tasks file's name and the Task line.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { messagesOf } = require('../../plugins/tierminator/scripts/lib/usage.js')

const HOME = os.homedir()
const PROJECTS = path.join(HOME, '.claude', 'projects')
const OUT = path.join(__dirname, '..', 'evidence', 'planandtier-turn-usage.json')
const MAX_TURNS_AT_THE_TIME = { low: 30, medium: 40, high: 60 }
const NEAR = 0.8
// A transcript written to in the last 10 minutes is still running (the worker running this scan, for one)
// and is left out, so its partial count does not move the percentiles.
const IN_PROGRESS_MS = 10 * 60 * 1000

const rel = p => path.relative(HOME, p).split(path.sep).join('/')

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

const list = dir => {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

// The dispatch prompt's tasks file name and task id: the first user message of the transcript.
function taskKey(lines) {
  const first = lines.find(o => o.type === 'user' && o.message)
  const c = first?.message?.content
  const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map(b => (b.type === 'text' ? b.text : '')).join('\n') : ''
  const file = /^Tasks file:[ \t]*(.+)$/m.exec(text)?.[1]?.trim()
  const task = /^Task:[ \t]*(\S+)/m.exec(text)?.[1]
  if (!file || !task) return null
  return `${file.split(/[\\/]/).pop()} ${task}`
}

function toolCalls(lines) {
  const ids = new Set()
  let n = 0
  for (const o of lines) {
    if (o.type !== 'assistant' || !Array.isArray(o.message?.content)) continue
    for (const b of o.message.content) {
      if (b.type !== 'tool_use') continue
      if (b.id) {
        if (ids.has(b.id)) continue
        ids.add(b.id)
      }
      n++
    }
  }
  return n
}

function percentile(sorted, p) {
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

const agents = []
const inProgress = []
for (const project of list(PROJECTS)) {
  for (const session of list(path.join(PROJECTS, project))) {
    const dir = path.join(PROJECTS, project, session, 'subagents')
    for (const name of list(dir).filter(n => /^agent-.*\.meta\.json$/.test(n))) {
      let type = null
      try {
        type = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')).agentType ?? null
      } catch {}
      if (typeof type !== 'string' || !/^(tierminator|planandtier):/.test(type)) continue
      const file = path.join(dir, name.replace(/\.meta\.json$/, '.jsonl'))
      const lines = readLines(file)
      if (!lines) continue
      const last = lines.map(o => Date.parse(o.timestamp)).filter(t => !Number.isNaN(t)).pop()
      if (last && Date.now() - last < IN_PROGRESS_MS) {
        inProgress.push(rel(file))
        continue
      }
      const tier = type.split(':')[1]
      const effort = tier.split('-').pop()
      const maxTurns = MAX_TURNS_AT_THE_TIME[effort] ?? null
      const turns = messagesOf(lines).length
      const versions = [...new Set(lines.map(o => o.version).filter(Boolean))]
      agents.push({
        transcript: rel(file),
        agentType: type,
        tier,
        task: taskKey(lines),
        turns,
        toolCalls: toolCalls(lines),
        maxTurns,
        nearLimit: maxTurns != null && turns >= NEAR * maxTurns,
        startedAt: lines.find(o => o.timestamp)?.timestamp ?? null,
        claudeCodeVersions: versions,
      })
    }
  }
}
agents.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)))

const byTier = {}
for (const a of agents) (byTier[a.tier] ??= []).push(a)
const tiers = {}
for (const [tier, list] of Object.entries(byTier).sort()) {
  const turns = list.map(a => a.turns).sort((x, y) => x - y)
  const allTurns = turns.reduce((n, t) => n + t, 0)
  const allCalls = list.reduce((n, a) => n + a.toolCalls, 0)
  tiers[tier] = {
    n: list.length,
    maxTurnsAtTheTime: list[0].maxTurns,
    turns: { p50: percentile(turns, 50), p90: percentile(turns, 90), max: turns[turns.length - 1] },
    toolCallsPerTurn: allTurns ? Math.round((allCalls / allTurns) * 100) / 100 : null,
    atLeast80PercentOfMaxTurns: list.filter(a => a.nearLimit).length,
  }
}

// Tasks dispatched with the same tasks file and Task line on more than one tier: a retry one tier up, or
// the same plan run again.
const byTask = {}
for (const a of agents) if (a.task) (byTask[a.task] ??= []).push(a)
const sameTaskAcrossTiers = Object.entries(byTask)
  .filter(([, list]) => new Set(list.map(a => a.tier)).size > 1)
  .map(([task, list]) => ({
    task,
    runs: list.map(a => ({ tier: a.tier, turns: a.turns, toolCalls: a.toolCalls, startedAt: a.startedAt, transcript: a.transcript })),
  }))

const out = {
  generatedAt: new Date().toISOString(),
  source: '~/.claude/projects/*/*/subagents/agent-*.jsonl with agentType tierminator:* or planandtier:*',
  method:
    'turns = distinct assistant message ids (lib/usage.js messagesOf); toolCalls = distinct tool_use blocks; maxTurns at the time = 30/40/60 for low/medium/high; nearLimit = turns >= 80% of it. Percentiles are nearest-rank. A resumed worker counts its turns before and after the resume.',
  leftOutInProgress: inProgress,
  tiers,
  sameTaskAcrossTiers,
  agents,
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
process.stdout.write(`${agents.length} worker transcripts, ${sameTaskAcrossTiers.length} tasks run on more than one tier -> ${rel(OUT)}\n`)
for (const [tier, t] of Object.entries(tiers))
  process.stdout.write(`${tier}: n=${t.n} p50=${t.turns.p50} p90=${t.turns.p90} max=${t.turns.max} calls/turn=${t.toolCallsPerTurn} >=80%=${t.atLeast80PercentOfMaxTurns}\n`)
