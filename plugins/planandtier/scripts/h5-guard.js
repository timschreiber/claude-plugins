// H5: keeps the main thread dispatching while a run is in progress, instead of doing the tasks'
// work itself or stopping halfway.
//   pre   PreToolUse Edit|Write|NotebookEdit: deny main-thread file edits. Shell commands are not
//         guarded; H4 refuses the next dispatch if they left the tree dirty.
//   stop  Stop: block stopping while a task is due to be dispatched.
// Both give up after a few blocks and mark the run "abandoned", so a stuck session cannot loop
// forever. Workers are subagents, which every hook ignores.
'use strict'

const state = require('./lib/state.js')
const { dispatchText } = require('./lib/run.js')
const { run, readInput, emit } = require('./lib/hook.js')

const MAX_TOOL_DENIALS = 3
const REASON = s =>
  'planandtier: a run of the approved plan is in progress. Its tasks are done by subagents; do not do ' +
  `the work yourself. ${dispatchText(s)}`

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id || !state.isArmed(input.session_id)) return
  const current = state.read(input.session_id)
  if (!current || current.phase !== 'running' || current.current?.inFlight) return

  if (process.argv[2] === 'stop') {
    if (input.stop_hook_active) {
      state.write(input.session_id, { ...current, phase: 'abandoned' })
      return
    }
    // A notice H4 left (what the last attempt did, and the next dispatch) says more than the bare
    // dispatch; once given here it is not repeated.
    if (current.notice) state.write(input.session_id, { ...current, notice: null })
    emit({ decision: 'block', reason: current.notice ?? REASON(current) })
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
      permissionDecisionReason: REASON(current),
    },
  })
})
