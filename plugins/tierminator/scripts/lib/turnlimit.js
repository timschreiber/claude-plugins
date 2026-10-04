// A worker that stopped at its turn limit with its task in flight, seen by H1 (the "stopped at its N-turn
// limit" task notification) and H4 (the foreground Agent result). Neither event reaches SubagentStop, so
// the attempt is never judged there (tierminator-agent-dispatch-findings.md). It is not a tier failure, so
// nothing is retried or reset: the worker is resumed while resumes are left, else the run halts.
'use strict'

const path = require('path')
const state = require('./state.js')
const r = require('./run.js')
const spend = require('./spend.js')
const { subagentsDir } = require('./usage.js')

// The text Claude is told, with the state saved first. `s` already has the agent id, if it is known.
// Returns null when the state cannot be saved.
function onTurnLimit(input, s, turns) {
  const next = r.turnLimitStop(s, turns)
  if (next.action === 'resume') {
    if (!state.write(input.session_id, next.state)) return null
    return r.resumeText(next.state)
  }
  const agentId = s.current.agentId ?? null
  const dir = subagentsDir(input.transcript_path)
  const transcript = agentId && dir ? path.join(dir, `agent-${agentId}.jsonl`) : undefined
  const recorded = spend.recordAttempt({ ...input, agent_id: agentId }, s, { ...next.state, notice: null }, { transcript, stopReason: 'turn-limit' }).next
  if (!state.write(input.session_id, { ...recorded, notice: null, noticeByNotification: false })) return null
  return r.haltText(next.state)
}

module.exports = { onTurnLimit }
