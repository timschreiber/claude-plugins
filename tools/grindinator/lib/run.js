// The Grindinator run command's precondition flow: validates the run name, the repository, the
// configuration, the packages and the working tree, then creates or resumes the run branch and state.
// Then it runs each package that is not done in one headless session (lib/attempt.js). The failure policy: a package that does not complete stops the run (exit 1), unless onFailure is continue, which discards its uncommitted changes and goes on to the next package (exit 1 at the end if any failed).
// A usage limit waits for the reset (lib/limit.js) and relaunches the package by phase; more than maxLimitWaits limits in a row, or a reset over 24 hours away without --wait-weekly, stops with exit 3.
// Every run that reaches its packages ends by writing .grindinator/summary.md (lib/summary.js), also when a GrindinatorError (exit 2) is thrown.
'use strict'

const fs = require('fs')
const path = require('path')
const { EXIT, GrindinatorError } = require('./errors.js')
const { loadStrict } = require('./config.js')
const { discover, loadPreamble, readPackage } = require('./packages.js')
const { sessionPrompt, executePrompt } = require('./session.js')
const limit = require('./limit.js')
const { runAttempt } = require('./attempt.js')
const { renderSummary, writeSummary } = require('./summary.js')
const state = require('./state.js')
const git = require('./git.js')

const RUN_NAME_RULE = 'use letters, digits, ".", "_" and "-", starting with a letter or digit (at most 100 characters)'

function validRunName(name) {
  return typeof name === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name) &&
    !name.includes('..') &&
    !name.endsWith('.') &&
    !name.endsWith('.lock')
}

function defaultRunName(dirAbs, date) {
  const slug = path.basename(dirAbs)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9]+$/, '')
    .slice(0, 60)
  const iso = date.toISOString()
  const stamp = iso.slice(0, 10).replace(/-/g, '') + '-' + iso.slice(11, 19).replace(/:/g, '')
  return `${slug || 'run'}-${stamp}`
}

async function run({ cwd, homeDir, packagesDir, name, flags = {}, out, err, now = () => new Date(), env = process.env, signals = process, clock = limit.realClock }) {
  if (name !== undefined && name !== null && !validRunName(name)) {
    throw new GrindinatorError(`--name: "${name}" is not a valid run name; ${RUN_NAME_RULE}`)
  }

  if (!git.installed()) throw new GrindinatorError('Git is not installed or not on the PATH')
  const root = git.toplevel(cwd)
  if (!root) throw new GrindinatorError(`${cwd} is not inside a Git repository`)

  const config = loadStrict({ projectDir: root, homeDir, flags })

  const abs = path.resolve(cwd, packagesDir)
  const dirAbs = fs.existsSync(abs) ? fs.realpathSync.native(abs) : abs
  const { packages, warnings } = discover(dirAbs)
  for (const w of warnings) err('grindinator: ' + w)
  const rel = path.relative(root, dirAbs)
  const recordedDir = rel.startsWith('..') || path.isAbsolute(rel) ? dirAbs : (rel.split(path.sep).join('/') || '.')

  const preambleText = config.preamble ? loadPreamble(path.resolve(root, config.preamble)) : null

  git.checkRepo(root)
  git.ensureExcluded(root)
  git.checkClean(root)

  let st = state.read(root)
  if (st) {
    if (name && name !== st.runName) {
      throw new GrindinatorError(
        `a run named ${st.runName} is in progress here; finish it, or delete .grindinator/ to start another`
      )
    }
    if (st.packagesDir !== recordedDir) {
      throw new GrindinatorError(
        `the run ${st.runName} uses the packages in ${st.packagesDir}, not ${recordedDir}; finish it, or delete .grindinator/ to start another`
      )
    }
    if (git.currentBranch(root) !== st.branch) {
      if (!git.branchExists(root, st.branch)) {
        throw new GrindinatorError(
          `the run branch ${st.branch} no longer exists; delete .grindinator/ to start a new run`
        )
      }
      git.switchBranch(root, st.branch)
      out(`Switched to ${st.branch}.`)
    }
  } else {
    const runName = name || defaultRunName(dirAbs, now())
    const branch = 'grindinator/' + runName
    if (git.branchExists(root, branch)) {
      throw new GrindinatorError(`the branch ${branch} already exists; pass --name with another run name`)
    }
    const baseCommit = git.head(root)
    git.createBranch(root, branch)
    st = state.create({ runName, branch, packagesDir: recordedDir, baseCommit, now: now() })
  }

  state.ensurePackages(st, packages)
  for (const pkg of packages) {
    if (state.isDone(root, pkg.id)) st.packages[pkg.id].status = 'done'
  }
  state.write(root, st, now())

  const done = packages.filter(p => state.isDone(root, p.id))
  const todo = packages.filter(p => !state.isDone(root, p.id))
  out(`Run ${st.runName} on branch ${st.branch}.`)
  out(`Packages: ${packages.length} (${done.length} done, ${todo.length} to run).`)
  const summarize = (exitCode, stopReason) => {
    try {
      writeSummary(root, renderSummary({ root, st, packages, exitCode, stopReason, now: now() }))
      out('Summary: .grindinator/summary.md')
    } catch (e) {
      err(`grindinator: could not write the summary: ${e.message}`)
    }
  }
  let result
  try {
    result = await runPackages({ root, st, todo, config, preambleText, env, signals, now, out, err, clock })
  } catch (e) {
    summarize(e instanceof GrindinatorError ? e.exitCode : EXIT.FAILED, e.message)
    throw e
  }
  summarize(result.exitCode, result.reason)
  return result.exitCode
}

function resumeText(resume) {
  return `/tierminator:execute ${resume.from ? `--from ${resume.from}` : 'from the first uncommitted task'}`
}

