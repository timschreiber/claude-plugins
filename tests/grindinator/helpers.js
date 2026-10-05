// Shared helpers for the Grindinator tests: temp directories, a git runner and a ready repository.
// Not a test file.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const tempDir = prefix => fs.mkdtempSync(path.join(os.tmpdir(), prefix))

function git(cwd, ...args) {
  const env = { ...process.env }
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY']) delete env[key]
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, env })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  return (r.stdout ?? '').trim()
}

// A temp repository on main with one commit.
function makeRepo() {
  const dir = tempDir('grind-repo-')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Grindinator Test')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'commit.gpgsign', 'false')
  git(dir, 'config', 'core.autocrlf', 'false')
  fs.writeFileSync(path.join(dir, 'README.md'), 'test\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'init')
  return dir
}

function writePackages(dir, names) {
  fs.mkdirSync(dir, { recursive: true })
  for (const name of names) fs.writeFileSync(path.join(dir, name), `# ${name}\n`)
}

const remove = dir => fs.rmSync(dir, { recursive: true, force: true })

module.exports = { tempDir, git, makeRepo, writePackages, remove }
