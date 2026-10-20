// Worktree probe hook for tierminator parallel execution. One script serves every registration;
// argv[2] is the tag. Every call appends {tag, stdin} to the log file.
// PROBE_LOG: the log file (default: probe.log in the tierminator-parallel-probe temp directory).
// PROBE_MODE: observe (default, only logs) or add-isolation. In add-isolation mode, a pre-agent call
// whose tool_input has no `isolation` key is rewritten, through updatedInput, to add
// isolation: "worktree"; the emitted JSON is logged as pre-agent:emit. No permissionDecision is set.
// WorktreeCreate and WorktreeRemove are deliberately not registered: a WorktreeCreate hook replaces
// Claude Code's own worktree creation, which probe P1 measures.
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

async function main() {
  const tag = process.argv[2]
  const raw = await readStdin()
  log({ tag, stdin: raw })

  let input = {}
  try {
    input = JSON.parse(raw)
  } catch {
    return
  }

  if (process.env.PROBE_MODE !== 'add-isolation' || tag !== 'pre-agent') return

  const ti = input && input.tool_input
  if (ti && typeof ti === 'object' && !Array.isArray(ti) && !('isolation' in ti)) {
    const out = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: { ...ti, isolation: 'worktree' },
      },
    }
    log({ tag: 'pre-agent:emit', stdin: JSON.stringify(out) })
    process.stdout.write(JSON.stringify(out))
  }
}

main().catch(() => {}).finally(() => {
  process.exitCode = 0
})
