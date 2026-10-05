// Launches one `claude -p` session for a package: builds its arguments, prompt and environment,
// spawns it with stdout and stderr going to files, enforces a time cap and an abort signal, and
// ends the whole process tree. launch never rejects; every outcome is in its resolved value.
// The gate command also runs through launch, with shell: true.
'use strict'

const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
const { buildPrompt } = require('./packages.js')

// Set by an enclosing Claude Code session; a child must not inherit them.
const SESSION_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_PLUGIN_ROOT',
  'CLAUDE_PLUGIN_DATA',
  'CLAUDE_PROJECT_DIR',
  'CLAUDE_ENV_FILE',
  'CLAUDE_CODE_SSE_PORT'
]

// Mutable so tests can shorten the wait between SIGTERM and SIGKILL.
const timing = { killGraceMs: 5000 }

function buildArgs(config, prompt) {
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--model', config.model,
    '--effort', config.effort,
    '--permission-mode', config.permissionMode
  ]
  if (config.maxTurns !== null) args.push('--max-turns', String(config.maxTurns))
  // Last: the option takes several values.
  if (config.allowedTools.length > 0) args.push('--allowedTools', ...config.allowedTools)
  return args
}

function sessionPrompt(preambleText, packageText) {
  return '/tierminator:plan ' + buildPrompt(preambleText, packageText)
}

function decisionPaths(root) {
  const dir = path.join(root, '.grindinator', 'decisions')
  return {
    log: path.join(dir, 'decisions.md'),
    sidecar: path.join(dir, 'open-questions.md')
  }
}

function buildEnv(baseEnv, { root, packageId, resultFile }) {
  const env = { ...baseEnv }
  for (const key of SESSION_VARS) delete env[key]
  const paths = decisionPaths(root)
  env.TIERMINATOR_RESULT_FILE = resultFile
  env.DECIDINATOR_MODE = 'sidecar'
  env.DECIDINATOR_CONTEXT = packageId
  env.DECIDINATOR_LOG = paths.log
  env.DECIDINATOR_SIDECAR = paths.sidecar
  return env
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  try {
    if (process.platform === 'win32') {
      // /T ends the whole tree, which a plain kill() does not.
      const r = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 30000
      })
      if (r.status !== 0) {
        try { child.kill() } catch { /* already gone */ }
      }
    } else {
      child.kill('SIGTERM')
      const timer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try { child.kill('SIGKILL') } catch { /* already gone */ }
        }
      }, timing.killGraceMs)
      timer.unref()
    }
  } catch { /* never throw */ }
}

function launch({ command, args, shell = false, cwd, env, streamFile, stderrFile, capMs, abortSignal }) {
  return new Promise(resolve => {
    const startedAt = Date.now()
    const streamOut = fs.createWriteStream(streamFile)
    const errOut = fs.createWriteStream(stderrFile)
    const closed = [streamOut, errOut].map(s => new Promise(res => {
      s.on('error', () => {})
      s.once('close', res)
    }))

    let settled = false
    let timedOut = false
    let interrupted = false
    let timer = null
    let child = null

    const onAbort = () => {
      interrupted = true
      stopChild(child)
    }

    async function finish(exitCode, signal, spawnError) {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (abortSignal) abortSignal.removeEventListener('abort', onAbort)
      if (spawnError !== null) {
        for (const s of [streamOut, errOut]) {
          if (!s.writableEnded) s.end()
        }
      }
      await Promise.all(closed)
      resolve({ exitCode, signal, timedOut, interrupted, spawnError, durationMs: Date.now() - startedAt })
    }

    try {
      child = spawn(command, args, { cwd, env, shell, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    } catch (e) {
      finish(null, null, e.message)
      return
    }

    if (child.stdout) child.stdout.pipe(streamOut)
    if (child.stderr) child.stderr.pipe(errOut)

    child.on('error', e => {
      if (child.pid === undefined) finish(null, null, e.message)
    })
    child.on('close', (code, sig) => finish(code, sig ?? null, null))

    if (capMs > 0) {
      timer = setTimeout(() => {
        timedOut = true
        stopChild(child)
      }, capMs)
    }

    if (abortSignal) {
      if (abortSignal.aborted) onAbort()
      else abortSignal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

module.exports = { SESSION_VARS, timing, buildArgs, sessionPrompt, decisionPaths, buildEnv, launch, stopChild }
