// Git commands for the run: checks before a plan is accepted, the HEAD recorded before each dispatch,
// and the reset before a retry. Every function swallows errors and returns a "nothing happened"
// value, because a hook must never fail loudly. Commands run with -C <cwd> and without the GIT_*
// variables that could point them at another repository.
'use strict'

const { spawnSync } = require('child_process')

function git(cwd, args) {
  try {
    const env = { ...process.env }
    for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY']) delete env[key]
    const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 60000, windowsHide: true, env })
    // Only the end is trimmed: a porcelain status line can start with a space (" M file").
    const stderr = (r.stderr ?? '').trim() || (r.error ? String(r.error.message ?? r.error) : '')
    return { ok: r.status === 0, stdout: (r.stdout ?? '').trimEnd(), stderr }
  } catch (e) {
    return { ok: false, stdout: '', stderr: String(e?.message ?? e ?? '') }
  }
}

// True when a git executable runs at all. Without this, a missing Git reads as "not a repository".
const installed = () => {
  try {
    return spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 60000, windowsHide: true }).status === 0
  } catch {
    return false
  }
}

// null when the directory is usable for a run, else a short reason: no Git, not a repository, no
// commit to return to, no identity to commit with, or uncommitted changes (the first few paths are
// named).
function problem(cwd) {
  if (typeof cwd !== 'string' || !cwd) return 'the working directory is unknown'
  if (!installed()) return 'Git is not installed or not on the PATH'
  if (git(cwd, ['rev-parse', '--is-inside-work-tree']).stdout !== 'true') return 'it is not inside a Git repository'
  if (!git(cwd, ['rev-parse', '--verify', '-q', 'HEAD']).ok) return 'the repository has no commits yet'
  // Every task is a commit: without an identity, each worker's commit fails and burns its retries.
  if (!git(cwd, ['var', 'GIT_COMMITTER_IDENT']).ok) {
    return 'Git has no user name and email for this repository, so the tasks cannot commit; set user.name and user.email'
  }
  const status = git(cwd, ['status', '--porcelain'])
  if (!status.ok) return 'git status failed'
  if (status.stdout !== '') {
    const lines = status.stdout.split('\n')
    const paths = lines.slice(0, 5).map(l => l.slice(3)).join(', ')
    return `the working tree has uncommitted changes (${paths}${lines.length > 5 ? ', ...' : ''})`
  }
  return null
}

const head = cwd => git(cwd, ['rev-parse', 'HEAD']).stdout || null
const branch = cwd => git(cwd, ['branch', '--show-current']).stdout // '' on a detached HEAD
const isClean = cwd => {
  const r = git(cwd, ['status', '--porcelain'])
  return r.ok && r.stdout === ''
}

// The commits after `base` up to HEAD, oldest first, as {sha, message}.
function commitsSince(cwd, base) {
  const r = git(cwd, ['log', '--reverse', '--format=%H%x1f%B%x1e', `${base}..HEAD`])
  if (!r.ok) return []
  return r.stdout
    .split('\x1e')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      const [sha, message = ''] = s.split('\x1f')
      return { sha: sha.trim(), message: message.trim() }
    })
}

// The tasks of plan `planId` already committed on the current branch, as {taskId: sha}, from the
// "Tierminator-Plan:" and "Tierminator-Task:" lines workers write. When a task was committed more than
// once, the newest commit wins.
function committedTasks(cwd, planId) {
  if (!/^[0-9a-f]{16}$/.test(String(planId))) return {}
  const r = git(cwd, ['log', 'HEAD', '--fixed-strings', `--grep=Tierminator-Plan: ${planId}`, '--format=%H%x1f%B%x1e'])
  if (!r.ok) return {}
  const found = {}
  for (const entry of r.stdout.split('\x1e')) {
    const [sha, message = ''] = entry.trim().split('\x1f')
    const id = /^Tierminator-Task: (T\d+)\s*$/m.exec(message)?.[1]
    if (sha && id && !(id in found)) found[id] = sha.trim()
  }
  return found
}

// True when any remote-tracking branch contains the commit, that is, it may have been pushed.
const isPushed = (cwd, sha) => {
  const r = git(cwd, ['branch', '-r', '--contains', sha])
  return !r.ok || r.stdout !== ''
}

// An error another process causes and then clears: a Git lock file held by a concurrent git command
// (two hooks settling the same attempt at once both reset; see
// probes/evidence/planandtier-reset-failure.json), or a Windows file a still-running process holds open.
const LOCK_ERROR = /index\.lock|\.lock': File exists|another git process|Permission denied|Device or resource busy|Resource temporarily unavailable|being used by another process|unable to unlink/i
// The waits, in milliseconds, before each repeat of a command that failed with a lock-type error.
const LOCK_RETRY_MS = [100, 200, 400, 800, 1500]

const sleep = ms => {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  } catch {}
}

// Runs one git command, repeating it after each wait in `delays` while it fails with a lock-type error.
function gitPatiently(cwd, args, delays) {
  let r = git(cwd, args)
  for (const ms of delays) {
    if (r.ok || !LOCK_ERROR.test(r.stderr)) break
    sleep(ms)
    r = git(cwd, args)
  }
  return r
}

// Returns the working tree and branch to `sha`: tracked files reset, untracked files removed
// (ignored files are left alone). A command that fails with a lock-type error is repeated a few times.
// Returns {ok: true}, or {ok: false, failure} naming the git command that failed and the first line of
// its error output. A failed `git reset --hard` changes nothing, so `clean` runs only after it succeeds.
function resetTo(cwd, sha, delays = LOCK_RETRY_MS) {
  for (const args of [['reset', '--hard', '-q', sha], ['clean', '-fdq']]) {
    const r = gitPatiently(cwd, args, delays)
    if (!r.ok) {
      const line = r.stderr.split('\n').map(l => l.trim()).find(Boolean) ?? 'no error output'
      return { ok: false, failure: `git ${args.filter(a => a !== '-q').join(' ')} failed: ${line.slice(0, 300)}` }
    }
  }
  return { ok: true }
}

module.exports = { git, installed, problem, head, branch, isClean, commitsSince, committedTasks, isPushed, resetTo, LOCK_RETRY_MS, sleep }
