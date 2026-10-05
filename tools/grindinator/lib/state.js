// Grindinator's run state: .grindinator/state.json (written atomically) and one done marker per
// package under .grindinator/done/. The marker is the source of truth for "done"; state.json
// records the rest. Problems the user must fix are GrindinatorErrors.
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { GrindinatorError } = require('./errors.js')
const { isPackageId } = require('./packages.js')

const STATE_VERSION = 1
const STATUSES = ['pending', 'running', 'done', 'failed']

// Mutable so tests can lower them.
const limits = { retryMs: 20, attempts: 10 }

function stateDir(root) {
  return path.join(root, '.grindinator')
}

function statePath(root) {
  return path.join(stateDir(root), 'state.json')
}

function assertId(id) {
  if (!isPackageId(id)) throw new GrindinatorError(`"${id}" is not a package id such as WP-01`)
}

function donePath(root, id) {
  assertId(id)
  return path.join(stateDir(root), 'done', `${id}.done`)
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  try {
    fs.writeFileSync(tmp, text)
    for (let attempt = 1; ; attempt++) {
      try {
        fs.renameSync(tmp, file)
        return
      } catch (e) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(e.code) || attempt >= limits.attempts) throw e
        sleep(limits.retryMs)
      }
    }
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true })
    } catch {}
    throw e
  }
}

function create({ runName, branch, packagesDir, baseCommit, now = new Date() }) {
  const stamp = now.toISOString()
  return {
    version: STATE_VERSION,
    runName,
    branch,
    packagesDir,
    baseCommit,
    createdAt: stamp,
    updatedAt: stamp,
    packages: {},
  }
}

function read(root) {
  const file = statePath(root)
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
  let state
  try {
    state = JSON.parse(text)
  } catch {
    throw new GrindinatorError(`${file}: is not valid JSON; delete .grindinator/ to start over`)
  }
  const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
  if (!plain(state) || state.version !== STATE_VERSION || !plain(state.packages)) {
    throw new GrindinatorError(
      `${file}: is not a Grindinator state file (version 1); delete .grindinator/ to start over`
    )
  }
  return state
}

function write(root, state, now = new Date()) {
  state.updatedAt = now.toISOString()
  writeAtomic(statePath(root), JSON.stringify(state, null, 2) + '\n')
}

function ensurePackages(state, packages) {
  for (const { id, title, name } of packages) {
    const existing = state.packages[id]
    if (!existing) {
      state.packages[id] = {
        title,
        file: name,
        status: 'pending',
        attempts: [],
        startedAt: null,
        endedAt: null,
      }
    } else {
      existing.title = title
      existing.file = name
    }
  }
  return state
}

function isDone(root, id) {
  return fs.existsSync(donePath(root, id))
}

function markDone(root, id, now = new Date()) {
  writeAtomic(donePath(root, id), now.toISOString() + '\n')
}

function clearDone(root, id) {
  const file = donePath(root, id)
  if (!fs.existsSync(file)) return false
  fs.rmSync(file, { force: true })
  return true
}

function statusOf(root, state, id) {
  if (isDone(root, id)) return 'done'
  const status = state?.packages?.[id]?.status
  return status === 'running' || status === 'failed' ? status : 'pending'
}

module.exports = {
  STATE_VERSION,
  STATUSES,
  limits,
  stateDir,
  statePath,
  donePath,
  assertId,
  writeAtomic,
  create,
  read,
  write,
  ensurePackages,
  isDone,
  markDone,
  clearDone,
  statusOf,
}
