// The Decidinator and models cells (V6, V8, V9) for the Grindinator WP-01 probe. See probes/grindinator/README.md, 'Cells'.
'use strict'

const fs = require('fs')
const path = require('path')
const lib = require('./lib')
const { BASIC } = require('./cells-api.js')

const { parseVerdict } = require(path.join(lib.ROOT, 'plugins/decidinator/scripts/lib/verdict.js'))

const AGENT = 'decidinator:oracle-1'

const DOCS = {
  ...BASIC,
  'docs/spec.md': '# Probe spec\n\nThe project targets Node 20. Unit tests use node:test, the runner built into Node.\n',
}

const DISPATCH = [
  'Decidinator question Q-0001',
  'Rung: 1',
  'Decision log: docs/decisions.md',
  'Sidecar: docs/open-questions.md',
  "Question: Which test runner should the probe project's unit tests use?",
  'Options:',
  '- node:test: the runner built into Node',
  '- Jest: a third-party runner',
  'Context: I am adding the first unit test to the probe project.',
].join('\n')

// Same text as mainPrompt in probes/decidinator/run-oracle.js.
function mainPrompt(dispatch) {
  return [
    `Call the Agent tool once, with subagent_type "${AGENT}", description "oracle", and as its prompt exactly the text between the BEGIN and END lines below, without those two lines.`,
    'Do not research the question yourself. When the agent has finished, reply with the single word DONE and nothing else.',
    'BEGIN',
    dispatch,
    'END',
  ].join('\n')
}

const MODEL_AGENTS = [
  'grindinator-probe:rung-1',
  'grindinator-probe:rung-2',
  'grindinator-probe:rung-3',
  'grindinator-probe:worker-sonnet',
  'grindinator-probe:worker-opus',
]

const MODELS_PROMPT =
  `Call the Agent tool five times, one call at a time, with these subagent_type values in order: ${MODEL_AGENTS.join(', ')}. ` +
  'For each call use the description probe and the prompt: Report your model. ' +
  'Then call ToolSearch with the query select:WebSearch, then call WebSearch with the query node:test runner. ' +
  'Finally reply with one line per agent, copying its reply, and then the line WEBSEARCH: OK if the search returned results, else WEBSEARCH: NOT-AVAILABLE.'

const DECIDE_ENV = {
  DECIDINATOR_MODE: 'sidecar',
  DECIDINATOR_CONTEXT: 'WP-PROBE',
  PROBE_ARMED_CHECK: '1',
}

// findReport's rule over ctx.records: last_assistant_message, then the SubagentHandback
// PreToolUse message for the same agent_id, then the last assistant text in agent_transcript_path.
function findReport(records) {
  const stops = records
    .filter(r => r.event === 'SubagentStop')
    .map(r => r.input || {})
    .filter(i => i.agent_type === AGENT)
  if (stops.length === 0) return { source: null, text: null }
  const stop = stops[stops.length - 1]
  if (typeof stop.last_assistant_message === 'string' && stop.last_assistant_message.trim()) {
    return { source: 'last_assistant_message', text: stop.last_assistant_message }
  }
  const handback = records
    .filter(r => r.event === 'PreToolUse')
    .map(r => r.input || {})
    .filter(i => i.tool_name === 'SubagentHandback' && i.agent_id === stop.agent_id)
    .pop()
  if (handback && handback.tool_input && typeof handback.tool_input.message === 'string') {
    return { source: 'SubagentHandback', text: handback.tool_input.message }
  }
  const texts = lib
    .readJsonLines(stop.agent_transcript_path || '')
    .filter(l => l && l.type === 'assistant' && l.message && Array.isArray(l.message.content))
    .map(l => l.message.content.filter(c => c && c.type === 'text').map(c => c.text).join('\n'))
    .filter(t => t.trim())
  if (texts.length) return { source: 'agent_transcript_path', text: texts[texts.length - 1] }
  return { source: null, text: null }
}

