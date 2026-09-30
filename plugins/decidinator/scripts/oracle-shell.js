// PreToolUse hook on Bash, PowerShell and Monitor: a configured rung agent (an oracle) may run only one
// read-only gh command per shell call (lib/shell-allowlist.js), and may not use Monitor. Calls from the
// main thread and from other subagents are left alone, and an allowed call gets no output, so its
// permission prompt still applies.
'use strict'

const { runArmed, deny } = require('./lib/hook.js')
const config = require('./lib/config.js')
const reasons = require('./lib/reasons.js')
const { check } = require('./lib/shell-allowlist.js')

const SHELLS = ['Bash', 'PowerShell']

runArmed(async input => {
  if (!input.agent_id) return
  const cfg = config.forInput(input).config
  if (!cfg.rungs.includes(input.agent_type)) return
  if (input.tool_name === 'Monitor') {
    deny(reasons.ORACLE_MONITOR)
    return
  }
  if (!SHELLS.includes(input.tool_name)) return
  const problem = check(input.tool_input?.command)
  if (problem) deny(reasons.oracleShell(problem))
})
