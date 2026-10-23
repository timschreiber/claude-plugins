// Git commands for the run: checks before a plan is accepted, the HEAD recorded before each dispatch,
// and the reset before a retry; for parallel waves, the slot worktrees and branches, the picks that
// integrate them, and the exclude entry. Every function swallows errors and returns a "nothing happened"
// value, because a hook must never fail loudly. Commands run with -C <cwd> and without the GIT_*
// variables that could point them at another repository.
'use strict'

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

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

// The commits after `base` up to HEAD in `cwd`, which may be any worktree of the repository (a slot's in a
// parallel wave), oldest first, as {sha, message}.
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

// The first non-empty line of some error output, cut to 300 characters.
const firstLine = text => (String(text ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? 'no error output').slice(0, 300)

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

// Parallel waves: slot worktrees and branches (spec: The dispatch of one task; Integration; Resuming).

// The form a `Worktree:` line carries and file tools resolve correctly (C:/Users/...), never Git Bash's
// /tmp/... pwd form. null unless p is a non-empty string.
function toWorktreePath(p) {
  if (typeof p !== 'string' || !p) return null
  if (process.platform !== 'win32') return path.resolve(p)
  const m = /^\/([a-zA-Z])(\/|$)/.exec(p)
  if (m) p = `${m[1]}:/${p.slice(m[0].length)}`
  const out = path.win32.resolve(p).replace(/\\/g, '/')
  return out.replace(/^[a-z]:/, s => s.toUpperCase())
}

// True when both paths name the same location in toWorktreePath form (case-insensitive on win32).
function samePath(a, b) {
  const x = toWorktreePath(a)
  const y = toWorktreePath(b)
  if (x === null || y === null) return false
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

// Every worktree of the repository, main first, as {path, head, branch, locked, prunable}; branch is
// null when detached. [] on failure.
function worktreeList(cwd) {
  const r = git(cwd, ['worktree', 'list', '--porcelain'])
  if (!r.ok) return []
  const out = []
  for (const block of r.stdout.split(/\r?\n\s*\r?\n/)) {
    const lines = block.split(/\r?\n/).map(l => l.trim())
    const wt = lines.find(l => l.startsWith('worktree '))
    if (!wt) continue
    const headLine = lines.find(l => l.startsWith('HEAD '))
    const branchLine = lines.find(l => l.startsWith('branch '))
    out.push({
      path: toWorktreePath(wt.slice('worktree '.length)),
      head: headLine ? headLine.slice('HEAD '.length) : null,
      branch: branchLine ? branchLine.slice('branch '.length).replace(/^refs\/heads\//, '') : null,
      locked: lines.some(l => l === 'locked' || l.startsWith('locked ')),
      prunable: lines.some(l => l === 'prunable' || l.startsWith('prunable '))
    })
  }
  return out
}

// The local branches whose names start with prefix (which must itself start with 'tierminator/'), sorted.
function branchesMatching(cwd, prefix = 'tierminator/') {
  if (typeof prefix !== 'string' || !prefix.startsWith('tierminator/')) return []
  const r = git(cwd, ['for-each-ref', '--format=%(refname)', 'refs/heads/tierminator'])
  if (!r.ok) return []
  return r.stdout
    .split(/\r?\n/)
    .map(l => l.trim().replace(/^refs\/heads\//, ''))
    .filter(n => n.startsWith(prefix))
    .sort()
}

// The linked worktrees directly inside <main>/.claude/worktrees/ whose directory name starts with prefix
// (which must itself start with 'tierminator-').
function worktreesMatching(cwd, prefix = 'tierminator-') {
  if (typeof prefix !== 'string' || !prefix.startsWith('tierminator-')) return []
  const list = worktreeList(cwd)
  if (!list.length || !list[0].path) return []
  const dirPrefix = `${list[0].path}/.claude/worktrees/`
  const win = process.platform === 'win32'
  const cmp = s => (win ? s.toLowerCase() : s)
  return list.slice(1).filter(w => {
    if (!w.path || !cmp(w.path).startsWith(cmp(dirPrefix))) return false
    const name = w.path.slice(dirPrefix.length)
    return name.startsWith(prefix) && !name.includes('/')
  })
}

// Forgets the records of linked worktrees whose directories are gone. True when git succeeded.
const worktreePrune = cwd => gitPatiently(cwd, ['worktree', 'prune'], LOCK_RETRY_MS).ok

// Force-deletes a local branch, but only one named tierminator/..., so a user's branch is never deleted.
// A branch still checked out in a worktree cannot be deleted, so remove the worktree first.
// Returns {ok: true}, or {ok: false, failure}.
function branchDelete(cwd, name, delays = LOCK_RETRY_MS) {
  if (typeof name !== 'string' || !name.startsWith('tierminator/')) return { ok: false, failure: `not a tierminator branch: ${name}` }
  const r = gitPatiently(cwd, ['branch', '-D', name], delays)
  return r.ok ? { ok: true } : { ok: false, failure: `git branch -D ${name} failed: ${firstLine(r.stderr)}` }
}

// Removes the worktree with its changes and untracked files (--force twice also takes a locked worktree).
// Measured on Windows, Git 2.53: when another process holds the worktree directory (as its cwd), git
// deletes the files and the record but fails with 'Permission denied', leaving the empty directory, and a
// repeat says 'is not a working tree'; so what is left is deleted directly, retried after each wait in
// delays, and pruned. Refuses the main working tree and a path that is not a worktree of this repository;
// a path already gone, or an empty unlisted directory such a removal left, counts as removed. The branch
// is kept: branchDelete it after.
function worktreeRemove(cwd, wtPath, delays = LOCK_RETRY_MS) {
  const target = toWorktreePath(wtPath)
  const list = worktreeList(cwd)
  if (!target || !list.length) return { ok: false, failure: 'git worktree list failed' }
  if (samePath(list[0].path, target)) return { ok: false, failure: 'refusing to remove the main working tree' }
  const listed = () => worktreeList(cwd).some(w => samePath(w.path, target))
  if (!list.some(w => samePath(w.path, target))) {
    try { if (fs.existsSync(target) && fs.readdirSync(target).length === 0) fs.rmdirSync(target) } catch {}
    return fs.existsSync(target) ? { ok: false, failure: `not a worktree of this repository: ${target}` } : { ok: true }
  }
  const args = ['worktree', 'remove', '--force', '--force', target]
  const first = git(cwd, args)
  if (first.ok) return { ok: true }
  for (const ms of [0, ...delays]) {
    sleep(ms)
    if (listed() && git(cwd, args).ok) return { ok: true }
    try { fs.rmSync(target, { recursive: true, force: true }) } catch {}
    git(cwd, ['worktree', 'prune'])
    if (!fs.existsSync(target) && !listed()) return { ok: true }
  }
  return { ok: false, failure: `git worktree remove failed: ${firstLine(first.stderr)}` }
}

// Makes a worktree at wtPath on a new branch started at base (git worktree add -b), retried on locks.
// Returns {ok: true, path} with path in toWorktreePath form, or {ok: false, failure} with Git's first
// error line. Callers serialize worktreeAdd through the state lock (WP-07, in H4's pre hook, WP-09); four
// concurrent adds still succeed in the tests. core.longpaths is left as the user set it: measured on
// Windows, Git 2.53, a checkout past the path limit exits 128 with 'Filename too long', removes the
// directory and keeps the new branch, so a failed add undoes what it made (the worktree if the path was
// new, the branch if it did not exist before).
function worktreeAdd(cwd, wtPath, branch, base, delays = LOCK_RETRY_MS) {
  const target = toWorktreePath(wtPath)
  if (!target || typeof branch !== 'string' || !branch || typeof base !== 'string' || !base) {
    return { ok: false, failure: 'worktreeAdd needs a path, a branch and a base' }
  }
  const hadBranch = git(cwd, ['rev-parse', '--verify', '-q', `refs/heads/${branch}`]).ok
  const hadPath = fs.existsSync(target)
  const r = gitPatiently(cwd, ['worktree', 'add', '-q', '-b', branch, target, base], delays)
  if (r.ok) return { ok: true, path: target }
  if (!hadPath) {
    if (worktreeList(cwd).some(w => samePath(w.path, target))) git(cwd, ['worktree', 'remove', '--force', '--force', target])
    try { fs.rmSync(target, { recursive: true, force: true }) } catch {}
  }
  git(cwd, ['worktree', 'prune'])
  if (!hadBranch) git(cwd, ['branch', '-D', branch])
  return { ok: false, failure: `git worktree add failed: ${firstLine(r.stderr)}` }
}

// Cherry-picks one commit onto the current branch of cwd. Never passes -x, so the message and its
// Tierminator- trailers stay exactly as they are and committedTasks still finds them. Returns {ok: true},
// or {ok: false, conflicts, failure}. On a conflict the pick is left in progress for the caller to abort
// (cherryPickAbort); any other failure (a bad sha, a pick that would be empty) gives conflicts [], and the
// caller checks pickInProgress.
function cherryPick(cwd, sha, delays = LOCK_RETRY_MS) {
  if (typeof sha !== 'string' || !sha) return { ok: false, conflicts: [], failure: 'cherryPick needs a commit' }
  const r = gitPatiently(cwd, ['cherry-pick', sha], delays)
  if (r.ok) return { ok: true }
  const d = git(cwd, ['diff', '--name-only', '--diff-filter=U'])
  const conflicts = d.ok ? d.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean) : []
  return { ok: false, conflicts, failure: `git cherry-pick ${sha} failed: ${firstLine(r.stderr || r.stdout)}` }
}

// Abandons a pick in progress: returns HEAD, the index and the tree to how they were before the pick.
// Returns {ok: true}, or {ok: false, failure}.
function cherryPickAbort(cwd, delays = LOCK_RETRY_MS) {
  const r = gitPatiently(cwd, ['cherry-pick', '--abort'], delays)
  return r.ok ? { ok: true } : { ok: false, failure: `git cherry-pick --abort failed: ${firstLine(r.stderr)}` }
}

// True while a cherry-pick is in progress in this worktree (Git keeps CHERRY_PICK_HEAD per worktree).
const pickInProgress = cwd => git(cwd, ['rev-parse', '-q', '--verify', 'CHERRY_PICK_HEAD']).ok

// Adds `.claude/worktrees/` to the repository's info/exclude once (a second call changes nothing).
// --git-path finds the file shared by every worktree, so this works from a linked worktree too.
// Without it the main tree shows `?? .claude/` as soon as a slot worktree is made there, which fails
// the clean-tree check (findings, Recommendation). True when the entry is present afterwards, false
// when the file could not be found or written.
const WORKTREES_EXCLUDE = '.claude/worktrees/'
function excludeWorktrees(cwd) {
  try {
    const r = git(cwd, ['rev-parse', '--git-path', 'info/exclude'])
    if (!r.ok || !r.stdout.trim()) return false
    const file = path.resolve(cwd, r.stdout.trim())
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch (e) { if (e?.code !== 'ENOENT') return false }
    if (text.split(/\r?\n/).some(l => l.trim() === WORKTREES_EXCLUDE)) return true
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${text && !text.endsWith('\n') ? '\n' : ''}${WORKTREES_EXCLUDE}\n`)
    return true
  } catch {
    return false
  }
}

module.exports = { git, installed, problem, head, branch, isClean, commitsSince, committedTasks, isPushed, resetTo, LOCK_RETRY_MS, sleep, toWorktreePath, samePath, worktreeList, branchesMatching, worktreesMatching, worktreePrune, branchDelete, worktreeRemove, worktreeAdd, cherryPick, cherryPickAbort, pickInProgress, excludeWorktrees }
