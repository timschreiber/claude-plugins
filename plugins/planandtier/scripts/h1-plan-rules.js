// H1: put the tiering rules in front of the planner, and a run in progress in front of Claude.
//   (no arg)  UserPromptSubmit: in plan mode, print the rules as added context, once per plan-mode stint:
//             on the first prompt the user types there, unless the rules were already shown (on arming in
//             plan mode, or on EnterPlanMode). A <task-notification> or <agent-message> prompt never shows
//             them. A prompt outside plan mode clears the "shown" marker, so the next stint shows them
//             again. Outside plan mode:
//             - if H4 left a notice (a background worker finished, and its report is arriving as a
//               prompt), print it: that is how the run moves on to its next step with nothing typed;
//               this also clears the hand-back marker;
//             - a report that arrives as an <agent-message> before its worker was judged writes the
//               hand-back marker (<session_id>.handback), which makes H5 wait for the judgment and
//               deliver the next step when Claude's turn ends;
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
    state.clearHandback(input.session_id)
    emitText(s.notice)
    return
  }
  if (fromHarness(input.prompt)) {
    // The worker's hand-back often arrives before its SubagentStop, so the attempt is not judged yet.
    // Without a word here, Claude has told the user the run is stuck and to re-run a command. The next
    // step is given by H5 when Claude's turn ends, so ending the turn is all it should do. The hand-back
    // marker tells H5 to wait for the attempt to be judged: the "finished" notification that follows a
    // hand-back is transcript-only and starts no turn, so nothing else would deliver the notice.
    if (/^\s*<agent-message\b/.test(input.prompt) && s.phase === 'running' && s.current?.inFlight) {
      const id = s.tasks[s.current.index].id
      state.markHandback(input.session_id, id)
      emitText(
        `planandtier: ${id}'s report arrived before planandtier checked it. ` +
          'Relay it to the user in one line and end your turn: ' +
          'planandtier gives the next step when your turn ends. ' +
          'Do not dispatch anything or ask the user to act.'
      )
    }
    return
  }
  const where = () => `${s.done.length} of ${s.tasks.length} tasks are done`

  if (s.phase === 'paused') {
    const problem = git.problem(s.cwd ?? input.cwd)
    if (problem) {
      emitText(
        `planandtier: the approved plan is waiting to run: ${problem}. ` +
          'The user must commit or stash those changes first.'
      )
      return
    }
    const started = { ...s, phase: 'running' }
    delete started.pausedBecause
    if (!state.write(input.session_id, started)) return
    emitText(`planandtier: the working tree is clean, so the run starts. ${dispatchText(started)}`)
    return
  }
  if (s.phase === 'running' && !s.current?.inFlight) {
    emitText(
      `planandtier: a run is in progress; ${where()}. To continue: ${dispatchText(s)} ` +
        'To stop: dispatch nothing and tell the user what is done.'
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
      `planandtier: not armed: ${problem}. It needs a Git repository with a commit, a user name and email, ` +
        'and a clean working tree. Tell the user what to fix, then to type /planandtier:arm again.'
    )
    return
  }
  if (!already && !state.arm(id)) {
    emitText('planandtier: arming failed: its flag file could not be written.')
    return
  }
  state.prune(PRUNE_DAYS)
  const note = already
    ? 'planandtier: already armed; nothing changed.'
    : 'planandtier: armed. Plans made in plan mode now run as tiered tasks; /planandtier:disarm turns it off.'
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
    `${note} Call the EnterPlanMode tool now (load it with ToolSearch first if it is deferred), then tell ` +
      'the user in one line that planandtier is armed and ready for them to describe what to plan.'
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
    emitText('planandtier: not armed; nothing changed.')
    return
  }
  if (!inRun) {
    emitText('planandtier: disarmed. Plans are no longer tiered.')
    return
  }
  const finished = new Set(s.done.map(d => d.id))
  const done = s.done.map(doneLabel).join(', ') || 'none'
  const notRun = s.tasks.filter(t => !finished.has(t.id)).map(t => t.id).join(', ') || 'none'
  const running = s.current?.inFlight
    ? ` ${s.tasks[s.current.index].id}'s worker is still running; ` +
      'whatever it commits or leaves in the working tree stays unchecked.'
    : ''
  const note =
    'planandtier: disarmed, which stops the run. ' +
    `Done: ${done}. Not done: ${notRun}.${running} Tell the user, and dispatch nothing more.`
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
