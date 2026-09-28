'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const g = require('../../plugins/planandtier/scripts/lib/git.js')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planandtier-git-'))
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
  fs.mkdirSync(r)
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

test('problem() names what makes a directory unusable, and is null for a clean repository', () => {
  const plain = path.join(dir, 'plain')
  fs.mkdirSync(plain)
  assert.match(g.problem(plain), /not inside a Git repository/)
  assert.match(g.problem(undefined), /working directory is unknown/)

  const empty = path.join(dir, 'empty')
  fs.mkdirSync(empty)
  run(empty, 'init', '-q')
  assert.match(g.problem(empty), /no commits yet/)

  const r = repo()
  assert.equal(g.problem(r), null)
  write(r, 'build.log', 'ignored')
  assert.equal(g.problem(r), null, 'ignored files do not count')
  write(r, 'new.txt', 'x')
  assert.match(g.problem(r), /uncommitted changes \(new\.txt\)/)
  fs.rmSync(path.join(r, 'new.txt'))
  write(r, 'README.md', 'changed\n')
  assert.match(g.problem(r), /uncommitted changes \(README\.md\)/)
})

test('head, branch and isClean read the repository', () => {
  const r = repo()
  assert.match(g.head(r), /^[0-9a-f]{40}$/)
  assert.equal(g.branch(r), 'main')
  assert.equal(g.isClean(r), true)
  write(r, 'x.txt', 'x')
  assert.equal(g.isClean(r), false)
  assert.equal(g.head(path.join(dir, 'nope')), null)
})

test('commitsSince lists the new commits oldest first, with their full messages', () => {
  const r = repo()
  const base = g.head(r)
  assert.deepEqual(g.commitsSince(r, base), [])
  write(r, 'a.txt', 'a')
  run(r, 'add', '-A')
  run(r, 'commit', '-q', '-m', 'Add a', '-m', 'Planandtier-Task: T01')
  write(r, 'b.txt', 'b')
  run(r, 'add', '-A')
  run(r, 'commit', '-q', '-m', 'Add b')
  const commits = g.commitsSince(r, base)
  assert.equal(commits.length, 2)
  assert.match(commits[0].message, /^Add a\n\nPlanandtier-Task: T01$/)
  assert.equal(commits[1].message, 'Add b')
  assert.equal(commits[1].sha, g.head(r))
})

test('isPushed is true only for commits a remote-tracking branch contains, and for unknown commits', () => {
  const remote = path.join(dir, 'remote.git')
  run(dir, 'init', '-q', '--bare', remote)
  const r = repo()
  run(r, 'remote', 'add', 'origin', remote)
  run(r, 'push', '-q', 'origin', 'main')
  const pushed = g.head(r)
  write(r, 'c.txt', 'c')
  run(r, 'add', '-A')
  run(r, 'commit', '-q', '-m', 'local only')
  assert.equal(g.isPushed(r, pushed), true)
  assert.equal(g.isPushed(r, g.head(r)), false)
  assert.equal(g.isPushed(r, '0000000000000000000000000000000000000000'), true)
})

test('resetTo removes new commits, changes and untracked files, and keeps ignored files', () => {
  const r = repo()
  const base = g.head(r)
  write(r, 'a.txt', 'a')
  run(r, 'add', '-A')
  run(r, 'commit', '-q', '-m', 'attempt')
  write(r, 'README.md', 'changed\n')
  write(r, 'untracked.txt', 'u')
  fs.mkdirSync(path.join(r, 'newdir'))
  write(r, 'newdir/inner.txt', 'i')
  write(r, 'keep.log', 'ignored')

  assert.equal(g.resetTo(r, base), true)
  assert.equal(g.head(r), base)
  assert.equal(g.isClean(r), true)
  assert.equal(fs.readFileSync(path.join(r, 'README.md'), 'utf8'), '# test\n')
  assert.equal(fs.existsSync(path.join(r, 'a.txt')), false)
  assert.equal(fs.existsSync(path.join(r, 'untracked.txt')), false)
  assert.equal(fs.existsSync(path.join(r, 'newdir')), false)
  assert.equal(fs.existsSync(path.join(r, 'keep.log')), true)
})

test('resetTo reports failure instead of throwing', () => {
  assert.equal(g.resetTo(path.join(dir, 'nope'), 'HEAD'), false)
  const r = repo()
  assert.equal(g.resetTo(r, 'not-a-commit'), false)
})
