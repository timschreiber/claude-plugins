// Probe P4 of docs/tierminator/tierminator-parallel-findings.md: three background workers finish close together.
// Which prompts and hook events reach the main session (UserPromptSubmit, Stop, SubagentStart, SubagentStop,
// PostToolUse on the Agent call), and does one prompt name several workers, or does each report arrive alone?
//
//   node probes/tierminator-parallel/p4-runner.js [--runs N] [cell ...]   headless; no cell = all
//   node probes/tierminator-parallel/p4-runner.js --list
//   node probes/tierminator-parallel/p4-runner.js --prepare <cell>        interactive, by hand
//   node probes/tierminator-parallel/p4-runner.js --collect <cell>
//
// Each cell builds a throwaway repo and runs the main session (claude -p --model sonnet) with the probe plugin. The
// main session makes three background Agent calls in one message to the cmd-worker probe agent. Each worker runs
// barrier.js as its one command: it waits until all three workers are ready, then a per-worker stagger, then ends.
// Cells:
//   p4-close    stagger 0, 0, 0 ms: the workers end together.
//   p4-stagger  stagger 0, 1000, 2000 ms.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const evidenceDir = process.env.PROBE_EVIDENCE_DIR || path.join(__dirname, '..', 'evidence')
const AGENT = 'tierminator-parallel-probe:cmd-worker'

const CELLS = {
  'p4-close': { stagger: [0, 0, 0] },
  'p4-stagger': { stagger: [0, 1000, 2000] },
}

