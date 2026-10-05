// Test helper: a temp data dir, project dir and home, plus a runner that spawns a hook script the way
// Claude Code does (JSON on stdin). Used by the gate and dispatch-check tests.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const scripts = path.join(__dirname, '..', '..', '..', 'plugins', 'decidinator', 'scripts')

function setup(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `decidinator-${prefix}-`))
  const dataDir = path.join(tmp, 'data')
  const projectDir = path.join(tmp, 'project')
  fs.mkdirSync(dataDir)
  fs.mkdirSync(projectDir)
  const env = { ...process.env }
  delete env.DECIDINATOR_MODE
  delete env.CLAUDE_CODE_ENTRYPOINT
  delete env.CLAUDE_CODE_SESSION_ATTENDED
  delete env.DECIDINATOR_LOG
  delete env.DECIDINATOR_SIDECAR
  delete env.DECIDINATOR_DEBUG
  delete env.DECIDINATOR_CONTEXT
  env.CLAUDE_PLUGIN_DATA = dataDir
  env.CLAUDE_PROJECT_DIR = projectDir
  env.HOME = tmp
  env.USERPROFILE = tmp
  return {
    tmp,
    dataDir,
    projectDir,
    env,
    // Runs scripts/<script> with `input` on stdin; returns {status, stdout, stderr}.
    run(script, input) {
      return spawnSync(process.execPath, [path.join(scripts, script)], {
        input: JSON.stringify(input),
        encoding: 'utf8',
        env
      })
    },
    cleanup() {
      try {
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
      } catch {}
    }
  }
}

// The deny reason in a hook's stdout, or null when it printed nothing.
function denyReason(stdout) {
  if (stdout === '') return null
  const out = JSON.parse(stdout).hookSpecificOutput
  if (out.permissionDecision !== 'deny') throw new Error(`unexpected decision: ${stdout}`)
  return out.permissionDecisionReason
}

module.exports = { setup, denyReason }
