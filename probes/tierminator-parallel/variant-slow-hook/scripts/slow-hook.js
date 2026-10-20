// Slow hook for probe P5 of docs/tierminator/tierminator-parallel-findings.md: how long Claude Code lets a hook
// run. p5-runner.js registers it in a generated copy of this plugin:
//   node slow-hook.js <name> <sleepSeconds> <event>
// It logs slow:start, a slow:beat every 5 s and slow:end to PROBE_LOG. A hook killed at its timeout stops
// logging; one that outlives the kill keeps beating. After the sleep, on UserPromptSubmit, it prints
// additionalContext P5-MARKER-<name>, so the model can say whether a long hook's output reached it.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const logFile = process.env.PROBE_LOG || path.join(os.tmpdir(), 'tierminator-parallel-probe', 'probe.log')
const [name, sleepArg, event] = process.argv.slice(2)
const sleepS = Number(sleepArg) || 0
const t0 = Date.now()

function log(tag, extra) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true })
    fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), tag, name, pid: process.pid, ...extra }) + '\n')
  } catch {}
}

log('slow:start', { sleepS, event })
process.stdin.on('data', () => {})
process.stdin.on('error', () => {})
const beat = setInterval(() => log('slow:beat', { elapsedS: (Date.now() - t0) / 1000 }), 5000)
setTimeout(() => {
  clearInterval(beat)
  log('slow:end', { elapsedS: (Date.now() - t0) / 1000 })
  if (event === 'UserPromptSubmit') {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: 'P5-MARKER-' + name } }))
  }
  process.exit(0)
}, sleepS * 1000)
