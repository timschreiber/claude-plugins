// The run, as pure functions over the session state: what the next dispatch must be, whether a
// dispatch matches it, how a worker's report is read and judged, and how the run moves on. The hooks
// add the file and Git work around these.
//
// Run state: {phase, tasks, tasksFile, tasksHash, planFile, planId, runId, branch, current, done, notice,
//             spend, spendReported, ...}
//   runId    tells this run's telemetry records from another run of the same plan
//   spend    {costUsd}: the workers' estimated spend so far (lib/spend.js)
//   phase    running | halted | complete | abandoned
//   current  {index, attempt, tier, tried[], head, inFlight, report, lastFailure, dispatchFailures}
//   done     [{id, tier, commit, attempts, skipped?}]; skipped tasks were finished by an earlier run
//   notice   what Claude must be told next, set when an attempt is judged and cleared once shown
'use strict'

const crypto = require('crypto')
const { tierOf, nextTier } = require('./tasks.js')

const MAX_RETRIES = 2
const MAX_RESUMES = 2
const AGENT_PREFIX = 'tierminator:'
const agentName = tier => `${AGENT_PREFIX}${tier}`

const fresh = (task, index) => ({
  index,
  attempt: 1,
  tier: tierOf(task),
  tried: [],
  head: null,
  inFlight: false,
  report: null,
  lastFailure: null,
  dispatchFailures: 0,
  agentId: null,
  resumes: 0,
  resumePending: false,
  turnLimited: null,
})

// The state for a run that has just been approved, or picked up again by /tierminator:execute.
// planId marks every worker commit, so a later /tierminator:execute can tell this plan's finished tasks apart.
// A run picked up part-way starts at `start`, with the tasks before it already in `done` (see
// skippedEntry).
function startRun({ tasks, tasksFile, tasksHash = null, planFile = null, branch = '', planId = null, start = 0, done = [] }) {
  return {
    phase: 'running',
    tasks,
    tasksFile,
    tasksHash,
    planFile,
    planId,
    branch,
    current: fresh(tasks[start], start),
    done,
    runId: crypto.randomBytes(4).toString('hex'),
    approvedAt: new Date().toISOString(),
    denials: 0,
    guardDenials: 0,
  }
}

// The `done` entry for a task an earlier run finished: `commit` is its sha when found on the branch
// ('committed'), or null when the user skipped it with --from ('from').
const skippedEntry = (id, commit, skipped) => ({ id, tier: null, commit, attempts: 0, skipped })

// How a finished task is named in Claude's notes.
function doneLabel(d) {
  if (d.skipped === 'from') return `${d.id} (skipped by --from)`
  if (d.skipped) return `${d.id} ${String(d.commit).slice(0, 7)} (earlier run)`
  return `${d.id} ${String(d.commit).slice(0, 7)} (${d.tier})`
}

const currentTask = state => state.tasks[state.current.index]

// The dispatch prompt: a pointer to the task, plus the reason for a retry.
function expectedPrompt(state) {
  const { attempt, lastFailure } = state.current
  const lines = [`Tasks file: ${state.tasksFile}`]
  if (state.planId) lines.push(`Plan: ${state.planId}`)
  lines.push(`Task: ${currentTask(state).id}`)
  if (attempt > 1 && lastFailure) {
    lines.push(
      `Retry: attempt ${attempt} of ${MAX_RETRIES + 1}; the attempt at ${lastFailure.tier} failed and was rolled back.`,
      `Reason: ${lastFailure.reason}`
    )
  }
  return lines.join('\n')
}

// The Agent call the run expects next. Whether it runs in the foreground is not part of it: in an
// interactive session the Agent tool always runs subagents in the background, with no setting for it
// (tierminator-agent-dispatch-findings.md).
function expectedCall(state) {
  const task = currentTask(state)
  return {
    subagent_type: agentName(state.current.tier),
    description: `${task.id}: ${task.title}`,
    prompt: expectedPrompt(state),
  }
}

// The instruction Claude follows to make the next dispatch.
function dispatchText(state) {
  const call = expectedCall(state)
  return (
    `Call the Agent tool now with subagent_type "${call.subagent_type}", description ` +
    `${JSON.stringify(call.description)}, and as its prompt exactly the ` +
    `${call.prompt.split('\n').length} lines inside this fence, without the fence lines:\n` +
    '```\n' + call.prompt + '\n```\n' +
    'Do not do the task yourself. If it runs in the background, end your turn.'
  )
}

// What Claude is told when its Agent call returns while the task is still running in the background.
function runningText(state) {
  const task = currentTask(state)
  return (
    `tierminator: ${task.id} is running in the background on ${agentName(state.current.tier)}. End your ` +
    'turn now; tierminator gives the next step when it reports.'
  )
}

