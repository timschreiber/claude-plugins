// Tier sweep: runs fixed tasks on each tierminator tier agent, headless, and records per run the turns
// (assistant messages), tool calls, cost, duration, whether Verify passed and whether the worker hit its
// turn limit. The data is for tuning the tiers' maxTurns and the sonnet-high vs opus-medium rung.
//
//   node probes/planandtier/tier-sweep.js [--tiers a,b] [--tasks a,b] [--reps N] [--dry-run]
//
//   --tiers    tiers to run, from lib/tasks.js TIERS (default: all five)
//   --tasks    task ids from tier-sweep-fixtures/tasks.json (default: all five)
//   --reps     repetitions of each task x tier (default 2)
//   --dry-run  list the planned runs and exit, spending nothing
//
// Each run builds a throwaway git repo from tier-sweep-fixtures/base plus the task's overlay
// (tier-sweep-fixtures/overlays/<task>), writes a one-task tasks file next to it, and runs one `claude -p`
// session (sonnet, low effort) with plugins/tierminator loaded that dispatches the tier agent in the
// foreground with the prompt tierminator gives it (Tasks file, Plan, Task lines). tierminator's hooks
// stay silent: nothing arms them. The worker is not resumed when it hits its limit. Then the harness runs
// the task's Verify in the repo itself.
//
// Writes probes/evidence/planandtier-tier-sweep-<timestamp>.jsonl: one {type: "run"} line per run,
// written as it finishes, then one {type: "summary"} line with per-tier totals, also printed.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..', '..')
const PLUGIN = path.join(ROOT, 'plugins', 'tierminator')
const { TIERS, MAX_TURNS } = require(path.join(PLUGIN, 'scripts', 'lib', 'tasks.js'))
const usage = require(path.join(PLUGIN, 'scripts', 'lib', 'usage.js'))
const FIXTURES = path.join(__dirname, 'tier-sweep-fixtures')
const EVIDENCE = path.join(ROOT, 'probes', 'evidence')
const WORK = path.join(os.tmpdir(), 'tierminator-tier-sweep')
const RUN_TIMEOUT_MS = 30 * 60 * 1000
const PLAN_ID = 'tier-sweep'

// --- arguments --------------------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { tiers: TIERS, tasks: null, reps: 2, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(`${a} needs a value`)
      return v
    }
    if (a === '--dry-run') opts.dryRun = true
    else if (a === '--tiers') opts.tiers = value().split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '--tasks') opts.tasks = value().split(',').map(s => s.trim()).filter(Boolean)
    else if (a === '--reps') opts.reps = Number(value())
    else throw new Error(`unknown argument: ${a}`)
  }
  const badTier = opts.tiers.find(t => !TIERS.includes(t))
  if (badTier) throw new Error(`unknown tier ${badTier}; tiers are ${TIERS.join(', ')}`)
  if (!Number.isInteger(opts.reps) || opts.reps < 1) throw new Error('--reps must be a whole number of 1 or more')
  return opts
}

// --- fixture repo -----------------------------------------------------------------------------------

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' })

// A fresh repo for one run: base plus the task's overlay, committed. Returns its path.
function makeRepo(dir, task) {
  fs.rmSync(dir, { recursive: true, force: true })
  const repo = path.join(dir, 'repo')
  fs.mkdirSync(repo, { recursive: true })
  fs.cpSync(path.join(FIXTURES, 'base'), repo, { recursive: true })
  const overlay = path.join(FIXTURES, 'overlays', task.id)
  if (fs.existsSync(overlay)) fs.cpSync(overlay, repo, { recursive: true })
  git(repo, ['init', '-q'])
  git(repo, ['config', 'user.name', 'Tier Sweep'])
  git(repo, ['config', 'user.email', 'tier-sweep@example.invalid'])
  git(repo, ['config', 'core.autocrlf', 'false'])
  git(repo, ['add', '-A'])
  git(repo, ['commit', '-q', '-m', 'fixture'])
  return repo
}

