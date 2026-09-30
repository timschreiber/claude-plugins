// The stakeholder copy of the sidecar written by /decidinator:export: the default file name, the text
// of the copy, and how a path is shown to the user. Pure: no file access.
'use strict'

const path = require('path')
const md = require('./mdfile.js')
const sidecar = require('./sidecar.js')

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })

// The sidecar's folder and name with the date added, e.g. docs/open-questions-2026-09-30.md.
function defaultPath(sidecarRel, date) {
  const p = String(sidecarRel).replace(/\\/g, '/')
  const dir = path.posix.dirname(p)
  const ext = path.posix.extname(p) || '.md'
  const base = path.posix.basename(p, path.posix.extname(p))
  return dir === '.' ? `${base}-${date}${ext}` : `${dir}/${base}-${date}${ext}`
}

function displayPath(projectDir, abs) {
  const rel = path.relative(projectDir, abs)
  if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel.replace(/\\/g, '/')
  return abs
}

// questions: parsed sidecar questions, already filtered to the open ones.
function render(questions, { source, date }) {
  const groups = new Map()
  for (const q of [...questions].sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)))) {
    const key = q.stakeholder ? `Stakeholder: ${md.oneLine(q.stakeholder)}` : `Topic: ${md.oneLine(q.topic)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(q)
  }
  const names = [...groups.keys()]
  const ordered = [
    ...names.filter((k) => k.startsWith('Stakeholder: ')).sort(byName),
    ...names.filter((k) => k.startsWith('Topic: ')).sort(byName)
  ]
  const lines = [
    sidecar.MARKER,
    '',
    '# Open questions',
    '',
    `Exported ${date} from ${source}: ${plural(questions.length, 'open question')}. Write each answer after "Answer:", on that line or the lines below it, and send this file back. Leave an Answer blank to skip that question.`
  ]
  for (const key of ordered) {
    lines.push('', `## ${key}`)
    for (const q of groups.get(key)) lines.push('', ...sidecar.render(q.id, q))
  }
  return `${lines.join('\n')}\n`
}

module.exports = { defaultPath, displayPath, render }
