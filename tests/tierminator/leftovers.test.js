'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const LIB = path.join(__dirname, '..', '..', 'plugins', 'tierminator', 'scripts', 'lib')
const leftovers = require(path.join(LIB, 'leftovers.js'))
const git = require(path.join(LIB, 'git.js'))

// Git in a test repository; fails the test on an error.
const gitIn = (cwd, ...args) => {
  const res = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`)
  return res.stdout.trim()
}

function makeRepo(where) {
  fs.mkdirSync(where, { recursive: true })
  gitIn(where, 'init', '-q', '-b', 'main')
  gitIn(where, 'config', 'user.name', 'Test')
  gitIn(where, 'config', 'user.email', 'test@example.com')
  gitIn(where, 'config', 'commit.gpgsign', 'false')
  gitIn(where, 'config', 'core.autocrlf', 'false')
  fs.writeFileSync(path.join(where, 'README.md'), '# test\n')
  gitIn(where, 'add', '-A')
  gitIn(where, 'commit', '-q', '-m', 'init')
  return where
}

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-leftovers-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
})

const NAMES = ['tierminator-0123abcd-T02', 'tierminator-0123abcd-T03', 'tierminator-0123abcd-T04']

function seed() {
  const repo = makeRepo(path.join(dir, 'repo'))
  git.excludeWorktrees(repo)
  const wt = name => path.join(repo, '.claude', 'worktrees', name)
  const add = (branch, p) => gitIn(repo, 'worktree', 'add', '-q', '-b', branch, p, 'HEAD')
  add('tierminator/0123abcd/T02', wt(NAMES[0]))
  add('tierminator/0123abcd/T03', wt(NAMES[1]))
  gitIn(repo, 'worktree', 'lock', wt(NAMES[1]))
  add('tierminator/0123abcd/T04', wt(NAMES[2]))
  fs.writeFileSync(path.join(wt(NAMES[2]), 'half.txt'), 'half\n')
  add('mine', wt('mine'))
  add('notes', wt('tierminator-notes'))
  const outside = path.join(dir, 'outside', 'tierminator-0123abcd-T06')
  add('tierminator/0123abcd/T06', outside)
  gitIn(repo, 'branch', 'tierminator/0123abcd/T05')
  gitIn(repo, 'branch', 'tierminator/experiment')
  return { repo, wt, outside }
}

test('find names only tierminator\'s own leftovers', () => {
  const { repo, wt } = seed()
  const found = leftovers.find(repo)
  assert.deepEqual(
    found.worktrees.map(w => w.path).sort(),
    NAMES.map(n => git.toWorktreePath(wt(n))).sort(),
  )
  assert.deepEqual(found.branches, [
    'tierminator/0123abcd/T02',
    'tierminator/0123abcd/T03',
    'tierminator/0123abcd/T04',
    'tierminator/0123abcd/T05',
  ])
  const byName = n => found.worktrees.find(w => git.samePath(w.path, wt(n)))
  assert.deepEqual(byName(NAMES[2]).dirty, ['half.txt'])
  assert.deepEqual(byName(NAMES[0]).dirty, [])
})

test('tidy removes the leftovers, reports them, and leaves the user\'s own', () => {
  const { repo, wt, outside } = seed()
  const text = leftovers.tidy(repo)
  assert.ok(text.startsWith('tierminator removed what an earlier run left: worktrees '), text)
  for (const n of NAMES) assert.ok(text.includes(git.toWorktreePath(wt(n))), text)
  for (const b of ['T02', 'T03', 'T04', 'T05']) assert.ok(text.includes(`tierminator/0123abcd/${b}`), text)
  assert.ok(text.includes('half.txt'), text)
  assert.ok(text.endsWith('Tell the user what was removed.'), text)
  assert.ok(!text.includes('Removing some of it failed'), text)

  for (const n of NAMES) assert.equal(fs.existsSync(wt(n)), false)
  assert.deepEqual(git.branchesMatching(repo, 'tierminator/'), ['tierminator/0123abcd/T06', 'tierminator/experiment'])
  const listed = git.worktreeList(repo)
  for (const p of [wt('mine'), wt('tierminator-notes'), outside]) {
    assert.ok(fs.existsSync(p), p)
    assert.ok(listed.some(l => git.samePath(l.path, p)), p)
  }
  gitIn(repo, 'rev-parse', '--verify', '-q', 'refs/heads/mine')
  gitIn(repo, 'rev-parse', '--verify', '-q', 'refs/heads/notes')
  assert.equal(git.isClean(repo), true)
})

test('tidy with nothing left says nothing', () => {
  const repo = makeRepo(path.join(dir, 'repo'))
  assert.equal(leftovers.tidy(repo), '')
  assert.deepEqual(leftovers.find(repo), { worktrees: [], branches: [] })
})

test('reportText names discarded changes and failures', () => {
  assert.equal(
    leftovers.reportText(
      { worktrees: [{ path: 'C:/r/w', branch: 'b', dirty: ['a', 'b', 'c', 'd', 'e', 'f'] }], branches: ['tierminator/0123abcd/T02'] },
      ['x'],
    ),
    'tierminator removed what an earlier run left: worktree C:/r/w; branch tierminator/0123abcd/T02. C:/r/w had uncommitted changes (a, b, c, d, e, ...), which are discarded. Removing some of it failed, so it is left in place: x. Tell the user what was removed.',
  )
  assert.equal(
    leftovers.reportText({ worktrees: [], branches: ['tierminator/0123abcd/T02', 'tierminator/0123abcd/T03'] }),
    'tierminator removed what an earlier run left: branches tierminator/0123abcd/T02, tierminator/0123abcd/T03. Tell the user what was removed.',
  )
})
