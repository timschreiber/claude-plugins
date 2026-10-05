// Stand-in for `claude -p` in the Grindinator runner tests. Not a test file.
// Environment:
//   GRINDINATOR_STUB_LOG      when set, one JSON line is appended per run: {argv, cwd, env}, where
//                             env holds TIERMINATOR_RESULT_FILE, DECIDINATOR_MODE,
//                             DECIDINATOR_CONTEXT, DECIDINATOR_LOG and DECIDINATOR_SIDECAR (null when unset).
//   GRINDINATOR_STUB_SCENARIO path of a JSON scenario file; without it DEFAULT_SCENARIO runs.
// Scenario format (all keys optional):
//   stream     array written to stdout one entry per line: a string as is (so a test can emit a
//              malformed line), anything else as JSON. Default [].
//   stderr     string written to stderr.
//   resultFile object written as JSON to TIERMINATOR_RESULT_FILE (parent directories created),
//              when that variable is set.
//   delayMs    wait before setting the exit code. Default 0.
//   exitCode   process exit code. Default 0.
// An unreadable or invalid scenario file prints 'claude-stub: bad scenario: <message>' to stderr
// and exits 99. The stub never calls process.exit, so stdout flushes.
'use strict'

const fs = require('fs')
const path = require('path')

const DEFAULT_SCENARIO = {
  stream: [
    { type: 'system', subtype: 'init', session_id: 'stub-session' },
    { type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: 'stub-session', result_index: 0 }
  ],
  exitCode: 0
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
        DECIDINATOR_SIDECAR: env.DECIDINATOR_SIDECAR ?? null
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
  if (scenario.resultFile !== null && typeof scenario.resultFile === 'object' && env.TIERMINATOR_RESULT_FILE) {
    fs.mkdirSync(path.dirname(env.TIERMINATOR_RESULT_FILE), { recursive: true })
    fs.writeFileSync(env.TIERMINATOR_RESULT_FILE, JSON.stringify(scenario.resultFile, null, 2) + '\n')
  }
  setTimeout(() => { process.exitCode = scenario.exitCode ?? 0 }, scenario.delayMs ?? 0)
}

main()
