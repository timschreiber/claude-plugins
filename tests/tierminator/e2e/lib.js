'use strict'

const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

function git(cwd, ...args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  return (r.stdout ?? '').trim()
}

const fwd = p => path.resolve(p).replace(/\\/g, '/')

function defaultBase(n, now = new Date()) {
  const p = x => String(x).padStart(2, '0')
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}` +
    `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return fwd(path.join(os.tmpdir(), 'tierminator-e2e', `s${n}-${stamp}`))
}

function commitsOf(repo) {
  const out = git(repo, 'log', '--reverse', '--format=%s%x1f%b%x1e')
  return out.split('\x1e')
    .map(r => r.replace(/^\n/, ''))
    .filter(r => r.trim() !== '')
    .map(r => {
      const [subject, body = ''] = r.split('\x1f')
      return { subject: subject.trim(), body: body.trim() }
    })
}

function snapshot(repo) {
  const refs = git(repo, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/tierminator/')
  const wts = git(repo, 'worktree', 'list', '--porcelain')
  return {
    commits: commitsOf(repo),
    branches: refs.split('\n').map(s => s.trim()).filter(Boolean),
    worktrees: wts.split('\n')
      .map(l => l.replace(/\r$/, ''))
      .filter(l => l.startsWith('worktree '))
      .map(l => fwd(l.slice('worktree '.length)))
  }
}

module.exports = { git, fwd, defaultBase, commitsOf, snapshot }
