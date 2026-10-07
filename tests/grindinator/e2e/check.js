'use strict'

// Command line for the Grindinator end-to-end run: load the files of one finished run, print each check
// of its step, and write the run's result files.

const fs = require('fs')
const path = require('path')
const { parseArgs } = require('util')
const { spawnSync } = require('child_process')
const checks = require('./checks.js')

const USAGE =
  'usage: node tests/grindinator/e2e/check.js <stub-limit|harness|pilot|batch> <repo> [--tag <name>] [--exit <code>] [--out <dir>] | compare <a.json> <b.json>'

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function jsonLines(file) {
  const out = []
  for (const line of readText(file).split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // skip unparseable lines
    }
  }
  return out
}

function git(dir, ...args) {
  const env = { ...process.env }
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY']) delete env[key]
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', windowsHide: true, env })
  return { status: r.status, out: r.status === 0 ? String(r.stdout ?? '').trim() : '' }
}

function pluginInfo(inits, name, repoRoot) {
  const init = inits.find((i) => Array.isArray(i.plugins))
  if (!init) return { version: null, current: null }
  const entry = init.plugins.find(
    (p) => p && (p.name === name || (typeof p.source === 'string' && p.source.startsWith(name + '@')))
  )
  const version = entry && typeof entry.path === 'string' ? path.basename(entry.path) : null
  if (version === null) return { version: null, current: null }
  const latest = git(repoRoot, 'log', '-1', '--format=%H', '--', `plugins/${name}`).out
  let current = null
  if (latest) {
    const r = git(repoRoot, 'merge-base', '--is-ancestor', latest, version)
    current = r.status === 0 ? true : r.status === 1 ? false : null
  }
  return { version, current }
}

function load(repoArg) {
  const repo = path.resolve(repoArg)
  const grind = path.join(repo, '.grindinator')
  const state = readJson(path.join(grind, 'state.json'))
  const base = state && state.baseCommit
  const subjects = base
    ? git(repo, 'log', '--format=%s', `${base}..HEAD`).out.split('\n').map((s) => s.trim()).filter(Boolean)
    : []
  const logPath = path.resolve(repo, state?.decisions?.log?.repo ?? 'docs/decisions.md')
  const sidecarPath = path.resolve(repo, state?.decisions?.sidecar?.repo ?? 'docs/open-questions.md')
  const attempts = {}
  const inits = []
  const packages = state && state.packages && typeof state.packages === 'object' ? state.packages : {}
  for (const id of Object.keys(packages)) {
    const list = Array.isArray(packages[id] && packages[id].attempts) ? packages[id].attempts : []
    attempts[id] = list.map((a) => {
      const dir = path.join(grind, 'runs', id, `attempt-${a && a.n}`)
      const result = readJson(path.join(dir, 'result.json'))
      const lines = jsonLines(path.join(dir, 'stream.jsonl'))
      const init = lines.find((l) => l && l.type === 'system' && l.subtype === 'init') || null
      const results = lines.filter((l) => l && l.type === 'result')
      if (init) inits.push(init)
      return { result, init, lastResult: results.length > 0 ? results[results.length - 1] : null }
    })
  }
  const repoRoot = path.resolve(__dirname, '..', '..', '..')
  const plugins = {
    tierminator: pluginInfo(inits, 'tierminator', repoRoot),
    decidinator: pluginInfo(inits, 'decidinator', repoRoot)
  }
  const firstInit = inits[0]
  return {
    state,
    summary: readText(path.join(grind, 'summary.md')),
    branch: git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').out,
    porcelain: git(repo, 'status', '--porcelain').out,
    subjects,
    decisionsText: readText(logPath),
    openQuestionsText: readText(sidecarPath),
    attempts,
    plugins,
    stubLog: jsonLines(path.join(path.dirname(repo), 'stub-log.jsonl')),
    leftover: fs.existsSync(path.join(repo, 'partial.txt')),
    claudeCodeVersion: firstInit && firstInit.claude_code_version !== undefined ? firstInit.claude_code_version : null,
    logPath,
    sidecarPath
  }
}

function usage() {
  console.error(USAGE)
  process.exit(2)
}

function compare(fileA, fileB) {
  let a, b
  try {
    a = JSON.parse(fs.readFileSync(fileA, 'utf8'))
    b = JSON.parse(fs.readFileSync(fileB, 'utf8'))
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  console.log(checks.compareText(a, b).join('\n'))
  process.exit(0)
}

function run(step, repoArg, opts) {
  const repo = path.resolve(repoArg)
  const tag = opts.tag ?? 'firstparty'
  const out = opts.out ? path.resolve(opts.out) : path.join(__dirname, 'results', `${step}-${tag}`)
  const loaded = load(repo)
  const exitCode = opts.exit === undefined ? null : Number(opts.exit)
  const inputs = { ...loaded, exitCode }
  const result = checks.checkStep(step, inputs)
  for (const c of result.checks) console.log(c.pass ? `ok   ${c.name}` : `FAIL ${c.name}: ${c.detail}`)
  const metrics = checks.metrics(inputs)
  for (const [id, p] of Object.entries(metrics.packages)) {
    console.log(
      `${id}: ${p.status}, ${p.attempts} attempts, ${p.tasksDone ?? '-'} tasks, ${p.commits} commits, ${p.decisions} decisions, cost ${p.costUsd ?? '-'} USD`
    )
  }
  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(out, { recursive: true })
  const copies = [
    [path.join(repo, '.grindinator', 'state.json'), 'state.json'],
    [path.join(repo, '.grindinator', 'summary.md'), 'summary.md'],
    [loaded.logPath, 'decisions.md'],
    [loaded.sidecarPath, 'open-questions.md']
  ]
  for (const [from, name] of copies) {
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(out, name))
  }
  const obj = {
    generated: new Date().toISOString(),
    step,
    tag,
    repo,
    exitCode,
    claudeCodeVersion: loaded.claudeCodeVersion,
    plugins: loaded.plugins,
    pass: result.pass,
    checks: result.checks,
    metrics
  }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(obj, null, 2) + '\n')
  console.log(`results: ${out}`)
  console.log(`${result.pass ? 'PASS' : 'FAIL'}: ${step} (${tag})`)
  process.exit(result.pass ? 0 : 1)
}

function main(argv) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        tag: { type: 'string' },
        exit: { type: 'string' },
        out: { type: 'string' }
      }
    })
  } catch {
    usage()
  }
  const { values, positionals } = parsed
  if (positionals[0] === 'compare') {
    if (positionals.length !== 3) usage()
    compare(positionals[1], positionals[2])
    return
  }
  if (positionals.length !== 2 || !checks.STEPS.includes(positionals[0])) usage()
  if (values.tag !== undefined && !/^[A-Za-z0-9._-]+$/.test(values.tag)) usage()
  if (values.exit !== undefined && !/^-?\d+$/.test(values.exit)) usage()
  run(positionals[0], positionals[1], values)
}

module.exports = { load }

if (require.main === module) {
  try {
    main(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
