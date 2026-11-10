// H1: the typed commands, the tiering rules in front of the planner, and a run's next step in front of Claude.
//   (no arg)  UserPromptSubmit. The commands, as typed (the hook sees the raw text, not the skill body):
//             - /tierminator:plan <request> makes the session active and starts planning. Interactively it
//               saves the planning phase and asks Claude to enter plan mode (or, already there, prints the
//               rules); approving the plan then runs it (H3). In a headless session (lib/unattended.js) it
//               starts the drafting phase instead and prints the unattended note and the rules.
//               A headless start it refuses writes a declined result file (lib/result.js) first.
//             - /tierminator:execute [plan path | list number] [--from Txx] runs a saved plan
//               (lib/execute.js).
//               A headless one that does not start writes a complete or declined result file there.
//             Either command first ends whatever the session was doing: a run in progress stops, and
//             Claude is told what is done.
//             Any other prompt does something only in an active session:
//             - a <task-notification> or <agent-message> prompt (the harness, not the user) keeps the run
//               moving: if H4 left a notice (a background worker finished), it is printed, and a report
//               that arrives as an <agent-message> while its attempt is still in flight is judged here, in
//               the turn it arrives (handBack): the worker's report is read from the prompt, or from its
//               transcript, the attempt is settled and its spend recorded, and the notice (the next
//               dispatch, a retry, a halt or completion, or a request to the worker for a missing report) is
//               printed at once. The "finished" notification
//               that follows a hand-back is transcript-only and starts no turn, so no later event is
//               needed, and none is waited for. The worker's SubagentStop (H4) arrives close by, in either
//               order, so the hand-back first claims the attempt (state.claimAttempt): only the hook that
//               claims it judges it. When H4 claimed it first, H1 waits briefly for H4's saved notice and
//               prints that instead. When a judged attempt's state could not be saved (H1's own, or H4's lost-state note),
//               the run ends here with a message saying how to resume. In plan mode these prompts never show the rules;
//               A wave's hand-backs are judged per slot (waveHandBack), through the same settleSlot as the SubagentStop path.
//               A notice is given only once its wave is no longer being integrated: while H4's SubagentStop runs the
//               picks and the plan verify of a closed wave (wave.phase 'integrating'), H1 waits for it
//               (lib/h4-wave.js awaitIntegration) and then gives the whole notice, the next step included.
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
const r = require('./lib/run.js')
const { doneLabel } = r
const { onTurnLimit } = require('./lib/turnlimit.js')
const { executePlan } = require('./lib/execute.js')
const spend = require('./lib/spend.js')
const resultFile = require('./lib/result.js')
const unattended = require('./lib/unattended.js')
const { settle, readReport } = require('./lib/settle.js')
const { subagentsDir } = require('./lib/usage.js')
const h4wave = require('./lib/h4-wave.js')
const w = require('./lib/wave-run.js')
const { run, readInput, emit, emitText } = require('./lib/hook.js')

// Subagent reports and task notifications also arrive as prompts; they are not the user speaking.
const fromHarness = prompt => /^\s*<(agent-message|task-notification)\b/.test(String(prompt ?? ''))

