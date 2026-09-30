// Line model shared by the decision log and the sidecar. A file is split into lines that each keep
// their own line ending, so joining them again gives back the original bytes, and a script edit
// touches only the lines it means to change. Anything that is not an entry (hand-written text,
// unknown lines) is never looked at, so it survives untouched.
'use strict'

const MARKER_RE = /^<!--\s*decidinator-(log|sidecar)\s+v(\d+)(?:\.\d+)*\s*-->$/
const HEADING_RE = /^#{1,3}\s/
const FIELD_RE = /^[-*] \*\*([^*]+?):\*\*(?:[ \t]+(.*))?$/

function splitLines(text) {
  const lines = []
  let i = 0
  while (i < text.length) {
    const j = text.indexOf('\n', i)
    if (j < 0) {
      lines.push({ text: text.slice(i), eol: '' })
      break
    }
    if (j > i && text[j - 1] === '\r') lines.push({ text: text.slice(i, j - 1), eol: '\r\n' })
    else lines.push({ text: text.slice(i, j), eol: '\n' })
    i = j + 1
  }
  return lines
}

function joinLines(lines) {
  return lines.map((l) => l.text + l.eol).join('')
}

function eolOf(lines) {
  const found = lines.find((l) => l.eol !== '')
  return found ? found.eol : '\n'
}

function readMarker(lines) {
  if (lines.length === 0) return null
  const m = MARKER_RE.exec(lines[0].text.replace(/^﻿/, '').trim())
  return m ? { kind: m[1], major: Number(m[2]) } : null
}

// kind is 'log' or 'sidecar'. Returns {ok:true, fresh} or {ok:false, error} naming the file.
function checkWritable(file, lines, kind) {
  if (lines.every((l) => l.text.trim() === '')) return { ok: true, fresh: true }
  const marker = readMarker(lines)
  if (!marker || marker.kind !== kind) {
    return {
      ok: false,
      error: `${file}: not a Decidinator ${kind} file (the first line is not "<!-- decidinator-${kind} v1 -->"); refusing to write it`
    }
  }
  if (marker.major !== 1) {
    return { ok: false, error: `${file}: decidinator-${kind} v${marker.major} is not supported; this Decidinator writes v1 only` }
  }
  return { ok: true, fresh: false }
}

function entryHeadingRe(prefix) {
  return new RegExp('^###\\s+(' + prefix + ')-(\\d+)\\b\\s*(?:·\\s*)?(.*)$')
}

const isContinuation = (l) => l !== undefined && /^[ \t]/.test(l.text) && l.text.trim() !== ''

function parseEntries(lines, prefix) {
  const headRe = entryHeadingRe(prefix)
  const entries = []
  for (let i = 0; i < lines.length; i++) {
    const h = headRe.exec(lines[i].text)
    if (!h) continue
    let end = i + 1
    while (end < lines.length && !HEADING_RE.test(lines[end].text)) end++
    const entry = { id: `${h[1]}-${h[2]}`, num: Number(h[2]), title: h[3].trim(), start: i, end, fields: [] }
    for (let k = i + 1; k < end; k++) {
      const f = FIELD_RE.exec(lines[k].text)
      if (!f) continue
      const pieces = [(f[2] ?? '').trim()]
      let n = k + 1
      while (n < end && isContinuation(lines[n])) pieces.push(lines[n++].text.trim())
      entry.fields.push({ name: f[1].trim(), line: k, value: pieces.filter((s) => s !== '').join('\n') })
    }
    entries.push(entry)
    i = end - 1
  }
  return entries
}

function field(entry, name) {
  return entry.fields.find((f) => f.name === name)
}

function fieldTail(lines, entry, f) {
  let n = f.line + 1
  while (n < entry.end && isContinuation(lines[n])) n++
  return n
}

function insertIndex(lines, entry) {
  if (entry.fields.length === 0) return entry.start + 1
  return fieldTail(lines, entry, entry.fields[entry.fields.length - 1])
}

function oneLine(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim()
}

function encodeField(name, value) {
  const pieces = String(value ?? '')
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
  if (pieces.length === 0) return [`- **${name}:**`]
  return [`- **${name}:** ${pieces[0]}`, ...pieces.slice(1).map((p) => `  ${p}`)]
}

function encodeList(arr) {
  if (arr.length === 0) return 'none'
  const items = arr.map((s) => oneLine(s).replace(/;/g, ',')).filter(Boolean)
  return items.length === 0 ? 'none' : items.join('; ')
}

function decodeList(v) {
  const t = String(v ?? '').trim()
  if (t === '' || t.toLowerCase() === 'none') return []
  return t.split(';').map((s) => s.trim()).filter(Boolean)
}

function appendBlock(lines, texts, eol) {
  if (lines.length > 0) {
    const last = lines[lines.length - 1]
    if (last.eol === '') last.eol = eol
    if (last.text.trim() !== '') lines.push({ text: '', eol })
  }
  for (const t of texts) lines.push({ text: t, eol })
}

function insertLines(lines, index, texts, eol) {
  if (index > 0 && lines[index - 1].eol === '') lines[index - 1].eol = eol
  lines.splice(index, 0, ...texts.map((t) => ({ text: t, eol })))
}

function setLine(lines, index, text) {
  lines[index].text = text
}

function formatId(prefix, n) {
  return `${prefix}-${String(n).padStart(4, '0')}`
}

function nextId(entries, prefix) {
  const max = entries.reduce((m, e) => Math.max(m, e.num), 0)
  return formatId(prefix, max + 1)
}

module.exports = {
  MARKER_RE,
  HEADING_RE,
  FIELD_RE,
  splitLines,
  joinLines,
  eolOf,
  readMarker,
  checkWritable,
  entryHeadingRe,
  parseEntries,
  field,
  fieldTail,
  insertIndex,
  oneLine,
  encodeField,
  encodeList,
  decodeList,
  appendBlock,
  insertLines,
  setLine,
  formatId,
  nextId
}
