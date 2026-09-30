// Question IDs for Decidinator. IDs are unique per project, not per session, because the sidecar
// (docs/open-questions.md) reuses the gate's Q- ID as the entry's ID, and sessions share one sidecar.
// The next ID is 1 + the highest of: a locked per-project counter in ${CLAUDE_PLUGIN_DATA}/projects/,
// the highest Q- ID in the sidecar, and the highest Question ID in the decision log.
// mint() returns null on any failure; the gate then fails open.
'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const fileio = require('./fileio.js')
const state = require('./state.js')
const decisionLog = require('./decision-log.js')
const sidecarFile = require('./sidecar.js')
const { debug } = require('./debug.js')

const ID_RE = /^Q-(\d{4,})$/

function projectKey(projectDir) {
  let p = path.resolve(projectDir)
  if (process.platform === 'win32') p = p.toLowerCase()
  return crypto.createHash('sha256').update(p, 'utf8').digest('hex').slice(0, 16)
}

function counterFile(projectDir) {
  return path.join(state.dataDir(), 'projects', `${projectKey(projectDir)}.json`)
}

const formatId = n => `Q-${String(n).padStart(4, '0')}`

function highestInFiles(logFile, sidecarPath) {
  let max = 0
  const note = id => {
    const m = ID_RE.exec(String(id ?? ''))
    if (m) max = Math.max(max, Number(m[1]))
  }
  const log = decisionLog.read(logFile)
  if (log.ok) for (const e of log.model.entries) note(e.decision.questionId)
  const side = sidecarFile.read(sidecarPath)
  if (side.ok) for (const e of side.model.entries) note(e.id)
  return max
}

function readLast(file) {
  try {
    const last = JSON.parse(fs.readFileSync(file, 'utf8'))?.last
    return Number.isInteger(last) && last >= 0 ? last : 0
  } catch {
    return 0
  }
}

// Returns an array of `count` consecutive new IDs, or null.
function mint(count, { projectDir, decisionLog: log, sidecar }) {
  try {
    const file = counterFile(projectDir)
    const r = fileio.withLock(file, () => {
      const last = Math.max(
        readLast(file),
        highestInFiles(path.resolve(projectDir, log), path.resolve(projectDir, sidecar))
      )
      const ids = Array.from({ length: count }, (_, i) => formatId(last + 1 + i))
      fileio.writeAtomic(file, JSON.stringify({ last: last + count, projectDir: path.resolve(projectDir) }))
      return ids
    })
    return Array.isArray(r) ? r : null
  } catch (e) {
    debug(`ids: mint failed: ${e?.message ?? e}`)
    return null
  }
}

module.exports = { counterFile, highestInFiles, formatId, mint }
