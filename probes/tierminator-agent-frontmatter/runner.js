// Checks that Claude Code applies the tierminator worker agents' frontmatter at runtime: for each tier agent, one
// headless claude -p session (plugin loaded with --plugin-dir, no other settings or plugins) dispatches the agent
// once and the worker is told to try the Agent tool. Records, from the stream and a SubagentStop hook:
//   - the model the worker's own messages ran on (frontmatter `model`)
//   - the effort SubagentStop reports for it (frontmatter `effort`)
//   - whether the worker made an Agent call, and what came back (frontmatter `disallowedTools: Agent, Workflow`)
// tierminator's own hooks load too but stay silent: no /tierminator:plan, so the session is never active.
//
//   node probes/tierminator-agent-frontmatter/runner.js [tier ...]   run those tiers (default all)
//
// Evidence: probes/evidence/tierminator-agent-frontmatter-results.json.
'use strict'
const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const REPO = path.join(__dirname, '..', '..')
const PLUGIN = path.join(REPO, 'plugins', 'tierminator')
const EVIDENCE = path.join(REPO, 'probes', 'evidence', 'tierminator-agent-frontmatter-results.json')
const { TIERS } = require(path.join(PLUGIN, 'scripts', 'lib', 'tasks.js'))
const WANT_MODEL = { haiku: /haiku-5-5/, sonnet: /sonnet/, opus: /opus/ }

const HOOK = `
const fs = require('fs'); let raw = ''
process.stdin.on('data', c => (raw += c)); process.stdin.on('end', () => {
  try { const i = JSON.parse(raw); fs.appendFileSync(process.env.PROBE_LOG, JSON.stringify({ agent_type: i.agent_type ?? null, effort: i.effort ?? null }) + '\\n') } catch {}
})`

const prompt = tier =>
  `Call the Agent tool exactly once with subagent_type "tierminator:${tier}", description "probe", and this exact prompt: ` +
  '"This is a probe, not a task: do not edit files or commit. Try once to call the Agent tool with subagent_type ' +
  'general-purpose and the prompt say hi. Then reply with one line saying whether the Agent tool was available ' +
  'and what happened." Then reply with exactly what the subagent returned.'

function runTier(tier, dir) {
  const log = path.join(dir, `log-${tier}.jsonl`)
  const hookFile = path.join(dir, 'hook.js')
  fs.writeFileSync(hookFile, HOOK)
  const settings = path.join(dir, 'settings.json')
  fs.writeFileSync(settings, JSON.stringify({ hooks: { SubagentStop: [{ hooks: [{ type: 'command', command: `node "${hookFile.replace(/\\/g, '/')}"` }] }] } }))
  const res = spawnSync(
    'claude',
    ['-p', prompt(tier), '--model', 'haiku', '--permission-mode', 'bypassPermissions', '--setting-sources', 'project',
      '--settings', settings, '--plugin-dir', PLUGIN, '--no-session-persistence', '--output-format', 'stream-json',
      '--verbose', '--max-turns', '6'],
    { cwd: path.join(dir, 'work'), encoding: 'utf8', env: { ...process.env, PROBE_LOG: log }, timeout: 600000, maxBuffer: 64 * 1024 * 1024 }
  )
  const workerModels = new Set()
  const workerAgentCalls = []
  const workerToolResults = []
  let dispatched = false
  let finalText = null
  for (const l of String(res.stdout ?? '').split('\n')) {
    let o
    try { o = JSON.parse(l) } catch { continue }
    if (o.type === 'result') finalText = String(o.result ?? '').slice(0, 300)
    const content = Array.isArray(o.message?.content) ? o.message.content : []
    if (!o.parent_tool_use_id) {
      if (o.type === 'assistant' && content.some(b => b.type === 'tool_use' && b.name === 'Agent' && String(b.input?.subagent_type).startsWith('tierminator:'))) dispatched = true
      continue
    }
    if (o.type === 'assistant') {
      if (o.message?.model) workerModels.add(o.message.model)
      for (const b of content) if (b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task' || b.name === 'Workflow')) workerAgentCalls.push({ name: b.name, input: JSON.stringify(b.input).slice(0, 200) })
    }
    if (o.type === 'user') {
      for (const b of content) if (b.type === 'tool_result') workerToolResults.push({ isError: !!b.is_error, text: (typeof b.content === 'string' ? b.content : JSON.stringify(b.content)).slice(0, 300) })
    }
  }
  const stops = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
  const stop = stops.find(s => s.agent_type === `tierminator:${tier}`) ?? null
  const [model, effort] = tier.split('-')
  const effortSeen = stop?.effort?.level ?? stop?.effort ?? null
  const checks = {
    dispatched,
    model: [...workerModels].length > 0 && [...workerModels].every(m => WANT_MODEL[model].test(m)),
    effort: effortSeen === effort,
    noAgentCall: workerAgentCalls.length === 0,
  }
  return {
    tier, exit: res.status, workerModels: [...workerModels], effortSeen, stop, workerAgentCalls, workerToolResults,
    finalText, checks, pass: Object.values(checks).every(Boolean),
  }
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : TIERS
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-agent-frontmatter-'))
const cells = []
try {
  fs.mkdirSync(path.join(dir, 'work'))
  for (const tier of wanted) {
    const r = runTier(tier, dir)
    cells.push(r)
    console.log(`${tier} pass=${r.pass} ${JSON.stringify(r.checks)} models=${r.workerModels.join(',')} effort=${JSON.stringify(r.effortSeen)} agentCalls=${r.workerAgentCalls.length}`)
  }
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
}
const claudeVersion = String(spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout ?? '').trim()
fs.writeFileSync(EVIDENCE, JSON.stringify({ probe: 'tierminator-agent-frontmatter', date: new Date().toISOString(), claudeVersion, cells }, null, 2) + '\n')
