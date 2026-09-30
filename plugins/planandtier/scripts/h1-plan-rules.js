// H1: put the tiering rules in front of the planner, and a run in progress in front of Claude.
//   (no arg)  UserPromptSubmit: in plan mode, print the rules as added context, once per plan-mode stint:
//             on the first prompt the user types there, unless the rules were already shown (on arming in
//             plan mode, or on EnterPlanMode). A <task-notification> or <agent-message> prompt never shows
//             them. A prompt outside plan mode clears the "shown" marker, so the next stint shows them
//             again. Outside plan mode:
//             - if H4 left a notice (a background worker finished, and its report is arriving as a
//               prompt), print it: that is how the run moves on to its next step with nothing typed;
//             - a report that arrives as an <agent-message> while its attempt is still in flight is
//               judged here, in the turn it arrives (handBack): the worker's report is read from the
//               prompt, or from its transcript, the attempt is settled and its spend recorded, and the
//               notice (the next dispatch, a retry, a halt or completion) is printed at once. The
//               "finished" notification that follows a hand-back is transcript-only and starts no
//               turn, so no later event is needed, and none is waited for;
//             - otherwise, for a prompt the user typed while a run is in progress, print where it
//               stands and the next exact dispatch, so "continue" resumes it after an interruption;
//             - a paused run (its tree was dirty at approval) starts here once the tree is clean.
//   enter     PostToolUse EnterPlanMode: the model entered plan mode itself, so add the rules then.
//   compact   PreCompact: the rules are about to fall out of context, so clear the marker; the next plan-mode
//             prompt shows them again. Disarming clears it too.
//   session   SessionStart after a compaction: in an unattended session that is still drafting, re-inject the
//             unattended note and the rules, which the compaction dropped and which no later prompt would
//             bring back in a headless run.
// All of that happens only in an armed session. The one thing H1 does unarmed is handle the typed
// commands: /planandtier:arm and /planandtier:disarm, which set and clear the session's flag, and
// /planandtier:execute-plan, which picks a saved plan up again (lib/execute.js). It also arms an
// unattended session: when PLANANDTIER_UNATTENDED is set, the first prompt of an unarmed session arms it,
// puts it in the drafting phase and prints the unattended note and the rules (lib/unattended.js).
'use strict'

const fs = require('fs')
const path = require('path')
const state = require('./lib/state.js')
const git = require('./lib/git.js')
const { dispatchText, doneLabel, parseReport } = require('./lib/run.js')
const { executePlan } = require('./lib/execute.js')
const spend = require('./lib/spend.js')
const unattended = require('./lib/unattended.js')
const { settle, reportFromTranscript } = require('./lib/settle.js')
const { subagentsDir } = require('./lib/usage.js')
const { run, readInput, emit, emitText } = require('./lib/hook.js')

// Subagent reports and task notifications also arrive as prompts; they are not the user speaking.
const fromHarness = prompt => /^\s*<(agent-message|task-notification)\b/.test(String(prompt ?? ''))

// A worker's report arrived as an <agent-message> while its attempt was in flight (SubagentStop had not
// judged it): judge it now, and give Claude the notice in this same turn. The agent id is remembered in
// `handedBack`, so the SubagentStop that follows does not touch the run (H4 stop).
function handBack(input, s) {
  const id = /^\s*<agent-message\s+from="([A-Za-z0-9_-]+)"/.exec(input.prompt)?.[1] ?? null
  const dir = subagentsDir(input.transcript_path)
  const transcript = id && dir ? path.join(dir, `agent-${id}.jsonl`) : null
  const report = parseReport(input.prompt) ?? (transcript ? reportFromTranscript(transcript) : null)
  const reported = { ...s, current: { ...s.current, report } }
  const settledState = settle(reported, s.cwd ?? input.cwd)
  const { next } = spend.recordAttempt({ ...input, agent_id: id }, s, settledState, { transcript })
  const saved = {
    ...next,
    notice: null,
    noticeByNotification: false,
    handedBack: [...(s.handedBack ?? []), ...(id ? [id] : [])].slice(-20),
  }
  if (!state.write(input.session_id, saved)) return
  emitText(next.notice)
}

function runNote(input) {
  const s = state.read(input.session_id)
  if (!s) return
  if (s.notice) {
    if (!state.write(input.session_id, { ...s, notice: null, noticeByNotification: false })) return
    emitText(s.notice)
    return
  }
  if (fromHarness(input.prompt)) {
    if (/^\s*<agent-message\b/.test(input.prompt) && s.phase === 'running' && s.current?.inFlight) handBack(input, s)
    return
  }
  if (s.phase === 'drafting') {
    emitText(unattended.note(s.planFile))
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

// An unattended session's first prompt: arm it, put it in the drafting phase and give Claude the note and
// the rules. Nothing is armed when the session could not run a plan.
function unattendedStart(input) {
  const id = input.session_id
  if (input.permission_mode === 'plan') {
    emitText(
      'planandtier: PLANANDTIER_UNATTENDED is set, but the session is in plan mode, where a headless session has no ExitPlanMode and the workers could not edit anything. Nothing was armed. Report this and stop: relaunch without --permission-mode plan (for example with --permission-mode bypassPermissions or acceptEdits).'
    )
    return
  }
  const problem = git.problem(input.cwd)
  if (problem) {
    emitText(
      `planandtier: unattended run not started: ${problem}. It needs a Git repository with a commit, a user name and email, and a clean working tree. Report this and stop; do not do the work yourself.`
    )
    return
  }
  if (!state.arm(id)) {
    emitText('planandtier: unattended run not started: its flag file could not be written. Report this and stop.')
    return
  }
  const planFile = unattended.planFileFor(id)
  if (!state.write(id, { phase: 'drafting', planFile, denials: 0, guardDenials: 0 })) {
    state.disarm(id)
    emitText('planandtier: unattended run not started: its state could not be saved. Report this and stop.')
    return
  }
  state.prune(PRUNE_DAYS)
  state.markRulesShown(id)
  emitText(`${unattended.note(planFile)}\n\n${rules()}`)
}

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  if (process.argv[2] === 'compact') return state.clearRulesShown(input.session_id)
  if (process.argv[2] === 'session') {
    const id = input.session_id
    const s = state.isArmed(id) ? state.read(id) : null
    if (s?.phase === 'drafting') {
      emit({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: `${unattended.note(s.planFile)}\n\n${rules()}`,
        },
      })
      state.markRulesShown(id)
    }
    return
  }
  const enter = process.argv[2] === 'enter'

  const typed = enter ? null : COMMAND.exec(String(input.prompt ?? ''))
  const command = typed?.[1]
  if (command === 'arm') return armNote(input)
  if (command === 'disarm') return disarmNote(input)
  if (command === 'execute-plan') return emitText(executePlan(input, String(input.prompt).slice(typed[0].length)))
  if (!enter && unattended.enabled() && !state.isArmed(input.session_id) && !fromHarness(input.prompt)) {
    return unattendedStart(input)
  }
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