const fwd = p => path.resolve(p).replace(/\\/g, '/')

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${(r.stderr ?? '') + (r.error ? r.error.message : '')}`)
  return (r.stdout ?? '').trim()
}

function setupCell(name) {
  const cell = CELLS[name]
  const base = path.join(os.tmpdir(), 'tierminator-parallel-' + name)
  fs.rmSync(base, { recursive: true, force: true })
  fs.mkdirSync(base, { recursive: true })

  const repo = path.join(base, 'repo')
  fs.mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'work')
  git(repo, 'config', 'user.name', 'Probe')
  git(repo, 'config', 'user.email', 'probe@example.invalid')
  git(repo, 'config', 'core.autocrlf', 'false')
  fs.writeFileSync(path.join(repo, 'CLAUDE.md'), '# Fixture\n\nA probe repository.\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'fixture')

  const log = path.join(base, 'probe.log')
  const barrier = path.join(base, 'barrier')
  const pluginDir = path.join(__dirname, 'probe-plugin')
  const barrierJs = path.join(pluginDir, 'scripts', 'barrier.js')
  const workers = cell.stagger.map((stagger, i) => {
    const id = 'W' + (i + 1)
    return {
      id,
      stagger,
      command: 'node "' + fwd(barrierJs) + '" "' + fwd(barrier) + '" ' + id + ' 3 ' + stagger + ' "' + fwd(log) + '"',
    }
  })
  const ctx = { cell: name, base, repo, log, barrier, pluginDir, workers }
  fs.writeFileSync(path.join(base, 'ctx.json'), JSON.stringify(ctx, null, 2))
  return ctx
}

function mainPrompt(ctx, interactive) {
  const parts = [
    'Call the Agent tool three times in one message, once for each block below. Use subagent_type "' + AGENT + '", ' + (interactive ? '' : 'run_in_background true, ') + 'the description given for the block, and pass the text between the two lines of three dashes exactly as written, with nothing added or removed. Do not do any of the work yourself. The reports arrive later, in the background. Each time one or more reports reach you, reply with one line per report in that message, GOT <its WORKER value>, and end your turn. Once you have all three, add a last line ALL DONE.',
  ]
  for (const w of ctx.workers) parts.push('', 'Block ' + w.id + ' (description "worker ' + w.id + '"):', '---', 'Worker: ' + w.id, 'Command: ' + w.command, '---')
  return parts.join('\n')
}

function probeEnv(ctx) {
  const env = {}
  const drop = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_PLUGIN_ROOT', 'CLAUDE_PLUGIN_DATA']
  for (const [k, v] of Object.entries(process.env)) {
    if (drop.includes(k) || k.startsWith('TIERMINATOR_') || k.startsWith('DECIDINATOR_')) continue
    env[k] = v
  }
  env.PROBE_LOG = ctx.log
  env.PROBE_MODE = 'observe'
  env.PROBE_GUARD = '0'
  env.PROBE_MK_WT = '0'
  return env
}

const parse = s => {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}
const lines = s => s.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean)

function eventText(e) {
  if (e.type === 'result') return typeof e.result === 'string' ? e.result : ''
  const c = e.message ? e.message.content : e.content
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return ''
  return c
    .map(x => {
      if (!x || typeof x !== 'object') return ''
      if (x.type === 'text') return x.text ?? ''
      if (x.type === 'tool_use') return 'tool_use ' + x.name
      if (x.type === 'tool_result') return typeof x.content === 'string' ? x.content : Array.isArray(x.content) ? x.content.map(y => (y && y.text) || '').join('') : ''
      return ''
    })
    .join(' ')
}

function analyze(entries, events) {
  const tagged = tag => entries.filter(e => e.tag === tag)

  const prompts = tagged('ups').map(e => {
    const p = String(parse(e.stdin).prompt ?? '')
    const kind = p.includes('<task-notification') ? 'task-notification' : p.includes('<agent-message') ? 'agent-message' : 'user'
    const workers = [...p.matchAll(/\bW[1-3]\b/g)].map(m => m[0]).filter((w, i, a) => a.indexOf(w) === i)
    return { at: e.at, kind, workers, head: p.slice(0, 300) }
  })
  const stops = tagged('stop').map(e => ({ at: e.at, stopHookActive: parse(e.stdin).stop_hook_active ?? null }))
  const subagentStarts = tagged('sub-start').map(e => ({ at: e.at, agentId: parse(e.stdin).agent_id ?? null }))
  const subagentStops = tagged('sub-stop').map(e => {
    const s = parse(e.stdin)
    const msg = s.last_assistant_message
    const m = typeof msg === 'string' ? /WORKER:\s*(\S+)/.exec(msg) : null
    return { at: e.at, agentId: s.agent_id ?? null, worker: m ? m[1] : null, hasLastMessage: typeof msg === 'string' && msg.length > 0 }
  })
  const postAgent = tagged('post-agent').map(e => {
    const tr = parse(e.stdin).tool_response ?? {}
    return { at: e.at, status: tr.status ?? null, isAsync: tr.isAsync ?? null }
  })
  const barrier = tagged('barrier').map(e => ({ id: e.id, readyAt: e.readyAt, releasedAt: e.releasedAt, endedAt: e.endedAt, timedOut: e.timedOut }))

  const timeline = [
    ...prompts.map(p => ({ at: p.at, event: 'prompt:' + p.kind })),
    ...stops.map(s => ({ at: s.at, event: 'stop' })),
    ...subagentStarts.map(s => ({ at: s.at, event: 'subagent-start' })),
    ...subagentStops.map(s => ({ at: s.at, event: 'subagent-stop:' + s.worker })),
    ...postAgent.map(p => ({ at: p.at, event: 'post-agent:' + p.status })),
    ...barrier.map(b => ({ at: b.endedAt, event: 'barrier-end:' + b.id })),
  ].sort((x, y) => Date.parse(x.at) - Date.parse(y.at))

  const stream = events
    .filter(e => ['user', 'assistant', 'result', 'system'].includes(e.type))
    .map(e => ({ type: e.type, subtype: e.subtype ?? null, text: eventText(e).slice(0, 300) }))

  const byKind = {}
  for (const p of prompts) byKind[p.kind] = (byKind[p.kind] ?? 0) + 1
  const spread = list => {
    const ms = list.map(Date.parse).filter(Number.isFinite)
    return ms.length ? Math.max(...ms) - Math.min(...ms) : null
  }
  const gotLines = []
  for (const e of events) {
    if (e.type !== 'assistant') continue
    for (const l of lines(eventText(e))) if (l.startsWith('GOT')) gotLines.push(l)
  }
  const summary = {
    prompts: prompts.length,
    byKind,
    promptsNamingSeveralWorkers: prompts.filter(p => p.workers.length > 1).length,
    barrierSpreadMs: spread(barrier.map(b => b.endedAt)),
    subagentStopSpreadMs: spread(subagentStops.map(s => s.at)),
    stops: stops.length,
    resultEvents: events.filter(e => e.type === 'result').length,
    gotLines,
  }
  return { summary, prompts, stops, subagentStarts, subagentStops, postAgent, barrier, timeline, stream }
}

let runSuffix = ''

function run(name) {
  const ctx = setupCell(name)
  const prompt = mainPrompt(ctx, false)
  const t0 = Date.now()
  const r = spawnSync(
    'claude',
    ['-p', prompt, '--plugin-dir', ctx.pluginDir, '--model', 'sonnet', '--permission-mode', 'bypassPermissions', '--output-format', 'stream-json', '--verbose'],
    { cwd: ctx.repo, env: probeEnv(ctx), encoding: 'utf8', timeout: 900000, maxBuffer: 128 * 1024 * 1024 }
  )
  writeEvidence(ctx, 'headless', prompt, r, t0)
}

function writeEvidence(ctx, mode, prompt, r, t0) {
  const name = ctx.cell
  const events = r ? (r.stdout ?? '').split('\n').filter(Boolean).map(parse).filter(e => e && e.type) : []
  const final = events.filter(e => e.type === 'result').pop()
  const entries = fs.existsSync(ctx.log) ? fs.readFileSync(ctx.log, 'utf8').split('\n').filter(Boolean).map(parse) : []
  const a = analyze(entries, events)
  const version = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null
  fs.mkdirSync(evidenceDir, { recursive: true })
  const file = path.join(evidenceDir, `tierminator-parallel-${name}${mode === 'interactive' ? '-interactive' : ''}${runSuffix}.json`)
  const doc = {
    generated: new Date().toISOString(),
    claudeCodeVersion: version,
    cell: name,
    setup: { stagger: CELLS[name].stagger, workers: ctx.workers },
    mode,
    prompt,
    exitCode: r ? r.status : null,
    elapsedSeconds: t0 ? (Date.now() - t0) / 1000 : null,
    costUsd: final ? final.total_cost_usd ?? null : null,
    result: final ? final.result ?? null : null,
    stderr: r ? ((r.stderr ?? '') + (r.error ? '\n[spawn error] ' + r.error.message : '')).slice(0, 4000) : '',
    analysis: a,
    hookLog: entries.map(e => (e.stdin && e.stdin.length > 4000 ? { ...e, stdin: e.stdin.slice(0, 4000) + '…' } : e)),
  }
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
  console.log(`${name}: exit ${doc.exitCode}; prompts ${a.summary.prompts}; byKind ${JSON.stringify(a.summary.byKind)}; wrote ${file}`)
}

function prepare(name) {
  const ctx = setupCell(name)
  const env = probeEnv(ctx)
  console.log('--- 1. In a NEW PowerShell window, run these lines one at a time ---')
  console.log('cd "' + ctx.repo + '"')
  for (const k of Object.keys(env).filter(k => k.startsWith('PROBE_'))) console.log('$env:' + k + "='" + env[k] + "'")
  console.log('claude --permission-mode bypassPermissions --plugin-dir "' + ctx.pluginDir + '"')
  console.log('')
  console.log('--- 2. When Claude has started, paste everything between the two lines of equals signs ---')
  console.log('==========')
  console.log(mainPrompt(ctx, true))
  console.log('==========')
  console.log('')
  console.log('--- 3. Write down each line the session prints and whether anything arrives without you typing. ---')
  console.log('--- 4. Wait until the session has printed ALL DONE, or two minutes. Then type /exit ---')
  console.log('--- 5. Back here: node ' + __filename + ' --collect ' + name + ' ---')
}

function main(argv) {
  if (argv[0] === '--prepare' || argv[0] === '--collect') {
    const name = argv[1]
    if (argv.length !== 2 || !CELLS[name]) {
      process.stderr.write('usage: node p4-runner.js --prepare|--collect <cell>\n')
      process.exit(2)
    }
    if (argv[0] === '--prepare') return prepare(name)
    const file = path.join(os.tmpdir(), 'tierminator-parallel-' + name, 'ctx.json')
    if (!fs.existsSync(file)) {
      process.stderr.write('no ctx.json at ' + file + '; run --prepare ' + name + ' first\n')
      process.exit(2)
    }
    const ctx = JSON.parse(fs.readFileSync(file, 'utf8'))
    return writeEvidence(ctx, 'interactive', mainPrompt(ctx, true), null, null)
  }
  let runs = 1
  const ri = argv.indexOf('--runs')
  if (ri !== -1) {
    runs = Number(argv[ri + 1])
    if (!Number.isInteger(runs) || runs < 1) process.exit(2)
    argv = [...argv.slice(0, ri), ...argv.slice(ri + 2)]
  }
  if (argv[0] === '--list') return console.log(Object.keys(CELLS).join('\n'))
  const names = argv.length ? argv : Object.keys(CELLS)
  for (const n of names) if (!CELLS[n]) {
    process.stderr.write('unknown cell ' + n + '\n')
    process.exit(2)
  }
  for (const n of names) {
    for (let k = 1; k <= runs; k++) {
      runSuffix = runs > 1 ? `-r${k}` : ''
      run(n)
    }
  }
}

if (require.main === module) main(process.argv.slice(2))
