// H5: keeps the main thread from doing the plan's work itself before the workflow launches.
// Active only while the state is "approved"; it stands down at launch, not at completion,
// because the workflow runs in the background and the main thread is idle meanwhile.
//   pre   PreToolUse Edit|Write|NotebookEdit|Bash|PowerShell: deny main-thread work
//   stop  Stop: block stopping before the launch
// Both give up after a few blocks and mark the state "abandoned", so a stuck session
// cannot loop forever.
'use strict'

const state = require('./lib/state.js')
const { run, readInput, emit } = require('./lib/hook.js')

const MAX_TOOL_DENIALS = 3
const REASON =
  'planandtier: the approved plan has not been launched. Call the Workflow tool with name ' +
  '"planandtier:execute-plan" and no args first. Its tasks run in subagents; do not do the work yourself.'

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  const current = state.read(input.session_id)
  if (!current || current.phase !== 'approved') return

  if (process.argv[2] === 'stop') {
    if (input.stop_hook_active) {
      state.write(input.session_id, { ...current, phase: 'abandoned' })
      return
    }
    emit({ decision: 'block', reason: REASON })
    return
  }

  const denied = (current.guardDenials ?? 0) + 1
  if (denied > MAX_TOOL_DENIALS) {
    state.write(input.session_id, { ...current, phase: 'abandoned' })
    return
  }
  state.write(input.session_id, { ...current, guardDenials: denied })
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: REASON,
    },
  })
})
