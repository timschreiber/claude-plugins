// Runs one attempt of a package: records it in the state, launches the session, maps the outcome
// and applies it to the package. An attempt is the unit WP-07's scheduler and WP-08's gate build on.
// A complete session counts only when its commits check out and the gate passes or none is configured.
// A limit attempt records its recovery phase, and a limit session that committed every task counts as complete.
'use strict'

const fs = require('fs')
const path = require('path')
const state = require('./state.js')
const { claudeCommand } = require('./claude-bin.js')
const { buildArgs, buildEnv, launch } = require('./session.js')
const { readStreamFile } = require('./stream.js')
const { readResultFile, mapOutcome } = require('./outcome.js')
const git = require('./git.js')
const { runGate } = require('./gate.js')
const limit = require('./limit.js')

function attemptPaths(root, id, n) {
  const dir = path.join(state.stateDir(root), 'runs', id, `attempt-${n}`)
  return {
    rel: `runs/${id}/attempt-${n}`,
    dir,
    streamFile: path.join(dir, 'stream.jsonl'),
    stderrFile: path.join(dir, 'stderr.txt'),
    resultFile: path.join(dir, 'result.json'),
  }
}

function applyOutcome(root, st, id, attempt, now = new Date()) {
  const entry = st.packages[id]
  if (attempt.outcome === 'complete') {
    // complete here means the commits checked out and the gate passed or was skipped.
    state.markDone(root, id, now)
    entry.status = 'done'
    entry.endedAt = now.toISOString()
  } else if (attempt.outcome === 'limit' || attempt.outcome === 'interrupted') {
    entry.status = 'pending'
  } else {
    entry.status = 'failed'
    entry.endedAt = now.toISOString()
  }
  // resume is where the next attempt relaunches after a usage limit.
  if (attempt.outcome === 'limit') {
    entry.resume = attempt.recovery?.phase === 'execute'
      ? { kind: 'execute', planFile: attempt.recovery.planFile, from: attempt.recovery.from }
      : null
  } else if (attempt.outcome === 'interrupted') {
    // More tasks may have been committed; Tierminator skips them itself.
    if (attempt.kind === 'execute' && entry.resume) entry.resume = { ...entry.resume, from: null }
    else entry.resume = null
  } else {
    entry.resume = null
  }
  state.write(root, st, now)
}

// A session that reported complete must have stayed on the run branch, made commits and passed the gate;
// otherwise the outcome is downgraded.
async function checkComplete({ root, st, entry, attempt, config, packageId, dir, env, abortSignal, now }) {
  const short = entry.startCommit ? entry.startCommit.slice(0, 7) : 'unknown'
  const branch = git.currentBranch(root)
  if (branch !== st.branch) {
    attempt.outcome = 'unverified'
    attempt.reason = `the session reported complete but left the run branch ${st.branch} (now on ${branch || 'a detached HEAD'})`
    return
  }
  if (attempt.commits === null) {
    attempt.outcome = 'unverified'
    attempt.reason = `the session reported complete, but HEAD is not a descendant of the package's start commit ${short}`
    return
  }
  if (attempt.commits === 0) {
    attempt.outcome = 'unverified'
    attempt.reason = `the session reported complete, but HEAD has not advanced from the package's start commit ${short}, so it made no commits`
    return
  }
  state.write(root, st, now())
  attempt.gate = await runGate({ root, config, packageId, dir, env, abortSignal })
  attempt.endedAt = now().toISOString()
  if (attempt.gate.status === 'interrupted') {
    attempt.outcome = 'interrupted'
    attempt.reason = attempt.gate.reason
  } else if (attempt.gate.status === 'failed') {
    attempt.outcome = 'gate-failed'
    attempt.reason = attempt.gate.reason
  }
}

async function runAttempt({ root, st, pkg, prompt, config, env = process.env, abortSignal = null, resume = null, now = () => new Date() }) {
  const entry = st.packages[pkg.id]
  const n = entry.attempts.length + 1
  const p = attemptPaths(root, pkg.id, n)
  fs.mkdirSync(p.dir, { recursive: true })
  fs.rmSync(p.resultFile, { force: true })

  const attempt = {
    n,
    kind: resume && resume.kind === 'execute' ? 'execute' : 'plan',
    resume: resume ? { ...resume } : null,
    dir: p.rel,
    startedAt: now().toISOString(),
    endedAt: null,
    sessionId: null,
    exitCode: null,
    signal: null,
    timedOut: false,
    interrupted: false,
    outcome: null,
    reason: null,
    source: null,
    haltedAt: null,
    planFile: null,
    tasksFile: null,
    tasksDone: [],
    tasksNotRun: [],
    limit: null,
    streamResetsAt: null,
    results: 0,
    permissionDenials: 0,
    malformedLines: 0,
    startCommit: git.head(root),
    endCommit: null,
    commits: null,
    sessionOutcome: null,
    gate: null,
    recovery: null,
    wait: null,
  }
  if (attempt.kind === 'plan') entry.startCommit = attempt.startCommit
  entry.attempts.push(attempt)
  entry.status = 'running'
  if (entry.startedAt === null) entry.startedAt = attempt.startedAt
  state.write(root, st, now())

  const { command, args } = claudeCommand(env)
  const r = await launch({
    command,
    args: [...args, ...buildArgs(config, prompt)],
    cwd: root,
    env: buildEnv(env, { root, packageId: pkg.id, resultFile: p.resultFile }),
    streamFile: p.streamFile,
    stderrFile: p.stderrFile,
    capMs: config.maxSessionMinutes * 60000,
    abortSignal,
  })

  const stream = readStreamFile(p.streamFile)
  const result = readResultFile(p.resultFile)
  const m = mapOutcome({ result, stream, run: { ...r, capMinutes: config.maxSessionMinutes }, now: now() })

  Object.assign(attempt, {
    endedAt: now().toISOString(),
    sessionId: stream.sessionId ?? (result.record?.sessionId || null),
    exitCode: r.exitCode,
    signal: r.signal,
    timedOut: r.timedOut,
    interrupted: r.interrupted,
    outcome: m.outcome,
    reason: m.reason,
    source: m.source,
    haltedAt: m.haltedAt,
    planFile: m.planFile,
    tasksFile: m.tasksFile,
    tasksDone: m.tasksDone,
    tasksNotRun: m.tasksNotRun,
    limit: m.limit,
    streamResetsAt: stream.rateLimitResetsAt,
    results: stream.resultCount,
    permissionDenials: stream.permissionDenials.length,
    malformedLines: stream.malformed,
  })

  attempt.sessionOutcome = m.outcome
  attempt.endCommit = git.head(root)
  attempt.commits = git.commitsSince(root, entry.startCommit)
  if (m.outcome === 'limit') {
    attempt.recovery = limit.recoveryPhase({ attempt, plansDir: limit.plansDir(env) })
    if (attempt.recovery.phase === 'complete') {
      attempt.outcome = 'complete'
      attempt.reason = 'a usage limit ended the session after every task was committed'
    }
  }
  if (attempt.outcome === 'complete') {
    await checkComplete({ root, st, entry, attempt, config, packageId: pkg.id, dir: p.dir, env, abortSignal, now })
  }

  applyOutcome(root, st, pkg.id, attempt, now())
  return attempt
}

module.exports = { attemptPaths, applyOutcome, runAttempt }
