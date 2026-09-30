// Shared plumbing for Decidinator's hook scripts. A hook must never fail loudly or block by accident:
// run() swallows every error and leaves the exit code at 0, and runArmed() also returns without output
// when the session is not armed, so an unarmed session behaves as if the plugin were not installed.
'use strict'

const { debug } = require('./debug.js')
const state = require('./state.js')

function readStdin() {
  return new Promise(resolve => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(data))
  })
}

// Hook input as an object, or null when stdin is empty or not a JSON object.
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
const deny = reason =>
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })
const notify = text => emit({ systemMessage: text })
const emitText =text => process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)

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

// For every hook but command handling and cleanup: reads the input and calls body(input, arming) only in
// an armed session. arming is the session's flag, {mode, armedAt, by}.
function runArmed(body) {
  return run(async () => {
    const input = await readInput()
    if (!input) return
    const arming = state.readArming(input.session_id)
    if (!arming) return
    await body(input, arming)
  })
}

module.exports = { debug, readInput, emit, deny, notify, emitText, run, runArmed }
