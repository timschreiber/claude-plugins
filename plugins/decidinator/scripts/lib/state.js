// Per-session state for Decidinator: ${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json (the session's
// working state) and the arming flag beside it, <session_id>.armed, a JSON object {mode, armedAt, by}
// which the state file's own removal leaves alone. update() runs a read-modify-write under a lock file,
// because hooks of one session can run close together. Every function swallows filesystem errors and
// returns a "nothing happened" value, because a hook must never fail loudly.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { debug } = require('./debug.js')
const { withLock } = require('./fileio.js')

const MODES = ['ask', 'sidecar']
const PRUNE_DAYS = 7
const BY = ['command', 'env']
const DAY_MS = 24 * 60 * 60 * 1000

function dataDir() {
  return process.env.CLAUDE_PLUGIN_DATA || path.join(os.tmpdir(), 'decidinator')
}

function sessionsDir() {
  return path.join(dataDir(), 'sessions')
}

// Session ids come from hook input; keep only filename-safe characters.
function safeId(sessionId) {
  return String(sessionId ?? '').replace(/[^A-Za-z0-9_-]/g, '') || null
}

function fileFor(sessionId) {
  const safe = safeId(sessionId)
  return safe ? path.join(sessionsDir(), `${safe}.json`) : null
}

function flagFor(sessionId) {
  const safe = safeId(sessionId)
  return safe ? path.join(sessionsDir(), `${safe}.armed`) : null
}

function read(sessionId) {
  try {
    const file = fileFor(sessionId)
    return file ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
  } catch {
    return null
  }
}

// Writes atomically (temp file, then rename). Returns true when the state was saved.
function write(sessionId, state) {
  try {
    const file = fileFor(sessionId)
    if (!file) return false
    fs.mkdirSync(sessionsDir(), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(state))
    fs.renameSync(tmp, file)
    debug(`state ${safeId(sessionId)}: written`)
    return true
  } catch {
    return false
  }
}

// Locked read-modify-write. mutate(current|null) returns the new state, or null to leave it alone.
// Returns true when the new state was saved.
function update(sessionId, mutate) {
  try {
    const file = fileFor(sessionId)
    if (!file) return false
    const r = withLock(file, () => {
      const next = mutate(read(sessionId))
      return next ? write(sessionId, next) : false
    })
    return r === true
  } catch {
    return false
  }
}

function remove(sessionId) {
  try {
    const file = fileFor(sessionId)
    if (file) fs.rmSync(file, { force: true })
  } catch {}
}

// Returns {mode, armedAt, by} for a valid arming flag, else null.
function readArming(sessionId) {
  try {
    const flag = flagFor(sessionId)
    if (!flag) return null
    const obj = JSON.parse(fs.readFileSync(flag, 'utf8'))
    if (!obj || !MODES.includes(obj.mode) || !BY.includes(obj.by) || typeof obj.armedAt !== 'string') return null
    return { mode: obj.mode, armedAt: obj.armedAt, by: obj.by }
  } catch {
    return null
  }
}

function arm(sessionId, mode, by) {
  try {
    const flag = flagFor(sessionId)
    if (!flag || !MODES.includes(mode) || !BY.includes(by)) return false
    fs.mkdirSync(sessionsDir(), { recursive: true })
    fs.writeFileSync(flag, JSON.stringify({ mode, armedAt: new Date().toISOString(), by }))
    debug(`state ${safeId(sessionId)}: armed ${mode} by ${by}`)
    return true
  } catch {
    return false
  }
}

function setMode(sessionId, mode) {
  try {
    const current = readArming(sessionId)
    if (!current || !MODES.includes(mode)) return false
    fs.writeFileSync(flagFor(sessionId), JSON.stringify({ mode, armedAt: current.armedAt, by: current.by }))
    debug(`state ${safeId(sessionId)}: mode ${mode}`)
    return true
  } catch {
    return false
  }
}

function disarm(sessionId) {
  try {
    const flag = flagFor(sessionId)
    if (flag) fs.rmSync(flag, { force: true })
  } catch {}
  remove(sessionId)
  debug(`state ${safeId(sessionId)}: disarmed`)
}

// Removes every file of one session: those named "<safe id>." followed by anything.
function removeSession(sessionId) {
  try {
    const safe = safeId(sessionId)
    if (!safe) return
    const dir = sessionsDir()
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.startsWith(`${safe}.`)) {
        try {
          fs.rmSync(path.join(dir, entry.name), { force: true })
        } catch {}
      }
    }
    debug(`state ${safe}: session files removed`)
  } catch {}
}

// Removes files in the sessions directory not modified in the last `days` days.
function prune(days) {
  try {
    const dir = sessionsDir()
    const cutoff = Date.now() - days * DAY_MS
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      try {
        const file = path.join(dir, entry.name)
        if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true })
      } catch {}
    }
  } catch {}
}

module.exports = {
  MODES,
  PRUNE_DAYS,
  dataDir,
  sessionsDir,
  safeId,
  fileFor,
  flagFor,
  read,
  write,
  update,
  remove,
  readArming,
  arm,
  setMode,
  disarm,
  removeSession,
  prune
}
