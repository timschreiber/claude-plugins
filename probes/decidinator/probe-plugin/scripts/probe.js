// Decidinator WP-01 probe hook. One script serves every registration.
// Logs every hook input, with a redacted environment snapshot, to OUT/<event>.jsonl.
// With PROBE_DENY=1 it denies main-thread Read and AskUserQuestion calls in PreToolUse.
// It never throws and always exits 0.
'use strict'

const fs = require('fs')
const path = require('path')

const OUT = process.env.PROBE_OUT || path.join(__dirname, '..', '..', 'out')
const DENY_TOKEN = 'DECIDINATOR-PROBE-DENY-7F3K'
const ENV_NAME = /^(CLAUDE|ANTHROPIC|CI$|TERM|WT_SESSION$|SESSIONNAME$)/
const SECRET_NAME = /KEY|TOKEN|SECRET|AUTH|PASSWORD|CREDENTIAL/i

function readStdin() {
  return new Promise(resolve => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(data))
  })
}

function envSnapshot() {
  const snapshot = {}
  for (const name of Object.keys(process.env).filter(n => ENV_NAME.test(n)).sort()) {
    snapshot[name] = SECRET_NAME.test(name) ? '<redacted>' : process.env[name]
  }
  return snapshot
}

async function main() {
  const raw = await readStdin()
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    input = { unparsed: raw }
  }
  const event = String((input && input.hook_event_name) || 'unknown').replace(/[^A-Za-z]/g, '')
  const record = {
    at: new Date().toISOString(),
    run: process.env.PROBE_RUN || null,
    event,
    env: envSnapshot(),
    input,
  }
  try {
    fs.mkdirSync(OUT, { recursive: true })
    fs.appendFileSync(path.join(OUT, event + '.jsonl'), JSON.stringify(record) + '\n')
  } catch {}

  if (
    process.env.PROBE_DENY === '1' &&
    event === 'PreToolUse' &&
    !input.agent_id &&
    (input.tool_name === 'Read' || input.tool_name === 'AskUserQuestion')
  ) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            DENY_TOKEN +
            ': the probe denied ' +
            input.tool_name +
            '. Do not retry it. Quote this whole reason, verbatim, in your final reply.',
        },
      })
    )
  }
}

main().catch(() => {}).finally(() => {
  process.exitCode = 0
})
