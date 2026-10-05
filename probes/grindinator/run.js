// Runs one Grindinator WP-01 probe cell. See probes/grindinator/README.md, section 'run.js'.
//
//   node probes/grindinator/run.js --list
//   node probes/grindinator/run.js --dry-run <cell>
//   node probes/grindinator/run.js <cell>
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const lib = require('./lib')
const { startMock } = require('./mock-api')

const USAGE = 'usage: node probes/grindinator/run.js --list | --dry-run <cell> | <cell>'
const MODULES = ['cells-api.js', 'cells-tierminator.js', 'cells-decidinator.js']

function loadCells() {
  const cells = {}
  for (const file of MODULES) {
    const full = path.join(__dirname, file)
    if (!fs.existsSync(full)) continue
    const mod = require(full)
    for (const [name, def] of Object.entries(mod)) {
      if (name in cells) throw new Error(`duplicate cell name '${name}' (in ${file})`)
      cells[name] = def
    }
  }
  return cells
}

function cellName(cell) {
  return process.env.PROBE_TAG ? `${cell}-${process.env.PROBE_TAG}` : cell
}

function resetBase(name) {
  const base = path.join(os.tmpdir(), 'grindinator-probe', name)
  fs.rmSync(base, { recursive: true, force: true })
  fs.mkdirSync(base, { recursive: true })
  return base
}

function buildArgs(spec, base) {
  const args = ['-p', spec.prompt, '--output-format', 'stream-json', '--verbose', '--settings', lib.writeSettings(base)]
  for (const key of spec.plugins || []) {
    if (!lib.PLUGINS[key]) throw new Error(`unknown plugin key '${key}'`)
    args.push('--plugin-dir', lib.PLUGINS[key])
  }
  return args.concat(spec.flags || [])
}

function buildEnv(spec, name, outDir, mockUrl) {
  const extra = { PROBE_RUN: name, PROBE_OUT: outDir, ...(spec.env || {}) }
  if (mockUrl) extra.ANTHROPIC_BASE_URL = mockUrl
  return lib.cellEnv(extra)
}

function buildCommon(ctx) {
  const { run, summary, records } = ctx
  const result = summary.result
  const hookEventCounts = {}
  for (const r of records) hookEventCounts[r.event] = (hookEventCounts[r.event] || 0) + 1
  const pluginsLoaded = summary.plugins
  const seen = {}
  if (Array.isArray(pluginsLoaded)) {
    for (const p of pluginsLoaded) {
      const n = typeof p === 'string' ? p : p && p.name !== undefined ? p.name : JSON.stringify(p)
      seen[n] = (seen[n] || 0) + 1
    }
  }
  return {
    exitCode: run.exitCode,
    timedOut: run.timedOut,
    resultSubtype: result ? result.subtype ?? null : null,
    isError: result ? result.is_error ?? null : null,
    resultKeys: result ? Object.keys(result) : null,
    resultText: result && result.result !== undefined && result.result !== null ? String(result.result).slice(0, 600) : null,
    initKeys: summary.init ? Object.keys(summary.init) : null,
    sessionIdIn: summary.sessionIdIn,
    typeCounts: summary.typeCounts,
    apiRetries: summary.apiRetries.length,
    permissionDenials: result ? result.permission_denials ?? null : null,
    hookEventCounts,
    stopFailure: records.filter(r => r.event === 'StopFailure').map(r => r.input),
    sessionEnd: records.filter(r => r.event === 'SessionEnd').map(r => r.input),
    pluginsLoaded,
    duplicatePlugins: Object.keys(seen).filter(n => seen[n] > 1),
  }
}

