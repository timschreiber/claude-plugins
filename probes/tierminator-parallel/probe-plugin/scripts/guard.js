// Worktree guard probe for tierminator parallel execution (option C: tierminator makes the worktrees and
// the workers are not isolated). Registered as a PreToolUse hook on the file, shell and search tools.
// Every call made by a subagent is logged as tag "c-tool" with the decision. In PROBE_GUARD=1 mode a call
// that would reach the main tree is denied through permissionDecision "deny" with a reason the worker can act on.
// PROBE_LOG: the log file. PROBE_WT_ROOT: the directory that holds the slot worktrees (absolute, forward slashes).
// Only calls that carry an agent_id whose agent_type is a "c-" agent (agent_type has the plugin prefix, as in
// "tierminator-parallel-probe:c-haiku-high") are judged; the main session is untouched.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const logFile = process.env.PROBE_LOG || path.join(os.tmpdir(), 'tierminator-parallel-probe', 'probe.log')

function readStdin() {
  return new Promise(resolve => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(data))
  })
}

function log(entry) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true })
    fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n')
  } catch {}
}

const norm = p => String(p ?? '').replace(/\\/g, '/').toLowerCase()
const cut = (v, n = 400) => (typeof v === 'string' && v.length > n ? v.slice(0, n) + '…(' + v.length + ')' : v)

function judge(tool, ti, root) {
  if (tool === 'PowerShell') return { ok: false, reason: 'Use the Bash tool, not PowerShell. Start the command with cd "<your Worktree>" && .' }
  if (tool === 'Bash') {
    const m = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*&&/.exec(ti.command ?? '')
    const target = m ? norm(m[1] ?? m[2] ?? m[3]) : null
    if (target && target.startsWith(root)) return { ok: true }
    return { ok: false, reason: 'Start every Bash command with cd "<your Worktree>" && followed by the command. Your Worktree is the path on the Worktree: line of your message.' }
  }
  if (tool === 'Write' || tool === 'Edit') {
    if (norm(ti.file_path).startsWith(root)) return { ok: true }
    return { ok: false, reason: 'File paths must be absolute and start with your Worktree path (the Worktree: line of your message). That path is in the main tree.' }
  }
  if (tool === 'Glob' || tool === 'Grep') {
    if (ti.path && norm(ti.path).startsWith(root)) return { ok: true }
    return { ok: false, reason: 'Pass path set to your Worktree (the Worktree: line of your message); without it the search runs in the main tree.' }
  }
  return { ok: true }
}

async function main() {
  const raw = await readStdin()
  let input = {}
  try {
    input = JSON.parse(raw)
  } catch {
    return
  }
  if (!input.agent_id || !/(^|:)c-/.test(String(input.agent_type ?? ''))) return

  const root = norm(process.env.PROBE_WT_ROOT)
  const ti = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {}
  const verdict = judge(input.tool_name, ti, root)
  const guard = process.env.PROBE_GUARD === '1'
  log({
    tag: 'c-tool',
    agent_id: input.agent_id,
    agent_type: input.agent_type,
    tool: input.tool_name,
    input: { command: cut(ti.command), file_path: ti.file_path, path: ti.path, pattern: cut(ti.pattern, 120) },
    compliant: verdict.ok,
    denied: guard && !verdict.ok,
  })
  if (guard && !verdict.ok) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: verdict.reason },
      })
    )
  }
}

main().catch(() => {}).finally(() => {
  process.exitCode = 0
})