// A worker's report arrived as an <agent-message> while its attempt was in flight (SubagentStop had not
// judged it): judge it now, and give Claude the notice in this same turn. The agent id is remembered in
// `handedBack`, so the SubagentStop that follows does not touch the run (H4 stop); not when the report is missing
// and the worker is asked for it instead, since its next stop is judged. No hand-back is judged while a message to
// the worker is due (resumePending). The attempt is claimed
// first; when H4's SubagentStop claimed it already, H4 judges it and H1 gives H4's notice (awaitNotice).
// When the judged state cannot be saved, the dispatch could not be made (H4 pre would still see the attempt in
// flight), so the run ends with the lost-state note (endLost).
async function handBack(input, s) {
  const key = state.attemptKey(s)
  if (!state.claimAttempt(input.session_id, key)) return awaitNotice(input, key)
  const id = /^\s*<agent-message\s+from="([A-Za-z0-9_-]+)"/.exec(input.prompt)?.[1] ?? null
  const dir = subagentsDir(input.transcript_path)
  const transcript = id && dir ? path.join(dir, `agent-${id}.jsonl`) : null
  const report = readReport(input.prompt, transcript)
  const reported = { ...s, current: { ...s.current, report, agentId: s.current.agentId ?? id } }
  const settledState = settle(reported, s.cwd ?? input.cwd)
  const { next } = spend.recordAttempt({ ...input, agent_id: id }, s, settledState, { transcript, stopReason: report ? 'report' : 'no-report' })
  // A report request to the worker (an ask) leaves the attempt in flight: its next stop is still judged, so the
  // agent is not marked as handed back.
  const asking = next.phase === 'running' && !!next.current?.inFlight && !!next.current?.resumePending
  const saved = {
    ...next,
    notice: null,
    noticeByNotification: false,
    handedBack: asking ? (s.handedBack ?? []) : [...(s.handedBack ?? []), ...(id ? [id] : [])].slice(-20),
  }
  if (!state.write(input.session_id, saved)) return endLost(input, next.phase === 'running' ? r.lostText(next) : next.notice)
  emitText(next.notice)
}

// The run's state could not be saved after an attempt was judged, so the run ends here; /tierminator:execute
// resumes it.
function endLost(input, text) {
  const sessionId = input.session_id
  resultFile.writeEnded(input, state.read(sessionId), resultFile.REASONS.lost)
  emitText(text)
  state.deactivate(sessionId)
  state.remove(sessionId)
}

// Long enough for H4's slowest settle (a reset and a clean, each with its lock retries, lib/git.js), and
// under this hook's 15-second timeout in hooks.json.
const NOTICE_WAIT_MS = 10000
// The waits between reads, the last repeated, so the reader holds the state file open less often while H4
// renames over it.
const NOTICE_POLL_MS = [50, 100, 200, 250]

// H4 claimed the attempt `key` and is judging it. The "finished" notification after a hand-back starts no
// turn, so its notice must still be given in this one: wait a bounded time for H4's saved state to show the
// attempt settled with a notice, then give it and clear it the way runNote does (or, when H4 could not save
// its state, give its lost-state note and end the run). If none comes in time,
// nothing is printed and the state is left as it is: H4's notice stays flagged for the notification, and H5
// lets the turn end.
async function awaitNotice(input, key) {
  const until = Date.now() + NOTICE_WAIT_MS
  for (let i = 0; ; i++) {
    const lost = state.takeLost(input.session_id)
    if (lost) return endLost(input, lost)
    const s = state.read(input.session_id)
    if (s?.notice && (s.phase !== 'running' || state.attemptKey(s) !== key)) {
      state.write(input.session_id, { ...s, notice: null, noticeByNotification: false })
      emitText(s.notice)
      return
    }
    if (Date.now() >= until) return
    await new Promise(resolve => setTimeout(resolve, NOTICE_POLL_MS[Math.min(i, NOTICE_POLL_MS.length - 1)]))
  }
}

// Gives the run's notice and clears it. The notice is read again inside the update, so one H4 appended meanwhile
// (the next step after an integration) is given whole; `fallback` is printed when there is none to read or the
// state could not be updated, since the notice is printed even if clearing fails (a repeat is harmless: the next
// dispatch's pre clears it).
function giveNotice(sessionId, fallback) {
  let text = null
  state.update(sessionId, c => {
    text = c?.notice ?? null
    return c?.notice ? { ...c, notice: null, noticeByNotification: false } : null
  })
  emitText(text ?? fallback)
}

