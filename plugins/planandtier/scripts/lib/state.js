// Per-session state file: ${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json, and the arming flag beside
// it, <session_id>.armed, which the run state's own removals leave alone. Every function
// swallows filesystem errors and returns a "nothing happened" value, because a hook must
// never fail loudly.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { debug } = require('./hook.js')

const DAY_MS = 24 * 60 * 60 * 1000

function sessionsDir() {
  return path.join(process.env.CLAUDE_PLUGIN_DATA || path.join(os.tmpdir(), 'planandtier'), 'sessions')
}

// Session ids come from hook input; keep only filename-safe characters.
function fileFor(sessionId) {
  const safe = String(sessionId ?? '').replace(/[^A-Za-z0-9_-]/g, '')
  return safe ? path.join(sessionsDir(), `${safe}.json`) : null
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
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
    fs.renameSync(tmp, file)
    debug(`state ${path.basename(file, '.json')}: phase=${state?.phase} denials=${state?.denials ?? 0} guardDenials=${state?.guardDenials ?? 0}`)
    return true
  } catch {
    return false
  }
}

function remove(sessionId) {
  try {
    const file = fileFor(sessionId)
    if (file) fs.rmSync(file, { force: true })
    if (file) debug(`state ${path.basename(file, '.json')}: removed`)
  } catch {}
}

// The session is armed when its flag file exists: /planandtier:arm writes it, /planandtier:disarm and
// SessionEnd remove it. Every hook but the arm command does nothing in an unarmed session.
const flagFor = sessionId => fileFor(sessionId)?.replace(/\.json$/, '.armed') ?? null

function isArmed(sessionId) {
  try {
    const flag = flagFor(sessionId)
    return !!flag && fs.existsSync(flag)
  } catch {
    return false
  }
}

// The telemetry cursor: the ISO time up to which the session's planning has been counted
// (lib/telemetry.js). Arming starts it; each planning record moves it.
const cursorFor = sessionId => fileFor(sessionId)?.replace(/\.json$/, '.cursor') ?? null

function cursor(sessionId) {
  try {
    const time = fs.readFileSync(cursorFor(sessionId), 'utf8').trim()
    return Number.isNaN(Date.parse(time)) ? null : time
  } catch {
    return null
  }
}

function setCursor(sessionId, time) {
  try {
    const file = cursorFor(sessionId)
    if (!file) return false
    fs.mkdirSync(sessionsDir(), { recursive: true })
    fs.writeFileSync(file, time)
    return true
  } catch {
    return false
  }
}

// Returns true when the flag was written. Also starts the telemetry cursor.
function arm(sessionId) {
  try {
    const flag = flagFor(sessionId)
    if (!flag) return false
    fs.mkdirSync(sessionsDir(), { recursive: true })
    const now = new Date().toISOString()
    fs.writeFileSync(flag, now)
    setCursor(sessionId, now)
    debug(`state ${path.basename(flag, '.armed')}: armed`)
    return true
  } catch {
    return false
  }
}

// Removes the flag and the telemetry cursor.
function disarm(sessionId) {
  try {
    const flag = flagFor(sessionId)
    if (flag) fs.rmSync(flag, { force: true })
    const cursorFile = cursorFor(sessionId)
    if (cursorFile) fs.rmSync(cursorFile, { force: true })
    if (flag) debug(`state ${path.basename(flag, '.armed')}: disarmed`)
  } catch {}
}

// Deletes session files (state, arming flags, cursors, fallback tasks and telemetry files, and leftover
// temp files) not modified within `days` days.
function prune(days) {
  try {
    const dir = sessionsDir()
    const cutoff = Date.now() - days * DAY_MS
    for (const name of fs.readdirSync(dir)) {
      if (!['.json', '.jsonl', '.tmp', '.armed', '.cursor'].some(ext => name.endsWith(ext))) continue
      const file = path.join(dir, name)
      if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true })
    }
  } catch {}
}

module.exports = { fileFor, read, write, remove, isArmed, arm, disarm, cursor, setCursor, prune }
