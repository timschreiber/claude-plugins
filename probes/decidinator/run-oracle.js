// Runs Decidinator's oracle-1 on one WP-04 sample question headlessly, validates its verdict block
// with the WP-03 library, and records the evidence.
//
//   node probes/decidinator/run-oracle.js <clear|human-only|spec-silent>
//
// One `claude -p` session in plan mode, in a temp git repo holding a small fixture project, with
// plugins/decidinator and the WP-01 probe plugin loaded. The probe plugin's hooks record the
// oracle's SubagentStop; collect.js copies the records to probes/evidence/decidinator-probe-oracle-<sample>-*,
// and this script adds -verdict.json. Plan mode gives last_assistant_message and asks no permissions.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { collect } = require('./collect.js')
const { parseVerdict } = require('../../plugins/decidinator/scripts/lib/verdict.js')

const ROOT = path.join(__dirname, '..', '..')
const DECIDINATOR = path.join(ROOT, 'plugins', 'decidinator')
const PROBE_PLUGIN = path.join(__dirname, 'probe-plugin')
const EVIDENCE = path.join(ROOT, 'probes', 'evidence')
const AGENT = 'decidinator:oracle-1'

const FIXTURE = {
  'CLAUDE.md': [
    '# CLAUDE.md',
    '',
    '`tally` is a command-line todo list for Node 20 or later. Read `docs/spec.md` before changing anything.',
    '',
    '- No dependencies, runtime or development: use only Node\'s built-in modules.',
    '- Source is in `src/`, tests in `test/`.',
  ],
  'docs/spec.md': [
    '# tally: specification',
    '',
    '`tally` keeps todo lists in one JSON file, `~/.tally.json`.',
    '',
    '## Commands',
    '',
    '- `tally add <list> <text> [--due YYYY-MM-DD]` adds a todo to a list, creating the list if needed.',
    '- `tally list <list>` prints the list\'s open todos: those with a due date first, earliest due date first, then those without one.',
    '- `tally done <list> <n>` marks the n-th todo of the list done.',
    '',
    '## Plans',
    '',
    'Free accounts may keep a limited number of lists; paid accounts have no limit. The product team sets the limit.',
    '',
    '## Constraints',
    '',
    '- The package has no dependencies, runtime or development. Everything, including the tests, uses only Node\'s built-in modules.',
    '- Tests live in `test/` and run with `npm test`.',
  ],
  'src/list.js': [
    '\'use strict\'',
    '',
    '// Returns the open todos of a list in display order (docs/spec.md, `tally list`).',
    'function openTodos(list) {',
    '  const open = list.todos.filter((t) => !t.done)',
    '  const dated = open.filter((t) => t.due).sort((a, b) => a.due.localeCompare(b.due))',
    '  const undated = open.filter((t) => !t.due)',
    '  return [...dated, ...undated]',
    '}',
    '',
    'module.exports = { openTodos }',
  ],
  'package.json': [
    '{',
    '  "name": "tally",',
    '  "version": "0.1.0",',
    '  "private": true',
    '}',
  ],
  'docs/decisions.md': [
    '<!-- decidinator-log v1 -->',
    '',
    '### D-0001 · Storage format',
    '- **Question:** Should tally store its lists in JSON or SQLite?',
    '- **Answer:** JSON, in one file at ~/.tally.json.',
    '- **Rationale:** No dependencies are allowed, and one small file is enough for personal todo lists.',
    '- **Provenance:** user',
    '- **Confidence:** none',
    '- **Rung:** none',
    '- **Sources:** docs/spec.md',
    '- **Assumptions:** none',
    '- **Question ID:** Q-0001',
    '- **Context:** setup',
    '- **Date:** 2026-09-30',
  ],
  'docs/open-questions.md': ['<!-- decidinator-sidecar v1 -->'],
}

const SAMPLES = {
  clear: {
    id: 'Q-0002',
    question: 'Which test framework should tally\'s tests use?',
    options: [
      'Jest: the most widely used JavaScript test framework',
      'Mocha: a long-established test runner',
      'node:test: the test runner built into Node',
    ],
    context: 'I am adding the first unit tests, for src/list.js, and setting up `npm test`.',
  },
  'human-only': {
    id: 'Q-0003',
    question: 'How many lists should a free account be allowed to keep: 3 or 5?',
    options: ['3 lists: the lower cap', '5 lists: the higher cap'],
    context: 'I am implementing the free-plan list limit in `tally add`.',
  },
  'spec-silent': {
    id: 'Q-0004',
    question: 'When two open todos have the same due date, in what order should `tally list` print them?',
    options: ['Added: in the order they were added', 'Alphabetical: by their text'],
    context: 'I am writing the ordering tests for src/list.js.',
  },
}

const STRIP = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_PLUGIN_ROOT',
  'CLAUDE_PLUGIN_DATA',
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_ENV_FILE',
  'CLAUDE_CODE_SSE_PORT',
  'DECIDINATOR_MODE',
  'DECIDINATOR_CONTEXT',
  'DECIDINATOR_DEBUG',
]

function readJsonLines(file) {
  if (!fs.existsSync(file)) return []
  const out = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // skip unparseable lines
    }
  }
  return out
}

function dispatchPrompt(s) {
  return [
    `Decidinator question ${s.id}`,
    'Rung: 1',
    'Decision log: docs/decisions.md',
    'Sidecar: docs/open-questions.md',
    `Question: ${s.question}`,
    'Options:',
    ...s.options.map((o) => `- ${o}`),
    `Context: ${s.context}`,
  ].join('\n')
}

