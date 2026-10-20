// Worktree maker probe for tierminator parallel execution (option C). Registered as a PreToolUse hook on
// the Agent tool. With PROBE_MK_WT=1 it reads the Worktree: and Task: lines of the call's prompt and runs
// `git worktree add -b probe/<task> <Worktree> $PROBE_BASE` in the call's cwd before the worker starts, which is
// what tierminator's H4 `pre` would do for a slot. It logs pid, start and end times and git's status, and it
// never prints anything, so it changes no tool input and decides no permission.
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const logFile = process.env.PROBE_LOG || path.join(os.tmpdir(), 'tierminator-parallel-probe', 'probe.log')

function readStdin() {
  return new Promise(resolve => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(data))
  })
}

function log(entry) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true })
    fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n')
  } catch {}
}

async function main() {
  if (process.env.PROBE_MK_WT !== '1') return
  const raw = await readStdin()
  let input = {}
  try {
    input = JSON.parse(raw)
  } catch {
    return
  }
  const prompt = input.tool_input && typeof input.tool_input.prompt === 'string' ? input.tool_input.prompt : ''
  const wt = /^Worktree:\s*(.+?)\s*$/m.exec(prompt)
  const task = /^Task:\s*(\S+)/m.exec(prompt)
  if (!wt || !task || !process.env.PROBE_BASE) return log({ tag: 'mkwt:skipped', hasWorktree: Boolean(wt), hasTask: Boolean(task) })

  const startedAt = new Date().toISOString()
  const r = spawnSync('git', ['worktree', 'add', '-q', '-b', 'probe/' + task[1].toLowerCase(), wt[1], process.env.PROBE_BASE], {
    cwd: input.cwd,
    encoding: 'utf8',
  })
  log({
    tag: 'mkwt',
    pid: process.pid,
    task: task[1],
    worktree: wt[1],
    status: r.status,
    stderr: (r.stderr ?? '').slice(0, 800),
    startedAt,
    endedAt: new Date().toISOString(),
  })
}

main().catch(() => {}).finally(() => {
  process.exitCode = 0
})
