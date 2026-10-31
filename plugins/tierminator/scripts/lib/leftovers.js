// What an earlier run left in the repository, found and removed by name before a tiered plan starts
// (spec: Resuming): slot worktrees directly in <repo>/.claude/worktrees/ named tierminator-<runId>-<task>, and
// branches tierminator/<runId>/<task>. A worktree or branch whose name does not match is the user's, as is
// any worktree outside .claude/worktrees/ and any branch checked out in a worktree that is kept. Picks a
// halted run made stay on the run branch, where committedTasks skips them.
'use strict'

const git = require('./git.js')

const BRANCH = /^tierminator\/[0-9a-f]{8}\/T\d+$/
const WORKTREE = /^tierminator-[0-9a-f]{8}-T\d+$/
const LISTED = 5

function dirtyPaths(wtPath) {
  const r = git.git(wtPath, ['status', '--porcelain'])
  return r.ok && r.stdout ? r.stdout.split('\n').map(l => l.slice(3)) : []
}

// The leftovers: {worktrees: [{path, branch, dirty}], branches: [name]}.
function find(cwd) {
  const worktrees = git
    .worktreesMatching(cwd, 'tierminator-')
    .filter(w => WORKTREE.test(w.path.slice(w.path.lastIndexOf('/') + 1)))
    .map(w => ({ path: w.path, branch: w.branch, dirty: w.prunable ? [] : dirtyPaths(w.path) }))
  const kept = git.worktreeList(cwd).filter(l => !worktrees.some(w => git.samePath(w.path, l.path)))
  const branches = git
    .branchesMatching(cwd, 'tierminator/')
    .filter(n => BRANCH.test(n) && !kept.some(k => k.branch === n))
  return { worktrees, branches }
}

// Removes what find returned. Returns an array of failure lines. Never throws.
function clear(cwd, found) {
  const failures = []
  try {
    for (const w of found.worktrees) {
      const r = git.worktreeRemove(cwd, w.path)
      if (!r.ok) failures.push(`${w.path}: ${r.failure}`)
    }
    git.worktreePrune(cwd)
    for (const b of found.branches) {
      const r = git.branchDelete(cwd, b)
      if (!r.ok) failures.push(r.failure)
    }
  } catch (e) {
    failures.push(String(e?.message ?? e))
  }
  return failures
}

function reportText(found, failures = []) {
  if (!found.worktrees.length && !found.branches.length) return ''
  const parts = []
  if (found.worktrees.length) {
    parts.push((found.worktrees.length === 1 ? 'worktree ' : 'worktrees ') + found.worktrees.map(w => w.path).join(', '))
  }
  if (found.branches.length) {
    parts.push((found.branches.length === 1 ? 'branch ' : 'branches ') + found.branches.join(', '))
  }
  let text = `tierminator removed what an earlier run left: ${parts.join('; ')}.`
  for (const w of found.worktrees) {
    if (w.dirty.length > 0) {
      text += ` ${w.path} had uncommitted changes (${w.dirty.slice(0, LISTED).join(', ')}${w.dirty.length > LISTED ? ', ...' : ''}), which are discarded.`
    }
  }
  if (failures.length > 0) text += ` Removing some of it failed, so it is left in place: ${failures.join('; ')}.`
  return `${text} Tell the user what was removed.`
}

// Finds and removes the leftovers; returns the text telling the user, '' when there were none.
function tidy(cwd) {
  try {
    const found = find(cwd)
    if (!found.worktrees.length && !found.branches.length) return ''
    return reportText(found, clear(cwd, found))
  } catch {
    return ''
  }
}

module.exports = { find, clear, reportText, tidy }
