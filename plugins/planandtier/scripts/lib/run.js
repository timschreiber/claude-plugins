// The run, as pure functions over the session state: what the next dispatch must be, whether a
// dispatch matches it, how a worker's report is read and judged, and how the run moves on. The hooks
// add the file and Git work around these.
//
// Run state: {phase, tasks, tasksFile, tasksHash, planFile, branch, current, done, ...}
//   phase    running | halted | complete | abandoned
//   current  {index, attempt, tier, tried[], head, inFlight, report, lastFailure, dispatchFailures}
//   done     [{id, tier, commit, attempts}]
'use strict'

const { tierOf, nextTier } = require('./tasks.js')

const MAX_RETRIES = 2
const AGENT_PREFIX = 'planandtier:'
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
})

// The state for a run that has just been approved.
function startRun({ tasks, tasksFile, tasksHash = null, planFile = null, branch = '' }) {
  return {
    phase: 'running',
    tasks,
    tasksFile,
    tasksHash,
    planFile,
    branch,
    current: fresh(tasks[0], 0),
    done: [],
    approvedAt: new Date().toISOString(),
    denials: 0,
    guardDenials: 0,
  }
}

const currentTask = state => state.tasks[state.current.index]

// The dispatch prompt: a pointer to the task, plus the reason for a retry.
function expectedPrompt(state) {
  const { attempt, lastFailure } = state.current
  const lines = [`Tasks file: ${state.tasksFile}`, `Task: ${currentTask(state).id}`]
  if (attempt > 1 && lastFailure) {
    lines.push(
      `Retry: attempt ${attempt} of ${MAX_RETRIES + 1}; the attempt at ${lastFailure.tier} failed and was rolled back.`,
      `Reason: ${lastFailure.reason}`
    )
  }
  return lines.join('\n')
}

function expectedCall(state) {
  const task = currentTask(state)
  return {
    subagent_type: agentName(state.current.tier),
    description: `${task.id}: ${task.title}`,
    run_in_background: false,
    prompt: expectedPrompt(state),
  }
}

// The instruction Claude follows to make the next dispatch.
function dispatchText(state) {
  const call = expectedCall(state)
  return (
    `Call the Agent tool now with subagent_type "${call.subagent_type}", description ` +
    `${JSON.stringify(call.description)}, run_in_background false, and exactly this prompt ` +
    `(${call.prompt.split('\n').length} lines, nothing added):\n${call.prompt}\n` +
    'Do not do the task yourself and do not edit files. After the agent returns, follow the ' +
    'planandtier message that comes back.'
  )
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
  if (!state || state.phase !== 'running') return 'no planandtier run is in progress'
  if (state.current.inFlight) return `${currentTask(state).id} is already running; wait for it to return`
  const want = expectedCall(state)
  if (toolInput?.subagent_type !== want.subagent_type) {
    return `the next task runs on ${want.subagent_type}, not ${toolInput?.subagent_type}`
  }
  if (toolInput?.run_in_background !== false) return 'run_in_background must be false'
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
// {ok: false, reason}, or {ok: false, fatal} when the run must stop without a reset.
function judge({ report, taskId, commits, clean, sameBranch }) {
  if (!sameBranch) return { ok: false, fatal: 'the worker left the branch the run started on' }
  if (!report) return { ok: false, reason: 'the worker returned no STATUS report' }
  if (report.status !== 'DONE') return { ok: false, reason: report.note || 'the worker reported FAILED' }
  if (commits.length !== 1) {
    return { ok: false, reason: `the worker reported DONE but made ${commits.length} commits instead of one` }
  }
  if (!commits[0].message.includes(`Planandtier-Task: ${taskId}`)) {
    return { ok: false, reason: `the worker's commit has no "Planandtier-Task: ${taskId}" trailer` }
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
    }
    return { state: { ...state, current }, action: 'retry' }
  }
  const halt = { task: task.id, tried, reason: outcome.fatal ?? outcome.reason }
  return { state: { ...state, phase: 'halted', halt, current: { ...cur, inFlight: false, tried } }, action: 'halt' }
}

function completeText(state) {
  const list = state.done.map(d => `${d.id} ${d.commit.slice(0, 7)} (${d.tier})`).join(', ')
  return (
    `planandtier: all ${state.tasks.length} tasks are done, each in its own commit: ${list}. ` +
    'Tell the user the run is complete and summarize what changed.'
  )
}

// A halt never resets: the last attempt's changes stay for the user to inspect.
function haltText(state) {
  const { task, tried, reason } = state.halt
  return (
    `planandtier: the run has stopped at ${task}, after ${tried.length} attempt(s) (${tried.join(', ')}). ` +
    `Reason: ${reason}. The last attempt's changes are left in the working tree, and any commit it made ` +
    'is kept. Tell the user which task stopped the run, why, and what is left in the working tree. Do ' +
    'not fix it yourself and do not dispatch more tasks.'
  )
}

module.exports = {
  MAX_RETRIES,
  AGENT_PREFIX,
  agentName,
  startRun,
  currentTask,
  expectedPrompt,
  expectedCall,
  dispatchText,
  checkDispatch,
  parseReport,
  judge,
  advance,
  completeText,
  haltText,
}