// The task's Verify, run by the harness: every command passes, every absent pattern has no git grep match,
// every unchanged file equals its fixture copy.
function verify(repo, task) {
  const failures = []
  const v = task.verify ?? {}
  for (const cmd of v.run ?? []) {
    const exe = cmd[0] === 'node' ? process.execPath : cmd[0]
    const r = spawnSync(exe, cmd.slice(1), { cwd: repo, encoding: 'utf8', timeout: 120000 })
    if (r.status !== 0) failures.push(`${cmd.join(' ')} exited ${r.status}`)
  }
  for (const { pattern, paths } of v.absent ?? []) {
    const r = git(repo, ['grep', '-n', pattern, '--', ...(paths ?? [])])
    if (r.status !== 1) failures.push(`git grep ${pattern} found matches`)
  }
  for (const file of v.unchanged ?? []) {
    const overlay = path.join(FIXTURES, 'overlays', task.id, file)
    const src = fs.existsSync(overlay) ? overlay : path.join(FIXTURES, 'base', file)
    const now = path.join(repo, file)
    if (!fs.existsSync(now) || !fs.readFileSync(now).equals(fs.readFileSync(src))) failures.push(`${file} changed`)
  }
  return { passed: failures.length === 0, failures }
}

// --- one run ----------------------------------------------------------------------------------------

function mainPrompt(tier, task, dispatch) {
  return [
    `Call the Agent tool once, with subagent_type "tierminator:${tier}", description ${JSON.stringify(`T01: ${task.title}`)},`,
    `run_in_background false, and as its prompt exactly the ${dispatch.split('\n').length} lines inside this fence, without the fence lines:`,
    '```',
    dispatch,
    '```',
    'Do not do the task yourself, and do not call SendMessage. When the agent returns, reply with its result',
    'verbatim and nothing else.',
  ].join('\n')
}

const streamOf = stdout =>
  stdout
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

// The session's subagents directory: <config>/projects/<slug>/<session>/subagents.
function findSubagentsDir(sessionId) {
  if (!sessionId) return null
  const config = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  const projects = path.join(config, 'projects')
  let slugs = []
  try {
    slugs = fs.readdirSync(projects)
  } catch {}
  for (const slug of slugs) {
    const dir = path.join(projects, slug, sessionId, 'subagents')
    if (fs.existsSync(dir)) return dir
  }
  return null
}

// Turns (distinct assistant message ids) and tool calls (distinct tool_use ids) in the subagent transcripts.
function countTurns(dir) {
  const ids = new Set()
  const tools = new Set()
  let files = []
  try {
    files = fs.readdirSync(dir).filter(n => n.endsWith('.jsonl'))
  } catch {}
  for (const name of files) {
    for (const line of fs.readFileSync(path.join(dir, name), 'utf8').split('\n')) {
      if (!line.trim()) continue
      let rec
      try {
        rec = JSON.parse(line)
      } catch {
        continue
      }
      if (rec.type !== 'assistant' || !rec.message) continue
      ids.add(rec.message.id ?? rec.uuid)
      for (const b of rec.message.content ?? []) if (b.type === 'tool_use') tools.add(b.id)
    }
  }
  return { turns: ids.size, toolCalls: tools.size, files: files.length }
}

// The same counts from the stream's subagent events, when the transcript cannot be found.
function countFromStream(events) {
  const ids = new Set()
  const tools = new Set()
  for (const e of events) {
    if (e.type !== 'assistant' || !e.parent_tool_use_id) continue
    ids.add(e.message?.id)
    for (const b of e.message?.content ?? []) if (b.type === 'tool_use') tools.add(b.id)
  }
  return { turns: ids.size, toolCalls: tools.size }
}

// The text of the main thread's Agent tool result, plus the worker's hand-back report, which the result
// leaves out when the worker ended with SubagentHandback (tool_use_result.handbackReport).
function agentResultText(events) {
  const agentIds = new Set()
  for (const e of events) {
    if (e.type !== 'assistant' || e.parent_tool_use_id) continue
    for (const b of e.message?.content ?? []) if (b.type === 'tool_use' && /^(Agent|Task)$/.test(b.name)) agentIds.add(b.id)
  }
  const texts = []
  for (const e of events) {
    if (e.type !== 'user' || e.parent_tool_use_id) continue
    let isAgent = false
    for (const b of e.message?.content ?? []) {
      if (b.type !== 'tool_result' || !agentIds.has(b.tool_use_id)) continue
      isAgent = true
      if (typeof b.content === 'string') texts.push(b.content)
      else for (const c of b.content ?? []) if (c?.type === 'text') texts.push(c.text)
    }
    const handback = e.tool_use_result?.handbackReport?.text
    if (isAgent && typeof handback === 'string') texts.push(handback)
  }
  return texts.join('\n')
}

