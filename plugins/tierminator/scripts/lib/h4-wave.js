// H4's counterpart for a parallel wave. Every change to the wave state goes through state.update; the
// serial paths stay in h4-dispatch.js.
//   pre      PreToolUse Agent: only a dispatch the wave expects may start. It makes the slot's worktree
//            (discarding the failed attempt's first on a retry) and records the slot as running; the call
//            itself passes through unchanged (no isolation, no updatedInput, no permissionDecision).
'use strict'

const state = require('./state.js')
const git = require('./git.js')
const r = require('./run.js')
const w = require('./wave-run.js')
const { emit } = require('./hook.js')

const ours = type => typeof type === 'string' && type.startsWith(r.AGENT_PREFIX)

const deny = reason =>
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } })
const context = (event, additionalContext) => emit({ hookSpecificOutput: { hookEventName: event, additionalContext } })

const cwdOf = (s, input) => s.cwd ?? input.cwd
const joinNotice = (a, b) => [a, b].filter(Boolean).join('\n\n')

// Removes a slot's worktree and then its branch. Returns the worktreeRemove result.
function discardSlot(cwd, slot) {
  const gone = git.worktreeRemove(cwd, slot.worktree)
  git.branchDelete(cwd, slot.branch)
  return gone
}

function pre(input, s) {
  const toolInput = input.tool_input ?? {}
  if (!ours(toolInput.subagent_type)) return
  let denial = null
  let made = null
  const cwd = cwdOf(s, input)
  const res = state.update(input.session_id, cur => {
    const check = w.checkDispatch(cur, toolInput)
    if (check.problem) {
      denial =
        'tierminator: dispatch refused: ' +
        check.problem +
        '. ' +
        (cur?.wave?.phase === 'working'
          ? w.dispatchText(cur) || 'Nothing may start now; end your turn.'
          : 'Tell the user instead of dispatching.')
      return null
    }
    const slot = cur.wave.slots[check.id]
    let fatal = null
    if (slot.attempt > 1) {
      const gone = discardSlot(cwd, slot)
      if (!gone.ok) fatal = 'could not discard the failed attempt: ' + gone.failure
    }
    if (!fatal) {
      const added = git.worktreeAdd(cwd, slot.worktree, slot.branch, cur.wave.base)
      if (!added.ok) fatal = added.failure
    }
    if (fatal) {
      const step = w.advanceSlot(cur, check.id, w.judgeSlot({ worktreeCreate: fatal }))
      denial =
        'tierminator: dispatch refused: ' +
        fatal +
        '. ' +
        (step.state.phase === 'halted'
          ? w.haltText(step.state)
          : 'Wave ' +
            cur.wave.n +
            ' is halting (' +
            check.id +
            ' failed): dispatch nothing more and end your turn; tierminator gives the next step as the running tasks report.')
      return { ...step.state, notice: null }
    }
    made = slot
    return { ...w.dispatched(cur, check.id), notice: null }
  })
  if (!res.ok) {
    if (made) discardSlot(cwd, made)
    denial ??= 'tierminator: dispatch refused: the run state is busy; make the same call again.'
  }
  if (denial) deny(denial)
}

module.exports = { modes: { pre }, ours, deny, context, cwdOf, joinNotice, discardSlot }
