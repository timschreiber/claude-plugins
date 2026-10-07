'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { tempDir, remove, sidecarText } = require('./helpers.js')
const { repoPaths, fileHash, openEntries } = require('../../tools/grindinator/lib/decisions.js')
const { decisionPaths } = require('../../tools/grindinator/lib/session.js')
const { GrindinatorError } = require('../../tools/grindinator/lib/errors.js')

function setup(t) {
  const root = tempDir('grind-dec-root-')
  const home = tempDir('grind-dec-home-')
  t.after(() => { remove(root); remove(home) })
  return { root, home }
}

function writeConfig(dir, obj) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude', 'decidinator.json'), JSON.stringify(obj))
}

test('repoPaths gives the defaults', t => {
  const { root, home } = setup(t)
  const p = repoPaths({ root, homeDir: home })
  assert.equal(p.log.rel, 'docs/decisions.md')
  assert.equal(p.sidecar.rel, 'docs/open-questions.md')
  assert.equal(p.log.abs, path.resolve(root, 'docs/decisions.md'))
})

test('repoPaths applies the user file', t => {
  const { root, home } = setup(t)
  writeConfig(home, { decisionLog: 'u/log.md', sidecar: 'u/side.md' })
  const p = repoPaths({ root, homeDir: home })
  assert.equal(p.log.rel, 'u/log.md')
  assert.equal(p.sidecar.rel, 'u/side.md')
})

test('repoPaths: the project file beats the user file', t => {
  const { root, home } = setup(t)
  writeConfig(home, { decisionLog: 'u/log.md', sidecar: 'u/side.md' })
  writeConfig(root, { decisionLog: 'p/log.md' })
  const p = repoPaths({ root, homeDir: home })
  assert.equal(p.log.rel, 'p/log.md')
  assert.equal(p.sidecar.rel, 'u/side.md')
})

test('repoPaths ignores an invalid value', t => {
  const { root, home } = setup(t)
  writeConfig(root, { decisionLog: '', sidecar: 'p/side.md' })
  const p = repoPaths({ root, homeDir: home })
  assert.equal(p.log.rel, 'docs/decisions.md')
  assert.equal(p.sidecar.rel, 'p/side.md')
})

test('repoPaths falls back to the defaults when both paths are identical', t => {
  const { root, home } = setup(t)
  writeConfig(root, { decisionLog: 'x/same.md', sidecar: 'x\\same.md' })
  const p = repoPaths({ root, homeDir: home })
  assert.equal(p.log.rel, 'docs/decisions.md')
  assert.equal(p.sidecar.rel, 'docs/open-questions.md')
})

test('repoPaths refuses a path outside the repository', t => {
  const { root, home } = setup(t)
  const check = err => err instanceof GrindinatorError && err.exitCode === 2 && /outside the repository/.test(err.message)
  writeConfig(root, { decisionLog: '../x.md' })
  assert.throws(() => repoPaths({ root, homeDir: home }), check)
  writeConfig(root, { sidecar: path.join(home, 'x.md') })
  assert.throws(() => repoPaths({ root, homeDir: home }), check)
})

test('repoPaths accepts an absolute path inside the repository', t => {
  const { root, home } = setup(t)
  writeConfig(root, { decisionLog: path.join(root, 'sub', 'log.md') })
  const p = repoPaths({ root, homeDir: home })
  assert.equal(p.log.rel, 'sub/log.md')
})

test('repoPaths refuses a path inside .grindinator', t => {
  const { root, home } = setup(t)
  writeConfig(root, { decisionLog: '.grindinator/x.md' })
  assert.throws(() => repoPaths({ root, homeDir: home }),
    err => err instanceof GrindinatorError && err.exitCode === 2 && /inside \.grindinator\//.test(err.message))
})

test('fileHash is null for a missing file and the sha256 for a present one', t => {
  const { root } = setup(t)
  assert.equal(fileHash(path.join(root, 'none.md')), null)
  const file = path.join(root, 'a.md')
  fs.writeFileSync(file, 'abc')
  assert.equal(fileHash(file), crypto.createHash('sha256').update('abc').digest('hex'))
})

test('openEntries returns [] with no file and the open entries otherwise', t => {
  const { root } = setup(t)
  assert.deepEqual(openEntries(root), [])
  const file = decisionPaths(root).sidecar
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, sidecarText([
    { id: 'Q-0001', topic: 'First', dependsOn: 'WP-01; WP-02' },
    { id: 'Q-0002', topic: 'Second', status: 'answered' }
  ]))
  assert.deepEqual(openEntries(root), [{ id: 'Q-0001', topic: 'First', dependsOn: ['WP-01', 'WP-02'] }])
})
