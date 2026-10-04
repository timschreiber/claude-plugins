// H4: runs the approved tasks through the tier agents (tierminator:<tier>), one at a time.
// Agent-tool subagents are not shown the user's latest prompt as overriding their task, which is why
// the run no longer uses a workflow (tierminator-agent-dispatch-findings.md). In an interactive
// session the Agent tool always runs a subagent in the background, so the attempt is judged when the
// worker stops, and what Claude must hear next is kept in the state as `notice` until it can be told:
// at PostToolUse for a foreground run, or by H1 when the worker's report arrives as a prompt.
//   pre      PreToolUse Agent: only the dispatch the run expects may start, from a clean tree on the
//            run's branch. On a pass it records HEAD, which a retry resets to.
//   stop     SubagentStop: the worker finished. Judges the attempt against Git and moves the run on
//            (the next task, a retry one tier up after a reset, completion, or a halt), saving the
//            notice. Records the attempt's tokens and cost, and queues the line H5 shows the user.
//            An agent whose hand-back H1 already judged (`handedBack`) is ignored: the run has moved on.
//   post     PostToolUse Agent: gives Claude the notice if there is one (a foreground run); otherwise
//            the task is running in the background, and Claude is told to end its turn and wait.
//   failure  PostToolUseFailure Agent: the call itself failed; it counts as a failed attempt.
// Agent calls for other agent types are left alone.
'use strict'

const state = require('./lib/state.js')
const git = require('./lib/git.js')
const r = require('./lib/run.js')
const spend = require('./lib/spend.js')
const { settle, reportFromTranscript } = require('./lib/settle.js')
const { run, readInput, emit } = require('./lib/hook.js')

const ours = type => typeof type === 'string' && type.startsWith(r.AGENT_PREFIX)

const deny = reason =>
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })
const context = (event, additionalContext) => emit({ hookSpecificOutput: { hookEventName: event, additionalContext } })

function pre(input, s) {
  const toolInput = input.tool_input ?? {}
  if (!ours(toolInput.subagent_type)) return
  const problem = r.checkDispatch(s, toolInput)
  if (problem) {
    const next = s?.phase === 'running' ? ` ${r.dispatchText(s)}` : ' Tell the user instead of dispatching.'
    deny(`tierminator: dispatch refused: ${problem}.${next}`)
    return
  }
  // The tree must be clean and on the run's branch, so that a failed attempt can be reset.
  const cwd = s.cwd ?? input.cwd
  const fatal = !git.isClean(cwd)
    ? 'the working tree has uncommitted changes that no task made'
    : git.branch(cwd) !== s.branch
      ? `the repository is no longer on the branch the run started on (${s.branch || 'a detached HEAD'})`
      : null
  if (fatal) {
    const halted = r.advance(s, { ok: false, fatal }).state
    state.write(input.session_id, halted)
    deny(r.haltText(halted))
    return
  }
  // A notice not yet shown is stale once Claude has made the next dispatch.
  state.write(input.session_id, {
    ...s,
    notice: null,
    current: { ...s.current, head: git.head(cwd), inFlight: true, report: null },
  })
}

function stop(input, s) {
  if (s?.handedBack?.includes(input.agent_id)) return
  if (!ours(input.agent_type) || s?.phase !== 'running' || !s.current.inFlight) return
  const report = r.parseReport(input.last_assistant_message) ?? reportFromTranscript(input.agent_transcript_path)
  const reported = { ...s, current: { ...s.current, report } }
  // The attempt's tokens and estimated cost go to the plan's telemetry file, and its UI line is queued
  // for the next Stop (H5); Claude's notice is unchanged.
  const { next } = spend.recordAttempt(input, s, settle(reported, s.cwd ?? input.cwd))
  // A background worker's "finished" notification always arrives after this, and H1 gives the notice on
  // it; H5 then lets Claude's turn end instead of blocking it, which Claude Code shows as an error.
  state.write(input.session_id, { ...next, noticeByNotification: !!(next.notice && s.current.background) })
}

function post(input, s) {
  if (!ours(input.tool_input?.subagent_type) || !s) return
  if (s.notice) {
    // The worker already stopped: a foreground run. Tell Claude what comes next.
    state.write(input.session_id, { ...s, notice: null })
    context('PostToolUse', s.notice)
  } else if (s.phase === 'running' && s.current.inFlight) {
    // A background launch: remember it, so the notice waits for the worker's "finished" notification.
    if (input.tool_response?.isAsync) state.write(input.session_id, { ...s, current: { ...s.current, background: true } })
    context('PostToolUse', r.runningText(s))
  }
}

function failure(input, s) {
  if (!ours(input.tool_input?.subagent_type) || s?.phase !== 'running' || !s.current.inFlight) return
  const error = String(input.error ?? 'unknown error').split('\n')[0].slice(0, 300)
  const settledState = settle(s, s.cwd ?? input.cwd, { ok: false, reason: `the Agent call failed: ${error}` })
  const { next } = spend.recordAttempt(input, s, settledState, { ran: false })
  state.write(input.session_id, { ...next, notice: null })
  context('PostToolUseFailure', next.notice)
}

run(async () => {
  const input = await readInput()
  // Unarmed, even tierminator's own agents are left alone. SubagentStop's session_id is the main
  // session's, so this also covers a worker still running when the session was disarmed.
  if (!input || !state.isActive(input.session_id)) return
  const mode = process.argv[2]
  if (mode === 'stop') {
    // SubagentStop comes from the subagent itself, so agent_id is expected here.
    stop(input, state.read(input.session_id))
    return
  }
  if (input.agent_id) return
  const s = state.read(input.session_id)
  if (mode === 'pre') pre(input, s)
  else if (mode === 'post') post(input, s)
  else if (mode === 'failure') failure(input, s)
})
