// Worktree hook probe for tierminator parallel execution. One script serves both registrations;
// argv[2] is the tag. Every call appends {tag, stdin} to the log file first.
// PROBE_LOG: the log file (default: tierminator-parallel-probe/probe.log in the temp directory).
// PROBE_BASE: the commit every new worktree starts from.
// PROBE_WT_DIR: the parent directory of the worktrees.
// PROBE_WT_MODE: decline makes wt-create fail without creating anything, to see what Claude Code does
// when a WorktreeCreate hook cannot make the worktree.
// A WorktreeCreate hook replaces Claude Code's own worktree creation, so wt-create makes the worktree
// itself with git and must print the new path as the last stdout line. wt-remove only logs (the docs
// say Claude Code does not run it for subagents).
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

async function main() {
  const tag = process.argv[2]
  const raw = await readStdin()
  log({ tag, stdin: raw })

  let input = {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') input = parsed
  } catch {
    input = {}
  }

  if (tag !== 'wt-create') return 0

  if (tag === 'wt-create' && process.env.PROBE_WT_MODE === 'decline') {
    log({ tag: 'wt-create:declined' })
    process.stderr.write('probe: declining to create a worktree\n')
    return 1
  }

  const name = String(input.name || '').replace(/[^A-Za-z0-9._-]/g, '-')
  const base = process.env.PROBE_BASE
  const wtDir = process.env.PROBE_WT_DIR
  if (!name || !base || !wtDir) {
    const reason = 'missing ' + [!name && 'name', !base && 'PROBE_BASE', !wtDir && 'PROBE_WT_DIR'].filter(Boolean).join(', ')
    process.stderr.write(reason + '\n')
    log({ tag: 'wt-create:failed', reason })
    return 1
  }

  const wtPath = path.join(wtDir, name)
  fs.mkdirSync(wtDir, { recursive: true })
  const r = spawnSync('git', ['worktree', 'add', '-q', '-b', 'tierminator/probe/' + name, wtPath, base], {
    cwd: input.cwd || process.cwd(),
    encoding: 'utf8',
  })
  if (r.status !== 0) {
    const stderr = r.stderr || String(r.error || '')
    log({ tag: 'wt-create:failed', stderr })
    process.stderr.write(stderr)
    return 1
  }

  log({
    tag: 'wt-create:made',
    path: path.resolve(wtPath),
    base,
    hookCwd: process.cwd(),
    inputCwd: input.cwd ?? null,
    inputKeys: Object.keys(input),
  })
  process.stdout.write(path.resolve(wtPath) + '\n')
  return 0
}

let code = 0
main()
  .then(c => {
    code = c
  })
  .catch(() => {
    code = 0
  })
  .finally(() => {
    process.exitCode = code
  })
