// H1: the typed commands, the tiering rules in front of the planner, and a run's next step in front of Claude.
//   (no arg)  UserPromptSubmit. The commands, as typed (the hook sees the raw text, not the skill body):
//             - /tierminator:plan <request> makes the session active and starts planning. Interactively it
//               saves the planning phase and asks Claude to enter plan mode (or, already there, prints the
//               rules); approving the plan then runs it (H3). In a headless session (lib/unattended.js) it
//               starts the drafting phase instead and prints the unattended note and the rules.
//             - /tierminator:execute [plan path | list number] [--from Txx] runs a saved plan
//               (lib/execute.js).
//             Either command first ends whatever the session was doing: a run in progress stops, and
//             Claude is told what is done.
//             Any other prompt does something only in an active session:
//             - a <task-notification> or <agent-message> prompt (the harness, not the user) keeps the run
//               moving: if H4 left a notice (a background worker finished), it is printed, and a report
//               that arrives as an <agent-message> while its attempt is still in flight is judged here, in
//               the turn it arrives (handBack): the worker's report is read from the prompt, or from its
//               transcript, the attempt is settled and its spend recorded, and the notice (the next
//               dispatch, a retry, a halt or completion) is printed at once. The "finished" notification
//               that follows a hand-back is transcript-only and starts no turn, so no later event is
//               needed, and none is waited for. In plan mode these prompts never show the rules;
//             - while planning, a prompt typed in plan mode shows the rules once per plan-mode stint
//               (unless /tierminator:plan or EnterPlanMode already did); one typed outside plan mode means
//               the user left plan mode without approving, so the session is made inactive, silently;
//             - while drafting (headless), the unattended note is printed again;
//             - during a run, a typed prompt stops it: nothing more is dispatched, Claude is told what is
//               done and that /tierminator:execute resumes it, and the session is made inactive;
//             - after a run has ended (or with no state), the session is made inactive, silently.
//   enter     PostToolUse EnterPlanMode: Claude entered plan mode after /tierminator:plan, so add the rules.
//   compact   PreCompact: the rules are about to fall out of context, so clear the marker; the next plan-mode
//             prompt shows them again. Deactivation clears it too.
//   session   SessionStart after a compaction: in an unattended session that is still drafting, re-inject the
//             unattended note and the rules, which the compaction dropped and which no later prompt would
//             bring back in a headless run.
'use strict'

const fs = require('fs')
const path = require('path')
const state = require('./lib/state.js')
const git = require('./lib/git.js')
const { doneLabel, parseReport } = require('./lib/run.js')
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

// A harness prompt in an active session: deliver H4's notice, or judge a hand-back.
function runNote(input) {
  const s = state.read(input.session_id)
  if (!s) return
  if (s.notice) {
    if (!state.write(input.session_id, { ...s, notice: null, noticeByNotification: false })) return
    emitText(s.notice)
    return
  }
  if (/^\s*<agent-message\b/.test(input.prompt) && s.phase === 'running' && s.current?.inFlight) handBack(input, s)
}

const PRUNE_DAYS = 7
const rules = () => fs.readFileSync(path.join(__dirname, '..', 'rules', 'tiering.md'), 'utf8')

const COMMAND = /^\s*\/tierminator:(plan|execute)(?![\w-])/

// Ends whatever the session was doing. A run in progress stops: nothing more is dispatched, and a worker
// already running finishes unjudged. Its queued attempt lines and its spend summary are returned for the
// UI, since the run never reaches H5 again (the session is inactive). In every case the session is made
// inactive and its state removed; its plan listing stays, so /tierminator:execute <number> still works.
// Returns {note, spent}, nulls when no run was stopped.
function endRun(input) {
  const id = input.session_id
  const s = state.isActive(id) ? state.read(id) : null
  let note = null
  let spent = null
  if (s?.phase === 'running') {
    const abandoned = { ...s, phase: 'abandoned', notice: null, spendReported: true, spendLines: [] }
    const summary = s.runId && !s.spendReported ? spend.recordRunEnd(input, abandoned) : null
    spent = [...(s.spendLines ?? []), ...(summary ? [summary] : [])].join('\n') || null
    const finished = new Set(s.done.map(d => d.id))
    const done = s.done.map(doneLabel).join(', ') || 'none'
    const notRun = s.tasks.filter(t => !finished.has(t.id)).map(t => t.id).join(', ') || 'none'
    const running = s.current?.inFlight
      ? ` ${s.tasks[s.current.index].id}'s worker is still running; ` +
        'whatever it commits or leaves in the working tree stays unchecked.'
      : ''
    note =
      'tierminator: the run stopped because the user typed a new prompt. ' +
      `Done: ${done}. Not done: ${notRun}.${running} To resume, the user types ` +
      `/tierminator:execute "${s.planFile}". Tell the user, and dispatch nothing more.`
  }
  state.deactivate(id)
  state.remove(id)
  return { note, spent }
}

