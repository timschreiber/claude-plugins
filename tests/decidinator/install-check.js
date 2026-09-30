'use strict'

// Checks the WP-02 acceptance criterion that `claude plugin install` from the marketplace succeeds,
// in an isolated CLAUDE_CONFIG_DIR, so the user's own configuration is untouched.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const repoRoot = path.join(__dirname, '..', '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'decidinator-install-'))
const env = { ...process.env, CLAUDE_CONFIG_DIR: tmp }

function run(args) {
  const r = spawnSync('claude', args, {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  console.log(`$ claude ${args.join(' ')}`)
  console.log(r.stdout)
  console.log(r.stderr)
  return r
}

try {
  const a = run(['plugin', 'marketplace', 'add', './'])
  const b = run(['plugin', 'install', 'decidinator@timschreiber'])
  const c = run(['plugin', 'list'])
  if (a.status !== 0 || b.status !== 0 || !String(c.stdout).includes('decidinator@timschreiber')) {
    console.error('install-check: decidinator@timschreiber was not installed from the local marketplace')
    process.exitCode = 1
  } else {
    console.log('install-check: decidinator@timschreiber installed from the local marketplace')
  }
} finally {
  try {
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 })
  } catch {}
}
