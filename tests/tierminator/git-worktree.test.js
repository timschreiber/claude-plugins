'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const g = require('../../plugins/tierminator/scripts/lib/git.js')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-wt-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

const run = (cwd, ...args) => {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
const write = (cwd, name, text) => fs.writeFileSync(path.join(cwd, name), text)

// A repository with one commit holding README.md and a .gitignore that ignores *.log.
function repo(name = 'repo') {
  const r = path.join(dir, name)
  fs.mkdirSync(r, { recursive: true })
  run(r, 'init', '-q', '-b', 'main')
  run(r, 'config', 'user.name', 'Test')
  run(r, 'config', 'user.email', 'test@example.com')
  run(r, 'config', 'commit.gpgsign', 'false')
  run(r, 'config', 'core.autocrlf', 'false')
  write(r, 'README.md', '# test\n')
  write(r, '.gitignore', '*.log\n')
  run(r, 'add', '-A')
  run(r, 'commit', '-q', '-m', 'init')
  return r
}

// Writes a file and commits it, one -m per message; returns the new HEAD.
function commit(cwd, file, text, ...messages) {
  write(cwd, file, text)
  run(cwd, 'add', '-A')
  run(cwd, 'commit', '-q', ...messages.flatMap(m => ['-m', m]))
  return g.head(cwd)
}
const slot = (r, name) => path.join(r, '.claude', 'worktrees', name)

test('toWorktreePath is null for a non-path, resolves relative paths and is idempotent', () => {
  assert.equal(g.toWorktreePath(undefined), null)
  assert.equal(g.toWorktreePath(''), null)
  assert.equal(g.toWorktreePath('some/rel'), g.toWorktreePath(path.resolve('some/rel')))
  const once = g.toWorktreePath(dir)
  assert.equal(g.toWorktreePath(once), once)
})

test('toWorktreePath gives the C:/Users/... form on Windows', { skip: process.platform !== 'win32' }, () => {
  const t = g.toWorktreePath(os.tmpdir())
  assert.match(t, /^[A-Z]:\//)
  assert.ok(!t.includes('\\'))
  assert.equal(g.toWorktreePath('C:/Users/x/y'), 'C:/Users/x/y')
  assert.equal(g.toWorktreePath('c:\\Users\\x'), 'C:/Users/x')
  assert.equal(g.toWorktreePath('/c/Users/x'), 'C:/Users/x')
})

test('worktreeList lists the main worktree first, with branch, head, locked and detached state', () => {
  const r = repo()
  const wt = slot(r, 'tierminator-aaaa1111-T01')
  run(r, 'worktree', 'add', '-q', '-b', 'tierminator/aaaa1111/T01', wt)
  let list = g.worktreeList(r)
  assert.equal(list.length, 2)
  assert.equal(list[0].path, g.toWorktreePath(r))
  assert.equal(list[0].branch, 'main')
  assert.equal(list[1].path, g.toWorktreePath(wt))
  assert.equal(list[1].branch, 'tierminator/aaaa1111/T01')
  assert.equal(list[1].head, g.head(r))
  assert.equal(list[1].locked, false)

  run(r, 'worktree', 'lock', wt)
  list = g.worktreeList(r)
  assert.equal(list[1].locked, true)

  const det = slot(r, 'detached')
  run(r, 'worktree', 'add', '-q', '--detach', det)
  list = g.worktreeList(r)
  assert.equal(list.find(w => w.path === g.toWorktreePath(det)).branch, null)

  assert.deepEqual(g.worktreeList(path.join(dir, 'missing')), [])
})

test('branchesMatching returns the sorted local branches under a tierminator/ prefix', () => {
  const r = repo()
  for (const b of ['tierminator/aaaa1111/T01', 'tierminator/aaaa1111/T02', 'tierminator/bbbb2222/T01', 'feature/x', 'tierminatorx', 'my/tierminator/T01']) {
    run(r, 'branch', b)
  }
  assert.deepEqual(g.branchesMatching(r), ['tierminator/aaaa1111/T01', 'tierminator/aaaa1111/T02', 'tierminator/bbbb2222/T01'])
  assert.deepEqual(g.branchesMatching(r, 'tierminator/aaaa1111/'), ['tierminator/aaaa1111/T01', 'tierminator/aaaa1111/T02'])
  assert.deepEqual(g.branchesMatching(r, 'feature/'), [])
  assert.deepEqual(g.branchesMatching(r, ''), [])
  assert.deepEqual(g.branchesMatching(path.join(dir, 'missing')), [])
})

test('worktreesMatching finds only tierminator slots directly inside .claude/worktrees', () => {
  const r = repo()
  const add = (p, b) => run(r, 'worktree', 'add', '-q', '-b', b, p)
  const a = slot(r, 'tierminator-aaaa1111-T01')
  const b = slot(r, 'tierminator-bbbb2222-T02')
  const mine = slot(r, 'mine')
  add(a, 'b-a')
  add(b, 'b-b')
  add(slot(r, 'agent-a1b2c3'), 'b-agent')
  add(mine, 'b-mine')
  add(path.join(r, '.claude', 'worktrees', 'sub', 'tierminator-nested'), 'b-nested')
  add(path.join(dir, 'tierminator-outside'), 'b-outside')

  const want = [g.toWorktreePath(a), g.toWorktreePath(b)].sort()
  const paths = list => list.map(w => w.path).sort()
  assert.deepEqual(paths(g.worktreesMatching(r)), want)
  assert.deepEqual(paths(g.worktreesMatching(r, 'tierminator-aaaa1111-')), [g.toWorktreePath(a)])
  assert.deepEqual(g.worktreesMatching(r, 'agent-'), [])
  assert.deepEqual(paths(g.worktreesMatching(mine)), want)
})