function runOne(plan, n) {
  const { task, tier, rep } = plan
  const dir = path.join(WORK, `run-${n}`)
  const repo = makeRepo(dir, task)
  const tasksFile = path.join(dir, 'sweep.tasks.json').replace(/\\/g, '/')
  const [model, effort] = tier.split('-')
  fs.writeFileSync(tasksFile, JSON.stringify({ tasks: [{ id: 'T01', title: task.title, model, effort, prompt: task.prompt }] }, null, 2) + '\n')
  const dispatch = [`Tasks file: ${tasksFile}`, `Plan: ${PLAN_ID}`, 'Task: T01'].join('\n')

  const started = Date.now()
  const r = spawnSync(
    'claude',
    [
      '-p', mainPrompt(tier, task, dispatch),
      '--model', 'sonnet', '--effort', 'low',
      '--plugin-dir', PLUGIN,
      '--add-dir', dir,
      '--output-format', 'stream-json', '--verbose',
      '--allowedTools', 'Agent', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'PowerShell',
    ],
    { cwd: repo, encoding: 'utf8', timeout: RUN_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024 }
  )
  const durationMs = Date.now() - started
  const events = streamOf(r.stdout ?? '')
  const init = events.find(e => e.type === 'system' && e.subtype === 'init') ?? {}
  const final = events.filter(e => e.type === 'result').pop() ?? {}
  const sessionId = init.session_id ?? final.session_id ?? null

  const subDir = findSubagentsDir(sessionId)
  const counted = subDir ? countTurns(subDir) : null
  const counts = counted && counted.turns > 0 ? { ...counted, source: 'transcript' } : { ...countFromStream(events), source: 'stream' }
  const worker = subDir ? usage.subagentUsage(subDir) : null
  const resultText = agentResultText(events)
  const limit = /stopped at its (\d+)-turn limit/.exec(resultText)
  const statusRe = /^STATUS:\s*(DONE|FAILED)/m
  const status = statusRe.exec(resultText)?.[1] ?? statusRe.exec(final.result ?? '')?.[1] ?? null
  const commits = Number(git(repo, ['rev-list', '--count', 'HEAD']).stdout.trim()) - 1
  const v = verify(repo, task)

  return {
    type: 'run',
    at: new Date(started).toISOString(),
    task: task.id,
    tier,
    rep,
    maxTurns: MAX_TURNS[tier] ?? null,
    turns: counts.turns,
    toolCalls: counts.toolCalls,
    countSource: counts.source,
    costUsd: worker ? round(worker.costUsd) : null,
    unpriced: worker?.unpriced ?? [],
    workerModels: worker ? Object.keys(worker.byModel) : [],
    sessionCostUsd: final.total_cost_usd ?? null,
    durationMs,
    verifyPassed: v.passed,
    verifyFailures: v.failures,
    hitTurnLimit: Boolean(limit) || (MAX_TURNS[tier] != null && counts.turns >= MAX_TURNS[tier]),
    reportedStatus: status,
    workerCommits: commits,
    exitCode: r.status,
    error: r.error ? r.error.message : null,
    stderr: (r.stderr ?? '').slice(0, 2000),
    sessionId,
    repo,
  }
}

// --- summary ----------------------------------------------------------------------------------------

const round = x => Math.round(x * 1e4) / 1e4
const pct = (xs, p) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)]
}
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

