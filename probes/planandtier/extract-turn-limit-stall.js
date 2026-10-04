'use strict'
// Extracts the turn-limit stall evidence from a main-session transcript: a background tier worker that
// stopped at its maxTurns, the notification that said so, what the hooks did with it, and the SendMessage
// that resumed the worker until it handed back.
// Usage: node extract-turn-limit-stall.js <main transcript.jsonl>
// Writes probes/evidence/planandtier-turn-limit-stall.json. Entry indexes are the transcript's own line
// numbers (0-based), as in extract-handback-stall.js.

const fs = require('fs')
const path = require('path')
const { messagesOf, subagentsDir } = require('../../plugins/tierminator/scripts/lib/usage.js')

const OUT = path.join(__dirname, '..', 'evidence', 'planandtier-turn-limit-stall.json')
const cut = (v, n = 400) => (typeof v === 'string' ? v.slice(0, n) : undefined)

function textOf(m) {
  const c = m && m.content
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return ''
  return c
    .map(b => (b.type === 'text' ? b.text : b.type === 'tool_result' ? (typeof b.content === 'string' ? b.content : textOf({ content: b.content })) : ''))
    .join('\n')
}

function read(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l, index) => {
      if (!l) return null
      try {
        return { index, o: JSON.parse(l) }
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

const file = process.argv[2]
if (!file) {
  process.stderr.write('usage: node extract-turn-limit-stall.js <main transcript.jsonl>\n')
  process.exit(2)
}
const records = read(file)

const isLimit = o =>
  o.type === 'user' && typeof o.message?.content === 'string' && o.message.content.includes('<task-notification>') && /stopped at its \d+-turn limit/.test(o.message.content)
const at = records.findIndex(({ o }) => isLimit(o))
if (at < 0) {
  process.stderr.write('no turn-limit task-notification in this transcript\n')
  process.exit(1)
}
const n = records[at].o
const content = n.message.content
const taskId = /<task-id>([^<]+)<\/task-id>/.exec(content)?.[1]?.trim()
const notification = {
  index: records[at].index,
  timestamp: n.timestamp,
  claudeCodeVersion: n.version,
  origin: n.origin,
  turnOrigin: n.turnOrigin,
  promptSource: n.promptSource,
  queueSkipAttachments: n.queueSkipAttachments,
  queueTranscriptOnly: n.queueTranscriptOnly,
  taskId,
  summary: /<summary>([\s\S]*?)<\/summary>/.exec(content)?.[1],
  content,
}

// The queue operations that delivered it.
const queue = records
  .slice(Math.max(0, at - 3), at)
  .filter(({ o }) => o.type === 'queue-operation')
  .map(({ index, o }) => ({ index, operation: o.operation, timestamp: o.timestamp, text: cut(o.content, 120) }))

// Everything up to the next prompt the user typed: the notification's own turn.
let end = records.findIndex(({ o }, i) => i > at && o.type === 'user' && o.origin?.kind === 'human')
if (end < 0) end = records.length
const turn = records.slice(at + 1, end)
const hookAttachments = turn
  .filter(({ o }) => o.type === 'attachment' && o.attachment?.hookEvent)
  .map(({ index, o }) => ({ index, timestamp: o.timestamp, hookEvent: o.attachment.hookEvent, attachmentType: o.attachment.type, text: cut(o.attachment.stdout) ?? cut(o.attachment.content) }))
const stopHookSummaries = turn
  .filter(({ o }) => o.type === 'system' && o.subtype === 'stop_hook_summary')
  .map(({ index, o }) => ({
    index,
    timestamp: o.timestamp,
    hookCount: o.hookCount,
    hooks: (o.hookInfos ?? []).map(h => cut(h.command, 120)),
    hasOutput: o.hasOutput,
    preventedContinuation: o.preventedContinuation,
    hookAdditionalContext: o.hookAdditionalContext,
  }))
const assistantText = turn
  .filter(({ o }) => o.type === 'assistant' && Array.isArray(o.message?.content) && o.message.content.some(b => b.type === 'text'))
  .map(({ index, o }) => ({ index, timestamp: o.timestamp, text: cut(textOf(o.message), 600) }))

// The run state Claude read later, if it did (a tool result holding the state's "inFlight").
const stateRead = records.slice(at + 1).find(({ o }) => o.type === 'user' && /"inFlight"/.test(textOf(o.message)) && /"phase"/.test(textOf(o.message)))
let runState = null
if (stateRead) {
  const t = textOf(stateRead.o.message)
  try {
    runState = { index: stateRead.index, timestamp: stateRead.o.timestamp, state: JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)) }
  } catch {
    runState = { index: stateRead.index, timestamp: stateRead.o.timestamp, text: cut(t, 1200) }
  }
}

// The SendMessage to the same task-id, and its result.
const sendAt = records.findIndex(({ o }, i) => i > at && o.type === 'assistant' && (o.message?.content ?? []).some?.(b => b.type === 'tool_use' && b.name === 'SendMessage' && b.input?.to === taskId))
let sendMessage = null
if (sendAt >= 0) {
  const { index, o } = records[sendAt]
  const use = o.message.content.find(b => b.type === 'tool_use' && b.name === 'SendMessage')
  const result = records.find(({ o: r }, i) => i > sendAt && r.type === 'user' && Array.isArray(r.message?.content) && r.message.content.some(b => b.type === 'tool_result' && b.tool_use_id === use.id))
  sendMessage = {
    index,
    timestamp: o.timestamp,
    input: use.input,
    result: result ? { index: result.index, timestamp: result.o.timestamp, toolUseResult: result.o.toolUseResult ?? cut(textOf(result.o.message)) } : null,
    previousPrompt: (() => {
      const p = records.slice(0, sendAt).reverse().find(({ o: r }) => r.type === 'user' && r.origin?.kind === 'human')
      return p ? { index: p.index, timestamp: p.o.timestamp, text: cut(textOf(p.o.message), 200) } : null
    })(),
  }
}

