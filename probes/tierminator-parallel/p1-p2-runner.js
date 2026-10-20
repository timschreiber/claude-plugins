// Probes P1 and P2 of docs/tierminator/tierminator-parallel-spec.md.
//
//   node probes/tierminator-parallel/p1-p2-runner.js [cell ...]   headless; no cell = all
//   node probes/tierminator-parallel/p1-p2-runner.js --list
//   node probes/tierminator-parallel/p1-p2-runner.js --prepare <cell>
//   node probes/tierminator-parallel/p1-p2-runner.js --collect <cell>
//
// Each cell builds a throwaway git repo (with a bare origin) in the temp directory, loads
// probes/tierminator-parallel/probe-plugin, and has the main session dispatch the probe agent once.
// stdout and stderr are kept apart.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const plugin = path.join(__dirname, 'probe-plugin')
const evidenceDir = process.env.PROBE_EVIDENCE_DIR || path.join(__dirname, '..', 'evidence')
const AGENT = 'tierminator-parallel-probe:sonnet-low'

const CELLS = {
  'p1-isolation-commit': { isolation: 'call', commit: true, worktree: null },
  'p1-isolation-nocommit': { isolation: 'call', commit: false, worktree: null },
  'p1-hook-isolation': { isolation: 'hook', commit: true, worktree: null },
  'p2-inside': { isolation: 'none', commit: true, worktree: 'inside' },
  'p2-outside': { isolation: 'none', commit: true, worktree: 'outside' },
}

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${(r.stderr ?? '') + (r.error ? r.error.message : '')}`)
  }
  return (r.stdout ?? '').trim()
}

function setupCell(name) {
  const cell = CELLS[name]
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

  let worktree = null
  let W = null
  if (cell.worktree) {
    let wt
    if (cell.worktree === 'inside') {
      fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '.claude/worktrees/\n')
      wt = path.join(repo, '.claude', 'worktrees', 'p2')
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
  const ctx = { cell: name, base, repo, origin, log, worktree, mode, shas: { A, A2, B, W } }
  fs.writeFileSync(path.join(base, 'ctx.json'), JSON.stringify(ctx, null, 2))
  return ctx
}

function agentPromptLines(ctx) {
  const cell = CELLS[ctx.cell]
  const lines = ['Probe cell: ' + ctx.cell, 'Commit: ' + (cell.commit ? 'yes' : 'no')]
  if (ctx.worktree) lines.push('Worktree: ' + ctx.worktree)
  return lines
}

function mainPrompt(ctx, interactive) {
  const cell = CELLS[ctx.cell]
  let call = 'Call the Agent tool once, with subagent_type "' + AGENT + '", description "worktree probe"'
  call += cell.isolation === 'call' ? ', isolation "worktree"' : ', and no isolation parameter'
  if (!interactive) call += ', run_in_background false'
  call += ', and this exact prompt:'
  return [
    call,
    ...agentPromptLines(ctx),
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
  return env
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
      console.log(`claude --plugin-dir "${plugin}"`)
      console.log('Paste this prompt:')
      console.log(mainPrompt(ctx, true))
      console.log(`Afterwards: node ${__filename} --collect ${name}`)
      console.log(JSON.stringify({ cell: ctx.cell, repo: ctx.repo, worktree: ctx.worktree, log: ctx.log }))
    }
    // part 2: --collect
    return
  }
  if (argv.some(a => a.startsWith('--'))) usage()
  const names = argv.length ? argv : Object.keys(CELLS)
  for (const n of names) if (!Object.prototype.hasOwnProperty.call(CELLS, n)) usage()
  // part 2: headless run of each cell and evidence
  void evidenceDir
  void probeEnv
}

if (require.main === module) main(process.argv.slice(2))
