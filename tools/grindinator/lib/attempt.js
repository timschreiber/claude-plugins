// Runs one attempt of a package: records it in the state, launches the session, maps the outcome
// and applies it to the package. An attempt is the unit WP-07's scheduler and WP-08's gate build on.
'use strict'

const fs = require('fs')
const path = require('path')
const state = require('./state.js')
const { claudeCommand } = require('./claude-bin.js')
const { buildArgs, buildEnv, launch } = require('./session.js')
const { readStreamFile } = require('./stream.js')
const { readResultFile, mapOutcome } = require('./outcome.js')

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
    // WP-08 will put the gate before the marker.
    state.markDone(root, id, now)
    entry.status = 'done'
    entry.endedAt = now.toISOString()
  } else if (attempt.outcome === 'limit' || attempt.outcome === 'interrupted') {
    entry.status = 'pending'
  } else {
    entry.status = 'failed'
    entry.endedAt = now.toISOString()
  }
  state.write(root, st, now)
}

async function runAttempt({ root, st, pkg, prompt, config, env = process.env, abortSignal = null, now = () => new Date() }) {
  const entry = st.packages[pkg.id]
  const n = entry.attempts.length + 1
  const p = attemptPaths(root, pkg.id, n)
  fs.mkdirSync(p.dir, { recursive: true })
  fs.rmSync(p.resultFile, { force: true })

  const attempt = {
    n,
    kind: 'plan',
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
  }
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

  applyOutcome(root, st, pkg.id, attempt, now())
  return attempt
}

module.exports = { attemptPaths, applyOutcome, runAttempt }
