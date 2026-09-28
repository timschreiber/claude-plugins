// H1: put the tiering rules in front of the planner, and a run in progress in front of Claude.
//   (no arg)  UserPromptSubmit: in plan mode, print the rules as added context, once per plan-mode stint:
//             on the first prompt the user types there, unless the rules were already shown (on arming in
//             plan mode, or on EnterPlanMode). A <task-notification> or <agent-message> prompt never shows
//             them. A prompt outside plan mode clears the "shown" marker, so the next stint shows them
//             again. Outside plan mode:
//             - if H4 left a notice (a background worker finished, and its report is arriving as a
//               prompt), print it: that is how the run moves on to its next step with nothing typed;
//             - otherwise, for a prompt the user typed while a run is in progress, print where it
//               stands and the next exact dispatch, so "continue" resumes it after an interruption;
//             - a paused run (its tree was dirty at approval) starts here once the tree is clean.
//   enter     PostToolUse EnterPlanMode: the model entered plan mode itself, so add the rules then.
//   compact   PreCompact: the rules are about to fall out of context, so clear the marker; the next plan-mode
//             prompt shows them again. Disarming clears it too.
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
    if (!state.write(input.session_id, { ...s, notice: null, noticeByNotification: false })) return
    emitText(s.notice)
    return
  }
  if (fromHarness(input.prompt)) {
    // The worker's hand-back often arrives before its SubagentStop, so the attempt is not judged yet.
    // Without a word here, Claude has told the user the run is stuck and to re-run a command. The next
    // step comes with the task's "finished" notification, so ending the turn is all it should do.
    if (/^\s*<agent-message\b/.test(input.prompt) && s.phase === 'running' && s.current?.inFlight) {
      emitText(
        `planandtier: this is ${s.tasks[s.current.index].id}'s report, which arrived before planandtier finished ` +
          'checking the task. Nothing is wrong. Tell the user the report in one line, then end your turn: ' +
          "planandtier gives the next step when the task's \"finished\" notification arrives, shortly after. " +
          'Do not dispatch anything, and do not ask the user to re-run or type anything.'
      )
    }
    return
  }
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
  if (input.permission_mode === 'plan') {
    emitText(`${note}\n\n${rules()}`)
    state.markRulesShown(id)
    return
  }
  // Planning happens in plan mode, so arming takes the session there. No hook can set the mode here (only
  // a PermissionRequest hook can), so Claude is asked to; H1's `enter` mode then adds the rules. Never
  // during a run: its workers inherit the mode and could not edit anything in plan mode.
  const s = state.read(id)
  if (s?.phase === 'running' || s?.phase === 'paused') return emitText(note)
  emitText(
    `${note} The session is not in plan mode. Switch to it now: call the EnterPlanMode tool (if it is only ` +
      'listed as a deferred tool, load it with ToolSearch first). Then tell the user, in one line, that ' +
      'planandtier is armed and the session is in plan mode, ready for them to describe what to plan.'
  )
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
  if (process.argv[2] === 'compact') return state.clearRulesShown(input.session_id)
  const enter = process.argv[2] === 'enter'

  const typed = enter ? null : COMMAND.exec(String(input.prompt ?? ''))
  const command = typed?.[1]
  if (command === 'arm') return armNote(input)
  if (command === 'disarm') return disarmNote(input)
  if (command === 'execute-plan') return emitText(executePlan(input, String(input.prompt).slice(typed[0].length)))
  if (!state.isArmed(input.session_id)) return

  if (enter) {
    emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: rules() } })
    state.markRulesShown(input.session_id)
  } else if (input.permission_mode === 'plan') {
    if (fromHarness(input.prompt) || state.rulesShown(input.session_id)) return
    emitText(rules())
    state.markRulesShown(input.session_id)
  } else {
    state.clearRulesShown(input.session_id)
    runNote(input)
  }
})
