// Checks what planandtier's arm command would see before it is built:
//   - the exact prompt text UserPromptSubmit receives when the user types a plugin skill command;
//   - whether the namespaced command (/<plugin>:arm) resolves to the plugin's skill;
//   - whether the skill body reaches the model.
//
//   node probes/planandtier/arm-probe.js
//
// One headless session in a temp directory with probes/planandtier/agent-probe-plugin loaded (observe
// mode), whose `arm` skill tells the model to reply ARM-SKILL-BODY-SEEN. Writes
// probes/evidence/planandtier-arm-probe.log (every hook input) and planandtier-arm-probe-results.json.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const plugin = path.join(__dirname, 'agent-probe-plugin')
const evidence = path.join(__dirname, '..', 'evidence')
const base = path.join(os.tmpdir(), 'planandtier-arm-probe')
const COMMAND = '/planandtier-agent-probe:arm'

fs.rmSync(base, { recursive: true, force: true })
const cwd = path.join(base, 'work')
fs.mkdirSync(cwd, { recursive: true })
const log = path.join(base, 'probe.log')

const r = spawnSync('claude', ['-p', COMMAND, '--plugin-dir', plugin, '--output-format', 'json'], {
  cwd,
  env: { ...process.env, PROBE_LOG: log, PROBE_OBSERVE: '1' },
  encoding: 'utf8',
  timeout: 300000,
})
const stdout = r.stdout ?? ''
const stderr = (r.stderr ?? '') + (r.error ? `\n[spawn error] ${r.error.message}` : '')

const entries = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
if (fs.existsSync(log)) fs.copyFileSync(log, path.join(evidence, 'planandtier-arm-probe.log'))
const prompts = entries
  .filter(e => e.tag === 'ups')
  .map(e => {
    try {
      return JSON.parse(e.stdin).prompt
    } catch {
      return null
    }
  })

let result = null
try {
  result = JSON.parse(stdout).result
} catch {}

const out = {
  generated: new Date().toISOString(),
  claudeCodeVersion: spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null,
  command: COMMAND,
  exitCode: r.status,
  userPromptSubmitPrompts: prompts,
  modelResult: result,
  skillBodyReachedModel: typeof result === 'string' && result.includes('ARM-SKILL-BODY-SEEN'),
  stderr: stderr.slice(0, 2000),
}
fs.writeFileSync(path.join(evidence, 'planandtier-arm-probe-results.json'), JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify(out, null, 2))
