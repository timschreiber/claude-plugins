'use strict'

// Command line for the end-to-end scenarios: load the files and hook records of one finished run,
// print each check of its scenario, and write the run's fixtures (logs and result.json).

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { SCENARIOS } = require('./scenarios.js')
const { checkScenario, evidence } = require('./checks.js')

const USAGE = 'usage: node tests/decidinator/e2e/check.js <scenario> <base> [--fixtures <dir>]'

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function readRecords(outDir) {
  let records = []
  let files = []
  try {
    files = fs.readdirSync(outDir).filter((f) => f.endsWith('.jsonl')).sort()
  } catch {
    return []
  }
  for (const f of files) {
    for (const line of readText(path.join(outDir, f)).split('\n')) {
      if (!line.trim()) continue
      try {
        records.push(JSON.parse(line))
      } catch {
        // skip unparseable lines
      }
    }
  }
  return records
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const x = String(a.r && a.r.at)
      const y = String(b.r && b.r.at)
      return x < y ? -1 : x > y ? 1 : a.i - b.i
    })
    .map((o) => o.r)
}

function collectStrings(value, out) {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out)
  else if (value !== null && typeof value === 'object') for (const v of Object.values(value)) collectStrings(v, out)
}

function readTranscript(records) {
  const withTranscript = records.find((r) => {
    const i = r && r.input
    return i !== null && typeof i === 'object' && typeof i.transcript_path === 'string' && !i.agent_id && fs.existsSync(i.transcript_path)
  })
  if (!withTranscript) return { transcriptStrings: [], finalMessage: '' }
  const transcriptStrings = []
  let finalMessage = ''
  for (const line of readText(withTranscript.input.transcript_path).split('\n')) {
    if (!line.trim()) continue
    let obj
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    collectStrings(obj, transcriptStrings)
    if (obj && obj.type === 'assistant' && obj.message && Array.isArray(obj.message.content)) {
      const texts = obj.message.content
        .filter((c) => c && c.type === 'text' && typeof c.text === 'string' && c.text.trim() !== '')
        .map((c) => c.text)
      if (texts.length > 0) finalMessage = texts.join('\n')
    }
  }
  return { transcriptStrings, finalMessage }
}

function load(n, base) {
  const outDir = n === '7' ? path.join(base, 'out-import') : path.join(base, 'out')
  const records = readRecords(outDir)
  const { transcriptStrings, finalMessage } = readTranscript(records)
  return {
    records,
    transcriptStrings,
    finalMessage,
    logText: readText(path.join(base, 'repo', 'docs', 'decisions.md')),
    sidecarText: readText(path.join(base, 'repo', 'docs', 'open-questions.md')),
    exportedText: readText(path.join(base, 'stakeholders-exported.md')),
    answeredText: readText(path.join(base, 'stakeholders-answered.md'))
  }
}

function claudeVersion() {
  try {
    const v = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' })
    return v.status === 0 && typeof v.stdout === 'string' ? v.stdout.trim() : null
  } catch {
    return null
  }
}

function writeFixtures(n, base, dir, result, inputs) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  const copies = [
    [path.join(base, 'repo', 'docs', 'decisions.md'), 'decisions.md'],
    [path.join(base, 'repo', 'docs', 'open-questions.md'), 'open-questions.md']
  ]
  if (n === '7') {
    copies.push([path.join(base, 'stakeholders-exported.md'), 'stakeholders-exported.md'])
    copies.push([path.join(base, 'stakeholders-answered.md'), 'stakeholders-answered.md'])
  }
  for (const [from, name] of copies) {
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, name))
  }
  const obj = {
    generated: new Date().toISOString(),
    scenario: n,
    name: result.name,
    claudeCodeVersion: claudeVersion(),
    pass: result.pass,
    checks: result.checks,
    evidence: evidence(n, inputs)
  }
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(obj, null, 2) + '\n')
}

function usage() {
  console.error(USAGE)
  process.exit(2)
}

function main(argv) {
  const args = argv.slice()
  let fixtures = null
  const i = args.indexOf('--fixtures')
  if (i !== -1) {
    if (i !== args.length - 2) usage()
    fixtures = args[i + 1]
    args.splice(i, 2)
  }
  if (args.length !== 2 || !Object.hasOwn(SCENARIOS, args[0])) usage()
  const n = args[0]
  const base = path.resolve(args[1])
  const inputs = load(n, base)
  const result = checkScenario(n, inputs)
  for (const c of result.checks) {
    console.log(c.pass ? 'ok   ' + c.name : 'FAIL ' + c.name + ': ' + c.detail)
  }
  const dir = fixtures ? path.resolve(fixtures) : path.join(__dirname, 'fixtures', 'scenario-' + n)
  writeFixtures(n, base, dir, result, inputs)
  console.log('fixtures: ' + dir)
  console.log((result.pass ? 'PASS' : 'FAIL') + ': scenario ' + n + ' (' + result.name + ')')
  process.exit(result.pass ? 0 : 1)
}

module.exports = { load }

if (require.main === module) {
  try {
    main(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
