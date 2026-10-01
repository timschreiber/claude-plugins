'use strict'

// Command line for the end-to-end scenarios: build a fixture repo, print a scenario's prompt, or fill
// in the answers of an exported stakeholder file.

const path = require('path')
const { SCENARIOS, prompt } = require('./scenarios.js')
const { setupRepo, fillAnswers } = require('./fixture.js')

const USAGE = 'usage: node tests/decidinator/e2e/setup.js repo <scenario> <repoDir> | prompt <scenario> | fill <base>'

function usage() {
  console.error(USAGE)
  process.exit(2)
}

function main(argv) {
  const [cmd, a, b] = argv
  if (cmd === 'repo' && argv.length === 3 && Object.hasOwn(SCENARIOS, a)) {
    const dir = path.resolve(b)
    setupRepo(a, dir)
    console.log('repo ready: ' + dir)
  } else if (cmd === 'prompt' && argv.length === 2) {
    const p = prompt(a)
    if (p === null) usage()
    console.log(p)
  } else if (cmd === 'fill' && argv.length === 2) {
    console.log('answers filled: ' + fillAnswers(path.resolve(a)))
  } else {
    usage()
  }
}

try {
  main(process.argv.slice(2))
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
