'use strict'
// Merges every grindinator cell's analysis into grindinator-verification-results.json.

const fs = require('node:fs')
const path = require('node:path')
const lib = require('./lib')

const USAGE = 'usage: node probes/grindinator/summarize.js [--evidence <dir>] [--require <cell,cell,...>]'

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function parseArgs(argv) {
  const opts = { evidence: lib.EVIDENCE, require: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if ((a === '--evidence' || a === '--require') && i + 1 < argv.length) {
      const v = argv[++i]
      if (a === '--evidence') opts.evidence = v
      else opts.require = v.split(',').map(s => s.trim()).filter(Boolean)
    } else {
      return null
    }
  }
  return opts
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!opts) {
    console.error(USAGE)
    return 64
  }
  const dir = opts.evidence
  const re = /^grindinator-(.+)-analysis\.json$/
  const names = (fs.existsSync(dir) ? fs.readdirSync(dir) : [])
    .map(f => (re.exec(f) || [])[1])
    .filter(Boolean)
    .sort()

  const cells = {}
  const versions = []
  const items = {}
  for (let n = 1; n <= 9; n++) items[`V${n}`] = []

  for (const name of names) {
    const analysis = readJson(path.join(dir, `grindinator-${name}-analysis.json`))
    const run = readJson(path.join(dir, `grindinator-${name}-run.json`))
    const cellItems = run && Array.isArray(run.items) ? run.items : null
    cells[name] = {
      items: cellItems,
      exitCode: run ? run.exitCode ?? null : null,
      timedOut: run ? run.timedOut ?? null : null,
      durationMs: run ? run.durationMs ?? null : null,
      analysis,
    }
    if (run && run.claudeCodeVersion && !versions.includes(run.claudeCodeVersion)) versions.push(run.claudeCodeVersion)
    for (const it of cellItems || []) {
      if (items[it] && !items[it].includes(name)) items[it].push(name)
    }
  }

  const out = { generated: new Date().toISOString(), claudeCodeVersions: versions, cells, items }
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'grindinator-verification-results.json'), JSON.stringify(out, null, 2) + '\n')
  console.log(`${names.length} cells`)

  const missing = opts.require.filter(c => !names.includes(c))
  if (missing.length) {
    console.log(`missing: ${missing.join(', ')}`)
    return 1
  }
  return 0
}

process.exitCode = main()
