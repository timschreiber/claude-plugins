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
        'saved workflow planandtier:execute-plan with the Workflow tool.',
    })
  } else if (tag === 'pre-wf') {
    // P4, P5: replace args with the P6/P7 matrix. The original input is spread because
    // updatedInput replaces the whole tool input.
    const toolInput = input.tool_input || {}
    if (!JSON.stringify(toolInput).includes('execute-plan')) return
    const updatedInput = { ...toolInput, args: { tasks: MATRIX } }
    log({ tag: 'pre-wf:emitted', pluginDataSet: Boolean(process.env.CLAUDE_PLUGIN_DATA), stdin: JSON.stringify(updatedInput) })
    emit({ hookEventName: 'PreToolUse', updatedInput })
  }
}

main().then(
  () => process.exit(0),
  () => process.exit(0)
)
