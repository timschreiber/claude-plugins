'use strict'
// Extracts the hand-back stall evidence from the WP-01 session transcript.
// Usage: node extract-handback-stall.js <transcript.jsonl>  (JSON goes to stdout)
// It keeps lines 252 through 278 (0-based) and only the fields the finding cites.

const fs = require('fs')
const path = require('path')

const FROM = 252
const TO = 278
const cut = (v) => (typeof v === 'string' ? v.slice(0, 400) : undefined)

function messageText(m) {
  const c = m && m.content
  if (typeof c === 'string') return cut(c)
  if (!Array.isArray(c)) return undefined
  return cut(c.map((b) => (b.type === 'text' ? b.text : b.type === 'tool_use' ? 'tool_use:' + b.name : b.type === 'tool_result' ? 'tool_result' : b.type)).join(' | '))
}

const file = process.argv[2]
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
const entries = []
for (let i = FROM; i <= TO && i < lines.length; i++) {
  if (!lines[i]) continue
  const o = JSON.parse(lines[i])
  const e = { index: i, type: o.type, subtype: o.subtype, timestamp: o.timestamp, promptSource: o.promptSource, queueTranscriptOnly: o.queueTranscriptOnly }
  if (o.origin) e.origin = { kind: o.origin.kind, handback: o.origin.handback, senderTaskId: o.origin.senderTaskId }
  if (o.type === 'attachment' && o.attachment) {
    e.attachmentType = o.attachment.type
    e.hookEvent = o.attachment.hookEvent
    e.text = cut(o.attachment.stdout) ?? cut(o.attachment.content)
  } else if (o.type === 'queue-operation') {
    e.operation = o.operation
    e.text = cut(o.content)
  } else if (o.type === 'user' || o.type === 'assistant') {
    e.text = messageText(o.message)
  }
  entries.push(e)
}
const out = {
  source: path.basename(file),
  claudeCodeVersion: '2.1.285',
  note: 'WP-01 run: T01 handed back through SubagentHandback; its task-notification was transcript-only and the run stalled',
  entries,
}
process.stdout.write(JSON.stringify(out, null, 2) + '\n')
