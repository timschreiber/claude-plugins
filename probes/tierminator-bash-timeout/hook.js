// Probe hook of tierminator-bash-timeout. Question: can a PreToolUse hook give a Bash call a timeout through
// updatedInput alone, and does that reach a subagent?
// argv[2] = role: timeout | rewrite | deny | log
//   timeout  PreToolUse: for a Bash command holding PROBE_TIMEOUT, return updatedInput with timeout 3000 and nothing else
//   rewrite  PreToolUse: for the same command, return updatedInput with the command prefixed by 'echo REWRITTEN; '
//   deny     PreToolUse: for the same command, return permissionDecision deny with the reason PROBE_DENY
//   log      PostToolUse: record what the tool saw
// Every call is logged to PROBE_LOG so the run shows which hooks fired, for whom, and what input they saw.
'use strict'
const fs = require('fs')
const role = process.argv[2]
let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', c => (raw += c))
process.stdin.on('end', () => {
  try {
    let i
    try { i = JSON.parse(raw) } catch { return }
    const cmd = String(i.tool_input?.command ?? '')
    const mine = i.tool_name === 'Bash' && cmd.includes('PROBE_TIMEOUT')
    if (mine && process.env.PROBE_LOG) {
      const resp = typeof i.tool_response === 'string' ? i.tool_response : JSON.stringify(i.tool_response ?? '')
      fs.appendFileSync(process.env.PROBE_LOG, JSON.stringify({
        role, event: i.hook_event_name, agent_id: i.agent_id ?? null, agent_type: i.agent_type ?? null,
        session_id: i.session_id ?? null, permission_mode: i.permission_mode ?? null,
        timeout: i.tool_input?.timeout ?? null, cmdHead: cmd.slice(0, 40), resp: role === 'log' ? resp.slice(0, 160) : undefined,
      }) + '\n')
    }
    if (!mine) return
    if (role === 'timeout') {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...i.tool_input, timeout: 3000 } } }))
    } else if (role === 'rewrite') {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...i.tool_input, command: 'echo REWRITTEN; ' + cmd } } }))
    } else if (role === 'deny') {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'PROBE_DENY' } }))
    }
  } catch {}
})
