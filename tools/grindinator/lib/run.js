// The Grindinator run command's precondition flow: validates the run name, the repository, the
// configuration, the packages and the working tree, then creates or resumes the run branch and state.
// It stops there; launching sessions comes later (WP-07). Failures are GrindinatorErrors (exit 2).
'use strict'

const fs = require('fs')
const path = require('path')
const { GrindinatorError } = require('./errors.js')
const { loadStrict } = require('./config.js')
const { discover, loadPreamble } = require('./packages.js')
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

async function run({ cwd, homeDir, packagesDir, name, flags = {}, out, err, now = () => new Date() }) {
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

  if (config.preamble) loadPreamble(path.resolve(root, config.preamble))

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
  if (todo.length > 0) {
    out(`To run: ${todo.map(p => p.id).join(', ')}.`)
    out('Launching sessions is not built yet (WP-07); stopped after the precondition checks.')
  } else {
    out('Every package is done.')
  }
  return 0
}

module.exports = { run, defaultRunName, validRunName, RUN_NAME_RULE }
