// Spike probe hook. One script serves every probe registration; argv[2] is the tag.
// It appends the raw hook stdin to probe.log before doing anything else, then
// emits the tag's probe behavior. It never throws and always exits 0.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const MATRIX = [
  { id: 'T01', title: 'sonnet low', model: 'sonnet', effort: 'low' },
  { id: 'T02', title: 'sonnet high', model: 'sonnet', effort: 'high' },
  { id: 'T03', title: 'haiku low', model: 'haiku', effort: 'low' },
  { id: 'T04', title: 'haiku medium', model: 'haiku', effort: 'medium' },
  { id: 'T05', title: 'haiku high', model: 'haiku', effort: 'high' },
  { id: 'T06', title: 'haiku xhigh', model: 'haiku', effort: 'xhigh' },
  { id: 'T07', title: 'haiku max', model: 'haiku', effort: 'max' },
].map(t => ({
  ...t,
  prompt:
    'Reply with status "done". In summary, state the exact model name you are running as ' +
    'and whether you can call the Agent tool (yes or no).',
}))

// PROBE_MATRIX=pairs swaps in the sonnet/opus x low..xhigh matrix, to check the allowed pairs.
if (process.env.PROBE_MATRIX === 'pairs') {
  MATRIX.length = 0
  for (const model of ['sonnet', 'opus']) {
    for (const effort of ['low', 'medium', 'high', 'xhigh']) {
      MATRIX.push({
        id: `T0${MATRIX.length + 1}`,
        title: `${model} ${effort}`,
        model,
        effort,
        prompt:
          'Reply with status "done". In summary, state the exact model name you are running as ' +
          'and whether you can call the Agent tool (yes or no).',
      })
    }
  }
}

// PROBE_MATRIX=shape-* swaps in one task whose prompt has a given shape, to find which input
// Claude Code rejects at launch ("script contains control characters"). Run by launch-shapes.js.
const SHAPES = {
  'shape-single': 'Reply with status "done" and summary "ok".',
  'shape-multiline': ['Reply with status "done".', 'In summary, write ok.', 'Do nothing else.'].join('\n'),
  'shape-emdash': 'Reply with status "done" — and summary "ok".',
}
if (Object.hasOwn(SHAPES, process.env.PROBE_MATRIX ?? '')) {
  MATRIX.length = 0
  MATRIX.push({
    id: 'T01',
    title: process.env.PROBE_MATRIX.replace('-', ' '),
    model: 'sonnet',
    effort: 'low',
    prompt: SHAPES[process.env.PROBE_MATRIX],
  })
}

const dataDir = process.env.CLAUDE_PLUGIN_DATA || path.join(os.tmpdir(), 'planandtier-probe')

function readStdin() {
  return new Promise(resolve => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(data))
  })
}

function log(record) {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.appendFileSync(path.join(dataDir, 'probe.log'), JSON.stringify(record) + '\n')
}

// Logs the plan file's shape as the dialog will receive it, since the model may not copy a
// shape exactly. Lengths are measured on LF-normalized text.
function measurePlan(planFile) {
  try {
    if (typeof planFile !== 'string') return
    const text = fs.readFileSync(planFile, 'utf8')
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    const heading = lines.find(l => l.startsWith('# Shape ')) ?? null
    log({
      tag: 'pre-exit:measure',
      shape: heading && heading.slice('# Shape '.length).trim(),
      bytes: Buffer.byteLength(text),
      chars: text.length,
      lines: lines.length,
      longestLine: Math.max(...lines.map(l => l.length)),
      fences: lines.filter(l => /^\s{0,3}(```|~~~)/.test(l)).length,
    })
  } catch (e) {
    log({ tag: 'pre-exit:measure', error: String(e) })
  }
}

// Moves the lines between the SIDECAR-START and SIDECAR-END markers to <plan>.sidecar.md and
// leaves one SIDECAR-REPLACED line in their place. Only plans holding SIDECAR-TEST are touched.
function moveSidecarBlock(planFile) {
  try {
    if (typeof planFile !== 'string') return
    const text = fs.readFileSync(planFile, 'utf8')
    if (!text.includes('<!-- SIDECAR-TEST -->')) return
    const start = text.indexOf('<!-- SIDECAR-START -->')
    const end = text.indexOf('<!-- SIDECAR-END -->')
    if (start < 0 || end < start) return
    const bodyStart = text.indexOf('\n', start) + 1
    fs.writeFileSync(planFile + '.sidecar.md', text.slice(bodyStart, end))
    fs.writeFileSync(
      planFile,
      text.slice(0, bodyStart) + 'SIDECAR-REPLACED: a hook moved this block to a sidecar file.\n' + text.slice(end)
    )
    log({ tag: 'pre-exit:sidecar', moved: true, planFile })
  } catch (e) {
    log({ tag: 'pre-exit:sidecar', moved: false, error: String(e) })
  }
}

function emit(hookSpecificOutput) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput }))
}

async function main() {
  const tag = process.argv[2]
  const raw = await readStdin()
  log({ tag, pluginDataSet: Boolean(process.env.CLAUDE_PLUGIN_DATA), stdin: raw })

  let input = {}
  try {
    input = JSON.parse(raw)
  } catch {
    return
  }

  // PROBE_DIALOG=1 is for dialog-shapes-run.md: the probe never denies or injects anything. On
  // ExitPlanMode it moves a marked block out of the plan file into a sidecar, to see whether the
  // approval dialog shows the file as the hook left it.
  if (process.env.PROBE_DIALOG === '1') {
    if (tag === 'pre-exit') {
      measurePlan(input.tool_input?.planFilePath)
      moveSidecarBlock(input.tool_input?.planFilePath)
    }
    return
  }

  // PROBE_OBSERVE=1 makes the probe a pure logger, so it can run beside the real plugin
  // without denying plans, injecting context or rewriting the Workflow call.
  if (process.env.PROBE_OBSERVE === '1') return

  if (tag === 'pre-exit') {
    // P2: deny the first ExitPlanMode of each session, so the log shows whether a deny
    // makes the model revise the plan.
    const sentinel = path.join(dataDir, `p2-denied-${input.session_id || 'unknown'}`)
    if (fs.existsSync(sentinel)) return
    fs.writeFileSync(sentinel, '')
    emit({
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'PROBE-P2: add the line `probe-revised` to the end of the plan, then call ExitPlanMode again.',
    })
  } else if (tag === 'post-exit') {
    // P3, P8: does the first response after approval echo the marker and launch the workflow?
    emit({
      hookEventName: 'PostToolUse',
      additionalContext:
        'PROBE-P3: begin your next message with the word ZEBRA-PLANANDTIER, then launch the ' +
        'saved workflow planandtier-probe:execute-plan with the Workflow tool.',
    })
  } else if (tag === 'pre-wf') {
    // P4, P5: replace args with the P6/P7 matrix. The original input is spread because
    // updatedInput replaces the whole tool input.
    const toolInput = input.tool_input || {}
    if (toolInput.name !== 'planandtier-probe:execute-plan') return
    const updatedInput = { ...toolInput, args: { tasks: MATRIX } }
    log({ tag: 'pre-wf:emitted', pluginDataSet: Boolean(process.env.CLAUDE_PLUGIN_DATA), stdin: JSON.stringify(updatedInput) })
    emit({ hookEventName: 'PreToolUse', updatedInput })
  }
}

main().then(
  () => process.exit(0),
  () => process.exit(0)
)
