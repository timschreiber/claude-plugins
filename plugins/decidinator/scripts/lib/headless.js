'use strict'
// Headless detection and the parser for the prompt that opens a question in a
// headless session. Pure: no file access.
const Q = require('./questions.js')
const { oneLine } = require('./reasons.js')
const { JUDGMENT_MARK } = require('./importer.js')

const LABEL = /^(Rung|Decision log|Sidecar|Question|Options|Context|Earlier verdicts):/

// True in a headless session (claude -p): CLAUDE_CODE_ENTRYPOINT starts with sdk, or CLAUDE_CODE_SESSION_ATTENDED is 0.
function is(env = process.env) {
  try {
    return String(env.CLAUDE_CODE_ENTRYPOINT ?? '').startsWith('sdk') || String(env.CLAUDE_CODE_SESSION_ATTENDED ?? '') === '0'
  } catch {
    return false
  }
}

// The question call (the shape Q.fromCall returns, one item) that an Agent tool_input opens, or null. It opens one when subagent_type is `agent`, the prompt's first non-empty line starts with 'Decidinator question' (any ID or NEW), the prompt is not an import judgment, and it has a non-empty Question: section.
function parseOpening(toolInput, agent) {
  if (toolInput?.subagent_type !== agent) return null
  const prompt = toolInput?.prompt
  if (typeof prompt !== 'string' || prompt.includes(JUDGMENT_MARK)) return null
  const lines = prompt.split(/\r?\n/)
  const first = (lines.find(l => l.trim() !== '') ?? '').trim()
  if (!/^Decidinator question\b/i.test(first)) return null
  const sections = {}
  let cur = null
  for (const line of lines) {
    const m = LABEL.exec(line)
    if (m) {
      cur = m[1]
      sections[cur] = [line.slice(m[0].length)]
    } else if (cur) {
      sections[cur].push(line)
    }
  }
  const question = oneLine((sections.Question ?? []).join(' '))
  if (question === '') return null
  const options = []
  for (const raw of sections.Options ?? []) {
    const t = raw.trim()
    if (!t.startsWith('- ')) continue
    const rest = t.slice(2).trim()
    const i = rest.indexOf(': ')
    options.push({ label: i < 0 ? rest : rest.slice(0, i), description: i < 0 ? '' : rest.slice(i + 2) })
  }
  return Q.fromCall({ questions: [{ question, header: '', options }] })?.[0] ?? null
}

module.exports = { is, parseOpening }
