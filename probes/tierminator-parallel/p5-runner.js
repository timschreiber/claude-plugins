// Probe P5 of docs/tierminator/tierminator-parallel-findings.md: how long does Claude Code let a hook run on
// UserPromptSubmit and SubagentStop? Does a hook with a long timeout run to its end, does the session wait for
// it, does its output reach the model, and which timeout values does the hook schema accept?
//
//   node probes/tierminator-parallel/p5-runner.js [cell ...]            foreground; no cell = all, in CELLS order
//   node probes/tierminator-parallel/p5-runner.js --list
//   node probes/tierminator-parallel/p5-runner.js --detach [cell ...]   run in the background, survive this shell
//   node probes/tierminator-parallel/p5-runner.js --wait <seconds>      wait for a detached run to write its evidence
//
// Each cell builds a throwaway repo and a copy of the variant-slow-hook plugin whose hooks.json registers, for
// one event, a "slow" hook (a given timeout and sleep) beside a "fast" hook (same timeout, no sleep), then runs
// claude -p --model sonnet with the probe plugin and that copy. The slow hook logs slow:start, a slow:beat every
// 5 s and slow:end; a hook killed at its timeout stops logging, one that outlives the kill keeps beating.
// Cells:
//   p5-ups-t<T>-s<S>   UserPromptSubmit, timeout T s, sleep S s.
//   p5-sas-t<T>-s<S>   SubagentStop, timeout T s, sleep S s, a foreground worker.
//   p5-sas-bg-...      the same with a background worker.
//   p5-accept          five UserPromptSubmit hooks, timeouts 600 to 2147484 s, sleeping 3 s: which does the
//                      schema accept (claude plugin validate) and which does the session run.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

const evidenceDir = process.env.PROBE_EVIDENCE_DIR || path.join(__dirname, '..', 'evidence')
const AGENT = 'tierminator-parallel-probe:cmd-worker'
const DETACH_LOG = path.join(os.tmpdir(), 'tierminator-parallel-p5-detach.log')
const DETACH_STATE = path.join(os.tmpdir(), 'tierminator-parallel-p5-detach.json')

const slow = (event, timeout, sleep, extra = {}) => ({ event, hooks: [{ name: 'slow', timeout, sleep }, { name: 'fast', timeout, sleep: 0 }], ...extra })

const CELLS = {
  'p5-ups-t15-s20': slow('UserPromptSubmit', 15, 20),
  'p5-ups-t600-s20': slow('UserPromptSubmit', 600, 20),
  'p5-ups-t600-s120': slow('UserPromptSubmit', 600, 120),
  'p5-ups-t600-s400': slow('UserPromptSubmit', 600, 400),
  'p5-ups-t3600-s700': slow('UserPromptSubmit', 3600, 700),
  'p5-sas-t15-s20': slow('SubagentStop', 15, 20),
  'p5-sas-t600-s20': slow('SubagentStop', 600, 20),
  'p5-sas-t600-s120': slow('SubagentStop', 600, 120),
  'p5-sas-t600-s400': slow('SubagentStop', 600, 400),
  'p5-sas-bg-t600-s120': slow('SubagentStop', 600, 120, { background: true }),
  'p5-accept': { event: 'UserPromptSubmit', hooks: [600, 3600, 86400, 2147483, 2147484].map(t => ({ name: 't' + t, timeout: t, sleep: 3 })) },
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

  const slowPlugin = path.join(base, 'slow-plugin')
  fs.cpSync(path.join(__dirname, 'variant-slow-hook'), slowPlugin, { recursive: true })
  const hooksJson = {
    hooks: {
      [cell.event]: [
        {
          hooks: cell.hooks.map(h => ({
            type: 'command',
            command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/slow-hook.js" ' + h.name + ' ' + h.sleep + ' ' + cell.event,
            timeout: h.timeout,
          })),
        },
      ],
    },
  }
  fs.mkdirSync(path.join(slowPlugin, 'hooks'), { recursive: true })
  fs.writeFileSync(path.join(slowPlugin, 'hooks', 'hooks.json'), JSON.stringify(hooksJson, null, 2) + '\n')

  const plugins = [path.join(__dirname, 'probe-plugin'), slowPlugin]
  const log = path.join(base, 'probe.log')
  return { cell: name, base, repo, log, slowPlugin, plugins, hooksJson }
}

