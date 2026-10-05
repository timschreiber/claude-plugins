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
