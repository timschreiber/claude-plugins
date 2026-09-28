// H4: runs the approved tasks through the tier agents (planandtier:<tier>), one at a time, in the
// foreground. Agent-tool subagents are not shown the user's latest prompt as overriding their task,
// which is why the run no longer uses a workflow (planandtier-agent-dispatch-findings.md).
//   pre      PreToolUse Agent: only the dispatch the run expects may start, from a clean tree on the
//            run's branch. On a pass it records HEAD, which a retry resets to.
//   stop     SubagentStop: records the worker's report (it fires before PostToolUse).
//   post     PostToolUse Agent: judges the attempt against Git and moves the run on: the next task,
//            a retry one tier up after a reset, completion, or a halt.
//   failure  PostToolUseFailure Agent: the call itself failed; it counts as a failed attempt.
// Agent calls for other agent types are left alone.
'use strict'

const fs = require('fs')
const state = require('./lib/state.js')
const git = require('./lib/git.js')
const r = require('./lib/run.js')
const { run, readInput, emit } = require('./lib/hook.js')

const ours = type => typeof type === 'string' && type.startsWith(r.AGENT_PREFIX)
const short = sha => String(sha ?? '').slice(0, 7)

const deny = reason =>
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })
const context = (event, additionalContext) => emit({ hookSpecificOutput: { hookEventName: event, additionalContext } })

// The text of the worker's last assistant message, from its transcript. Used when SubagentStop
// has no last_assistant_message.
function lastAssistantText(transcript) {
  try {
    const lines = fs.readFileSync(transcript, 'utf8').split('\n').filter(Boolean).reverse()
    for (const line of lines) {
      const o = JSON.parse(line)
      if (o.type !== 'assistant') continue
      const c = o.message?.content
      const text = typeof c === 'string' ? c : (c ?? []).filter(x => x.type === 'text').map(x => x.text).join('\n')
      if (text.trim()) return text
    }
  } catch {}
  return ''
}

function pre(input, s) {
  const toolInput = input.tool_input ?? {}
  if (!ours(toolInput.subagent_type)) return
  const problem = r.checkDispatch(s, toolInput)
  if (problem) {
    const next = s?.phase === 'running' ? ` ${r.dispatchText(s)}` : ' Tell the user instead of dispatching.'
    deny(`planandtier: that dispatch was refused, because ${problem}.${next}`)
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
  state.write(input.session_id, { ...s, current: { ...s.current, head: git.head(cwd), inFlight: true, report: null } })
}

function stop(input, s) {
  if (!ours(input.agent_type) || s?.phase !== 'running' || !s.current.inFlight) return
  const text = input.last_assistant_message || lastAssistantText(input.agent_transcript_path)
  state.write(input.session_id, { ...s, current: { ...s.current, report: r.parseReport(text) } })
}

// Judges the finished attempt (or takes the given failure) and tells Claude what comes next.
function finish(input, s, event, failure) {
  if (!ours(input.tool_input?.subagent_type) || s?.phase !== 'running' || !s.current.inFlight) return
  const cwd = s.cwd ?? input.cwd
  const task = r.currentTask(s)
  const { head, tier } = s.current
  const commits = git.commitsSince(cwd, head)
  let outcome =
    failure ??
    r.judge({
      report: s.current.report,
      taskId: task.id,
      commits,
      clean: git.isClean(cwd),
      sameBranch: git.branch(cwd) === s.branch,
    })
  let { state: next, action } = r.advance(s, outcome)

  if (action === 'retry') {
    // Never reset away a commit that may have been pushed; stop instead.
    const pushed = commits.find(c => git.isPushed(cwd, c.sha))
    const fatal = pushed
      ? `the failed attempt's commit ${short(pushed.sha)} is on a remote branch, so it cannot be reset`
      : !git.resetTo(cwd, head)
        ? `the reset to ${short(head)} before the retry failed`
        : null
    if (fatal) ({ state: next, action } = r.advance(s, { ok: false, fatal }))
  }
  state.write(input.session_id, next)

  if (action === 'next') {
    const done = next.done[next.done.length - 1]
    context(event, `planandtier: ${done.id} is done (commit ${short(done.commit)}, ${done.tier}). ${r.dispatchText(next)}`)
  } else if (action === 'retry') {
    context(
      event,
      `planandtier: ${task.id} failed at ${tier}: ${outcome.reason}. The working tree was reset to ` +
        `${short(head)}, and the task is retried one tier up. ${r.dispatchText(next)}`
    )
  } else if (action === 'complete') {
    context(event, r.completeText(next))
  } else {
    context(event, r.haltText(next))
  }
}

run(async () => {
  const input = await readInput()
  if (!input) return
  const mode = process.argv[2]
  if (mode === 'stop') {
    // SubagentStop comes from the subagent itself, so agent_id is expected here.
    stop(input, state.read(input.session_id))
    return
  }
  if (input.agent_id) return
  const s = state.read(input.session_id)
  if (mode === 'pre') pre(input, s)
  else if (mode === 'post') finish(input, s, 'PostToolUse')
  else if (mode === 'failure') {
    const error = String(input.error ?? 'unknown error').split('\n')[0].slice(0, 300)
    finish(input, s, 'PostToolUseFailure', { ok: false, reason: `the Agent call failed: ${error}` })
  }
})