// The wave form of awaitNotice: H4 claimed slot `id`'s attempt `key` in wave `n`; wait for its saved notice.
// H4's notice is saved before it integrates the closed wave (picks, plan verify) and the next step is appended
// after, so a notice is given only once the attempt is settled and wave `n` is not being integrated: when it
// is, H1 waits for the integration once (awaitIntegration), then keeps the 10 s bound for the rest.
async function awaitWaveNotice(input, id, key, n) {
  let until = Date.now() + NOTICE_WAIT_MS
  let waited = false
  for (let i = 0; ; i++) {
    const lost = state.takeLost(input.session_id)
    if (lost) return endLost(input, lost)
    const s = state.read(input.session_id)
    const mine = s?.wave?.n === n
    if (!waited && mine && h4wave.integrating(s)) {
      waited = true
      await h4wave.awaitIntegration(input.session_id, s)
      until = Date.now() + NOTICE_WAIT_MS
      continue
    }
    const slot = s?.wave?.slots?.[id]
    const settled = !s?.wave || !mine || !slot || slot.status !== 'running' || state.slotAttemptKey(s, id) !== key
    if (s?.notice && settled && !(mine && h4wave.integrating(s))) {
      giveNotice(input.session_id, s.notice)
      return
    }
    if (Date.now() >= until) return
    await new Promise(resolve => setTimeout(resolve, NOTICE_POLL_MS[Math.min(i, NOTICE_POLL_MS.length - 1)]))
  }
}

// A worker's report arrived as an <agent-message> in a wave: judge it for its slot, the way H4's stop does.
async function waveHandBack(input, s) {
  const from = /^\s*<agent-message\s+from="([A-Za-z0-9_-]+)"/.exec(input.prompt)?.[1] ?? null
  if (!from) return
  const dir = subagentsDir(input.transcript_path)
  const transcript = dir ? path.join(dir, 'agent-' + from + '.jsonl') : null
  const id = w.slotOfAgent(s, from) ?? (transcript ? h4wave.slotFromTranscript(transcript, s.planId) : null)
  if (!id || !s.wave.slots[id] || !w.judgeable(s, id, from)) return
  const key = state.slotAttemptKey(s, id)
  if (!state.claimAttempt(input.session_id, key)) return awaitWaveNotice(input, id, key, s.wave.n)
  const report = readReport(input.prompt, transcript)
  const text = h4wave.settleSlot(input, s, id, {
    report,
    agentId: from,
    transcript,
    stopReason: report ? 'report' : 'no-report',
    deliver: true,
    handBack: true,
  })
  if (text) return emitText(text)
  const lost = state.takeLost(input.session_id)
  if (lost) endLost(input, lost)
}

// A harness prompt in an active session: deliver H4's notice, or judge a hand-back. While H4 integrates a closed
// wave, its notice so far is partial (the next step comes after the picks and the plan verify), so H1 waits for
// the integration first and gives the whole notice.
async function runNote(input) {
  const lost = state.takeLost(input.session_id)
  if (lost) return endLost(input, lost)
  let s = state.read(input.session_id)
  if (!s) return
  if (h4wave.integrating(s)) {
    s = await h4wave.awaitIntegration(input.session_id, s)
    const late = state.takeLost(input.session_id)
    if (late) return endLost(input, late)
    if (!s) return
  }
  if (s.notice) {
    // Given whether or not it could be cleared: a repeat is harmless, since the next dispatch's pre clears it.
    giveNotice(input.session_id, s.notice)
    return
  }
  if (/^\s*<agent-message\b/.test(input.prompt) && s.phase === 'running' && s.wave) return waveHandBack(input, s)
  if (/^\s*<agent-message\b/.test(input.prompt) && s.phase === 'running' && s.current?.inFlight && !s.current.resumePending) await handBack(input, s)
  else if (/^\s*<task-notification\b/.test(input.prompt) && s.phase === 'running' && (s.current?.inFlight || s.wave)) turnLimitNote(input, s)
}

// The wave form of turnLimitNote: the notification's task id names the slot, by agent id or by transcript.
function waveTurnLimitNote(input, s) {
  const turns = r.turnLimitOf(input.prompt)
  const taskId = r.taskIdOf(input.prompt)
  if (typeof turns !== 'number' || !taskId) return
  const dir = subagentsDir(input.transcript_path)
  const id = w.slotOfAgent(s, taskId) ?? (dir ? h4wave.slotFromTranscript(path.join(dir, 'agent-' + taskId + '.jsonl'), s.planId) : null)
  if (!id) return
  const text = h4wave.turnLimit(input, id, turns, taskId)
  if (text) emitText(text)
}

