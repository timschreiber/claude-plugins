// Grindinator's status and reset commands: a table of each package's state, and clearing one
// package's done marker so the next run repeats it. Problems the user must fix are GrindinatorErrors.
'use strict'

const path = require('path')
const { GrindinatorError } = require('./errors.js')
const { discover } = require('./packages.js')
const state = require('./state.js')
const git = require('./git.js')

// Pads every column but the last to its widest cell and joins the cells with two spaces.
function formatTable(rows) {
  const widths = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      if (i < row.length - 1) widths[i] = Math.max(widths[i] ?? 0, cell.length)
    })
  }
  return rows.map(row =>
    row.map((cell, i) => (i < row.length - 1 ? cell.padEnd(widths[i]) : cell)).join('  ').trimEnd()
  )
}

function findRoot(cwd) {
  if (!git.installed()) throw new GrindinatorError('Git is not installed or not on the PATH')
  const root = git.toplevel(cwd)
  if (!root) throw new GrindinatorError(`${cwd} is not inside a Git repository`)
  return root
}

async function status({ cwd, packagesDir, out }) {
  const root = findRoot(cwd)
  const st = state.read(root)
  let dir
  if (packagesDir) dir = path.resolve(cwd, packagesDir)
  else if (st) dir = path.resolve(root, st.packagesDir)
  else {
    out('No Grindinator run here yet; start one with: grindinator run <packages dir>')
    return 0
  }
  if (st) out(`Run ${st.runName} on branch ${st.branch}.`)
  const { packages } = discover(dir)
  const rows = [['PACKAGE', 'STATE', 'ATTEMPTS', 'TITLE']]
  for (const { id, title } of packages) {
    rows.push([id, state.statusOf(root, st, id), String(st?.packages?.[id]?.attempts?.length ?? 0), title])
  }
  for (const line of formatTable(rows)) out(line)
  return 0
}

async function reset({ cwd, id, out }) {
  state.assertId(id)
  const root = findRoot(cwd)
  const existed = state.clearDone(root, id)
  const st = state.read(root)
  if (st?.packages?.[id]?.status === 'done') {
    st.packages[id].status = 'pending'
    state.write(root, st)
  }
  out(existed
    ? `Cleared the done marker for ${id}; the next run repeats it.`
    : `${id} has no done marker; nothing to clear.`)
  return 0
}

module.exports = { formatTable, findRoot, status, reset }
