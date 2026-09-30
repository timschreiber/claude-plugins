// The nudge's fixed heuristic for whether Claude's final message ends with a question in plain text.
'use strict'

function endsWithQuestion(text) {
  if (typeof text !== 'string') return false
  const lines = text.split(/\r\n|\r|\n/)
  const code = []
  let fence = null
  for (const line of lines) {
    let m
    if (fence === null && (m = /^ {0,3}(`{3,}|~{3,})/.exec(line))) {
      fence = { ch: m[1][0], len: m[1].length }
      code.push(true)
    } else if (fence !== null && (m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)) && m[1][0] === fence.ch && m[1].length >= fence.len) {
      code.push(true)
      fence = null
    } else if (fence !== null) {
      code.push(true)
    } else {
      code.push(false)
    }
  }
  let last = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() !== '') {
      last = i
      break
    }
  }
  if (last < 0 || code[last]) return false
  const result = lines[last]
    .replace(/`[^`]*`/g, '')
    .replace(/[\s*_"'”’)\]»]+$/, '')
  return /[?？]$/.test(result)
}

module.exports = { endsWithQuestion }
