// Grindinator WP-01 probe hook. One script serves every registration.
// Logs every hook input, with a redacted environment snapshot, to OUT/<event>.jsonl.
// With PROBE_DIRTY_FILE and PROBE_DIRTY_ON it writes one file on cue, to dirty the tree.
// With PROBE_ARMED_CHECK=1 it looks for Decidinator's arming flag on UserPromptSubmit.
// It never throws and always exits 0.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const OUT = process.env.PROBE_OUT || path.join(__dirname, '..', '..', 'out')
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

function appendLog(name, obj) {
  fs.mkdirSync(OUT, { recursive: true })
  fs.appendFileSync(path.join(OUT, name + '.jsonl'), JSON.stringify(obj) + '\n')
}

function dirtyWrite(event, input) {
  const file = process.env.PROBE_DIRTY_FILE
  const on = process.env.PROBE_DIRTY_ON
  if (!file || !on || event !== on) return
  if (event === 'PreToolUse' && input.agent_id) return
  if (event === 'SubagentStart' && !String(input.agent_type || '').startsWith('tierminator:')) return
  const done = path.join(OUT, 'dirty.done')
  if (fs.existsSync(done)) return
  fs.mkdirSync(OUT, { recursive: true })
  fs.writeFileSync(done, new Date().toISOString() + '\n')
  const at = new Date().toISOString()
  const target = path.resolve(input.cwd, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.appendFileSync(target, '- probe write ' + at + '\n')
  appendLog('DirtyWrite', { at, run: process.env.PROBE_RUN || null, event: 'DirtyWrite', file: target, trigger: event })
}

function armedCheck(event, input) {
  if (event !== 'UserPromptSubmit' || process.env.PROBE_ARMED_CHECK !== '1') return
  const dirs = []
  if (process.env.CLAUDE_PLUGIN_DATA) {
    const parent = path.dirname(process.env.CLAUDE_PLUGIN_DATA)
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory()) dirs.push(path.join(parent, entry.name, 'sessions'))
    }
  }
  dirs.push(path.join(os.tmpdir(), 'decidinator', 'sessions'))
  const found = []
  for (const dir of dirs) {
    const p = path.join(dir, String(input.session_id) + '.armed')
    try {
      found.push({ path: p, content: fs.readFileSync(p, 'utf8') })
    } catch {}
  }
  appendLog('ArmedCheck', { at: new Date().toISOString(), run: process.env.PROBE_RUN || null, event: 'ArmedCheck', found })
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
    appendLog(event, record)
  } catch {}
  try {
    dirtyWrite(event, input)
  } catch {}
  try {
    armedCheck(event, input)
  } catch {}
}

main().catch(() => {}).finally(() => {
  process.exitCode = 0
})
