// Checks what tierminator's hooks see, headless, when a foreground subagent stops at its maxTurns and
// is then resumed with SendMessage:
//   - whether SubagentStop fires at the limit, and its last_assistant_message and agent_transcript_path;
//   - the PostToolUse Agent tool_response (status, content text, agentId);
//   - whether SendMessage exists in a headless session, and whether it resumes the agent;
//   - the turns (distinct assistant message ids) in the agent's transcript.
//
//   node probes/planandtier/turn-limit-probe.js
//
// One headless session in a throwaway temp git repo, with probes/planandtier/turn-limit-probe-plugin
// loaded. Its agent, turn-probe (sonnet, low, maxTurns 3), is told to make eight Bash calls, one per
// turn. Writes probes/evidence/planandtier-turn-limit-probe.log (every hook input) and
// planandtier-turn-limit-probe-results.json (a summary). stdout and stderr are kept apart.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const plugin = path.join(__dirname, 'turn-limit-probe-plugin')
const evidence = path.join(__dirname, '..', 'evidence')
const logOut = path.join(evidence, 'planandtier-turn-limit-probe.log')
const resultsOut = path.join(evidence, 'planandtier-turn-limit-probe-results.json')
const base = path.join(os.tmpdir(), 'tierminator-turn-limit-probe')
const RESUME = 'Continue from where you stopped and finish.'

const PROMPT = [
  'Call the Agent tool once, with subagent_type "turn-limit-probe:turn-probe", description "turn probe",',
  'run_in_background false, and the prompt "Run your eight steps.".',
  'If the agent stops at its turn limit, call the SendMessage tool once to send it this exact message:',
  RESUME,
  'Do not run the steps yourself. When you are done, report what happened: what the Agent call returned,',
  'whether SendMessage was available, and what it returned.',
].join('\n')

fs.rmSync(base, { recursive: true, force: true })
const repo = path.join(base, 'repo')
fs.mkdirSync(repo, { recursive: true })
spawnSync('git', ['init', '-q'], { cwd: repo })
const log = path.join(base, 'probe.log')

const r = spawnSync(
  'claude',
  [
    '-p', PROMPT,
    '--plugin-dir', plugin,
    '--output-format', 'stream-json', '--verbose',
    '--allowedTools', 'Bash(echo *)', 'Agent', 'SendMessage',
  ],
  { cwd: repo, env: { ...process.env, PROBE_LOG: log }, encoding: 'utf8', timeout: 900000, maxBuffer: 64 * 1024 * 1024 }
)
const stdout = r.stdout ?? ''
const stderr = (r.stderr ?? '') + (r.error ? `\n[spawn error] ${r.error.message}` : '')

const entries = fs.existsSync(log)
  ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []
if (fs.existsSync(log)) fs.copyFileSync(log, logOut)
else fs.writeFileSync(logOut, '')

const parse = e => {
  try {
    return JSON.parse(e.stdin)
  } catch {
    return {}
  }
}
const cut = (v, n = 1500) => (typeof v === 'string' && v.length > n ? `${v.slice(0, n)}…(${v.length})` : v)
const deep = v => JSON.parse(JSON.stringify(v ?? null), (k, x) => cut(x))

const streamEvents = stdout.split('\n').filter(Boolean).map(l => {
  try {
    return JSON.parse(l)
  } catch {
    return null
  }
}).filter(Boolean)
const init = streamEvents.find(e => e.type === 'system' && e.subtype === 'init') ?? {}
const final = streamEvents.filter(e => e.type === 'result').pop() ?? {}
const toolsAvailable = Array.isArray(init.tools) ? init.tools : null

// Main-session tool calls, from the stream (tool_use blocks of the main thread).
const mainToolUses = []
for (const e of streamEvents) {
  if (e.type !== 'assistant' || e.parent_tool_use_id) continue
  for (const b of e.message?.content ?? []) {
    if (b.type === 'tool_use') mainToolUses.push({ name: b.name, input: deep(b.input) })
  }
}

