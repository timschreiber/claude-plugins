'use strict'

// Builds the fixture for Grindinator's end-to-end runbook: a git repo from ./project, a packages directory,
// and for stub-limit a plan file and a stub scenario.

const fs = require('fs')
const path = require('path')
const helpers = require('../helpers.js')

const STEPS = ['stub-limit', 'harness', 'pilot']
const USAGE = 'usage: node tests/grindinator/e2e/setup.js <stub-limit|harness|pilot> <base>'

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) copyTree(src, dst)
    else fs.copyFileSync(src, dst)
  }
}

function setup(step, base) {
  const repo = path.join(base, 'repo')
  const packages = path.join(base, 'packages')
  copyTree(path.join(__dirname, 'project'), repo)
  helpers.git(repo, 'init', '-q', '-b', 'main')
  helpers.git(repo, 'config', 'user.name', 'Grindinator E2E')
  helpers.git(repo, 'config', 'user.email', 'grindinator-e2e@example.invalid')
  helpers.git(repo, 'config', 'commit.gpgsign', 'false')
  helpers.git(repo, 'config', 'core.autocrlf', 'false')
  helpers.git(repo, 'add', '-A')
  helpers.git(repo, 'commit', '-q', '-m', 'fixture')

  fs.mkdirSync(packages, { recursive: true })
  const set = step === 'pilot' ? 'pilot' : 'harness'
  const srcDir = path.join(__dirname, 'packages', set)
  for (const name of fs.readdirSync(srcDir)) {
    if (name.endsWith('.md')) fs.copyFileSync(path.join(srcDir, name), path.join(packages, name))
  }

  let scenario = null
  if (step === 'stub-limit') {
    const planFile = path.join(base, 'plan.md')
    fs.writeFileSync(planFile, '# stub plan\n')
    const resetsAt = Math.floor(Date.now() / 1000) + 60
    const limit = {
      stream: [
        helpers.INIT,
        { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt }, session_id: 'stub-session' },
        { type: 'result', subtype: 'success', is_error: true, api_error_status: 429, result: 'limit', session_id: 'stub-session' }
      ],
      resultFile: helpers.resultRecord({
        outcome: 'limit',
        planFile,
        tasksFile: path.join(base, 'plan.tasks.json'),
        tasksDone: ['T01'],
        tasksNotRun: ['T02'],
        reason: 'a usage limit ended the session',
        limit: { detectedAt: new Date().toISOString(), resetsAt, raw: { error: 'rate_limit' } }
      }),
      commit: true,
      untracked: 'partial.txt',
      exitCode: 1
    }
    scenario = path.join(base, 'scenario.json')
    fs.writeFileSync(scenario, JSON.stringify({ sequence: [limit, helpers.completeScenario()] }, null, 2))
  }
  return { repo, packages, scenario }
}

function main(argv) {
  if (argv.length !== 2 || !STEPS.includes(argv[0])) {
    console.error(USAGE)
    process.exit(2)
  }
  const base = path.resolve(argv[1])
  if (fs.existsSync(base) && (!fs.statSync(base).isDirectory() || fs.readdirSync(base).length > 0)) {
    console.error(`${argv[1]} already exists and is not empty; pass a new directory`)
    process.exit(2)
  }
  setup(argv[0], base)
  console.log(`ready: ${base}`)
}

module.exports = { STEPS, setup }

if (require.main === module) {
  try {
    main(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
