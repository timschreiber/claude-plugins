// H4's counterpart for a parallel wave. Every change to the wave state goes through state.update; the
// serial paths stay in h4-dispatch.js.
//   pre      PreToolUse Agent: only a dispatch the wave expects may start. It makes the slot's worktree
//            (discarding the failed attempt's first on a retry) and records the slot as running; the call
//            itself passes through unchanged (no isolation, no updatedInput, no permissionDecision).
'use strict'

const fs = require('fs')
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

const STUB_REASON = 'integration is not built yet'

// The task id a worker's transcript names in its first prompt, else null.
function slotFromTranscript(file, planId) {
  let lines
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n').slice(0, 40)
  } catch {
    return null
  }
  for (const line of lines) {
    let o
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    const c = o?.message?.content
    const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b?.type === 'text').map(b => b.text).join('\n') : ''
    if (typeof text !== 'string' || !text) continue
    const rows = text.split('\n')
    if (rows.some(l => l.startsWith('Tasks file:')) && (!planId || rows.some(l => l.trim() === 'Plan: ' + planId))) return w.taskOfPrompt(text)
  }
  return null
}

function slotOfStop(s, input) {
  const id = w.slotOfAgent(s, input.agent_id) ?? slotFromTranscript(input.agent_transcript_path, s.planId)
  return id && s.wave.slots[id] ? id : null
}

function slotFacts(cwd, s, id) {
  const slot = s.wave.slots[id]
  const at = git.head(cwd)
  const mainTree =
    at !== s.wave.base
      ? 'the main working tree is on ' + String(at).slice(0, 7) + ', not the wave base ' + String(s.wave.base).slice(0, 7)
      : git.isClean(cwd)
        ? null
        : 'the main working tree has uncommitted changes'
  return {
    commits: git.commitsSince(slot.worktree, slot.head),
    clean: git.isClean(slot.worktree),
    sameBranch: git.branch(slot.worktree) === slot.branch,
    mainTree,
  }
}

const lostText = (s, id) =>
  'tierminator: the run stopped: ' +
  id +
  ' was judged but the run state could not be saved. Done: ' +
  (s.done.map(r.doneLabel).join(', ') || 'none') +
  '. To resume, the user types /tierminator:execute "' +
  s.planFile +
  '". Tell the user, and dispatch nothing more.'

function stubHalt(next, id, notice) {
  return {
    state: { ...next, phase: 'halted', halt: { task: id, tried: next.wave.slots[id].tried, reason: STUB_REASON } },
    notice:
      notice +
      ' The run stops here: ' +
      STUB_REASON +
      '. The finished tasks are on their branches (' +
      next.wave.size.map(x => next.wave.slots[x].branch).join(', ') +
      ') and their worktrees are left in place. Tell the user; dispatch nothing more.',
  }
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

module.exports = {
  modes: { pre },
  ours,
  deny,
  context,
  cwdOf,
  joinNotice,
  discardSlot,
  STUB_REASON,
  slotFromTranscript,
  slotOfStop,
  slotFacts,
  lostText,
  stubHalt,
}
