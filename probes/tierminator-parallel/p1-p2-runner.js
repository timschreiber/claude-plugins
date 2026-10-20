// Probes P1 and P2 of docs/tierminator/tierminator-parallel-spec.md.
//
//   node probes/tierminator-parallel/p1-p2-runner.js [cell ...]   headless; no cell = all
//   node probes/tierminator-parallel/p1-p2-runner.js --list
//   node probes/tierminator-parallel/p1-p2-runner.js --prepare <cell>
//   node probes/tierminator-parallel/p1-p2-runner.js --collect <cell>
//
// Each cell builds a throwaway git repo (with a bare origin) in the temp directory, loads
// probes/tierminator-parallel/probe-plugin (plus any variant plugin the cell names), and has the main
// session dispatch the probe agent once. stdout and stderr are kept apart.
//
// Cells:
//   p1-isolation-commit, p1-isolation-nocommit  Agent call with isolation "worktree"; the worker commits or not.
//   p1-hook-isolation                           a hook adds isolation to the Agent call.
//   p2-inside, p2-outside                       no isolation; the worker works in a runner-made worktree
//                                               inside or outside the repo.
//   m1-baseref-flag                             hook-added isolation with --settings {worktree.baseRef: head}:
//                                               does the worktree start from the work branch HEAD (B)?
//   m1-baseref-plugin                           isolation "worktree" with variant-settings loaded: does a
//                                               plugin's settings set the baseRef?
//   m1-worktree-hook                            isolation "worktree" with variant-worktree-hook loaded: does a
//                                               WorktreeCreate hook make the worktree at PROBE_BASE (B)?
//   m1-substart-reset                           isolation "worktree" with variant-substart-reset loaded: does a
//                                               SubagentStart hook reset the worktree to PROBE_BASE (B)?
//   m2-cd-inside, m2-cd-outside                 no isolation; the m2-worker moves into a runner-made worktree
//                                               (inside or outside the repo) with cd.
// The m1 and m2 cells use the m1-worker and m2-worker agents; all cells exclude .claude/worktrees/ from git.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const evidenceDir = process.env.PROBE_EVIDENCE_DIR || path.join(__dirname, '..', 'evidence')
const AGENT_PREFIX = 'tierminator-parallel-probe:'

const CELLS = {
  'p1-isolation-commit': { isolation: 'call', commit: true, worktree: null },
  'p1-isolation-nocommit': { isolation: 'call', commit: false, worktree: null },
  'p1-hook-isolation': { isolation: 'hook', commit: true, worktree: null },
  'p2-inside': { isolation: 'none', commit: true, worktree: 'inside' },
  'p2-outside': { isolation: 'none', commit: true, worktree: 'outside' },
  'm1-baseref-flag': { isolation: 'hook', commit: true, worktree: null, agent: 'm1-worker', plugins: ['probe-plugin'], settings: true, exclude: true },
  'm1-baseref-plugin': { isolation: 'call', commit: true, worktree: null, agent: 'm1-worker', plugins: ['probe-plugin', 'variant-settings'], exclude: true },
  'm1-worktree-hook': { isolation: 'call', commit: true, worktree: null, agent: 'm1-worker', plugins: ['probe-plugin', 'variant-worktree-hook'], exclude: true },
  'm1-substart-reset': { isolation: 'call', commit: true, worktree: null, agent: 'm1-worker', plugins: ['probe-plugin', 'variant-substart-reset'], exclude: true },
  'm2-cd-inside': { isolation: 'none', commit: true, worktree: 'inside', agent: 'm2-worker', plugins: ['probe-plugin'], exclude: true },
  'm2-cd-outside': { isolation: 'none', commit: true, worktree: 'outside', agent: 'm2-worker', plugins: ['probe-plugin'], exclude: true },
}