// Turns in a transcript: distinct assistant message ids, as lib/usage.js counts them.
function turnsOf(file) {
  if (!file || !fs.existsSync(file)) return null
  const ids = new Set()
  let toolCalls = 0
  const tools = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    if (rec.type !== 'assistant' || !rec.message) continue
    ids.add(rec.message.id)
    for (const b of rec.message.content ?? []) {
      if (b.type === 'tool_use') {
        toolCalls++
        tools.push(b.name === 'Bash' ? `Bash: ${b.input?.command}` : b.name)
      }
    }
  }
  return { turns: ids.size, toolCalls, tools }
}

const events = entries.map(e => {
  const s = parse(e)
  const row = { at: e.at, tag: e.tag, hook_event_name: s.hook_event_name }
  if ('tool_name' in s) row.tool_name = s.tool_name
  if ('tool_input' in s) row.tool_input = deep(s.tool_input)
  if ('tool_response' in s) row.tool_response = deep(s.tool_response)
  if ('error' in s) row.error = cut(s.error)
  if (e.tag === 'sub-stop') {
    row.keys = Object.keys(s)
    row.agent_id = s.agent_id
    row.agent_type = s.agent_type
    row.agent_transcript_path = s.agent_transcript_path
    row.last_assistant_message = cut(s.last_assistant_message)
    row.stop_hook_active = s.stop_hook_active
  }
  if (e.tag === 'ups') row.prompt = cut(s.prompt)
  if (e.tag === 'stop') {
    row.stop_hook_active = s.stop_hook_active
    row.last_assistant_message = cut(s.last_assistant_message)
  }
  return row
})

const subStops = events.filter(e => e.tag === 'sub-stop')
const agentPost = events.filter(e => e.tag === 'post' && /^(Agent|Task)$/.test(e.tool_name ?? ''))
const sendPre = events.filter(e => e.tag === 'pre' && e.tool_name === 'SendMessage')
const sendPost = events.filter(e => (e.tag === 'post' || e.tag === 'post-fail') && e.tool_name === 'SendMessage')
const textOf = resp => {
  const c = resp?.content
  if (Array.isArray(c)) return c.filter(b => b?.type === 'text').map(b => b.text).join('\n')
  return typeof c === 'string' ? c : null
}
const agentTranscript =
  subStops.map(e => e.agent_transcript_path).find(Boolean) ??
  (() => {
    const id = agentPost.map(e => e.tool_response?.agentId).find(Boolean)
    const main = entries.map(parse).map(s => s.transcript_path).find(Boolean)
    return id && main ? path.join(main.replace(/\.jsonl$/, ''), 'subagents', `agent-${id}.jsonl`) : null
  })()

const version = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null
const summary = {
  subagentStop: {
    fired: subStops.length,
    stops: subStops.map(e => ({
      at: e.at,
      agent_id: e.agent_id,
      agent_type: e.agent_type,
      last_assistant_message: e.last_assistant_message,
      agent_transcript_path: e.agent_transcript_path,
    })),
  },
  agentPostToolUse: agentPost.map(e => ({
    at: e.at,
    status: e.tool_response?.status ?? null,
    agentId: e.tool_response?.agentId ?? null,
    isAsync: e.tool_response?.isAsync ?? null,
    contentText: textOf(e.tool_response),
    responseKeys: e.tool_response && typeof e.tool_response === 'object' ? Object.keys(e.tool_response) : null,
  })),
  sendMessage: {
    inToolList: toolsAvailable ? toolsAvailable.includes('SendMessage') : null,
    calledByMain: mainToolUses.filter(u => u.name === 'SendMessage').map(u => u.input),
    preToolUse: sendPre.length,
    results: sendPost.map(e => ({ tag: e.tag, tool_response: e.tool_response, error: e.error })),
  },
  agentTranscript: agentTranscript ? { path: agentTranscript, ...turnsOf(agentTranscript) } : null,
  mainToolCalls: mainToolUses.map(u => u.name),
}

fs.writeFileSync(
  resultsOut,
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      claudeCodeVersion: version,
      exitCode: r.status,
      prompt: PROMPT,
      toolsAvailable,
      result: cut(final.result ?? null, 4000),
      costUsd: final.total_cost_usd ?? null,
      stderr: stderr.slice(0, 4000),
      summary,
      events,
    },
    null,
    2
  ) + '\n'
)
console.log(`exit ${r.status}; ${entries.length} hook events; wrote ${resultsOut}`)
