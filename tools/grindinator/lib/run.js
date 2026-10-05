// The Grindinator run command's precondition flow: validates the run name, the repository, the
// configuration, the packages and the working tree, then creates or resumes the run branch and state.
// Then it runs each package that is not done in one headless session (lib/attempt.js), stopping at the first that does not complete. Failures are GrindinatorErrors (exit 2).
'use strict'

const fs = require('fs')
const path = require('path')
const { EXIT, GrindinatorError } = require('./errors.js')
const { loadStrict } = require('./config.js')
const { discover, loadPreamble, readPackage } = require('./packages.js')
const { sessionPrompt } = require('./session.js')
const { runAttempt } = require('./attempt.js')
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

async function run({ cwd, homeDir, packagesDir, name, flags = {}, out, err, now = () => new Date(), env = process.env, signals = process }) {
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
  if (todo.length === 0) {
    out('Every package is done.')
    return EXIT.OK
  }
  out(`To run: ${todo.map(p => p.id).join(', ')}.`)

  const ac = new AbortController()
  const onSigint = () => ac.abort()
  signals.on('SIGINT', onSigint)
  try {
    for (const pkg of todo) {
      if (ac.signal.aborted) {
        err(`grindinator: interrupted; the state is saved, and the next run starts at ${pkg.id}.`)
        return EXIT.INTERRUPTED
      }
      git.checkClean(root)
      const n = st.packages[pkg.id].attempts.length + 1
      out(`${pkg.id}: attempt ${n} started; its stream is in .grindinator/runs/${pkg.id}/attempt-${n}/stream.jsonl.`)
      const a = await runAttempt({
        root, st, pkg, prompt: sessionPrompt(preambleText, readPackage(pkg)), config, env, abortSignal: ac.signal, now
      })
      out(`${pkg.id}: attempt ${a.n} ended: ${a.outcome}${a.haltedAt ? ` at ${a.haltedAt}` : ''}${a.reason ? ` (${a.reason})` : ''}.`)
      if (a.outcome === 'complete') continue
      if (a.outcome === 'interrupted') {
        err(`grindinator: interrupted; the state is saved, and the next run starts at ${pkg.id}.`)
        return EXIT.INTERRUPTED
      }
      if (a.outcome === 'limit') {
        err(`grindinator: ${pkg.id} hit a usage limit; waiting for the reset is not built yet (WP-09), so the run stops. Run it again after the reset.`)
        return EXIT.LIMIT
      }
      err(`grindinator: ${pkg.id} ended ${a.outcome}, so the run stops; see .grindinator/${a.dir}/.`)
      return EXIT.FAILED
    }
  } finally {
    signals.removeListener('SIGINT', onSigint)
  }
  out('Every package is done.')
  return EXIT.OK
}

module.exports = { run, defaultRunName, validRunName, RUN_NAME_RULE }
