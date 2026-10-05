// Tests for the Grindinator Git helpers, run against real temporary repositories.
'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const g = require('../../tools/grindinator/lib/git')
const { GrindinatorError } = require('../../tools/grindinator/lib/errors')
const h = require('./helpers')

test('toplevel finds the root from a subdirectory and is null outside a repository', () => {
  const repo = h.makeRepo()
  const plain = h.tempDir('grind-plain-')
  try {
    const sub = path.join(repo, 'sub')
    fs.mkdirSync(sub)
    const top = g.toplevel(sub)
    assert.notEqual(top, null)
    assert.equal(top, g.toplevel(repo))
    assert.equal(g.toplevel(plain), null)
  } finally {
    h.remove(repo)
    h.remove(plain)
  }
})

test('checkRepo rejects a repository without commits and accepts one with a commit', () => {
  const empty = h.tempDir('grind-empty-')
  const repo = h.makeRepo()
  try {
    h.git(empty, 'init', '-q', '-b', 'main')
    assert.throws(() => g.checkRepo(empty), e => {
      assert.ok(e instanceof GrindinatorError)
      assert.equal(e.exitCode, 2)
      assert.equal(e.message, 'the repository has no commits yet; commit once, then run again')
      return true
    })
    assert.doesNotThrow(() => g.checkRepo(repo))
  } finally {
    h.remove(empty)
    h.remove(repo)
  }
})

test('checkClean passes when clean and names up to five dirty paths', () => {
  const repo = h.makeRepo()
  try {
    assert.doesNotThrow(() => g.checkClean(repo))
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n')
    assert.throws(() => g.checkClean(repo), e => {
      assert.ok(e instanceof GrindinatorError)
      assert.equal(e.exitCode, 2)
      assert.match(e.message, /a\.txt/)
      return true
    })
    fs.rmSync(path.join(repo, 'a.txt'))
    for (let i = 1; i <= 7; i++) fs.writeFileSync(path.join(repo, `f${i}.txt`), 'x\n')
    assert.throws(() => g.checkClean(repo), e => {
      assert.ok(e.message.endsWith(', ...); commit or stash them, then run again'))
      assert.equal(e.message.match(/f\d\.txt/g).length, 5)
      return true
    })
  } finally {
    h.remove(repo)
  }
})

test('createBranch and switchBranch move between branches', () => {
  const repo = h.makeRepo()
  try {
    g.createBranch(repo, 'grindinator/x')
    assert.equal(g.currentBranch(repo), 'grindinator/x')
    assert.equal(g.branchExists(repo, 'grindinator/x'), true)
    assert.throws(() => g.createBranch(repo, 'grindinator/x'), GrindinatorError)
    g.switchBranch(repo, 'main')
    assert.equal(g.currentBranch(repo), 'main')
  } finally {
    h.remove(repo)
  }
})

test('ensureExcluded appends the entry once and keeps the tree clean', () => {
  const repo = h.makeRepo()
  try {
    const file = path.resolve(repo, h.git(repo, 'rev-parse', '--git-path', 'info/exclude'))
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '# existing\nfoo')
    assert.equal(g.ensureExcluded(repo), true)
    assert.equal(g.ensureExcluded(repo), false)
    const text = fs.readFileSync(file, 'utf8')
    assert.equal(text, '# existing\nfoo\n/.grindinator/\n')
    assert.equal(text.split('\n').filter(l => l === g.EXCLUDE_ENTRY).length, 1)
    fs.mkdirSync(path.join(repo, '.grindinator'))
    fs.writeFileSync(path.join(repo, '.grindinator', 'state.json'), '{}\n')
    assert.doesNotThrow(() => g.checkClean(repo))
  } finally {
    h.remove(repo)
  }
})

test('discard refuses off the run branch', () => {
  const repo = h.makeRepo()
  try {
    h.git(repo, 'branch', 'grindinator/t')
    fs.writeFileSync(path.join(repo, 'README.md'), 'changed\n')
    fs.writeFileSync(path.join(repo, 'stray.txt'), 'x\n')
    assert.throws(() => g.discard(repo, 'grindinator/t'), e => {
      assert.ok(e instanceof GrindinatorError)
      assert.equal(e.exitCode, 2)
      assert.ok(e.message.includes('refusing to discard changes: the current branch is main, not the run branch grindinator/t'))
      return true
    })
    assert.throws(() => g.discard(repo, 'main'), e => {
      assert.ok(e instanceof GrindinatorError)
      assert.ok(e.message.includes('main is not a Grindinator run branch'))
      return true
    })
    assert.equal(fs.existsSync(path.join(repo, 'stray.txt')), true)
    assert.equal(fs.readFileSync(path.join(repo, 'README.md'), 'utf8'), 'changed\n')
  } finally {
    h.remove(repo)
  }
})

test('discard on the run branch resets, cleans and keeps .grindinator', () => {
  const repo = h.makeRepo()
  try {
    h.git(repo, 'switch', '-q', '-c', 'grindinator/t')
    g.ensureExcluded(repo)
    fs.mkdirSync(path.join(repo, '.grindinator'))
    fs.writeFileSync(path.join(repo, '.grindinator', 'state.json'), '{}')
    fs.writeFileSync(path.join(repo, 'README.md'), 'changed\n')
    fs.mkdirSync(path.join(repo, 'dir'))
    fs.writeFileSync(path.join(repo, 'dir', 'new.txt'), 'x\n')
    const paths = g.discard(repo, 'grindinator/t')
    assert.ok(paths.includes('README.md'))
    assert.ok(paths.includes('dir/'))
    assert.equal(fs.readFileSync(path.join(repo, 'README.md'), 'utf8'), 'test\n')
    assert.equal(fs.existsSync(path.join(repo, 'dir')), false)
    assert.equal(fs.existsSync(path.join(repo, '.grindinator', 'state.json')), true)
    assert.equal(h.git(repo, 'status', '--porcelain'), '')
  } finally {
    h.remove(repo)
  }
})

test('commitsSince counts commits since an ancestor', () => {
  const repo = h.makeRepo()
  try {
    const start = g.head(repo)
    assert.equal(g.commitsSince(repo, start), 0)
    for (const f of ['a.txt', 'b.txt']) {
      fs.writeFileSync(path.join(repo, f), 'x\n')
      h.git(repo, 'add', '-A')
      h.git(repo, 'commit', '-q', '-m', f)
    }
    assert.equal(g.commitsSince(repo, start), 2)
    assert.equal(g.commitsSince(repo, null), null)
    h.git(repo, 'switch', '-q', '-c', 'side', start)
    fs.writeFileSync(path.join(repo, 'c.txt'), 'x\n')
    h.git(repo, 'add', '-A')
    h.git(repo, 'commit', '-q', '-m', 'c')
    const side = g.head(repo)
    h.git(repo, 'switch', '-q', 'main')
    assert.equal(g.commitsSince(repo, side), null)
  } finally {
    h.remove(repo)
  }
})