function fileHead(cwd, rel) {
  const file = path.join(cwd, rel)
  if (!fs.existsSync(file)) return { exists: false, head: null }
  return { exists: true, head: fs.readFileSync(file, 'utf8').slice(0, 1000) }
}

function decideCell({ items, flags }) {
  return {
    items,
    setup(base) {
      const cwd = path.join(base, 'repo')
      lib.makeRepo(cwd, DOCS)
      return {
        cwd,
        prompt: mainPrompt(DISPATCH),
        flags,
        plugins: ['decidinator', 'probe'],
        env: { ...DECIDE_ENV },
        mock: null,
        timeoutMs: 540000,
      }
    },
    analyze(ctx) {
      const pv = parseVerdict(findReport(ctx.records).text, { questionId: 'Q-0001', rung: 1 })
      const report = findReport(ctx.records)
      const verdict = { ok: pv.ok, reason: pv.ok ? null : pv.reason }
      if (pv.ok) {
        verdict.kind = pv.verdict.kind
        verdict.status = pv.verdict.status
        verdict.confidence = pv.verdict.confidence
      }
      const row = ctx.agents.find(a => a.agent_type === AGENT)
      return {
        armed: ctx.records.filter(r => r.event === 'ArmedCheck').map(r => r.found),
        armedMessageInStream: String(ctx.run.stdout).includes('decidinator: armed'),
        oracleDispatches: ctx.records.filter(
          r =>
            r.event === 'PreToolUse' &&
            r.input &&
            !r.input.agent_id &&
            r.input.tool_name === 'Agent' &&
            r.input.tool_input &&
            r.input.tool_input.subagent_type === AGENT,
        ),
        report: { source: report.source, text: report.text },
        verdict,
        oracle: row ? { effort: row.effort, models: row.models, resolvedModel: row.resolvedModel } : null,
        decisionLog: fileHead(ctx.cwd, 'docs/decisions.md'),
        sidecar: fileHead(ctx.cwd, 'docs/open-questions.md'),
        status: ctx.git ? ctx.git.status : null,
      }
    },
  }
}

const cells = {
  'decide-sidecar': decideCell({
    items: ['V6', 'V8'],
    flags: [
      '--model', 'sonnet',
      '--effort', 'low',
      '--permission-mode', 'acceptEdits',
      '--allowedTools', 'WebFetch', 'WebSearch', 'Bash(gh search:*)', 'Bash(gh api:*)',
    ],
  }),
  'decide-strict': decideCell({
    items: ['V8'],
    flags: ['--model', 'sonnet', '--effort', 'low', '--permission-mode', 'acceptEdits'],
  }),
  models: {
    items: ['V6', 'V9'],
    setup(base) {
      const cwd = path.join(base, 'repo')
      lib.makeRepo(cwd, BASIC)
      return {
        cwd,
        prompt: MODELS_PROMPT,
        flags: ['--model', 'sonnet', '--effort', 'low', '--permission-mode', 'acceptEdits', '--allowedTools', 'WebSearch'],
        plugins: ['probe'],
        env: {},
        mock: null,
        timeoutMs: 540000,
      }
    },
    analyze(ctx) {
      const agents = {}
      for (const type of MODEL_AGENTS) {
        const row = ctx.agents.find(a => a.agent_type === type)
        let said = null
        if (row && typeof row.last_assistant_message === 'string') {
          said = row.last_assistant_message.split(/\r?\n/).find(l => l.startsWith('MODEL:')) ?? null
        }
        agents[type] = {
          effort: row ? row.effort : null,
          models: row ? row.models : null,
          resolvedModel: row ? row.resolvedModel : null,
          said,
        }
      }
      const resultText = (ctx.summary.result && ctx.summary.result.result) || ''
      return {
        agents,
        webSearch: {
          called: ctx.records.some(r => r.event === 'PostToolUse' && r.input && r.input.tool_name === 'WebSearch'),
          reported: String(resultText).includes('WEBSEARCH: OK'),
        },
      }
    },
  },
}

module.exports = cells