// What Claude is told after an attempt has been judged and the run moved on. prev is the state the
// attempt ran in, next the state after it, action what advance() returned, outcome what judge() did.
function noticeText(prev, next, action, outcome) {
  const task = currentTask(prev)
  const short = sha => String(sha ?? '').slice(0, 7)
  if (action === 'next') {
    const done = next.done[next.done.length - 1]
    return `tierminator: ${done.id} done (commit ${short(done.commit)}, ${done.tier}). ${dispatchText(next)}`
  }
  if (action === 'retry') {
    return (
      `tierminator: ${task.id} failed at ${prev.current.tier}: ${outcome.reason}. Reset to ` +
      `${short(prev.current.head)}; retrying one tier up. ${dispatchText(next)}`
    )
  }
  if (action === 'complete') return completeText(next)
  return haltText(next)
}

const normalize = text =>
  String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .trim()

// null when the Agent call is the dispatch the run expects, else what is wrong with it.
function checkDispatch(state, toolInput) {
  if (!state || state.phase !== 'running') return 'no tierminator run is in progress'
  if (state.current.inFlight) return `${currentTask(state).id} is already running; wait for it to return`
  const want = expectedCall(state)
  if (toolInput?.subagent_type !== want.subagent_type) {
    return `the next task runs on ${want.subagent_type}, not ${toolInput?.subagent_type}`
  }
  if (normalize(toolInput?.prompt) !== normalize(want.prompt)) return 'the prompt is not the expected one'
  return null
}

// The worker's closing block, read from its final message. null when there is no STATUS line.
function parseReport(text) {
  const s = String(text ?? '')
  const field = name => new RegExp(`^[ \\t>*\`]*${name}:[ \\t]*(.*)$`, 'im').exec(s)?.[1].replace(/`+$/, '').trim()
  const status = field('STATUS')?.toUpperCase().match(/^(DONE|FAILED)\b/)?.[1]
  if (!status) return null
  return { status, commit: field('COMMIT') ?? 'NONE', verify: field('VERIFY') ?? 'NOT RUN', note: field('NOTE') ?? '' }
}

// Judges a finished attempt from its report and the Git facts after it. Returns {ok: true, commit},
// {ok: false, reason}, or {ok: false, fatal} when the run must stop without a reset. With a planId, the
// commit must also carry the plan's line. A DONE report counts only when its VERIFY line says PASS.
function judge({ report, taskId, planId = null, commits, clean, sameBranch }) {
  if (!sameBranch) return { ok: false, fatal: 'the worker left the branch the run started on' }
  if (!report) return { ok: false, reason: 'the worker returned no STATUS report' }
  if (report.status !== 'DONE') return { ok: false, reason: report.note || 'the worker reported FAILED' }
  if (!/^PASS\b/i.test(report.verify)) {
    return { ok: false, reason: `the worker reported DONE but VERIFY was ${report.verify}` }
  }
  if (commits.length !== 1) {
    return { ok: false, reason: `the worker reported DONE but made ${commits.length} commits instead of one` }
  }
  if (!commits[0].message.includes(`Tierminator-Task: ${taskId}`)) {
    return { ok: false, reason: `the worker's commit has no "Tierminator-Task: ${taskId}" trailer` }
  }
  if (planId && !commits[0].message.includes(`Tierminator-Plan: ${planId}`)) {
    return { ok: false, reason: `the worker's commit has no "Tierminator-Plan: ${planId}" line` }
  }
  if (!clean) return { ok: false, reason: 'the worker left uncommitted changes' }
  return { ok: true, commit: commits[0].sha }
}

// Moves the run on after an attempt. Returns {state, action}, action being next | complete | retry |
// halt. For retry the caller resets the tree to current.head before dispatching again.
function advance(state, outcome) {
  const cur = state.current
  const task = currentTask(state)
  const tried = [...cur.tried, cur.tier]

  if (outcome.ok) {
    const done = [...state.done, { id: task.id, tier: cur.tier, commit: outcome.commit, attempts: cur.attempt }]
    const index = cur.index + 1
    if (index >= state.tasks.length) {
      return { state: { ...state, done, phase: 'complete', current: { ...cur, inFlight: false, tried } }, action: 'complete' }
    }
    return { state: { ...state, done, current: fresh(state.tasks[index], index) }, action: 'next' }
  }

  const up = nextTier(cur.tier)
  if (!outcome.fatal && cur.attempt <= MAX_RETRIES && up) {
    const current = {
      ...cur,
      attempt: cur.attempt + 1,
      tier: up,
      tried,
      inFlight: false,
      report: null,
      lastFailure: { tier: cur.tier, reason: outcome.reason },
      agentId: null,
      resumes: 0,
      resumePending: false,
      turnLimited: null,
    }
    return { state: { ...state, current }, action: 'retry' }
  }
  const halt = { task: task.id, tried, reason: outcome.fatal ?? outcome.reason }
  return { state: { ...state, phase: 'halted', halt, current: { ...cur, inFlight: false, tried } }, action: 'halt' }
}