// Runs the packages still to do, one session each; returns the exit code and why the run ended.
async function runPackages({ root, st, todo, config, preambleText, env, signals, now, out, err, clock }) {
  if (todo.length === 0) {
    out('Every package is done.')
    return { exitCode: EXIT.OK, reason: 'every package is done' }
  }
  out(`To run: ${todo.map(p => p.id).join(', ')}.`)
  if (config.gate === null) {
    err('grindinator: no gate is configured, so a package is done once its session completes with new commits; set one with --gate or "gate".')
  }

  const failed = []
  const ac = new AbortController()
  const onSigint = () => ac.abort()
  signals.on('SIGINT', onSigint)
  try {
    for (const pkg of todo) {
      let limits = 0
      for (;;) {
        if (ac.signal.aborted) {
          err(`grindinator: interrupted; the state is saved, and the next run starts at ${pkg.id}.`)
          return { exitCode: EXIT.INTERRUPTED, reason: `interrupted by the user before ${pkg.id}` }
        }
        git.checkClean(root)
        const entry = st.packages[pkg.id]
        const n = entry.attempts.length + 1
        const resume = entry.resume ?? null
        const prompt = resume
          ? executePrompt(resume.planFile, resume.from)
          : sessionPrompt(preambleText, readPackage(pkg))
        out(`${pkg.id}: attempt ${n} started${resume ? ` (${resumeText(resume)})` : ''}; its stream is in .grindinator/runs/${pkg.id}/attempt-${n}/stream.jsonl.`)
        const a = await runAttempt({
          root, st, pkg, prompt, config, env, abortSignal: ac.signal, resume, now
        })
        out(`${pkg.id}: attempt ${a.n} ended: ${a.outcome}${a.haltedAt ? ` at ${a.haltedAt}` : ''}${a.reason ? ` (${a.reason})` : ''}.`)
        if (a.gate && a.gate.status !== 'skipped') {
          out(`${pkg.id}: gate ${a.gate.status}; its output is in .grindinator/${a.dir}/.`)
        }
        if (a.outcome === 'limit') {
          limits++
          const stop = await afterLimit({ root, st, pkg, a, limits, config, clock, abortSignal: ac.signal, now, out, err })
          if (stop) return stop
          continue
        }
        if (a.outcome === 'complete') break
        if (a.outcome === 'interrupted') {
          err(`grindinator: interrupted; the state is saved, and the next run starts at ${pkg.id}.`)
          return { exitCode: EXIT.INTERRUPTED, reason: `interrupted by the user during ${pkg.id}` }
        }
        const what = (a.outcome === 'gate-failed'
          ? `failed its gate (${a.reason})`
          : a.outcome === 'unverified'
            ? `was not verified (${a.reason})`
            : `ended ${a.outcome}`) + (a.haltedAt ? ` at ${a.haltedAt}` : '')
        failed.push(pkg.id)
        if (config.onFailure === 'continue') {
          err(`grindinator: ${pkg.id} ${what}; onFailure is continue, so the run goes on; see .grindinator/${a.dir}/.`)
          const gone = git.discard(root, st.branch)
          if (gone.length) err(`grindinator: discarded uncommitted changes left by ${pkg.id}: ${gone.join(', ')}.`)
          break
        }
        err(`grindinator: ${pkg.id} ${what}, so the run stops; see .grindinator/${a.dir}/.`)
        return { exitCode: EXIT.FAILED, reason: `${pkg.id} ${what}` }
      }
    }
  } finally {
    signals.removeListener('SIGINT', onSigint)
  }
  if (failed.length) {
    return { exitCode: EXIT.FAILED, reason: `${failed.join(', ')} failed; onFailure is continue, so the other packages ran` }
  }
  out('Every package is done.')
  return { exitCode: EXIT.OK, reason: 'every package is done' }
}

// After a limit attempt: discards uncommitted changes at once, so a stop leaves the tree clean, then stops (exit 3) or waits for the reset; returns null to relaunch, else the run's end.
async function afterLimit({ root, st, pkg, a, limits, config, clock, abortSignal, now, out, err }) {
  const gone = git.discard(root, st.branch)
  if (gone.length) err(`grindinator: discarded uncommitted changes left by ${pkg.id}: ${gone.join(', ')}.`)
  const d = limit.decide({ attempt: a, limits, config, nowMs: clock.now() })
  a.wait = d.wait
  state.write(root, st, now())
  if (d.action === 'stop') {
    err(`grindinator: ${pkg.id} ${d.reason}, so the run stops; run it again after the reset.`)
    return { exitCode: EXIT.LIMIT, reason: `${pkg.id} ${d.reason}` }
  }
  out(`${pkg.id}: usage limit; waiting until ${a.wait.wakeAt} (reset ${a.wait.resetsAt ?? 'unknown'}, ${limit.SOURCE_TEXT[a.wait.source]}).`)
  a.wait.startedAt = new Date(clock.now()).toISOString()
  state.write(root, st, now())
  const woke = await limit.sleepUntil(Date.parse(a.wait.wakeAt), { clock, abortSignal })
  a.wait.endedAt = new Date(clock.now()).toISOString()
  a.wait.status = woke
  state.write(root, st, now())
  if (woke === 'interrupted') {
    err(`grindinator: interrupted while waiting for the usage limit; the state is saved, and the next run resumes ${pkg.id}.`)
    return { exitCode: EXIT.INTERRUPTED, reason: `interrupted by the user while ${pkg.id} waited for a usage limit` }
  }
  out(`${pkg.id}: the wait is over; relaunching ${st.packages[pkg.id].resume ? resumeText(st.packages[pkg.id].resume) : 'from planning'}.`)
  return null
}

module.exports = { run, defaultRunName, validRunName, RUN_NAME_RULE }
