// H5: keeps the main thread dispatching while a run is in progress, instead of doing the tasks'
// work itself or stopping halfway, and shows the user the run's spend.
//   pre   PreToolUse Edit|Write|NotebookEdit: deny main-thread file edits. Shell commands are not
//         guarded; H4 refuses the next dispatch if they left the tree dirty.
//   stop  Stop: block stopping while a task is due to be dispatched, unless its next step will come with
//         a background worker's "finished" notification (H1). It also blocks while the SendMessage that
//         resumes a worker stopped at its turn limit is still due. Every Stop also shows the user the
//         spend lines H4 queued for finished attempts, and the first Stop after the run has ended records
//         its orchestration and adds the run's spend summary (lib/spend.js). A Stop hook's systemMessage
//         is displayed; a SubagentStop hook's is not, for a background worker.
// Both give up after a few blocks and mark the run "abandoned", so a stuck session cannot loop
// forever. Workers are subagents, which every hook ignores.
// An unattended session (a headless /tierminator:plan, lib/unattended.js) is "drafting" until its plan is
// approved by nobody: pre refuses its file edits, and stop takes its final message as the plan. A valid
// plan is saved to the session's plan file and run; an invalid one is blocked with the errors and the
// rules, a few times; an opt-out ends the state and lets Claude implement the plan itself.
'use strict'

const fs = require('fs')
const path = require('path')
const state = require('./lib/state.js')
const spend = require('./lib/spend.js')
const { recordPlanning } = spend
const unattended = require('./lib/unattended.js')
const { dispatchText, resumeText } = require('./lib/run.js')
const { executePlan } = require('./lib/execute.js')
const { resolvePlan, planIdOf } = require('./lib/sidecar.js')
const { run, readInput, emit } = require('./lib/hook.js')

const ENDED = ['complete', 'halted', 'abandoned']
const MAX_TOOL_DENIALS = 3
const MAX_DENIALS = 3
const DRAFTING_DENIAL =
  'tierminator: unattended planning: files cannot be edited until the plan runs. ' +
  'Finish investigating, then end your turn with the complete plan as your final message.'
const REASON = s =>
  'tierminator: a run is in progress, and its subagents do the work, not you. ' + dispatchText(s)

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

const block = reason => emit({ decision: 'block', reason })

// Stop in an unattended session that is still drafting: the final message is the plan.
function draftingStop(input, s) {
  const id = input.session_id
  const text = unattended.finalText(input)
  const result = resolvePlan(text)
  if (result.optOut) {
    state.remove(id)
    return block(
      'tierminator: the plan opts out of tiered execution, so tierminator will not run it. Implement it yourself now, as the plan says.'
    )
  }
  if (result.ok) {
    try {
      fs.mkdirSync(path.dirname(s.planFile), { recursive: true })
      fs.writeFileSync(s.planFile, text)
    } catch {
      state.write(id, { ...s, phase: 'abandoned' })
      return emit({
        systemMessage: `tierminator: the unattended plan could not be saved to ${s.planFile}, so nothing ran.`,
      })
    }
    recordPlanning(input, planIdOf(result, text), s.planFile)
    const note = executePlan(input, JSON.stringify(s.planFile))
    // If executePlan refused (a dirty tree, for example), Claude reports it and the next stop passes.
    if (state.read(id)?.phase !== 'running') state.remove(id)
    return block(note)
  }
  const denials = (s.denials ?? 0) + 1
  if (denials > MAX_DENIALS) {
    state.write(id, { ...s, phase: 'abandoned', denials })
    return emit({ systemMessage: 'tierminator: the unattended plan was still not valid after 3 tries, so nothing ran.' })
  }
  state.write(id, { ...s, denials })
  const errors = (result.errors ?? []).map(e => `- ${e}`).join('\n')
  const rules = fs.readFileSync(path.join(__dirname, '..', 'rules', 'tiering.md'), 'utf8')
  block(
    'tierminator: the plan in your final message cannot run: its task block is not valid:\n' +
      errors +
      '\n\nEnd your turn again with the complete, corrected plan as your final message.\n\n' +
      rules
  )
}

function stop(input, current) {
  if (current?.phase === 'drafting') return draftingStop(input, current)
  let { s, text } = spendText(input, current)
  const shown = extra => emit({ ...extra, ...(text ? { systemMessage: text } : {}) })
  // A worker stopped at its turn limit and the resume is not sent yet: Claude's turn must stay open.
  const resumeDue = s?.phase === 'running' && !!s.current?.inFlight && !!s.current.resumePending
  if (!s || s.phase !== 'running' || (s.current?.inFlight && !resumeDue)) {
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
  if (resumeDue) return shown({ decision: 'block', reason: resumeText(s) })
  // A background worker's notice goes out with its "finished" notification (H1), which always follows
  // its SubagentStop. Blocking here would deliver it too, but Claude Code labels a blocked stop an error.
  if (s.notice && s.noticeByNotification) {
    if (text) shown({})
    return
  }
  // A notice H4 left (what the last attempt did, and the next dispatch) says more than the bare
  // dispatch; once given here it is not repeated.
  if (s.notice) state.write(input.session_id, { ...s, notice: null, noticeByNotification: false })
  shown({ decision: 'block', reason: s.notice ?? REASON(s) })
}

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id || !state.isActive(input.session_id)) return
  const current = state.read(input.session_id)
  if (process.argv[2] === 'stop') return stop(input, current)
  const drafting = current?.phase === 'drafting'
  if (!drafting && (!current || current.phase !== 'running' || current.current?.inFlight)) return

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
      permissionDecisionReason: drafting ? DRAFTING_DENIAL : REASON(current),
    },
  })
})
