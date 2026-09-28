// H1: put the tiering rules in front of the planner, and a run in progress in front of Claude.
//   (no arg)  UserPromptSubmit: in plan mode, print the rules as added context. Outside plan mode:
//             - if H4 left a notice (a background worker finished, and its report is arriving as a
//               prompt), print it: that is how the run moves on to its next step with nothing typed;
//             - otherwise, for a prompt the user typed while a run is in progress, print where it
//               stands and the next exact dispatch, so "continue" resumes it after an interruption;
//             - a paused run (its tree was dirty at approval) starts here once the tree is clean.
//   enter     PostToolUse EnterPlanMode: the model entered plan mode itself, so add the rules then.
// All of that happens only in an armed session. The one thing H1 does unarmed is handle the typed
// commands: /planandtier:arm and /planandtier:disarm, which set and clear the session's flag, and
// /planandtier:execute-plan, which picks a saved plan up again (lib/execute.js).
'use strict'

const fs = require('fs')
const path = require('path')
const state = require('./lib/state.js')
const git = require('./lib/git.js')
const { dispatchText, doneLabel } = require('./lib/run.js')
const { executePlan } = require('./lib/execute.js')
const spend = require('./lib/spend.js')
const { run, readInput, emit, emitText } = require('./lib/hook.js')

// Subagent reports and task notifications also arrive as prompts; they are not the user speaking.
const fromHarness = prompt => /^\s*<(agent-message|task-notification)\b/.test(String(prompt ?? ''))

function runNote(input) {
  const s = state.read(input.session_id)
  if (!s) return
  if (s.notice) {
    if (!state.write(input.session_id, { ...s, notice: null })) return
    emitText(s.notice)
    return
  }
  if (fromHarness(input.prompt)) return
  const where = () => `${s.done.length} of ${s.tasks.length} tasks are done.`

  if (s.phase === 'paused') {
    const problem = git.problem(s.cwd ?? input.cwd)
    if (problem) {
      emitText(
        `planandtier: the approved plan is still waiting to run, because ${problem}. If the user wants it to ` +
          'run, they need to commit or stash those changes first.'
      )
      return
    }
    const started = { ...s, phase: 'running' }
    delete started.pausedBecause
    if (!state.write(input.session_id, started)) return
    emitText(`planandtier: the working tree is clean now, so the approved plan's run starts. ${dispatchText(started)}`)
    return
  }
  if (s.phase === 'running' && !s.current?.inFlight) {
    emitText(
      `planandtier: a run of the approved plan is in progress. ${where()} If the user wants it to continue, ` +
        `${dispatchText(s)} If they want to stop it, do not dispatch anything and tell them what is done.`
    )
  }
}

const PRUNE_DAYS = 7
const rules = () => fs.readFileSync(path.join(__dirname, '..', 'rules', 'tiering.md'), 'utf8')

// /planandtier:arm and /planandtier:disarm, as typed (the hook sees the raw text, not the skill body).
// The skills themselves only tell Claude to report the note printed here.
const COMMAND = /^\s*\/planandtier:(arm|disarm|execute-plan)(?![\w-])/

// Arming checks the repository the way H2 does at approval, so a session that could never run a plan
// is not armed at all. H2 and H3 still check again: the tree can change after arming.
function armNote(input) {
  const id = input.session_id
  const already = state.isArmed(id)
  const problem = already ? null : git.problem(input.cwd)
  if (problem) {
    emitText(
      `planandtier: not armed, because ${problem}. planandtier commits each task and resets a failed ` +
        'attempt to the commit before it, so it needs Git, a repository with a commit, a user name and email ' +
        'to commit with, and a clean working tree. Tell the user what to fix, and that they can then type ' +
        '/planandtier:arm again.'
    )
    return
  }
  if (!already && !state.arm(id)) {
    emitText('planandtier: arming failed, because its flag file could not be written, so it stays off for this session.')
    return
  }
  state.prune(PRUNE_DAYS)
  const note = already
    ? 'planandtier: already armed for this session; nothing changed.'
    : 'planandtier: armed for this session. A plan made in plan mode is now split into tiered tasks, and ' +
      'approving it runs each task in its own subagent at its model and effort. /planandtier:disarm turns it off.'
  emitText(input.permission_mode === 'plan' ? `${note}\n\n${rules()}` : note)
}

// Disarming stops a run: nothing more is dispatched, and a worker already running finishes unjudged.
function disarmNote(input) {
  const id = input.session_id
  const armed = state.isArmed(id)
  state.disarm(id)
  const s = state.read(id)
  const inRun = s && (s.phase === 'running' || s.phase === 'paused')
  const abandoned = inRun ? { ...s, phase: 'abandoned', notice: null, spendReported: true, spendLines: [] } : null
  if (inRun) state.write(id, abandoned)
  else state.remove(id)
  // A run stopped here never reaches H5 again (the session is unarmed), so its queued attempt lines and
  // its spend summary are shown now.
  const summary = inRun && s.runId && !s.spendReported ? spend.recordRunEnd(input, abandoned) : null
  const spent = inRun ? [...(s.spendLines ?? []), ...(summary ? [summary] : [])].join('\n') || null : null

  if (!armed) {
    emitText('planandtier: was not armed for this session; nothing changed.')
    return
  }
  if (!inRun) {
    emitText('planandtier: disarmed for this session. Plans are no longer tiered, and nothing is dispatched.')
    return
  }
  const finished = new Set(s.done.map(d => d.id))
  const done = s.done.map(doneLabel).join(', ') || 'none'
  const notRun = s.tasks.filter(t => !finished.has(t.id)).map(t => t.id).join(', ') || 'none'
  const running = s.current?.inFlight
    ? ` ${s.tasks[s.current.index].id}'s worker is still running; planandtier will not check it or roll it back, so whatever ` +
      'it commits or leaves in the working tree stays.'
    : ''
  const note =
    'planandtier: disarmed for this session, which stops the run of the approved plan. ' +
    `Done and committed: ${done}. Not done: ${notRun}.${running} Tell the user what is done and what is not. ` +
    'Do not dispatch more tasks.'
  if (!spent) return emitText(note)
  emit({ systemMessage: spent, hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: note } })
}

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  const enter = process.argv[2] === 'enter'

  const typed = enter ? null : COMMAND.exec(String(input.prompt ?? ''))
  const command = typed?.[1]
  if (command === 'arm') return armNote(input)
  if (command === 'disarm') return disarmNote(input)
  if (command === 'execute-plan') return emitText(executePlan(input, String(input.prompt).slice(typed[0].length)))
  if (!state.isArmed(input.session_id)) return

  if (enter) {
    emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: rules() } })
  } else if (input.permission_mode === 'plan') {
    emitText(rules())
  } else {
    runNote(input)
  }
})
