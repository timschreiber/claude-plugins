// Finds an oracle's report by the spec's recorder rule (last_assistant_message, then the SubagentHandback
// message, then the agent transcript) and reads the models the agent actually ran on from its transcript.
// Never throws.
'use strict'

const fs = require('fs')
const { extractBlocks } = require('./verdict.js')

function readJsonLines(file) {
  if (typeof file !== 'string' || file === '') return []
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const out = []
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === '') continue
    try {
      const v = JSON.parse(line)
      if (v !== null && typeof v === 'object') out.push(v)
    } catch {
      // skip bad lines
    }
  }
  return out
}

const nonBlank = (v) => typeof v === 'string' && v.trim() !== ''

function transcriptReport(lines) {
  let last = null
  for (const l of lines) {
    if (!l || l.type !== 'assistant' || !Array.isArray(l.message?.content)) continue
    const content = l.message.content
    const text = content
      .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n')
    const calls = content.filter(
      (c) => c && c.type === 'tool_use' && c.name === 'SubagentHandback' && typeof c.input?.message === 'string'
    )
    const hb = calls.length > 0 ? calls[calls.length - 1].input.message : null
    const candidate = nonBlank(hb) ? hb : text
    if (candidate.trim() !== '') last = candidate
  }
  return last
}

function transcriptModels(lines) {
  const models = []
  for (const l of lines) {
    const m = l?.message?.model
    if (typeof m === 'string' && m !== '' && !m.startsWith('<') && !models.includes(m)) models.push(m)
  }
  return models
}

function findReport(input, handbacks, lines) {
  if (nonBlank(input?.last_assistant_message)) {
    return { source: 'last_assistant_message', text: input.last_assistant_message }
  }
  const hb = handbacks?.[input?.agent_id]
  if (nonBlank(hb)) return { source: 'SubagentHandback', text: hb }
  const t = transcriptReport(lines ?? [])
  if (t) return { source: 'agent_transcript_path', text: t }
  return { source: null, text: null }
}

function reportQuestionId(text) {
  if (typeof text !== 'string') return null
  const blocks = extractBlocks(text)
  if (blocks.length === 0) return null
  try {
    const parsed = JSON.parse(blocks[blocks.length - 1])
    if (parsed !== null && typeof parsed === 'object' && typeof parsed.question_id === 'string') {
      return parsed.question_id
    }
    return null
  } catch {
    return null
  }
}

module.exports = { readJsonLines, transcriptReport, transcriptModels, findReport, reportQuestionId }
