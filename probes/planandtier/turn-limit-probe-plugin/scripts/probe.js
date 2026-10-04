// Turn-limit probe hook for tierminator. One script serves every registration; argv[2] is the tag.
// Every call appends {at, tag, stdin} to PROBE_LOG (or probe.log in the plugin data directory).
// It only logs: it never prints anything, so it makes no decisions.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

const dataDir = process.env.CLAUDE_PLUGIN_DATA || path.join(os.tmpdir(), 'tierminator-turn-limit-probe')
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
}

main().catch(() => {}).finally(() => {
  process.exitCode = 0
})
