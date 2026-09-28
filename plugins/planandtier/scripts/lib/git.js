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
    return { ok: r.status === 0, stdout: (r.stdout ?? '').trimEnd() }
  } catch {
    return { ok: false, stdout: '' }
  }
}

// null when the directory is usable for a run, else a short reason: not a repository, no commit to
// return to, or uncommitted changes (the first few paths are named).
function problem(cwd) {
  if (typeof cwd !== 'string' || !cwd) return 'the working directory is unknown'
  if (git(cwd, ['rev-parse', '--is-inside-work-tree']).stdout !== 'true') return 'it is not inside a Git repository'
  if (!git(cwd, ['rev-parse', '--verify', '-q', 'HEAD']).ok) return 'the repository has no commits yet'
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

// True when any remote-tracking branch contains the commit, that is, it may have been pushed.
const isPushed = (cwd, sha) => {
  const r = git(cwd, ['branch', '-r', '--contains', sha])
  return !r.ok || r.stdout !== ''
}

// Returns the working tree and branch to `sha`: tracked files reset, untracked files removed
// (ignored files are left alone). True when both commands succeeded.
const resetTo = (cwd, sha) => git(cwd, ['reset', '--hard', '-q', sha]).ok && git(cwd, ['clean', '-fdq']).ok

module.exports = { git, problem, head, branch, isClean, commitsSince, isPushed, resetTo }