// A headless session's /tierminator:plan: make it active, put it in the drafting phase and give Claude the
// note and the rules. Nothing starts when the session could not run a plan.
function headlessStart(input) {
  const id = input.session_id
  if (input.permission_mode === 'plan') {
    return 'tierminator: unattended run not started: the session is in plan mode, where a headless session has no ExitPlanMode and the workers could not edit anything. Report this and stop: relaunch without --permission-mode plan (for example with --permission-mode bypassPermissions or acceptEdits).'
  }
  const problem = git.problem(input.cwd)
  if (problem) {
    return `tierminator: unattended run not started: ${problem}. It needs a Git repository with a commit, a user name and email, and a clean working tree. Report this and stop; do not do the work yourself.`
  }
  if (!state.activate(id)) {
    return 'tierminator: unattended run not started: its flag file could not be written. Report this and stop.'
  }
  const planFile = unattended.planFileFor(id)
  if (!state.write(id, { phase: 'drafting', planFile, denials: 0, guardDenials: 0 })) {
    state.deactivate(id)
    return 'tierminator: unattended run not started: its state could not be saved. Report this and stop.'
  }
  state.prune(PRUNE_DAYS)
  state.markRulesShown(id)
  return `${unattended.note(planFile)}\n\n${rules()}`
}

// /tierminator:plan <request>. Starting checks the repository the way H2 does at approval, so planning
// that could never run is not started. H2 and H3 still check again: the tree can change while planning.
function planNote(input, request) {
  const id = input.session_id
  if (!request) {
    return 'tierminator: planning was not started: /tierminator:plan needs a request, for example /tierminator:plan add a --verbose flag. Tell the user.'
  }
  if (unattended.headless()) return headlessStart(input)
  const problem = git.problem(input.cwd)
  if (problem) {
    return (
      `tierminator: planning was not started: ${problem}. It needs a Git repository with a commit, a user name ` +
      'and email, and a clean working tree. Tell the user what to fix, then to type /tierminator:plan again.'
    )
  }
  if (!state.activate(id)) return 'tierminator: planning was not started: its flag file could not be written. Tell the user.'
  if (!state.write(id, { phase: 'planning', tasks: [], denials: 0, guardDenials: 0 })) {
    state.deactivate(id)
    return 'tierminator: planning was not started: its state could not be saved. Tell the user.'
  }
  state.prune(PRUNE_DAYS)
  const note =
    'tierminator: planning started. Plan the request in plan mode; when the user approves the plan, ' +
    'tierminator runs it as tiered tasks.'
  if (input.permission_mode === 'plan') {
    state.markRulesShown(id)
    return `${note}\n\n${rules()}`
  }
  // No hook can set the mode here (only a PermissionRequest hook can), so Claude is asked to; H1's `enter`
  // mode then adds the rules.
  return `${note} Call the EnterPlanMode tool now (load it with ToolSearch first if it is deferred), then plan the request.`
}

// Prints `note` as added context, with `spent` for the UI when there is any.
function say(note, spent) {
  if (!note) return
  if (!spent) return emitText(note)
  emit({ systemMessage: spent, hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: note } })
}

run(async () => {
  const input = await readInput()
  if (!input || input.agent_id) return
  const id = input.session_id
  if (process.argv[2] === 'compact') return state.clearRulesShown(id)
  if (process.argv[2] === 'session') {
    const s = state.isActive(id) ? state.read(id) : null
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
  if (process.argv[2] === 'enter') {
    if (!state.isActive(id) || state.read(id)?.phase !== 'planning') return
    emit({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: rules() } })
    state.markRulesShown(id)
    return
  }

  const prompt = String(input.prompt ?? '')
  const typed = COMMAND.exec(prompt)
  if (typed) {
    const stopped = endRun(input)
    const rest = prompt.slice(typed[0].length)
    const commandNote = typed[1] === 'plan' ? planNote(input, rest.trim()) : executePlan(input, rest)
    return say([stopped.note, commandNote].filter(Boolean).join('\n\n'), stopped.spent)
  }

  if (!state.isActive(id)) return
  const s = state.read(id)
  if (fromHarness(prompt)) {
    if (input.permission_mode === 'plan') return
    state.clearRulesShown(id)
    return runNote(input)
  }
  if (s?.phase === 'planning') {
    if (input.permission_mode !== 'plan') {
      // The user left plan mode without approving the plan: tierminator is no longer involved.
      state.deactivate(id)
      state.remove(id)
      return
    }
    if (state.rulesShown(id)) return
    emitText(rules())
    state.markRulesShown(id)
    return
  }
  if (s?.phase === 'drafting') {
    state.clearRulesShown(id)
    return emitText(unattended.note(s.planFile))
  }
  const stopped = endRun(input)
  say(stopped.note, stopped.spent)
})
