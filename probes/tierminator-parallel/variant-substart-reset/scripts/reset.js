// Worktree probe hook for tierminator parallel execution. On SubagentStart, if the subagent's cwd is
// a linked Git worktree, run `git reset --hard -q $PROBE_BASE` in it, to see whether that finishes
// before the subagent's first turn.
// PROBE_LOG: the log file (default: probe.log in the tierminator-parallel-probe temp directory).
// PROBE_BASE: the commit to reset to. Without it, nothing is touched.
// PROBE_RESET_DELAY_MS: sleep this long (ms) before the reset, to test whether Claude Code waits for the hook.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const logFile = process.env.PROBE_LOG || path.join(os.tmpdir(), 'tierminator-parallel-probe', 'probe.log')

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

function git(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' })
}

function out(r) {
  return r && r.status === 0 ? String(r.stdout).trim() : null
}

async function main() {
  const raw = await readStdin()
  log({ tag: 'sub-reset:input', stdin: raw })

  let input = {}
  try {
    input = JSON.parse(raw)
  } catch {
    return
  }

  const cwd = input && input.cwd
  const base = process.env.PROBE_BASE
  if (typeof cwd !== 'string') return log({ tag: 'sub-reset:skipped', reason: 'no cwd', cwd: cwd ?? null })
  if (!base) return log({ tag: 'sub-reset:skipped', reason: 'PROBE_BASE not set', cwd })

  const gitDir = out(git(cwd, ['rev-parse', '--git-dir']))
  const commonDir = out(git(cwd, ['rev-parse', '--git-common-dir']))
  if (!gitDir || !commonDir) return log({ tag: 'sub-reset:skipped', reason: 'not a git repository', cwd })
  if (path.resolve(cwd, gitDir) === path.resolve(cwd, commonDir)) {
    return log({ tag: 'sub-reset:skipped', reason: 'not a linked worktree', cwd })
  }

  const startedAt = new Date().toISOString()
  const before = out(git(cwd, ['rev-parse', 'HEAD']))
  const delayMs = Number(process.env.PROBE_RESET_DELAY_MS) || 0
  if (delayMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)
  const r =git(cwd, ['reset', '--hard', '-q', base])
  const after = out(git(cwd, ['rev-parse', 'HEAD']))
  const endedAt = new Date().toISOString()
  log({
    tag: 'sub-reset',
    cwd,
    agentType: input.agent_type ?? null,
    before,
    after,
    base,
    status: r.status,
    stderr: r.stderr,
    startedAt,
    endedAt,
    delayMs,
  })
}

main().catch(() => {}).finally(() => {
  process.exitCode = 0
})
