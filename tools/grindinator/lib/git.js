// Git commands for the runner: the checks before a run, branch handling, and the local exclude entry
// that keeps .grindinator/ out of status. Commands run with -C <cwd> and without the GIT_* variables
// that could point them at another repository. User-facing failures are GrindinatorError.
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { GrindinatorError } = require('./errors')

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

// The first non-empty trimmed line of some output, for one-line error messages.
function firstLine(text) {
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const t = line.trim()
    if (t) return t
  }
  return 'no error output'
}

// The repository's top-level directory, or null when cwd is not inside one.
function toplevel(cwd) {
  const r = git(cwd, ['rev-parse', '--show-toplevel'])
  return r.ok && r.stdout ? path.resolve(r.stdout) : null
}

// Throws unless the repository has a commit to return to and an identity to commit with.
function checkRepo(root) {
  if (!git(root, ['rev-parse', '--verify', '-q', 'HEAD']).ok) {
    throw new GrindinatorError('the repository has no commits yet; commit once, then run again')
  }
  if (!git(root, ['var', 'GIT_COMMITTER_IDENT']).ok) {
    throw new GrindinatorError('Git has no user name and email for this repository, so the tasks cannot commit; set user.name and user.email')
  }
}

// The path of each changed or untracked entry in `git status --porcelain`.
function dirtyPaths(root) {
  const r = git(root, ['status', '--porcelain'])
  if (!r.ok) throw new GrindinatorError(`git status failed: ${firstLine(r.stderr)}`)
  if (r.stdout === '') return []
  return r.stdout.split('\n').map(l => l.slice(3))
}

// Throws when the working tree has uncommitted changes, naming the first few paths.
function checkClean(root) {
  const paths = dirtyPaths(root)
  if (paths.length === 0) return
  const named = paths.slice(0, 5).join(', ')
  throw new GrindinatorError(`the working tree has uncommitted changes (${named}${paths.length > 5 ? ', ...' : ''}); commit or stash them, then run again`)
}

const head = root => {
  const r = git(root, ['rev-parse', 'HEAD'])
  return r.ok && r.stdout ? r.stdout : null
}

// '' when HEAD is detached.
const currentBranch = root => git(root, ['branch', '--show-current']).stdout

const branchExists = (root, name) => git(root, ['rev-parse', '--verify', '-q', `refs/heads/${name}`]).ok

function createBranch(root, name) {
  const r = git(root, ['switch', '-c', name])
  if (!r.ok) throw new GrindinatorError(`could not create the branch ${name}: ${firstLine(r.stderr)}`)
}

function switchBranch(root, name) {
  const r = git(root, ['switch', name])
  if (!r.ok) throw new GrindinatorError(`could not switch to the branch ${name}: ${firstLine(r.stderr)}`)
}

const EXCLUDE_ENTRY = '/.grindinator/'

// Adds EXCLUDE_ENTRY to the repository's local exclude file unless an equivalent line is there.
// Returns true when it appended, else false.
function ensureExcluded(root) {
  const file = path.resolve(root, git(root, ['rev-parse', '--git-path', 'info/exclude']).stdout)
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    text = ''
  }
  const present = new Set(['.grindinator', '.grindinator/', '/.grindinator', '/.grindinator/'])
  if (text.split(/\r?\n/).some(l => present.has(l.trim()))) return false
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.appendFileSync(file, (text !== '' && !text.endsWith('\n') ? '\n' : '') + EXCLUDE_ENTRY + '\n')
  return true
}

module.exports = {
  git,
  installed,
  firstLine,
  toplevel,
  checkRepo,
  dirtyPaths,
  checkClean,
  head,
  currentBranch,
  branchExists,
  createBranch,
  switchBranch,
  EXCLUDE_ENTRY,
  ensureExcluded,
}