function summarize(records, tiers) {
  const byTier = {}
  for (const tier of tiers) {
    const rs = records.filter(r => r.tier === tier)
    if (!rs.length) continue
    const turns = rs.map(r => r.turns)
    const tools = rs.map(r => r.toolCalls)
    const costs = rs.map(r => r.costUsd).filter(c => c != null)
    byTier[tier] = {
      runs: rs.length,
      passed: rs.filter(r => r.verifyPassed).length,
      passRate: round(rs.filter(r => r.verifyPassed).length / rs.length),
      maxTurns: MAX_TURNS[tier] ?? null,
      turnsP50: pct(turns, 50),
      turnsP90: pct(turns, 90),
      turnsMax: Math.max(...turns),
      toolCallsMean: round(mean(tools)),
      toolCallsPerTurn: round(tools.reduce((a, b) => a + b, 0) / Math.max(1, turns.reduce((a, b) => a + b, 0))),
      costUsdTotal: round(costs.reduce((a, b) => a + b, 0)),
      costUsdMean: costs.length ? round(mean(costs)) : null,
      durationSMean: round(mean(rs.map(r => r.durationMs)) / 1000),
      hitTurnLimit: rs.filter(r => r.hitTurnLimit).length,
    }
  }
  const sessionCost = records.map(r => r.sessionCostUsd).filter(c => c != null)
  return { type: 'summary', at: new Date().toISOString(), runs: records.length, sessionCostUsdTotal: round(sessionCost.reduce((a, b) => a + b, 0)), byTier }
}

function printSummary(s) {
  const head = ['tier', 'runs', 'pass', 'maxTurns', 'turns p50', 'p90', 'max', 'tools/turn', 'cost mean $', 'cost total $', 'dur mean s', 'hit limit']
  const rows = Object.entries(s.byTier).map(([tier, t]) => [
    tier, t.runs, `${t.passed}/${t.runs}`, t.maxTurns, t.turnsP50, t.turnsP90, t.turnsMax, t.toolCallsPerTurn, t.costUsdMean, t.costUsdTotal, t.durationSMean, t.hitTurnLimit,
  ].map(String))
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)))
  const line = cells => cells.map((c, i) => c.padEnd(widths[i])).join('  ')
  console.log(line(head))
  for (const r of rows) console.log(line(r))
  console.log(`${s.runs} runs; whole-session cost (worker plus orchestrator) $${s.sessionCostUsdTotal}`)
}

// --- main -------------------------------------------------------------------------------------------

function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  const allTasks = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'tasks.json'), 'utf8')).tasks
  const ids = opts.tasks ?? allTasks.map(t => t.id)
  const badTask = ids.find(id => !allTasks.some(t => t.id === id))
  if (badTask) {
    console.error(`unknown task ${badTask}; tasks are ${allTasks.map(t => t.id).join(', ')}`)
    process.exit(2)
  }
  const tasks = ids.map(id => allTasks.find(t => t.id === id))

  const plan = []
  for (let rep = 1; rep <= opts.reps; rep++)
    for (const task of tasks) for (const tier of opts.tiers) plan.push({ task, tier, rep })

  if (opts.dryRun) {
    plan.forEach((p, i) => console.log(`${String(i + 1).padStart(3)}  ${p.task.id.padEnd(10)}  ${p.tier.padEnd(13)}  rep ${p.rep}`))
    console.log(`${plan.length} planned runs`)
    return
  }

  fs.mkdirSync(EVIDENCE, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const out = path.join(EVIDENCE, `planandtier-tier-sweep-${stamp}.jsonl`)
  const version = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null
  fs.writeFileSync(out, JSON.stringify({ type: 'header', at: new Date().toISOString(), claudeCodeVersion: version, tiers: opts.tiers, tasks: ids, reps: opts.reps }) + '\n')

  const records = []
  plan.forEach((p, i) => {
    console.log(`[${i + 1}/${plan.length}] ${p.task.id} on ${p.tier} (rep ${p.rep})`)
    const rec = runOne(p, i + 1)
    records.push(rec)
    fs.appendFileSync(out, JSON.stringify(rec) + '\n')
    console.log(
      `  turns ${rec.turns}, tools ${rec.toolCalls}, $${rec.costUsd}, ${Math.round(rec.durationMs / 1000)}s, ` +
        `verify ${rec.verifyPassed ? 'pass' : 'FAIL'}${rec.hitTurnLimit ? ', hit turn limit' : ''}`
    )
  })
  const summary = summarize(records, opts.tiers)
  fs.appendFileSync(out, JSON.stringify(summary) + '\n')
  printSummary(summary)
  console.log(`wrote ${out}`)
}

main()
