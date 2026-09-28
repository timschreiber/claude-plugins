// Records what planandtier's telemetry reads, from this machine's end-to-end runs:
//   - worker transcripts (subagents/agent-*.jsonl): the usage on each assistant line, how lines repeat a
//     message id, and which of the repeats carries the larger counts;
//   - main transcripts: the permission-mode entries that separate planning from execution, and the
//     models used;
//   - subagent meta files: their fields and agent types;
//   - the Agent tool's PostToolUse result in the headless probe (foreground) and the interactive run
//     (background): whether it carries usage.
// Structure and numbers only: no message text is written.
//
//   node probes/planandtier/usage-shapes.js
//
// Reads ~/.claude/projects/*tier-agents*/ and probes/evidence/planandtier-agent*-probe.log. Writes
// probes/evidence/planandtier-usage-shapes.json.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const projects = path.join(os.homedir(), '.claude', 'projects')
const evidence = path.join(__dirname, '..', 'evidence')
const readJsonl = file =>
  fs
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

const FIELDS = ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']
const sumBy = (messages, pick) => Object.fromEntries(FIELDS.map(f => [f, messages.reduce((n, m) => n + (pick(m)[f] ?? 0), 0)]))

// Per transcript: assistant lines, distinct message ids, what repeats look like, and the totals under
// three ways of counting repeats (every line, the last line per id, the largest value per id and field).
function transcriptShape(file) {
  const lines = readJsonl(file)
  const assistant = lines.filter(o => o.type === 'assistant' && o.message?.usage)
  const byId = new Map()
  for (const o of assistant) {
    const id = o.message.id ?? o.uuid
    if (!byId.has(id)) byId.set(id, [])
    byId.get(id).push(o)
  }
  const repeats = [...byId.values()].filter(v => v.length > 1)
  const groups = [...byId.values()]
  const max = v => Object.fromEntries(FIELDS.map(f => [f, Math.max(...v.map(o => o.message.usage[f] ?? 0))]))
  return {
    file: path.relative(projects, file),
    assistantLines: assistant.length,
    messageIds: byId.size,
    repeatedIds: repeats.length,
    repeats: repeats.map(v => ({
      lines: v.length,
      outputTokensByLine: v.map(o => o.message.usage.output_tokens),
      inputSideSameOnEveryLine: v.every(o =>
        ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].every(
          f => o.message.usage[f] === v[0].message.usage[f]
        )
      ),
      stopReasonByLine: v.map(o => o.message.stop_reason ?? null),
      blockTypesByLine: v.map(o => (o.message.content ?? []).map(c => c.type).join('+')),
    })),
    models: [...new Set(assistant.map(o => o.message.model))],
    usageKeys: [...new Set(assistant.flatMap(o => Object.keys(o.message.usage)))].sort(),
    cacheCreationKeys: [...new Set(assistant.flatMap(o => Object.keys(o.message.usage.cache_creation ?? {})))].sort(),
    inferenceGeo: [...new Set(assistant.map(o => o.message.usage.inference_geo ?? null))],
    totals: {
      everyLine: sumBy(assistant, o => o.message.usage),
      lastLinePerId: sumBy(groups.map(v => v[v.length - 1]), o => o.message.usage),
      largestPerIdAndField: sumBy(groups.map(max), u => u),
    },
    firstTimestamp: assistant[0]?.timestamp ?? null,
    lastTimestamp: assistant[assistant.length - 1]?.timestamp ?? null,
  }
}

// The main transcript's mode entries, in order, and which mode each assistant message fell under.
function modeShape(file) {
  const lines = readJsonl(file)
  let mode = null
  const sequence = []
  const assistantByMode = {}
  const modelsByMode = {}
  for (const o of lines) {
    if (o.type === 'permission-mode' || (o.type === 'user' && o.permissionMode)) {
      if (o.permissionMode !== mode) sequence.push(`${o.type}:${o.permissionMode}`)
      mode = o.permissionMode
    }
    if (o.type === 'assistant') {
      const key = String(mode)
      assistantByMode[key] = (assistantByMode[key] ?? 0) + 1
      ;(modelsByMode[key] ??= new Set()).add(o.message?.model)
    }
  }
  return {
    file: path.relative(projects, file),
    modeChanges: sequence,
    permissionModeEntries: lines.filter(o => o.type === 'permission-mode').length,
    permissionModeEntryKeys: [...new Set(lines.filter(o => o.type === 'permission-mode').flatMap(o => Object.keys(o)))].sort(),
    assistantLinesByMode: assistantByMode,
    modelsByMode: Object.fromEntries(Object.entries(modelsByMode).map(([k, v]) => [k, [...v]])),
  }
}

const sessions = []
for (const dir of fs.readdirSync(projects).filter(d => d.includes('tier-agents'))) {
  const root = path.join(projects, dir)
  for (const main of fs.readdirSync(root).filter(f => f.endsWith('.jsonl'))) {
    const sub = path.join(root, main.replace(/\.jsonl$/, ''), 'subagents')
    const agents = fs.existsSync(sub) ? fs.readdirSync(sub).filter(f => f.endsWith('.jsonl')) : []
    sessions.push({
      main: modeShape(path.join(root, main)),
      mainUsage: transcriptShape(path.join(root, main)),
      subagents: agents.map(f => {
        const metaFile = path.join(sub, f.replace(/\.jsonl$/, '.meta.json'))
        let meta = null
        try {
          meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
        } catch {}
        return {
          meta: meta && { keys: Object.keys(meta).sort(), agentType: meta.agentType, requestShape: meta.requestShape, model: meta.model ?? null },
          ...transcriptShape(path.join(sub, f)),
        }
      }),
    })
  }
}

// PostToolUse on Agent, foreground (the headless probe) and background (the interactive run).
const agentResults = []
for (const log of ['planandtier-agent-probe.log', 'planandtier-agents-probe.log']) {
  for (const e of readJsonl(path.join(evidence, log))) {
    let input
    try {
      input = JSON.parse(e.stdin)
    } catch {
      continue
    }
    if (input.hook_event_name !== 'PostToolUse' || input.tool_name !== 'Agent') continue
    const r = input.tool_response ?? {}
    agentResults.push({
      log,
      status: r.status,
      isAsync: r.isAsync ?? false,
      hasUsage: 'usage' in r,
      usageKeys: r.usage ? Object.keys(r.usage).sort() : [],
      totalTokens: r.totalTokens ?? null,
    })
  }
}

const out = {
  generated: new Date().toISOString(),
  claudeCodeVersion: sessions[0]?.mainUsage && readJsonl(path.join(projects, sessions[0].main.file)).find(o => o.version)?.version,
  source: 'Transcripts under ~/.claude/projects/*tier-agents*/ from the 2026-09-28 end-to-end runs, and the agent probe logs',
  sessions,
  agentToolResults: agentResults,
}
fs.writeFileSync(path.join(evidence, 'planandtier-usage-shapes.json'), JSON.stringify(out, null, 2) + '\n')
console.log(
  JSON.stringify(
    {
      sessions: sessions.length,
      workerTranscripts: sessions.reduce((n, s) => n + s.subagents.length, 0),
      repeatedIds: sessions.reduce((n, s) => n + s.subagents.reduce((m, a) => m + a.repeatedIds, 0), 0),
      agentToolResults: agentResults,
    },
    null,
    2
  )
)
