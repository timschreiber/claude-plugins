// Probes what the tierminator redesign relies on when a user runs
// claude -p "/tierminator:plan <request>": the hook sees the raw typed text and a
// CLAUDE_CODE_ENTRYPOINT starting 'sdk', $ARGUMENTS expands, additionalContext reaches the model.
//
//   node probes/tierminator/headless-probe.js
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const PLUGIN = path.join(__dirname, 'headless-probe')
const EVIDENCE = path.join(ROOT, 'probes', 'evidence')
const LOG = path.join(EVIDENCE, 'tierminator-headless-probe-hooks.jsonl')
const OUT = path.join(EVIDENCE, 'tierminator-headless-probe-output.json')
const RESULTS = path.join(EVIDENCE, 'tierminator-headless-probe-results.json')
const PROMPT = '/tierminator-headless-probe:plan add a --verbose flag'

const STRIP = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_PLUGIN_ROOT',
  'CLAUDE_PLUGIN_DATA',
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_ENV_FILE',
  'CLAUDE_CODE_SSE_PORT',
]

const shell = process.platform === 'win32'

function q(a) {
  return shell ? '"' + String(a).replace(/"/g, '\\"') + '"' : a
}

function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true })
  fs.rmSync(LOG, { force: true })

  const env = { ...process.env }
  for (const n of STRIP) delete env[n]
  env.PROBE_LOG = LOG

  const args = ['-p', PROMPT, '--plugin-dir', PLUGIN, '--model', 'sonnet', '--output-format', 'json']
  const r = spawnSync('claude', shell ? args.map(q) : args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    timeout: 540000,
    shell,
  })
  const stdout = r.stdout ?? ''
  fs.writeFileSync(OUT, stdout)
  if (r.stderr) console.error(r.stderr.slice(0, 2000))

  let text = ''
  try {
    text = String(JSON.parse(stdout).result ?? '')
  } catch {
    text = stdout
  }

  let first = {}
  try {
    first = JSON.parse(fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean)[0])
  } catch {
    // no hook line
  }

  const v = spawnSync('claude', ['--version'], { encoding: 'utf8', shell })
  const results = {
    date: new Date().toISOString(),
    claudeVersion: (v.stdout ?? '').trim(),
    entrypoint: first.entrypoint ?? null,
    rawPrompt: first.prompt ?? null,
    argsSeen: text.includes('ARGS=[add a --verbose flag]'),
    tokenSeen: text.includes('TOKEN=PROBE-7731'),
  }
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 2) + '\n')
  console.log(JSON.stringify(results, null, 2))

  const ok =
    typeof results.entrypoint === 'string' &&
    results.entrypoint.startsWith('sdk') &&
    typeof results.rawPrompt === 'string' &&
    results.rawPrompt.startsWith(PROMPT) &&
    results.argsSeen &&
    results.tokenSeen
  process.exit(ok ? 0 : 1)
}

main()