function validate(ctx) {
  const r = spawnSync('claude', ['plugin', 'validate', ctx.slowPlugin], { encoding: 'utf8' })
  return { status: r.status, output: ((r.stdout ?? '') + (r.stderr ?? '')).slice(0, 2000) }
}

function mainPrompt(name) {
  const cell = CELLS[name]
  if (cell.event === 'UserPromptSubmit') {
    return 'Run the Bash command `echo p5` once. Then reply with two lines: its output, then every line in your context that starts with P5-MARKER, separated by spaces, or NONE.'
  }
  const bg = !!cell.background
  return (
    'Call the Agent tool once, with subagent_type "' + AGENT + '", run_in_background ' + (bg ? 'true' : 'false') +
    ', description "p5 worker", and pass the text between the two lines of three dashes exactly as written, with nothing added or removed. Do not do the work yourself. ' +
    (bg ? 'Its report arrives later, in the background. When it arrives, ' : 'When it has finished, ') +
    'run the Bash command `echo after-agent` once, then reply with the agent\'s report verbatim.' +
    '\n---\nWorker: W1\nCommand: echo p5-worker\n---'
  )
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
const readLog = ctx => (fs.existsSync(ctx.log) ? fs.readFileSync(ctx.log, 'utf8').split('\n').filter(Boolean).map(parse) : [])

function analyze(name, entries, finalResult, stdout, stderr) {
  const cell = CELLS[name]
  const tagged = tag => entries.filter(e => e.tag === tag)
  const sec = (from, to) => (Number.isFinite(Date.parse(from)) && Number.isFinite(Date.parse(to)) ? (Date.parse(to) - Date.parse(from)) / 1000 : null)

  const hooks = cell.hooks.map(h => {
    const mine = entries.filter(e => typeof e.tag === 'string' && e.tag.startsWith('slow:') && e.name === h.name)
    const start = mine.find(e => e.tag === 'slow:start')
    const own = start ? mine.filter(e => e.pid === start.pid) : []
    const beats = own.filter(e => e.tag === 'slow:beat')
    const end = own.find(e => e.tag === 'slow:end')
    const lastBeat = beats.length ? beats[beats.length - 1] : null
    const lastSeenAt = end ? end.at : lastBeat ? lastBeat.at : start ? start.at : null
    const ranS = start ? sec(start.at, lastSeenAt) : null
    return {
      name: h.name,
      timeout: h.timeout,
      sleep: h.sleep,
      started: !!start,
      pid: start ? start.pid : null,
      startAt: start ? start.at : null,
      endAt: end ? end.at : null,
      lastSeenAt,
      ranS,
      beats: beats.length,
      completed: !!end,
      ranPastTimeout: ranS !== null && ranS > h.timeout + 2,
    }
  })

  const toolEntries = tagged('pre-tool').map(e => {
    const s = parse(e.stdin)
    return { at: e.at, command: String((s.tool_input && s.tool_input.command) ?? ''), sub: s.agent_id !== undefined && s.agent_id !== null }
  })
  const mainTools = toolEntries.filter(t => !t.sub).map(({ at, command }) => ({ at, command }))
  const workerTools = toolEntries.filter(t => t.sub).map(({ at, command }) => ({ at, command }))
  const ups = tagged('ups').map(e => ({ at: e.at }))
  const subStart = tagged('sub-start').map(e => ({ at: e.at }))
  const subStop = tagged('sub-stop').map(e => ({ at: e.at }))
  const stop = tagged('stop').map(e => ({ at: e.at }))
  const postAgent = tagged('post-agent').map(e => ({ at: e.at, status: (parse(e.stdin).tool_response ?? {}).status ?? null }))

  const first = hooks[0]
  const t0 = first && first.startAt
  const afterEntry = mainTools.find(t => t.command.includes('after-agent'))
  const stopAfter = t0 ? stop.find(s => Date.parse(s.at) > Date.parse(t0)) : null
  const afterSlowStartS = {
    postAgent: t0 && postAgent.length ? sec(t0, postAgent[0].at) : null,
    mainTool: t0 && mainTools.length ? sec(t0, mainTools[0].at) : null,
    afterAgentTool: t0 && afterEntry ? sec(t0, afterEntry.at) : null,
    stop: t0 && stopAfter ? sec(t0, stopAfter.at) : null,
  }
  const fast = hooks.find(h => h.name === 'fast')
  const fastStartDelayMs = first && first.name === 'slow' && first.startAt && fast && fast.startAt ? Date.parse(fast.startAt) - Date.parse(first.startAt) : null

  const markers = [...new Set(String(finalResult ?? '').match(/P5-MARKER-[\w-]+/g) ?? [])]
  const prompts = tagged('ups').map(e => {
    const p = String(parse(e.stdin).prompt ?? '')
    const kind = p.includes('<task-notification') ? 'task-notification' : p.includes('<agent-message') ? 'agent-message' : 'user'
    return { at: e.at, kind, head: p.slice(0, 300) }
  })
  const timeoutMentions = lines((stdout ?? '') + '\n' + (stderr ?? ''))
    .filter(l => /time[d ]?out/i.test(l))
    .slice(0, 20)
    .map(l => l.slice(0, 300))

  return { hooks, mainTools, workerTools, ups, subStart, subStop, stop, postAgent, afterSlowStartS, fastStartDelayMs, markers, prompts, timeoutMentions }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// A hook may outlive the session; give each one that started a chance to log its end (at most 60 s in all).
function waitForLateHooks(name, ctx) {
  const deadline = Date.now() + 60000
  const targets = []
  for (const h of CELLS[name].hooks) {
    if (h.sleep <= h.timeout) continue
    const start = readLog(ctx).find(e => e.tag === 'slow:start' && e.name === h.name)
    if (start) targets.push(Date.parse(start.at) + h.sleep * 1000 + 10000)
  }
  if (!targets.length) return
  const until = Math.min(Math.max(...targets), deadline)
  const ms = until - Date.now()
  if (ms > 0) sleepMs(ms)
}

function run(name) {
  const cell = CELLS[name]
  const ctx = setupCell(name)
  const prompt = mainPrompt(name)
  const v = validate(ctx)
  const args = ['-p', prompt]
  for (const p of ctx.plugins) args.push('--plugin-dir', p)
  args.push('--model', 'sonnet', '--permission-mode', 'bypassPermissions', '--output-format', 'stream-json', '--verbose')
  const maxSleep = Math.max(...cell.hooks.map(h => h.sleep))
  const t0 = Date.now()
  const r = spawnSync('claude', args, { cwd: ctx.repo, env: probeEnv(ctx), encoding: 'utf8', timeout: (maxSleep + 300) * 1000, maxBuffer: 128 * 1024 * 1024 })
  waitForLateHooks(name, ctx)
  writeEvidence(name, ctx, v, prompt, r, t0)
}

function writeEvidence(name, ctx, v, prompt, r, t0) {
  const events = (r.stdout ?? '').split('\n').filter(Boolean).map(parse).filter(e => e && e.type)
  const final = events.filter(e => e.type === 'result').pop()
  const entries = readLog(ctx)
  const stderr = (r.stderr ?? '') + (r.error ? '\n[spawn error] ' + r.error.message : '')
  const a = analyze(name, entries, final ? final.result : null, r.stdout, r.stderr)
  const version = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null
  fs.mkdirSync(evidenceDir, { recursive: true })
  const file = path.join(evidenceDir, `tierminator-parallel-${name}.json`)
  const doc = {
    generated: new Date().toISOString(),
    claudeCodeVersion: version,
    cell: name,
    setup: CELLS[name],
    hooksJson: ctx.hooksJson,
    validate: v,
    mode: 'headless',
    prompt,
    exitCode: r.status,
    elapsedSeconds: (Date.now() - t0) / 1000,
    costUsd: final ? final.total_cost_usd ?? null : null,
    result: final ? final.result ?? null : null,
    stderr: stderr.slice(0, 4000),
    analysis: a,
    hookLog: entries.map(e => (e.stdin && e.stdin.length > 4000 ? { ...e, stdin: e.stdin.slice(0, 4000) + '…' } : e)),
  }
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
  const hs = a.hooks.map(h => `${h.name}:${h.completed ? 'ended' : h.started ? 'cut' : 'none'}@${h.ranS === null ? '-' : h.ranS}s`).join(' ')
  console.log(`${name}: exit ${doc.exitCode}; validate ${v.status}; ${hs}; markers ${a.markers.length ? a.markers.join(',') : 'none'}; wrote ${file}`)
}

function detach(cells) {
  const names = cells.length ? cells : Object.keys(CELLS)
  const fd = fs.openSync(DETACH_LOG, 'a')
  const child = spawn(process.execPath, [__filename, ...cells], { detached: true, stdio: ['ignore', fd, fd], windowsHide: true })
  child.unref()
  fs.writeFileSync(DETACH_STATE, JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString(), cells: names, log: DETACH_LOG }, null, 2) + '\n')
  console.log('pid ' + child.pid)
  console.log('log ' + DETACH_LOG)
}

