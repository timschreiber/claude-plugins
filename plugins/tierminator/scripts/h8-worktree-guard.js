// H8: PreToolUse on Bash, PowerShell, Write, Edit, Glob and Grep. Judges tierminator workers while a
// wave works: a worker must run commands, write files and search inside a tierminator worktree of this
// run, not in the main tree. It judges by path prefix only, so it cannot tell one slot's worktree from
// another's. It only ever denies and never rewrites a tool input; everything else prints nothing.
'use strict'

const path = require('path')
const state = require('./lib/state.js')
const git = require('./lib/git.js')
const { run, readInput, emit } = require('./lib/hook.js')

const deny = reason =>
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })

run(async () => {
  const input = await readInput()
  if (!input?.agent_id || typeof input.agent_type !== 'string' || !input.agent_type.startsWith('tierminator:')) return
  if (!state.isActive(input.session_id)) return
  const s = state.read(input.session_id)
  if (!(s?.phase === 'running' && s.wave?.phase === 'working')) return
  const first = Object.values(s.wave.slots).find(x => x.worktree)?.worktree
  if (!first) return
  const norm = p => (git.toWorktreePath(String(p ?? '')) ?? '').toLowerCase()
  const root = norm(path.posix.dirname(first)) + '/tierminator-' + s.runId + '-'
  const ti = input.tool_input !== null && typeof input.tool_input === 'object' ? input.tool_input : {}
  let reason = null
  switch (input.tool_name) {
    case 'PowerShell':
      reason = 'Use the Bash tool, not PowerShell. Start the command with cd "<your Worktree>" && .'
      break
    case 'Bash': {
      const m = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*&&/.exec(ti.command ?? '')
      if (!(m && norm(m[1] ?? m[2] ?? m[3]).startsWith(root)))
        reason =
          'Start every Bash command with cd "<your Worktree>" && followed by the command. Your Worktree is the path on the Worktree: line of your message.'
      break
    }
    case 'Write':
    case 'Edit':
      if (!norm(ti.file_path).startsWith(root))
        reason =
          'File paths must be absolute and start with your Worktree path (the Worktree: line of your message). That path is in the main tree.'
      break
    case 'Glob':
    case 'Grep':
      if (!(ti.path && norm(ti.path).startsWith(root)))
        reason =
          'Pass path set to your Worktree (the Worktree: line of your message); without it the search runs in the main tree.'
      break
  }
  if (reason) deny(reason)
})
