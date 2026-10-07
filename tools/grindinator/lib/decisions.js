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
const git = require('./git.js')

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

// Seeds the run copies from the repo files. Returns the repo rels it seeded. A run copy that already
// exists must match what was last copied or committed, or it may hold decisions that would be lost.
function prepare({ root, st, repo }) {
  const record = { ...(st.decisions ?? {}) }
  const work = decisionPaths(root)
  const seeded = []
  for (const { kind } of KINDS) {
    const { abs, rel } = repo[kind]
    if (!fs.existsSync(work[kind])) {
      if (fs.existsSync(abs)) {
        fs.mkdirSync(path.dirname(work[kind]), { recursive: true })
        fs.copyFileSync(abs, work[kind])
        seeded.push(rel)
      }
      record[kind] = { repo: rel, hash: fileHash(abs) }
    } else {
      const r = record[kind]
      if (!r || r.repo !== rel || r.hash !== fileHash(abs)) {
        const base = path.basename(work[kind])
        throw new GrindinatorError(`${rel} changed since Grindinator last copied it (for example by /decidinator:import), and .grindinator/decisions/${base} may hold decisions not yet committed; merge them into ${rel} and delete .grindinator/decisions/${base}, or delete it to discard them, then run again`)
      }
    }
  }
  st.decisions = record
  return seeded
}

// Copies changed run copies over the repo files and commits them.
function commitDecisions({ root, st, repo, packageId }) {
  const work = decisionPaths(root)
  const files = []
  for (const { kind } of KINDS) {
    const { abs, rel } = repo[kind]
    if (!fs.existsSync(work[kind])) continue
    if (fileHash(work[kind]) === fileHash(abs)) continue
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.copyFileSync(work[kind], abs)
    files.push(rel)
  }
  if (files.length === 0) return { status: 'unchanged', commit: null, files: [] }
  let r = git.git(root, ['add', '--', ...files])
  if (!r.ok) return { status: 'failed', commit: null, files, reason: `git add failed: ${git.firstLine(r.stderr)}` }
  r = git.git(root, ['commit', '-q', '-m', `chore(grindinator): decisions for ${packageId}`, '--', ...files])
  if (!r.ok) return { status: 'failed', commit: null, files, reason: `git commit failed: ${git.firstLine(r.stderr)}` }
  st.decisions = st.decisions ?? {}
  for (const { kind } of KINDS) st.decisions[kind] = { repo: repo[kind].rel, hash: fileHash(repo[kind].abs) }
  return { status: 'committed', commit: git.head(root), files }
}

module.exports = { KINDS, repoPaths, fileHash, openEntries, prepare, commitDecisions }
