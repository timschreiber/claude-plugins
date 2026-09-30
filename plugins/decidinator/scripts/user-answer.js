// PostToolUse hook on AskUserQuestion. Two jobs, both ignoring subagent calls:
// - In a /decidinator:review or /decidinator:confirm walk (the call's prompt_id is the walk's), records each
//   answer the walk asked for: a user decision (review, or a confirm override) or an oracle-confirmed one
//   (confirm), and tells the model what it recorded through additionalContext.
// - In ask mode otherwise, records the user's answer to each question the oracles left unresolved as a
//   `user` decision, and marks the question answered. Prints nothing.
'use strict'

const path = require('path')
const { runArmed, emit } = require('./lib/hook.js')
const state = require('./lib/state.js')
const config = require('./lib/config.js')
const resolution = require('./lib/resolution.js')
const sidecar = require('./lib/sidecar.js')
const record = require('./lib/record.js')
const walks = require('./lib/walks.js')
const msg = require('./lib/messages.js')
const Q = require('./lib/questions.js')

function recordOne(item, choice, c, files) {
  const { logFile, sideFile } = files
  if (item.kind === 'review') {
    let answer = c.raw
    if (choice === 'keep') {
      const r = sidecar.read(sideFile)
      answer = r.ok ? (r.model.entries.find(e => e.id === item.key)?.question.provisionalAnswer ?? '') : ''
    }
    return record.recordEntryAnswer({
      logFile,
      sideFile,
      entryId: item.key,
      provenance: 'user',
      answer: resolution.withNotes(answer, c.notes),
      rationale: 'The user answered in /decidinator:review.',
      status: 'answered'
    })
  }
  return choice === 'confirm'
    ? record.recordConfirm({ logFile, sideFile, decisionId: item.key, approve: true, notes: c.notes })
    : record.recordConfirm({ logFile, sideFile, decisionId: item.key, approve: false, answer: resolution.withNotes(c.raw, c.notes) })
}

function recordWalk(input, calls, walk, cfg) {
  const project = config.projectDir(input)
  const files = { logFile: path.resolve(project, cfg.decisionLog), sideFile: path.resolve(project, cfg.sidecar) }
  const lines = []
  const handled = []
  for (const call of calls) {
    const item = walk.items.find(i => !i.done && i.hash === call.hash)
    if (!item) continue
    const c = resolution.userChoice(input, call.question)
    if (!c) continue
    handled.push(item.key)
    const choice = walks.classifyChoice(item.kind, c.raw)
    if (choice === 'skip') {
      lines.push(`${item.key} skipped; it stays ${item.kind === 'review' ? 'open' : 'unconfirmed'}`)
      continue
    }
    const r = recordOne(item, choice, c, files)
    if (!r.ok) {
      lines.push(`${item.key} not recorded: ${r.error}`)
      continue
    }
    const provenance = choice === 'confirm' ? 'oracle-confirmed' : 'user'
    const sup = r.supersedes ? `, supersedes ${r.supersedes}` : ''
    lines.push(`${item.key} recorded as ${r.id} (${provenance}${sup})`)
  }
  if (handled.length === 0) return
  state.update(input.session_id, cur =>
    cur?.walk ? { ...cur, walk: { ...cur.walk, items: cur.walk.items.map(i => (handled.includes(i.key) ? { ...i, done: true } : i)) } } : null
  )
  if (lines.length > 0) emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg.walkRecorded(lines) } })
}

runArmed(async (input, arming) => {
  if (input.agent_id) return
  const calls = Q.fromCall(input.tool_input)
  if (!calls) return
  const sid = input.session_id
  const s0 = state.read(sid)
  if (!s0) return
  const cfg = config.forInput(input).config
  if (Q.passThroughActive(s0, input.prompt_id)) {
    if (s0.walk?.promptId === input.prompt_id) recordWalk(input, calls, s0.walk, cfg)
    return
  }
  if (arming.mode !== 'ask') return
  state.update(sid, cur => {
    if (!cur) return null
    let s = cur
    let changed = false
    for (const call of calls) {
      const q = Q.findByHash(s, call.hash)
      if (!q || q.status !== Q.STATUS.FINAL_UNRESOLVED) continue
      const answer = resolution.userAnswer(input, call.question)
      if (answer === null) continue
      s = resolution.onUserAnswer(s, q.id, answer, { cfg, input })
      changed = true
    }
    return changed ? s : null
  })
})
