// Runs the configured gate command for a package after a complete session: through the shell in the
// project root, with its output in the attempt directory, under the maxGateMinutes cap. Never throws.
'use strict'

const path = require('path')
const { launch } = require('./session.js')

async function runGate({ root, config, packageId, dir, env = process.env, abortSignal = null }) {
  if (config.gate === null) {
    return {
      command: null, status: 'skipped', exitCode: null, signal: null, timedOut: false,
      interrupted: false, durationMs: 0, reason: 'no gate is configured'
    }
  }
  const r = await launch({
    command: config.gate,
    args: [],
    shell: true,
    cwd: root,
    env: { ...env, GRINDINATOR_PACKAGE: packageId },
    streamFile: path.join(dir, 'gate.stdout.txt'),
    stderrFile: path.join(dir, 'gate.stderr.txt'),
    capMs: config.maxGateMinutes * 60000,
    abortSignal
  })
  let status
  let reason
  if (r.interrupted) {
    status = 'interrupted'
    reason = 'the gate was interrupted by the user'
  } else if (r.spawnError) {
    status = 'failed'
    reason = `the gate could not be started: ${r.spawnError}`
  } else if (r.timedOut) {
    status = 'failed'
    reason = `the gate ran past the ${config.maxGateMinutes}-minute cap and was stopped`
  } else if (r.exitCode === 0) {
    status = 'passed'
    reason = null
  } else {
    status = 'failed'
    reason = `the gate exited ${r.exitCode ?? 'with no code'}` + (r.signal ? ` (signal ${r.signal})` : '')
  }
  return {
    command: config.gate, status, exitCode: r.exitCode, signal: r.signal, timedOut: r.timedOut,
    interrupted: r.interrupted, durationMs: r.durationMs, reason
  }
}

module.exports = { runGate }