function mainPrompt(dispatch) {
  return [
    `Call the Agent tool once, with subagent_type "${AGENT}", description "oracle", and as its prompt exactly the text between the BEGIN and END lines below, without those two lines.`,
    'Do not research the question yourself. When the agent has finished, reply with the single word DONE and nothing else.',
    'BEGIN',
    dispatch,
    'END',
  ].join('\n')
}

// The oracle's report, by the spec's recorder rule: last_assistant_message, then the
// SubagentHandback call's message, then the last assistant text in agent_transcript_path.
function findReport(outDir) {
  const stops = readJsonLines(path.join(outDir, 'SubagentStop.jsonl'))
    .map((r) => r.input || {})
    .filter((i) => i.agent_type === AGENT)
  if (stops.length === 0) return { source: null, text: null, stop: null }
  const stop = stops[stops.length - 1]
  if (typeof stop.last_assistant_message === 'string' && stop.last_assistant_message.trim()) {
    return { source: 'last_assistant_message', text: stop.last_assistant_message, stop }
  }
  const handback = readJsonLines(path.join(outDir, 'PreToolUse.jsonl'))
    .map((r) => r.input || {})
    .filter((i) => i.tool_name === 'SubagentHandback' && i.agent_id === stop.agent_id)
    .pop()
  if (handback && handback.tool_input && typeof handback.tool_input.message === 'string') {
    return { source: 'SubagentHandback', text: handback.tool_input.message, stop }
  }
  const texts = readJsonLines(stop.agent_transcript_path || '')
    .filter((l) => l && l.type === 'assistant' && l.message && Array.isArray(l.message.content))
    .map((l) => l.message.content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n'))
    .filter((t) => t.trim())
  if (texts.length) return { source: 'agent_transcript_path', text: texts[texts.length - 1], stop }
  return { source: null, text: null, stop }
}

function transcriptModels(stop) {
  const models = []
  for (const l of readJsonLines((stop && stop.agent_transcript_path) || '')) {
    const m = l && l.message && l.message.model
    if (m && !models.includes(m)) models.push(m)
  }
  return models
}

function main() {
  const argv = process.argv.slice(2)
  const name = argv[0]
  if (argv.length !== 1 || !Object.prototype.hasOwnProperty.call(SAMPLES, name)) {
    console.error('usage: node probes/decidinator/run-oracle.js <' + Object.keys(SAMPLES).join('|') + '>')
    process.exit(2)
  }
  const s = SAMPLES[name]
  const cell = 'oracle-' + name

  const base = path.join(os.tmpdir(), 'decidinator-probe', cell)
  fs.rmSync(base, { recursive: true, force: true })
  const repo = path.join(base, 'repo')
  for (const [rel, lines] of Object.entries(FIXTURE)) {
    const file = path.join(repo, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, lines.join('\n') + '\n')
  }
  spawnSync('git', ['init', '-q'], { cwd: repo })
  const outDir = path.join(base, 'out')

  const dispatch = dispatchPrompt(s)
  const args = [
    '-p', mainPrompt(dispatch),
    '--plugin-dir', DECIDINATOR,
    '--plugin-dir', PROBE_PLUGIN,
    '--output-format', 'json',
    '--permission-mode', 'plan',
    '--model', 'claude-opus-5-5',
  ]

  const env = { ...process.env }
  const stripped = STRIP.filter((n) => n in process.env)
  for (const n of STRIP) delete env[n]
  env.PROBE_RUN = cell
  env.PROBE_OUT = outDir
  env.PROBE_DENY = '0'

  const r = spawnSync('claude', args, { cwd: repo, env, encoding: 'utf8', timeout: 570000 })
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
  collect(cell, outDir, {
    interactive: false,
    args,
    stripped,
    exitCode: r.status,
    result,
    stdout: parsed ? null : stdout,
    stderr: stderr.slice(0, 4000),
  })

  const report = findReport(outDir)
  const pv = parseVerdict(report.text, { questionId: s.id, rung: 1 })
  const v = pv.verdict
  const checks = {
    validBlock: pv.ok,
    citesSource: pv.ok && v.sources.length >= 1,
  }
  if (name === 'human-only') {
    checks.humanOnly = pv.ok && v.kind === 'human-only'
    checks.twoOptionsWithTradeoffs = pv.ok && v.options.length >= 2 && v.options.every((o) => o.tradeoffs.trim() !== '')
  }
  const pass = Object.values(checks).every(Boolean)

  const record = {
    generated: new Date().toISOString(),
    sample: name,
    questionId: s.id,
    dispatch,
    exitCode: r.status,
    reportSource: report.source,
    agentType: report.stop ? report.stop.agent_type ?? null : null,
    effort: report.stop ? report.stop.effort ?? null : null,
    agentModels: transcriptModels(report.stop),
    report: report.text,
    parseReason: pv.ok ? null : pv.reason,
    verdict: pv.ok ? v : null,
    checks,
    pass,
  }
  fs.mkdirSync(EVIDENCE, { recursive: true })
  fs.writeFileSync(path.join(EVIDENCE, `decidinator-probe-${cell}-verdict.json`), JSON.stringify(record, null, 2) + '\n')

  const summary = pv.ok
    ? `kind=${v.kind} status=${v.status} confidence=${v.confidence} flags=${v.flags.join(',') || 'none'} options=${v.options.length} sources=${v.sources.length}`
    : `reason=${pv.reason}`
  console.log(`${name}: ${pass ? 'PASS' : 'FAIL'} exit=${r.status} report=${report.source} ${summary}`)
  process.exit(pass ? 0 : 1)
}

main()
