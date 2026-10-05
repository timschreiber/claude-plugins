// Stand-in for `claude -p` in the Grindinator runner tests. Not a test file.
// Environment:
//   GRINDINATOR_STUB_LOG      when set, one JSON line is appended per run: {argv, cwd, env}, where
//                             env holds TIERMINATOR_RESULT_FILE, DECIDINATOR_MODE,
//                             DECIDINATOR_CONTEXT, DECIDINATOR_LOG, DECIDINATOR_SIDECAR, CLAUDECODE and
//                             CLAUDE_CODE_ENTRYPOINT (null when unset).
//   GRINDINATOR_STUB_SCENARIO path of a JSON scenario file; without it DEFAULT_SCENARIO runs.
// Scenario format (all keys optional):
//   stream     array written to stdout one entry per line: a string as is (so a test can emit a
//              malformed line), anything else as JSON. Default [].
//   stderr     string written to stderr.
//   commit     when true, appends a unique line to stub-work/<ctx>.txt in the working directory
//              (ctx is DECIDINATOR_CONTEXT, or 'none') and commits it as 'stub commit <ctx>'. Runs
//              only when the working directory is a repository root; otherwise
//              'claude-stub: commit skipped: not a repository root' goes to stderr. A failing git
//              command writes 'claude-stub: commit failed: <stderr>' to stderr and the stub carries on.
//   untracked  a file name; 'litter' is written to it in the working directory and left uncommitted.
//   resultFile object written as JSON to TIERMINATOR_RESULT_FILE (parent directories created),
//              when that variable is set.
//   delayMs    wait before setting the exit code. Default 0.
//   exitCode   process exit code. Default 0.
// An unreadable or invalid scenario file prints 'claude-stub: bad scenario: <message>' to stderr
// and exits 99. The stub never calls process.exit, so stdout flushes.
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const DEFAULT_SCENARIO = {
  stream: [
    { type: 'system', subtype: 'init', session_id: 'stub-session' },
    { type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: 'stub-session', result_index: 0 }
  ],
  exitCode: 0
}

function commitWork(env) {
  const gitEnv = { ...env }
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY']) delete gitEnv[key]
  const run = args => spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf8', windowsHide: true, env: gitEnv })

  const top = run(['rev-parse', '--show-toplevel'])
  let isRoot = false
  if (top.status === 0) {
    try {
      isRoot = fs.realpathSync.native(top.stdout.trim()) === fs.realpathSync.native(process.cwd())
    } catch { isRoot = false }
  }
  if (!isRoot) {
    process.stderr.write('claude-stub: commit skipped: not a repository root\n')
    return
  }

  const ctx = env.DECIDINATOR_CONTEXT || 'none'
  const rel = `stub-work/${ctx}.txt`
  fs.mkdirSync(path.join(process.cwd(), 'stub-work'), { recursive: true })
  fs.appendFileSync(path.join(process.cwd(), 'stub-work', `${ctx}.txt`), `${Date.now()} ${process.pid} ${Math.random()}\n`)
  for (const args of [['add', '--', rel], ['commit', '-q', '-m', `stub commit ${ctx}`]]) {
    const r = run(args)
    if (r.status !== 0) {
      process.stderr.write(`claude-stub: commit failed: ${r.stderr}`)
      return
    }
  }
}

function main() {
  const env = process.env
  if (env.GRINDINATOR_STUB_LOG) {
    const entry = {
      argv: process.argv.slice(2),
      cwd: process.cwd(),
      env: {
        TIERMINATOR_RESULT_FILE: env.TIERMINATOR_RESULT_FILE ?? null,
        DECIDINATOR_MODE: env.DECIDINATOR_MODE ?? null,
        DECIDINATOR_CONTEXT: env.DECIDINATOR_CONTEXT ?? null,
        DECIDINATOR_LOG: env.DECIDINATOR_LOG ?? null,
        DECIDINATOR_SIDECAR: env.DECIDINATOR_SIDECAR ?? null,
        CLAUDECODE: env.CLAUDECODE ?? null,
        CLAUDE_CODE_ENTRYPOINT: env.CLAUDE_CODE_ENTRYPOINT ?? null
      }
    }
    fs.appendFileSync(env.GRINDINATOR_STUB_LOG, JSON.stringify(entry) + '\n')
  }

  let scenario = DEFAULT_SCENARIO
  if (env.GRINDINATOR_STUB_SCENARIO) {
    try {
      scenario = JSON.parse(fs.readFileSync(env.GRINDINATOR_STUB_SCENARIO, 'utf8'))
    } catch (e) {
      process.stderr.write(`claude-stub: bad scenario: ${e.message}\n`)
      process.exitCode = 99
      return
    }
  }

  for (const entry of scenario.stream ?? []) {
    process.stdout.write((typeof entry === 'string' ? entry : JSON.stringify(entry)) + '\n')
  }
  if (typeof scenario.stderr === 'string') process.stderr.write(scenario.stderr)
  if (scenario.commit === true) commitWork(env)
  if (typeof scenario.untracked === 'string') fs.writeFileSync(path.join(process.cwd(), scenario.untracked), 'litter\n')
  if (scenario.resultFile !== null && typeof scenario.resultFile === 'object' && env.TIERMINATOR_RESULT_FILE) {
    fs.mkdirSync(path.dirname(env.TIERMINATOR_RESULT_FILE), { recursive: true })
    fs.writeFileSync(env.TIERMINATOR_RESULT_FILE, JSON.stringify(scenario.resultFile, null, 2) + '\n')
  }
  setTimeout(() => { process.exitCode = scenario.exitCode ?? 0 }, scenario.delayMs ?? 0)
}

main()
