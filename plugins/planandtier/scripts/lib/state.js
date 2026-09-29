// Per-session state file: ${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json, and the arming flag beside
// it, <session_id>.armed, which the run state's own removals leave alone, and the rules marker,
// <session_id>.rules (H1 has shown the tiering rules in this plan-mode stint), and the hand-back marker,
// <session_id>.handback (a worker's report arrived before its attempt was judged). Every function
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

// The rules marker: present once H1 has shown the tiering rules in the current plan-mode stint, so they are
// not shown again on every prompt. Cleared by a prompt outside plan mode, by PreCompact and by disarming.
const rulesFor = sessionId => fileFor(sessionId)?.replace(/\.json$/, '.rules') ?? null

function rulesShown(sessionId) {
  try {
    const file = rulesFor(sessionId)
    return !!file && fs.existsSync(file)
  } catch {
    return false
  }
}

function markRulesShown(sessionId) {
  try {
    const file = rulesFor(sessionId)
    if (!file) return false
    fs.mkdirSync(sessionsDir(), { recursive: true })
    fs.writeFileSync(file, new Date().toISOString())
    return true
  } catch {
    return false
  }
}

function clearRulesShown(sessionId) {
  try {
    const file = rulesFor(sessionId)
    if (file) fs.rmSync(file, { force: true })
  } catch {}
}

// The hand-back marker: present from the time a worker's report arrives as an <agent-message> prompt (H1)
// until H4 dispatches the next task or H1 or H5 delivers the notice. It holds the task id. A hand-back's
// "finished" notification is transcript-only and starts no turn, so H5 uses the marker to wait for the
// attempt to be judged and to deliver the next step itself.
const handbackFor = sessionId => fileFor(sessionId)?.replace(/\.json$/, '.handback') ?? null

function markHandback(sessionId, taskId) {
  try {
    const file = handbackFor(sessionId)
    if (!file) return false
    fs.mkdirSync(sessionsDir(), { recursive: true })
    fs.writeFileSync(file, String(taskId ?? ''))
    return true
  } catch {
    return false
  }
}

// The task id stored by markHandback, or null when there is no marker.
function handback(sessionId) {
  try {
    const file = handbackFor(sessionId)
    return file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
  } catch {
    return null
  }
}

function clearHandback(sessionId) {
  try {
    const file = handbackFor(sessionId)
    if (file) fs.rmSync(file, { force: true })
  } catch {}
}

// The plans /planandtier:execute-plan last listed in this session, in order, so a number from that list
// can pick one. Removed at SessionEnd.
const listingFor = sessionId => fileFor(sessionId)?.replace(/\.json$/, '.listing.json') ?? null

function saveListing(sessionId, files) {
  try {
    const file = listingFor(sessionId)
    if (!file) return false
    fs.mkdirSync(sessionsDir(), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(files))
    return true
  } catch {
    return false
  }
}

function readListing(sessionId) {
  try {
    const files = JSON.parse(fs.readFileSync(listingFor(sessionId), 'utf8'))
    return Array.isArray(files) ? files : null
  } catch {
    return null
  }
}

function clearListing(sessionId) {
  try {
    const file = listingFor(sessionId)
    if (file) fs.rmSync(file, { force: true })
  } catch {}
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

// Removes the flag, the telemetry cursor, the rules marker and the hand-back marker.
function disarm(sessionId) {
  try {
    const flag = flagFor(sessionId)
    if (flag) fs.rmSync(flag, { force: true })
    const cursorFile = cursorFor(sessionId)
    if (cursorFile) fs.rmSync(cursorFile, { force: true })
    const rulesFile = rulesFor(sessionId)
    if (rulesFile) fs.rmSync(rulesFile, { force: true })
    const handbackFile = handbackFor(sessionId)
    if (handbackFile) fs.rmSync(handbackFile, { force: true })
    if (flag) debug(`state ${path.basename(flag, '.armed')}: disarmed`)
  } catch {}
}

// Deletes session files (state, arming flags, cursors, rules and hand-back markers, fallback tasks and telemetry files, and leftover
// temp files) not modified within `days` days.
function prune(days) {
  try {
    const dir = sessionsDir()
    const cutoff = Date.now() - days * DAY_MS
    for (const name of fs.readdirSync(dir)) {
      if (!['.json', '.jsonl', '.tmp', '.armed', '.cursor', '.rules', '.handback'].some(ext => name.endsWith(ext))) continue
      const file = path.join(dir, name)
      if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true })
    }
  } catch {}
}

module.exports = {
  fileFor,
  read,
  write,
  remove,
  isArmed,
  arm,
  disarm,
  cursor,
  setCursor,
  saveListing,
  readListing,
  clearListing,
  rulesShown,
  markRulesShown,
  clearRulesShown,
  markHandback,
  handback,
  clearHandback,
  prune,
}