// A worker's "stopped at its N-turn limit" notification: SubagentStop did not judge it, so resume the worker
// (or halt after too many resumes) in this turn. A notification for another agent is ignored.
function turnLimitNote(input, s) {
  if (s.wave) return waveTurnLimitNote(input, s)
  if (s.current.resumePending) return
  const turns = r.turnLimitOf(input.prompt)
  if (typeof turns !== 'number') return
  const known = s.current.agentId ?? null
  const taskId = r.taskIdOf(input.prompt)
  if (known !== null && taskId !== known) return
  const withId = known === null ? { ...s, current: { ...s.current, agentId: taskId } } : s
  const text = onTurnLimit(input, withId, turns)
  if (text) emitText(text)
}

const PRUNE_DAYS = 7
const rules = () => fs.readFileSync(path.join(__dirname, '..', 'rules', 'tiering.md'), 'utf8')

const COMMAND = /^\s*\/tierminator:(plan|execute)(?![\w-])/

// Ends whatever the session was doing. A run in progress stops: nothing more is dispatched, and a worker
// already running finishes unjudged. Its queued attempt lines and its spend summary are returned for the
// UI, since the run never reaches H5 again (the session is inactive). In every case the session is made
// inactive and its state removed; its plan listing stays, so /tierminator:execute <number> still works.
// Returns {note, spent}, nulls when no run was stopped.
// It writes the result file first (halted, the user typed a prompt during the run), while the session is still active.
function endRun(input) {
  const id = input.session_id
  const s = state.isActive(id) ? state.read(id) : null
  resultFile.writeEnded(input, s, resultFile.REASONS.interrupted)
  let note = null
  let spent = null
  if (s?.phase === 'running') {
    const abandoned = { ...s, phase: 'abandoned', notice: null, spendReported: true, spendLines: [] }
    const summary = s.runId && !s.spendReported ? spend.recordRunEnd(input, abandoned) : null
    spent = [...(s.spendLines ?? []), ...(summary ? [summary] : [])].join('\n') || null
    const finished = new Set(s.done.map(d => d.id))
    const done = s.done.map(doneLabel).join(', ') || 'none'
    const notRun = s.tasks.filter(t => !finished.has(t.id)).map(t => t.id).join(', ') || 'none'
    const ids = s.wave ? s.wave.size.filter(id => s.wave.slots[id].inFlight) : []
    const running = s.wave
      ? ids.length
        ? ' ' + ids.join(', ') + (ids.length === 1 ? "'s worker is" : ' workers are') + ' still running; whatever they commit or leave in their worktrees (under .claude/worktrees) stays unchecked.'
        : ''
      : s.current?.inFlight
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
  // Nothing is active yet, so a refusal is written with allowInactive: the typed command is the activation.
  const declined = reason => resultFile.writeOutcome(input, null, 'declined', reason, { planFile: unattended.planFileFor(input.session_id), allowInactive: true })
  const id = input.session_id
  if (input.permission_mode === 'plan') {
    declined('the session is in plan mode, where a headless session has no ExitPlanMode')
    return 'tierminator: unattended run not started: the session is in plan mode, where a headless session has no ExitPlanMode and the workers could not edit anything. Report this and stop: relaunch without --permission-mode plan (for example with --permission-mode bypassPermissions or acceptEdits).'
  }
  const problem = git.problem(input.cwd)
  if (problem) {
    declined(problem)
    return `tierminator: unattended run not started: ${problem}. It needs a Git repository with a commit, a user name and email, and a clean working tree. Report this and stop; do not do the work yourself.`
  }
  if (!state.activate(id)) {
    declined('its flag file could not be written')
    return 'tierminator: unattended run not started: its flag file could not be written. Report this and stop.'
  }
  const planFile = unattended.planFileFor(id)
  if (!state.write(id, { phase: 'drafting', planFile, denials: 0, guardDenials: 0 })) {
    state.deactivate(id)
    declined('its state could not be saved')
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
    const commandNote = typed[1] === 'plan' ? planNote(input, rest.trim()) : executePlan(input, rest, { record: unattended.headless() })
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
