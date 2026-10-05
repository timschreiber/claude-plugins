// The result file: one JSON file written when a run ends, so a caller can read the outcome after the session is
// gone (SessionEnd deletes the session state, never this file). Its path is TIERMINATOR_RESULT_FILE when set, else
// <plan>.result.json beside the plan, else <session id>.result.json beside the session state. It is written only
// for an active session. Every function swallows errors and returns a nothing-happened value, because a hook
// must never fail loudly.
'use strict'

const fs = require('fs')
const path = require('path')
const state = require('./state.js')
const git = require('./git.js')
const { debug } = require('./hook.js')

const VERSION = 1
const FIELDS = [
  'version', 'sessionId', 'outcome', 'planFile', 'tasksFile', 'tasksDone', 'tasksNotRun',
  'haltedAt', 'reason', 'limit', 'headCommit', 'endedAt',
]
const OUTCOMES = ['complete', 'halted', 'limit', 'no-plan', 'declined']

// The errors Windows gives when another process holds the file open (as in state.js).
const RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])

function pathFor(sessionId, planFile) {
  const env = String(process.env.TIERMINATOR_RESULT_FILE ?? '').trim()
  if (env) return path.resolve(env)
  if (typeof planFile === 'string' && planFile) return planFile.replace(/\.md$/i, '') + '.result.json'
  return state.fileFor(sessionId)?.replace(/\.json$/, '.result.json') ?? null
}

// The id of the task the run is on, else null.
const currentId = s => s?.tasks?.[s?.current?.index]?.id ?? null

// The result record, its fields in FIELDS order. `s` is the run state, or null when no run existed.
function record({ sessionId, s = null, outcome, reason = null, haltedAt = null, planFile = null, cwd = null, now = new Date() }) {
  const tasks = Array.isArray(s?.tasks) ? s.tasks : []
  const done = Array.isArray(s?.done) ? s.done.map(d => d.id) : []
  return {
    version: VERSION,
    sessionId: String(sessionId ?? ''),
    outcome,
    planFile: planFile ?? s?.planFile ?? null,
    tasksFile: s?.tasksFile ?? null,
    tasksDone: done,
    tasksNotRun: tasks.map(t => t.id).filter(id => !done.includes(id)),
    haltedAt,
    reason,
    limit: null,
    headCommit: typeof cwd === 'string' && cwd ? git.head(cwd) : null,
    endedAt: now.toISOString(),
  }
}

// Writes atomically (temp file, then rename, retried on the lock errors). Nothing is written for an inactive
// session unless allowInactive (a headless /tierminator:plan refused before it activated). Returns true when written.
function write(sessionId, rec, { allowInactive = false } = {}) {
  let tmp = null
  try {
    if (!allowInactive && !state.isActive(sessionId)) return false
    const file = pathFor(sessionId, rec?.planFile)
    if (!file) return false
    fs.mkdirSync(path.dirname(file), { recursive: true })
    tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(rec, null, 2) + '\n')
    for (let i = 0; ; i++) {
      try {
        fs.renameSync(tmp, file)
        break
      } catch (e) {
        if (!RENAME_RETRY_CODES.has(e?.code) || i >= git.LOCK_RETRY_MS.length) throw e
        git.sleep(git.LOCK_RETRY_MS[i])
      }
    }
    debug(`result ${rec.outcome}: ${path.basename(file)}`)
    return true
  } catch (e) {
    try { if (tmp) fs.rmSync(tmp, { force: true }) } catch {}
    debug(`result: write failed (${e?.code ?? e?.message})`)
    return false
  }
}

const REASONS = {
  interrupted: 'the user typed a prompt during the run',
  lost: `the run's state could not be saved after an attempt was judged`,
  sessionEnded: 'session ended during run',
  abandoned: 'tierminator stopped dispatching tasks: Claude stopped without dispatching the next task, or the guard gave up',
  noPlan: 'planning ended without a valid plan',
}

// What an ended state says: {outcome, reason, haltedAt}, or null when it has not ended. A running state counts
// only when the caller says why it ended (runningReason).
function endOf(s, runningReason) {
  const run = Array.isArray(s?.tasks) && s.tasks.length > 0 && !!s.current
  if (s?.phase === 'complete') return { outcome: 'complete', reason: null, haltedAt: null }
  if (s?.phase === 'halted') {
    return { outcome: 'halted', reason: s.halt?.reason ?? 'the run halted', haltedAt: s.halt?.task ?? currentId(s) }
  }
  if (s?.phase === 'abandoned') {
    return run
      ? { outcome: 'halted', reason: REASONS.abandoned, haltedAt: currentId(s) }
      : { outcome: 'no-plan', reason: REASONS.noPlan, haltedAt: null }
  }
  if (s?.phase === 'running' && runningReason) return { outcome: 'halted', reason: runningReason, haltedAt: currentId(s) }
  return null
}

// Writes the result for `outcome`. `input` is the hook input (session_id, cwd). Returns true when written.
function writeOutcome(input, s, outcome, reason = null, { haltedAt = null, planFile = null, allowInactive = false } = {}) {
  try {
    const sessionId = input?.session_id
    const rec = record({ sessionId, s, outcome, reason, haltedAt, planFile, cwd: s?.cwd ?? input?.cwd })
    return write(sessionId, rec, { allowInactive })
  } catch {
    return false
  }
}

// Writes the result for a state that has ended (see endOf), once: a state whose `resultWritten` is set is skipped.
// The caller marks `resultWritten` in the state it saves. Returns true when written.
function writeEnded(input, s, runningReason = null) {
  try {
    if (!s || s.resultWritten) return false
    const end = endOf(s, runningReason)
    return end ? writeOutcome(input, s, end.outcome, end.reason, { haltedAt: end.haltedAt }) : false
  } catch {
    return false
  }
}

// The first sentence of a tierminator note, without its tierminator: lead, as a result's reason.
const reasonOf = note =>
  String(note ?? '').replace(/^tierminator:\s*/, '').split(/\.\s/)[0].replace(/\.$/, '').slice(0, 300)

module.exports = { VERSION, FIELDS, OUTCOMES, REASONS, pathFor, currentId, record, write, writeOutcome, writeEnded, reasonOf }
