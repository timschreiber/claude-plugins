'use strict'

// Builds the fixture for one scenario of Tierminator's parallel end-to-end runbook: a git repo from ./project,
// the scenario's plan, and a scenario.json describing the run.

const fs = require('fs')
const path = require('path')
const lib = require('./lib.js')
const scenarios = require('./scenarios.js')

const USAGE = 'usage: node tests/tierminator/e2e/setup.js <1..8> [base]'

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) copyTree(src, dst)
    else fs.copyFileSync(src, dst)
  }
}

function setup(n, base) {
  const scenario = scenarios.SCENARIOS[n]
  if (!scenario) throw new Error('unknown scenario')
  base = path.resolve(base)
  if (fs.existsSync(base) && (!fs.statSync(base).isDirectory() || fs.readdirSync(base).length > 0)) {
    throw new Error(`${base} already exists and is not an empty directory`)
  }

  const repo = path.join(base, 'repo')
  copyTree(path.join(__dirname, 'project'), repo)
  lib.git(repo, 'init', '-q', '-b', 'main')
  lib.git(repo, 'config', 'user.name', 'Tierminator E2E')
  lib.git(repo, 'config', 'user.email', 'tierminator-e2e@example.invalid')
  lib.git(repo, 'config', 'commit.gpgsign', 'false')
  lib.git(repo, 'config', 'core.autocrlf', 'false')
  lib.git(repo, 'add', '-A')
  lib.git(repo, 'commit', '-q', '-m', 'fixture')

  const marker = lib.fwd(base) + '/marker/s' + n
  const planFile = path.join(base, 'plans', 'plan.md')
  fs.mkdirSync(path.dirname(planFile), { recursive: true })
  fs.writeFileSync(planFile, scenarios.buildPlan(n, { marker }))

  const info = {
    scenario: n,
    title: scenario.title,
    runs: scenario.runs,
    fixBetween: scenario.fixBetween,
    interactive: scenario.interactive,
    permissionMode: scenario.permissionMode,
    marker,
    repo: lib.fwd(repo),
    plan: lib.fwd(planFile)
  }
  fs.writeFileSync(path.join(base, 'scenario.json'), JSON.stringify(info, null, 2))
  return { ...info, base }
}

function main(argv) {
  const n = Number(argv[0])
  if (argv.length < 1 || argv.length > 2 || !Number.isInteger(n) || n < 1 || n > 8) {
    console.error(USAGE)
    process.exit(2)
  }
  const base = argv[1] ? path.resolve(argv[1]) : lib.defaultBase(n)
  setup(n, base)
  console.log(`ready: ${base}`)
}

module.exports = { setup }

if (require.main === module) {
  try {
    main(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
