'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { tempDir, remove, sidecarText, logText, makeRepo, git } = require('./helpers.js')
const gitLib = require('../../tools/grindinator/lib/git.js')
const { repoPaths, fileHash, openEntries, prepare, commitDecisions } = require('../../tools/grindinator/lib/decisions.js')
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

function gitSetup(t) {
  const root = makeRepo()
  const home = tempDir('grind-dec-home-')
  t.after(() => { remove(root); remove(home) })
  git(root, 'checkout', '-q', '-b', 'grindinator/t')
  gitLib.ensureExcluded(root)
  return { root, repo: repoPaths({ root, homeDir: home }) }
}

function commitFile(root, rel, text) {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, text)
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'add ' + rel)
}

function writeRun(root, kind, text) {
  const file = decisionPaths(root)[kind]
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return file
}

test('prepare seeds an existing repo file and records the hashes', t => {
  const { root, repo } = gitSetup(t)
  commitFile(root, 'docs/decisions.md', logText('a'))
  const st = {}
  assert.deepEqual(prepare({ root, st, repo }), ['docs/decisions.md'])
  assert.equal(fs.readFileSync(decisionPaths(root).log, 'utf8'), logText('a'))
  assert.equal(st.decisions.log.repo, 'docs/decisions.md')
  assert.equal(st.decisions.log.hash, fileHash(repo.log.abs))
  assert.equal(st.decisions.sidecar.hash, null)
  assert.equal(fs.existsSync(decisionPaths(root).sidecar), false)
})

test('a second prepare keeps an edited run copy', t => {
  const { root, repo } = gitSetup(t)
  commitFile(root, 'docs/decisions.md', logText('a'))
  const st = {}
  prepare({ root, st, repo })
  writeRun(root, 'log', logText('edited'))
  assert.deepEqual(prepare({ root, st, repo }), [])
  assert.equal(fs.readFileSync(decisionPaths(root).log, 'utf8'), logText('edited'))
})

test('prepare refuses when the committed repo file changed', t => {
  const { root, repo } = gitSetup(t)
  commitFile(root, 'docs/decisions.md', logText('a'))
  const st = {}
  prepare({ root, st, repo })
  const before = JSON.stringify(st.decisions)
  commitFile(root, 'docs/decisions.md', logText('b'))
  assert.throws(() => prepare({ root, st, repo }),
    err => err instanceof GrindinatorError && err.exitCode === 2 && /docs\/decisions\.md changed since Grindinator last copied it/.test(err.message))
  assert.equal(JSON.stringify(st.decisions), before)
})

test('prepare refuses a run copy with no record', t => {
  const { root, repo } = gitSetup(t)
  writeRun(root, 'log', logText('a'))
  assert.throws(() => prepare({ root, st: {}, repo }), err => err instanceof GrindinatorError && err.exitCode === 2)
})

test('commitDecisions with no run copies is unchanged', t => {
  const { root, repo } = gitSetup(t)
  assert.deepEqual(commitDecisions({ root, st: {}, repo, packageId: 'WP-01' }), { status: 'unchanged', commit: null, files: [] })
})

test('commitDecisions commits both changed run copies', t => {
  const { root, repo } = gitSetup(t)
  const st = {}
  writeRun(root, 'log', logText('a'))
  writeRun(root, 'sidecar', sidecarText([{ id: 'Q-0001', topic: 'First' }]))
  const r = commitDecisions({ root, st, repo, packageId: 'WP-01' })
  assert.equal(r.status, 'committed')
  assert.equal(git(root, 'log', '-1', '--format=%s'), 'chore(grindinator): decisions for WP-01')
  assert.deepEqual(git(root, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort(), ['docs/decisions.md', 'docs/open-questions.md'])
  assert.equal(fs.readFileSync(repo.log.abs, 'utf8'), fs.readFileSync(decisionPaths(root).log, 'utf8'))
  assert.equal(fs.readFileSync(repo.sidecar.abs, 'utf8'), fs.readFileSync(decisionPaths(root).sidecar, 'utf8'))
  assert.equal(st.decisions.log.hash, fileHash(repo.log.abs))
  assert.equal(st.decisions.sidecar.hash, fileHash(repo.sidecar.abs))
  assert.equal(r.commit, git(root, 'rev-parse', 'HEAD'))
  assert.equal(commitDecisions({ root, st, repo, packageId: 'WP-01' }).status, 'unchanged')
})

test('commitDecisions reports a git add failure', t => {
  const { root, repo } = gitSetup(t)
  commitFile(root, '.gitignore', 'docs/\n')
  writeRun(root, 'log', logText('a'))
  const r = commitDecisions({ root, st: {}, repo, packageId: 'WP-01' })
  assert.equal(r.status, 'failed')
  assert.match(r.reason, /git add failed/)
})
