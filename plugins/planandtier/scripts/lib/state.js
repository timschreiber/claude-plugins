// Per-session state file: ${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json. Every function
// swallows filesystem errors and returns a "nothing happened" value, because a hook must
// never fail loudly.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

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
    return true
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

// Deletes session files (and leftover temp files) not modified within `days` days.
function prune(days) {
  try {
    const dir = sessionsDir()
    const cutoff = Date.now() - days * DAY_MS
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json') && !name.endsWith('.tmp')) continue
      const file = path.join(dir, name)
      if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true })
    }
  } catch {}
}

module.exports = { fileFor, read, write, remove, prune }
