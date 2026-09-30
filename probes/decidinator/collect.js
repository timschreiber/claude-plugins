// Collects the evidence of one Decidinator WP-01 probe cell into probes/evidence/.
//
//   node probes/decidinator/collect.js <cell> <outDir>
//
// Reads the hook records the probe plugin wrote to <outDir>/*.jsonl and writes
// decidinator-probe-<cell>-hooks.jsonl, -agents.json, -transcript.jsonl (when a transcript
// exists) and -run.json. run-headless.js calls collect() itself for the headless cells.
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const EVIDENCE = path.join(__dirname, '..', 'evidence')

function readJsonLines(file) {
  const out = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // skip unparseable lines
    }
  }
  return out
}

function collect(cell, outDir, run) {
  const prefix = path.join(EVIDENCE, 'decidinator-probe-' + cell)
  fs.mkdirSync(EVIDENCE, { recursive: true })

  let records = []
  if (fs.existsSync(outDir)) {
    for (const f of fs.readdirSync(outDir)) {
      if (f.endsWith('.jsonl')) records = records.concat(readJsonLines(path.join(outDir, f)))
    }
  }
  records = records
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const x = String(a.r.at ?? '')
      const y = String(b.r.at ?? '')
      return x < y ? -1 : x > y ? 1 : a.i - b.i
    })
    .map(o => o.r)
  fs.writeFileSync(prefix + '-hooks.jsonl', records.map(r => JSON.stringify(r) + '\n').join(''))

  const agents = []
  for (const rec of records) {
    if (rec.event !== 'SubagentStop') continue
    const input = rec.input || {}
    const models = []
    const tp = input.agent_transcript_path
    if (tp && fs.existsSync(tp)) {
      for (const line of readJsonLines(tp)) {
        const m = line && line.message && line.message.model
        if (m && !models.includes(m)) models.push(m)
      }
    }
    agents.push({
      agent_id: input.agent_id ?? null,
      agent_type: input.agent_type ?? null,
      effort: input.effort ?? null,
      models,
      last_assistant_message: input.last_assistant_message ?? null,
    })
  }
  fs.writeFileSync(prefix + '-agents.json', JSON.stringify(agents, null, 2) + '\n')

  const withTranscript = records.find(
    r => r.input && r.input.transcript_path && fs.existsSync(r.input.transcript_path),
  )
  if (withTranscript) fs.copyFileSync(withTranscript.input.transcript_path, prefix + '-transcript.jsonl')

  const v = spawnSync('claude', ['--version'], { encoding: 'utf8' })
  const version = v.status === 0 && typeof v.stdout === 'string' ? v.stdout.trim() : null
  const runInfo = {
    generated: new Date().toISOString(),
    claudeCodeVersion: version,
    cell,
    ...run,
    records: records.length,
  }
  fs.writeFileSync(prefix + '-run.json', JSON.stringify(runInfo, null, 2) + '\n')

  console.log(`${cell}: ${records.length} hook records, ${agents.length} subagent stops`)
  return records.length
}

module.exports = { collect }

if (require.main === module) {
  if (process.argv.length !== 4) {
    console.error('usage: node probes/decidinator/collect.js <cell> <outDir>')
    process.exit(2)
  }
  const n = collect(process.argv[2], process.argv[3], { interactive: true })
  process.exit(n === 0 ? 1 : 0)
}
