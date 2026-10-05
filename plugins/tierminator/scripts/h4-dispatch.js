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
//            notice. Records the attempt's tokens and cost, and queues the line H5 shows the user. When the
//            state cannot be saved, it keeps a lost-state note for H1 or post to give.
//            An agent whose hand-back H1 already judged (`handedBack`) is ignored: the run has moved on.
//            The hand-back (H1) and SubagentStop of one attempt arrive close together, in either order, so
//            stop first claims the attempt (state.claimAttempt); when H1 claimed it first, stop stands down
//            without writing the state. A worker stopped at its turn limit is not judged and claims nothing.
//   post     PostToolUse Agent: gives Claude the notice if there is one (a foreground run); otherwise
//            the task is running in the background, and Claude is told to end its turn and wait. A lost-state
//            note left by stop is given instead, and ends the run.
//   failure  PostToolUseFailure Agent: the call itself failed; it counts as a failed attempt.
// Agent calls for other agent types are left alone.
//   resume-pre / resume-post / resume-failure: the SendMessage that resumes a worker stopped at its turn
//            limit. pre lets only the expected message to the run's worker through (SendMessage to other
//            agents is left alone); post tells Claude to end its turn; failure halts the run, no reset.
'use strict'

const state = require('./lib/state.js')
const git = require('./lib/git.js')
const r = require('./lib/run.js')
const spend = require('./lib/spend.js')
const { settle, reportFromTranscript } = require('./lib/settle.js')
const { MAX_TURNS } = require('./lib/tasks.js')
const { transcriptUsage } = require('./lib/usage.js')
const { onTurnLimit } = require('./lib/turnlimit.js')
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
  if (!report) {
    // No report at its turn limit: the worker is not judged. The "stopped at its turn limit" notification
    // (H1) or the Agent result (post) resumes it instead of a failed attempt and a reset.
    const turns = transcriptUsage(input.agent_transcript_path)?.messages
    if (typeof turns === 'number' && turns >= MAX_TURNS[s.current.tier]) {
      const agentId = s.current.agentId ?? input.agent_id ?? null
      state.write(input.session_id, { ...s, current: { ...s.current, turnLimited: { turns }, agentId } })
      return
    }
  }
  // Only one hook judges an attempt: when H1's hand-back claimed it first, H1 judges it.
  if (!state.claimAttempt(input.session_id, state.attemptKey(s))) return
  const reported = { ...s, current: { ...s.current, report } }
  // The attempt's tokens and estimated cost go to the plan's telemetry file, and its UI line is queued
  // for the next Stop (H5); Claude's notice is unchanged.
  const { next } = spend.recordAttempt(input, s, settle(reported, s.cwd ?? input.cwd), { stopReason: report ? 'report' : 'no-report' })
  // A background worker's "finished" notification always arrives after this, and H1 gives the notice on
  // it; H5 then lets Claude's turn end instead of blocking it, which Claude Code shows as an error.
  const saved = { ...next, noticeByNotification: !!(next.notice && s.current.background) }
  // When the state could not be saved, H1 (the hand-back or the finished notification) or post gives Claude
  // the lost-state note and ends the run.
  if (!state.write(input.session_id, saved)) state.saveLost(input.session_id, next.phase === 'running' ? r.lostText(next) : next.notice)
}

function post(input, s) {
  if (!ours(input.tool_input?.subagent_type) || !s) return
  const lost = state.takeLost(input.session_id)
  if (lost) {
    state.deactivate(input.session_id)
    state.remove(input.session_id)
    return context('PostToolUse', lost)
  }
  if (s.notice) {
    // The worker already stopped: a foreground run. Tell Claude what comes next.
    state.write(input.session_id, { ...s, notice: null })
    context('PostToolUse', s.notice)
  } else if (s.phase === 'running' && s.current.inFlight) {
    const response = input.tool_response
    const agentId = typeof response?.agentId === 'string' ? response.agentId : null
    if (response?.isAsync) {
      // A background launch: remember it, and its agent id, so the notice waits for the worker's "finished"
      // notification and a turn-limit notification can be matched to it.
      state.write(input.session_id, {
        ...s,
        current: { ...s.current, background: true, agentId: agentId ?? s.current.agentId ?? null },
      })
    } else {
      // A foreground run that ended at its turn limit (SubagentStop does not fire for it): resume it.
      const turns = r.turnLimitOf(JSON.stringify(response)) ?? s.current.turnLimited?.turns ?? null
      if (typeof turns === 'number' || s.current.turnLimited) {
        const withId = agentId ? { ...s, current: { ...s.current, agentId } } : s
        const text = onTurnLimit(input, withId, turns ?? 0)
        if (text) return context('PostToolUse', text)
      }
    }
    context('PostToolUse', r.runningText(s))
  }
}

function failure(input, s) {
  if (!ours(input.tool_input?.subagent_type) || s?.phase !== 'running' || !s.current.inFlight) return
  const error = String(input.error ?? 'unknown error').split('\n')[0].slice(0, 300)
  const settledState = settle(s, s.cwd ?? input.cwd, { ok: false, reason: `the Agent call failed: ${error}` })
  const { next } = spend.recordAttempt(input, s, settledState, { ran: false, stopReason: 'call-failed' })
  state.write(input.session_id, { ...next, notice: null })
  context('PostToolUseFailure', next.notice)
}

// A SendMessage aimed at the run's own worker.
const toWorker = (s, toolInput) => !!s.current.agentId && toolInput?.to === s.current.agentId

function resumePre(input, s) {
  if (s?.phase !== 'running') return
  const toolInput = input.tool_input ?? {}
  if (!toWorker(s, toolInput) && !s.current.resumePending) return
  const problem = r.checkResume(s, toolInput)
  if (problem) {
    deny(
      `tierminator: resume refused: ${problem}. ` +
        (s.current.resumePending ? r.resumeText(s) : 'Wait for the worker to report.')
    )
    return
  }
  state.write(input.session_id, r.resumed(s))
}

function resumePost(input, s) {
  if (s?.phase !== 'running' || !s.current.inFlight || !toWorker(s, input.tool_input)) return
  context('PostToolUse', r.runningText(s))
}

function resumeFailure(input, s) {
  if (s?.phase !== 'running' || !s.current.inFlight || !toWorker(s, input.tool_input)) return
  const error = String(input.error ?? 'unknown error').split('\n')[0].slice(0, 300)
  const halted = r.advance(s, { ok: false, fatal: `the resume message to the worker failed: ${error}` }).state
  state.write(input.session_id, halted)
  context('PostToolUseFailure', r.haltText(halted))
}

run(async () => {
  const input = await readInput()
  // In an inactive session, even tierminator's own agents are left alone. SubagentStop's session_id is the
  // main session's, so this also covers a worker still running when a typed prompt stopped the run.
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
  else if (mode === 'resume-pre') resumePre(input, s)
  else if (mode === 'resume-post') resumePost(input, s)
  else if (mode === 'resume-failure') resumeFailure(input, s)
})
