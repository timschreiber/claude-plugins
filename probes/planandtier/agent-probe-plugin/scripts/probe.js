// Agent-tool probe hook for planandtier. One script serves every registration; argv[2] is the tag.
// Every call appends {tag, stdin} to PROBE_LOG (or probe.log in the plugin data directory).
// pre-agent also denies the first dispatch whose prompt names "Task: T01", telling Claude to
// dispatch "Task: T02" instead, to see whether a corrective denial is followed. With
// PROBE_OBSERVE=1 it only logs.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const dataDir = process.env.CLAUDE_PLUGIN_DATA || path.join(os.tmpdir(), 'planandtier-agent-probe')
const logFile = process.env.PROBE_LOG || path.join(dataDir, 'probe.log')

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

  // PROBE_OBSERVE=1 makes the probe a pure logger, so it can run beside the real plugin.
  if (process.env.PROBE_OBSERVE === '1') return

  if (tag === 'pre-agent') {
    const prompt = String(input.tool_input?.prompt ?? '')
    const sentinel = path.join(path.dirname(logFile), `denied-${input.session_id || 'unknown'}`)
    if (/Task:\s*T01\b/.test(prompt) && !fs.existsSync(sentinel)) {
      fs.writeFileSync(sentinel, '')
      log({ tag: 'pre-agent:deny' })
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason:
              'probe: T01 is already done. Dispatch the same agent again with the same prompt, but with ' +
              'the line "Task: T02" in place of "Task: T01".',
          },
        })
      )
    }
  }
}

main().catch(() => {}).finally(() => {
  process.exitCode = 0
})
