// Runs one Decidinator WP-01 probe cell headlessly and collects its evidence.
//
//   node probes/decidinator/run-headless.js <cell>
//   node probes/decidinator/run-headless.js --prompt <research|deny|model|model-sonnet>
//
// One `claude -p` session in a temp git repo with probes/decidinator/probe-plugin loaded.
// The hook records land in a temp out dir, then collect.js copies them into probes/evidence/.
// stdout and stderr are kept apart.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { collect } = require('./collect.js')

const PLUGIN = path.join(__dirname, 'probe-plugin')

const PROMPTS = {
  research: [
    'Call the Agent tool once, with subagent_type "decidinator-probe:researcher", description "probe", and prompt "Run the probe."',
    'When the agent has finished, reply with its report verbatim and nothing else.',
  ].join('\n'),
  model: [
    'Call the Agent tool once, with subagent_type "decidinator-probe:model-probe", description "probe", and prompt "Run the probe."',
    'When the agent has finished, reply with its report verbatim and nothing else.',
  ].join('\n'),
  'model-sonnet': [
    'Call the Agent tool once, with subagent_type "decidinator-probe:model-probe-sonnet", description "probe", and prompt "Run the probe."',
    'When the agent has finished, reply with its report verbatim and nothing else.',
  ].join('\n'),
  deny: [
    'Do these two steps in order, then reply.',
    '1. Call the Read tool on README.md.',
    '2. Call the AskUserQuestion tool with one question, "Which color should the probe use?", header "Color", options "Red" and "Blue".',
    'If a hook denies a call, do not retry it and do not work around it.',
    'Then reply with exactly two lines: "Read: " followed by ALLOWED, or DENIED and the full denial reason verbatim; and "AskUserQuestion: " followed by the same, or NOT-AVAILABLE if you have no such tool.',
  ].join('\n'),
}

const CELLS = {
  'normal-default': { plan: false, allowed: false, deny: false, prompt: 'research' },
  'plan-default': { plan: true, allowed: false, deny: false, prompt: 'research' },
  'normal-allowed': { plan: false, allowed: true, deny: false, prompt: 'research' },
  'plan-allowed': { plan: true, allowed: true, deny: false, prompt: 'research' },
  'deny-normal': { plan: false, allowed: false, deny: true, prompt: 'deny' },
  'deny-plan': { plan: true, allowed: false, deny: true, prompt: 'deny' },
  model: { plan: false, allowed: false, deny: false, prompt: 'model' },
  'model-plan': { plan: true, allowed: false, deny: false, prompt: 'model' },
  'model-sonnet': { plan: false, allowed: false, deny: false, prompt: 'model-sonnet' },
  'model-sonnet-plan': { plan: true, allowed: false, deny: false, prompt: 'model-sonnet' },
}

const STRIP = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_PLUGIN_ROOT',
  'CLAUDE_PLUGIN_DATA',
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_ENV_FILE',
  'CLAUDE_CODE_SSE_PORT',
]

function usage() {
  console.error('usage: node probes/decidinator/run-headless.js <cell>')
  console.error('       node probes/decidinator/run-headless.js --prompt <' + Object.keys(PROMPTS).join('|') + '>')
  console.error('cells: ' + Object.keys(CELLS).join(', '))
}

function main() {
  const argv = process.argv.slice(2)
  if (argv[0] === '--prompt') {
    if (argv.length !== 2 || !Object.prototype.hasOwnProperty.call(PROMPTS, argv[1])) {
      usage()
      process.exit(2)
    }
    console.log(PROMPTS[argv[1]])
    process.exit(0)
  }
  const cell = argv[0]
  if (argv.length !== 1 || !Object.prototype.hasOwnProperty.call(CELLS, cell)) {
    usage()
    process.exit(2)
  }
  const c = CELLS[cell]

  const base = path.join(os.tmpdir(), 'decidinator-probe', cell)
  fs.rmSync(base, { recursive: true, force: true })
  const repo = path.join(base, 'repo')
  fs.mkdirSync(repo, { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: repo })
  fs.writeFileSync(path.join(repo, 'README.md'), '# Probe repo\n')
  const outDir = path.join(base, 'out')

  const args = ['-p', PROMPTS[c.prompt], '--plugin-dir', PLUGIN, '--output-format', 'json']
  if (c.plan) args.push('--permission-mode', 'plan')
  if (c.allowed) args.push('--allowedTools', 'WebFetch,WebSearch,Bash(gh search:*)')

  const env = { ...process.env }
  const stripped = STRIP.filter(n => n in process.env)
  for (const n of STRIP) delete env[n]
  env.PROBE_RUN = cell
  env.PROBE_OUT = outDir
  env.PROBE_DENY = c.deny ? '1' : '0'

  const r = spawnSync('claude', args, { cwd: repo, env, encoding: 'utf8', timeout: 540000 })
  const stdout = r.stdout ?? ''
  const stderr = (r.stderr ?? '') + (r.error ? `\n[spawn error] ${r.error.message}` : '')
  let result = null
  let parsed = false
  try {
    result = JSON.parse(stdout).result ?? null
    parsed = true
  } catch {
    // leave result null
  }

  const n = collect(cell, outDir, {
    interactive: false,
    args,
    stripped,
    exitCode: r.status,
    result,
    stdout: parsed ? null : stdout,
    stderr: stderr.slice(0, 4000),
  })
  process.exit(r.status !== 0 || n === 0 ? 1 : 0)
}

main()
