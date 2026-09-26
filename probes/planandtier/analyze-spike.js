// Turns the spike plugin's probe.log into probes/evidence/planandtier-spike-results.json.
//
//   node probes/planandtier/analyze-spike.js <probe.log> [observations.json] [output-file-name]
//
// Facts the hooks can see (P1, P2, P4, and parts of P3/P5/P6) are judged from the log.
// Facts only a human can see (whether the model echoed the marker, what /workflows
// reports per task) come from observations.json, which commands.md describes.
// A probe with neither is reported "needs-observation", never guessed.
'use strict'

const fs = require('fs')
const path = require('path')

const [logPath, obsPath] = process.argv.slice(2)
if (!logPath) {
  console.error('usage: node analyze-spike.js <probe.log> [observations.json]')
  process.exit(2)
}

const records = fs
  .readFileSync(logPath, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(line => JSON.parse(line))
  .map(r => {
    let input = null
    try {
      input = JSON.parse(r.stdin)
    } catch {}
    return { tag: r.tag, pluginDataSet: r.pluginDataSet, raw: r.stdin, input }
  })
const obs = obsPath ? JSON.parse(fs.readFileSync(obsPath, 'utf8')) : {}

const byTag = tag => records.filter(r => r.tag === tag)
const keys = r => (r?.input ? Object.keys(r.input).sort() : null)
const toolInputKeys = r => (r?.input?.tool_input ? Object.keys(r.input.tool_input).sort() : null)

const results = {}

// P1: permission_mode is present on UserPromptSubmit, and correct in and out of plan mode.
const ups = byTag('ups')
const modes = [...new Set(ups.map(r => r.input?.permission_mode))]
results.P1 = {
  verdict: modes.includes('plan') && modes.some(m => m && m !== 'plan') ? 'pass' : 'fail',
  detail: 'permission_mode values seen on UserPromptSubmit (undefined = field absent)',
  modesSeen: modes.map(m => m ?? null),
  recordCount: ups.length,
  stdinKeys: keys(ups[0]),
}

// P2: PreToolUse and PostToolUse both fire for ExitPlanMode, plan text is present, and the
// deny made the model revise (a second PreToolUse whose plan contains the requested line).
const preExit = byTag('pre-exit')
const postExit = byTag('post-exit')
const planOf = r => r?.input?.tool_input?.plan
const planFileOf = r => r?.input?.tool_input?.planFilePath
// tool_input.plan can be stale: the model may edit the plan file after a deny and resend the
// old text. The file at planFilePath is the authoritative copy.
const lastPre = preExit[preExit.length - 1]
let revisedInFile = null
try {
  revisedInFile = fs.readFileSync(planFileOf(lastPre), 'utf8').includes('probe-revised')
} catch {}
results.P2 = {
  verdict:
    preExit.length === 0 && postExit.length === 0
      ? 'needs-observation' // ExitPlanMode never ran; headless (-p) sessions do not expose it
      : preExit.length >= 2 && postExit.length >= 1 && typeof planOf(preExit[0]) === 'string' &&
          (revisedInFile || String(planOf(lastPre)).includes('probe-revised'))
        ? 'pass'
        : 'fail',
  revisedInFile,
  revisedInLastPlanParam: String(planOf(lastPre)).includes('probe-revised'),
  planFilePath: planFileOf(preExit[0]) ?? null,
  detail: 'expects >=2 pre-exit (deny, then revised), >=1 post-exit, plan text in tool_input.plan',
  preExitCount: preExit.length,
  postExitCount: postExit.length,
  permissionRequestCount: byTag('perm-exit').length,
  planFieldPresent: preExit.map(r => typeof planOf(r) === 'string'),
  preExitToolInputKeys: toolInputKeys(preExit[0]),
  revisedPlanContainsLine: preExit.map(r => String(planOf(r)).includes('probe-revised')),
}

// P3: the hook side is only "post-exit fired"; the marker echo is a human observation.
results.P3 = {
  verdict: obs.P3_marker_echoed === undefined ? 'needs-observation' : obs.P3_marker_echoed ? 'pass' : 'fail',
  detail: 'observations.P3_marker_echoed: did the first response after approval begin with ZEBRA-PLANANDTIER',
  postExitFired: postExit.length > 0,
}

// P4: PreToolUse fires for Workflow; the log shows the input field names.
const preWf = byTag('pre-wf')
results.P4 = {
  verdict: preWf.length > 0 ? 'pass' : 'fail',
  detail: 'tool_input field names the Workflow call carried',
  preWfCount: preWf.length,
  toolInputKeys: toolInputKeys(preWf[0]),
  toolName: preWf[0]?.input?.tool_name ?? null,
  emitted: byTag('pre-wf:emitted').length > 0,
}

// P5: hook-supplied args reach the script as an object. The script returns argsType; the
// PostToolUse record may carry it, otherwise it comes from /workflows via observations.
const postWf = byTag('post-wf')
const argsTypeInLog = postWf.map(r => /argsType\W+(object|string|undefined)/.exec(r.raw)?.[1]).find(Boolean)
const argsType = argsTypeInLog ?? obs.P5_args_typeof
results.P5 = {
  verdict: argsType === undefined ? 'needs-observation' : argsType === 'object' ? 'pass' : 'fail',
  detail: 'typeof args inside the script (from the post-wf record, else observations.P5_args_typeof)',
  argsType: argsType ?? null,
  postWfCount: postWf.length,
  postWfFailCount: byTag('post-wf-fail').length,
}

// P6, P7: per-call effort applied? Subagent hook records are logged raw for whatever
// model/effort fields they carry; the authoritative reading is /workflows, via observations.
// SubagentStop carries `effort: {level}` and `agent_type`. The matrix runs serially, so the
// nth stop record is task Tn. Effort absent from a record is reported as "none".
const ids = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07']
const expected = {
  T01: 'low', T02: 'high', T03: 'low', T04: 'medium', T05: 'high', T06: 'xhigh', T07: 'max',
}
// Interactive sessions also log SubagentStop records with no agent_type; only the
// workflow's workers count.
const stops = byTag('sub-stop').filter(r => String(r.input?.agent_type).endsWith(':worker'))
const reported = {}
ids.forEach((id, i) => {
  const stop = stops[i]?.input
  if (stop) reported[id] = stop.effort?.level ?? 'none'
  else if (obs.reported?.[id] !== undefined) reported[id] = obs.reported[id]
})
const sessionEffort = byTag('post-wf')[0]?.input?.effort?.level ?? byTag('pre-wf')[0]?.input?.effort?.level ?? null
const workerType = [...new Set(stops.map(r => r.input?.agent_type))]
results.P6 = {
  verdict: ['T01', 'T02'].some(id => reported[id] === undefined)
    ? 'needs-observation'
    : ['T01', 'T02'].every(id => reported[id] === expected[id])
      ? 'pass'
      : 'fail',
  detail:
    'effort recorded on SubagentStop for the sonnet tasks; session effort is the value they would inherit if per-call effort were ignored',
  reported: { T01: reported.T01 ?? null, T02: reported.T02 ?? null },
  sessionEffort,
  agentTypesSeen: workerType,
  subagentStartCount: byTag('sub-start').length,
  subagentStopCount: stops.length,
}
const haikuIds = ['T03', 'T04', 'T05', 'T06', 'T07']
const haikuReported = haikuIds.map(id => reported[id])
results.P7 = {
  verdict: haikuReported.some(v => v === undefined)
    ? 'needs-observation'
    : haikuIds.every(id => reported[id] === expected[id])
      ? 'pass'
      : haikuReported.every(v => v === 'none')
        ? 'ignored'
        : 'mismatch',
  detail:
    'effort recorded on SubagentStop for each haiku task. pass = applied; ignored = accepted without error but never reported; mismatch = reported values differ from requested',
  reported: Object.fromEntries(haikuIds.map(id => [id, reported[id] ?? null])),
  expected: Object.fromEntries(haikuIds.map(id => [id, expected[id]])),
  allStatusDone: obs.P7_all_tasks_done ?? null,
}

// P8: with only H3-style context and no typed command, the model launched the workflow.
results.P8 = {
  verdict:
    !postExit.length
      ? 'needs-observation' // no approval happened, so nothing could have launched the workflow
      : !preWf.length
        ? 'fail'
        : obs.P8_typed_a_command_or_prompted === undefined
        ? 'needs-observation'
        : obs.P8_typed_a_command_or_prompted
          ? 'fail'
          : 'pass',
  detail: 'workflow launched after post-exit with no user command; observations.P8_typed_a_command_or_prompted',
  launchedAfterApproval: postExit.length > 0 && preWf.length > 0,
}

const out = {
  generated: obs.generated ?? null,
  claudeCodeVersion: obs.claudeCodeVersion ?? null,
  logPath: path.basename(logPath),
  recordCount: records.length,
  pluginDataSet: records.some(r => r.pluginDataSet),
  results,
  records: records.map(r => ({ tag: r.tag, input: r.input ?? r.raw })),
}

const dest = path.join(__dirname, '..', 'evidence', process.argv[4] ?? 'planandtier-spike-results.json')
fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n')
console.log(`wrote ${path.relative(process.cwd(), dest)} (${records.length} records)`)
for (const [p, r] of Object.entries(results)) console.log(`${p}: ${r.verdict}`)
