// Shared plumbing for hook scripts. A hook must never fail loudly or block by accident:
// run() swallows every error and leaves the exit code at 0, and output is written without
// forcing an early exit, so a large payload is flushed before the process ends.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

function readStdin() {
  return new Promise(resolve => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(data))
  })
}

// Debug output goes to a temp file, never to stdout, and only when PLANANDTIER_DEBUG is set.
function debug(message) {
  if (!process.env.PLANANDTIER_DEBUG) return
  try {
    fs.appendFileSync(path.join(os.tmpdir(), 'planandtier-debug.log'), `${message}\n`)
  } catch {}
}

// Hook input as an object, or null when stdin is empty or not JSON.
async function readInput() {
  const raw = await readStdin()
  try {
    const input = JSON.parse(raw)
    return input !== null && typeof input === 'object' && !Array.isArray(input) ? input : null
  } catch {
    debug(`unparseable stdin: ${raw.slice(0, 200)}`)
    return null
  }
}

const emit = payload => process.stdout.write(JSON.stringify(payload))
const emitText = text => process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)

// Runs a hook body. Any error is logged (if debugging) and swallowed; the exit code stays 0.
async function run(body) {
  process.on('uncaughtException', e => debug(`uncaught: ${e?.stack ?? e}`))
  process.on('unhandledRejection', e => debug(`unhandled: ${e?.stack ?? e}`))
  try {
    await body()
  } catch (e) {
    debug(`error: ${e?.stack ?? e}`)
  }
  process.exitCode = 0
}

module.exports = { debug, readInput, emit, emitText, run }
