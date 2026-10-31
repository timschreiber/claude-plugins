'use strict'

// Command line for the Tierminator end-to-end run: load the files of one finished scenario, print each check,
// and write the scenario's result files.

const fs = require('fs')
const path = require('path')
const { parseArgs } = require('util')
const { spawnSync } = require('child_process')
const lib = require('./lib.js')
const checks = require('./checks.js')

const USAGE =
  'usage: node tests/tierminator/e2e/check.js <1..8> <base> [--permission-line yes|no] [--all-answerable yes|no] [--note <text>]'

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

function claudeVersion() {
  try {
    const r = spawnSync('claude --version', { encoding: 'utf8', windowsHide: true, shell: true })
    const out = r.status === 0 ? String(r.stdout ?? '').trim() : ''
    return out || null
  } catch {
    return null
  }
}

function gatherFacts(n, base, observed) {
  base = path.resolve(base)
  const info = readJson(path.join(base, 'scenario.json'))
  if (!info) throw new Error(`no scenario.json in ${base}`)
  const repo = info.repo
  const runCount = n === 7 ? 0 : Number(info.runs) || 0
  const runs = []
  const snapshots = []
  const results = []
  for (let i = 0; i < runCount; i++) {
    const dir = path.join(base, `run-${i + 1}`)
    runs.push(readJson(path.join(dir, 'meta.json')) ?? { exit: null, timedOut: false, durationMs: 0 })
    results.push(readJson(path.join(base, `result-run-${i + 1}.json`)))
    snapshots.push(readJson(path.join(dir, 'snapshot.json')) ?? { commits: [], branches: [], worktrees: [] })
  }
  if (n === 7) results.push(readJson(path.join(base, 'plans', 'plan.result.json')))
  const snap = lib.snapshot(repo)
  const final = {
    commits: lib.commitsOf(repo),
    merges: Number(lib.git(repo, 'rev-list', '--merges', '--count', 'HEAD')),
    branch: lib.git(repo, 'rev-parse', '--abbrev-ref', 'HEAD'),
    status: lib.git(repo, 'status', '--porcelain'),
    branches: snap.branches,
    worktrees: snap.worktrees,
    files: { 'src/registry.js': readText(path.join(repo, 'src', 'registry.js')) }
  }
  return {
    runs,
    results,
    snapshots,
    final,
    telemetry: jsonLines(path.join(base, 'plans', 'plan.telemetry.jsonl')),
    observed: observed ?? {}
  }
}

function main(argv, { resultsDir } = {}) {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'permission-line': { type: 'string' },
        'all-answerable': { type: 'string' },
        note: { type: 'string' }
      }
    })
  } catch {
    console.error(USAGE)
    return 2
  }
  const { values, positionals } = parsed
  const n = Number(positionals[0])
  const yesNo = (v) => v === undefined || v === 'yes' || v === 'no'
  if (
    positionals.length !== 2 ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > 8 ||
    !yesNo(values['permission-line']) ||
    !yesNo(values['all-answerable'])
  ) {
    console.error(USAGE)
    return 2
  }
  const base = path.resolve(positionals[1])
  const observed = {}
  if (values['permission-line'] !== undefined) observed.permissionLine = values['permission-line']
  if (values['all-answerable'] !== undefined) observed.allAnswerable = values['all-answerable']

  const facts = gatherFacts(n, base, observed)
  const list = checks.scenarioChecks(n, facts)
  for (const c of list) console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`)
  const failed = list.filter((c) => !c.ok).length
  const pass = failed === 0
  console.log(pass ? `PASS: scenario ${n}` : `FAIL: scenario ${n} (${failed} checks failed)`)

  const info = readJson(path.join(base, 'scenario.json')) || {}
  const out = path.join(resultsDir ?? path.join(__dirname, 'results'), `scenario-${n}`)
  fs.mkdirSync(out, { recursive: true })
  const attempts = facts.telemetry
    .filter((r) => r && r.kind === 'attempt')
    .map((r) => ({
      task: r.task,
      tier: r.tier,
      attempt: r.attempt,
      outcome: r.outcome,
      agentId: r.agentId,
      at: r.at,
      durationMs: r.durationMs
    }))
  const obj = {
    scenario: n,
    title: info.title ?? null,
    date: new Date().toISOString(),
    claudeVersion: claudeVersion(),
    pass,
    checks: list,
    runs: facts.runs,
    results: facts.results,
    snapshots: facts.snapshots,
    finalCommits: facts.final.commits.map((c) => c.subject),
    attempts,
    observed,
    note: values.note ?? null
  }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(obj, null, 2) + '\n')
  const telemetryFile = path.join(base, 'plans', 'plan.telemetry.jsonl')
  const telemetryCopy = path.join(out, 'telemetry.jsonl')
  if (fs.existsSync(telemetryFile)) fs.copyFileSync(telemetryFile, telemetryCopy)
  else fs.rmSync(telemetryCopy, { force: true })
  console.log(`results: ${out}`)
  return pass ? 0 : 1
}

module.exports = { gatherFacts, main }

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
