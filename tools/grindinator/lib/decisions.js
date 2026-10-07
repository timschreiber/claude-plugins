// Decision files. Sessions write the Decidinator log and sidecar to run copies under the excluded
// .grindinator/decisions/ directory (spec R-D5, O-7). The repo paths of those files come from
// Decidinator's own configuration (user file, then project file). This module resolves those paths,
// and seeds, commits and reads the run copies.
'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const dconfig = require('../../../plugins/decidinator/scripts/lib/config.js')
const sidecarLib = require('../../../plugins/decidinator/scripts/lib/sidecar.js')
const { GrindinatorError } = require('./errors.js')
const { decisionPaths } = require('./session.js')

const KINDS = Object.freeze([
  Object.freeze({ kind: 'log', key: 'decisionLog', label: 'decision log' }),
  Object.freeze({ kind: 'sidecar', key: 'sidecar', label: 'sidecar' })
])

const norm = s => path.posix.normalize(s.replace(/\\/g, '/'))

// The repo-relative paths of the Decidinator log and sidecar: { log: {abs, rel}, sidecar: {abs, rel} }.
function repoPaths({ root, homeDir }) {
  const value = { decisionLog: dconfig.DEFAULTS.decisionLog, sidecar: dconfig.DEFAULTS.sidecar }
  const files = [dconfig.userFile(homeDir), dconfig.projectFile(root)]
  if (path.resolve(files[0]) === path.resolve(files[1])) files.pop()
  for (const file of files) {
    const { values } = dconfig.readFile(file)
    for (const { key } of KINDS) {
      if (Object.hasOwn(values, key) && dconfig.checkKey(key, values[key]) === null) value[key] = values[key]
    }
  }
  if (norm(value.decisionLog) === norm(value.sidecar)) {
    value.decisionLog = dconfig.DEFAULTS.decisionLog
    value.sidecar = dconfig.DEFAULTS.sidecar
  }

  const out = {}
  for (const { kind, key, label } of KINDS) {
    const configured = value[key]
    const abs = path.resolve(root, configured)
    const rel = path.relative(root, abs)
    if (rel === '' || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
      throw new GrindinatorError(`the Decidinator ${label} "${configured}" is outside the repository; Grindinator commits it after each package, so set "${key}" in .claude/decidinator.json to a path inside it, or pass --no-decidinator`)
    }
    const posixRel = rel.split(path.sep).join('/')
    const seg = posixRel.split('/')[0]
    if (seg === '.git' || seg === '.grindinator') {
      throw new GrindinatorError(`the Decidinator ${label} "${configured}" is inside ${seg}/; set "${key}" in .claude/decidinator.json to a path Git tracks, or pass --no-decidinator`)
    }
    out[kind] = { abs, rel: posixRel }
  }
  return out
}

// The sha256 hex of the file's bytes, or null when it does not exist.
function fileHash(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

// The open questions in the run copy of the sidecar.
function openEntries(root) {
  let text
  try {
    text = fs.readFileSync(decisionPaths(root).sidecar, 'utf8')
  } catch {
    return []
  }
  return sidecarLib.parse(text).entries
    .filter(e => e.question.status.trim() === 'open')
    .map(e => ({ id: e.id, topic: e.title, dependsOn: e.question.dependsOn }))
}

module.exports = { KINDS, repoPaths, fileHash, openEntries }
