'use strict'

// Runs one scenario of Tierminator's parallel end-to-end runbook headless: a detached worker runs
// `claude -p "/tierminator:execute <plan>"` once per run of the scenario and records what each run left behind.
//
//   run-headless.js <n> [base] --detach   build the fixture if needed, start the worker, print `base: <base>`
//   run-headless.js --wait <base> [seconds]   wait for the worker (default 540 s); exit 0 done, 1 failed, 3 still running
//   run-headless.js <n> <base> --worker   internal: the worker itself

const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const lib = require('./lib.js')
const { setup } = require('./setup.js')

const USAGE = 'usage: node tests/tierminator/e2e/run-headless.js <1..8> [base] --detach | --wait <base> [seconds] | <1..8> <base> --worker'

const SESSION_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_PLUGIN_ROOT',
  'CLAUDE_PLUGIN_DATA',
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_ENV_FILE',
  'CLAUDE_CODE_SSE_PORT'
]

function parseArgs(argv) {
  const bad = { error: USAGE }
  const flags = argv.filter(a => a.startsWith('--'))
  const rest = argv.filter(a => !a.startsWith('--'))
  if (flags.length !== 1) return bad
  const flag = flags[0]
  if (flag === '--wait') {
    if (rest.length < 1 || rest.length > 2) return bad
    const seconds = rest[1] === undefined ? 540 : Number(rest[1])
    if (!Number.isFinite(seconds) || seconds < 0) return bad
    return { mode: 'wait', base: path.resolve(rest[0]), seconds }
  }
  if (flag !== '--detach' && flag !== '--worker') return bad
  const n = Number(rest[0])
  if (rest.length < 1 || rest.length > 2 || !Number.isInteger(n) || n < 1 || n > 8) return bad
  if (flag === '--worker' && rest.length !== 2) return bad
  return {
    mode: flag === '--detach' ? 'detach' : 'worker',
    n,
    base: rest[1] ? path.resolve(rest[1]) : null
  }
}

function cleanEnv(env) {
  const out = { ...env }
  for (const key of Object.keys(out)) {
    if (SESSION_VARS.includes(key) || key.startsWith('TIERMINATOR_') || key.startsWith('DECIDINATOR_')) delete out[key]
  }
  return out
}

function claudeArgs({ planPath, permissionMode, pluginDir }) {
  return [
    '-p', `/tierminator:execute "${planPath}"`,
    '--plugin-dir', pluginDir,
    '--setting-sources', 'project',
    '--model', 'sonnet',
    '--permission-mode', permissionMode,
    '--output-format', 'stream-json',
    '--verbose'
  ]
}

function writeStatus(base, status) {
  fs.writeFileSync(path.join(base, 'status.json'), JSON.stringify(status, null, 2))
}

function runWorker(n, base) {
  base = path.resolve(base)
  try {
    writeStatus(base, { state: 'running', pid: process.pid, startedAt: new Date().toISOString() })
    const info = JSON.parse(fs.readFileSync(path.join(base, 'scenario.json'), 'utf8'))
    const pluginDir = lib.fwd(path.join(__dirname, '..', '..', '..', 'plugins', 'tierminator'))
    const resultFile = path.join(base, 'plans', 'plan.result.json')

    for (let step = 1; step <= info.runs; step++) {
      if (step > 1 && info.fixBetween) {
        fs.mkdirSync(path.dirname(info.marker), { recursive: true })
        fs.writeFileSync(info.marker, 'fixed\n')
      }
      if (fs.existsSync(resultFile)) fs.rmSync(resultFile)

      const args = claudeArgs({ planPath: info.plan, permissionMode: info.permissionMode, pluginDir })
      const startedAt = new Date()
      const r = spawnSync('claude', args, {
        cwd: info.repo,
        env: cleanEnv(process.env),
        encoding: 'utf8',
        timeout: 1800000,
        maxBuffer: 268435456,
        windowsHide: true
      })
      const durationMs = Date.now() - startedAt.getTime()

      const dir = path.join(base, `run-${step}`)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'stream.jsonl'), r.stdout ?? '')
      fs.writeFileSync(path.join(dir, 'stderr.txt'), r.stderr ?? '')
      fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({
        exit: r.status,
        signal: r.signal,
        timedOut: r.error?.code === 'ETIMEDOUT',
        durationMs,
        startedAt: startedAt.toISOString(),
        args
      }, null, 2))
      if (fs.existsSync(resultFile)) fs.copyFileSync(resultFile, path.join(base, `result-run-${step}.json`))
      fs.writeFileSync(path.join(dir, 'snapshot.json'), JSON.stringify(lib.snapshot(info.repo), null, 2))
    }
    writeStatus(base, { state: 'done', finishedAt: new Date().toISOString() })
  } catch (e) {
    try {
      writeStatus(base, { state: 'failed', error: String(e && e.message ? e.message : e) })
    } catch {}
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readStatus(base) {
  try {
    return JSON.parse(fs.readFileSync(path.join(base, 'status.json'), 'utf8'))
  } catch {
    return null
  }
}

async function waitFor(base, seconds, { intervalMs = 2000 } = {}) {
  const deadline = Date.now() + seconds * 1000
  for (;;) {
    const st = readStatus(base)
    if (!st) return { code: 1, text: 'no status file' }
    if (st.state === 'done') return { code: 0, text: 'done' }
    if (st.state === 'failed') return { code: 1, text: String(st.error) }
    if (st.state === 'running' && !pidAlive(st.pid)) return { code: 1, text: 'worker died' }
    if (Date.now() >= deadline) return { code: 3, text: 'still running' }
    await new Promise(resolve => setTimeout(resolve, Math.min(intervalMs, Math.max(0, deadline - Date.now()))))
  }
}

function detach(n, base) {
  const isEmpty = !fs.existsSync(base) || (fs.statSync(base).isDirectory() && fs.readdirSync(base).length === 0)
  if (isEmpty) setup(n, base)
  const log = fs.openSync(path.join(base, 'worker.log'), 'a')
  const child = spawn(process.execPath, [__filename, String(n), base, '--worker'], {
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true
  })
  child.unref()
  console.log(`base: ${base}`)
}

async function main(argv) {
  if (argv[0] === '7') {
    console.error('scenario 7 is interactive: hand-run it (see the runbook)')
    return 2
  }
  const args = parseArgs(argv)
  if (args.error) {
    console.error(args.error)
    return 2
  }
  if (args.mode === 'wait') {
    const r = await waitFor(args.base, args.seconds)
    console.log(r.text)
    return r.code
  }
  if (args.mode === 'detach') {
    detach(args.n, args.base ?? path.resolve(lib.defaultBase(args.n)))
    return 0
  }
  runWorker(args.n, args.base)
  return 0
}

module.exports = { parseArgs, cleanEnv, claudeArgs, waitFor, runWorker }

if (require.main === module) {
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    e => {
      console.error(e.message)
      process.exit(1)
    }
  )
}