function wait(seconds) {
  if (!fs.existsSync(DETACH_STATE)) {
    process.stderr.write('no detached run at ' + DETACH_STATE + '\n')
    process.exit(2)
  }
  const st = JSON.parse(fs.readFileSync(DETACH_STATE, 'utf8'))
  const startedMs = Date.parse(st.startedAt)
  const deadline = Date.now() + seconds * 1000
  const missing = () =>
    st.cells.filter(c => {
      const f = path.join(evidenceDir, `tierminator-parallel-${c}.json`)
      try {
        return fs.statSync(f).mtimeMs < startedMs
      } catch {
        return true
      }
    })
  const alive = () => {
    try {
      process.kill(st.pid, 0)
      return true
    } catch (e) {
      return e.code === 'EPERM'
    }
  }
  for (;;) {
    const m = missing()
    if (!m.length) {
      console.log('all done')
      process.exit(0)
    }
    if (!alive()) {
      console.log(m.join(' '))
      console.log('runner gone; see ' + st.log)
      process.exit(4)
    }
    if (Date.now() >= deadline) {
      console.log(`done ${st.cells.length - m.length} of ${st.cells.length}; missing: ${m.join(' ')}`)
      process.exit(3)
    }
    sleepMs(5000)
  }
}

function main(argv) {
  if (argv[0] === '--list') return console.log(Object.keys(CELLS).join('\n'))
  if (argv[0] === '--wait') {
    const s = Number(argv[1])
    if (argv.length !== 2 || !Number.isFinite(s) || s <= 0) {
      process.stderr.write('usage: node p5-runner.js --wait <seconds>\n')
      process.exit(2)
    }
    return wait(s)
  }
  const isDetach = argv[0] === '--detach'
  const names = isDetach ? argv.slice(1) : argv
  for (const n of names) if (!CELLS[n]) {
    process.stderr.write('unknown cell ' + n + '\n')
    process.exit(2)
  }
  if (isDetach) return detach(names)
  for (const n of names.length ? names : Object.keys(CELLS)) run(n)
}

if (require.main === module) main(process.argv.slice(2))
