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

const STUB = path.join(__dirname, 'fixtures', 'claude-stub.js')

const INIT = { type: 'system', subtype: 'init', session_id: 'stub-session' }

function resultRecord(overrides = {}) {
  return {
    version: 1,
    sessionId: 'stub-session',
    outcome: 'complete',
    planFile: '/plans/p.md',
    tasksFile: '/plans/p.tasks.json',
    tasksDone: ['T01'],
    tasksNotRun: [],
    haltedAt: null,
    reason: null,
    limit: null,
    headCommit: null,
    endedAt: '2026-10-05T00:00:00.000Z',
    ...overrides
  }
}

function completeScenario() {
  return {
    stream: [
      INIT,
      { type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: 'stub-session', result_index: 0 }
    ],
    resultFile: resultRecord(),
    exitCode: 0
  }
}

// Writes the scenario to <dir>/scenario.json and returns an environment that runs the stub with it.
function stubEnv(dir, scenario) {
  const file = path.join(dir, 'scenario.json')
  fs.writeFileSync(file, JSON.stringify(scenario))
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('GRINDINATOR_STUB_') || key.startsWith('DECIDINATOR_')) delete env[key]
  }
  delete env.TIERMINATOR_RESULT_FILE
  env.GRINDINATOR_CLAUDE_BIN = STUB
  env.GRINDINATOR_STUB_SCENARIO = file
  env.GRINDINATOR_STUB_LOG = path.join(dir, 'stub-log.jsonl')
  return env
}

function readStubLog(dir) {
  const file = path.join(dir, 'stub-log.jsonl')
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
}

function waitFor(fn, ms = 10000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + ms
    const tick = () => {
      let value
      try { value = fn() } catch { value = false }
      if (value) return resolve(value)
      if (Date.now() >= deadline) return reject(new Error(`waitFor: timed out after ${ms} ms`))
      setTimeout(tick, 25)
    }
    tick()
  })
}

module.exports = {
  tempDir, git, makeRepo, writePackages, remove,
  STUB, INIT, resultRecord, completeScenario, stubEnv, readStubLog, waitFor
}
