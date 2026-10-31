'use strict'

const { test, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { git, fwd, defaultBase, commitsOf, snapshot } = require('./e2e/lib.js')

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tierminator-e2elib-'))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Test')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'commit.gpgsign', 'false')
  git(dir, 'config', 'core.autocrlf', 'false')
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'one', '-m', 'Tierminator-Task: T01')
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

test('git returns output and throws on failure', () => {
  assert.match(git(dir, 'rev-parse', 'HEAD'), /^[0-9a-f]{40}$/)
  assert.throws(() => git(dir, 'no-such-command'), Error)
})

test('fwd has no backslash', () => {
  assert.equal(fwd(dir).includes('\\'), false)
})

test('defaultBase stamps local time', () => {
  const b = defaultBase(3, new Date(2026, 9, 31, 8, 5, 9))
  assert.ok(b.endsWith('/s3-20261031080509'), b)
  assert.equal(b.includes('\\'), false)
})

test('commitsOf lists subject and body', () => {
  assert.deepEqual(commitsOf(dir), [{ subject: 'one', body: 'Tierminator-Task: T01' }])
})

test('snapshot lists worktrees and tierminator branches', () => {
  let s = snapshot(dir)
  assert.equal(s.worktrees.length, 1)
  assert.deepEqual(s.branches, [])
  git(dir, 'branch', 'tierminator/abcd1234/T01')
  s = snapshot(dir)
  assert.deepEqual(s.branches, ['tierminator/abcd1234/T01'])
})
