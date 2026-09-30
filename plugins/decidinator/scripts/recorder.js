// SubagentStop hook: stores each oracle verdict under its question and rung and advances the ladder.
// It also stores the match-or-change judgment of a /decidinator:import oracle in the import job.
// Acts only on the configured rung agent that is due and in flight, so other subagents (empty
// agent_type) and stale reports are ignored. Prints nothing, ever (a SubagentStop output could keep
// the subagent running).
'use strict'

const { runArmed, debug } = require('./lib/hook.js')
const { parseVerdict } = require('./lib/verdict.js')
const ladder = require('./lib/ladder.js')
const report = require('./lib/report.js')
const resolution = require('./lib/resolution.js')
const state = require('./lib/state.js')
const config = require('./lib/config.js')
const Q = require('./lib/questions.js')
const importer = require('./lib/importer.js')

runArmed(async (input, arming) => {
  const agentType = input.agent_type
  if (typeof agentType !== 'string' || agentType === '') return
  const cfg = config.forInput(input).config
  if (!cfg.rungs.includes(agentType)) return
  const sid = input.session_id
  const s0 = state.read(sid)
  if (!s0) return
  const d = Q.due(s0, cfg.rungs)
  const questionInFlight = !!d && d.agent === agentType && Q.inFlight(d.q, d.rung)
  if (!questionInFlight && importer.waitingItems(s0).length === 0) {
    debug(`recorder: ${agentType} stop ignored, not the dispatch in flight`)
    return
  }
  const lines = report.readJsonLines(input.agent_transcript_path)
  const found = report.findReport(input, s0.handbacks ?? {}, lines)
  const qid = report.reportQuestionId(found.text)
  const jid = agentType === cfg.rungs[0] ? importer.judgmentId(s0, qid, questionInFlight) : null
  if (jid) {
    const j = importer.judgmentOf(parseVerdict(found.text, { questionId: jid, rung: 1 }))
    state.update(sid, cur => {
      if (!cur) return null
      const next = importer.applyJudgment(cur, jid, j)
      return next ? Q.dropHandback(next, input.agent_id) : null
    })
    debug(`recorder: import judgment ${jid} -> ${j.cls}`)
    return
  }
  if (!questionInFlight) {
    debug(`recorder: ${agentType} stop ignored, not the dispatch in flight`)
    return
  }
  if (qid !== null && qid !== d.id) {
    debug(`recorder: report for ${qid} ignored, ${d.id} is in flight`)
    return
  }
  const parsed = parseVerdict(found.text, { questionId: d.id, rung: d.rung })
  const now = new Date().toISOString()
  const entry = {
    rung: d.rung,
    agent: agentType,
    agentId: input.agent_id ?? null,
    ok: parsed.ok,
    reason: parsed.ok ? null : parsed.reason,
    source: found.source,
    models: report.transcriptModels(lines),
    verdict: parsed.verdict,
    at: now
  }
  state.update(sid, cur => {
    if (!cur) return null
    const again = Q.due(cur, cfg.rungs)
    if (!again || again.id !== d.id || again.rung !== d.rung || !Q.inFlight(again.q, again.rung)) return null
    let s = Q.dropHandback(Q.recordVerdict(cur, d.id, entry), input.agent_id)
    const outcome = ladder.next(s.questions[d.id].verdicts, cfg.rungs)
    s = Q.applyLadder(s, d.id, outcome, now)
    if (outcome.outcome !== 'escalate') s = resolution.onFinal(s, d.id, { outcome, mode: arming.mode, cfg, input })
    debug(`recorder: ${d.id} rung ${d.rung} ${parsed.ok ? 'verdict' : `invalid verdict (${parsed.reason})`} -> ${outcome.outcome} ${outcome.rung}`)
    return s
  })
})
