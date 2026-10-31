// H9: PreToolUse on Bash. A tierminator worker's Bash call that names no timeout gets 10 minutes
// (WORKER_TIMEOUT_MS), so a long Verify step finishes in the foreground instead of being moved to the
// background at the 2-minute default. The call is otherwise unchanged. It never denies, never sets a
// permission decision and never throws; the main session and other agents are left alone.
// Measured in docs/tierminator/tierminator-bash-timeout-findings.md.
'use strict'

const state = require('./lib/state.js')
const { run, readInput, emit } = require('./lib/hook.js')

const WORKER_TIMEOUT_MS = 600000

run(async () => {
  const input = await readInput()
  if (!input?.agent_id || typeof input.agent_type !== 'string' || !input.agent_type.startsWith('tierminator:')) return
  if (input.tool_name !== 'Bash' || !state.isActive(input.session_id)) return
  if (state.read(input.session_id)?.phase !== 'running') return
  const ti = input.tool_input
  if (ti === null || typeof ti !== 'object' || Array.isArray(ti)) return
  if (Number.isFinite(ti.timeout) || ti.run_in_background === true) return
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...ti, timeout: WORKER_TIMEOUT_MS } } })
})
