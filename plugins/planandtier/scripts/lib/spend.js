// The hooks' side of planandtier's telemetry: what each hook records, and the text shown in the UI (as
// the hook output's systemMessage). Records go to the plan's telemetry file (lib/telemetry.js). Every
// function swallows errors and returns a "nothing happened" value: spend is never allowed to affect a run.
'use strict'

const state = require('./state.js')
const t = require('./telemetry.js')
const { transcriptUsage, subagentUsage, subagentsDir, combine, tally } = require('./usage.js')
const { currentTask } = require('./run.js')

const WORKER = type => String(type ?? '').startsWith('planandtier:')
const safe = (fn, fallback) => {
  try {
    return fn()
  } catch {
    return fallback
  }
}

// The main session's messages in a window, in or out of plan mode, with the subagents that started in
// it (planandtier's own workers excluded: they are counted per attempt).
function sessionUsage(transcript, { from, to, mode }) {
  const main = transcriptUsage(transcript, { from, to, mode })
  const subs = subagentUsage(subagentsDir(transcript), { from, to, exclude: WORKER })
  return { usage: main || subs.count ? combine(main, subs) : null, subagents: subs.count }
}

// H2: a valid tiered plan passed the gate. Records the planning since the session's cursor, then moves
// the cursor, so a resubmission records only what came after.
function recordPlanning(input, planId, planFile) {
  return safe(() => {
    const to = new Date().toISOString()
    const from = state.cursor(input.session_id)
    const { usage, subagents } = sessionUsage(input.transcript_path, { from, to, mode: 'plan' })
    const record = t.append(t.fileFor(planFile, input.session_id), {
      kind: 'planning',
      sessionId: input.session_id,
      planId,
      window: { from, to },
      subagents,
      ...t.usageFields(usage),
    })
    state.setCursor(input.session_id, to)
    return record
  }, null)
}

// What became of an attempt, from the state before and after it was judged.
function outcomeOf(prev, next) {
  if (next.phase === 'halted') return { outcome: 'halt', reason: next.halt?.reason ?? null }
  if (next.done.length > prev.done.length) return { outcome: 'done', reason: null }
  return { outcome: 'retry', reason: next.current?.lastFailure?.reason ?? null }
}

// H4: an attempt was judged. Records it with its worker's usage (null when the transcript cannot be read;
// zero for a failed Agent call, which ran nothing), adds its cost to the run's running total, and
// queues its UI line in the state's `spendLines`. Returns {next, line}: the state to save and the line.
// The line is shown by the next Stop (takeLines), not here: a SubagentStop hook's systemMessage is not
// displayed for a background worker, and a Stop hook's is (planandtier-telemetry-findings.md).
function recordAttempt(input, prev, next, { transcript = input.agent_transcript_path, ran = true } = {}) {
  return safe(
    () => {
      const usage = ran ? transcriptUsage(transcript) : tally([])
      const cost = usage?.costUsd ?? 0
      const runCost = (prev.spend?.costUsd ?? 0) + cost
      const { outcome, reason } = outcomeOf(prev, next)
      const record = {
        kind: 'attempt',
        sessionId: input.session_id,
        planId: prev.planId ?? null,
        runId: prev.runId ?? null,
        task: currentTask(prev).id,
        tier: prev.current.tier,
        effort: input.effort?.level ?? prev.current.tier.split('-')[1],
        attempt: prev.current.attempt,
        agentId: input.agent_id ?? null,
        outcome,
        reason,
        durationMs: usage?.firstAt && usage?.lastAt ? Date.parse(usage.lastAt) - Date.parse(usage.firstAt) : null,
        ...t.usageFields(usage),
      }
      t.append(t.fileFor(prev.planFile, input.session_id), record)
      const line = t.attemptLine(record, runCost)
      return { next: { ...next, spend: { costUsd: runCost }, spendLines: [...(prev.spendLines ?? []), line] }, line }
    },
    { next, line: null }
  )
}

// The queued attempt lines, and the state with the queue emptied.
const takeLines = s => ({ lines: s?.spendLines ?? [], rest: s?.spendLines?.length ? { ...s, spendLines: [] } : s })

// H3 and execute-plan: a run has started. Its record lets the summary find the planning that led to it,
// including rounds recorded under an earlier plan id (a plan rejected and revised in the dialog).
function recordRunStart(input, run) {
  return safe(
    () =>
      t.append(t.fileFor(run.planFile, input.session_id), {
        kind: 'run',
        sessionId: input.session_id,
        planId: run.planId ?? null,
        runId: run.runId ?? null,
        startTask: run.tasks?.[run.current?.index]?.id ?? null,
      }),
    null
  )
}

// H5 (or H1 on a disarm): the run has ended. Records the orchestration since the run started and returns
// the spend summary for the UI, or null.
function recordRunEnd(input, s) {
  return safe(() => {
    const to = new Date().toISOString()
    const from = s.approvedAt ?? null
    const { usage, subagents } = sessionUsage(input.transcript_path, { from, to, mode: 'other' })
    const file = t.fileFor(s.planFile, input.session_id)
    t.append(file, {
      kind: 'orchestration',
      sessionId: input.session_id,
      planId: s.planId ?? null,
      runId: s.runId ?? null,
      end: s.phase,
      window: { from, to },
      subagents,
      ...t.usageFields(usage),
    })
    return t.summary(t.read(file), { planId: s.planId, runId: s.runId })
  }, null)
}

module.exports = { recordPlanning, recordAttempt, recordRunStart, recordRunEnd, takeLines, outcomeOf }
