// H5: keeps the main thread dispatching while a run is in progress, instead of doing the tasks'
// work itself or stopping halfway, and shows the user the run's spend.
//   pre   PreToolUse Edit|Write|NotebookEdit: deny main-thread file edits. Shell commands are not
//         guarded; H4 refuses the next dispatch if they left the tree dirty.
//   stop  Stop: block stopping while a task is due to be dispatched, unless its next step will come with
//         a background worker's "finished" notification (H1). Every Stop also shows the user the
//         spend lines H4 queued for finished attempts, and the first Stop after the run has ended records
//         its orchestration and adds the run's spend summary (lib/spend.js). A Stop hook's systemMessage
//         is displayed; a SubagentStop hook's is not, for a background worker.
//         When H1 left the hand-back marker (<session_id>.handback: a worker's report arrived before its
//         attempt was judged), the "finished" notification will be transcript-only and start no turn, so
//         Stop waits for the attempt to be judged (up to PLANANDTIER_HANDBACK_WAIT_MS, 30 s) and delivers
//         the notice itself, blocking with it. If the wait runs out it tells the user to type continue.
// Both give up after a few blocks and mark the run "abandoned", so a stuck session cannot loop
// forever. Workers are subagents, which every hook ignores.
'use strict'

const state = require('./lib/state.js')
const spend = require('./lib/spend.js')
const { dispatchText } = require('./lib/run.js')
const { run, readInput, emit } = require('./lib/hook.js')

const ENDED = ['complete', 'halted', 'abandoned']
const MAX_TOOL_DENIALS = 3
const REASON = s =>
  'planandtier: a run is in progress, and its subagents do the work, not you. ' + dispatchText(s)

// The spend text for this Stop: queued attempt lines, then the summary if the run has just ended (once).
// Returns {s, text}: the state to continue with (already saved) and the text, or null.
function spendText(input, current) {
  let { lines, rest: s } = spend.takeLines(current)
  const ended = s && ENDED.includes(s.phase) && s.runId && !s.spendReported
  if (ended) s = { ...s, spendReported: true }
  if (s !== current && !state.write(input.session_id, s)) return { s: current, text: null }
  const summary = ended ? spend.recordRunEnd(input, s) : null
  const text = [...lines, ...(summary ? [summary] : [])].join('\n')
  return { s, text: text || null }
}

const inFlight = s => s?.phase === 'running' && !!s.current?.inFlight

// A synchronous sleep; a hook has nothing else to do while it waits.
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

// Polls the state until the attempt in flight has been judged (H4's SubagentStop) or the wait runs out.
// Returns the latest state.
function waitForJudgment(input, current) {
  const end = Date.now() + (Number(process.env.PLANANDTIER_HANDBACK_WAIT_MS) || 30000)
  let s = current
  while (inFlight(s) && Date.now() < end) {
    sleep(Math.min(250, Math.max(1, end - Date.now())))
    s = state.read(input.session_id)
  }
  return s
}

function stop(input, current) {
  const marked = state.handback(input.session_id)
  if (marked && inFlight(current)) {
    current = waitForJudgment(input, current)
    if (inFlight(current)) {
      const id = current.tasks?.[current.current.index]?.id ?? marked
      const spent = spendText(input, current).text
      const waiting =
        `planandtier: ${id} handed back its report, but planandtier has not finished checking it. ` +
        'Type continue to go on.'
      emit({ systemMessage: [waiting, spent].filter(Boolean).join('\n') })
      return
    }
  }
  let { s, text } = spendText(input, current)
  const shown = extra => emit({ ...extra, ...(text ? { systemMessage: text } : {}) })
  if (!s || s.phase !== 'running' || s.current?.inFlight) {
    // A run that ended while a hand-back was waiting: its last notice is not lost.
    if (marked && s?.notice && ENDED.includes(s.phase)) {
      state.write(input.session_id, { ...s, notice: null, noticeByNotification: false })
      state.clearHandback(input.session_id)
      shown({ decision: 'block', reason: s.notice })
      return
    }
    if (text) shown({})
    return
  }
  if (input.stop_hook_active) {
    // The second consecutive stop: allow it, abandon the run, and show what it spent.
    const abandoned = { ...s, phase: 'abandoned' }
    if (state.write(input.session_id, abandoned)) {
      const more = spendText(input, abandoned).text
      text = [text, more].filter(Boolean).join('\n') || null
    }
    if (text) shown({})
    return
  }
  // A background worker's notice goes out with its "finished" notification (H1), which always follows
  // its SubagentStop. Blocking here would deliver it too, but Claude Code labels a blocked stop an error.
  // With the hand-back marker there will be no such notification, so the notice is given here.
  if (s.notice && s.noticeByNotification && !marked) {
    if (text) shown({})
    return
  }
  // A notice H4 left (what the last attempt did, and the next dispatch) says more than the bare
  // dispatch; once given here it is not repeated.
  if (s.notice) {
    state.write(input.session_id, { ...s, notice: null, noticeByNotification: false })
    state.clearHandback(input.session_id)
  }
  shown({ decision: 'block', reason: s.notice ?? REASON(s) })
}

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id || !state.isArmed(input.session_id)) return
  const current = state.read(input.session_id)
  if (process.argv[2] === 'stop') return stop(input, current)
  if (!current || current.phase !== 'running' || current.current?.inFlight) return

  const denied = (current.guardDenials ?? 0) + 1
  if (denied > MAX_TOOL_DENIALS) {
    state.write(input.session_id, { ...current, phase: 'abandoned' })
    return
  }
  state.write(input.session_id, { ...current, guardDenials: denied })
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: REASON(current),
    },
  })
})
