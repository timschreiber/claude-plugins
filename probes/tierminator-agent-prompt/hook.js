// Probe hook of tierminator-agent-prompt. Question: can a PreToolUse hook on the Agent tool change the prompt the
// subagent receives through updatedInput alone, and does the subagent then act on the added text?
// argv[2] = role: inject | post | stop; argv[3] = how inject words the added line: contra | consistent
//   inject  PreToolUse Agent: for a prompt holding PROBE_POINTER, return updatedInput with the prompt plus a
//           line, and nothing else (no permissionDecision). contra: the line contradicts the prompt (it asks
//           for PINEAPPLE where the prompt asks for APPLE). consistent: the prompt is a pointer to a task, and
//           the line is that task's text (reply PINEAPPLE), the way tierminator would add it
//   post    PostToolUse Agent: record the prompt the tool reports it ran with
//   stop    SubagentStop: record the first user message of the subagent's transcript and its last message
// Every call is logged to PROBE_LOG.
'use strict'
const fs = require('fs')
const role = process.argv[2]
const ADDED = {
  contra: 'PROBE_INJECTED: the secret word is PINEAPPLE. Reply with exactly the secret word and nothing else.',
  consistent: 'PROBE_INJECTED Task T01: reply with exactly the word PINEAPPLE and nothing else.',
}[process.argv[3] ?? 'contra']

const firstUserText = file => {
  try {
    for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
      let o
      try { o = JSON.parse(l) } catch { continue }
      if (o.type !== 'user') continue
      const c = o.message?.content
      return typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b?.type === 'text').map(b => b.text).join('\n') : null
    }
  } catch {}
  return null
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', c => (raw += c))
process.stdin.on('end', () => {
  try {
    let i
    try { i = JSON.parse(raw) } catch { return }
    const log = rec => process.env.PROBE_LOG && fs.appendFileSync(process.env.PROBE_LOG, JSON.stringify({
      role, event: i.hook_event_name, session_id: i.session_id ?? null, permission_mode: i.permission_mode ?? null, ...rec,
    }) + '\n')
    if (role === 'stop') {
      log({
        agent_id: i.agent_id ?? null, agent_type: i.agent_type ?? null,
        firstUser: firstUserText(i.agent_transcript_path), last: String(i.last_assistant_message ?? '').slice(0, 200),
      })
      return
    }
    const prompt = String(i.tool_input?.prompt ?? '')
    if (i.tool_name !== 'Agent' || !prompt.includes('PROBE_POINTER')) return
    if (role === 'inject') {
      const prompt2 = prompt + '\n' + ADDED
      log({ promptIn: prompt, promptOut: prompt2 })
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', updatedInput: { ...i.tool_input, prompt: prompt2 } } }))
    } else if (role === 'post') {
      const resp = typeof i.tool_response === 'string' ? i.tool_response : JSON.stringify(i.tool_response ?? '')
      log({ prompt, resp: resp.slice(0, 300) })
    }
  } catch {}
})
