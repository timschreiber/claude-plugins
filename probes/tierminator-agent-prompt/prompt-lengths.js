// tierminator-agent-prompt, part 3: how long real task prompts are. Reads every <plan>.tasks.json in the default
// plans directory (~/.claude/plans, or CLAUDE_CONFIG_DIR/plans) and records the prompt lengths only: counts and
// quantiles, never a prompt's text or a plan's name.
//
//   node probes/tierminator-agent-prompt/prompt-lengths.js
//
// Evidence: probes/evidence/tierminator-prompt-lengths.json.
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')

const EVIDENCE = path.join(__dirname, '..', 'evidence', 'tierminator-prompt-lengths.json')
const dir = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'plans')

const lengths = []
let plans = 0
for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.tasks.json'))) {
  try {
    const tasks = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).tasks
    if (!Array.isArray(tasks)) continue
    plans++
    for (const t of tasks) lengths.push(typeof t?.prompt === 'string' ? t.prompt.length : 0)
  } catch {}
}
lengths.sort((a, b) => a - b)
const q = p => lengths[Math.floor(p * (lengths.length - 1))]
const over = n => lengths.filter(x => x > n).length
const out = {
  probe: 'tierminator-prompt-lengths',
  date: new Date().toISOString(),
  plans,
  prompts: lengths.length,
  median: q(0.5),
  p90: q(0.9),
  p99: q(0.99),
  max: lengths[lengths.length - 1],
  over: { 3000: over(3000), 4000: over(4000), 5000: over(5000), 7000: over(7000), 10000: over(10000) },
}
fs.writeFileSync(EVIDENCE, JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify(out))