function cellOf(name) {
  return { agent: 'sonnet-low', plugins: ['probe-plugin'], settings: false, exclude: false, ...CELLS[name] }
}

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${(r.stderr ?? '') + (r.error ? r.error.message : '')}`)
  }
  return (r.stdout ?? '').trim()
}

function setupCell(name) {
  const cell = cellOf(name)
  const base = path.join(os.tmpdir(), 'tierminator-parallel-' + name)
  fs.rmSync(base, { recursive: true, force: true })
  fs.mkdirSync(base, { recursive: true })

  const origin = path.join(base, 'origin.git')
  fs.mkdirSync(origin)
  git(origin, 'init', '-q', '--bare')

  const repo = path.join(base, 'repo')
  fs.mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'main')
  git(repo, 'config', 'user.name', 'Probe')
  git(repo, 'config', 'user.email', 'probe@example.invalid')
  git(repo, 'config', 'core.autocrlf', 'false')
  fs.writeFileSync(path.join(repo, 'CLAUDE.md'), 'CLAUDE-MARKER: main-tree\n')
  fs.writeFileSync(path.join(repo, 'README.md'), 'probe\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'probe: A')
  const A = git(repo, 'rev-parse', 'HEAD')
  git(repo, 'remote', 'add', 'origin', origin)
  git(repo, 'push', '-q', 'origin', 'main')
  git(repo, 'remote', 'set-head', 'origin', 'main')
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'probe: A2')
  const A2 = git(repo, 'rev-parse', 'HEAD')
  git(repo, 'checkout', '-q', '-b', 'work')
  fs.writeFileSync(path.join(repo, 'b.txt'), 'b\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'probe: B')
  const B = git(repo, 'rev-parse', 'HEAD')

  if (cell.exclude || cell.worktree === 'inside') {
    fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '.claude/worktrees/\n')
  }

  let settingsFile = null
  if (cell.settings) {
    settingsFile = path.join(base, 'settings.json')
    fs.writeFileSync(settingsFile, JSON.stringify({ worktree: { baseRef: 'head' } }, null, 2) + '\n')
  }

  let worktree = null
  let W = null
  if (cell.worktree) {
    let wt
    if (cell.worktree === 'inside') {
      wt =path.join(repo, '.claude', 'worktrees', 'p2')
    } else {
      wt = path.join(base, 'wt-p2')
    }
    git(repo, 'worktree', 'add', '-q', '-b', 'probe/p2', wt, 'HEAD')
    fs.writeFileSync(path.join(wt, 'CLAUDE.md'), 'CLAUDE-MARKER: worktree\n')
    git(wt, 'add', '-A')
    git(wt, 'commit', '-q', '-m', 'probe: W')
    W = git(wt, 'rev-parse', 'HEAD')
    worktree = path.resolve(wt).replace(/\\/g, '/')
  }

  const log = path.join(base, 'probe.log')
  const mode = cell.isolation === 'hook' ? 'add-isolation' : 'observe'
  const plugins = cell.plugins.map(p => path.join(__dirname, p))
  const ctx = { cell: name, base, repo, origin, log, worktree, mode, shas: { A, A2, B, W }, plugins, agent: cell.agent, settingsFile }
  fs.writeFileSync(path.join(base, 'ctx.json'), JSON.stringify(ctx, null, 2))
  return ctx
}

function agentPromptLines(ctx) {
  const cell = cellOf(ctx.cell)
  const lines = ['Probe cell: ' + ctx.cell, 'Commit: ' + (cell.commit ? 'yes' : 'no')]
  if (ctx.worktree) lines.push('Worktree: ' + ctx.worktree)
  return lines
}

function mainPrompt(ctx, interactive) {
  const cell = cellOf(ctx.cell)
  let call = 'Call the Agent tool once, with subagent_type "' + AGENT_PREFIX + ctx.agent + '", description "worktree probe"'
  call += cell.isolation === 'call' ? ', isolation "worktree"' : ', and no isolation parameter'
  if (!interactive) call += ', run_in_background false'
  call += ', and pass the prompt that sits between the two lines of three dashes below exactly as written, with nothing added or removed.'
  return [
    call,
    '---',
    ...agentPromptLines(ctx),
    '---',
    'Do not do the steps yourself. If the call fails, reply with the error verbatim. When the agent has finished, reply with its report verbatim and nothing else.',
  ].join('\n')
}

function probeEnv(ctx) {
  const env = {}
  const drop = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_PLUGIN_ROOT', 'CLAUDE_PLUGIN_DATA']
  for (const [k, v] of Object.entries(process.env)) {
    if (drop.includes(k) || k.startsWith('TIERMINATOR_') || k.startsWith('DECIDINATOR_')) continue
    env[k] = v
  }
  env.PROBE_LOG = ctx.log
  env.PROBE_MODE = ctx.mode
  env.PROBE_BASE = ctx.shas.B
  env.PROBE_WT_DIR = path.join(ctx.base, 'wt-hook')
  return env
}

const parse = e => {
  try {
    return JSON.parse(e.stdin)
  } catch {
    return {}
  }
}
const cut = (v, n = 1500) => (typeof v === 'string' && v.length > n ? `${v.slice(0, n)}…(${v.length})` : v)
const deep = v => JSON.parse(JSON.stringify(v ?? null), (k, x) => cut(x))
const textOf = resp => {
  const c = resp?.content
  if (Array.isArray(c)) return c.filter(b => b?.type === 'text').map(b => b.text).join('\n')
  return typeof c === 'string' ? c : null
}
const safe = fn => {
  try {
    return fn()
  } catch (e) {
    return { error: String(e && e.message ? e.message : e) }
  }
}
const lines = s => s.split('\n').map(l => l.replace(/\r$/, '')).filter(Boolean)

function gitAfter(ctx) {
  const probeFilesIn = dir => ['probe-rel.txt', 'probe-abs.txt'].filter(f => fs.existsSync(path.join(dir, f)))
  const out = {}
  out.main = safe(() => {
    const head = git(ctx.repo, 'rev-parse', 'HEAD')
    return {
      branch: git(ctx.repo, 'rev-parse', '--abbrev-ref', 'HEAD'),
      head,
      headIsB: head === ctx.shas.B,
      status: lines(git(ctx.repo, 'status', '--porcelain')),
    }
  })
  out.worktrees = safe(() => {
    const blocks = git(ctx.repo, 'worktree', 'list', '--porcelain').split(/\r?\n\r?\n/).filter(b => b.trim())
    return blocks.map((block, i) => {
      const w = { path: null, head: null, branch: null, isMain: i === 0 }
      for (const l of lines(block)) {
        if (l.startsWith('worktree ')) w.path = l.slice('worktree '.length)
        else if (l.startsWith('HEAD ')) w.head = l.slice('HEAD '.length)
        else if (l.startsWith('branch ')) w.branch = l.slice('branch '.length)
        else if (l === 'detached') w.branch = 'detached'
      }
      w.status = safe(() => lines(git(w.path, 'status', '--porcelain')))
      w.log = safe(() => lines(git(w.path, 'log', '-3', '--format=%H %s')))
      w.probeFiles = safe(() => probeFilesIn(w.path))
      return w
    })
  })
  out.branches = safe(() => lines(git(ctx.repo, 'branch', '-a', '--format=%(refname:short) %(objectname)')))
  out.mainProbeFiles = safe(() => probeFilesIn(ctx.repo))
  out.claudeWorktreesDir = safe(() => {
    const d = path.join(ctx.repo, '.claude', 'worktrees')
    return fs.existsSync(d) ? fs.readdirSync(d) : null
  })
  return out
}

function assistantTextsOf(file) {
  const texts = []
  if (!file || !fs.existsSync(file)) return texts
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    if (rec.type !== 'assistant' || !Array.isArray(rec.message?.content)) continue
    for (const b of rec.message.content) if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text)
  }
  return texts
}

function worktreeMentions(entries) {
  const found = []
  const re = /worktree/i
  const walk = (tag, keyPath, key, v) => {
    if (keyPath === 'prompt' && tag === 'ups') return
    if (keyPath === 'tool_input.prompt') return
    const isStr = typeof v === 'string'
    if ((key !== null && re.test(key)) || (isStr && re.test(v))) {
      found.push({ tag, keyPath, value: cut(isStr ? v : JSON.stringify(v), 300) })
    }
    if (Array.isArray(v)) v.forEach((x, i) => walk(tag, `${keyPath}[${i}]`, null, x))
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) walk(tag, keyPath ? `${keyPath}.${k}` : k, k, x)
    }
  }
  for (const e of entries) {
    const s = parse(e)
    for (const [k, x] of Object.entries(s)) walk(e.tag, k, k, x)
  }
  return found
}

function summary(ctx, entries) {
  const tagged = tag => entries.filter(e => e.tag === tag)
  const preAgent = tagged('pre-agent')[0]
  const agentCall = preAgent ? deep(parse(preAgent).tool_input) : null
  const emit = tagged('pre-agent:emit')[0]
  const postAgent = tagged('post-agent')[0]
  const resp = postAgent ? parse(postAgent).tool_response : null
  const agentResult = postAgent
    ? {
        status: resp?.status ?? null,
        keys: resp && typeof resp === 'object' ? Object.keys(resp) : null,
        contentText: cut(textOf(resp)),
        raw: deep(resp),
      }
    : null
  const failEntry = tagged('post-fail').find(e => /^(Agent|Task)$/.test(parse(e).tool_name ?? ''))
  const subEvents = tag =>
    tagged(tag).map(e => {
      const s = parse(e)
      return {
        keys: Object.keys(s),
        cwd: s.cwd ?? null,
        agent_id: s.agent_id ?? null,
        agent_type: s.agent_type ?? null,
        agent_transcript_path: s.agent_transcript_path ?? null,
        last_assistant_message: cut(s.last_assistant_message ?? null),
      }
    })
  const subStart = subEvents('sub-start')
  const subStop = subEvents('sub-stop')

  const toolCwds = tagged('pre-tool').map(e => {
    const s = parse(e)
    return {
      at: e.at,
      tool_name: s.tool_name,
      agent_id: s.agent_id ?? null,
      cwd: s.cwd,
      target: s.tool_input?.command ?? s.tool_input?.file_path,
    }
  })

  // The report text: the last sub-stop message that has it, else the Agent result, else the agent transcript.
  const KEY = 'PWD_INITIAL:'
  const fullStops = tagged('sub-stop').map(e => parse(e))
  let text = null
  const stopWith = fullStops.filter(s => typeof s.last_assistant_message === 'string' && s.last_assistant_message.includes(KEY)).pop()
  if (stopWith) text = stopWith.last_assistant_message
  else if (agentResult && agentResult.contentText && agentResult.contentText.includes(KEY)) text = textOf(resp)
  else {
    for (const s of fullStops) {
      const t = assistantTextsOf(s.agent_transcript_path).filter(x => x.includes(KEY)).pop()
      if (t) text = t
    }
  }
  let report = null
  if (text) {
    report = {}
    const re = /^(PWD_INITIAL|MARKER|PWD_NOW|TOPLEVEL|BRANCH|HEAD_BEFORE|REL_WRITE|ABS_WRITE|COMMIT|PWD_END|BRANCH_END|STATUS_END):\s*(.*)$/
    for (const l of text.split('\n')) {
      const m = re.exec(l.replace(/\r$/, ''))
      if (m) report[m[1]] = m[2]
    }
  }
  const { A, A2, B, W } = ctx.shas
  let basedOn = null
  if (report) {
    const h = report.HEAD_BEFORE
    basedOn = h === B ? 'HEAD of work (B)' : h === A2 ? 'local main (A2)' : h === A ? 'origin/main (A)' : W && h === W ? 'runner worktree commit (W)' : 'other'
  }

  return {
    agentCall,
    isolationPassed: agentCall && typeof agentCall === 'object' ? agentCall.isolation ?? null : null,
    hookEmitted: emit ? parse(emit) : null,
    agentResult,
    agentError: failEntry ? cut(parse(failEntry).error) : null,
    subagentStart: { fired: subStart.length > 0, events: subStart },
    subagentStop: { fired: subStop.length > 0, events: subStop },
    toolCwds,
    worktreeMentions: worktreeMentions(entries),
    report,
    base: { ...ctx.shas, basedOn },
    after: gitAfter(ctx),
  }
}

function writeEvidence(ctx, mode, run) {
  fs.mkdirSync(evidenceDir, { recursive: true })
  const entries = fs.existsSync(ctx.log)
    ? fs.readFileSync(ctx.log, 'utf8').split('\n').filter(Boolean).map(l => {
        try {
          return JSON.parse(l)
        } catch {
          return { raw: l }
        }
      })
    : []
  const events = run ? run.streamEvents : []
  const final = events.filter(e => e.type === 'result').pop()
  const version = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null
  const file = path.join(evidenceDir, `tierminator-parallel-${ctx.cell}${mode === 'interactive' ? '-interactive' : ''}.json`)
  const doc = {
    generated: new Date().toISOString(),
    claudeCodeVersion: version,
    cell: ctx.cell,
    mode,
    exitCode: run ? run.exitCode : null,
    prompt: mainPrompt(ctx, mode === 'interactive'),
    result: final ? final.result ?? null : null,
    costUsd: final ? final.total_cost_usd ?? null : null,
    stderr: run ? (run.stderr ?? '').slice(0, 4000) : '',
    summary: summary(ctx, entries),
    hookLog: entries,
  }
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
  console.log(`${ctx.cell}: exit ${doc.exitCode}; ${entries.length} hook events; wrote ${file}`)
}

function runHeadless(name) {
  const ctx = setupCell(name)
  const r = spawnSync(
    'claude',
    [
      '-p', mainPrompt(ctx, false),
      ...ctx.plugins.flatMap(p => ['--plugin-dir', p]),
      ...(ctx.settingsFile ? ['--settings', ctx.settingsFile] : []),
      '--model', 'sonnet',
      '--permission-mode', 'bypassPermissions',
      '--output-format', 'stream-json', '--verbose',
    ],
    { cwd: ctx.repo, env: probeEnv(ctx), encoding: 'utf8', timeout: 540000, maxBuffer: 64 * 1024 * 1024 }
  )
  const streamEvents = (r.stdout ?? '').split('\n').filter(Boolean).map(l => {
    try {
      return JSON.parse(l)
    } catch {
      return null
    }
  }).filter(Boolean)
  const stderr = (r.stderr ?? '') + (r.error ? `\n[spawn error] ${r.error.message}` : '')
  writeEvidence(ctx, 'headless', { exitCode: r.status, stderr, streamEvents })
}

function collect(name) {
  const file = path.join(os.tmpdir(), 'tierminator-parallel-' + name, 'ctx.json')
  if (!fs.existsSync(file)) {
    process.stderr.write(`no ctx.json at ${file}; run --prepare ${name} first\n`)
    process.exit(2)
  }
  writeEvidence(JSON.parse(fs.readFileSync(file, 'utf8')), 'interactive', null)
}

function usage() {
  process.stderr.write(
    [
      'usage: node probes/tierminator-parallel/p1-p2-runner.js [cell ...]',
      '       node probes/tierminator-parallel/p1-p2-runner.js --list',
      '       node probes/tierminator-parallel/p1-p2-runner.js --prepare <cell>',
      '       node probes/tierminator-parallel/p1-p2-runner.js --collect <cell>',
      'cells: ' + Object.keys(CELLS).join(', '),
      '',
    ].join('\n')
  )
  process.exit(2)
}

function main(argv) {
  if (argv[0] === '--list') {
    console.log(Object.keys(CELLS).join('\n'))
    return
  }
  if (argv[0] === '--prepare' || argv[0] === '--collect') {
    const name = argv[1]
    if (argv.length !== 2 || !Object.prototype.hasOwnProperty.call(CELLS, name)) usage()
    if (argv[0] === '--prepare') {
      const ctx = setupCell(name)
      console.log(`cd "${ctx.repo}"`)
      console.log(`$env:PROBE_LOG='${ctx.log}'`)
      console.log(`$env:PROBE_MODE='${ctx.mode}'`)
      console.log(
        'claude ' + ctx.plugins.map(p => `--plugin-dir "${p}"`).join(' ') + (ctx.settingsFile ? ` --settings "${ctx.settingsFile}"` : '')
      )
      console.log('Paste this prompt:')
      console.log(mainPrompt(ctx, true))
      console.log(`Afterwards: node ${__filename} --collect ${name}`)
      console.log(JSON.stringify({ cell: ctx.cell, repo: ctx.repo, worktree: ctx.worktree, log: ctx.log }))
    }
    else collect(name)
    return
  }
  if (argv.some(a => a.startsWith('--'))) usage()
  const names = argv.length ? argv : Object.keys(CELLS)
  for (const n of names) if (!Object.prototype.hasOwnProperty.call(CELLS, n)) usage()
  for (const n of names) runHeadless(n)
}

if (require.main === module) main(process.argv.slice(2))
