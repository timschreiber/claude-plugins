// Checks what planandtier's hooks would see if tasks ran through the Agent tool instead of a
// workflow:
//   3. PreToolUse on Agent: the dispatch's subagent_type and prompt, and whether a denial with a
//      corrective reason makes Claude dispatch again as told;
//   4. where the worker's report is available: PostToolUse on Agent, SubagentStop, or the task
//      notification (UserPromptSubmit).
//
//   node probes/planandtier/agent-probe.js
//
// One headless session in a temp git repo, with probes/planandtier/agent-probe-plugin loaded.
// Writes probes/evidence/planandtier-agent-probe.log (every hook input) and
// planandtier-agent-probe-results.json (a summary). stdout and stderr are kept apart.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const plugin = path.join(__dirname, 'agent-probe-plugin')
const evidence = path.join(__dirname, '..', 'evidence')
const logOut = path.join(evidence, 'planandtier-agent-probe.log')
const resultsOut = path.join(evidence, 'planandtier-agent-probe-results.json')
const base = path.join(os.tmpdir(), 'planandtier-agent-probe')

const PROMPT = [
  'Call the Agent tool once, with subagent_type "planandtier-agent-probe:sonnet-low", description "probe",',
  'and this exact prompt (two lines):',
  'Tasks file: C:/probe/plan.tasks.json',
  'Task: T01',
  'If a hook denies the call, do what the denial says and call the Agent tool again.',
  'When the agent has finished, reply with its report verbatim and nothing else.',
].join('\n')

fs.rmSync(base, { recursive: true, force: true })
const repo = path.join(base, 'repo')
fs.mkdirSync(repo, { recursive: true })
spawnSync('git', ['init', '-q'], { cwd: repo })
const log = path.join(base, 'probe.log')

const r = spawnSync('claude', ['-p', PROMPT, '--plugin-dir', plugin, '--output-format', 'json'], {
  cwd: repo,
  env: { ...process.env, PROBE_LOG: log },
  encoding: 'utf8',
  timeout: 600000,
})
const stdout = r.stdout ?? ''
const stderr = (r.stderr ?? '') + (r.error ? `\n[spawn error] ${r.error.message}` : '')

const entries = fs.existsSync(log)
  ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  : []
fs.copyFileSync(log, logOut)

const parse = e => {
  try {
    return JSON.parse(e.stdin)
  } catch {
    return {}
  }
}
const cut = (v, n = 600) => (typeof v === 'string' && v.length > n ? `${v.slice(0, n)}…(${v.length})` : v)
const summary = entries.map(e => {
  const s = parse(e)
  const row = { at: e.at, tag: e.tag }
  if (e.tag.startsWith('pre-agent') || e.tag.startsWith('post-agent')) {
    row.tool_name = s.tool_name
    row.tool_input = s.tool_input
    if ('tool_response' in s) row.tool_response = JSON.parse(JSON.stringify(s.tool_response ?? null), (k, v) => cut(v))
  }
  if (e.tag === 'sub-start' || e.tag === 'sub-stop') {
    row.agent_type = s.agent_type
    row.effort = s.effort
    row.keys = Object.keys(s)
    row.last_assistant_message = cut(s.last_assistant_message)
  }
  if (e.tag === 'ups') row.prompt = cut(s.prompt, 1500)
  return row
})

let result = null
try {
  result = JSON.parse(stdout).result
} catch {}

const version = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null
fs.writeFileSync(
  resultsOut,
  JSON.stringify(
    { generated: new Date().toISOString(), claudeCodeVersion: version, exitCode: r.status, result, stderr: stderr.slice(0, 4000), events: summary },
    null,
    2
  ) + '\n'
)
console.log(`exit ${r.status}; ${entries.length} hook events; wrote ${resultsOut}`)