// The turn limit N named in a subagent's "stopped at its N-turn limit" summary, else null.
function turnLimitOf(text) {
  const m = /stopped at its (\d+)-turn limit/.exec(String(text ?? ''))
  return m ? Number(m[1]) : null
}

// The content of the first <task-id> element in a notification, else null.
function taskIdOf(text) {
  const m = /<task-id>([\s\S]*?)<\/task-id>/.exec(String(text ?? ''))
  return m ? m[1].trim() : null
}

const RESUME_MESSAGE =
  "tierminator: you reached your turn limit before reporting. Don't redo finished work. If your task's " +
  'Verify step passed and you committed, end now with your report block. Otherwise finish the remaining ' +
  'work, run Verify, commit only if it passes, and end with your report block.'

// What Claude is told when a worker stopped at its turn limit: resume it with SendMessage.
function resumeText(state) {
  const { agentId, tier, resumes } = state.current
  const id = currentTask(state).id
  const to = agentId ?? "the worker's task-id from the notification"
  return (
    `tierminator: ${id} stopped at its turn limit on ${agentName(tier)} (resume ${resumes + 1} of ${MAX_RESUMES}). ` +
    `Call the SendMessage tool now with to "${to}", summary "${id}: resume after the turn limit", and as its ` +
    'message exactly the text inside this fence, without the fence lines:\n' +
    '```\n' + RESUME_MESSAGE + '\n```\n' +
    'Do not do the task yourself. Then end your turn; tierminator gives the next step when the worker reports.'
  )
}

// A worker stopped at its turn limit with the task in flight. Resumes it while resumes are left, else
// halts. It never retries or resets: a turn limit is not a tier failure, since a higher tier uses more turns.
function turnLimitStop(state, turns) {
  const cur = state.current
  if (cur.resumes < MAX_RESUMES) {
    return { state: { ...state, current: { ...cur, resumePending: true, turnLimited: { turns } } }, action: 'resume' }
  }
  return advance(state, {
    ok: false,
    fatal:
      `${currentTask(state).id} reached its turn limit ${cur.resumes + 1} times (${turns} turns at the last ` +
      'stop); it is probably too large for one task: split it and run /tierminator:execute again',
  })
}

// null when the SendMessage call is the resume the run expects, else what is wrong with it.
function checkResume(state, toolInput) {
  if (!state || state.phase !== 'running') return 'no tierminator run is in progress'
  if (!state.current.inFlight || !state.current.resumePending) return 'no resume is due'
  const { agentId } = state.current
  if (agentId && toolInput?.to !== agentId) return `the resume goes to ${agentId}, not ${toolInput?.to}`
  if (normalize(toolInput?.message) !== normalize(RESUME_MESSAGE)) return 'the message is not the expected one'
  return null
}

// The state once the resume has been sent.
const resumed = state => ({
  ...state,
  current: { ...state.current, resumePending: false, resumes: state.current.resumes + 1 },
})

function completeText(state) {
  const list = state.done.map(doneLabel).join(', ')
  return (
    `tierminator: all ${state.tasks.length} tasks are done: ${list}. ` +
    (state.done.some(d => d.skipped) ? '"earlier run" and "skipped" tasks were not run this time. ' : '') +
    'Tell the user the run is complete and summarize what changed.'
  )
}

// A halt never resets: the last attempt's changes stay for the user to inspect.
function haltText(state) {
  const { task, tried, reason } = state.halt
  return (
    `tierminator: the run stopped at ${task} after ${tried.length} attempt(s) (${tried.join(', ')}). ` +
    `Reason: ${reason}. The last attempt's changes and any commit it made are left in place. Tell the ` +
    'user what stopped the run and what is left; do not fix it or dispatch more tasks.'
  )
}

// What Claude is told when an attempt was judged but the run's state could not be saved, so every later hook
// would still see the attempt in flight: the run cannot go on. `state` is the settled state (phase 'running').
function lostText(state) {
  const done = state.done.map(doneLabel).join(', ') || 'none'
  const resume = state.planFile ? `/tierminator:execute "${state.planFile}"` : '/tierminator:execute with the plan\'s path'
  return (
    `tierminator: the run stopped: ${currentTask(state).id} was not dispatched because the run's state could not be saved. ` +
    `Done: ${done}. To resume, the user types ${resume}; tasks already committed are skipped. ` +
    'Tell the user, and dispatch nothing more.'
  )
}

module.exports = {
  MAX_RETRIES,
  MAX_RESUMES,
  AGENT_PREFIX,
  agentName,
  startRun,
  skippedEntry,
  doneLabel,
  currentTask,
  expectedPrompt,
  expectedCall,
  dispatchText,
  runningText,
  noticeText,
  checkDispatch,
  parseReport,
  judge,
  advance,
  turnLimitOf,
  taskIdOf,
  RESUME_MESSAGE,
  resumeText,
  turnLimitStop,
  checkResume,
  resumed,
  completeText,
  haltText,
  lostText,
}
