// Splits an interactive evidence file of probes/tierminator-parallel into rounds and writes a `rounds` summary
// into it. An interactive session can hold several dispatch rounds (the prompt pasted again after a cleanup), and
// the runner's `analysis` mixes them. Re-runnable: it replaces any earlier `rounds` key.
//
//   node probes/tierminator-parallel/split-rounds.js <evidence file> <split time, ISO>
//
// Round 1 is every hook-log entry before the split time, round 2 every entry from it on. Per round: the worktree
// hooks (`mkwt`), the probe workers (agent_type contains "c-"; other subagents are counted apart), the
// `PostToolUse` results on the Agent call, the notifications, the permission modes seen, the permission requests
// and the guard's denials.
'use strict'

const fs = require('fs')

const [file, split] = process.argv.slice(2)
if (!file || !split || Number.isNaN(Date.parse(split))) {
  process.stderr.write('usage: node split-rounds.js <evidence file> <split time, ISO>\n')
  process.exit(2)
}

const parse = s => {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}
const ms = t => Date.parse(t)
const time = t => t.slice(11, 23)

const doc = JSON.parse(fs.readFileSync(file, 'utf8'))

function summarize(entries) {
  const stdin = e => parse(e.stdin)
  const isWorker = j => /(^|:)c-/.test(String(j.agent_type ?? ''))

  const mkwt = entries.filter(e => e.tag === 'mkwt').sort((a, b) => ms(a.startedAt) - ms(b.startedAt))
  const hooks = mkwt.map((e, i) => ({
    task: e.task,
    status: e.status,
    startedAt: time(e.startedAt),
    endedAt: time(e.endedAt),
    durationMs: ms(e.endedAt) - ms(e.startedAt),
    gapAfterPreviousEndMs: i === 0 ? null : ms(e.startedAt) - ms(mkwt[i - 1].endedAt),
  }))
  const hooksOverlap = mkwt.some((a, i) => mkwt.some((b, j) => i < j && ms(a.startedAt) < ms(b.endedAt) && ms(b.startedAt) < ms(a.endedAt)))

  const starts = entries.filter(e => e.tag === 'sub-start').map(e => ({ at: e.at, ...stdin(e) })).filter(isWorker).sort((a, b) => ms(a.at) - ms(b.at))
  const stops = entries.filter(e => e.tag === 'sub-stop').map(e => ({ at: e.at, ...stdin(e) }))
  const workerStops = stops.filter(isWorker).sort((a, b) => ms(a.at) - ms(b.at))
  const hooksByEnd = [...mkwt].sort((a, b) => ms(a.endedAt) - ms(b.endedAt))
  const workers = starts.map(s => {
    const st = workerStops.find(x => x.agent_id === s.agent_id)
    return { agentId: s.agent_id, startAt: time(s.at), stopAt: st ? time(st.at) : null, seconds: st ? (ms(st.at) - ms(s.at)) / 1000 : null }
  })
  const stopMs = workerStops.map(x => ms(x.at))

  const postAgent = entries
    .filter(e => e.tag === 'post-agent')
    .map(e => ({ at: time(e.at), status: stdin(e).tool_response?.status ?? null, isAsync: stdin(e).tool_response?.isAsync ?? null }))

  const prompts = entries.filter(e => e.tag === 'ups').map(e => {
    const p = String(stdin(e).prompt ?? '')
    return { at: time(e.at), kind: p.includes('<task-notification') ? 'task-notification' : p.includes('<agent-message') ? 'agent-message' : 'user', head: p.replace(/\s+/g, ' ').trim().slice(0, 80) }
  })

  const modes = []
  for (const e of entries) {
    const m = stdin(e).permission_mode
    if (m && (modes.length === 0 || modes[modes.length - 1].mode !== m)) modes.push({ at: time(e.at), mode: m })
  }
  const modeEvents = {}
  for (const e of entries) {
    const m = stdin(e).permission_mode
    if (m) modeEvents[m] = (modeEvents[m] ?? 0) + 1
  }

  const requests = entries.filter(e => e.tag === 'perm-request').map(e => {
    const j = stdin(e)
    const ti = j.tool_input ?? {}
    return { at: time(e.at), tool: j.tool_name, mode: j.permission_mode ?? null, input: String(ti.command ?? ti.file_path ?? ti.path ?? '').slice(0, 90), suggestion: Array.isArray(j.permission_suggestions) && j.permission_suggestions.length > 0 }
  })
  const byTool = {}
  for (const r of requests) byTool[r.tool] = (byTool[r.tool] ?? 0) + 1
  const cdBash = requests.filter(r => r.tool === 'Bash' && /^cd "/.test(r.input))

  const denials = entries
    .filter(e => e.tag === 'c-tool' && e.denied)
    .map(e => ({ at: time(e.at), tool: e.tool, target: e.input?.file_path ?? e.input?.path ?? e.input?.command ?? null }))

  return {
    from: time(entries[0].at),
    to: time(entries[entries.length - 1].at),
    worktreeHooks: { hooks, overlap: hooksOverlap },
    subagentStartAfterHookEndMs: starts.map((s, i) => (hooksByEnd[i] ? ms(s.at) - ms(hooksByEnd[i].endedAt) : null)),
    workers: {
      probeWorkers: workers.length,
      otherSubagentStops: stops.length - workerStops.length,
      allOverlap: starts.length > 0 && Math.max(...starts.map(s => ms(s.at))) < Math.min(...stopMs),
      list: workers,
    },
    postAgent,
    prompts,
    permissionModes: { sequence: modes, eventsPerMode: modeEvents },
    permissionRequests: { total: requests.length, byTool, cdBashWithoutSuggestion: cdBash.filter(r => !r.suggestion).length, cdBashWithSuggestion: cdBash.filter(r => r.suggestion).length, list: requests },
    guardDenials: denials,
  }
}

const log = doc.hookLog.filter(e => e.at)
const cut = ms(split)
const first = log.filter(e => ms(e.at) < cut)
const second = log.filter(e => ms(e.at) >= cut)
if (first.length === 0 || second.length === 0) {
  process.stderr.write('the split time leaves a round empty\n')
  process.exit(2)
}

doc.rounds = {
  splitAt: split,
  note: 'Hook-log entries before splitAt are round 1, from splitAt on round 2. Written by probes/tierminator-parallel/split-rounds.js; the runner analysis mixes both rounds.',
  round1: summarize(first),
  round2: summarize(second),
}
fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
console.log(JSON.stringify(doc.rounds, null, 2))