async function runCell(cell, def) {
  const name = cellName(cell)
  const base = resetBase(name)
  const outDir = path.join(base, 'out')
  fs.mkdirSync(outDir, { recursive: true })
  const spec = await def.setup(base)
  const args = buildArgs(spec, base)

  let mock = null
  let resetEpoch = null
  let run
  try {
    if (spec.mock) {
      resetEpoch = Math.floor(Date.now() / 1000) + 7200
      mock = await startMock({ mode: spec.mock, logFile: path.join(base, 'mock.jsonl'), resetEpoch })
    }
    const { env, stripped } = buildEnv(spec, name, outDir, mock ? mock.url : null)
    run = await lib.runClaude({ cwd: spec.cwd, args, env, timeoutMs: spec.timeoutMs })
    run.stripped = stripped
  } finally {
    if (mock) await mock.close()
  }

  const events = lib.parseStream(run.stdout)
  const summary = lib.streamSummary(events)
  const records = lib.hookRecords(outDir)
  const agents = lib.agentRows(records)
  const git = lib.gitInfo(spec.cwd)
  const mockLog = lib.readJsonLines(path.join(base, 'mock.jsonl'))
  const ctx = { name, base, cwd: spec.cwd, outDir, spec, run, events, summary, records, agents, git, mockLog, resetEpoch }

  lib.writeEvidence(name, 'stream.jsonl', run.stdout)
  lib.writeEvidence(name, 'hooks.jsonl', records.map(r => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''))
  lib.writeEvidence(name, 'agents.json', agents)
  const tp = records.length && records[0].input ? records[0].input.transcript_path : null
  if (tp && fs.existsSync(tp)) lib.writeEvidence(name, 'transcript.jsonl', fs.readFileSync(tp, 'utf8'))
  if (spec.mock) lib.writeEvidence(name, 'mock.jsonl', mockLog.map(r => JSON.stringify(r)).join('\n') + (mockLog.length ? '\n' : ''))
  lib.writeEvidence(name, 'run.json', {
    generated: new Date().toISOString(),
    claudeCodeVersion: lib.claudeVersion(),
    cell: name,
    items: def.items,
    args,
    envSet: Object.keys(spec.env || {}),
    stripped: run.stripped,
    exitCode: run.exitCode,
    signal: run.signal,
    timedOut: run.timedOut,
    durationMs: run.durationMs,
    spawnError: run.spawnError,
    stderr: String(run.stderr || '').slice(0, 4000),
    git,
  })
  let cellAnalysis
  try {
    cellAnalysis = def.analyze(ctx)
  } catch (e) {
    cellAnalysis = { analyzeError: e && e.message ? e.message : String(e) }
  }
  lib.writeEvidence(name, 'analysis.json', { common: buildCommon(ctx), cell: cellAnalysis })

  const sub = summary.result && summary.result.subtype ? summary.result.subtype : 'none'
  console.log(`${name}: exit=${run.exitCode} timedOut=${run.timedOut} hooks=${records.length} result=${sub}`)
}

async function dryRun(cell, def) {
  const name = cellName(cell)
  const base = resetBase(name)
  const outDir = path.join(base, 'out')
  const spec = await def.setup(base)
  const args = buildArgs(spec, base)
  buildEnv(spec, name, outDir, spec.mock ? 'http://127.0.0.1:0' : null)
  console.log(JSON.stringify(args, null, 2))
  console.log('env: ' + JSON.stringify(Object.keys(spec.env || {})))
}

async function main() {
  const argv = process.argv.slice(2)
  const cells = loadCells()
  if (argv.length === 1 && argv[0] === '--list') {
    for (const [name, def] of Object.entries(cells)) console.log(`${name}  ${def.items.join(', ')}`)
    return
  }
  const dry = argv[0] === '--dry-run'
  const rest = dry ? argv.slice(1) : argv
  if (rest.length !== 1 || rest[0].startsWith('--')) {
    console.error(USAGE)
    process.exit(64)
  }
  const cell = rest[0]
  if (!Object.prototype.hasOwnProperty.call(cells, cell)) {
    console.error(`unknown cell '${cell}'\n${USAGE}`)
    process.exit(64)
  }
  if (dry) await dryRun(cell, cells[cell])
  else await runCell(cell, cells[cell])
}

main().then(
  () => process.exit(0),
  e => {
    console.error(e && e.stack ? e.stack : String(e))
    process.exit(2)
  },
)
