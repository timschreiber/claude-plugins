// Finds which input makes Claude Code reject the planandtier workflow launch with
// "script contains control characters that would be hidden in the approval dialog".
//
//   node probes/planandtier/launch-shapes.js
//
// Each cell copies the probe plugin to a temp dir, sets the copy's execute-plan.js to LF or CRLF,
// and runs one headless session that launches planandtier-probe:execute-plan. The probe's pre-wf
// hook supplies a one-task matrix whose prompt has the cell's shape (PROBE_MATRIX, see probe.js).
// Writes probes/evidence/planandtier-launch-shapes-results.json. stdout and stderr are kept apart.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const CELLS = [
  { cell: 'A', eol: 'lf', matrix: 'shape-single' },
  { cell: 'B', eol: 'crlf', matrix: 'shape-single' },
  { cell: 'C', eol: 'lf', matrix: 'shape-multiline' },
  { cell: 'D', eol: 'lf', matrix: 'shape-emdash' },
]

const PROMPT =
  'Call the Workflow tool with name "planandtier-probe:execute-plan" and no args. Reply with exactly ' +
  'LAUNCHED if the call succeeded, otherwise the full error text.'

const pluginSrc = path.join(__dirname, 'probe-plugin')
const out = path.join(__dirname, '..', 'evidence', 'planandtier-launch-shapes-results.json')
const base = path.join(os.tmpdir(), 'planandtier-launch-shapes')

fs.rmSync(base, { recursive: true, force: true })
const repo = path.join(base, 'repo')
fs.mkdirSync(repo, { recursive: true })
spawnSync('git', ['init', '-q'], { cwd: repo })

const env = { ...process.env }
delete env.PROBE_OBSERVE
delete env.PROBE_DIALOG

const cells = []
for (const c of CELLS) {
  const plugin = path.join(base, c.cell, 'probe-plugin')
  fs.cpSync(pluginSrc, plugin, { recursive: true })
  const script = path.join(plugin, 'workflows', 'execute-plan.js')
  const lf = fs.readFileSync(script, 'utf8').replace(/\r\n/g, '\n')
  fs.writeFileSync(script, c.eol === 'crlf' ? lf.replace(/\n/g, '\r\n') : lf)

  const r = spawnSync('claude', ['-p', PROMPT, '--plugin-dir', plugin, '--output-format', 'json'], {
    cwd: repo,
    env: { ...env, PROBE_MATRIX: c.matrix },
    encoding: 'utf8',
    timeout: 600000,
  })
  const stdout = r.stdout ?? ''
  const stderr = (r.stderr ?? '') + (r.error ? `\n[spawn error] ${r.error.message}` : '')
  const result = {
    ...c,
    exitCode: r.status,
    rejected: /control characters/i.test(stdout + stderr),
    stdout: stdout.slice(0, 4000),
    stderr: stderr.slice(0, 4000),
  }
  cells.push(result)
  console.log(`${c.cell} ${c.eol} ${c.matrix}: exit ${r.status}, rejected ${result.rejected}`)
}

const version = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim() ?? null
fs.writeFileSync(
  out,
  JSON.stringify({ generated: new Date().toISOString(), claudeCodeVersion: version, cells }, null, 2) + '\n'
)
console.log(`wrote ${out}`)