// The worker's hand-back after the resume, and the hooks that ran on it.
const backAt = records.findIndex(({ o }, i) => i > Math.max(at, sendAt) && o.type === 'user' && o.origin?.kind === 'peer' && o.origin?.from === taskId)
let handBack = null
if (backAt >= 0) {
  const { index, o } = records[backAt]
  // The hand-back's own turn: up to its Stop hooks' summary.
  const next = records.findIndex(({ o: r }, i) => i > backAt && r.type === 'system' && r.subtype === 'stop_hook_summary')
  const after = records.slice(backAt + 1, next < 0 ? records.length : next + 1)
  handBack = {
    index,
    timestamp: o.timestamp,
    origin: { kind: o.origin.kind, from: o.origin.from, senderTaskId: o.origin.senderTaskId, name: o.origin.name, handback: o.origin.handback },
    text: cut(textOf(o.message), 1500),
    hookAttachments: after
      .filter(({ o: r }) => r.type === 'attachment' && r.attachment?.hookEvent)
      .map(({ index: i, o: r }) => ({ index: i, timestamp: r.timestamp, hookEvent: r.attachment.hookEvent, attachmentType: r.attachment.type, text: cut(r.attachment.stdout) ?? cut(r.attachment.content) })),
    laterNotifications: after
      .filter(({ o: r }) => r.type === 'queue-operation' && typeof r.content === 'string' && r.content.includes(`<task-id>${taskId}</task-id>`))
      .map(({ index: i, o: r }) => ({ index: i, operation: r.operation, timestamp: r.timestamp })),
  }
}

// The worker's own transcript: its turns before the notification and in all, and how it ended at the limit.
let worker = null
const dir = subagentsDir(file)
const workerFile = dir && taskId ? path.join(dir, `agent-${taskId}.jsonl`) : null
if (workerFile && fs.existsSync(workerFile)) {
  const lines = read(workerFile).map(r => r.o)
  const messages = messagesOf(lines)
  let meta = null
  try {
    meta = JSON.parse(fs.readFileSync(workerFile.replace(/\.jsonl$/, '.meta.json'), 'utf8'))
  } catch {}
  const before = lines.filter(o => o.timestamp && o.timestamp < notification.timestamp)
  const lastUse = before
    .filter(o => o.type === 'assistant' && Array.isArray(o.message?.content))
    .flatMap(o => o.message.content.filter(b => b.type === 'tool_use').map(b => ({ timestamp: o.timestamp, name: b.name, description: cut(b.input?.description, 200) })))
    .pop()
  worker = {
    transcript: `${path.basename(path.dirname(dir))}/subagents/agent-${taskId}.jsonl`,
    agentType: meta?.agentType,
    requestShape: meta?.requestShape,
    turnsBeforeNotification: messages.filter(m => m.at && m.at < notification.timestamp).length,
    turnsInAll: messages.length,
    lastToolCallBeforeLimit: lastUse ?? null,
    resumedBy: (lines.find(o => o.type === 'user' && o.origin?.kind === 'coordinator') ?? null) && {
      origin: lines.find(o => o.type === 'user' && o.origin?.kind === 'coordinator').origin,
      timestamp: lines.find(o => o.type === 'user' && o.origin?.kind === 'coordinator').timestamp,
    },
    endedWith: (() => {
      const u = lines
        .filter(o => o.type === 'assistant' && Array.isArray(o.message?.content))
        .flatMap(o => o.message.content.filter(b => b.type === 'tool_use').map(b => b.name))
        .pop()
      return u ?? null
    })(),
  }
}

// The plan's telemetry attempt rows for the worker: when, if ever, an attempt was recorded for it.
let telemetryAttempts = null
if (n.slug && taskId) {
  const tel = path.join(require('os').homedir(), '.claude', 'plans', `${n.slug}.telemetry.jsonl`)
  try {
    telemetryAttempts = {
      file: `.claude/plans/${n.slug}.telemetry.jsonl`,
      rows: fs
        .readFileSync(tel, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map(l => JSON.parse(l))
        .filter(o => o.kind === 'attempt' && o.agentId === taskId)
        .map(o => ({ at: o.at, task: o.task, attempt: o.attempt, tier: o.tier, messages: o.messages })),
    }
  } catch {}
}

const out = {
  source: path.basename(file),
  claudeCodeVersion: notification.claudeCodeVersion,
  note: 'A background tier worker stopped at its maxTurns before reporting. The notification started a turn; the run was resumed only when the user asked Claude to SendMessage the worker.',
  queue,
  notification,
  notificationTurn: {
    until: end < records.length ? records[end].index : null,
    hookAttachments,
    userPromptSubmitHookAttachment: hookAttachments.some(h => h.hookEvent === 'UserPromptSubmit'),
    stopHookAttachment: hookAttachments.some(h => h.hookEvent === 'Stop'),
    stopHookSummaries,
    assistantText,
  },
  runState,
  sendMessage,
  handBack,
  worker,
  telemetryAttempts,
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
process.stdout.write(`notification at line ${notification.index}, SendMessage at ${sendMessage?.index ?? 'none'}, hand-back at ${handBack?.index ?? 'none'} -> ${path.relative(process.cwd(), OUT)}\n`)
